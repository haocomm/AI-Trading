import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  AIProviderInterface,
  AIProviderRequest,
  AIProviderResponse,
  ProviderMetrics,
  AIProviderConfig,
  AIProviderError
} from '@/types/ai.types';
import { tradingLogger, logError } from '@/utils/logger';

export abstract class BaseAIProvider implements AIProviderInterface {
  protected config: AIProviderConfig;
  protected metrics: ProviderMetrics;
  protected requestQueue: Map<string, Promise<AIProviderResponse>> = new Map();

  constructor(config: AIProviderConfig) {
    this.config = config;
    // Initialize metrics with placeholder provider name, will be set by subclasses
    this.metrics = {
      provider: '',
      model: config.defaultModel,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      averageConfidence: 0,
      accuracy: 0,
      totalCost: 0,
      uptime: Date.now(),
      lastUsed: 0,
      errors: []
    };
  }

  abstract get name(): string;

  abstract generateResponse(request: AIProviderRequest): Promise<AIProviderResponse>;

  abstract getModels(): string[];

  abstract validateApiCall(requestData: any): boolean;

  abstract parseResponse(response: any): AIProviderResponse;

  public async isHealthy(): Promise<boolean> {
    try {
      const testRequest: AIProviderRequest = {
        prompt: "Health check - respond with 'OK'",
        maxTokens: 10,
        temperature: 0
      };

      const response = await this.generateResponse(testRequest);
      return response.content.toLowerCase().includes('ok');
    } catch (error) {
      this.recordError(error instanceof Error ? error : new Error('Health check failed'));
      return false;
    }
  }

  public getMetrics(): ProviderMetrics {
    return { ...this.metrics };
  }

  public validateConfig(): boolean {
    return !!(
      this.config.apiKey &&
      this.config.baseUrl &&
      this.config.models.length > 0 &&
      this.config.defaultModel &&
      this.config.models.includes(this.config.defaultModel)
    );
  }

  protected async makeApiRequest(
    endpoint: string,
    data: any,
    config?: Partial<AxiosRequestConfig>
  ): Promise<AxiosResponse> {
    const startTime = Date.now();

    try {
      // Check rate limiting
      await this.checkRateLimit();

      const requestConfig: AxiosRequestConfig = {
        timeout: this.config.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...config?.headers
        },
        ...config
      };

      // Validate request data
      if (!this.validateApiCall(data)) {
        throw new AIProviderError(
          'Invalid request data',
          this.name,
          'INVALID_REQUEST',
          false
        );
      }

      const response = await axios.post(endpoint, data, requestConfig);

      // Update metrics
      this.updateMetrics(Date.now() - startTime, true);

      return response;
    } catch (error: any) {
      this.updateMetrics(Date.now() - startTime, false);
      this.recordError(error);

      if (error.response) {
        // API returned error response
        throw new AIProviderError(
          `API Error: ${error.response.data?.error?.message || error.response.statusText}`,
          this.name,
          error.response.status?.toString() || 'API_ERROR',
          this.isRecoverableError(error.response.status)
        );
      } else if (error.request) {
        // Network error
        throw new AIProviderError(
          'Network error - no response received',
          this.name,
          'NETWORK_ERROR',
          true
        );
      } else {
        // Other error
        throw new AIProviderError(
          error.message || 'Unknown API error',
          this.name,
          'UNKNOWN_ERROR',
          false
        );
      }
    }
  }

  protected createResponse(
    content: string,
    model: string,
    usage?: any,
    startTime?: number
  ): AIProviderResponse {
    const responseTime = startTime ? Date.now() - startTime : 0;
    const cost = this.calculateCost(usage);

    return {
      content,
      model,
      provider: this.name,
      usage: usage ? {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0
      } : undefined,
      cost,
      responseTime,
      timestamp: Date.now()
    };
  }

  protected calculateCost(usage?: any): number {
    if (!usage) return 0;

    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;

    return (
      (promptTokens * this.config.pricing.inputTokenCost) +
      (completionTokens * this.config.pricing.outputTokenCost)
    );
  }

  protected async checkRateLimit(): Promise<void> {
    // Simple rate limiting implementation
    // In production, use a more sophisticated rate limiter like token bucket
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const requestsInWindow = this.metrics.errors.filter(
      e => now - e.timestamp < windowMs
    ).length;

    if (requestsInWindow >= this.config.rateLimit.requestsPerMinute) {
      throw new AIProviderError(
        'Rate limit exceeded',
        this.name,
        'RATE_LIMIT',
        true
      );
    }
  }

  protected setProviderName(name: string): void {
    this.metrics.provider = name;
  }

  private updateMetrics(responseTime: number, success: boolean): void {
    this.metrics.totalRequests++;
    this.metrics.lastUsed = Date.now();

    if (success) {
      this.metrics.successfulRequests++;

      // Update average response time
      const totalTime = this.metrics.averageResponseTime * (this.metrics.successfulRequests - 1) + responseTime;
      this.metrics.averageResponseTime = totalTime / this.metrics.successfulRequests;
    } else {
      this.metrics.failedRequests++;
    }
  }

  private recordError(error: any): void {
    const errorRecord = {
      timestamp: Date.now(),
      error: error.message || 'Unknown error',
      recoverable: this.isRecoverableError(error.code)
    };

    this.metrics.errors.push(errorRecord);

    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors = this.metrics.errors.slice(-100);
    }
  }

  private isRecoverableError(statusCode?: number | string): boolean {
    const recoverableCodes = [429, 500, 502, 503, 504, 'NETWORK_ERROR', 'TIMEOUT'];
    return recoverableCodes.includes(statusCode as any);
  }

  protected deduplicateRequest(requestKey: string, requestFn: () => Promise<AIProviderResponse>): Promise<AIProviderResponse> {
    // Check if request is already in progress
    const existingRequest = this.requestQueue.get(requestKey);
    if (existingRequest) {
      return existingRequest;
    }

    // Create new request
    const promise = requestFn().finally(() => {
      // Remove from queue when done
      this.requestQueue.delete(requestKey);
    });

    this.requestQueue.set(requestKey, promise);
    return promise;
  }

  protected generateRequestKey(request: AIProviderRequest): string {
    return `${this.name}-${request.prompt.substring(0, 50)}-${request.temperature || 0}-${request.maxTokens || 0}`;
  }
}