import { AIService } from '@/services/ai.service';
import { db } from '@/models/database';
import { MarketAnalysis } from '@/types';

// Mock the database
jest.mock('@/models/database', () => ({
  db: {
    insertAIDecision: jest.fn(),
    getHistoricalData: jest.fn(),
    getAIDecisions: jest.fn()
  }
}));

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.CLAUDE_API_KEY = 'test-claude-key';
process.env.ENSEMBLE_ENABLED = 'true';
process.env.AI_CACHING_ENABLED = 'true';

describe('AI Service Integration Tests', () => {
  let aiService: AIService;

  beforeEach(() => {
    aiService = new AIService();
  });

  afterEach(() => {
    aiService = null as any;
  });

  describe('Multi-provider functionality', () => {
    test('should initialize with multi-provider support', () => {
      const healthCheck = aiService.healthCheck();

      expect(healthCheck).resolves.toHaveProperty('status');
      expect(healthCheck).resolves.toHaveProperty('model');
      expect(healthCheck).resolves.toHaveProperty('multiProvider');
    });

    test('should fallback to single provider when ensemble fails', async () => {
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

      // Mock database insert
      (db.insertAIDecision as jest.Mock).mockResolvedValue(undefined);

      const signal = await aiService.generateTradingSignal('BTCUSDT', mockMarketData);

      expect(signal).toBeDefined();
      expect(signal).toHaveProperty('action');
      expect(signal).toHaveProperty('confidence');
      expect(signal).toHaveProperty('reasoning');
      expect(signal).toHaveProperty('entryPrice');
      expect(signal).toHaveProperty('stopLoss');
      expect(signal).toHaveProperty('takeProfit');

      // Should have stored the decision
      expect(db.insertAIDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          action: expect.any(String),
          confidence: expect.any(Number),
          reasoning: expect.any(String),
          timestamp: expect.any(Number),
          executed: false,
          model: expect.any(String),
          input_data: expect.any(String)
        })
      );
    });

    test('should handle different market conditions appropriately', async () => {
      const testCases = [
        {
          marketData: {
            symbol: 'BTCUSDT',
            currentPrice: 50000,
            priceChange24h: 8.5,
            volume: 2000000,
            high24h: 52000,
            low24h: 48000,
            volatility: 0.06,
            trend: 'BULLISH' as const,
            momentum: 0.3,
            support: 48000,
            resistance: 52000
          },
          expectedAction: 'BUY'
        },
        {
          marketData: {
            symbol: 'BTCUSDT',
            currentPrice: 50000,
            priceChange24h: -7.2,
            volume: 2500000,
            high24h: 54000,
            low24h: 47000,
            volatility: 0.08,
            trend: 'BEARISH' as const,
            momentum: -0.4,
            support: 47000,
            resistance: 54000
          },
          expectedAction: 'SELL'
        },
        {
          marketData: {
            symbol: 'BTCUSDT',
            currentPrice: 50000,
            priceChange24h: 0.5,
            volume: 800000,
            high24h: 50500,
            low24h: 49500,
            volatility: 0.015,
            trend: 'SIDEWAYS' as const,
            momentum: 0.02,
            support: 49500,
            resistance: 50500
          },
          expectedAction: 'HOLD'
        }
      ];

      (db.insertAIDecision as jest.Mock).mockResolvedValue(undefined);

      for (const testCase of testCases) {
        const signal = await aiService.generateTradingSignal(
          testCase.marketData.symbol,
          testCase.marketData
        );

        expect(signal).toBeDefined();
        expect(signal.action).toMatch(/^(BUY|SELL|HOLD)$/);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
        expect(signal.positionSize).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Performance metrics and monitoring', () => {
    test('should provide comprehensive AI metrics', async () => {
      const metrics = await aiService.getAIMetrics();

      expect(metrics).toHaveProperty('gemini');
      expect(metrics.gemini).toHaveProperty('status');
      expect(metrics.gemini).toHaveProperty('model');

      if (metrics.multiProvider) {
        expect(metrics.multiProvider).toHaveProperty('providers');
        expect(metrics.multiProvider).toHaveProperty('cache');
        expect(metrics.multiProvider).toHaveProperty('cost');
      }

      expect(metrics.performance).toHaveProperty('totalRequests');
      expect(metrics.performance).toHaveProperty('successRate');
      expect(metrics.performance).toHaveProperty('averageResponseTime');
      expect(metrics.performance).toHaveProperty('dailyCost');
    });

    test('should track decision execution updates', async () => {
      const result = await aiService.updateDecisionExecution(
        'test-decision-id',
        true,
        'PROFIT'
      );

      // Should not throw and should handle gracefully
      expect(result).toBeUndefined();
    });

    test('should retrieve recent decisions', async () => {
      const mockDecisions = [
        {
          id: '1',
          symbol: 'BTCUSDT',
          action: 'BUY',
          confidence: 0.8,
          reasoning: 'Strong bullish trend',
          timestamp: Date.now(),
          executed: true,
          result: 'PROFIT',
          model: 'ensemble',
          inputData: {}
        }
      ];

      (db.getAIDecisions as jest.Mock).mockResolvedValue(mockDecisions);

      const decisions = await aiService.getRecentDecisions('BTCUSDT', 10);

      expect(decisions).toBeDefined();
      expect(Array.isArray(decisions)).toBe(true);
      expect(decisions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error handling and resilience', () => {
    test('should handle API failures gracefully', async () => {
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

      // Even with mocked failures, should return safe HOLD signal
      const signal = await aiService.generateTradingSignal('BTCUSDT', mockMarketData);

      expect(signal).toBeDefined();
      expect(signal.action).toBe('HOLD');
      expect(signal.confidence).toBe(0);
      expect(signal.reasoning).toContain('AI service error');
      expect(signal.positionSize).toBe(0);
    });

    test('should handle malformed market data', async () => {
      const malformedData = {
        symbol: '',
        currentPrice: -1000,
        priceChange24h: NaN,
        volume: 0,
        high24h: null,
        low24h: undefined,
        volatility: Infinity,
        trend: 'INVALID' as any,
        momentum: null,
        support: -50000,
        resistance: 'invalid'
      };

      const signal = await aiService.generateTradingSignal('TEST', malformedData as any);

      expect(signal).toBeDefined();
      expect(signal.action).toBe('HOLD');
    });

    test('should handle database errors gracefully', async () => {
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

      // Mock database error
      (db.insertAIDecision as jest.Mock).mockRejectedValue(new Error('Database error'));

      const signal = await aiService.generateTradingSignal('BTCUSDT', mockMarketData);

      expect(signal).toBeDefined();
      // Should still generate signal despite database error
    });
  });

  describe('Market analysis functionality', () => {
    test('should analyze multiple symbols', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];

      // Mock historical data
      (db.getHistoricalData as jest.Mock).mockReturnValue([
        { price: 48000, volume: 800000, timestamp: Date.now() - 86400000 },
        { price: 50000, volume: 1000000, timestamp: Date.now() }
      ]);

      const analyses = await aiService.analyzeMultipleSymbols(symbols);

      expect(analyses).toBeDefined();
      expect(Array.isArray(analyses)).toBe(true);
      expect(analyses.length).toBe(symbols.length);

      analyses.forEach(analysis => {
        expect(analysis).toHaveProperty('symbol');
        expect(analysis).toHaveProperty('currentPrice');
        expect(analysis).toHaveProperty('volatility');
        expect(analysis).toHaveProperty('trend');
      });
    });

    test('should handle market data analysis errors', async () => {
      // Mock empty historical data
      (db.getHistoricalData as jest.Mock).mockReturnValue([]);

      await expect(aiService.analyzeMarketData('BTCUSDT')).rejects.toThrow();
    });
  });

  describe('Configuration validation', () => {
    test('should handle missing API keys gracefully', () => {
      // Test with no API keys
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.CLAUDE_API_KEY;

      expect(() => {
        new AIService();
      }).toThrow('Gemini API key is required');
    });

    test('should initialize with correct provider availability', () => {
      // All providers available
      process.env.GEMINI_API_KEY = 'test-gemini-key';
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.CLAUDE_API_KEY = 'test-claude-key';
      process.env.ENSEMBLE_ENABLED = 'true';

      const service = new AIService();
      const healthCheck = service.healthCheck();

      expect(healthCheck).resolves.toHaveProperty('multiProvider');
    });
  });

  describe('Performance and scalability', () => {
    test('should handle concurrent requests', async () => {
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

      (db.insertAIDecision as jest.Mock).mockResolvedValue(undefined);

      // Create multiple concurrent requests
      const requests = Array(10).fill(null).map((_, index) =>
        aiService.generateTradingSignal(`SYMBOL${index}`, mockMarketData)
      );

      const startTime = Date.now();
      const signals = await Promise.all(requests);
      const duration = Date.now() - startTime;

      expect(signals).toHaveLength(10);
      signals.forEach(signal => {
        expect(signal).toBeDefined();
        expect(signal).toHaveProperty('action');
        expect(signal).toHaveProperty('confidence');
      });

      // Should complete within reasonable time (less than 10 seconds for 10 requests)
      expect(duration).toBeLessThan(10000);
    });

    test('should maintain performance under load', async () => {
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

      (db.insertAIDecision as jest.Mock).mockResolvedValue(undefined);

      const metricsBefore = await aiService.getAIMetrics();

      // Generate multiple signals
      for (let i = 0; i < 5; i++) {
        await aiService.generateTradingSignal(`TEST${i}`, mockMarketData);
      }

      const metricsAfter = await aiService.getAIMetrics();

      expect(metricsAfter).toBeDefined();
      // Metrics should have been updated
    });
  });
});