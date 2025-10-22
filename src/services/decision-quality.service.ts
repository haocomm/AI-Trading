/**
 * Decision Quality Scoring Service
 *
 * Comprehensive quality assessment system for AI trading decisions
 * with multi-dimensional scoring and feedback mechanisms.
 */

import { tradingLogger } from '@/utils/logger';

export interface DecisionQualityScore {
  overall: number; // 0-1
  components: {
    reasoning: number;
    dataQuality: number;
    confidence: number;
    timing: number;
    riskManagement: number;
    consistency: number;
  };
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';
  feedback: string[];
  recommendations: string[];
  metadata: {
    scoredAt: number;
    scorer: string;
    version: string;
  };
}

export interface QualityDimensions {
  // Reasoning quality (0-1)
  reasoning: {
    logicalCoherence: number;
    evidenceBased: number;
    marketAwareness: number;
    riskConsideration: number;
    clarity: number;
  };

  // Data quality (0-1)
  dataQuality: {
    completeness: number;
    accuracy: number;
    timeliness: number;
    relevance: number;
    reliability: number;
  };

  // Confidence quality (0-1)
  confidence: {
    calibration: number;
    justification: number;
    consistency: number;
    uncertainty: number;
  };

  // Timing quality (0-1)
  timing: {
    marketTiming: number;
    executionSpeed: number;
    opportunityCost: number;
  };

  // Risk management quality (0-1)
  riskManagement: {
    positionSizing: number;
    stopLoss: number;
    diversification: number;
    marketCondition: number;
  };

  // Consistency quality (0-1)
  consistency: {
    historical: number;
    crossAsset: number;
    temporal: number;
    strategy: number;
  };
}

export interface DecisionMetrics {
  decision: 'BUY' | 'SELL' | 'HOLD';
  symbol: string;
  timestamp: number;
  price: number;
  volume: number;

  // AI reasoning
  reasoning: string;
  confidence: number;
  provider: string;
  model: string;

  // Market context
  marketCondition: {
    regime: string;
    volatility: number;
    trend: string;
    sentiment: string;
  };

  // Technical indicators
  technical: {
    rsi: number;
    macd: number;
    bollingerPosition: number;
    volumeRatio: number;
  };

  // Execution details
  executed: boolean;
  executionPrice?: number;
  executionTime?: number;
  expectedPrice?: number;

  // Risk parameters
  riskParams: {
    positionSize: number;
    stopLoss?: number;
    takeProfit?: number;
    maxLoss: number;
  };

  // Historical performance
  historicalContext: {
    recentAccuracy: number;
    recentWinRate: number;
    similarConditions: {
      accuracy: number;
      decisions: number;
    };
  };
}

export interface QualityThresholds {
  excellent: number;    // 0.9+
  good: number;         // 0.75+
  satisfactory: number; // 0.6+
  poor: number;         // 0.4+
}

export interface QualityReport {
  decisionId: string;
  timestamp: number;
  score: DecisionQualityScore;
  dimensions: QualityDimensions;
  analysis: {
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
  };
  benchmark: {
    average: number;
    percentile: number;
    rank: string;
  };
}

export class DecisionQualityService {
  private static instance: DecisionQualityService;
  private thresholds: QualityThresholds;
  private qualityHistory: Map<string, QualityReport> = new Map();
  private benchmarks: Map<string, number[]> = new Map();

  private constructor() {
    this.thresholds = {
      excellent: 0.9,
      good: 0.75,
      satisfactory: 0.6,
      poor: 0.4,
    };

    this.initializeBenchmarks();
  }

  static getInstance(): DecisionQualityService {
    if (!DecisionQualityService.instance) {
      DecisionQualityService.instance = new DecisionQualityService();
    }
    return DecisionQualityService.instance;
  }

  /**
   * Score a trading decision across multiple quality dimensions
   */
  async scoreDecision(metrics: DecisionMetrics): Promise<DecisionQualityScore> {
    const startTime = performance.now();

    try {
      // Evaluate each quality dimension
      const dimensions = await this.evaluateQualityDimensions(metrics);

      // Calculate component scores
      const components = {
        reasoning: this.calculateReasoningScore(dimensions.reasoning),
        dataQuality: this.calculateDataQualityScore(dimensions.dataQuality),
        confidence: this.calculateConfidenceScore(dimensions.confidence),
        timing: this.calculateTimingScore(dimensions.timing, metrics),
        riskManagement: this.calculateRiskScore(dimensions.riskManagement, metrics),
        consistency: this.calculateConsistencyScore(dimensions.consistency, metrics),
      };

      // Calculate overall score (weighted average)
      const overall = this.calculateOverallScore(components);

      // Determine grade
      const grade = this.determineGrade(overall);

      // Generate feedback
      const feedback = this.generateFeedback(components, dimensions, metrics);

      // Generate recommendations
      const recommendations = this.generateRecommendations(components, dimensions, metrics);

      const score: DecisionQualityScore = {
        overall,
        components,
        grade,
        feedback,
        recommendations,
        metadata: {
          scoredAt: Date.now(),
          scorer: 'AI_Quality_Service_v1.0',
          version: '1.0.0',
        },
      };

      const duration = performance.now() - startTime;
      tradingLogger.performance('decision_quality_scoring', duration, {
        symbol: metrics.symbol,
        decision: metrics.decision,
        overallScore: overall,
        grade,
      });

      return score;

    } catch (error) {
      const duration = performance.now() - startTime;
      tradingLogger.error('Decision quality scoring failed', {
        symbol: metrics.symbol,
        error: error instanceof Error ? error.message : error,
        duration,
      });

      return this.createFallbackScore(metrics);
    }
  }

  /**
   * Generate comprehensive quality report
   */
  async generateQualityReport(
    metrics: DecisionMetrics,
    score: DecisionQualityScore
  ): Promise<QualityReport> {
    const decisionId = this.generateDecisionId(metrics);

    try {
      // Re-evaluate dimensions for detailed analysis
      const dimensions = await this.evaluateQualityDimensions(metrics);

      // Generate analysis
      const analysis = this.generateDetailedAnalysis(score, dimensions, metrics);

      // Calculate benchmark comparison
      const benchmark = this.calculateBenchmark(score, metrics);

      const report: QualityReport = {
        decisionId,
        timestamp: Date.now(),
        score,
        dimensions,
        analysis,
        benchmark,
      };

      // Store report
      this.qualityHistory.set(decisionId, report);

      // Update benchmarks
      this.updateBenchmarks(score, metrics);

      return report;

    } catch (error) {
      tradingLogger.error('Quality report generation failed', {
        decisionId,
        error: error instanceof Error ? error.message : error,
      });

      return this.createFallbackReport(decisionId, metrics, score);
    }
  }

  /**
   * Get quality analytics and statistics
   */
  getQualityAnalytics(): {
    totalScores: number;
    averageScore: number;
    gradeDistribution: Record<string, number>;
    componentAverages: Record<keyof DecisionQualityScore['components'], number>;
    recentTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
    topPerformers: Array<{
      symbol: string;
      score: number;
      grade: string;
    }>;
  } {
    const reports = Array.from(this.qualityHistory.values());

    if (reports.length === 0) {
      return {
        totalScores: 0,
        averageScore: 0,
        gradeDistribution: {},
        componentAverages: {
          reasoning: 0,
          dataQuality: 0,
          confidence: 0,
          timing: 0,
          riskManagement: 0,
          consistency: 0,
        },
        recentTrend: 'STABLE',
        topPerformers: [],
      };
    }

    // Calculate basic statistics
    const totalScores = reports.length;
    const averageScore = reports.reduce((sum, r) => sum + r.score.overall, 0) / totalScores;

    // Grade distribution
    const gradeDistribution: Record<string, number> = {};
    for (const report of reports) {
      gradeDistribution[report.score.grade] = (gradeDistribution[report.score.grade] || 0) + 1;
    }

    // Component averages
    const componentAverages = {
      reasoning: reports.reduce((sum, r) => sum + r.score.components.reasoning, 0) / totalScores,
      dataQuality: reports.reduce((sum, r) => sum + r.score.components.dataQuality, 0) / totalScores,
      confidence: reports.reduce((sum, r) => sum + r.score.components.confidence, 0) / totalScores,
      timing: reports.reduce((sum, r) => sum + r.score.components.timing, 0) / totalScores,
      riskManagement: reports.reduce((sum, r) => sum + r.score.components.riskManagement, 0) / totalScores,
      consistency: reports.reduce((sum, r) => sum + r.score.components.consistency, 0) / totalScores,
    };

    // Recent trend
    const recentTrend = this.calculateRecentTrend(reports);

    // Top performers
    const topPerformers = reports
      .sort((a, b) => b.score.overall - a.score.overall)
      .slice(0, 5)
      .map(r => ({
        symbol: r.dimensions.reasoning.marketAwareness > 0.8 ? 'unknown' : 'unknown', // Would extract from metrics
        score: r.score.overall,
        grade: r.score.grade,
      }));

    return {
      totalScores,
      averageScore,
      gradeDistribution,
      componentAverages,
      recentTrend,
      topPerformers,
    };
  }

  /**
   * Update quality thresholds
   */
  updateThresholds(newThresholds: Partial<QualityThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    tradingLogger.info('Quality thresholds updated', { thresholds: this.thresholds });
  }

  /**
   * Get current thresholds
   */
  getThresholds(): QualityThresholds {
    return { ...this.thresholds };
  }

  // Private methods
  private async evaluateQualityDimensions(metrics: DecisionMetrics): Promise<QualityDimensions> {
    return {
      reasoning: await this.evaluateReasoningQuality(metrics),
      dataQuality: await this.evaluateDataQuality(metrics),
      confidence: await this.evaluateConfidenceQuality(metrics),
      timing: await this.evaluateTimingQuality(metrics),
      riskManagement: await this.evaluateRiskManagementQuality(metrics),
      consistency: await this.evaluateConsistencyQuality(metrics),
    };
  }

  private async evaluateReasoningQuality(metrics: DecisionMetrics): Promise<QualityDimensions['reasoning']> {
    const reasoning = metrics.reasoning.toLowerCase();
    let score = 0.5; // Base score

    // Logical coherence
    if (reasoning.includes('because') || reasoning.includes('since') || reasoning.includes('therefore')) {
      score += 0.1;
    }

    // Evidence-based
    if (reasoning.includes('rsi') || reasoning.includes('macd') || reasoning.includes('support') || reasoning.includes('resistance')) {
      score += 0.15;
    }

    // Market awareness
    if (reasoning.includes('volatility') || reasoning.includes('trend') || reasoning.includes('market')) {
      score += 0.1;
    }

    // Risk consideration
    if (reasoning.includes('risk') || reasoning.includes('stop') || reasoning.includes('position')) {
      score += 0.1;
    }

    // Clarity
    if (reasoning.length > 50 && reasoning.length < 500) {
      score += 0.05;
    }

    return {
      logicalCoherence: Math.min(1, score),
      evidenceBased: Math.min(1, score * 0.9),
      marketAwareness: Math.min(1, score * 0.85),
      riskConsideration: Math.min(1, score * 0.95),
      clarity: Math.min(1, score * 0.8),
    };
  }

  private async evaluateDataQuality(metrics: DecisionMetrics): Promise<QualityDimensions['dataQuality']> {
    let score = 0.7; // Base score for available data

    // Completeness
    if (metrics.technical.rsi && metrics.technical.macd && metrics.technical.bollingerPosition) {
      score += 0.1;
    }

    // Timeliness
    const dataAge = Date.now() - metrics.timestamp;
    if (dataAge < 60000) { // Less than 1 minute old
      score += 0.1;
    } else if (dataAge < 300000) { // Less than 5 minutes old
      score += 0.05;
    }

    // Relevance
    if (metrics.volume > 0 && metrics.marketCondition.volatility > 0) {
      score += 0.1;
    }

    return {
      completeness: Math.min(1, score),
      accuracy: 0.85, // Would be calculated from actual data verification
      timeliness: Math.min(1, score * 0.9),
      relevance: Math.min(1, score * 0.95),
      reliability: 0.9, // Would be calculated from source reliability
    };
  }

  private async evaluateConfidenceQuality(metrics: DecisionMetrics): Promise<QualityDimensions['confidence']> {
    const confidence = metrics.confidence;
    let score = 0.5;

    // Calibration
    const historicalAccuracy = metrics.historicalContext.recentAccuracy;
    const calibrationDiff = Math.abs(confidence - historicalAccuracy);
    score += Math.max(0, 0.5 - calibrationDiff);

    // Justification
    if (metrics.reasoning.length > 100) {
      score += 0.1;
    }

    // Consistency
    if (confidence > 0.3 && confidence < 0.9) {
      score += 0.1; // Reasonable confidence levels
    }

    // Uncertainty
    if (metrics.marketCondition.volatility > 0.3 && confidence < 0.7) {
      score += 0.1; // Appropriate uncertainty in volatile conditions
    }

    return {
      calibration: Math.min(1, score),
      justification: Math.min(1, score * 0.9),
      consistency: Math.min(1, score * 0.95),
      uncertainty: Math.min(1, score * 0.85),
    };
  }

  private async evaluateTimingQuality(metrics: DecisionMetrics): Promise<QualityDimensions['timing']> {
    let score = 0.6;

    // Market timing
    const rsi = metrics.technical.rsi;
    if ((metrics.decision === 'BUY' && rsi < 30) || (metrics.decision === 'SELL' && rsi > 70)) {
      score += 0.2; // Good contrarian timing
    } else if ((metrics.decision === 'BUY' && rsi > 50) || (metrics.decision === 'SELL' && rsi < 50)) {
      score += 0.1; // Momentum timing
    }

    // Execution speed
    if (metrics.executionTime && metrics.timestamp) {
      const executionDelay = metrics.executionTime - metrics.timestamp;
      if (executionDelay < 5000) { // Less than 5 seconds
        score += 0.1;
      }
    }

    return {
      marketTiming: Math.min(1, score),
      executionSpeed: 0.8, // Would be calculated from actual execution data
      opportunityCost: Math.min(1, score * 0.9),
    };
  }

  private async evaluateRiskManagementQuality(metrics: DecisionMetrics): Promise<QualityDimensions['riskManagement']> {
    let score = 0.5;

    // Position sizing
    const positionSize = metrics.riskParams.positionSize;
    if (positionSize > 0.01 && positionSize < 0.1) { // 1-10% position
      score += 0.2;
    } else if (positionSize > 0 && positionSize <= 0.2) { // Up to 20%
      score += 0.1;
    }

    // Stop loss
    if (metrics.riskParams.stopLoss) {
      const stopLossPercentage = Math.abs(metrics.riskParams.stopLoss - metrics.price) / metrics.price;
      if (stopLossPercentage > 0.01 && stopLossPercentage < 0.05) { // 1-5% stop loss
        score += 0.2;
      }
    }

    // Market condition
    if (metrics.marketCondition.volatility > 0.3 && positionSize < 0.05) {
      score += 0.1; // Reduced size in volatile conditions
    }

    return {
      positionSizing: Math.min(1, score),
      stopLoss: metrics.riskParams.stopLoss ? 0.8 : 0.3,
      diversification: 0.7, // Would be calculated from portfolio data
      marketCondition: Math.min(1, score * 0.9),
    };
  }

  private async evaluateConsistencyQuality(metrics: DecisionMetrics): Promise<QualityDimensions['consistency']> {
    let score = 0.6;

    // Historical consistency
    const recentAccuracy = metrics.historicalContext.recentAccuracy;
    if (recentAccuracy > 0.6) {
      score += 0.2;
    }

    // Similar conditions
    const similarConditions = metrics.historicalContext.similarConditions;
    if (similarConditions.accuracy > 0.5 && similarConditions.decisions > 5) {
      score += 0.2;
    }

    return {
      historical: Math.min(1, score),
      crossAsset: 0.7, // Would be calculated from cross-asset analysis
      temporal: 0.8, // Would be calculated from temporal consistency
      strategy: Math.min(1, score * 0.9),
    };
  }

  private calculateReasoningScore(reasoning: QualityDimensions['reasoning']): number {
    const weights = {
      logicalCoherence: 0.25,
      evidenceBased: 0.25,
      marketAwareness: 0.2,
      riskConsideration: 0.2,
      clarity: 0.1,
    };

    return Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (reasoning[key as keyof typeof reasoning] * weight);
    }, 0);
  }

  private calculateDataQualityScore(dataQuality: QualityDimensions['dataQuality']): number {
    const weights = {
      completeness: 0.25,
      accuracy: 0.25,
      timeliness: 0.2,
      relevance: 0.2,
      reliability: 0.1,
    };

    return Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (dataQuality[key as keyof typeof dataQuality] * weight);
    }, 0);
  }

  private calculateConfidenceScore(confidence: QualityDimensions['confidence']): number {
    const weights = {
      calibration: 0.3,
      justification: 0.25,
      consistency: 0.25,
      uncertainty: 0.2,
    };

    return Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (confidence[key as keyof typeof confidence] * weight);
    }, 0);
  }

  private calculateTimingScore(timing: QualityDimensions['timing'], metrics: DecisionMetrics): number {
    const weights = {
      marketTiming: 0.4,
      executionSpeed: 0.3,
      opportunityCost: 0.3,
    };

    return Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (timing[key as keyof typeof timing] * weight);
    }, 0);
  }

  private calculateRiskScore(risk: QualityDimensions['riskManagement'], metrics: DecisionMetrics): number {
    const weights = {
      positionSizing: 0.3,
      stopLoss: 0.25,
      diversification: 0.2,
      marketCondition: 0.25,
    };

    return Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (risk[key as keyof typeof risk] * weight);
    }, 0);
  }

  private calculateConsistencyScore(consistency: QualityDimensions['consistency'], metrics: DecisionMetrics): number {
    const weights = {
      historical: 0.3,
      crossAsset: 0.2,
      temporal: 0.25,
      strategy: 0.25,
    };

    return Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (consistency[key as keyof typeof consistency] * weight);
    }, 0);
  }

  private calculateOverallScore(components: DecisionQualityScore['components']): number {
    const weights = {
      reasoning: 0.2,
      dataQuality: 0.15,
      confidence: 0.15,
      timing: 0.15,
      riskManagement: 0.2,
      consistency: 0.15,
    };

    return Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (components[key as keyof typeof components] * weight);
    }, 0);
  }

  private determineGrade(score: number): DecisionQualityScore['grade'] {
    if (score >= this.thresholds.excellent) return 'A+';
    if (score >= this.thresholds.good) return 'A';
    if (score >= this.thresholds.good - 0.05) return 'B+';
    if (score >= this.thresholds.satisfactory) return 'B';
    if (score >= this.thresholds.satisfactory - 0.05) return 'C+';
    if (score >= this.thresholds.poor) return 'C';
    if (score >= this.thresholds.poor - 0.1) return 'D';
    return 'F';
  }

  private generateFeedback(
    components: DecisionQualityScore['components'],
    dimensions: QualityDimensions,
    metrics: DecisionMetrics
  ): string[] {
    const feedback: string[] = [];

    // Reasoning feedback
    if (components.reasoning > 0.8) {
      feedback.push('Excellent reasoning with strong logical coherence');
    } else if (components.reasoning < 0.5) {
      feedback.push('Reasoning needs improvement - add more evidence-based analysis');
    }

    // Data quality feedback
    if (components.dataQuality > 0.8) {
      feedback.push('High quality data with comprehensive market indicators');
    } else if (components.dataQuality < 0.5) {
      feedback.push('Data quality could be improved - ensure timely and complete data');
    }

    // Confidence feedback
    if (components.confidence > 0.8) {
      feedback.push('Well-calibrated confidence with strong justification');
    } else if (components.confidence < 0.5) {
      feedback.push('Confidence calibration needs attention');
    }

    // Risk management feedback
    if (components.riskManagement > 0.8) {
      feedback.push('Excellent risk management with appropriate position sizing');
    } else if (components.riskManagement < 0.5) {
      feedback.push('Risk management requires improvement - review position sizing and stop losses');
    }

    return feedback;
  }

  private generateRecommendations(
    components: DecisionQualityScore['components'],
    dimensions: QualityDimensions,
    metrics: DecisionMetrics
  ): string[] {
    const recommendations: string[] = [];

    // Low scoring components
    const lowScoringComponents = Object.entries(components)
      .filter(([_, score]) => score < 0.6)
      .map(([component, _]) => component);

    for (const component of lowScoringComponents) {
      switch (component) {
        case 'reasoning':
          recommendations.push('Enhance decision reasoning with more technical evidence and logical structure');
          break;
        case 'dataQuality':
          recommendations.push('Improve data quality by ensuring timely and comprehensive market data');
          break;
        case 'confidence':
          recommendations.push('Work on confidence calibration to better align with actual outcomes');
          break;
        case 'timing':
          recommendations.push('Focus on better market timing and execution speed optimization');
          break;
        case 'riskManagement':
          recommendations.push('Strengthen risk management practices with better position sizing and stop losses');
          break;
        case 'consistency':
          recommendations.push('Improve decision consistency by following established strategies');
          break;
      }
    }

    return recommendations;
  }

  private generateDetailedAnalysis(
    score: DecisionQualityScore,
    dimensions: QualityDimensions,
    metrics: DecisionMetrics
  ): QualityReport['analysis'] {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvements: string[] = [];

    // Identify strengths
    Object.entries(score.components).forEach(([component, componentScore]) => {
      if (componentScore > 0.8) {
        strengths.push(`Strong ${component.replace(/([A-Z])/g, ' $1').toLowerCase()} performance`);
      }
    });

    // Identify weaknesses
    Object.entries(score.components).forEach(([component, componentScore]) => {
      if (componentScore < 0.5) {
        weaknesses.push(`${component.replace(/([A-Z])/g, ' $1').toLowerCase()} needs improvement`);
      }
    });

    // Generate improvements
    if (score.overall < 0.7) {
      improvements.push('Overall decision quality should be improved');
    }

    if (score.components.riskManagement < 0.6) {
      improvements.push('Implement stricter risk management protocols');
    }

    if (score.components.reasoning < 0.6) {
      improvements.push('Enhance reasoning with more structured analysis');
    }

    return {
      strengths,
      weaknesses,
      improvements,
    };
  }

  private calculateBenchmark(score: DecisionQualityScore, metrics: DecisionMetrics): QualityReport['benchmark'] {
    const key = `${metrics.decision}_${metrics.marketCondition.regime}`;
    const scores = this.benchmarks.get(key) || [];

    const average = scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0.7;
    const percentile = this.calculatePercentile(score.overall, scores);

    let rank: string;
    if (percentile >= 90) rank = 'Excellent';
    else if (percentile >= 75) rank = 'Good';
    else if (percentile >= 50) rank = 'Average';
    else if (percentile >= 25) rank = 'Below Average';
    else rank = 'Poor';

    return {
      average,
      percentile,
      rank,
    };
  }

  private calculatePercentile(value: number, distribution: number[]): number {
    if (distribution.length === 0) return 50;

    const sorted = [...distribution].sort((a, b) => a - b);
    const rank = sorted.findIndex(s => s >= value);

    if (rank === -1) return 100;
    return (rank / sorted.length) * 100;
  }

  private updateBenchmarks(score: DecisionQualityScore, metrics: DecisionMetrics): void {
    const key = `${metrics.decision}_${metrics.marketCondition.regime}`;

    if (!this.benchmarks.has(key)) {
      this.benchmarks.set(key, []);
    }

    const scores = this.benchmarks.get(key)!;
    scores.push(score.overall);

    // Keep only recent scores
    if (scores.length > 100) {
      scores.splice(0, scores.length - 100);
    }
  }

  private initializeBenchmarks(): void {
    // Initialize with some baseline benchmarks
    const baselineScenarios = ['BUY_TRENDING', 'SELL_TRENDING', 'BUY_RANGING', 'SELL_RANGING', 'HOLD_VOLATILE'];

    for (const scenario of baselineScenarios) {
      this.benchmarks.set(scenario, []);
      // Add some baseline scores
      for (let i = 0; i < 20; i++) {
        this.benchmarks.get(scenario)!.push(0.6 + Math.random() * 0.3);
      }
    }
  }

  private createFallbackScore(metrics: DecisionMetrics): DecisionQualityScore {
    return {
      overall: 0.5,
      components: {
        reasoning: 0.5,
        dataQuality: 0.5,
        confidence: 0.5,
        timing: 0.5,
        riskManagement: 0.5,
        consistency: 0.5,
      },
      grade: 'C',
      feedback: ['Quality scoring failed - using fallback scores'],
      recommendations: ['Review quality scoring system'],
      metadata: {
        scoredAt: Date.now(),
        scorer: 'fallback',
        version: '1.0.0',
      },
    };
  }

  private createFallbackReport(decisionId: string, metrics: DecisionMetrics, score: DecisionQualityScore): QualityReport {
    return {
      decisionId,
      timestamp: Date.now(),
      score,
      dimensions: {
        reasoning: {
          logicalCoherence: 0.5,
          evidenceBased: 0.5,
          marketAwareness: 0.5,
          riskConsideration: 0.5,
          clarity: 0.5,
        },
        dataQuality: {
          completeness: 0.5,
          accuracy: 0.5,
          timeliness: 0.5,
          relevance: 0.5,
          reliability: 0.5,
        },
        confidence: {
          calibration: 0.5,
          justification: 0.5,
          consistency: 0.5,
          uncertainty: 0.5,
        },
        timing: {
          marketTiming: 0.5,
          executionSpeed: 0.5,
          opportunityCost: 0.5,
        },
        riskManagement: {
          positionSizing: 0.5,
          stopLoss: 0.5,
          diversification: 0.5,
          marketCondition: 0.5,
        },
        consistency: {
          historical: 0.5,
          crossAsset: 0.5,
          temporal: 0.5,
          strategy: 0.5,
        },
      },
      analysis: {
        strengths: ['Fallback analysis'],
        weaknesses: ['Quality scoring unavailable'],
        improvements: ['Restore quality scoring functionality'],
      },
      benchmark: {
        average: 0.5,
        percentile: 50,
        rank: 'Average',
      },
    };
  }

  private generateDecisionId(metrics: DecisionMetrics): string {
    return `decision_${metrics.symbol}_${metrics.timestamp}_${Math.random().toString(36).substr(2, 6)}`;
  }

  private calculateRecentTrend(reports: QualityReport[]): 'IMPROVING' | 'STABLE' | 'DECLINING' {
    if (reports.length < 10) return 'STABLE';

    const recent = reports.slice(-10);
    const older = reports.slice(-20, -10);

    if (older.length === 0) return 'STABLE';

    const recentAvg = recent.reduce((sum, r) => sum + r.score.overall, 0) / recent.length;
    const olderAvg = older.reduce((sum, r) => sum + r.score.overall, 0) / older.length;

    const change = recentAvg - olderAvg;

    if (Math.abs(change) < 0.05) return 'STABLE';
    return change > 0 ? 'IMPROVING' : 'DECLINING';
  }

  /**
   * Clear all quality data (for testing)
   */
  clearAllData(): void {
    this.qualityHistory.clear();
    this.benchmarks.clear();
    tradingLogger.info('Decision quality data cleared');
  }
}

export default DecisionQualityService;