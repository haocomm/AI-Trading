import axios from 'axios';
import { aiConfig } from '@/config';
import { tradingLogger, logError } from '@/utils/logger';
import { db } from '@/models/database';

interface MarketAnalysis {
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  volume: number;
  high24h: number;
  low24h: number;
  volatility: number;
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  momentum: number;
  support: number;
  resistance: number;
}

interface TradingSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  riskReward: number;
}

export class AIService {
  private geminiApiKey: string;
  private model: string;

  constructor() {
    this.geminiApiKey = aiConfig.gemini.apiKey;
    this.model = aiConfig.gemini.model;

    if (!this.geminiApiKey) {
      throw new Error('Gemini API key is required');
    }
  }

  // Main AI decision method
  async generateTradingSignal(symbol: string, marketData: MarketAnalysis): Promise<TradingSignal> {
    try {
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
    } catch (error) {
      tradingLogger.apiCall('gemini', 'generateTradingSignal', false, undefined, error instanceof Error ? error.message : 'Unknown error');
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
      };
    }
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
      tradingLogger.aiDecision('UNKNOWN', executed ? 'EXECUTED' : 'SKIPPED', 1, `Decision ${decisionId} execution updated`);
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Failed to update decision execution'), { decisionId, executed, result });
    }
  }

  // Health check for AI service
  async healthCheck(): Promise<{ status: string; model: string; lastCheck: string }> {
    try {
      const testPrompt = "Respond with: 'AI service is healthy'";
      const response = await this.callGeminiAPI(testPrompt);

      return {
        status: response.candidates && response.candidates.length > 0 ? 'healthy' : 'unhealthy',
        model: this.model,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        model: this.model,
        lastCheck: new Date().toISOString(),
      };
    }
  }
}

export default AIService;