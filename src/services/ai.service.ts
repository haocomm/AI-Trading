import axios from 'axios';
import { aiConfig } from '@/config';
import { tradingLogger, logError } from '@/utils/logger';
import { db } from '@/models/database';
import { MultiAIService } from './multi-ai.service';
import { PromptEngineeringService } from './prompt-engineering.service';
import { CostOptimizationService } from './cost-optimization.service';
import {
  AIProviderConfig,
  EnsembleConfig,
  OptimizationStrategy,
  TradingSignal,
  DynamicPromptContext,
  AIProviderRequest
} from '@/types/ai.types';
import { MarketAnalysis } from '@/types';



export class AIService {
  private geminiApiKey: string;
  private model: string;
  private multiAIService?: MultiAIService;
  private promptEngineering?: PromptEngineeringService;
  private costOptimization?: CostOptimizationService;
  private useMultiProvider: boolean;

  constructor() {
    this.geminiApiKey = aiConfig.gemini.apiKey;
    this.model = aiConfig.gemini.model;
    this.useMultiProvider = aiConfig.ensemble.enabled && this.hasValidMultiProviderConfig();

    if (!this.geminiApiKey) {
      throw new Error('Gemini API key is required');
    }

    if (this.useMultiProvider) {
      this.initializeMultiProviderServices();
    }
  }

  // Main AI decision method
  async generateTradingSignal(symbol: string, marketData: MarketAnalysis): Promise<TradingSignal> {
    try {
      if (this.useMultiProvider && this.multiAIService) {
        return this.generateMultiProviderSignal(symbol, marketData);
      } else {
        return this.generateGeminiSignal(symbol, marketData);
      }
    } catch (error) {
      tradingLogger.apiCall('AI', 'generateTradingSignal', false, undefined, error instanceof Error ? error.message : 'Unknown error');
      logError(error instanceof Error ? error : new Error('AI signal generation failed'), { symbol, marketData });

      // Return safe HOLD signal on error
      return {
        action: 'HOLD',
        confidence: 0,
        reasoning: `AI service error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        entryPrice: marketData.currentPrice,
        stopLoss: marketData.currentPrice * 0.98,
        takeProfit: marketData.currentPrice * 1.06,
        positionSize: 0,
        riskReward: 0,
        provider: 'gemini',
        model: this.model,
      };
    }
  }

  private async generateMultiProviderSignal(symbol: string, marketData: MarketAnalysis): Promise<TradingSignal> {
    if (!this.multiAIService || !this.promptEngineering) {
      throw new Error('Multi-provider services not initialized');
    }

    const startTime = Date.now();

    try {
      // Generate dynamic context
      const context = this.createDynamicContext(marketData);

      // Generate optimized prompt
      const prompt = this.promptEngineering.generateDynamicPrompt(
        'trading_signal',
        {
          symbol,
          marketData: JSON.stringify(marketData, null, 2)
        },
        context
      );

      // Create AI request
      const request: AIProviderRequest = {
        prompt,
        temperature: 0.3,
        maxTokens: 1024,
        metadata: {
          type: 'trading_signal',
          symbol,
          context,
          timestamp: Date.now()
        }
      };

      // Generate signal using ensemble
      const result = await this.multiAIService.generateSignal(symbol, marketData, {
        useEnsemble: true,
        useCache: aiConfig.caching.enabled,
        priority: 'MEDIUM'
      });

      let signal: TradingSignal;

      if ('action' in result) {
        // Ensemble decision
        signal = this.convertEnsembleToTradingSignal(result as any);
      } else {
        // Single provider response
        signal = this.parseAIResponse(result as any, symbol, marketData.currentPrice);
      }

      // Store AI decision in database
      db.insertAIDecision({
        symbol,
        action: signal.action,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        timestamp: Date.now(),
        executed: false,
        model: signal.model || 'ensemble',
        input_data: JSON.stringify({ marketData, context }),
      });

      const responseTime = Date.now() - startTime;
      tradingLogger.aiDecision(symbol, signal.action, signal.confidence, signal.reasoning);
      tradingLogger.apiCall('MultiAI', 'generateTradingSignal', true, responseTime, `Provider: ${signal.model}, Ensemble: ${'action' in result}`);

      return signal;

    } catch (error) {
      // Fallback to single provider if ensemble fails
      tradingLogger.apiCall('MultiAI', 'fallbackToSingleProvider', true, 0, error instanceof Error ? error.message : 'Unknown error');

      return this.generateGeminiSignal(symbol, marketData);
    }
  }

  private async generateGeminiSignal(symbol: string, marketData: MarketAnalysis): Promise<TradingSignal> {
    const prompt = this.buildTradingPrompt(symbol, marketData);
    const startTime = Date.now();

    const response = await this.callGeminiAPI(prompt);
    const responseTime = Date.now() - startTime;

    tradingLogger.apiCall('gemini', 'generateTradingSignal', true, responseTime);

    const signal = this.parseAIResponse(response.data, symbol, marketData.currentPrice);

    // Store AI decision in database
    db.insertAIDecision({
      symbol,
      action: signal.action,
      confidence: signal.confidence,
      reasoning: signal.reasoning,
      timestamp: Date.now(),
      executed: false,
      model: this.model,
      input_data: JSON.stringify(marketData),
    });

    tradingLogger.aiDecision(symbol, signal.action, signal.confidence, signal.reasoning);

    return signal;
  }

  private buildTradingPrompt(symbol: string, marketData: MarketAnalysis): string {
    return `You are an expert cryptocurrency trading AI specializing in technical analysis and risk management.

Analyze the following market data for ${symbol} and provide a trading recommendation:

MARKET DATA:
- Current Price: $${marketData.currentPrice.toLocaleString()}
- 24h Change: ${marketData.priceChange24h.toFixed(2)}%
- 24h Volume: ${marketData.volume.toLocaleString()}
- 24h High: $${marketData.high24h.toLocaleString()}
- 24h Low: $${marketData.low24h.toLocaleString()}
- Volatility: ${(marketData.volatility * 100).toFixed(2)}%
- Trend: ${marketData.trend}
- Momentum: ${marketData.momentum.toFixed(4)}
- Support Level: $${marketData.support.toLocaleString()}
- Resistance Level: $${marketData.resistance.toLocaleString()}

TRADING RULES:
1. Risk Management: Maximum 5% risk per trade
2. Stop Loss: Default 2% below entry (adjust for volatility)
3. Take Profit: Minimum 2:1 risk/reward ratio
4. Position Sizing: Based on 5% portfolio risk
5. Avoid overtrading during sideways markets
6. Consider market volatility for stop loss width

Provide your analysis in this EXACT JSON format:
{
  "action": "BUY|SELL|HOLD",
  "confidence": 0.00-1.00,
  "reasoning": "Detailed technical analysis explanation",
  "keyIndicators": ["RSI", "MACD", "Volume", "Support/Resistance"],
  "marketCondition": "BULLISH|BEARISH|SIDEWAYS|VOLATILE",
  "riskFactors": ["High volatility", "Low volume", "Overbought", "Oversold"],
  "expectedMove": "Percentage move expected",
  "timeframe": "Short-term (hours) / Medium-term (days)"
}

CRITICAL: Focus on risk management and preserve capital. High confidence (>0.8) required for BUY signals during bearish conditions.`;
  }

  private async callGeminiAPI(prompt: string): Promise<any> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.geminiApiKey}`;

    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.3, // Lower for more consistent trading decisions
        maxOutputTokens: 1024,
        candidateCount: 1,
      }
    };

    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });

    if (response.data.candidates && response.data.candidates.length > 0) {
      return response.data;
    } else {
      throw new Error('No response from Gemini API');
    }
  }

  private parseAIResponse(response: any, symbol: string, currentPrice: number): TradingSignal {
    try {
      const text = response.candidates[0]?.content?.parts[0]?.text || '';

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const aiResponse = JSON.parse(jsonMatch[0]);

      // Validate action
      const validActions = ['BUY', 'SELL', 'HOLD'];
      const action = validActions.includes(aiResponse.action) ? aiResponse.action : 'HOLD';

      // Validate confidence
      const confidence = typeof aiResponse.confidence === 'number' ?
        Math.max(0, Math.min(1, aiResponse.confidence)) : 0;

      // Calculate position metrics
      const stopLossPercentage = 0.02; // 2% default
      const takeProfitPercentage = 0.06; // 6% default (3:1 ratio)

      const positionSize = action !== 'HOLD' ?
        this.calculatePositionSize(currentPrice, stopLossPercentage) : 0;

      return {
        action,
        confidence,
        reasoning: aiResponse.reasoning || 'No reasoning provided',
        entryPrice: currentPrice,
        stopLoss: currentPrice * (1 - stopLossPercentage),
        takeProfit: currentPrice * (1 + takeProfitPercentage),
        positionSize,
        riskReward: takeProfitPercentage / stopLossPercentage,
        provider: 'gemini',
        model: this.model,
      };
    } catch (error) {
      tradingLogger.aiDecision(symbol, 'HOLD', 0, `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Return safe default
      return {
        action: 'HOLD',
        confidence: 0,
        reasoning: 'AI response parsing failed',
        entryPrice: currentPrice,
        stopLoss: currentPrice * 0.98,
        takeProfit: currentPrice * 1.06,
        positionSize: 0,
        riskReward: 0,
        provider: 'gemini',
        model: this.model,
      };
    }
  }

  private calculatePositionSize(currentPrice: number, stopLossPercentage: number): number {
    const portfolioValue = 1000; // Default portfolio value - should come from risk service
    const riskAmount = portfolioValue * 0.05; // 5% risk
    const stopLossAmount = currentPrice * stopLossPercentage;
    return riskAmount / stopLossAmount;
  }

  // Market analysis helper methods
  async analyzeMarketData(symbol: string, exchange: 'binance' | 'bitkub' = 'binance'): Promise<MarketAnalysis> {
    try {
      // Get recent market data
      const endTime = Date.now();
      const startTime = endTime - (24 * 60 * 60 * 1000); // 24 hours

      const historicalData = db.getHistoricalData(symbol, exchange, startTime, endTime);

      if (historicalData.length < 2) {
        throw new Error('Insufficient historical data');
      }

      // Calculate metrics
      const prices = historicalData.map(d => d.price);
      const currentPrice = prices[prices.length - 1];
      const previousPrice = prices[0];
      const priceChange24h = ((currentPrice - previousPrice) / previousPrice) * 100;

      const volumes = historicalData.map(d => d.volume);
      const totalVolume = volumes.reduce((sum, vol) => sum + vol, 0);

      const high24h = Math.max(...prices);
      const low24h = Math.min(...prices);

      // Calculate volatility (standard deviation)
      const returns = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i-1]) / prices[i-1]);
      }
      const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const volatility = Math.sqrt(variance);

      // Determine trend
      let trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
      if (priceChange24h > 2) {
        trend = 'BULLISH';
      } else if (priceChange24h < -2) {
        trend = 'BEARISH';
      } else {
        trend = 'SIDEWAYS';
      }

      // Calculate momentum (simple price velocity)
      const momentum = priceChange24h / 24; // Per hour

      // Basic support/resistance levels
      const sortedPrices = [...prices].sort((a, b) => a - b);
      const q1Index = Math.floor(sortedPrices.length * 0.25);
      const q3Index = Math.floor(sortedPrices.length * 0.75);
      const support = sortedPrices[q1Index];
      const resistance = sortedPrices[q3Index];

      return {
        symbol,
        currentPrice,
        priceChange24h,
        volume: totalVolume,
        high24h,
        low24h,
        volatility,
        trend,
        momentum,
        support,
        resistance,
      };
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Market analysis failed'), { symbol, exchange });
      throw error;
    }
  }

  // Batch analysis for multiple symbols
  async analyzeMultipleSymbols(symbols: string[]): Promise<MarketAnalysis[]> {
    const analyses: MarketAnalysis[] = [];

    for (const symbol of symbols) {
      try {
        const analysis = await this.analyzeMarketData(symbol);
        analyses.push(analysis);
        tradingLogger.marketData(symbol, analysis.currentPrice, analysis.volume, analysis.priceChange24h);
      } catch (error) {
        logError(error instanceof Error ? error : new Error(`Failed to analyze ${symbol}`), { symbol });
        // Continue with other symbols
      }
    }

    return analyses;
  }

  // Get recent AI decisions for performance tracking
  async getRecentDecisions(symbol?: string, limit: number = 50): Promise<any[]> {
    return db.getAIDecisions(symbol, limit);
  }

  // Update AI decision execution status
  async updateDecisionExecution(decisionId: string, executed: boolean, result?: 'PROFIT' | 'LOSS' | 'BREAK_EVEN'): Promise<void> {
    try {
      // In a real implementation, this would update the database
      tradingLogger.aiDecision('UNKNOWN', 'HOLD', 1, `Decision ${decisionId} ${executed ? 'EXECUTED' : 'SKIPPED'}`);
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Failed to update decision execution'), { decisionId, executed, result });
    }
  }

  // Enhanced health check for AI service
  async healthCheck(): Promise<{
    status: string;
    model: string;
    lastCheck: string;
    multiProvider?: {
      enabled: boolean;
      providers?: Record<string, boolean>;
      cacheStats?: { size: number; hitRate: number };
    };
  }> {
    try {
      const geminiHealthy = await this.checkGeminiHealth();
      let multiProviderStatus: any = { enabled: this.useMultiProvider };

      if (this.useMultiProvider && this.multiAIService) {
        const providerHealth = await this.multiAIService.performHealthCheck();
        const cacheStats = this.multiAIService.getCacheStats();

        multiProviderStatus = {
          enabled: true,
          providers: providerHealth,
          cacheStats
        };
      }

      return {
        status: geminiHealthy ? 'healthy' : 'unhealthy',
        model: this.model,
        lastCheck: new Date().toISOString(),
        multiProvider: multiProviderStatus
      };
    } catch (error) {
      return {
        status: 'error',
        model: this.model,
        lastCheck: new Date().toISOString(),
      };
    }
  }

  // Get comprehensive AI service metrics
  async getAIMetrics(): Promise<{
    gemini: { status: boolean; model: string };
    multiProvider?: {
      providers: Record<string, any>;
      cache: any;
      cost: any;
    };
    performance: {
      totalRequests: number;
      successRate: number;
      averageResponseTime: number;
      dailyCost: number;
    };
  }> {
    const metrics: any = {
      gemini: {
        status: await this.checkGeminiHealth(),
        model: this.model
      },
      performance: {
        totalRequests: 0,
        successRate: 0,
        averageResponseTime: 0,
        dailyCost: 0
      }
    };

    if (this.multiAIService && this.useMultiProvider) {
      const providerMetrics = await this.multiAIService.getAllProviderMetrics();
      const cacheStats = this.multiAIService.getCacheStats();

      metrics.multiProvider = {
        providers: providerMetrics,
        cache: cacheStats,
        cost: this.costOptimization?.getCostMetrics() || null
      };
    }

    return metrics;
  }

  private hasValidMultiProviderConfig(): boolean {
    const { providers } = aiConfig;
    return !!(providers.openai.apiKey || providers.claude.apiKey || providers.custom.apiKey);
  }

  private initializeMultiProviderServices(): void {
    try {
      // Create provider configurations
      const providerConfigs: Record<string, AIProviderConfig> = {};

      if (aiConfig.providers.openai.apiKey) {
        providerConfigs.openai = {
          name: 'OpenAI',
          enabled: true,
          apiKey: aiConfig.providers.openai.apiKey,
          models: aiConfig.providers.openai.models,
          defaultModel: aiConfig.providers.openai.defaultModel,
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
        };
      }

      if (aiConfig.providers.claude.apiKey) {
        providerConfigs.claude = {
          name: 'Claude',
          enabled: true,
          apiKey: aiConfig.providers.claude.apiKey,
          models: aiConfig.providers.claude.models,
          defaultModel: aiConfig.providers.claude.defaultModel,
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
        };
      }

      if (aiConfig.providers.custom.apiKey) {
        providerConfigs.custom = {
          name: 'Custom',
          enabled: true,
          apiKey: aiConfig.providers.custom.apiKey || 'dummy-key',
          baseUrl: aiConfig.providers.custom.baseUrl,
          models: aiConfig.providers.custom.models,
          defaultModel: aiConfig.providers.custom.defaultModel,
          maxTokens: 2048,
          temperature: 0.3,
          timeout: 30000,
          rateLimit: {
            requestsPerMinute: 100,
            tokensPerMinute: 100000
          },
          pricing: {
            inputTokenCost: 0.000005,
            outputTokenCost: 0.000015
          },
          weights: {
            accuracy: 0.3,
            speed: 0.4,
            cost: 0.3
          }
        };
      }

      // Initialize ensemble configuration
      const ensembleConfig: EnsembleConfig = {
        minProviders: aiConfig.ensemble.minProviders,
        maxProviders: 4,
        consensusThreshold: aiConfig.ensemble.consensusThreshold,
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
          frequency: 24, // hours
          performanceWindow: 168, // hours (1 week)
          minSamples: 50
        }
      };

      // Initialize services
      this.multiAIService = new MultiAIService(providerConfigs, ensembleConfig);
      this.promptEngineering = new PromptEngineeringService();

      // Initialize cost optimization
      const costStrategy: OptimizationStrategy = {
        provider: 'gemini',
        caching: aiConfig.caching.enabled,
        batching: true,
        modelSelection: 'default',
        promptCompression: true,
        costThreshold: 0.10
      };

      this.costOptimization = new CostOptimizationService(costStrategy);

      // Set up event listeners
      this.setupEventListeners();

      tradingLogger.apiCall('AI', 'initializeMultiProviderServices', true, 0, `Providers: ${Object.keys(providerConfigs).join(', ')}, Ensemble: true`);

    } catch (error) {
      logError(error instanceof Error ? error : new Error('Failed to initialize multi-provider services'), {});
      this.useMultiProvider = false;
    }
  }

  private setupEventListeners(): void {
    if (!this.multiAIService) return;

    this.multiAIService.on('ensembleDecision', (decision) => {
      tradingLogger.apiCall('Ensemble', 'decisionGenerated', true, 0, `Action: ${decision.action}, Confidence: ${decision.confidence}, Consensus: ${decision.consensus}, Providers: ${decision.providerSignals.length}`);
    });

    this.multiAIService.on('providerError', (error) => {
      logError(new Error(`Provider error: ${error.message}`), { provider: error.provider });
    });
  }

  private createDynamicContext(marketData: MarketAnalysis): DynamicPromptContext {
    const now = new Date();
    const volatilityLevel = marketData.volatility > 0.05 ? 'HIGH' :
                           marketData.volatility > 0.02 ? 'MEDIUM' : 'LOW';

    const marketCondition = marketData.priceChange24h > 3 ? 'BULLISH' :
                           marketData.priceChange24h < -3 ? 'BEARISH' :
                           marketData.volatility > 0.05 ? 'VOLATILE' : 'SIDEWAYS';

    return {
      marketCondition,
      volatilityLevel,
      timeOfDay: now.toLocaleTimeString(),
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
      recentPerformance: marketData.priceChange24h,
      riskTolerance: volatilityLevel === 'HIGH' ? 'CONSERVATIVE' : 'MODERATE',
      positionSize: 5, // Default 5% position size
      portfolioHeat: 25, // Default 25% portfolio heat
      marketSentiment: marketData.priceChange24h > 0 ? 0.7 : 0.3
    };
  }

  private convertEnsembleToTradingSignal(ensemble: any): TradingSignal {
    const bestSignal = ensemble.providerSignals
      .sort((a: any, b: any) => b.signal.confidence - a.signal.confidence)[0];

    return {
      action: ensemble.action,
      confidence: ensemble.confidence,
      reasoning: ensemble.reasoning,
      entryPrice: bestSignal.signal.entryPrice,
      stopLoss: bestSignal.signal.stopLoss,
      takeProfit: bestSignal.signal.takeProfit,
      positionSize: bestSignal.signal.positionSize,
      riskReward: bestSignal.signal.riskReward,
      provider: 'ensemble',
      model: bestSignal.signal.model
    };
  }

  private async checkGeminiHealth(): Promise<boolean> {
    try {
      const testPrompt = "Respond with: 'OK'";
      const response = await this.callGeminiAPI(testPrompt);
      return response.candidates && response.candidates.length > 0;
    } catch {
      return false;
    }
  }
}

export default AIService;