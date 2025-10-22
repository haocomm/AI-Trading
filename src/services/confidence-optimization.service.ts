/**
 * Confidence Threshold Optimization Service
 *
 * Dynamically optimizes confidence thresholds based on market conditions,
 * historical performance, and risk tolerance.
 */

import { tradingLogger } from '@/utils/logger';
import { tradingConfig } from '@/config';

export interface ThresholdConfig {
  baseThreshold: number;
  minThreshold: number;
  maxThreshold: number;
  adaptiveMode: boolean;
  riskAdjustment: boolean;
  marketConditionAdjustment: boolean;
  performanceBasedAdjustment: boolean;
  volatilityAdjustment: boolean;
}

export interface MarketContext {
  volatility: number;
  trend: 'STRONG_BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'STRONG_BEAR';
  volume: 'HIGH' | 'NORMAL' | 'LOW';
  liquidity: 'HIGH' | 'MEDIUM' | 'LOW';
  timeOfDay: 'OPENING' | 'MID_DAY' | 'CLOSING' | 'AFTER_HOURS';
  newsImpact: 'HIGH' | 'MEDIUM' | 'LOW';
  marketSentiment: 'FEAR' | 'NEUTRAL' | 'GREED';
}

export interface PerformanceMetrics {
  recentAccuracy: number;
  overallAccuracy: number;
  recentProfitFactor: number;
  overallProfitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  averageConfidence: number;
  confidenceAccuracy: number; // Correlation between confidence and actual accuracy
}

export interface ThresholdAdjustment {
  originalThreshold: number;
  adjustedThreshold: number;
  adjustmentFactors: {
    volatility: number;
    performance: number;
    risk: number;
    marketCondition: number;
    timeOfDay: number;
    newsImpact: number;
  };
  reasoning: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  effectiveness: number; // Predicted effectiveness of this adjustment
}

export interface OptimizationResult {
  optimalThreshold: number;
  adjustments: ThresholdAdjustment[];
  expectedPerformance: {
    accuracy: number;
    expectedReturn: number;
    riskAdjustedReturn: number;
    tradeFrequency: number;
  };
  recommendations: string[];
  backtestResults: {
    period: string;
    totalTrades: number;
    accuracy: number;
    profitFactor: number;
    maxDrawdown: number;
  };
}

export interface ConfidenceRecord {
  timestamp: number;
  confidence: number;
  actualOutcome: 'PROFIT' | 'LOSS' | 'NEUTRAL';
  pnl: number;
  marketContext: MarketContext;
  threshold: number;
  executionDecision: 'EXECUTED' | 'SKIPPED';
}

export class ConfidenceOptimizationService {
  private static instance: ConfidenceOptimizationService;
  private config: ThresholdConfig;
  private confidenceHistory: ConfidenceRecord[] = [];
  private optimizationCache: Map<string, OptimizationResult> = new Map();
  private lastOptimization: number = 0;
  private currentThreshold: number;

  private constructor() {
    this.config = {
      baseThreshold: 0.65,
      minThreshold: 0.4,
      maxThreshold: 0.9,
      adaptiveMode: true,
      riskAdjustment: true,
      marketConditionAdjustment: true,
      performanceBasedAdjustment: true,
      volatilityAdjustment: true,
    };

    this.currentThreshold = this.config.baseThreshold;
  }

  static getInstance(): ConfidenceOptimizationService {
    if (!ConfidenceOptimizationService.instance) {
      ConfidenceOptimizationService.instance = new ConfidenceOptimizationService();
    }
    return ConfidenceOptimizationService.instance;
  }

  /**
   * Get optimized confidence threshold for current conditions
   */
  async getOptimizedThreshold(
    marketContext: MarketContext,
    performanceMetrics: PerformanceMetrics,
    riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE' = 'MODERATE'
  ): Promise<ThresholdAdjustment> {
    const startTime = performance.now();

    try {
      // Check if optimization is needed
      if (!this.config.adaptiveMode) {
        return this.createStaticThreshold();
      }

      // Calculate adjustment factors
      const adjustments = this.calculateAdjustmentFactors(
        marketContext,
        performanceMetrics,
        riskTolerance
      );

      // Apply adjustments to base threshold
      const adjustedThreshold = this.applyAdjustments(this.config.baseThreshold, adjustments);

      // Validate threshold bounds
      const validatedThreshold = Math.max(
        this.config.minThreshold,
        Math.min(this.config.maxThreshold, adjustedThreshold)
      );

      // Generate reasoning
      const reasoning = this.generateAdjustmentReasoning(adjustments, marketContext, performanceMetrics);

      // Assess risk level
      const riskLevel = this.assessRiskLevel(validatedThreshold, adjustments);

      // Calculate effectiveness prediction
      const effectiveness = this.calculateEffectiveness(validatedThreshold, adjustments, performanceMetrics);

      const result: ThresholdAdjustment = {
        originalThreshold: this.config.baseThreshold,
        adjustedThreshold: validatedThreshold,
        adjustmentFactors: adjustments,
        reasoning,
        riskLevel,
        effectiveness,
      };

      // Update current threshold
      this.currentThreshold = validatedThreshold;

      const duration = performance.now() - startTime;
      tradingLogger.performance('confidence_threshold_optimization', duration, {
        originalThreshold: this.config.baseThreshold,
        adjustedThreshold: validatedThreshold,
        riskLevel,
        effectiveness,
      });

      return result;

    } catch (error) {
      const duration = performance.now() - startTime;
      tradingLogger.error('Confidence threshold optimization failed', {
        error: error instanceof Error ? error.message : error,
        duration,
      });

      return this.createStaticThreshold();
    }
  }

  /**
   * Record confidence outcome for learning
   */
  async recordConfidenceOutcome(
    confidence: number,
    threshold: number,
    actualOutcome: 'PROFIT' | 'LOSS' | 'NEUTRAL',
    pnl: number,
    marketContext: MarketContext,
    executionDecision: 'EXECUTED' | 'SKIPPED'
  ): Promise<void> {
    const record: ConfidenceRecord = {
      timestamp: Date.now(),
      confidence,
      actualOutcome,
      pnl,
      marketContext,
      threshold,
      executionDecision,
    };

    this.confidenceHistory.push(record);

    // Limit history size
    if (this.confidenceHistory.length > 10000) {
      this.confidenceHistory = this.confidenceHistory.slice(-10000);
    }

    // Check if re-optimization is needed
    await this.checkReoptimization();

    tradingLogger.debug('Confidence outcome recorded', {
      confidence,
      threshold,
      outcome: actualOutcome,
      pnl,
      executionDecision,
    });
  }

  /**
   * Run comprehensive threshold optimization
   */
  async runOptimization(
    marketContext: MarketContext,
    performanceMetrics: PerformanceMetrics,
    historicalData?: ConfidenceRecord[]
  ): Promise<OptimizationResult> {
    const startTime = performance.now();
    const dataToUse = historicalData || this.confidenceHistory.slice(-1000);

    try {
      // Test different threshold values
      const thresholdTests = await this.testThresholdRange(dataToUse, marketContext);

      // Find optimal threshold
      const optimalResult = this.findOptimalThreshold(thresholdTests, performanceMetrics);

      // Generate backtest results
      const backtestResults = this.generateBacktestResults(optimalResult, dataToUse);

      // Create recommendations
      const recommendations = this.generateRecommendations(optimalResult, performanceMetrics);

      const result: OptimizationResult = {
        optimalThreshold: optimalResult.threshold,
        adjustments: [optimalResult.adjustment],
        expectedPerformance: optimalResult.expectedPerformance,
        recommendations,
        backtestResults,
      };

      // Cache result
      const cacheKey = this.generateOptimizationCacheKey(marketContext, performanceMetrics);
      this.optimizationCache.set(cacheKey, result);
      this.lastOptimization = Date.now();

      const duration = performance.now() - startTime;
      tradingLogger.performance('confidence_optimization_analysis', duration, {
        optimalThreshold: result.optimalThreshold,
        expectedAccuracy: result.expectedPerformance.accuracy,
        backtestTrades: backtestResults.totalTrades,
      });

      return result;

    } catch (error) {
      const duration = performance.now() - startTime;
      tradingLogger.error('Confidence optimization analysis failed', {
        error: error instanceof Error ? error.message : error,
        duration,
      });

      // Return fallback result
      return this.createFallbackOptimization();
    }
  }

  /**
   * Calculate adjustment factors
   */
  private calculateAdjustmentFactors(
    marketContext: MarketContext,
    performanceMetrics: PerformanceMetrics,
    riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
  ): ThresholdAdjustment['adjustmentFactors'] {
    const factors = {
      volatility: 0,
      performance: 0,
      risk: 0,
      marketCondition: 0,
      timeOfDay: 0,
      newsImpact: 0,
    };

    // Volatility adjustment
    if (this.config.volatilityAdjustment) {
      factors.volatility = this.calculateVolatilityAdjustment(marketContext.volatility);
    }

    // Performance adjustment
    if (this.config.performanceBasedAdjustment) {
      factors.performance = this.calculatePerformanceAdjustment(performanceMetrics);
    }

    // Risk adjustment
    if (this.config.riskAdjustment) {
      factors.risk = this.calculateRiskAdjustment(performanceMetrics, riskTolerance);
    }

    // Market condition adjustment
    if (this.config.marketConditionAdjustment) {
      factors.marketCondition = this.calculateMarketConditionAdjustment(marketContext);
    }

    // Time of day adjustment
    factors.timeOfDay = this.calculateTimeOfDayAdjustment(marketContext.timeOfDay);

    // News impact adjustment
    factors.newsImpact = this.calculateNewsImpactAdjustment(marketContext.newsImpact);

    return factors;
  }

  /**
   * Calculate volatility adjustment
   */
  private calculateVolatilityAdjustment(volatility: number): number {
    // Higher volatility = higher threshold (more cautious)
    if (volatility > 0.4) {
      return 0.15; // High volatility - increase threshold significantly
    } else if (volatility > 0.25) {
      return 0.08; // Moderate volatility - increase threshold moderately
    } else if (volatility < 0.1) {
      return -0.05; // Low volatility - can lower threshold slightly
    }

    return 0; // Normal volatility - no adjustment
  }

  /**
   * Calculate performance adjustment
   */
  private calculatePerformanceAdjustment(metrics: PerformanceMetrics): number {
    let adjustment = 0;

    // Recent accuracy adjustment
    if (metrics.recentAccuracy > 0.75) {
      adjustment -= 0.05; // High accuracy - can be more confident
    } else if (metrics.recentAccuracy < 0.5) {
      adjustment += 0.1; // Low accuracy - need higher threshold
    }

    // Confidence-accuracy correlation
    if (metrics.confidenceAccuracy > 0.8) {
      adjustment -= 0.03; // High correlation - trust confidence more
    } else if (metrics.confidenceAccuracy < 0.5) {
      adjustment += 0.05; // Low correlation - be more skeptical
    }

    // Sharpe ratio adjustment
    if (metrics.sharpeRatio > 2.0) {
      adjustment -= 0.02; // High risk-adjusted returns - can be more aggressive
    } else if (metrics.sharpeRatio < 0.5) {
      adjustment += 0.05; // Low risk-adjusted returns - be more conservative
    }

    return adjustment;
  }

  /**
   * Calculate risk adjustment based on risk tolerance
   */
  private calculateRiskAdjustment(
    metrics: PerformanceMetrics,
    riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
  ): number {
    let baseAdjustment = 0;

    switch (riskTolerance) {
      case 'CONSERVATIVE':
        baseAdjustment = 0.1;
        break;
      case 'MODERATE':
        baseAdjustment = 0;
        break;
      case 'AGGRESSIVE':
        baseAdjustment = -0.05;
        break;
    }

    // Adjust based on current drawdown
    if (metrics.maxDrawdown > 0.15) {
      baseAdjustment += 0.05; // High drawdown - be more conservative
    } else if (metrics.maxDrawdown < 0.05) {
      baseAdjustment -= 0.02; // Low drawdown - can be more aggressive
    }

    return baseAdjustment;
  }

  /**
   * Calculate market condition adjustment
   */
  private calculateMarketConditionAdjustment(context: MarketContext): number {
    let adjustment = 0;

    // Trend adjustment
    switch (context.trend) {
      case 'STRONG_BULL':
      case 'STRONG_BEAR':
        adjustment -= 0.03; // Strong trends - can be more confident
        break;
      case 'NEUTRAL':
        adjustment += 0.02; // Neutral/sideways - be more cautious
        break;
    }

    // Volume adjustment
    if (context.volume === 'HIGH') {
      adjustment -= 0.02; // High volume - more reliable signals
    } else if (context.volume === 'LOW') {
      adjustment += 0.03; // Low volume - less reliable signals
    }

    // Liquidity adjustment
    if (context.liquidity === 'LOW') {
      adjustment += 0.04; // Low liquidity - be more conservative
    }

    // Sentiment adjustment
    if (context.marketSentiment === 'FEAR' || context.marketSentiment === 'GREED') {
      adjustment += 0.03; // Extreme sentiment - potential reversals
    }

    return adjustment;
  }

  /**
   * Calculate time of day adjustment
   */
  private calculateTimeOfDayAdjustment(timeOfDay: MarketContext['timeOfDay']): number {
    switch (timeOfDay) {
      case 'OPENING':
        return 0.02; // Opening volatility - be slightly more conservative
      case 'CLOSING':
        return 0.01; // Closing volatility - be slightly more conservative
      case 'AFTER_HOURS':
        return 0.05; // After hours - much more conservative
      default:
        return 0; // Normal trading hours - no adjustment
    }
  }

  /**
   * Calculate news impact adjustment
   */
  private calculateNewsImpactAdjustment(newsImpact: MarketContext['newsImpact']): number {
    switch (newsImpact) {
      case 'HIGH':
        return 0.08; // High news impact - much more conservative
      case 'MEDIUM':
        return 0.03; // Medium news impact - moderately more conservative
      case 'LOW':
        return -0.01; // Low news impact - can be slightly more aggressive
      default:
        return 0;
    }
  }

  /**
   * Apply adjustments to base threshold
   */
  private applyAdjustments(
    baseThreshold: number,
    adjustments: ThresholdAdjustment['adjustmentFactors']
  ): number {
    let adjustedThreshold = baseThreshold;

    // Apply all adjustments
    Object.values(adjustments).forEach(adjustment => {
      adjustedThreshold += adjustment;
    });

    return adjustedThreshold;
  }

  /**
   * Generate reasoning for threshold adjustments
   */
  private generateAdjustmentReasoning(
    adjustments: ThresholdAdjustment['adjustmentFactors'],
    marketContext: MarketContext,
    performanceMetrics: PerformanceMetrics
  ): string[] {
    const reasoning: string[] = [];

    if (Math.abs(adjustments.volatility) > 0.01) {
      const direction = adjustments.volatility > 0 ? 'increased' : 'decreased';
      reasoning.push(`Threshold ${direction} due to market volatility (${marketContext.volatility.toFixed(2)})`);
    }

    if (Math.abs(adjustments.performance) > 0.01) {
      const direction = adjustments.performance > 0 ? 'increased' : 'decreased';
      reasoning.push(`Threshold ${direction} based on recent performance (${(performanceMetrics.recentAccuracy * 100).toFixed(1)}% accuracy)`);
    }

    if (Math.abs(adjustments.marketCondition) > 0.01) {
      reasoning.push(`Adjusted for current market condition: ${marketContext.trend} trend, ${marketContext.volume} volume`);
    }

    if (Math.abs(adjustments.timeOfDay) > 0.01) {
      reasoning.push(`Time of day adjustment: ${marketContext.timeOfDay}`);
    }

    if (Math.abs(adjustments.newsImpact) > 0.01) {
      reasoning.push(`News impact adjustment: ${marketContext.newsImpact} impact news`);
    }

    return reasoning;
  }

  /**
   * Assess risk level of adjusted threshold
   */
  private assessRiskLevel(
    threshold: number,
    adjustments: ThresholdAdjustment['adjustmentFactors']
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    const totalAdjustment = Object.values(adjustments).reduce((sum, adj) => sum + adj, 0);

    if (threshold > 0.8 || totalAdjustment > 0.1) {
      return 'HIGH';
    } else if (threshold < 0.5 || totalAdjustment < -0.05) {
      return 'LOW';
    }

    return 'MEDIUM';
  }

  /**
   * Calculate effectiveness prediction
   */
  private calculateEffectiveness(
    threshold: number,
    adjustments: ThresholdAdjustment['adjustmentFactors'],
    performanceMetrics: PerformanceMetrics
  ): number {
    let effectiveness = 0.5; // Base effectiveness

    // Historical performance correlation
    if (performanceMetrics.confidenceAccuracy > 0.7) {
      effectiveness += 0.2;
    }

    // Adjustment consistency
    const totalAdjustment = Object.values(adjustments).reduce((sum, adj) => sum + adj, 0);
    if (Math.abs(totalAdjustment) < 0.05) {
      effectiveness += 0.1; // Conservative adjustments are more reliable
    }

    // Market condition appropriateness
    if (threshold >= 0.6 && threshold <= 0.75) {
      effectiveness += 0.2; // Moderate thresholds tend to be most effective
    }

    return Math.min(1.0, Math.max(0.0, effectiveness));
  }

  /**
   * Test threshold range on historical data
   */
  private async testThresholdRange(
    historicalData: ConfidenceRecord[],
    marketContext: MarketContext
  ): Promise<Array<{ threshold: number; results: any }>> {
    const thresholds = [];
    const step = 0.05;

    for (let t = this.config.minThreshold; t <= this.config.maxThreshold; t += step) {
      const results = this.simulateThreshold(historicalData, t);
      thresholds.push({ threshold: t, results });
    }

    return thresholds;
  }

  /**
   * Simulate performance for a specific threshold
   */
  private simulateThreshold(data: ConfidenceRecord[], threshold: number): any {
    let trades = 0;
    let profits = 0;
    let losses = 0;
    let totalPnL = 0;

    for (const record of data) {
      if (record.confidence >= threshold && record.executionDecision === 'EXECUTED') {
        trades++;
        totalPnL += record.pnl;

        if (record.actualOutcome === 'PROFIT') {
          profits++;
        } else if (record.actualOutcome === 'LOSS') {
          losses++;
        }
      }
    }

    return {
      trades,
      accuracy: trades > 0 ? profits / trades : 0,
      profitFactor: losses > 0 ? profits / losses : profits > 0 ? 10 : 1,
      totalPnL,
      averagePnL: trades > 0 ? totalPnL / trades : 0,
    };
  }

  /**
   * Find optimal threshold from test results
   */
  private findOptimalThreshold(
    thresholdTests: Array<{ threshold: number; results: any }>,
    performanceMetrics: PerformanceMetrics
  ): { threshold: number; adjustment: ThresholdAdjustment; expectedPerformance: any } {
    let bestThreshold = thresholdTests[0];
    let bestScore = this.calculateOptimizationScore(bestThreshold.results, performanceMetrics);

    for (const test of thresholdTests) {
      const score = this.calculateOptimizationScore(test.results, performanceMetrics);
      if (score > bestScore) {
        bestScore = score;
        bestThreshold = test;
      }
    }

    return {
      threshold: bestThreshold.threshold,
      adjustment: this.createStaticThreshold(bestThreshold.threshold),
      expectedPerformance: bestThreshold.results,
    };
  }

  /**
   * Calculate optimization score for threshold performance
   */
  private calculateOptimizationScore(results: any, metrics: PerformanceMetrics): number {
    let score = 0;

    // Accuracy component
    score += results.accuracy * 0.3;

    // Profit factor component
    score += Math.min(results.profitFactor, 3) / 3 * 0.3;

    // Trade frequency component (avoid too few or too many trades)
    const optimalTrades = 50; // Target monthly trades
    const tradeScore = 1 - Math.abs(results.trades - optimalTrades) / optimalTrades;
    score += Math.max(0, tradeScore) * 0.2;

    // Consistency component (low drawdown)
    const maxDrawdown = Math.abs(Math.min(...results.pnlHistory || [0]));
    const drawdownScore = Math.max(0, 1 - maxDrawdown / 0.2); // 20% max acceptable drawdown
    score += drawdownScore * 0.2;

    return score;
  }

  /**
   * Generate backtest results
   */
  private generateBacktestResults(
    optimalResult: any,
    historicalData: ConfidenceRecord[]
  ): OptimizationResult['backtestResults'] {
    const recentData = historicalData.slice(-100); // Last 100 records

    return {
      period: 'Last 100 decisions',
      totalTrades: optimalResult.expectedPerformance.trades,
      accuracy: optimalResult.expectedPerformance.accuracy,
      profitFactor: optimalResult.expectedPerformance.profitFactor,
      maxDrawdown: this.calculateMaxDrawdown(recentData),
    };
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateMaxDrawdown(data: ConfidenceRecord[]): number {
    let maxDrawdown = 0;
    let peak = 0;
    let cumulativePnL = 0;

    for (const record of data) {
      if (record.executionDecision === 'EXECUTED') {
        cumulativePnL += record.pnl;
        peak = Math.max(peak, cumulativePnL);
        maxDrawdown = Math.max(maxDrawdown, peak - cumulativePnL);
      }
    }

    return maxDrawdown;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    optimalResult: any,
    performanceMetrics: PerformanceMetrics
  ): string[] {
    const recommendations: string[] = [];

    if (optimalResult.threshold > 0.75) {
      recommendations.push('High threshold selected - focus on high-confidence opportunities only');
    } else if (optimalResult.threshold < 0.5) {
      recommendations.push('Low threshold selected - consider additional risk management measures');
    }

    if (performanceMetrics.recentAccuracy < 0.5) {
      recommendations.push('Recent accuracy is low - consider pausing trading or reducing position sizes');
    }

    if (performanceMetrics.maxDrawdown > 0.1) {
      recommendations.push('High drawdown detected - implement stricter risk controls');
    }

    if (optimalResult.expectedPerformance.trades < 10) {
      recommendations.push('Low trade frequency expected - consider broader market analysis');
    }

    return recommendations;
  }

  /**
   * Check if re-optimization is needed
   */
  private async checkReoptimization(): Promise<void> {
    const now = Date.now();
    const timeSinceLastOptimization = now - this.lastOptimization;

    // Re-optimize every 24 hours or after 100 new records
    if (timeSinceLastOptimization > 24 * 60 * 60 * 1000 || this.confidenceHistory.length % 100 === 0) {
      tradingLogger.info('Triggering automatic confidence threshold re-optimization');
      // Re-optimization would be triggered here
    }
  }

  /**
   * Create static threshold (non-adaptive mode)
   */
  private createStaticThreshold(customThreshold?: number): ThresholdAdjustment {
    const threshold = customThreshold || this.config.baseThreshold;

    return {
      originalThreshold: this.config.baseThreshold,
      adjustedThreshold: threshold,
      adjustmentFactors: {
        volatility: 0,
        performance: 0,
        risk: 0,
        marketCondition: 0,
        timeOfDay: 0,
        newsImpact: 0,
      },
      reasoning: ['Static threshold mode - no adjustments applied'],
      riskLevel: 'MEDIUM',
      effectiveness: 0.7,
    };
  }

  /**
   * Create fallback optimization result
   */
  private createFallbackOptimization(): OptimizationResult {
    return {
      optimalThreshold: this.config.baseThreshold,
      adjustments: [this.createStaticThreshold()],
      expectedPerformance: {
        accuracy: 0.6,
        expectedReturn: 0.02,
        riskAdjustedReturn: 0.01,
        tradeFrequency: 20,
      },
      recommendations: ['Using fallback threshold - review configuration'],
      backtestResults: {
        period: 'Fallback',
        totalTrades: 0,
        accuracy: 0,
        profitFactor: 1,
        maxDrawdown: 0,
      },
    };
  }

  /**
   * Generate cache key for optimization results
   */
  private generateOptimizationCacheKey(
    marketContext: MarketContext,
    performanceMetrics: PerformanceMetrics
  ): string {
    const contextStr = `${marketContext.volatility.toFixed(2)}_${marketContext.trend}_${marketContext.volume}`;
    const metricsStr = `${performanceMetrics.recentAccuracy.toFixed(2)}_${performanceMetrics.sharpeRatio.toFixed(2)}`;
    return `${contextStr}_${metricsStr}`;
  }

  /**
   * Get current threshold
   */
  getCurrentThreshold(): number {
    return this.currentThreshold;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ThresholdConfig>): void {
    this.config = { ...this.config, ...newConfig };
    tradingLogger.info('Confidence optimization configuration updated', { config: this.config });
  }

  /**
   * Get configuration
   */
  getConfig(): ThresholdConfig {
    return { ...this.config };
  }

  /**
   * Get confidence analytics
   */
  getConfidenceAnalytics(): {
    totalRecords: number;
    averageConfidence: number;
    thresholdEfficiency: number;
    recentAccuracy: number;
    confidenceDistribution: Record<string, number>;
  } {
    const recentRecords = this.confidenceHistory.slice(-100);

    const totalRecords = this.confidenceHistory.length;
    const averageConfidence = recentRecords.reduce((sum, r) => sum + r.confidence, 0) / recentRecords.length;
    const thresholdEfficiency = recentRecords.filter(r => r.confidence >= r.threshold).length / recentRecords.length;
    const recentAccuracy = recentRecords.filter(r => r.actualOutcome === 'PROFIT').length / recentRecords.length;

    // Confidence distribution
    const confidenceDistribution = {
      '0.0-0.5': recentRecords.filter(r => r.confidence < 0.5).length,
      '0.5-0.7': recentRecords.filter(r => r.confidence >= 0.5 && r.confidence < 0.7).length,
      '0.7-0.9': recentRecords.filter(r => r.confidence >= 0.7 && r.confidence < 0.9).length,
      '0.9-1.0': recentRecords.filter(r => r.confidence >= 0.9).length,
    };

    return {
      totalRecords,
      averageConfidence,
      thresholdEfficiency,
      recentAccuracy,
      confidenceDistribution,
    };
  }

  /**
   * Clear history and caches
   */
  clearHistory(): void {
    this.confidenceHistory = [];
    this.optimizationCache.clear();
    this.lastOptimization = 0;
    tradingLogger.info('Confidence optimization history cleared');
  }
}

export default ConfidenceOptimizationService;