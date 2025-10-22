/**
 * Multi-Timeframe Risk Assessment Service
 *
 * Provides comprehensive risk analysis across different timeframes
 * (intraday, daily, weekly, monthly) with integrated risk scoring.
 */

export interface TimeframeRiskData {
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W' | '1M';
  volatility: number;
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  momentum: number;
  support: number;
  resistance: number;
  volume: number;
  priceChange: number;
  riskScore: number;
}

export interface MultiTimeframeRiskAssessment {
  symbol: string;
  currentPrice: number;
  overallRiskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  timeframeData: TimeframeRiskData[];
  consensusSignal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  keyRiskFactors: string[];
  recommendations: string[];
  stopLossLevels: {
    tight: number;
    moderate: number;
    wide: number;
  };
  positionSizeLimits: {
    conservative: number;
    moderate: number;
    aggressive: number;
  };
}

export interface RiskThresholds {
  volatility: {
    low: number;
    medium: number;
    high: number;
  };
  riskScore: {
    low: number;
    medium: number;
    high: number;
    extreme: number;
  };
  momentum: {
    strong: number;
    moderate: number;
    weak: number;
  };
}

export class MultiTimeframeRiskService {
  private readonly defaultThresholds: RiskThresholds = {
    volatility: {
      low: 0.15,
      medium: 0.25,
      high: 0.35
    },
    riskScore: {
      low: 30,
      medium: 50,
      high: 70,
      extreme: 85
    },
    momentum: {
      strong: 0.7,
      moderate: 0.4,
      weak: 0.2
    }
  };

  constructor(private thresholds: RiskThresholds = this.defaultThresholds) {}

  /**
   * Perform comprehensive multi-timeframe risk assessment
   */
  async assessMultiTimeframeRisk(
    symbol: string,
    currentPrice: number,
    marketData: { [timeframe: string]: any[] }
  ): Promise<MultiTimeframeRiskAssessment> {
    const timeframes: Array<'1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W' | '1M'> = [
      '1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'
    ];

    const timeframeData: TimeframeRiskData[] = [];

    // Analyze each timeframe
    for (const timeframe of timeframes) {
      const data = marketData[timeframe];
      if (data && data.length > 0) {
        const analysis = await this.analyzeTimeframe(symbol, timeframe, data, currentPrice);
        timeframeData.push(analysis);
      }
    }

    // Calculate overall risk assessment
    const overallRiskScore = this.calculateOverallRiskScore(timeframeData);
    const riskLevel = this.determineRiskLevel(overallRiskScore);
    const consensusSignal = this.calculateConsensusSignal(timeframeData);
    const confidence = this.calculateConfidence(timeframeData, consensusSignal);
    const keyRiskFactors = this.identifyKeyRiskFactors(timeframeData);
    const recommendations = this.generateRecommendations(riskLevel, consensusSignal, keyRiskFactors);
    const stopLossLevels = this.calculateStopLossLevels(currentPrice, timeframeData, riskLevel);
    const positionSizeLimits = this.calculatePositionSizeLimits(riskLevel, timeframeData);

    return {
      symbol,
      currentPrice,
      overallRiskScore,
      riskLevel,
      timeframeData,
      consensusSignal,
      confidence,
      keyRiskFactors,
      recommendations,
      stopLossLevels,
      positionSizeLimits
    };
  }

  /**
   * Analyze a specific timeframe
   */
  private async analyzeTimeframe(
    symbol: string,
    timeframe: string,
    data: any[],
    currentPrice: number
  ): Promise<TimeframeRiskData> {
    // Calculate technical indicators
    const volatility = this.calculateVolatility(data);
    const trend = this.determineTrend(data);
    const momentum = this.calculateMomentum(data);
    const support = this.findSupportLevel(data);
    const resistance = this.findResistanceLevel(data);
    const volume = this.calculateVolumeProfile(data);
    const priceChange = this.calculatePriceChange(data, currentPrice);
    const riskScore = this.calculateTimeframeRiskScore(
      volatility, trend, momentum, support, resistance, currentPrice
    );

    return {
      timeframe: timeframe as any,
      volatility,
      trend,
      momentum,
      support,
      resistance,
      volume,
      priceChange,
      riskScore
    };
  }

  /**
   * Calculate volatility for timeframe data
   */
  private calculateVolatility(data: any[]): number {
    if (data.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < Math.min(data.length, 20); i++) {
      const ret = (data[i].close - data[i - 1].close) / data[i - 1].close;
      returns.push(ret);
    }

    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;

    return Math.sqrt(variance * 252); // Annualized volatility
  }

  /**
   * Determine trend direction
   */
  private determineTrend(data: any[]): 'BULLISH' | 'BEARISH' | 'SIDEWAYS' {
    if (data.length < 10) return 'SIDEWAYS';

    const recentData = data.slice(-20);
    const prices = recentData.map(d => d.close);

    // Simple moving averages
    const shortMA = this.calculateSMA(prices, 5);
    const longMA = this.calculateSMA(prices, 20);

    // Linear regression slope
    const slope = this.calculateLinearRegressionSlope(prices);

    // Determine trend
    if (shortMA > longMA * 1.02 && slope > 0.001) {
      return 'BULLISH';
    } else if (shortMA < longMA * 0.98 && slope < -0.001) {
      return 'BEARISH';
    } else {
      return 'SIDEWAYS';
    }
  }

  /**
   * Calculate momentum indicator
   */
  private calculateMomentum(data: any[]): number {
    if (data.length < 14) return 0;

    const prices = data.slice(-14).map(d => d.close);

    // RSI calculation
    const rsi = this.calculateRSI(prices);

    // Rate of change
    const roc = (prices[prices.length - 1] - prices[0]) / prices[0];

    // Combine indicators for momentum score
    const momentumScore = (rsi / 100 + roc) / 2;

    return Math.max(-1, Math.min(1, momentumScore));
  }

  /**
   * Find support level
   */
  private findSupportLevel(data: any[]): number {
    if (data.length < 10) return 0;

    const recentData = data.slice(-50);
    const lows = recentData.map(d => d.low);

    // Find recent swing lows
    const swingLows: number[] = [];
    for (let i = 2; i < lows.length - 2; i++) {
      if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
          lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
        swingLows.push(lows[i]);
      }
    }

    if (swingLows.length === 0) return Math.min(...lows);

    // Return the highest recent support (most relevant)
    return Math.max(...swingLows.slice(-3));
  }

  /**
   * Find resistance level
   */
  private findResistanceLevel(data: any[]): number {
    if (data.length < 10) return 0;

    const recentData = data.slice(-50);
    const highs = recentData.map(d => d.high);

    // Find recent swing highs
    const swingHighs: number[] = [];
    for (let i = 2; i < highs.length - 2; i++) {
      if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
          highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
        swingHighs.push(highs[i]);
      }
    }

    if (swingHighs.length === 0) return Math.max(...highs);

    // Return the lowest recent resistance (most relevant)
    return Math.min(...swingHighs.slice(-3));
  }

  /**
   * Calculate volume profile
   */
  private calculateVolumeProfile(data: any[]): number {
    if (data.length < 10) return 0;

    const recentData = data.slice(-20);
    const volumes = recentData.map(d => d.volume);
    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;

    // Current volume relative to average
    const currentVolume = recentData[recentData.length - 1].volume;
    return currentVolume / avgVolume;
  }

  /**
   * Calculate price change
   */
  private calculatePriceChange(data: any[], currentPrice: number): number {
    if (data.length === 0) return 0;

    const firstPrice = data[0].close;
    return (currentPrice - firstPrice) / firstPrice;
  }

  /**
   * Calculate risk score for a specific timeframe
   */
  private calculateTimeframeRiskScore(
    volatility: number,
    trend: string,
    momentum: number,
    support: number,
    resistance: number,
    currentPrice: number
  ): number {
    let riskScore = 50; // Base score

    // Volatility component (0-30 points)
    if (volatility > this.thresholds.volatility.high) {
      riskScore += 30;
    } else if (volatility > this.thresholds.volatility.medium) {
      riskScore += 20;
    } else if (volatility > this.thresholds.volatility.low) {
      riskScore += 10;
    }

    // Trend component (0-20 points)
    if (trend === 'BEARISH') {
      riskScore += 20;
    } else if (trend === 'SIDEWAYS') {
      riskScore += 10;
    }

    // Momentum component (0-15 points)
    if (momentum < -this.thresholds.momentum.strong) {
      riskScore += 15;
    } else if (momentum < -this.thresholds.momentum.moderate) {
      riskScore += 10;
    } else if (momentum < -this.thresholds.momentum.weak) {
      riskScore += 5;
    }

    // Support/Resistance proximity component (0-15 points)
    if (support > 0 && resistance > 0) {
      const supportDistance = (currentPrice - support) / currentPrice;
      const resistanceDistance = (resistance - currentPrice) / currentPrice;
      const minDistance = Math.min(supportDistance, resistanceDistance);

      if (minDistance < 0.02) { // Within 2% of support/resistance
        riskScore += 15;
      } else if (minDistance < 0.05) { // Within 5%
        riskScore += 10;
      } else if (minDistance < 0.10) { // Within 10%
        riskScore += 5;
      }
    }

    return Math.min(100, Math.max(0, riskScore));
  }

  /**
   * Calculate overall risk score across all timeframes
   */
  private calculateOverallRiskScore(timeframeData: TimeframeRiskData[]): number {
    if (timeframeData.length === 0) return 50;

    // Weight timeframes differently (longer timeframes have more weight)
    const weights: { [key: string]: number } = {
      '1m': 0.05, '5m': 0.05, '15m': 0.05, '1h': 0.1,
      '4h': 0.15, '1D': 0.25, '1W': 0.25, '1M': 0.1
    };

    let weightedScore = 0;
    let totalWeight = 0;

    for (const data of timeframeData) {
      const weight = weights[data.timeframe] || 0.1;
      weightedScore += data.riskScore * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedScore / totalWeight : 50;
  }

  /**
   * Determine risk level from score
   */
  private determineRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' {
    if (score >= this.thresholds.riskScore.extreme) {
      return 'EXTREME';
    } else if (score >= this.thresholds.riskScore.high) {
      return 'HIGH';
    } else if (score >= this.thresholds.riskScore.medium) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * Calculate consensus signal across timeframes
   */
  private calculateConsensusSignal(timeframeData: TimeframeRiskData[]): 'BUY' | 'SELL' | 'HOLD' {
    if (timeframeData.length === 0) return 'HOLD';

    let bullishCount = 0;
    let bearishCount = 0;
    let sidewaysCount = 0;

    // Weight longer timeframes more heavily
    const weights: { [key: string]: number } = {
      '1m': 1, '5m': 1, '15m': 1, '1h': 2,
      '4h': 3, '1D': 5, '1W': 5, '1M': 3
    };

    for (const data of timeframeData) {
      const weight = weights[data.timeframe] || 1;

      // Signal based on trend and momentum
      if (data.trend === 'BULLISH' && data.momentum > 0) {
        bullishCount += weight;
      } else if (data.trend === 'BEARISH' && data.momentum < 0) {
        bearishCount += weight;
      } else {
        sidewaysCount += weight;
      }
    }

    if (bullishCount > bearishCount && bullishCount > sidewaysCount) {
      return 'BUY';
    } else if (bearishCount > bullishCount && bearishCount > sidewaysCount) {
      return 'SELL';
    } else {
      return 'HOLD';
    }
  }

  /**
   * Calculate confidence in consensus signal
   */
  private calculateConfidence(
    timeframeData: TimeframeRiskData[],
    consensusSignal: string
  ): number {
    if (timeframeData.length === 0) return 0;

    // Check alignment across timeframes
    let alignedCount = 0;
    for (const data of timeframeData) {
      if (consensusSignal === 'BUY' && data.trend === 'BULLISH') {
        alignedCount++;
      } else if (consensusSignal === 'SELL' && data.trend === 'BEARISH') {
        alignedCount++;
      } else if (consensusSignal === 'HOLD' && data.trend === 'SIDEWAYS') {
        alignedCount++;
      }
    }

    return (alignedCount / timeframeData.length) * 100;
  }

  /**
   * Identify key risk factors
   */
  private identifyKeyRiskFactors(timeframeData: TimeframeRiskData[]): string[] {
    const factors: string[] = [];

    // Check for high volatility across timeframes
    const highVolatilityTimeframes = timeframeData.filter(d =>
      d.volatility > this.thresholds.volatility.high
    );
    if (highVolatilityTimeframes.length > timeframeData.length / 2) {
      factors.push('High volatility across multiple timeframes');
    }

    // Check for trend divergence
    const bullishCount = timeframeData.filter(d => d.trend === 'BULLISH').length;
    const bearishCount = timeframeData.filter(d => d.trend === 'BEARISH').length;
    if (bullishCount > 0 && bearishCount > 0) {
      factors.push('Trend divergence between timeframes');
    }

    // Check for negative momentum
    const negativeMomentumCount = timeframeData.filter(d => d.momentum < -0.3).length;
    if (negativeMomentumCount > timeframeData.length / 2) {
      factors.push('Negative momentum across multiple timeframes');
    }

    // Check for support/resistance breaches
    const nearSupportResistance = timeframeData.filter(d => {
      if (d.support === 0 || d.resistance === 0) return false;
      const supportDistance = Math.abs(d.priceChange) < 0.05;
      return supportDistance;
    }).length;

    if (nearSupportResistance > 0) {
      factors.push('Price near key support/resistance levels');
    }

    return factors;
  }

  /**
   * Generate recommendations based on risk assessment
   */
  private generateRecommendations(
    riskLevel: string,
    consensusSignal: string,
    keyRiskFactors: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'EXTREME') {
      recommendations.push('Consider avoiding new positions due to extreme risk');
      recommendations.push('Use wider stop-losses if trading is necessary');
    } else if (riskLevel === 'HIGH') {
      recommendations.push('Reduce position sizes due to high risk');
      recommendations.push('Use tighter risk management');
    } else if (riskLevel === 'MEDIUM') {
      recommendations.push('Normal position sizes with standard risk management');
    } else {
      recommendations.push('Favorable risk conditions for position taking');
    }

    if (consensusSignal === 'BUY' && riskLevel !== 'EXTREME') {
      recommendations.push('Consider long positions on pullbacks');
    } else if (consensusSignal === 'SELL' && riskLevel !== 'EXTREME') {
      recommendations.push('Consider short positions on rallies');
    } else if (consensusSignal === 'HOLD') {
      recommendations.push('Wait for clearer signals before taking positions');
    }

    // Add specific recommendations based on risk factors
    keyRiskFactors.forEach(factor => {
      if (factor.includes('volatility')) {
        recommendations.push('Be prepared for rapid price movements');
      } else if (factor.includes('divergence')) {
        recommendations.push('Wait for trend confirmation across timeframes');
      } else if (factor.includes('momentum')) {
        recommendations.push('Monitor for potential trend reversals');
      } else if (factor.includes('support/resistance')) {
        recommendations.push('Watch for breakouts or reversals at key levels');
      }
    });

    return recommendations;
  }

  /**
   * Calculate stop-loss levels
   */
  private calculateStopLossLevels(
    currentPrice: number,
    timeframeData: TimeframeRiskData[],
    riskLevel: string
  ): { tight: number; moderate: number; wide: number } {
    // Find the most relevant support level from longer timeframes
    const longTermData = timeframeData.filter(d => ['1D', '1W', '1M'].includes(d.timeframe));
    const supportLevel = longTermData.length > 0 ?
      Math.max(...longTermData.map(d => d.support)) : currentPrice * 0.95;

    // Calculate volatility-based stops
    const avgVolatility = timeframeData.reduce((sum, d) => sum + d.volatility, 0) / timeframeData.length;

    let tightStop: number, moderateStop: number, wideStop: number;

    if (riskLevel === 'EXTREME') {
      tightStop = supportLevel;
      moderateStop = supportLevel * 0.98;
      wideStop = supportLevel * 0.95;
    } else if (riskLevel === 'HIGH') {
      tightStop = Math.min(currentPrice * 0.97, supportLevel);
      moderateStop = Math.min(currentPrice * 0.95, supportLevel * 0.98);
      wideStop = Math.min(currentPrice * 0.92, supportLevel * 0.95);
    } else {
      // Use ATR-like calculation based on volatility
      const atrMultiplier = avgVolatility * 2;
      tightStop = currentPrice * (1 - atrMultiplier * 0.5);
      moderateStop = currentPrice * (1 - atrMultiplier);
      wideStop = currentPrice * (1 - atrMultiplier * 1.5);
    }

    return {
      tight: Math.max(tightStop, supportLevel),
      moderate: Math.max(moderateStop, supportLevel * 0.98),
      wide: Math.max(wideStop, supportLevel * 0.95)
    };
  }

  /**
   * Calculate position size limits
   */
  private calculatePositionSizeLimits(
    riskLevel: string,
    timeframeData: TimeframeRiskData[]
  ): { conservative: number; moderate: number; aggressive: number } {
    let baseSize = 100; // Base position size in percentage

    // Adjust based on risk level
    if (riskLevel === 'EXTREME') {
      baseSize *= 0.1;
    } else if (riskLevel === 'HIGH') {
      baseSize *= 0.3;
    } else if (riskLevel === 'MEDIUM') {
      baseSize *= 0.6;
    }

    // Adjust based on consensus alignment
    const consensusStrength = timeframeData.filter(d =>
      (d.trend === 'BULLISH' && d.momentum > 0) ||
      (d.trend === 'BEARISH' && d.momentum < 0)
    ).length / timeframeData.length;

    const consensusMultiplier = 0.5 + (consensusStrength * 0.5);

    return {
      conservative: baseSize * 0.5 * consensusMultiplier,
      moderate: baseSize * 0.75 * consensusMultiplier,
      aggressive: baseSize * consensusMultiplier
    };
  }

  // Helper methods for technical calculations
  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    const relevantPrices = prices.slice(-period);
    return relevantPrices.reduce((sum, price) => sum + price, 0) / period;
  }

  private calculateLinearRegressionSlope(prices: number[]): number {
    if (prices.length < 2) return 0;

    const n = prices.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = prices;

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  private calculateRSI(prices: number[]): number {
    if (prices.length < 14) return 50;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
    const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / losses.length;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
}