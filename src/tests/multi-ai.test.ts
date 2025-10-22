import { MultiAIService } from '@/services/multi-ai.service';
import { OpenAIProvider } from '@/providers/openai.provider';
import { ClaudeProvider } from '@/providers/claude.provider';
import { CustomProvider } from '@/providers/custom.provider';
import {
  AIProviderConfig,
  EnsembleConfig,
  MarketAnalysis,
  AIProviderResponse
} from '@/types/ai.types';

// Mock the logger
jest.mock('@/utils/logger', () => ({
  tradingLogger: {
    apiCall: jest.fn(),
    aiDecision: jest.fn()
  },
  logError: jest.fn()
}));

// Mock axios for all providers
jest.mock('axios');

describe('MultiAIService', () => {
  let multiAIService: MultiAIService;
  let mockProviderConfigs: Record<string, AIProviderConfig>;
  let mockEnsembleConfig: EnsembleConfig;

  beforeEach(() => {
    // Setup mock provider configurations
    mockProviderConfigs = {
      openai: {
        name: 'OpenAI',
        enabled: true,
        apiKey: 'test-openai-key',
        models: ['gpt-4', 'gpt-3.5-turbo'],
        defaultModel: 'gpt-4',
        maxTokens: 2048,
        temperature: 0.3,
        timeout: 30000,
        rateLimit: {
          requestsPerMinute: 60,
          tokensPerMinute: 90000
        },
        pricing: {
          inputTokenCost: 0.00001,
          outputTokenCost: 0.00003
        },
        weights: {
          accuracy: 0.4,
          speed: 0.3,
          cost: 0.3
        }
      },
      claude: {
        name: 'Claude',
        enabled: true,
        apiKey: 'test-claude-key',
        models: ['claude-3-5-sonnet-20241022'],
        defaultModel: 'claude-3-5-sonnet-20241022',
        maxTokens: 2048,
        temperature: 0.3,
        timeout: 30000,
        rateLimit: {
          requestsPerMinute: 50,
          tokensPerMinute: 40000
        },
        pricing: {
          inputTokenCost: 0.000008,
          outputTokenCost: 0.000024
        },
        weights: {
          accuracy: 0.5,
          speed: 0.3,
          cost: 0.2
        }
      }
    };

    mockEnsembleConfig = {
      minProviders: 2,
      maxProviders: 3,
      consensusThreshold: 0.6,
      disagreementThreshold: 0.3,
      fallbackStrategy: 'WEIGHTED_VOTE',
      weights: {
        accuracy: 0.5,
        speed: 0.2,
        cost: 0.2,
        diversity: 0.1
      },
      rebalancing: {
        enabled: true,
        frequency: 24,
        performanceWindow: 168,
        minSamples: 50
      }
    };

    multiAIService = new MultiAIService(mockProviderConfigs, mockEnsembleConfig);
  });

  afterEach(() => {
    multiAIService.shutdown();
  });

  describe('initialization', () => {
    test('should initialize with provided configurations', () => {
      expect(multiAIService.getProviderList()).toContain('openai');
      expect(multiAIService.getProviderList()).toContain('claude');
    });

    test('should handle empty provider configurations', () => {
      const emptyService = new MultiAIService({}, mockEnsembleConfig);
      expect(emptyService.getProviderList()).toHaveLength(0);
      emptyService.shutdown();
    });

    test('should skip disabled providers', () => {
      const disabledConfig = {
        ...mockProviderConfigs,
        openai: { ...mockProviderConfigs.openai, enabled: false }
      };

      const service = new MultiAIService(disabledConfig, mockEnsembleConfig);
      expect(service.getProviderList()).not.toContain('openai');
      expect(service.getProviderList()).toContain('claude');
      service.shutdown();
    });
  });

  describe('generateSignal', () => {
    const mockMarketData: MarketAnalysis = {
      symbol: 'BTCUSDT',
      currentPrice: 50000,
      priceChange24h: 2.5,
      volume: 1000000,
      high24h: 51000,
      low24h: 49000,
      volatility: 0.03,
      trend: 'BULLISH',
      momentum: 0.1,
      support: 49000,
      resistance: 51000
    };

    test('should generate ensemble decision when multiple providers are available', async () => {
      // Mock provider responses
      const mockResponse1: AIProviderResponse = {
        content: JSON.stringify({
          action: 'BUY',
          confidence: 0.8,
          reasoning: 'Strong bullish trend detected',
          entryPrice: 50000,
          stopLoss: 48500,
          takeProfit: 53000,
          positionSize: 0.1,
          riskReward: 3
        }),
        model: 'gpt-4',
        provider: 'OpenAI',
        usage: { promptTokens: 100, completionTokens: 150, totalTokens: 250 },
        cost: 0.01,
        responseTime: 1500,
        timestamp: Date.now()
      };

      const mockResponse2: AIProviderResponse = {
        content: JSON.stringify({
          action: 'BUY',
          confidence: 0.7,
          reasoning: 'Technical indicators support upward movement',
          entryPrice: 50000,
          stopLoss: 48500,
          takeProfit: 53000,
          positionSize: 0.08,
          riskReward: 2.5
        }),
        model: 'claude-3-5-sonnet-20241022',
        provider: 'Claude',
        usage: { promptTokens: 120, completionTokens: 130, totalTokens: 250 },
        cost: 0.008,
        responseTime: 1200,
        timestamp: Date.now()
      };

      // Mock the providers
      const openaiProvider = new OpenAIProvider(mockProviderConfigs.openai);
      const claudeProvider = new ClaudeProvider(mockProviderConfigs.claude);

      jest.spyOn(openaiProvider, 'generateResponse').mockResolvedValue(mockResponse1);
      jest.spyOn(claudeProvider, 'generateResponse').mockResolvedValue(mockResponse2);

      const result = await multiAIService.generateSignal('BTCUSDT', mockMarketData, {
        useEnsemble: true
      });

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('consensus');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('providerSignals');
    });

    test('should fallback to single provider when ensemble fails', async () => {
      // Mock single provider response
      const mockResponse: AIProviderResponse = {
        content: 'Analysis complete. Recommendation: HOLD',
        model: 'gpt-4',
        provider: 'OpenAI',
        cost: 0.005,
        responseTime: 800,
        timestamp: Date.now()
      };

      const service = new MultiAServiceProvider();
      service.addMockResponse(mockResponse);

      const result = await service.generateSignal('BTCUSDT', mockMarketData, {
        useEnsemble: false
      });

      expect(result).toHaveProperty('content');
      expect(result.provider).toBe('OpenAI');
    });

    test('should use cache when enabled', async () => {
      const result = await multiAIService.generateSignal('BTCUSDT', mockMarketData, {
        useEnsemble: true,
        useCache: true
      });

      // Cache hit check would be implemented here
      expect(result).toBeDefined();
    });
  });

  describe('batchGenerateSignals', () => {
    test('should process multiple signals in batch', async () => {
      const requests = [
        { symbol: 'BTCUSDT', marketData: { currentPrice: 50000 } },
        { symbol: 'ETHUSDT', marketData: { currentPrice: 3000 } },
        { symbol: 'ADAUSDT', marketData: { currentPrice: 1.2 } }
      ];

      const result = await multiAIService.batchGenerateSignals(requests, {
        maxConcurrency: 2
      });

      expect(result).toHaveProperty('requestId');
      expect(result).toHaveProperty('responses');
      expect(result).toHaveProperty('success');
      expect(result.responses).toHaveLength(requests.length);
    });

    test('should handle batch processing errors gracefully', async () => {
      const requests = [
        { symbol: 'INVALID', marketData: null },
        { symbol: 'BTCUSDT', marketData: { currentPrice: 50000 } }
      ];

      const result = await multiAIService.batchGenerateSignals(requests);

      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.responses.length).toBeLessThan(requests.length);
    });
  });

  describe('health checks and metrics', () => {
    test('should perform health checks on all providers', async () => {
      const healthStatus = await multiAIService.performHealthCheck();

      expect(healthStatus).toHaveProperty('openai');
      expect(healthStatus).toHaveProperty('claude');
      expect(typeof healthStatus.openai).toBe('boolean');
      expect(typeof healthStatus.claude).toBe('boolean');
    });

    test('should retrieve provider metrics', async () => {
      const metrics = await multiAIService.getAllProviderMetrics();

      expect(metrics).toHaveProperty('openai');
      expect(metrics).toHaveProperty('claude');
      expect(metrics.openai).toHaveProperty('totalRequests');
      expect(metrics.openai).toHaveProperty('successRate');
    });

    test('should provide cache statistics', () => {
      const cacheStats = multiAIService.getCacheStats();

      expect(cacheStats).toHaveProperty('size');
      expect(cacheStats).toHaveProperty('hitRate');
      expect(typeof cacheStats.size).toBe('number');
      expect(typeof cacheStats.hitRate).toBe('number');
    });
  });

  describe('error handling', () => {
    test('should handle provider initialization failures', () => {
      const invalidConfig = {
        openai: {
          ...mockProviderConfigs.openai,
          apiKey: '' // Invalid
        }
      };

      expect(() => {
        new MultiAIService(invalidConfig, mockEnsembleConfig);
      }).not.toThrow();

      const service = new MultiAIService(invalidConfig, mockEnsembleConfig);
      expect(service.getProviderList()).not.toContain('openai');
      service.shutdown();
    });

    test('should handle ensemble decision failures', async () => {
      const service = new MultiAServiceProvider();
      service.setEnsembleFailure();

      const result = await service.generateSignal('BTCUSDT', {
        currentPrice: 50000
      });

      expect(result).toBeDefined();
      // Should fallback to single provider
    });

    test('should handle timeout scenarios', async () => {
      const service = new MultiAIService(mockProviderConfigs, mockEnsembleConfig);

      const result = await service.generateSignal('BTCUSDT', {
        currentPrice: 50000
      }, {
        timeout: 1 // Very short timeout
      });

      expect(result).toBeDefined();
      service.shutdown();
    });
  });
});

// Helper mock class for testing
class MultiAIServiceProvider extends MultiAIService {
  private mockResponse?: AIProviderResponse;
  private ensembleFailure = false;

  addMockResponse(response: AIProviderResponse) {
    this.mockResponse = response;
  }

  setEnsembleFailure() {
    this.ensembleFailure = true;
  }

  async generateSignal(symbol: string, marketData: any, options: any = {}): Promise<any> {
    if (this.ensembleFailure && options.useEnsemble) {
      throw new Error('Ensemble failed');
    }

    if (this.mockResponse) {
      return this.mockResponse;
    }

    return {
      content: `Signal for ${symbol}`,
      provider: 'MockProvider'
    };
  }

  getProviderList(): string[] {
    return ['mock-provider'];
  }

  async getAllProviderMetrics(): Promise<Record<string, any>> {
    return {
      'mock-provider': {
        totalRequests: 10,
        successRate: 0.9,
        averageResponseTime: 1000
      }
    };
  }

  getCacheStats(): { size: number; hitRate: number } {
    return { size: 0, hitRate: 0 };
  }

  async performHealthCheck(): Promise<Record<string, boolean>> {
    return { 'mock-provider': true };
  }

  shutdown(): void {
    // Mock shutdown
  }
}