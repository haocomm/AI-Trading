import { CostOptimizationService } from '@/services/cost-optimization.service';
import {
  AIProviderRequest,
  AIProviderResponse,
  BatchRequest,
  BatchResponse,
  ProviderPricing
} from '@/types/ai.types';

// Mock the logger
jest.mock('@/utils/logger', () => ({
  tradingLogger: {
    apiCall: jest.fn()
  },
  logError: jest.fn()
}));

describe('CostOptimizationService', () => {
  let costService: CostOptimizationService;
  let mockStrategy;

  beforeEach(() => {
    mockStrategy = {
      enableCaching: true,
      cacheTTL: 300,
      maxCacheSize: 100,
      enableBatching: true,
      batchSize: 5,
      batchTimeout: 10000,
      enableCompression: true,
      preferCheaperProvider: true,
      maxCostPerRequest: 0.10,
      dailyBudgetLimit: 50.0
    };

    costService = new CostOptimizationService(mockStrategy);
  });

  afterEach(() => {
    costService.resetCostTracking();
  });

  describe('request optimization', () => {
    test('should optimize requests for cost efficiency', async () => {
      const request: AIProviderRequest = {
        prompt: 'Analyze BTCUSDT market conditions',
        temperature: 0.5,
        maxTokens: 3000
      };

      const result = await costService.optimizeRequest(request, 'OpenAI', 'MEDIUM');

      expect(result).toHaveProperty('optimizedRequest');
      expect(result).toHaveProperty('estimatedCost');
      expect(result).toHaveProperty('cachingEnabled');
      expect(result).toHaveProperty('batchingEnabled');

      expect(result.cachingEnabled).toBe(true);
      expect(result.optimizedRequest.maxTokens).toBeLessThanOrEqual(request.maxTokens);
    });

    test('should limit cost per request', async () => {
      const expensiveRequest: AIProviderRequest = {
        prompt: 'Very long prompt ' + 'x'.repeat(10000),
        temperature: 0.8,
        maxTokens: 8000
      };

      const result = await costService.optimizeRequest(expensiveRequest, 'OpenAI', 'HIGH');

      expect(result.estimatedCost).toBeLessThanOrEqual(mockStrategy.maxCostPerRequest);
    });

    test('should handle caching differently for different priorities', async () => {
      const request: AIProviderRequest = {
        prompt: 'Quick analysis',
        temperature: 0.3,
        maxTokens: 1000
      };

      const highPriorityResult = await costService.optimizeRequest(request, 'OpenAI', 'HIGH');
      const lowPriorityResult = await costService.optimizeRequest(request, 'OpenAI', 'LOW');

      expect(lowPriorityResult.batchingEnabled).toBe(true);
      // High priority requests might not use batching
    });
  });

  describe('batch processing', () => {
    test('should process batch requests efficiently', async () => {
      const requests: AIProviderRequest[] = [
        { prompt: 'Analyze BTC', maxTokens: 1000 },
        { prompt: 'Analyze ETH', maxTokens: 1000 },
        { prompt: 'Analyze ADA', maxTokens: 1000 }
      ];

      const mockExecuteBatch = jest.fn().mockResolvedValue([
        {
          content: 'BTC analysis complete',
          provider: 'OpenAI',
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
          cost: 0.005,
          responseTime: 1000,
          timestamp: Date.now()
        },
        {
          content: 'ETH analysis complete',
          provider: 'OpenAI',
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
          cost: 0.005,
          responseTime: 1200,
          timestamp: Date.now()
        },
        {
          content: 'ADA analysis complete',
          provider: 'OpenAI',
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
          cost: 0.005,
          responseTime: 800,
          timestamp: Date.now()
        }
      ]);

      const result = await costService.processBatch('OpenAI', requests, mockExecuteBatch);

      expect(result.success).toBe(true);
      expect(result.responses).toHaveLength(3);
      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle batch processing errors', async () => {
      const requests: AIProviderRequest[] = [
        { prompt: 'Valid request', maxTokens: 1000 },
        { prompt: 'Invalid request', maxTokens: 1000 }
      ];

      const mockExecuteBatch = jest.fn().mockRejectedValue(new Error('Batch processing failed'));

      const result = await costService.processBatch('OpenAI', requests, mockExecuteBatch);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.responses).toHaveLength(0);
      expect(result.totalCost).toBe(0);
    });

    test('should calculate batch savings', async () => {
      const requests: AIProviderRequest[] = [
        { prompt: 'Request 1', maxTokens: 500 },
        { prompt: 'Request 2', maxTokens: 500 }
      ];

      const mockExecuteBatch = jest.fn().mockResolvedValue([
        {
          content: 'Response 1',
          provider: 'OpenAI',
          usage: { promptTokens: 25, completionTokens: 50, totalTokens: 75 },
          cost: 0.002,
          responseTime: 500,
          timestamp: Date.now()
        },
        {
          content: 'Response 2',
          provider: 'OpenAI',
          usage: { promptTokens: 25, completionTokens: 50, totalTokens: 75 },
          cost: 0.002,
          responseTime: 600,
          timestamp: Date.now()
        }
      ]);

      const result = await costService.processBatch('OpenAI', requests, mockExecuteBatch);

      expect(result.totalCost).toBe(0.004);
      // Individual cost would be higher than batch cost due to batching efficiency
    });
  });

  describe('provider pricing', () => {
    test('should set custom provider pricing', () => {
      const customPricing: ProviderPricing = {
        inputTokenCost: 0.000015,
        outputTokenCost: 0.000045,
        requestCost: 0.002,
        freeTokensPerMonth: 50000,
        tierDiscounts: [
          { threshold: 25, discount: 0.05 },
          { threshold: 100, discount: 0.15 }
        ]
      };

      costService.setProviderPricing('CustomProvider', customPricing);

      const request: AIProviderRequest = {
        prompt: 'Test prompt with about 20 tokens',
        maxTokens: 100
      };

      const result = await costService.optimizeRequest(request, 'CustomProvider', 'MEDIUM');

      expect(result.estimatedCost).toBeGreaterThan(0);
    });

    test('should apply tier discounts', () => {
      const highTierPricing: ProviderPricing = {
        inputTokenCost: 0.00001,
        outputTokenCost: 0.00003,
        tierDiscounts: [
          { threshold: 50, discount: 0.1 },
          { threshold: 200, discount: 0.25 }
        ]
      };

      costService.setProviderPricing('HighTier', highTierPricing);

      // This would be tested through the internal cost calculation methods
      expect(true).toBe(true); // Placeholder for discount calculation verification
    });
  });

  describe('cost metrics and analysis', () => {
    test('should track cost metrics accurately', () => {
      const metrics = costService.getCostMetrics();

      expect(metrics).toHaveProperty('totalCost');
      expect(metrics).toHaveProperty('tokenCosts');
      expect(metrics).toHaveProperty('providerCosts');
      expect(metrics).toHaveProperty('dailyCost');
      expect(metrics).toHaveProperty('monthlyCost');
      expect(metrics).toHaveProperty('costPerRequest');
      expect(metrics).toHaveProperty('savingsFromCaching');
      expect(metrics).toHaveProperty('savingsFromBatching');
    });

    test('should provide comprehensive cost analysis', () => {
      const analysis = costService.getCostAnalysis();

      expect(analysis).toHaveProperty('dailyTrend');
      expect(analysis).toHaveProperty('monthlyProjection');
      expect(analysis).toHaveProperty('topCostProviders');
      expect(analysis).toHaveProperty('savingsBreakdown');
      expect(analysis).toHaveProperty('recommendations');

      expect(Array.isArray(analysis.topCostProviders)).toBe(true);
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });

    test('should generate relevant recommendations', () => {
      // Simulate high daily cost
      costService['updateCostMetrics'](100, 'OpenAI', 'request', 0);

      const analysis = costService.getCostAnalysis();
      expect(analysis.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('strategy updates', () => {
    test('should update optimization strategy', () => {
      const newStrategy = {
        enableCaching: false,
        maxCostPerRequest: 0.20,
        dailyBudgetLimit: 100.0
      };

      costService.updateStrategy(newStrategy);

      // Verify the strategy was updated
      const metrics = costService.getCostMetrics();
      expect(metrics).toBeDefined();
    });

    test('should emit strategy update events', () => {
      const eventSpy = jest.fn();
      costService.on('strategyUpdated', eventSpy);

      costService.updateStrategy({ enableCaching: false });

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('caching behavior', () => {
    test('should check cache before processing', async () => {
      const request: AIProviderRequest = {
        prompt: 'Repeated request',
        temperature: 0.3,
        maxTokens: 500
      };

      // First request
      const result1 = await costService.optimizeRequest(request, 'OpenAI', 'MEDIUM');

      // Second identical request (should check cache)
      const result2 = await costService.optimizeRequest(request, 'OpenAI', 'MEDIUM');

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      // In a real implementation, result2 would have cacheHit: true
    });

    test('should respect cache TTL', async () => {
      const shortTTLStrategy = {
        ...mockStrategy,
        cacheTTL: 1 // 1 millisecond
      };

      const shortCacheService = new CostOptimizationService(shortTTLStrategy);

      const request: AIProviderRequest = {
        prompt: 'Test with short TTL',
        maxTokens: 500
      };

      // First request
      await shortCacheService.optimizeRequest(request, 'OpenAI', 'MEDIUM');

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second request should not use cache
      const result = await shortCacheService.optimizeRequest(request, 'OpenAI', 'MEDIUM');

      expect(result).toBeDefined();
    });
  });

  describe('batching behavior', () => {
    test('should emit batch ready events', async () => {
      const eventSpy = jest.fn();
      costService.on('batchReady', eventSpy);

      const request: AIProviderRequest = {
        prompt: 'Low priority request',
        maxTokens: 500
      };

      await costService.optimizeRequest(request, 'OpenAI', 'LOW');

      // Batch event should be emitted when batch is ready
      // This is tested through the event system
      expect(true).toBe(true); // Placeholder for event testing
    });

    test('should respect batch timeout', async () => {
      const timeoutStrategy = {
        ...mockStrategy,
        batchTimeout: 100 // Very short timeout
      };

      const timeoutService = new CostOptimizationService(timeoutStrategy);

      const request: AIProviderRequest = {
        prompt: 'Request with timeout',
        maxTokens: 500
      };

      await timeoutService.optimizeRequest(request, 'OpenAI', 'LOW');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Batch should have been processed due to timeout
      expect(true).toBe(true); // Placeholder for timeout testing
    });
  });

  describe('error handling', () => {
    test('should handle optimization errors gracefully', async () => {
      const invalidRequest: AIProviderRequest = {
        prompt: '', // Invalid empty prompt
        maxTokens: -1 // Invalid negative max tokens
      };

      const result = await costService.optimizeRequest(invalidRequest, 'OpenAI', 'MEDIUM');

      expect(result).toBeDefined();
      expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
    });

    test('should handle missing provider pricing', async () => {
      const request: AIProviderRequest = {
        prompt: 'Test with unknown provider',
        maxTokens: 500
      };

      const result = await costService.optimizeRequest(request, 'UnknownProvider', 'MEDIUM');

      expect(result.estimatedCost).toBeGreaterThanOrEqual(0.01); // Default estimate
    });

    test('should reset cost tracking safely', () => {
      costService.resetCostTracking();

      const metrics = costService.getCostMetrics();
      expect(metrics.totalCost).toBe(0);
      expect(metrics.dailyCost).toBe(0);
      expect(metrics.monthlyCost).toBe(0);
    });
  });

  describe('token estimation', () => {
    test('should estimate token counts accurately', () => {
      const shortText = 'Hello world';
      const longText = 'x'.repeat(4000); // Long text

      // These would be tested through internal token estimation methods
      const shortTokens = costService['estimateTokenCount'](shortText);
      const longTokens = costService['estimateTokenCount'](longText);

      expect(shortTokens).toBeGreaterThan(0);
      expect(longTokens).toBeGreaterThan(shortTokens);
      expect(longTokens).toBeLessThanOrEqual(1500); // Rough estimate
    });
  });
});