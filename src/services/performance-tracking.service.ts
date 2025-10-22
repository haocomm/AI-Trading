/**
 * Performance Tracking and A/B Testing Service
 *
 * Comprehensive performance monitoring, A/B testing framework,
 * and analytics for AI model evaluation and optimization.
 */

import { tradingLogger } from '@/utils/logger';

export interface ModelPerformance {
  provider: string;
  model: string;
  version: string;
  timestamp: number;

  // Accuracy metrics
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;

  // Trading metrics
  totalDecisions: number;
  profitableDecisions: number;
  losingDecisions: number;
  winRate: number;
  profitFactor: number;
  averageReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;

  // Confidence metrics
  averageConfidence: number;
  confidenceAccuracy: number;
  calibrationScore: number;

  // Performance by condition
  performanceByMarketCondition: Record<string, {
    accuracy: number;
    decisions: number;
    returns: number;
  }>;

  performanceByTimeOfDay: Record<string, {
    accuracy: number;
    decisions: number;
    returns: number;
  }>;

  performanceByVolatility: Record<string, {
    accuracy: number;
    decisions: number;
    returns: number;
  }>;

  // Cost and speed metrics
  averageResponseTime: number;
  averageCostPerDecision: number;
  totalCost: number;

  // Reliability metrics
  uptime: number;
  errorRate: number;
  timeoutRate: number;
}

export interface ABTest {
  id: string;
  name: string;
  description: string;
  status: 'PLANNED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
  startTime: number;
  endTime?: number;

  // Test configuration
  controlGroup: {
    provider: string;
    model: string;
    configuration: any;
  };
  testGroups: Array<{
    id: string;
    name: string;
    provider: string;
    model: string;
    configuration: any;
    trafficAllocation: number; // 0-1
  }>;

  // Test parameters
  sampleSize: number;
  confidenceLevel: number;
  minimumDetectableEffect: number;

  // Results
  results?: {
    controlMetrics: ModelPerformance;
    testMetrics: Record<string, ModelPerformance>;
    statisticalSignificance: Record<string, {
      pValue: number;
      confidenceInterval: [number, number];
      effectSize: number;
      significant: boolean;
    }>;
    winner?: string;
    recommendation: 'CONTROL' | 'TEST' | 'INCONCLUSIVE';
  };

  // Metadata
  createdAt: number;
  createdBy: string;
  tags: string[];
}

export interface PerformanceSnapshot {
  timestamp: number;
  overallMetrics: {
    totalDecisions: number;
    winRate: number;
    averageReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
  providerMetrics: Record<string, ModelPerformance>;
  ensembleMetrics: {
    accuracy: number;
    consensusLevel: number;
    disagreementIndex: number;
  };
  marketConditions: {
    regime: string;
    volatility: number;
    sentiment: string;
  };
}

export interface DecisionRecord {
  id: string;
  timestamp: number;
  symbol: string;
  decision: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;

  // Provider information
  provider: string;
  model: string;
  version: string;

  // Context
  marketCondition: string;
  volatility: number;
  timeOfDay: string;

  // Execution
  executed: boolean;
  executionPrice?: number;
  executionTime?: number;

  // Outcome
  outcome?: 'PROFIT' | 'LOSS' | 'NEUTRAL';
  pnl?: number;
  returnPercentage?: number;
  holdingPeriod?: number;

  // Test group (if part of A/B test)
  testId?: string;
  testGroupId?: string;

  // Quality metrics
  reasoning?: string;
  dataQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
}

export interface LearningInsights {
  bestPerformingProviders: Array<{
    provider: string;
    model: string;
    accuracy: number;
    profitFactor: number;
    conditions: string[];
  }>;

  worstPerformingProviders: Array<{
    provider: string;
    model: string;
    accuracy: number;
    issues: string[];
  }>;

  marketConditionInsights: Record<string, {
    bestProvider: string;
    bestAccuracy: number;
    worstProvider: string;
    worstAccuracy: number;
  }>;

  timeOfDayInsights: Record<string, {
    bestAccuracy: number;
    bestProvider: string;
    totalDecisions: number;
  }>;

  recommendations: Array<{
    type: 'CONFIGURATION' | 'PROVIDER_SELECTION' | 'RISK_MANAGEMENT' | 'STRATEGY';
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    recommendation: string;
    expectedImpact: string;
    implementation: string;
  }>;
}

export class PerformanceTrackingService {
  private static instance: PerformanceTrackingService;
  private decisionHistory: DecisionRecord[] = [];
  private abTests: Map<string, ABTest> = new Map();
  private performanceCache: Map<string, ModelPerformance> = new Map();
  private snapshots: PerformanceSnapshot[] = [];

  // A/B test management
  private activeTests: Map<string, ABTest> = new Map();
  private testAssignments: Map<string, string> = new Map(); // decisionId -> testId

  private constructor() {
    // Initialize with sample data if needed
  }

  static getInstance(): PerformanceTrackingService {
    if (!PerformanceTrackingService.instance) {
      PerformanceTrackingService.instance = new PerformanceTrackingService();
    }
    return PerformanceTrackingService.instance;
  }

  /**
   * Record a decision for performance tracking
   */
  async recordDecision(record: Omit<DecisionRecord, 'id'>): Promise<string> {
    const decisionId = this.generateDecisionId();

    const fullRecord: DecisionRecord = {
      id: decisionId,
      ...record,
    };

    // Check if this decision is part of an A/B test
    const testAssignment = this.assignToTest(fullRecord);
    if (testAssignment) {
      fullRecord.testId = testAssignment.testId;
      fullRecord.testGroupId = testAssignment.groupId;
    }

    this.decisionHistory.push(fullRecord);

    // Limit history size
    if (this.decisionHistory.length > 50000) {
      this.decisionHistory = this.decisionHistory.slice(-40000);
    }

    tradingLogger.debug('Decision recorded', {
      decisionId,
      provider: record.provider,
      symbol: record.symbol,
      decision: record.decision,
      confidence: record.confidence,
    });

    return decisionId;
  }

  /**
   * Update decision with outcome information
   */
  async updateDecisionOutcome(
    decisionId: string,
    outcome: DecisionRecord['outcome'],
    pnl: number,
    returnPercentage: number,
    holdingPeriod: number
  ): Promise<void> {
    const record = this.decisionHistory.find(r => r.id === decisionId);

    if (!record) {
      tradingLogger.warn('Decision not found for outcome update', { decisionId });
      return;
    }

    record.outcome = outcome;
    record.pnl = pnl;
    record.returnPercentage = returnPercentage;
    record.holdingPeriod = holdingPeriod;

    // Update performance metrics
    await this.updateProviderMetrics(record.provider);

    // Update A/B test results if applicable
    if (record.testId) {
      await this.updateTestResults(record.testId);
    }

    tradingLogger.debug('Decision outcome updated', {
      decisionId,
      outcome,
      pnl,
      returnPercentage,
      provider: record.provider,
    });
  }

  /**
   * Calculate comprehensive performance metrics for a provider
   */
  async calculateProviderPerformance(
    provider: string,
    timeWindow?: { start: number; end: number }
  ): Promise<ModelPerformance> {
    const cacheKey = `${provider}_${timeWindow?.start || 0}_${timeWindow?.end || Date.now()}`;

    // Check cache
    const cached = this.performanceCache.get(cacheKey);
    if (cached && !timeWindow) {
      return cached;
    }

    // Filter decisions for this provider and time window
    let decisions = this.decisionHistory.filter(r =>
      r.provider === provider &&
      r.outcome !== undefined
    );

    if (timeWindow) {
      decisions = decisions.filter(r =>
        r.timestamp >= timeWindow.start && r.timestamp <= timeWindow.end
      );
    }

    if (decisions.length === 0) {
      return this.createEmptyPerformance(provider);
    }

    // Calculate basic metrics
    const totalDecisions = decisions.length;
    const profitableDecisions = decisions.filter(r => r.outcome === 'PROFIT').length;
    const losingDecisions = decisions.filter(r => r.outcome === 'LOSS').length;
    const winRate = profitableDecisions / totalDecisions;

    // Calculate returns
    const returns = decisions.map(r => r.returnPercentage || 0);
    const totalReturns = returns.reduce((sum, r) => sum + r, 0);
    const averageReturn = totalReturns / returns.length;

    // Calculate profit factor
    const profits = decisions.filter(r => r.outcome === 'PROFIT').map(r => r.pnl || 0);
    const losses = decisions.filter(r => r.outcome === 'LOSS').map(r => Math.abs(r.pnl || 0));
    const totalProfits = profits.reduce((sum, p) => sum + p, 0);
    const totalLosses = losses.reduce((sum, l) => sum + l, 0);
    const profitFactor = totalLosses > 0 ? totalProfits / totalLosses : totalProfits > 0 ? 10 : 1;

    // Calculate Sharpe ratio (simplified)
    const returnStd = this.calculateStandardDeviation(returns);
    const sharpeRatio = returnStd > 0 ? averageReturn / returnStd : 0;

    // Calculate max drawdown
    const maxDrawdown = this.calculateMaxDrawdown(decisions);

    // Calculate confidence metrics
    const confidenceValues = decisions.map(r => r.confidence);
    const averageConfidence = confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length;

    // Calculate confidence accuracy (correlation between confidence and correctness)
    const confidenceAccuracy = this.calculateConfidenceAccuracy(decisions);

    // Calculate calibration score
    const calibrationScore = this.calculateCalibrationScore(decisions);

    // Performance by condition
    const performanceByMarketCondition = this.calculatePerformanceByCondition(decisions, 'marketCondition');
    const performanceByTimeOfDay = this.calculatePerformanceByCondition(decisions, 'timeOfDay');
    const performanceByVolatility = this.calculatePerformanceByCondition(decisions, 'volatility');

    // Speed and cost metrics
    const executedDecisions = decisions.filter(r => r.executed);
    const responseTimes = executedDecisions.map(r => r.executionTime || 0);
    const averageResponseTime = responseTimes.length > 0 ?
      responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length : 0;

    // Get model information
    const latestDecision = decisions[decisions.length - 1];

    const performance: ModelPerformance = {
      provider,
      model: latestDecision?.model || 'unknown',
      version: latestDecision?.version || '1.0.0',
      timestamp: Date.now(),

      // Accuracy metrics
      accuracy: winRate,
      precision: this.calculatePrecision(decisions),
      recall: this.calculateRecall(decisions),
      f1Score: this.calculateF1Score(decisions),

      // Trading metrics
      totalDecisions,
      profitableDecisions,
      losingDecisions,
      winRate,
      profitFactor,
      averageReturn,
      sharpeRatio,
      maxDrawdown,

      // Confidence metrics
      averageConfidence,
      confidenceAccuracy,
      calibrationScore,

      // Performance by condition
      performanceByMarketCondition,
      performanceByTimeOfDay,
      performanceByVolatility,

      // Cost and speed metrics
      averageResponseTime,
      averageCostPerDecision: 0, // Would be calculated from actual costs
      totalCost: 0,

      // Reliability metrics
      uptime: 0.95, // Would be calculated from actual uptime
      errorRate: 0.01,
      timeoutRate: 0.005,
    };

    // Cache result
    if (!timeWindow) {
      this.performanceCache.set(cacheKey, performance);
    }

    return performance;
  }

  /**
   * Create a new A/B test
   */
  async createABTest(config: Omit<ABTest, 'id' | 'status' | 'createdAt' | 'results'>): Promise<string> {
    const testId = this.generateTestId();

    const test: ABTest = {
      id: testId,
      status: 'PLANNED',
      createdAt: Date.now(),
      ...config,
    };

    this.abTests.set(testId, test);

    tradingLogger.info('A/B test created', {
      testId,
      name: config.name,
      controlProvider: config.controlGroup.provider,
      testGroups: config.testGroups.length,
    });

    return testId;
  }

  /**
   * Start an A/B test
   */
  async startABTest(testId: string): Promise<void> {
    const test = this.abTests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    if (test.status !== 'PLANNED') {
      throw new Error(`Test ${testId} is not in PLANNED status`);
    }

    test.status = 'RUNNING';
    test.startTime = Date.now();

    this.activeTests.set(testId, test);

    tradingLogger.info('A/B test started', {
      testId,
      name: test.name,
      duration: test.sampleSize,
    });
  }

  /**
   * Stop an A/B test and analyze results
   */
  async stopABTest(testId: string): Promise<ABTest['results']> {
    const test = this.abTests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    if (test.status !== 'RUNNING') {
      throw new Error(`Test ${testId} is not running`);
    }

    test.status = 'COMPLETED';
    test.endTime = Date.now();

    this.activeTests.delete(testId);

    // Analyze results
    const results = await this.analyzeTestResults(testId);
    test.results = results;

    tradingLogger.info('A/B test completed', {
      testId,
      name: test.name,
      winner: results.winner,
      recommendation: results.recommendation,
    });

    return results;
  }

  /**
   * Generate performance snapshot
   */
  async generatePerformanceSnapshot(): Promise<PerformanceSnapshot> {
    const timestamp = Date.now();
    const recentDecisions = this.decisionHistory.filter(r =>
      r.outcome !== undefined &&
      r.timestamp > timestamp - (24 * 60 * 60 * 1000) // Last 24 hours
    );

    // Overall metrics
    const totalDecisions = recentDecisions.length;
    const profitableDecisions = recentDecisions.filter(r => r.outcome === 'PROFIT').length;
    const winRate = totalDecisions > 0 ? profitableDecisions / totalDecisions : 0;

    const returns = recentDecisions.map(r => r.returnPercentage || 0);
    const averageReturn = returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;

    const maxDrawdown = this.calculateMaxDrawdown(recentDecisions);
    const sharpeRatio = this.calculateSharpeRatio(returns);

    // Provider metrics
    const providerMetrics: Record<string, ModelPerformance> = {};
    const uniqueProviders = [...new Set(recentDecisions.map(r => r.provider))];

    for (const provider of uniqueProviders) {
      providerMetrics[provider] = await this.calculateProviderPerformance(provider, {
        start: timestamp - (24 * 60 * 60 * 1000),
        end: timestamp,
      });
    }

    // Ensemble metrics
    const ensembleMetrics = this.calculateEnsembleMetrics(recentDecisions);

    // Market conditions (simplified)
    const marketConditions = {
      regime: 'TRENDING', // Would be determined from actual market data
      volatility: 0.25,
      sentiment: 'NEUTRAL',
    };

    const snapshot: PerformanceSnapshot = {
      timestamp,
      overallMetrics: {
        totalDecisions,
        winRate,
        averageReturn,
        sharpeRatio,
        maxDrawdown,
      },
      providerMetrics,
      ensembleMetrics,
      marketConditions,
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-100);
    }

    return snapshot;
  }

  /**
   * Generate learning insights from performance data
   */
  async generateLearningInsights(): Promise<LearningInsights> {
    const recentDecisions = this.decisionHistory.filter(r =>
      r.outcome !== undefined &&
      r.timestamp > Date.now() - (7 * 24 * 60 * 60 * 1000) // Last 7 days
    );

    // Best performing providers
    const providerPerformance = new Map<string, { accuracy: number; profitFactor: number; decisions: number }>();

    for (const decision of recentDecisions) {
      if (!providerPerformance.has(decision.provider)) {
        providerPerformance.set(decision.provider, { accuracy: 0, profitFactor: 0, decisions: 0 });
      }

      const perf = providerPerformance.get(decision.provider)!;
      perf.decisions++;

      if (decision.outcome === 'PROFIT') {
        perf.accuracy += 1;
        perf.profitFactor += (decision.pnl || 0);
      }
    }

    // Finalize performance metrics
    for (const [provider, perf] of providerPerformance.entries()) {
      perf.accuracy = perf.accuracy / perf.decisions;
      perf.profitFactor = perf.profitFactor / perf.decisions;
    }

    // Sort providers by performance
    const sortedProviders = Array.from(providerPerformance.entries())
      .sort((a, b) => b[1].accuracy - a[1].accuracy);

    const bestPerformingProviders = sortedProviders.slice(0, 3).map(([provider, perf]) => ({
      provider,
      model: 'latest', // Would be determined from actual data
      accuracy: perf.accuracy,
      profitFactor: perf.profitFactor,
      conditions: ['trending', 'normal_volatility'], // Would be determined from actual data
    }));

    const worstPerformingProviders = sortedProviders.slice(-3).map(([provider, perf]) => ({
      provider,
      model: 'latest',
      accuracy: perf.accuracy,
      issues: perf.accuracy < 0.5 ? ['Low accuracy'] : ['High variance'],
    }));

    // Market condition insights
    const marketConditionInsights = this.calculateMarketConditionInsights(recentDecisions);

    // Time of day insights
    const timeOfDayInsights = this.calculateTimeOfDayInsights(recentDecisions);

    // Generate recommendations
    const recommendations = this.generateRecommendations(bestPerformingProviders, worstPerformingProviders);

    return {
      bestPerformingProviders,
      worstPerformingProviders,
      marketConditionInsights,
      timeOfDayInsights,
      recommendations,
    };
  }

  /**
   * Get performance analytics and statistics
   */
  getAnalytics(): {
    totalDecisions: number;
    activeTests: number;
    completedTests: number;
    averageWinRate: number;
    topProvider: string;
    recentSnapshots: number;
  } {
    const totalDecisions = this.decisionHistory.length;
    const activeTests = this.activeTests.size;
    const completedTests = Array.from(this.abTests.values()).filter(t => t.status === 'COMPLETED').length;

    const recentDecisions = this.decisionHistory.filter(r =>
      r.outcome !== undefined &&
      r.timestamp > Date.now() - (7 * 24 * 60 * 60 * 1000)
    );

    const averageWinRate = recentDecisions.length > 0 ?
      recentDecisions.filter(r => r.outcome === 'PROFIT').length / recentDecisions.length : 0;

    const providerPerformance = new Map<string, number>();
    for (const decision of recentDecisions) {
      if (!providerPerformance.has(decision.provider)) {
        providerPerformance.set(decision.provider, 0);
      }
      providerPerformance.set(decision.provider, providerPerformance.get(decision.provider)! + 1);
    }

    const topProvider = Array.from(providerPerformance.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

    return {
      totalDecisions,
      activeTests,
      completedTests,
      averageWinRate,
      topProvider,
      recentSnapshots: this.snapshots.length,
    };
  }

  // Helper methods
  private generateDecisionId(): string {
    return `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTestId(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private assignToTest(decision: DecisionRecord): { testId: string; groupId: string } | null {
    for (const [testId, test] of this.activeTests.entries()) {
      if (test.status === 'RUNNING') {
        // Simple random assignment based on traffic allocation
        const random = Math.random();
        let cumulativeAllocation = 0;

        for (const group of test.testGroups) {
          cumulativeAllocation += group.trafficAllocation;
          if (random <= cumulativeAllocation) {
            return { testId, groupId: group.id };
          }
        }
      }
    }
    return null;
  }

  private async updateProviderMetrics(provider: string): Promise<void> {
    // Clear cache to force recalculation
    for (const [key] of this.performanceCache.entries()) {
      if (key.startsWith(provider + '_')) {
        this.performanceCache.delete(key);
      }
    }
  }

  private async updateTestResults(testId: string): Promise<void> {
    // Results would be recalculated when test is stopped
  }

  private createEmptyPerformance(provider: string): ModelPerformance {
    return {
      provider,
      model: 'unknown',
      version: '1.0.0',
      timestamp: Date.now(),
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      totalDecisions: 0,
      profitableDecisions: 0,
      losingDecisions: 0,
      winRate: 0,
      profitFactor: 1,
      averageReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      averageConfidence: 0,
      confidenceAccuracy: 0,
      calibrationScore: 0,
      performanceByMarketCondition: {},
      performanceByTimeOfDay: {},
      performanceByVolatility: {},
      averageResponseTime: 0,
      averageCostPerDecision: 0,
      totalCost: 0,
      uptime: 0,
      errorRate: 0,
      timeoutRate: 0,
    };
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

    return Math.sqrt(variance);
  }

  private calculateMaxDrawdown(decisions: DecisionRecord[]): number {
    let maxDrawdown = 0;
    let peak = 0;
    let cumulativePnL = 0;

    for (const decision of decisions) {
      if (decision.pnl !== undefined) {
        cumulativePnL += decision.pnl;
        peak = Math.max(peak, cumulativePnL);
        maxDrawdown = Math.max(maxDrawdown, peak - cumulativePnL);
      }
    }

    return maxDrawdown;
  }

  private calculateConfidenceAccuracy(decisions: DecisionRecord[]): number {
    if (decisions.length === 0) return 0;

    let totalSquaredError = 0;
    for (const decision of decisions) {
      const actual = decision.outcome === 'PROFIT' ? 1 : 0;
      const predicted = decision.confidence;
      totalSquaredError += Math.pow(actual - predicted, 2);
    }

    return Math.max(0, 1 - (totalSquaredError / decisions.length));
  }

  private calculateCalibrationScore(decisions: DecisionRecord[]): number {
    // Group decisions by confidence ranges and check calibration
    const confidenceRanges = [
      { min: 0, max: 0.2, decisions: [] as DecisionRecord[] },
      { min: 0.2, max: 0.4, decisions: [] as DecisionRecord[] },
      { min: 0.4, max: 0.6, decisions: [] as DecisionRecord[] },
      { min: 0.6, max: 0.8, decisions: [] as DecisionRecord[] },
      { min: 0.8, max: 1.0, decisions: [] as DecisionRecord[] },
    ];

    for (const decision of decisions) {
      for (const range of confidenceRanges) {
        if (decision.confidence >= range.min && decision.confidence < range.max) {
          range.decisions.push(decision);
          break;
        }
      }
    }

    let totalCalibrationError = 0;
    let validRanges = 0;

    for (const range of confidenceRanges) {
      if (range.decisions.length > 0) {
        const actualAccuracy = range.decisions.filter(d => d.outcome === 'PROFIT').length / range.decisions.length;
        const expectedAccuracy = (range.min + range.max) / 2;
        totalCalibrationError += Math.abs(actualAccuracy - expectedAccuracy);
        validRanges++;
      }
    }

    return validRanges > 0 ? Math.max(0, 1 - (totalCalibrationError / validRanges)) : 0;
  }

  private calculatePerformanceByCondition(
    decisions: DecisionRecord[],
    conditionField: 'marketCondition' | 'timeOfDay' | 'volatility'
  ): Record<string, { accuracy: number; decisions: number; returns: number }> {
    const groups = new Map<string, DecisionRecord[]>();

    for (const decision of decisions) {
      const key = String(decision[conditionField]);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(decision);
    }

    const result: Record<string, { accuracy: number; decisions: number; returns: number }> = {};

    for (const [key, groupDecisions] of groups.entries()) {
      const profitable = groupDecisions.filter(d => d.outcome === 'PROFIT').length;
      const accuracy = groupDecisions.length > 0 ? profitable / groupDecisions.length : 0;
      const returns = groupDecisions.map(d => d.returnPercentage || 0);
      const averageReturn = returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;

      result[key] = {
        accuracy,
        decisions: groupDecisions.length,
        returns: averageReturn,
      };
    }

    return result;
  }

  private calculatePrecision(decisions: DecisionRecord[]): number {
    // Precision = TP / (TP + FP) - simplified for trading
    const buyDecisions = decisions.filter(d => d.decision === 'BUY');
    if (buyDecisions.length === 0) return 0;

    const profitableBuys = buyDecisions.filter(d => d.outcome === 'PROFIT').length;
    return profitableBuys / buyDecisions.length;
  }

  private calculateRecall(decisions: DecisionRecord[]): number {
    // Recall = TP / (TP + FN) - simplified for trading
    const profitableOpportunities = decisions.filter(d => d.returnPercentage && d.returnPercentage > 0);
    const capturedProfits = decisions.filter(d => d.decision === 'BUY' && d.outcome === 'PROFIT');

    return profitableOpportunities.length > 0 ? capturedProfits.length / profitableOpportunities.length : 0;
  }

  private calculateF1Score(decisions: DecisionRecord[]): number {
    const precision = this.calculatePrecision(decisions);
    const recall = this.calculateRecall(decisions);

    return (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  }

  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const std = this.calculateStandardDeviation(returns);

    return std > 0 ? mean / std : 0;
  }

  private async analyzeTestResults(testId: string): Promise<ABTest['results']> {
    const test = this.abTests.get(testId)!;
    const testDecisions = this.decisionHistory.filter(d => d.testId === testId);

    // Calculate metrics for control group
    const controlDecisions = testDecisions.filter(d => !d.testGroupId);
    const controlMetrics = await this.calculateGroupMetrics(controlDecisions);

    // Calculate metrics for test groups
    const testMetrics: Record<string, ModelPerformance> = {};

    for (const group of test.testGroups) {
      const groupDecisions = testDecisions.filter(d => d.testGroupId === group.id);
      testMetrics[group.id] = await this.calculateGroupMetrics(groupDecisions);
    }

    // Statistical significance testing
    const statisticalSignificance: Record<string, any> = {};

    for (const [groupId, metrics] of Object.entries(testMetrics)) {
      statisticalSignificance[groupId] = this.calculateStatisticalSignificance(
        controlMetrics,
        metrics,
        test.confidenceLevel
      );
    }

    // Determine winner
    let winner: string | undefined;
    let recommendation: 'CONTROL' | 'TEST' | 'INCONCLUSIVE' = 'INCONCLUSIVE';

    const significantResults = Object.entries(statisticalSignificance)
      .filter(([_, sig]) => sig.significant && sig.effectSize > 0);

    if (significantResults.length > 0) {
      winner = significantResults[0][0];
      recommendation = 'TEST';
    } else {
      recommendation = 'CONTROL';
    }

    return {
      controlMetrics,
      testMetrics,
      statisticalSignificance,
      winner,
      recommendation,
    };
  }

  private async calculateGroupMetrics(decisions: DecisionRecord[]): Promise<ModelPerformance> {
    if (decisions.length === 0) {
      return this.createEmptyPerformance('test_group');
    }

    // Use existing calculation logic
    return this.calculateProviderMetrics(decisions[0].provider);
  }

  private calculateStatisticalSignificance(
    control: ModelPerformance,
    test: ModelPerformance,
    confidenceLevel: number
  ): any {
    // Simplified statistical significance calculation
    const controlAccuracy = control.accuracy;
    const testAccuracy = test.accuracy;
    const effectSize = testAccuracy - controlAccuracy;

    // Z-score calculation (simplified)
    const pooledSE = Math.sqrt(
      (control.accuracy * (1 - control.accuracy) / control.totalDecisions) +
      (test.accuracy * (1 - test.accuracy) / test.totalDecisions)
    );

    const zScore = pooledSE > 0 ? effectSize / pooledSE : 0;
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));

    const alpha = 1 - (confidenceLevel / 100);
    const significant = pValue < alpha;

    // Confidence interval
    const marginOfError = 1.96 * pooledSE;
    const confidenceInterval: [number, number] = [
      effectSize - marginOfError,
      effectSize + marginOfError,
    ];

    return {
      pValue,
      confidenceInterval,
      effectSize,
      significant,
    };
  }

  private normalCDF(x: number): number {
    // Approximation of normal CDF
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  private erf(x: number): number {
    // Approximation of error function
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  private calculateEnsembleMetrics(decisions: DecisionRecord[]): PerformanceSnapshot['ensembleMetrics'] {
    // Calculate ensemble-specific metrics
    const totalDecisions = decisions.length;
    const consensusLevel = 0.7; // Would be calculated from actual ensemble data
    const disagreementIndex = 0.3; // Would be calculated from actual ensemble data

    return {
      accuracy: decisions.filter(d => d.outcome === 'PROFIT').length / totalDecisions,
      consensusLevel,
      disagreementIndex,
    };
  }

  private calculateMarketConditionInsights(decisions: DecisionRecord[]): LearningInsights['marketConditionInsights'] {
    const insights: LearningInsights['marketConditionInsights'] = {};

    const conditions = [...new Set(decisions.map(d => d.marketCondition))];

    for (const condition of conditions) {
      const conditionDecisions = decisions.filter(d => d.marketCondition === condition);
      const accuracy = conditionDecisions.filter(d => d.outcome === 'PROFIT').length / conditionDecisions.length;

      const providerPerformance = new Map<string, number>();
      for (const decision of conditionDecisions) {
        if (!providerPerformance.has(decision.provider)) {
          providerPerformance.set(decision.provider, 0);
        }
        if (decision.outcome === 'PROFIT') {
          providerPerformance.set(decision.provider, providerPerformance.get(decision.provider)! + 1);
        }
      }

      const sortedProviders = Array.from(providerPerformance.entries())
        .sort((a, b) => b[1] - a[1]);

      insights[condition] = {
        bestProvider: sortedProviders[0]?.[0] || 'unknown',
        bestAccuracy: accuracy,
        worstProvider: sortedProviders[sortedProviders.length - 1]?.[0] || 'unknown',
        worstAccuracy: accuracy, // Would be calculated separately
      };
    }

    return insights;
  }

  private calculateTimeOfDayInsights(decisions: DecisionRecord[]): LearningInsights['timeOfDayInsights'] {
    const insights: LearningInsights['timeOfDayInsights'] = {};

    const timeSlots = ['morning', 'afternoon', 'evening', 'night'];

    for (const slot of timeSlots) {
      const slotDecisions = decisions.filter(d => d.timeOfDay.includes(slot));
      if (slotDecisions.length === 0) continue;

      const accuracy = slotDecisions.filter(d => d.outcome === 'PROFIT').length / slotDecisions.length;

      insights[slot] = {
        bestAccuracy: accuracy,
        bestProvider: 'ensemble', // Would be calculated from actual data
        totalDecisions: slotDecisions.length,
      };
    }

    return insights;
  }

  private generateRecommendations(
    bestProviders: LearningInsights['bestPerformingProviders'],
    worstProviders: LearningInsights['worstPerformingProviders']
  ): LearningInsights['recommendations'] {
    const recommendations: LearningInsights['recommendations'] = [];

    // Provider recommendations
    if (bestProviders.length > 0) {
      recommendations.push({
        type: 'PROVIDER_SELECTION',
        priority: 'HIGH',
        recommendation: `Increase traffic allocation to ${bestProviders[0].provider}`,
        expectedImpact: `Potential ${((bestProviders[0].accuracy - 0.5) * 100).toFixed(1)}% accuracy improvement`,
        implementation: 'Update provider selection weights in ensemble configuration',
      });
    }

    if (worstProviders.length > 0) {
      recommendations.push({
        type: 'PROVIDER_SELECTION',
        priority: 'MEDIUM',
        recommendation: `Reduce or remove ${worstProviders[0].provider} from ensemble`,
        expectedImpact: `Reduce noise and improve overall ensemble accuracy`,
        implementation: 'Remove provider from ensemble or reduce weight in configuration',
      });
    }

    // Configuration recommendations
    recommendations.push({
      type: 'CONFIGURATION',
      priority: 'LOW',
      recommendation: 'Review confidence threshold settings',
      expectedImpact: 'Improve trade execution quality',
      implementation: 'Analyze confidence-accuracy correlation in performance dashboard',
    });

    return recommendations;
  }

  /**
   * Clear all data (for testing)
   */
  clearAllData(): void {
    this.decisionHistory = [];
    this.abTests.clear();
    this.performanceCache.clear();
    this.snapshots = [];
    this.activeTests.clear();
    this.testAssignments.clear();

    tradingLogger.info('Performance tracking data cleared');
  }
}

export default PerformanceTrackingService;