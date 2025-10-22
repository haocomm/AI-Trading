import {
  AIProviderRequest,
  AIProviderResponse,
  BatchRequest,
  BatchResponse,
  CacheEntry,
  OptimizationStrategy
} from '@/types/ai.types';
import { tradingLogger, logError } from '@/utils/logger';
import { EventEmitter } from 'events';

interface CostMetrics {
  totalCost: number;
  tokenCosts: {
    input: number;
    output: number;
  };
  providerCosts: Record<string, number>;
  dailyCost: number;
  monthlyCost: number;
  costPerRequest: number;
  savingsFromCaching: number;
  savingsFromBatching: number;
}

interface ProviderPricing {
  inputTokenCost: number;
  outputTokenCost: number;
  requestCost?: number;
  freeTokensPerMonth?: number;
  tierDiscounts?: Array<{
    threshold: number;
    discount: number;
  }>;
}


export class CostOptimizationService extends EventEmitter {
  private costMetrics: CostMetrics;
  private pricingData: Map<string, ProviderPricing>;
  private requestQueue: Map<string, AIProviderRequest[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private strategy: OptimizationStrategy;
  private costHistory: Array<{ timestamp: number; cost: number; provider: string; type: string }> = [];

  constructor(strategy: OptimizationStrategy) {
    super();
    this.strategy = strategy;
    this.costMetrics = {
      totalCost: 0,
      tokenCosts: { input: 0, output: 0 },
      providerCosts: {},
      dailyCost: 0,
      monthlyCost: 0,
      costPerRequest: 0,
      savingsFromCaching: 0,
      savingsFromBatching: 0
    };
    this.pricingData = new Map();
    this.initializeDefaultPricing();
    this.startCostTracking();
  }

  async optimizeRequest(
    request: AIProviderRequest,
    providerName: string,
    priority: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'
  ): Promise<{
    optimizedRequest: AIProviderRequest;
    estimatedCost: number;
    cachingEnabled: boolean;
    batchingEnabled: boolean;
  }> {
    try {
      // Check cache first
      if (this.strategy.caching) {
        const cacheKey = this.generateCacheKey(request, providerName);
        const cached = await this.checkCache(cacheKey);
        if (cached) {
          return {
            optimizedRequest: request,
            estimatedCost: 0,
            cachingEnabled: true,
            batchingEnabled: false
          };
        }
      }

      // Optimize request for cost
      const optimizedRequest = await this.optimizeRequestForCost(request, providerName);

      // Estimate cost
      const estimatedCost = this.estimateRequestCost(optimizedRequest, providerName);

      // Check if within budget
      if (estimatedCost > this.strategy.costThreshold) {
        optimizedRequest.maxTokens = Math.floor(
          (this.strategy.costThreshold / estimatedCost) * (optimizedRequest.maxTokens || 1000)
        );
      }

      // Add to batch if enabled and appropriate
      let batchingEnabled = false;
      if (this.strategy.batching && priority === 'LOW') {
        this.addToBatch(providerName, optimizedRequest);
        batchingEnabled = true;
      }

      tradingLogger.apiCall('CostOptimization', 'optimizeRequest', true, 0, {
        provider: providerName,
        estimatedCost,
        cachingEnabled: this.strategy.caching,
        batchingEnabled
      });

      return {
        optimizedRequest,
        estimatedCost,
        cachingEnabled: this.strategy.caching,
        batchingEnabled
      };

    } catch (error) {
      logError(error instanceof Error ? error : new Error('Failed to optimize request'), {
        request,
        providerName,
        priority
      });

      // Return original request on error
      return {
        optimizedRequest: request,
        estimatedCost: this.estimateRequestCost(request, providerName),
        cachingEnabled: false,
        batchingEnabled: false
      };
    }
  }

  async processBatch(
    providerName: string,
    requests: AIProviderRequest[],
    executeBatch: (requests: AIProviderRequest[]) => Promise<AIProviderResponse[]>
  ): Promise<BatchResponse> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // Optimize batch requests
      const optimizedRequests = requests.map(req =>
        this.optimizeRequestForCost(req, providerName)
      );

      // Execute batch
      const responses = await executeBatch(optimizedRequests);

      // Calculate costs
      const totalCost = responses.reduce((sum, response) => {
        return sum + this.calculateActualCost(response, providerName);
      }, 0);

      const totalTime = Date.now() - startTime;

      // Cache responses
      if (this.strategy.caching) {
        for (let i = 0; i < responses.length; i++) {
          const cacheKey = this.generateCacheKey(optimizedRequests[i], providerName);
          await this.cacheResponse(cacheKey, responses[i]);
        }
      }

      // Calculate savings
      const individualCost = requests.reduce((sum, req) =>
        sum + this.estimateRequestCost(req, providerName), 0
      );
      const savings = Math.max(0, individualCost - totalCost);

      // Update metrics
      this.updateCostMetrics(totalCost, providerName, 'batch', savings);

      const batchResponse: BatchResponse = {
        requestId: batchId,
        responses,
        success: true,
        errors: [],
        totalCost,
        totalTime
      };

      tradingLogger.apiCall('CostOptimization', 'processBatch', true, totalTime, {
        provider: providerName,
        requestCount: requests.length,
        totalCost,
        savings
      });

      this.emit('batchProcessed', batchResponse);
      return batchResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError(error instanceof Error ? error : new Error('Batch processing failed'), {
        provider: providerName,
        requestCount: requests.length
      });

      const batchResponse: BatchResponse = {
        requestId: batchId,
        responses: [],
        success: false,
        errors: [errorMessage],
        totalCost: 0,
        totalTime: Date.now() - startTime
      };

      this.emit('batchFailed', batchResponse, error);
      return batchResponse;
    }
  }

  setProviderPricing(providerName: string, pricing: ProviderPricing): void {
    this.pricingData.set(providerName, pricing);
    tradingLogger.apiCall('CostOptimization', 'setProviderPricing', true, 0, {
      provider: providerName,
      inputCost: pricing.inputTokenCost,
      outputCost: pricing.outputTokenCost
    });
  }

  updateStrategy(newStrategy: Partial<OptimizationStrategy>): void {
    this.strategy = { ...this.strategy, ...newStrategy };
    tradingLogger.apiCall('CostOptimization', 'updateStrategy', true, 0, newStrategy);
    this.emit('strategyUpdated', this.strategy);
  }

  getCostMetrics(): CostMetrics {
    return { ...this.costMetrics };
  }

  getCostAnalysis(): {
    dailyTrend: number;
    monthlyProjection: number;
    topCostProviders: Array<{ provider: string; cost: number; percentage: number }>;
    savingsBreakdown: {
      caching: number;
      batching: number;
      optimization: number;
    };
    recommendations: string[];
  } {
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000);

    const dailyCost = this.costHistory
      .filter(entry => entry.timestamp > dayAgo)
      .reduce((sum, entry) => sum + entry.cost, 0);

    const monthlyCost = this.costHistory
      .filter(entry => entry.timestamp > monthAgo)
      .reduce((sum, entry) => sum + entry.cost, 0);

    // Calculate trend
    const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);
    const previousDailyCost = this.costHistory
      .filter(entry => entry.timestamp > twoDaysAgo && entry.timestamp <= dayAgo)
      .reduce((sum, entry) => sum + entry.cost, 0);

    const dailyTrend = previousDailyCost > 0
      ? ((dailyCost - previousDailyCost) / previousDailyCost) * 100
      : 0;

    // Top cost providers
    const providerCosts: Record<string, number> = {};
    this.costHistory
      .filter(entry => entry.timestamp > monthAgo)
      .forEach(entry => {
        providerCosts[entry.provider] = (providerCosts[entry.provider] || 0) + entry.cost;
      });

    const totalMonthlyCost = Object.values(providerCosts).reduce((sum, cost) => sum + cost, 0);
    const topCostProviders = Object.entries(providerCosts)
      .map(([provider, cost]) => ({
        provider,
        cost,
        percentage: totalMonthlyCost > 0 ? (cost / totalMonthlyCost) * 100 : 0
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    // Savings breakdown
    const savingsBreakdown = {
      caching: this.costMetrics.savingsFromCaching,
      batching: this.costMetrics.savingsFromBatching,
      optimization: this.calculateOptimizationSavings()
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      dailyTrend,
      topCostProviders,
      savingsBreakdown
    );

    return {
      dailyTrend,
      monthlyProjection: monthlyCost * (30 / this.getDaysInCurrentMonth()),
      topCostProviders,
      savingsBreakdown,
      recommendations
    };
  }

  resetCostTracking(): void {
    this.costMetrics = this.initializeCostMetrics();
    this.costHistory = [];
    tradingLogger.apiCall('CostOptimization', 'resetCostTracking', true, 0);
  }

  private async optimizeRequestForCost(
    request: AIProviderRequest,
    providerName: string
  ): Promise<AIProviderRequest> {
    const optimized = { ...request };

    // Optimize token usage
    if (optimized.maxTokens && optimized.maxTokens > 2000) {
      optimized.maxTokens = Math.max(1000, Math.floor(optimized.maxTokens * 0.8));
    }

    // Adjust temperature for efficiency (higher temperature often requires more tokens)
    if (optimized.temperature && optimized.temperature > 0.7) {
      optimized.temperature = 0.7;
    }

    // Enable compression if supported
    if (this.strategy.enableCompression) {
      optimized.metadata = {
        ...optimized.metadata,
        compressResponse: true
      };
    }

    return optimized;
  }

  private estimateRequestCost(request: AIProviderRequest, providerName: string): number {
    const pricing = this.pricingData.get(providerName);
    if (!pricing) {
      return 0.01; // Default estimate
    }

    const estimatedInputTokens = this.estimateTokenCount(request.prompt);
    const estimatedOutputTokens = request.maxTokens || 1000;

    const inputCost = estimatedInputTokens * pricing.inputTokenCost;
    const outputCost = estimatedOutputTokens * pricing.outputTokenCost;
    const requestCost = pricing.requestCost || 0;

    // Apply tier discounts
    const totalCost = inputCost + outputCost + requestCost;
    const discount = this.getApplicableDiscount(providerName, totalCost);

    return totalCost * (1 - discount);
  }

  private calculateActualCost(response: AIProviderResponse, providerName: string): number {
    const pricing = this.pricingData.get(providerName);
    if (!pricing) {
      return response.cost || 0.01;
    }

    const inputCost = (response.usage?.promptTokens || 0) * pricing.inputTokenCost;
    const outputCost = (response.usage?.completionTokens || 0) * pricing.outputTokenCost;
    const requestCost = pricing.requestCost || 0;

    const totalCost = inputCost + outputCost + requestCost;
    const discount = this.getApplicableDiscount(providerName, totalCost);

    return totalCost * (1 - discount);
  }

  private estimateTokenCount(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  private getApplicableDiscount(providerName: string, cost: number): number {
    const pricing = this.pricingData.get(providerName);
    if (!pricing || !pricing.tierDiscounts) {
      return 0;
    }

    for (const tier of pricing.tierDiscounts) {
      if (cost >= tier.threshold) {
        return tier.discount;
      }
    }

    return 0;
  }

  private generateCacheKey(request: AIProviderRequest, providerName: string): string {
    const keyData = {
      prompt: request.prompt.substring(0, 200), // First 200 chars
      temperature: request.temperature || 0,
      maxTokens: request.maxTokens || 1000,
      provider: providerName
    };

    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  private async checkCache(cacheKey: string): Promise<AIProviderResponse | null> {
    // Implementation would depend on cache backend
    // This is a placeholder for caching logic
    return null;
  }

  private async cacheResponse(cacheKey: string, response: AIProviderResponse): Promise<void> {
    // Implementation would depend on cache backend
    // This is a placeholder for caching logic
  }

  private addToBatch(providerName: string, request: AIProviderRequest): void {
    if (!this.requestQueue.has(providerName)) {
      this.requestQueue.set(providerName, []);
    }

    const queue = this.requestQueue.get(providerName)!;
    queue.push(request);

    // Check if batch is ready to process
    if (queue.length >= this.strategy.batchSize) {
      this.processBatchQueue(providerName);
    } else if (!this.batchTimers.has(providerName)) {
      // Set timeout to process batch even if not full
      const timer = setTimeout(() => {
        this.processBatchQueue(providerName);
      }, this.strategy.batchTimeout);

      this.batchTimers.set(providerName, timer);
    }
  }

  private processBatchQueue(providerName: string): void {
    const queue = this.requestQueue.get(providerName);
    const timer = this.batchTimers.get(providerName);

    if (!queue || queue.length === 0) return;

    const batch = queue.splice(0, this.strategy.batchSize);

    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(providerName);
    }

    // Emit batch ready event for processing
    this.emit('batchReady', providerName, batch);
  }

  private initializeCostMetrics(): CostMetrics {
    return {
      totalCost: 0,
      tokenCosts: {
        input: 0,
        output: 0
      },
      providerCosts: {},
      dailyCost: 0,
      monthlyCost: 0,
      costPerRequest: 0,
      savingsFromCaching: 0,
      savingsFromBatching: 0
    };
  }

  private initializeDefaultPricing(): void {
    // OpenAI pricing (example rates)
    this.pricingData.set('OpenAI', {
      inputTokenCost: 0.00001, // $0.01 per 1K tokens
      outputTokenCost: 0.00003, // $0.03 per 1K tokens
      freeTokensPerMonth: 100000,
      tierDiscounts: [
        { threshold: 100, discount: 0.1 }, // 10% discount after $100
        { threshold: 500, discount: 0.2 }, // 20% discount after $500
        { threshold: 1000, discount: 0.3 }  // 30% discount after $1000
      ]
    });

    // Claude pricing (example rates)
    this.pricingData.set('Claude', {
      inputTokenCost: 0.000008,
      outputTokenCost: 0.000024,
      tierDiscounts: [
        { threshold: 50, discount: 0.05 },
        { threshold: 200, discount: 0.15 }
      ]
    });

    // Custom model pricing
    this.pricingData.set('Custom', {
      inputTokenCost: 0.000005,
      outputTokenCost: 0.000015
    });
  }

  private startCostTracking(): void {
    // Update cost metrics every hour
    setInterval(() => {
      this.updateCostMetrics();
    }, 60 * 60 * 1000);

    // Clean old cost history (keep 90 days)
    setInterval(() => {
      const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
      this.costHistory = this.costHistory.filter(entry => entry.timestamp > cutoff);
    }, 24 * 60 * 60 * 1000);
  }

  private updateCostMetrics(
    additionalCost: number = 0,
    providerName: string = '',
    type: string = 'request',
    savings: number = 0
  ): void {
    this.costMetrics.totalCost += additionalCost;

    if (providerName) {
      this.costMetrics.providerCosts[providerName] =
        (this.costMetrics.providerCosts[providerName] || 0) + additionalCost;
    }

    if (type === 'batch') {
      this.costMetrics.savingsFromBatching += savings;
    } else if (type === 'cache') {
      this.costMetrics.savingsFromCaching += savings;
    }

    // Add to history
    this.costHistory.push({
      timestamp: Date.now(),
      cost: additionalCost,
      provider: providerName,
      type
    });

    // Update daily and monthly costs
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000);

    this.costMetrics.dailyCost = this.costHistory
      .filter(entry => entry.timestamp > dayAgo)
      .reduce((sum, entry) => sum + entry.cost, 0);

    this.costMetrics.monthlyCost = this.costHistory
      .filter(entry => entry.timestamp > monthAgo)
      .reduce((sum, entry) => sum + entry.cost, 0);

    this.costMetrics.costPerRequest = this.costMetrics.totalCost /
      Math.max(1, this.costHistory.filter(entry => entry.type !== 'cache').length);
  }

  private calculateOptimizationSavings(): number {
    // Estimate savings from request optimizations
    return this.costHistory.reduce((savings, entry) => {
      const originalCost = entry.cost * 1.2; // Assume 20% savings from optimization
      return savings + (originalCost - entry.cost);
    }, 0);
  }

  private generateRecommendations(
    dailyTrend: number,
    topCostProviders: Array<{ provider: string; cost: number; percentage: number }>,
    savingsBreakdown: { caching: number; batching: number; optimization: number }
  ): string[] {
    const recommendations: string[] = [];

    // Cost trend recommendations
    if (dailyTrend > 20) {
      recommendations.push('Daily costs are rising rapidly (+20%). Consider reducing request frequency or enabling more aggressive caching.');
    } else if (dailyTrend < -10) {
      recommendations.push('Daily costs are decreasing. Current optimization strategies are effective.');
    }

    // Provider cost recommendations
    if (topCostProviders.length > 0) {
      const topProvider = topCostProviders[0];
      if (topProvider.percentage > 60) {
        recommendations.push(`${topProvider.provider} accounts for ${topProvider.percentage.toFixed(1)}% of costs. Consider diversifying providers or optimizing usage.`);
      }
    }

    // Savings recommendations
    const totalSavings = savingsBreakdown.caching + savingsBreakdown.batching + savingsBreakdown.optimization;
    if (totalSavings < 100) { // Less than $100 in savings
      recommendations.push('Consider enabling more aggressive cost optimization strategies.');
    }

    if (savingsBreakdown.caching === 0 && this.strategy.caching) {
      recommendations.push('Caching is enabled but no savings detected. Check cache implementation.');
    }

    if (savingsBreakdown.batching === 0 && this.strategy.batching) {
      recommendations.push('Batching is enabled but no savings detected. Consider adjusting batch size or timeout.');
    }

    return recommendations;
  }

  private getDaysInCurrentMonth(): number {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return new Date(year, month, 0).getDate();
  }
}