import { PromptEngineeringService } from '@/services/prompt-engineering.service';
import {
  DynamicPromptContext,
  ChainOfThoughtStep,
  PromptTemplate
} from '@/types/ai.types';

// Mock the logger
jest.mock('@/utils/logger', () => ({
  tradingLogger: {
    apiCall: jest.fn()
  },
  logError: jest.fn()
}));

describe('PromptEngineeringService', () => {
  let promptService: PromptEngineeringService;
  let mockContext: DynamicPromptContext;
  let mockChainOfThoughtSteps: ChainOfThoughtStep[];

  beforeEach(() => {
    promptService = new PromptEngineeringService();

    mockContext = {
      marketCondition: 'BULLISH' as const,
      volatilityLevel: 'MEDIUM' as const,
      timeOfDay: '10:00 AM',
      dayOfWeek: 'Monday',
      recentPerformance: 5.2,
      riskTolerance: 'MODERATE' as const,
      positionSize: 3,
      portfolioHeat: 45,
      marketSentiment: 0.75
    };

    mockChainOfThoughtSteps = [
      {
        step: 1,
        description: 'Analyze market trend',
        reasoning: 'Identify current market direction and momentum',
        conclusion: 'Market shows bullish momentum',
        confidence: 0.8
      },
      {
        step: 2,
        description: 'Evaluate risk factors',
        reasoning: 'Assess potential downside risks',
        conclusion: 'Moderate risk with defined support levels',
        confidence: 0.7
      }
    ];
  });

  describe('generateDynamicPrompt', () => {
    test('should generate context-aware prompts', () => {
      const variables = {
        symbol: 'BTCUSDT',
        price: 50000,
        volume: 1000000
      };

      const prompt = promptService.generateDynamicPrompt('trading_signal', variables, mockContext);

      expect(prompt).toContain('Current Trading Context:');
      expect(prompt).toContain('BULLISH');
      expect(prompt).toContain('MEDIUM');
      expect(prompt).toContain('10:00 AM');
      expect(prompt).toContain('BTCUSDT');
      expect(prompt).toContain('Risk Management Instructions:');
    });

    test('should validate required template variables', () => {
      const variables = {
        // Missing required variables
        symbol: 'BTCUSDT'
      };

      expect(() => {
        promptService.generateDynamicPrompt('trading_signal', variables, mockContext);
      }).toThrow('Missing required variables');
    });

    test('should handle different market conditions appropriately', () => {
      const bearishContext = {
        ...mockContext,
        marketCondition: 'BEARISH',
        volatilityLevel: 'HIGH'
      };

      const variables = {
        symbol: 'BTCUSDT',
        price: 50000,
        volume: 1000000,
        riskLevel: 'CONSERVATIVE'
      };

      const prompt = promptService.generateDynamicPrompt('trading_signal', variables, bearishContext);

      expect(prompt).toContain('BEARISH');
      expect(prompt).toContain('HIGH');
      expect(prompt).toContain('CONSERVATIVE');
      expect(prompt).toContain('Maximum 2% risk per trade');
    });

    test('should adjust risk instructions based on portfolio heat', () => {
      const highHeatContext = {
        ...mockContext,
        portfolioHeat: 85,
        recentLosses: 12
      };

      const variables = {
        symbol: 'BTCUSDT',
        price: 50000,
        volume: 1000000
      };

      const prompt = promptService.generateDynamicPrompt('trading_signal', variables, highHeatContext);

      expect(prompt).toContain('HIGH PORTFOLIO EXPOSURE');
      expect(prompt).toContain('RECENT LOSSES');
    });
  });

  describe('generateChainOfThoughtPrompt', () => {
    test('should create structured reasoning prompts', () => {
      const problem = 'Should we enter a long position on BTCUSDT at current levels?';

      const request = promptService.generateChainOfThoughtPrompt(problem, mockChainOfThoughtSteps, mockContext);

      expect(request.prompt).toContain('chain of thought');
      expect(request.prompt).toContain(problem);
      expect(request.prompt).toContain('Step 1: Analyze market trend');
      expect(request.prompt).toContain('Step 2: Evaluate risk factors');
      expect(request.temperature).toBe(0.1);
      expect(request.maxTokens).toBe(3000);
      expect(request.metadata?.type).toBe('chain_of_thought');
    });

    test('should handle empty steps gracefully', () => {
      const problem = 'What is the current market sentiment?';
      const emptySteps: ChainOfThoughtStep[] = [];

      const request = promptService.generateChainOfThoughtPrompt(problem, emptySteps, mockContext);

      expect(request.prompt).toContain(problem);
      expect(request.prompt).toContain('step by step');
    });
  });

  describe('generateRiskAwarePrompt', () => {
    test('should incorporate risk parameters into prompts', () => {
      const basePrompt = 'Analyze BTCUSDT for trading opportunity';
      const riskParams = {
        maxRisk: 3,
        riskTolerance: 'CONSERVATIVE' as const,
        portfolioHeat: 75,
        recentLosses: 8
      };

      const request = promptService.generateRiskAwarePrompt(basePrompt, riskParams, mockContext);

      expect(request.prompt).toContain('Current Risk Parameters:');
      expect(request.prompt).toContain('Maximum risk per trade: 3%');
      expect(request.prompt).toContain('Risk tolerance: CONSERVATIVE');
      expect(request.prompt).toContain('Portfolio heat: 75%');
      expect(request.prompt).toContain('Recent losses: 8%');
      expect(request.prompt).toContain('⚠️ HIGH RISK');
      expect(request.prompt).toContain('⚠️ HIGH EXPOSURE');
    });

    test('should adjust temperature for risk-aware decisions', () => {
      const basePrompt = 'Analyze BTCUSDT';
      const riskParams = {
        maxRisk: 5,
        riskTolerance: 'AGGRESSIVE' as const,
        portfolioHeat: 30,
        recentLosses: 0
      };

      const request = promptService.generateRiskAwarePrompt(basePrompt, riskParams, mockContext);

      expect(request.temperature).toBe(0.2);
      expect(request.metadata?.type).toBe('risk_aware');
    });
  });

  describe('generateMarketConditionPrompt', () => {
    test('should analyze market with technical indicators', () => {
      const marketData = {
        symbol: 'BTCUSDT',
        currentPrice: 50000,
        priceChange24h: 3.5,
        volume: 2000000,
        high24h: 52000,
        low24h: 48000,
        volatility: 0.04,
        trend: 'BULLISH' as const,
        momentum: 0.12,
        support: 48000,
        resistance: 52000
      };

      const indicators = {
        rsi: 65,
        macd: 0.02,
        bollinger: {
          upper: 51000,
          middle: 50000,
          lower: 49000
        }
      };

      const request = promptService.generateMarketConditionPrompt('BTCUSDT', marketData, indicators);

      expect(request.prompt).toContain('Market Condition: STRONG_BULLISH');
      expect(request.prompt).toContain('Technical Indicators:');
      expect(request.prompt).toContain('RSI: 65');
      expect(request.prompt).toContain('MACD: 0.02');
      expect(request.prompt).toContain('Market Context Factors:');
      expect(request.metadata?.type).toBe('market_condition');
    });

    test('should identify bearish market conditions', () => {
      const marketData = {
        symbol: 'BTCUSDT',
        currentPrice: 50000,
        priceChange24h: -6.2,
        volume: 3000000,
        high24h: 54000,
        low24h: 49000,
        volatility: 0.08,
        trend: 'BEARISH' as const,
        momentum: -0.25,
        support: 48000,
        resistance: 54000
      };

      const indicators = {
        rsi: 25,
        macd: -0.05
      };

      const request = promptService.generateMarketConditionPrompt('BTCUSDT', marketData, indicators);

      expect(request.prompt).toContain('Market Condition: STRONG_BEARISH');
      expect(request.prompt).toContain('Risk Level: EXTREME');
      expect(request.prompt).toContain('RSI: 25');
    });
  });

  describe('template management', () => {
    test('should create custom templates', () => {
      const template = promptService.createCustomTemplate(
        'Custom Trading Analysis',
        'Analyze {{symbol}} with current price {{price}} and trend {{trend}}',
        'TRADING'
      );

      expect(template.name).toBe('Custom Trading Analysis');
      expect(template.category).toBe('TRADING');
      expect(template.variables).toContain('symbol');
      expect(template.variables).toContain('price');
      expect(template.variables).toContain('trend');
      expect(template.version).toBe('1.0.0');
    });

    test('should list templates by category', () => {
      const tradingTemplates = promptService.listTemplates('TRADING');
      const allTemplates = promptService.listTemplates();

      expect(Array.isArray(tradingTemplates)).toBe(true);
      expect(Array.isArray(allTemplates)).toBe(true);
      expect(allTemplates.length).toBeGreaterThanOrEqual(tradingTemplates.length);
    });

    test('should retrieve specific template', () => {
      const template = promptService.createCustomTemplate(
        'Test Template',
        'Test with {{variable}}',
        'ANALYSIS'
      );

      const retrieved = promptService.getTemplate(template.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Template');
      expect(retrieved?.id).toBe(template.id);
    });
  });

  describe('optimizePromptTemplate', () => {
    test('should optimize templates based on performance data', () => {
      const templateId = 'test_template';

      // Create a template first
      promptService.createCustomTemplate(
        'Test Template',
        'Basic template for testing',
        'TRADING'
      );

      const performanceData = [
        { success: true, confidence: 0.6, responseTime: 3000, accuracy: 0.7 },
        { success: false, confidence: 0.4, responseTime: 5000, accuracy: 0.5 },
        { success: true, confidence: 0.8, responseTime: 2000, accuracy: 0.9 }
      ];

      const optimized = promptService.optimizePromptTemplate(templateId, performanceData);

      expect(optimized.version).not.toBe('1.0.0');
      expect(optimized.updatedAt).toBeGreaterThan(optimized.createdAt);
    });

    test('should throw error for non-existent template', () => {
      const performanceData = [
        { success: true, confidence: 0.8, responseTime: 1000, accuracy: 0.9 }
      ];

      expect(() => {
        promptService.optimizePromptTemplate('non_existent', performanceData);
      }).toThrow('Template not found: non_existent');
    });
  });

  describe('context analysis', () => {
    test('should assess risk levels correctly', () => {
      const highVolatilityMarket = {
        currentPrice: 50000,
        volatility: 0.1,
        volume: 50000
      };

      const indicators = { rsi: 85 };

      // This would be tested through the generateMarketConditionPrompt method
      const request = promptService.generateMarketConditionPrompt(
        'BTCUSDT',
        highVolatilityMarket as any,
        indicators
      );

      expect(request.prompt).toContain('Risk Level: EXTREME');
    });

    test('should identify contrarian opportunities', () => {
      const oversoldMarket = {
        currentPrice: 50000,
        priceChange24h: -8,
        volume: 5000000,
        volatility: 0.06,
        trend: 'BEARISH',
        momentum: -0.3
      };

      const indicators = { rsi: 15, stoch: 10 };

      const request = promptService.generateMarketConditionPrompt(
        'BTCUSDT',
        oversoldMarket as any,
        indicators
      );

      expect(request.prompt).toContain('Oversold conditions');
    });
  });

  describe('error handling', () => {
    test('should handle invalid template variables', () => {
      const variables = {
        // Valid variable
        symbol: 'BTCUSDT'
        // Missing required variable 'price'
      };

      expect(() => {
        promptService.generateDynamicPrompt('trading_signal', variables, mockContext);
      }).toThrow();
    });

    test('should handle missing templates gracefully', () => {
      const variables = {
        symbol: 'BTCUSDT',
        price: 50000
      };

      expect(() => {
        promptService.generateDynamicPrompt('non_existent_template', variables, mockContext);
      }).toThrow('Template not found: non_existent_template');
    });

    test('should handle malformed chain of thought steps', () => {
      const malformedSteps: ChainOfThoughtStep[] = [
        {
          step: 1,
          description: '',
          reasoning: '',
          conclusion: '',
          confidence: -1 // Invalid confidence
        }
      ];

      const problem = 'Test problem';
      const request = promptService.generateChainOfThoughtPrompt(problem, malformedSteps, mockContext);

      expect(request).toBeDefined();
      expect(request.prompt).toContain(problem);
    });
  });
});