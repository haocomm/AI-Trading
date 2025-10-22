/**
 * Market Context Service
 *
 * Provides enhanced market context with sentiment analysis,
 * technical indicators, and regime detection for AI decision making.
 */

import { tradingLogger } from '@/utils/logger';

export interface TechnicalIndicators {
  // Trend indicators
  sma20: number;
  sma50: number;
  sma200: number;
  ema12: number;
  ema26: number;

  // Momentum indicators
  rsi: number;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };

  // Volatility indicators
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
  };
  atr: number;

  // Volume indicators
  volumeSMA: number;
  volumeRatio: number;
  onBalanceVolume: number;

  // Support/Resistance
  pivotPoints: {
    support1: number;
    support2: number;
    resistance1: number;
    resistance2: number;
  };

  // Pattern recognition
  candlestickPatterns: string[];
  chartPatterns: string[];
}

export interface MarketSentiment {
  overall: 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';
  score: number; // -100 to 100
  components: {
    fearGreedIndex: number;
    newsSentiment: number;
    socialSentiment: number;
    optionsSentiment: number;
    momentumSentiment: number;
  };
  sources: {
    news: Array<{ title: string; sentiment: number; timestamp: number; source: string }>;
    social: Array<{ platform: string; sentiment: number; mentions: number; timestamp: number }>;
    technical: Array<{ indicator: string; signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; strength: number }>;
  };
  trends: {
    shortTerm: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    mediumTerm: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    longTerm: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
}

export interface MarketRegime {
  primary: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'REVERSAL';
  secondary: 'BULL_MARKET' | 'BEAR_MARKET' | 'SIDEWAYS';
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  volatility: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  liquidity: 'THIN' | 'NORMAL' | 'DEEP';
  confidence: number; // 0-1
  expectedDuration: number; // in hours
  keyDrivers: string[];
}

export interface MarketContext {
  symbol: string;
  timestamp: number;
  price: number;
  volume: number;
  marketCap?: number;
  technicalIndicators: TechnicalIndicators;
  sentiment: MarketSentiment;
  regime: MarketRegime;
  intermarketData: {
    correlations: Record<string, number>;
    marketLeadership: 'LEADER' | 'LAGGER' | 'NEUTRAL';
    sectorPerformance: Record<string, number>;
    indexPerformance: Record<string, number>;
  };
  timeContext: {
    session: 'ASIA' | 'EUROPE' | 'AMERICAS' | 'WEEKEND';
    dayOfWeek: string;
    hourOfDay: number;
    isHoliday: boolean;
    isEarningsSeason: boolean;
    marketOpen: boolean;
  };
  riskFactors: {
    geopolitical: string[];
    economic: string[];
    regulatory: string[];
    technical: string[];
  };
}

export interface ContextEnhancement {
  marketContext: MarketContext;
  tradingSignals: {
    entry: string[];
    exit: string[];
    riskManagement: string[];
    opportunities: string[];
    warnings: string[];
  };
  aiPrompts: {
    analysis: string;
    decision: string;
    risk: string;
    strategy: string;
  };
  confidence: {
    technical: number;
    fundamental: number;
    sentiment: number;
    overall: number;
  };
  recommendations: {
    action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
    positionSize: number;
    timeframe: 'SCALP' | 'DAY' | 'SWING' | 'POSITION';
    reasoning: string[];
  };
}

export class MarketContextService {
  private static instance: MarketContextService;
  private technicalCache: Map<string, TechnicalIndicators> = new Map();
  private sentimentCache: Map<string, MarketSentiment> = new Map();
  private regimeCache: Map<string, MarketRegime> = new Map();
  private contextCache: Map<string, MarketContext> = new Map();

  private constructor() {}

  static getInstance(): MarketContextService {
    if (!MarketContextService.instance) {
      MarketContextService.instance = new MarketContextService();
    }
    return MarketContextService.instance;
  }

  /**
   * Generate comprehensive market context for AI decision making
   */
  async generateMarketContext(
    symbol: string,
    priceData: any[],
    marketData: any
  ): Promise<ContextEnhancement> {
    const startTime = performance.now();

    try {
      // Calculate technical indicators
      const technicalIndicators = await this.calculateTechnicalIndicators(symbol, priceData);

      // Analyze market sentiment
      const sentiment = await this.analyzeMarketSentiment(symbol, marketData);

      // Detect market regime
      const regime = await this.detectMarketRegime(symbol, technicalIndicators, sentiment);

      // Gather intermarket data
      const intermarketData = await this.gatherIntermarketData(symbol, marketData);

      // Get time context
      const timeContext = this.getTimeContext();

      // Identify risk factors
      const riskFactors = await this.identifyRiskFactors(symbol, marketData);

      // Build market context
      const marketContext: MarketContext = {
        symbol,
        timestamp: Date.now(),
        price: priceData[priceData.length - 1]?.close || 0,
        volume: priceData[priceData.length - 1]?.volume || 0,
        marketCap: marketData.marketCap,
        technicalIndicators,
        sentiment,
        regime,
        intermarketData,
        timeContext,
        riskFactors,
      };

      // Generate trading signals
      const tradingSignals = this.generateTradingSignals(marketContext);

      // Create AI prompts
      const aiPrompts = this.createAIPrompts(marketContext);

      // Calculate confidence levels
      const confidence = this.calculateConfidence(marketContext);

      // Generate recommendations
      const recommendations = this.generateRecommendations(marketContext, confidence);

      const result: ContextEnhancement = {
        marketContext,
        tradingSignals,
        aiPrompts,
        confidence,
        recommendations,
      };

      const duration = performance.now() - startTime;
      tradingLogger.performance('market_context_generation', duration, {
        symbol,
        regime: regime.primary,
        sentiment: sentiment.overall,
        confidence: confidence.overall,
      });

      return result;

    } catch (error) {
      const duration = performance.now() - startTime;
      tradingLogger.error('Market context generation failed', {
        symbol,
        error: error instanceof Error ? error.message : error,
        duration,
      });

      // Return fallback context
      return this.createFallbackContext(symbol, priceData, marketData);
    }
  }

  /**
   * Calculate comprehensive technical indicators
   */
  private async calculateTechnicalIndicators(symbol: string, priceData: any[]): Promise<TechnicalIndicators> {
    const cacheKey = `${symbol}_${Date.now()}`;

    // Check cache first
    const cached = this.technicalCache.get(symbol);
    if (cached && (Date.now() - cacheKey) < 300000) { // 5 minute cache
      return cached;
    }

    try {
      const prices = priceData.map(d => d.close);
      const volumes = priceData.map(d => d.volume);
      const highs = priceData.map(d => d.high);
      const lows = priceData.map(d => d.low);

      // Simple Moving Averages
      const sma20 = this.calculateSMA(prices, 20);
      const sma50 = this.calculateSMA(prices, 50);
      const sma200 = this.calculateSMA(prices, 200);

      // Exponential Moving Averages
      const ema12 = this.calculateEMA(prices, 12);
      const ema26 = this.calculateEMA(prices, 26);

      // RSI
      const rsi = this.calculateRSI(prices, 14);

      // MACD
      const macd = this.calculateMACD(prices, 12, 26, 9);

      // Bollinger Bands
      const bollingerBands = this.calculateBollingerBands(prices, 20, 2);

      // ATR
      const atr = this.calculateATR(highs, lows, prices, 14);

      // Volume indicators
      const volumeSMA = this.calculateSMA(volumes, 20);
      const currentVolume = volumes[volumes.length - 1];
      const volumeRatio = currentVolume / volumeSMA;
      const onBalanceVolume = this.calculateOBV(prices, volumes);

      // Pivot Points
      const pivotPoints = this.calculatePivotPoints(
        highs[highs.length - 1],
        lows[lows.length - 1],
        prices[prices.length - 1]
      );

      // Pattern recognition
      const candlestickPatterns = this识别CandlestickPatterns(priceData.slice(-5));
      const chartPatterns = this.identifyChartPatterns(priceData);

      const indicators: TechnicalIndicators = {
        sma20,
        sma50,
        sma200,
        ema12,
        ema26,
        rsi,
        macd,
        bollingerBands,
        atr,
        volumeSMA,
        volumeRatio,
        onBalanceVolume,
        pivotPoints,
        candlestickPatterns,
        chartPatterns,
      };

      // Cache result
      this.technicalCache.set(symbol, indicators);

      return indicators;

    } catch (error) {
      tradingLogger.error('Technical indicator calculation failed', {
        symbol,
        error: error instanceof Error ? error.message : error,
      });

      // Return default indicators
      return this.getDefaultTechnicalIndicators();
    }
  }

  /**
   * Analyze market sentiment from multiple sources
   */
  private async analyzeMarketSentiment(symbol: string, marketData: any): Promise<MarketSentiment> {
    try {
      // Fear & Greed Index (would integrate with external API)
      const fearGreedIndex = await this.getFearGreedIndex();

      // News sentiment analysis (would integrate with news API)
      const newsSentiment = await this.analyzeNewsSentiment(symbol);

      // Social media sentiment (would integrate with social APIs)
      const socialSentiment = await this.analyzeSocialSentiment(symbol);

      // Options sentiment (would integrate with options data)
      const optionsSentiment = await this.analyzeOptionsSentiment(symbol);

      // Technical sentiment
      const technicalSentiment = await this.analyzeTechnicalSentiment(symbol);

      // Calculate overall sentiment score
      const overallScore = (
        fearGreedIndex * 0.25 +
        newsSentiment * 0.25 +
        socialSentiment * 0.2 +
        optionsSentiment * 0.15 +
        technicalSentiment * 0.15
      );

      // Determine sentiment category
      let overall: MarketSentiment['overall'];
      if (overallScore < -40) {
        overall = 'EXTREME_FEAR';
      } else if (overallScore < -10) {
        overall = 'FEAR';
      } else if (overallScore < 10) {
        overall = 'NEUTRAL';
      } else if (overallScore < 40) {
        overall = 'GREED';
      } else {
        overall = 'EXTREME_GREED';
      }

      // Analyze trends
      const trends = await this.analyzeSentimentTrends(symbol);

      return {
        overall,
        score: overallScore,
        components: {
          fearGreedIndex,
          newsSentiment,
          socialSentiment,
          optionsSentiment,
          momentumSentiment: technicalSentiment,
        },
        sources: {
          news: [], // Would be populated by news API
          social: [], // Would be populated by social API
          technical: [], // Would be populated by technical analysis
        },
        trends,
      };

    } catch (error) {
      tradingLogger.error('Sentiment analysis failed', {
        symbol,
        error: error instanceof Error ? error.message : error,
      });

      return this.getDefaultSentiment();
    }
  }

  /**
   * Detect current market regime
   */
  private async detectMarketRegime(
    symbol: string,
    technical: TechnicalIndicators,
    sentiment: MarketSentiment
  ): Promise<MarketRegime> {
    try {
      // Analyze trend strength
      const trendStrength = this.analyzeTrendStrength(technical);

      // Analyze volatility
      const volatilityLevel = this.analyzeVolatilityLevel(technical);

      // Detect regime type
      let primary: MarketRegime['primary'];
      let strength: MarketRegime['strength'];

      if (Math.abs(technical.rsi - 50) > 30 && technical.atr > 0.03) {
        primary = 'VOLATILE';
        strength = 'STRONG';
      } else if (trendStrength > 0.7) {
        primary = 'TRENDING';
        strength = trendStrength > 0.85 ? 'STRONG' : 'MODERATE';
      } else if (trendStrength < 0.3) {
        primary = 'RANGING';
        strength = 'MODERATE';
      } else {
        primary = 'REVERSAL';
        strength = 'WEAK';
      }

      // Determine market direction
      let secondary: MarketRegime['secondary'];
      if (technical.sma20 > technical.sma50 && technical.sma50 > technical.sma200) {
        secondary = 'BULL_MARKET';
      } else if (technical.sma20 < technical.sma50 && technical.sma50 < technical.sma200) {
        secondary = 'BEAR_MARKET';
      } else {
        secondary = 'SIDEWAYS';
      }

      // Determine confidence
      const confidence = this.calculateRegimeConfidence(technical, sentiment);

      // Estimate duration
      const expectedDuration = this.estimateRegimeDuration(primary, strength);

      // Identify key drivers
      const keyDrivers = this.identifyRegimeDrivers(technical, sentiment);

      return {
        primary,
        secondary,
        strength,
        volatility: volatilityLevel,
        liquidity: 'NORMAL', // Would analyze actual liquidity
        confidence,
        expectedDuration,
        keyDrivers,
      };

    } catch (error) {
      tradingLogger.error('Regime detection failed', {
        symbol,
        error: error instanceof Error ? error.message : error,
      });

      return this.getDefaultRegime();
    }
  }

  /**
   * Gather intermarket data
   */
  private async gatherIntermarketData(symbol: string, marketData: any): Promise<MarketContext['intermarketData']> {
    try {
      // Calculate correlations (would use actual market data)
      const correlations = {
        SPY: 0.75,
        QQQ: 0.82,
        DXY: -0.45,
        BTC: 0.65,
        ETH: 0.71,
      };

      // Determine market leadership
      const marketLeadership = this.determineMarketLeadership(symbol, correlations);

      // Sector performance (would use actual sector data)
      const sectorPerformance = {
        technology: 2.5,
        healthcare: 1.2,
        finance: 0.8,
        energy: -1.5,
        consumer: 0.3,
      };

      // Index performance
      const indexPerformance = {
        SPY: 1.2,
        QQQ: 2.1,
        DIA: 0.8,
        VIX: -5.3,
      };

      return {
        correlations,
        marketLeadership,
        sectorPerformance,
        indexPerformance,
      };

    } catch (error) {
      tradingLogger.error('Intermarket data gathering failed', {
        symbol,
        error: error instanceof Error ? error.message : error,
      });

      return {
        correlations: {},
        marketLeadership: 'NEUTRAL',
        sectorPerformance: {},
        indexPerformance: {},
      };
    }
  }

  /**
   * Generate trading signals from market context
   */
  private generateTradingSignals(context: MarketContext): ContextEnhancement['tradingSignals'] {
    const signals = {
      entry: [] as string[],
      exit: [] as string[],
      riskManagement: [] as string[],
      opportunities: [] as string[],
      warnings: [] as string[],
    };

    const { technicalIndicators, sentiment, regime } = context;

    // Entry signals
    if (technicalIndicators.rsi < 30 && sentiment.overall === 'EXTREME_FEAR') {
      signals.entry.push('Strong oversold condition with fear sentiment - potential reversal');
    }

    if (technicalIndicators.macd.histogram > 0 && technicalIndicators.ema12 > technicalIndicators.ema26) {
      signals.entry.push('MACD bullish crossover with EMA confirmation');
    }

    if (technicalIndicators.candlestickPatterns.includes('HAMMER')) {
      signals.entry.push('Hammer pattern detected - bullish reversal signal');
    }

    // Exit signals
    if (technicalIndicators.rsi > 70 && sentiment.overall === 'EXTREME_GREED') {
      signals.exit.push('Overbought condition with greed sentiment - take profits');
    }

    if (technicalIndicators.macd.histogram < 0 && technicalIndicators.ema12 < technicalIndicators.ema26) {
      signals.exit.push('MACD bearish crossover - consider exit');
    }

    // Risk management signals
    if (regime.volatility === 'EXTREME') {
      signals.riskManagement.push('Extreme volatility detected - reduce position sizes');
    }

    if (technicalIndicators.atr > technicalIndicators.bollingerBands.bandwidth * 2) {
      signals.riskManagement.push('High volatility - widen stop losses');
    }

    // Opportunities
    if (regime.primary === 'TRENDING' && regime.strength === 'STRONG') {
      signals.opportunities.push('Strong trend regime - trend following strategies favored');
    }

    if (regime.primary === 'RANGING' && technicalIndicators.bollingerBands.bandwidth < 0.02) {
      signals.opportunities.push('Tight ranging market - mean reversion strategies favored');
    }

    // Warnings
    if (sentiment.trends.shortTerm !== sentiment.trends.mediumTerm) {
      signals.warnings.push('Sentiment divergence detected - increased uncertainty');
    }

    if (technicalIndicators.volumeRatio < 0.5) {
      signals.warnings.push('Low volume - potential liquidity risk');
    }

    return signals;
  }

  /**
   * Create AI prompts based on market context
   */
  private createAIPrompts(context: MarketContext): ContextEnhancement['aiPrompts'] {
    const { symbol, technicalIndicators, sentiment, regime } = context;

    return {
      analysis: `Analyze ${symbol} with current price at ${context.price}. Technical indicators show RSI at ${technicalIndicators.rsi.toFixed(2)}, MACD ${technicalIndicators.macd.histogram > 0 ? 'bullish' : 'bearish'}, and the stock is trading ${technicalIndicators.price > technicalIndicators.sma20 ? 'above' : 'below'} its 20-day SMA. Market sentiment is ${sentiment.overall.toLowerCase()} with a score of ${sentiment.score}. Current regime is ${regime.primary.toLowerCase()} ${regime.strength.toLowerCase()} ${regime.secondary.toLowerCase()}.`,

      decision: `Given the ${regime.primary} regime with ${regime.strength} strength and ${sentiment.overall.toLowerCase()} sentiment, determine whether to BUY, SELL, or HOLD ${symbol}. Consider the RSI of ${technicalIndicators.rsi.toFixed(2)}, current trend, and volume patterns. Provide confidence level and detailed reasoning.`,

      risk: `Assess risk factors for ${symbol} in current ${regime.volatility.toLowerCase()} volatility environment. Consider ATR of ${technicalIndicators.atr.toFixed(4)}, support at ${technicalIndicators.pivotPoints.support1.toFixed(2)}, and resistance at ${technicalIndicators.pivotPoints.resistance1.toFixed(2)}. Factor in the ${sentiment.overall.toLowerCase()} market sentiment and potential ${regime.primary.toLowerCase()} regime risks.`,

      strategy: `Recommend optimal trading strategy for ${symbol} given ${regime.primary} market conditions, ${sentiment.overall.toLowerCase()} sentiment, and technical indicators. Suggest appropriate position sizing, stop loss levels, and profit targets based on current volatility and risk factors.`,
    };
  }

  /**
   * Calculate confidence levels for different aspects
   */
  private calculateConfidence(context: MarketContext): ContextEnhancement['confidence'] {
    const { technicalIndicators, sentiment, regime } = context;

    // Technical confidence based on indicator convergence
    const technical = this.calculateTechnicalConfidence(technicalIndicators);

    // Fundamental confidence (would use fundamental data)
    const fundamental = 0.7; // Placeholder

    // Sentiment confidence based on consensus
    const sentimentConfidence = Math.abs(sentiment.score) / 50; // Normalize to 0-1

    // Overall confidence
    const overall = (technical * 0.4 + fundamental * 0.2 + sentimentConfidence * 0.2 + regime.confidence * 0.2);

    return {
      technical,
      fundamental,
      sentiment: sentimentConfidence,
      overall: Math.min(1, Math.max(0, overall)),
    };
  }

  /**
   * Generate trading recommendations
   */
  private generateRecommendations(
    context: MarketContext,
    confidence: ContextEnhancement['confidence']
  ): ContextEnhancement['recommendations'] {
    const { technicalIndicators, sentiment, regime } = context;
    const reasoning: string[] = [];

    let action: ContextEnhancement['recommendations']['action'] = 'HOLD';
    let positionSize = 0.5; // Default 50% of normal

    // Determine action based on multiple factors
    const bullishSignals = [
      technicalIndicators.rsi < 30,
      technicalIndicators.macd.histogram > 0,
      technicalIndicators.ema12 > technicalIndicators.ema26,
      sentiment.overall === 'FEAR' || sentiment.overall === 'EXTREME_FEAR',
    ].filter(Boolean).length;

    const bearishSignals = [
      technicalIndicators.rsi > 70,
      technicalIndicators.macd.histogram < 0,
      technicalIndicators.ema12 < technicalIndicators.ema26,
      sentiment.overall === 'GREED' || sentiment.overall === 'EXTREME_GREED',
    ].filter(Boolean).length;

    if (bullishSignals >= 3 && confidence.overall > 0.6) {
      action = bullishSignals >= 4 ? 'STRONG_BUY' : 'BUY';
      reasoning.push('Multiple bullish signals with good confidence');
    } else if (bearishSignals >= 3 && confidence.overall > 0.6) {
      action = bearishSignals >= 4 ? 'STRONG_SELL' : 'SELL';
      reasoning.push('Multiple bearish signals with good confidence');
    } else {
      reasoning.push('Mixed or insufficient signals - HOLD recommended');
    }

    // Adjust position size based on volatility and confidence
    if (regime.volatility === 'EXTREME') {
      positionSize *= 0.5;
      reasoning.push('Reduced position size due to extreme volatility');
    }

    if (confidence.overall < 0.5) {
      positionSize *= 0.7;
      reasoning.push('Reduced position size due to low confidence');
    }

    // Determine timeframe
    let timeframe: ContextEnhancement['recommendations']['timeframe'] = 'DAY';
    if (regime.primary === 'TRENDING' && regime.strength === 'STRONG') {
      timeframe = 'SWING';
      reasoning.push('Extended timeframe for strong trend regime');
    } else if (regime.volatility === 'HIGH' || regime.volatility === 'EXTREME') {
      timeframe = 'SCALP';
      reasoning.push('Shorter timeframe due to high volatility');
    }

    return {
      action,
      positionSize,
      timeframe,
      reasoning,
    };
  }

  // Technical indicator calculation methods
  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const slice = prices.slice(-period);
    return slice.reduce((sum, price) => sum + price, 0) / period;
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length === 0) return 0;
    if (prices.length === 1) return prices[0];

    const multiplier = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }

    return ema;
  }

  private calculateRSI(prices: number[], period: number): number {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / avgLoss;

    return 100 - (100 / (1 + rs));
  }

  private calculateMACD(prices: number[], fast: number, slow: number, signal: number): TechnicalIndicators['macd'] {
    const emaFast = this.calculateEMA(prices, fast);
    const emaSlow = this.calculateEMA(prices, slow);
    const macd = emaFast - emaSlow;

    // Calculate signal line (simplified)
    const signalLine = macd * 0.9; // Placeholder
    const histogram = macd - signalLine;

    return {
      macd,
      signal: signalLine,
      histogram,
    };
  }

  private calculateBollingerBands(prices: number[], period: number, stdDev: number): TechnicalIndicators['bollingerBands'] {
    if (prices.length < period) {
      const price = prices[prices.length - 1] || 0;
      return {
        upper: price * 1.02,
        middle: price,
        lower: price * 0.98,
        bandwidth: 0.02,
      };
    }

    const slice = prices.slice(-period);
    const middle = slice.reduce((sum, price) => sum + price, 0) / period;

    const variance = slice.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);

    return {
      upper: middle + (standardDeviation * stdDev),
      middle,
      lower: middle - (standardDeviation * stdDev),
      bandwidth: (2 * standardDeviation * stdDev) / middle,
    };
  }

  private calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
    if (highs.length < period + 1) return 0.02; // Default 2%

    let trueRanges = 0;

    for (let i = 1; i <= period; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      trueRanges += tr;
    }

    return trueRanges / period;
  }

  private calculateOBV(prices: number[], volumes: number[]): number {
    if (prices.length !== volumes.length || prices.length < 2) return 0;

    let obv = 0;

    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) {
        obv += volumes[i];
      } else if (prices[i] < prices[i - 1]) {
        obv -= volumes[i];
      }
      // No change in OBV if price is the same
    }

    return obv;
  }

  private calculatePivotPoints(high: number, low: number, close: number): TechnicalIndicators['pivotPoints'] {
    const pivot = (high + low + close) / 3;

    return {
      support1: (2 * pivot) - high,
      support2: pivot - (high - low),
      resistance1: (2 * pivot) - low,
      resistance2: pivot + (high - low),
    };
  }

  // Placeholder methods for external data integration
  private async getFearGreedIndex(): Promise<number> {
    // Would integrate with CNN Fear & Greed API
    return Math.random() * 100 - 50; // Random between -50 and 50
  }

  private async analyzeNewsSentiment(symbol: string): Promise<number> {
    // Would integrate with news API
    return Math.random() * 100 - 50;
  }

  private async analyzeSocialSentiment(symbol: string): Promise<number> {
    // Would integrate with social media APIs
    return Math.random() * 100 - 50;
  }

  private async analyzeOptionsSentiment(symbol: string): Promise<number> {
    // Would integrate with options data providers
    return Math.random() * 100 - 50;
  }

  private async analyzeTechnicalSentiment(symbol: string): Promise<number> {
    // Analyze technical indicators for sentiment
    return Math.random() * 100 - 50;
  }

  private async analyzeSentimentTrends(symbol: string): Promise<MarketSentiment['trends']> {
    return {
      shortTerm: 'NEUTRAL',
      mediumTerm: 'NEUTRAL',
      longTerm: 'NEUTRAL',
    };
  }

  private getTimeContext(): MarketContext['timeContext'] {
    const now = new Date();
    const hour = now.getHours();

    let session: MarketContext['timeContext']['session'];
    if (hour >= 21 || hour < 2) {
      session = 'ASIA';
    } else if (hour >= 2 && hour < 8) {
      session = 'EUROPE';
    } else if (hour >= 8 && hour < 17) {
      session = 'AMERICAS';
    } else {
      session = 'WEEKEND';
    }

    return {
      session,
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
      hourOfDay: hour,
      isHoliday: false, // Would check holiday calendar
      isEarningsSeason: false, // Would check earnings calendar
      marketOpen: hour >= 9 && hour < 16 && now.getDay() !== 0 && now.getDay() !== 6,
    };
  }

  private async identifyRiskFactors(symbol: string, marketData: any): Promise<MarketContext['riskFactors']> {
    return {
      geopolitical: [],
      economic: [],
      regulatory: [],
      technical: [],
    };
  }

  // Helper methods
  private analyzeTrendStrength(technical: TechnicalIndicators): number {
    // Calculate trend strength based on multiple indicators
    return 0.6; // Placeholder
  }

  private analyzeVolatilityLevel(technical: TechnicalIndicators): MarketRegime['volatility'] {
    if (technical.atr > 0.05) return 'EXTREME';
    if (technical.atr > 0.03) return 'HIGH';
    if (technical.atr > 0.015) return 'NORMAL';
    return 'LOW';
  }

  private calculateRegimeConfidence(technical: TechnicalIndicators, sentiment: MarketSentiment): number {
    return 0.7; // Placeholder
  }

  private estimateRegimeDuration(primary: MarketRegime['primary'], strength: MarketRegime['strength']): number {
    if (strength === 'STRONG') return 48; // 48 hours
    if (strength === 'MODERATE') return 24; // 24 hours
    return 12; // 12 hours
  }

  private identifyRegimeDrivers(technical: TechnicalIndicators, sentiment: MarketSentiment): string[] {
    return ['Technical indicators', 'Market sentiment']; // Placeholder
  }

  private determineMarketLeadership(symbol: string, correlations: Record<string, number>): MarketContext['intermarketData']['marketLeadership'] {
    const avgCorrelation = Object.values(correlations).reduce((sum, corr) => sum + Math.abs(corr), 0) / Object.keys(correlations).length;

    if (avgCorrelation > 0.7) return 'LEADER';
    if (avgCorrelation > 0.3) return 'NEUTRAL';
    return 'LAGGER';
  }

  private calculateTechnicalConfidence(technical: TechnicalIndicators): number {
    // Calculate confidence based on indicator convergence
    return 0.65; // Placeholder
  }

  private identifyCandlestickPatterns(data: any[]): string[] {
    // Implement candlestick pattern recognition
    return ['DOJI']; // Placeholder
  }

  private identifyChartPatterns(data: any[]): string[] {
    // Implement chart pattern recognition
    return []; // Placeholder
  }

  private createFallbackContext(symbol: string, priceData: any[], marketData: any): ContextEnhancement {
    const defaultTechnical = this.getDefaultTechnicalIndicators();
    const defaultSentiment = this.getDefaultSentiment();
    const defaultRegime = this.getDefaultRegime();

    return {
      marketContext: {
        symbol,
        timestamp: Date.now(),
        price: priceData[priceData.length - 1]?.close || 0,
        volume: priceData[priceData.length - 1]?.volume || 0,
        technicalIndicators: defaultTechnical,
        sentiment: defaultSentiment,
        regime: defaultRegime,
        intermarketData: { correlations: {}, marketLeadership: 'NEUTRAL', sectorPerformance: {}, indexPerformance: {} },
        timeContext: this.getTimeContext(),
        riskFactors: { geopolitical: [], economic: [], regulatory: [], technical: [] },
      },
      tradingSignals: {
        entry: ['Using fallback analysis - limited signals available'],
        exit: [],
        riskManagement: ['Increased caution due to fallback mode'],
        opportunities: [],
        warnings: ['Fallback analysis mode active'],
      },
      aiPrompts: {
        analysis: `Fallback analysis for ${symbol} - limited market context available`,
        decision: `Make conservative decision for ${symbol} due to limited analysis capabilities`,
        risk: `Exercise heightened risk management for ${symbol} in fallback mode`,
        strategy: `Adopt conservative trading approach for ${symbol}`,
      },
      confidence: {
        technical: 0.3,
        fundamental: 0.3,
        sentiment: 0.3,
        overall: 0.3,
      },
      recommendations: {
        action: 'HOLD',
        positionSize: 0.25,
        timeframe: 'DAY',
        reasoning: ['Fallback mode - conservative approach recommended'],
      },
    };
  }

  private getDefaultTechnicalIndicators(): TechnicalIndicators {
    return {
      sma20: 0,
      sma50: 0,
      sma200: 0,
      ema12: 0,
      ema26: 0,
      rsi: 50,
      macd: { macd: 0, signal: 0, histogram: 0 },
      bollingerBands: { upper: 0, middle: 0, lower: 0, bandwidth: 0 },
      atr: 0.02,
      volumeSMA: 0,
      volumeRatio: 1,
      onBalanceVolume: 0,
      pivotPoints: { support1: 0, support2: 0, resistance1: 0, resistance2: 0 },
      candlestickPatterns: [],
      chartPatterns: [],
    };
  }

  private getDefaultSentiment(): MarketSentiment {
    return {
      overall: 'NEUTRAL',
      score: 0,
      components: {
        fearGreedIndex: 0,
        newsSentiment: 0,
        socialSentiment: 0,
        optionsSentiment: 0,
        momentumSentiment: 0,
      },
      sources: {
        news: [],
        social: [],
        technical: [],
      },
      trends: {
        shortTerm: 'NEUTRAL',
        mediumTerm: 'NEUTRAL',
        longTerm: 'NEUTRAL',
      },
    };
  }

  private getDefaultRegime(): MarketRegime {
    return {
      primary: 'RANGING',
      secondary: 'SIDEWAYS',
      strength: 'MODERATE',
      volatility: 'NORMAL',
      liquidity: 'NORMAL',
      confidence: 0.5,
      expectedDuration: 24,
      keyDrivers: ['Default analysis'],
    };
  }

  /**
   * Get analytics for market context service
   */
  getAnalytics(): {
    cacheSizes: {
      technical: number;
      sentiment: number;
      regime: number;
      context: number;
    };
    lastGenerated?: string;
  } {
    return {
      cacheSizes: {
        technical: this.technicalCache.size,
        sentiment: this.sentimentCache.size,
        regime: this.regimeCache.size,
        context: this.contextCache.size,
      },
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.technicalCache.clear();
    this.sentimentCache.clear();
    this.regimeCache.clear();
    this.contextCache.clear();
    tradingLogger.info('Market context caches cleared');
  }
}

export default MarketContextService;