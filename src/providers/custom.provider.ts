import { BaseAIProvider } from './base.provider';
import {
  AIProviderRequest,
  AIProviderResponse,
  AIProviderConfig,
  AIProviderError
} from '@/types/ai.types';
import { tradingLogger } from '@/utils/logger';

export class CustomProvider extends BaseAIProvider {
  private customModelEndpoints: Map<string, string> = new Map();

  constructor(config: AIProviderConfig) {
    super(config);
    this.initializeEndpoints();
  }

  get name(): string {
    return 'Custom';
  }

  async generateResponse(request: AIProviderRequest): Promise<AIProviderResponse> {
    const requestKey = this.generateRequestKey(request);

    return this.deduplicateRequest(requestKey, async () => {
      const startTime = Date.now();

      tradingLogger.apiCall('Custom', 'generateResponse', true, 0);

      try {
        const requestData = this.buildRequestData(request);
        const endpoint = this.getEndpointForModel(request.model || this.config.defaultModel);

        if (!endpoint) {
          throw new AIProviderError(
            `No endpoint configured for model: ${request.model || this.config.defaultModel}`,
            this.name,
            'NO_ENDPOINT',
            false
          );
        }

        const response = await this.makeApiRequest(endpoint, requestData);
        return this.parseResponse(response.data);
      } catch (error) {
        tradingLogger.apiCall('Custom', 'generateResponse', false, Date.now() - startTime);
        throw error;
      }
    });
  }

  getModels(): string[] {
    return [
      'llama-3.1-405b',
      'llama-3.1-70b',
      'llama-3.1-8b',
      'mixtral-8x7b',
      'codellama-34b',
      'mistral-7b',
      ...this.config.models
    ];
  }

  validateApiCall(requestData: any): boolean {
    // Basic validation for custom model requests
    // Can be extended based on specific model requirements
    return !!(
      requestData &&
      (requestData.messages || requestData.prompt || requestData.input)
    );
  }

  parseResponse(response: any): AIProviderResponse {
    try {
      let content: string = '';
      let model: string = '';
      let usage: any;

      // Handle different response formats from various custom models
      if (response.choices && response.choices[0]) {
        // OpenAI-compatible format
        content = response.choices[0].message?.content || response.choices[0].text || '';
        model = response.model || 'custom-model';
        usage = response.usage;
      } else if (response.content) {
        // Direct content format
        content = response.content;
        model = response.model || 'custom-model';
        usage = response.usage;
      } else if (response.output) {
        // Alternative format
        content = response.output;
        model = response.model || 'custom-model';
        usage = response.usage;
      } else if (response.text) {
        // Simple text format
        content = response.text;
        model = response.model || 'custom-model';
        usage = response.usage;
      } else {
        // Fallback: try to extract any text content
        content = JSON.stringify(response);
        model = 'custom-model-unknown';
        tradingLogger.apiCall('Custom', 'parseResponse', false, 0);
      }

      if (!content) {
        throw new AIProviderError(
          'No content found in custom model response',
          this.name,
          'NO_CONTENT',
          false
        );
      }

      return this.createResponse(content, model, usage);
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }
      throw new AIProviderError(
        `Failed to parse custom model response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'PARSE_ERROR',
        false
      );
    }
  }

  // Custom model specific methods
  async generateLlamaResponse(
    request: AIProviderRequest,
    systemPrompt?: string
  ): Promise<AIProviderResponse> {
    const llamaRequest = {
      ...request,
      metadata: {
        ...request.metadata,
        modelType: 'llama',
        systemPrompt
      }
    };

    return this.generateResponse(llamaRequest);
  }

  async generateMixtralResponse(
    request: AIProviderRequest,
    expertMode: boolean = false
  ): Promise<AIProviderResponse> {
    const mixtralRequest = {
      ...request,
      temperature: expertMode ? 0.1 : (request.temperature ?? this.config.temperature),
      metadata: {
        ...request.metadata,
        modelType: 'mixtral',
        expertMode
      }
    };

    return this.generateResponse(mixtralRequest);
  }

  async generateCodeAnalysisResponse(
    code: string,
    question: string
  ): Promise<AIProviderResponse> {
    const prompt = `Analyze the following trading-related code:

\`\`\`
${code}
\`\`\`

Question: ${question}

Please provide:
1. Code analysis and explanation
2. Potential issues or improvements
3. Trading logic validation
4. Risk assessment of the implementation
5. Optimization suggestions

Focus on trading-specific aspects like risk management, position sizing, and market data handling.`;

    return this.generateResponse({
      prompt,
      temperature: 0.2,
      maxTokens: 2048,
      metadata: {
        type: 'code_analysis',
        codeLength: code.length,
        question
      }
    });
  }

  async generateQuantitativeAnalysis(
    data: any[],
    analysisType: 'regression' | 'correlation' | 'volatility' | 'backtest'
  ): Promise<AIProviderResponse> {
    const prompt = `Perform quantitative ${analysisType} analysis on the following data:

Data: ${JSON.stringify(data.slice(0, 1000))} // Limiting to first 1000 items for brevity

Data shape: ${data.length} records, ${data[0] ? Object.keys(data[0]).length : 0} fields

Please provide:
1. Detailed ${analysisType} analysis
2. Statistical significance tests
3. Key findings and insights
4. Trading implications
5. Confidence intervals
6. Recommendations based on results

Use appropriate statistical methods and explain your assumptions.`;

    return this.generateResponse({
      prompt,
      temperature: 0.1,
      maxTokens: 3000,
      metadata: {
        type: 'quantitative_analysis',
        analysisType,
        dataSize: data.length
      }
    });
  }

  async generateFineTunedResponse(
    request: AIProviderRequest,
    fineTunedModel: string
  ): Promise<AIProviderResponse> {
    const endpoint = this.getEndpointForModel(fineTunedModel);

    if (!endpoint) {
      throw new AIProviderError(
        `No endpoint configured for fine-tuned model: ${fineTunedModel}`,
        this.name,
        'NO_FINE_TUNED_ENDPOINT',
        false
      );
    }

    const fineTunedRequest = {
      ...request,
      model: fineTunedModel,
      metadata: {
        ...request.metadata,
        fineTuned: true,
        baseModel: this.config.defaultModel
      }
    };

    return this.generateResponse(fineTunedRequest);
  }

  // Model management methods
  addModelEndpoint(model: string, endpoint: string): void {
    this.customModelEndpoints.set(model, endpoint);
    tradingLogger.apiCall('Custom', 'addModelEndpoint', true, 0, `Model: ${model}, Endpoint: ${endpoint}`);
  }

  removeModelEndpoint(model: string): void {
    this.customModelEndpoints.delete(model);
    tradingLogger.apiCall('Custom', 'removeModelEndpoint', true, 0, `Model: ${model}`);
  }

  private initializeEndpoints(): void {
    // Initialize common endpoints for popular custom models
    this.customModelEndpoints.set('llama-3.1-405b', `${this.config.baseUrl}/v1/chat/completions`);
    this.customModelEndpoints.set('llama-3.1-70b', `${this.config.baseUrl}/v1/chat/completions`);
    this.customModelEndpoints.set('mixtral-8x7b', `${this.config.baseUrl}/v1/chat/completions`);
    this.customModelEndpoints.set('mistral-7b', `${this.config.baseUrl}/v1/chat/completions`);
  }

  private buildRequestData(request: AIProviderRequest): any {
    // Try to create OpenAI-compatible format first
    if (this.isOpenAICompatible()) {
      return this.buildOpenAICompatibleRequest(request);
    }

    // Fallback to generic format
    return this.buildGenericRequest(request);
  }

  private buildOpenAICompatibleRequest(request: AIProviderRequest): any {
    const messages: any[] = [];

    // System message
    messages.push({
      role: 'system',
      content: this.buildSystemPrompt()
    });

    // Context if provided
    if (request.context) {
      messages.push({
        role: 'system',
        content: `Context: ${request.context}`
      });
    }

    // User prompt
    messages.push({
      role: 'user',
      content: request.prompt
    });

    return {
      model: request.model || this.config.defaultModel,
      messages,
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.maxTokens || this.config.maxTokens,
      stream: false
    };
  }

  private buildGenericRequest(request: AIProviderRequest): any {
    return {
      model: request.model || this.config.defaultModel,
      prompt: request.prompt,
      context: request.context,
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.maxTokens || this.config.maxTokens,
      metadata: request.metadata
    };
  }

  private buildSystemPrompt(): string {
    return `You are a custom AI model integrated into a cryptocurrency trading system. Your role is to provide expert-level analysis and trading recommendations.

Trading principles:
1. Risk management is paramount
2. Use data-driven analysis
3. Provide clear, actionable recommendations
4. Consider multiple market factors
5. Maintain consistency in decision-making

Response guidelines:
- Be specific and precise
- Include risk assessments
- Provide reasoning for recommendations
- Consider market volatility and liquidity
- Account for potential correlations

Focus on delivering high-quality, actionable trading insights while managing risk appropriately.`;
  }

  private getEndpointForModel(model: string): string | undefined {
    return this.customModelEndpoints.get(model);
  }

  private isOpenAICompatible(): boolean {
    // Determine if the custom endpoint is OpenAI-compatible
    // This could be configured or detected automatically
    const baseUrl = this.config.baseUrl || '';
    return baseUrl.includes('openai') || baseUrl.includes('v1/chat/completions');
  }
}