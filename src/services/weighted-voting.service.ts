/**
 * Weighted Voting Service
 *
 * Advanced weighted voting system with machine learning optimization,
 * dynamic weight adjustment, and performance-based voting.
 */

import { AISignal, ProviderMetrics } from '@/types/ai.types';
import { tradingLogger } from '@/utils/logger';

export interface VoteWeight {
  provider: string;
  baseWeight: number;
  performanceWeight: number;
  conditionWeight: number;
  recencyWeight: number;
  costWeight: number;
  totalWeight: number;
  confidence: number;
}

export interface VotingConfig {
  weightFactors: {
    accuracy: number;
    confidence: number;
    speed: number;
    cost: number;
    reliability: number;
    recentPerformance: number;
  };
  dynamicAdjustment: {
    enabled: boolean;
    learningRate: number;
    decayFactor: number;
    minWeight: number;
    maxWeight: number;
  };
  consensusThresholds: {
    strong: number;
    moderate: number;
    weak: number;
  };
  rebalanceFrequency: number;
}

export interface VotingResult {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  consensusLevel: number;
  weightedScores: Record<string, number>;
  voteBreakdown: {
    BUY: { votes: number; weight: number; providers: string[] };
    SELL: { votes: number; weight: number; providers: string[] };
    HOLD: { votes: number; weight: number; providers: string[] };
  };
  executionRecommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  riskAssessment: {
    disagreement: number;
    conviction: number;
    stability: number;
  };
}

export interface PerformanceHistory {
  provider: string;
  timestamp: number;
  accuracy: number;
  confidence: number;
  responseTime: number;
  cost: number;
  marketCondition: string;
  outcome: 'correct' | 'incorrect' | 'neutral';
}

export class WeightedVotingService {
  private static instance: WeightedVotingService;
  private config: VotingConfig;
  private performanceHistory: Map<string, PerformanceHistory[]> = new Map();
  private weightsCache: Map<string, VoteWeight[]> = new Map();
  private lastRebalance: number = 0;

  private constructor() {
    this.config = {
      weightFactors: {
        accuracy: 0.35,
        confidence: 0.25,
        speed: 0.15,
        cost: 0.10,
        reliability: 0.10,
        recentPerformance: 0.05,
      },
      dynamicAdjustment: {
        enabled: true,
        learningRate: 0.01,
        decayFactor: 0.95,
        minWeight: 0.1,
        maxWeight: 2.0,
      },
      consensusThresholds: {
        strong: 0.8,
        moderate: 0.6,
        weak: 0.4,
      },
      rebalanceFrequency: 60 * 60 * 1000, // 1 hour
    };
  }

  static getInstance(): WeightedVotingService {
    if (!WeightedVotingService.instance) {
      WeightedVotingService.instance = new WeightedVotingService();
    }
    return WeightedVotingService.instance;
  }

  /**
   * Calculate weighted voting result with ML optimization
   */
  async calculateWeightedVote(
    signals: AISignal[],
    marketCondition?: string,
    providerMetrics?: Record<string, ProviderMetrics>
  ): Promise<VotingResult> {
    const startTime = performance.now();

    try {
      // Calculate dynamic weights for each provider
      const voteWeights = await this.calculateVoteWeights(signals, marketCondition, providerMetrics);

      // Apply weighted voting
      const weightedScores = this.applyWeightedVoting(signals, voteWeights);

      // Calculate consensus and confidence
      const consensusResult = this.calculateConsensus(weightedScores, voteWeights);

      // Generate vote breakdown
      const voteBreakdown = this.generateVoteBreakdown(signals, voteWeights);

      // Assess execution recommendation
      const executionRecommendation = this.generateExecutionRecommendation(
        consensusResult.action,
        consensusResult.confidence,
        consensusResult.consensusLevel
      );

      // Calculate risk assessment
      const riskAssessment = this.calculateRiskAssessment(voteBreakdown, consensusResult);

      const result: VotingResult = {
        action: consensusResult.action,
        confidence: consensusResult.confidence,
        consensusLevel: consensusResult.consensusLevel,
        weightedScores,
        voteBreakdown,
        executionRecommendation,
        riskAssessment,
      };

      const duration = performance.now() - startTime;
      tradingLogger.performance('weighted_voting_calculation', duration, {
        signalsCount: signals.length,
        action: result.action,
        confidence: result.confidence,
        consensusLevel: result.consensusLevel,
      });

      return result;

    } catch (error) {
      const duration = performance.now() - startTime;
      tradingLogger.error('Weighted voting calculation failed', {
        signalsCount: signals.length,
        error: error instanceof Error ? error.message : error,
        duration,
      });

      // Fallback to simple majority voting
      return this.calculateSimpleMajority(signals);
    }
  }

  /**
   * Calculate dynamic weights for providers
   */
  private async calculateVoteWeights(
    signals: AISignal[],
    marketCondition?: string,
    providerMetrics?: Record<string, ProviderMetrics>
  ): Promise<VoteWeight[]> {
    const voteWeights: VoteWeight[] = [];

    for (const signal of signals) {
      const providerName = signal.provider || 'unknown';
      const metrics = providerMetrics?.[providerName];

      if (!metrics) {
        continue;
      }

      // Calculate base weight from accuracy
      const baseWeight = metrics.accuracy || 0.5;

      // Calculate performance weight
      const performanceWeight = this.calculatePerformanceWeight(providerName, marketCondition);

      // Calculate condition weight (market condition specific performance)
      const conditionWeight = this.calculateConditionWeight(providerName, marketCondition);

      // Calculate recency weight (recent performance emphasis)
      const recencyWeight = this.calculateRecencyWeight(providerName);

      // Calculate cost weight (inverse of cost)
      const costWeight = this.calculateCostWeight(metrics.totalCost || 0);

      // Calculate total weight
      const totalWeight = this.calculateTotalWeight(
        baseWeight,
        performanceWeight,
        conditionWeight,
        recencyWeight,
        costWeight
      );

      voteWeights.push({
        provider: providerName,
        baseWeight,
        performanceWeight,
        conditionWeight,
        recencyWeight,
        costWeight,
        totalWeight,
        confidence: signal.confidence || 0.5,
      });
    }

    // Normalize weights
    return this.normalizeWeights(voteWeights);
  }

  /**
   * Calculate performance weight based on historical accuracy
   */
  private calculatePerformanceWeight(provider: string, marketCondition?: string): number {
    const history = this.performanceHistory.get(provider) || [];
    if (history.length === 0) return 0.5;

    // Get recent performance (last 50 decisions)
    const recentHistory = history.slice(-50);
    const accuracy = recentHistory.filter(h => h.outcome === 'correct').length / recentHistory.length;

    // Apply market condition adjustment if available
    if (marketCondition) {
      const conditionHistory = recentHistory.filter(h => h.marketCondition === marketCondition);
      if (conditionHistory.length > 0) {
        const conditionAccuracy = conditionHistory.filter(h => h.outcome === 'correct').length / conditionHistory.length;
        // Weight recent condition performance more heavily
        return (accuracy * 0.7 + conditionAccuracy * 0.3);
      }
    }

    return accuracy;
  }

  /**
   * Calculate condition-specific weight
   */
  private calculateConditionWeight(provider: string, marketCondition?: string): number {
    if (!marketCondition) return 1.0;

    const history = this.performanceHistory.get(provider) || [];
    const conditionHistory = history.filter(h => h.marketCondition === marketCondition);

    if (conditionHistory.length === 0) return 1.0;

    const accuracy = conditionHistory.filter(h => h.outcome === 'correct').length / conditionHistory.length;
    return Math.max(0.5, accuracy); // Minimum 0.5 weight
  }

  /**
   * Calculate recency weight (emphasize recent performance)
   */
  private calculateRecencyWeight(provider: string): number {
    const history = this.performanceHistory.get(provider) || [];
    if (history.length === 0) return 1.0;

    // Get last 10 decisions
    const recentHistory = history.slice(-10);
    if (recentHistory.length === 0) return 1.0;

    // Calculate recency score with exponential decay
    let recencyScore = 0;
    const now = Date.now();

    for (let i = 0; i < recentHistory.length; i++) {
      const record = recentHistory[i];
      const ageInHours = (now - record.timestamp) / (1000 * 60 * 60);
      const decay = Math.exp(-ageInHours / 24); // 24-hour half-life
      const score = record.outcome === 'correct' ? decay : -decay * 0.5;
      recencyScore += score;
    }

    // Normalize to 0.5 - 1.5 range
    const normalizedScore = Math.max(0.5, Math.min(1.5, 1 + recencyScore / recentHistory.length));
    return normalizedScore;
  }

  /**
   * Calculate cost weight (inverse of cost)
   */
  private calculateCostWeight(totalCost: number): number {
    // Normalize cost to weight (lower cost = higher weight)
    // Using a logarithmic scale to prevent extreme values
    const costScore = Math.max(0.1, Math.log(Math.max(1, 100 - totalCost)) / Math.log(100));
    return Math.max(0.5, Math.min(1.5, costScore));
  }

  /**
   * Calculate total weight from component weights
   */
  private calculateTotalWeight(
    baseWeight: number,
    performanceWeight: number,
    conditionWeight: number,
    recencyWeight: number,
    costWeight: number
  ): number {
    const { weightFactors } = this.config;

    return (
      baseWeight * weightFactors.accuracy +
      performanceWeight * weightFactors.confidence +
      conditionWeight * weightFactors.speed +
      recencyWeight * weightFactors.cost +
      costWeight * weightFactors.reliability +
      recencyWeight * weightFactors.recentPerformance
    );
  }

  /**
   * Normalize weights to sum to 1
   */
  private normalizeWeights(weights: VoteWeight[]): VoteWeight[] {
    const totalWeight = weights.reduce((sum, w) => sum + w.totalWeight, 0);

    if (totalWeight === 0) {
      return weights.map(w => ({ ...w, totalWeight: 1 / weights.length }));
    }

    return weights.map(w => ({
      ...w,
      totalWeight: w.totalWeight / totalWeight,
    }));
  }

  /**
   * Apply weighted voting to signals
   */
  private applyWeightedVoting(signals: AISignal[], voteWeights: VoteWeight[]): Record<string, number> {
    const weightedScores: Record<string, number> = { BUY: 0, SELL: 0, HOLD: 0 };

    for (let i = 0; i < signals.length; i++) {
      const signal = signals[i];
      const weight = voteWeights.find(w => w.provider === signal.provider);

      if (!weight) continue;

      const action = signal.action;
      const weightedVote = weight.totalWeight * signal.confidence;
      weightedScores[action] += weightedVote;
    }

    return weightedScores;
  }

  /**
   * Calculate consensus and final decision
   */
  private calculateConsensus(
    weightedScores: Record<string, number>,
    voteWeights: VoteWeight[]
  ): { action: 'BUY' | 'SELL' | 'HOLD'; confidence: number; consensusLevel: number } {
    // Find the action with highest weighted score
    const actions = Object.entries(weightedScores);
    actions.sort((a, b) => b[1] - a[1]);

    const [winningAction, winningScore] = actions[0];
    const totalScore = Object.values(weightedScores).reduce((sum, score) => sum + score, 0);

    // Calculate confidence as proportion of total score
    const confidence = totalScore > 0 ? winningScore / totalScore : 0;

    // Calculate consensus level (agreement among providers)
    const consensusLevel = this.calculateConsensusLevel(weightedScores, voteWeights);

    return {
      action: winningAction as 'BUY' | 'SELL' | 'HOLD',
      confidence,
      consensusLevel,
    };
  }

  /**
   * Calculate consensus level (agreement measure)
   */
  private calculateConsensusLevel(
    weightedScores: Record<string, number>,
    voteWeights: VoteWeight[]
  ): number {
    const totalScore = Object.values(weightedScores).reduce((sum, score) => sum + score, 0);
    if (totalScore === 0) return 0;

    // Calculate entropy-based consensus
    const probabilities = Object.values(weightedScores).map(score => score / totalScore);
    const entropy = -probabilities.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
    const maxEntropy = Math.log2(Object.keys(weightedScores).length);

    // Consensus is 1 - normalized entropy
    const consensusLevel = 1 - (entropy / maxEntropy);
    return consensusLevel;
  }

  /**
   * Generate detailed vote breakdown
   */
  private generateVoteBreakdown(signals: AISignal[], voteWeights: VoteWeight[]): VotingResult['voteBreakdown'] {
    const breakdown: VotingResult['voteBreakdown'] = {
      BUY: { votes: 0, weight: 0, providers: [] },
      SELL: { votes: 0, weight: 0, providers: [] },
      HOLD: { votes: 0, weight: 0, providers: [] },
    };

    for (const signal of signals) {
      const weight = voteWeights.find(w => w.provider === signal.provider);
      if (!weight) continue;

      const action = signal.action;
      breakdown[action].votes++;
      breakdown[action].weight += weight.totalWeight;
      breakdown[action].providers.push(signal.provider);
    }

    return breakdown;
  }

  /**
   * Generate execution recommendation based on confidence and consensus
   */
  private generateExecutionRecommendation(
    action: 'BUY' | 'SELL' | 'HOLD',
    confidence: number,
    consensusLevel: number
  ): VotingResult['executionRecommendation'] {
    const { consensusThresholds } = this.config;

    if (action === 'HOLD') {
      if (consensusLevel > consensusThresholds.strong) {
        return 'HOLD';
      } else {
        return 'HOLD';
      }
    }

    if (confidence > 0.8 && consensusLevel > consensusThresholds.strong) {
      return action === 'BUY' ? 'STRONG_BUY' : 'STRONG_SELL';
    } else if (confidence > 0.6 && consensusLevel > consensusThresholds.moderate) {
      return action;
    } else {
      return 'HOLD';
    }
  }

  /**
   * Calculate risk assessment metrics
   */
  private calculateRiskAssessment(
    voteBreakdown: VotingResult['voteBreakdown'],
    consensusResult: { consensusLevel: number }
  ): VotingResult['riskAssessment'] {
    // Calculate disagreement (how split the votes are)
    const totalVotes = Object.values(voteBreakdown).reduce((sum, b) => sum + b.votes, 0);
    const maxVotes = Math.max(...Object.values(voteBreakdown).map(b => b.votes));
    const disagreement = totalVotes > 0 ? 1 - (maxVotes / totalVotes) : 0;

    // Calculate conviction (strength of the winning vote)
    const winningAction = Object.entries(voteBreakdown)
      .reduce((max, [action, data]) => data.weight > max.weight ? { action, weight: data.weight } : max, { action: 'HOLD', weight: 0 });
    const conviction = winningAction.weight;

    // Calculate stability (consistency of voting patterns)
    const stability = consensusResult.consensusLevel;

    return {
      disagreement,
      conviction,
      stability,
    };
  }

  /**
   * Simple majority voting fallback
   */
  private calculateSimpleMajority(signals: AISignal[]): VotingResult {
    const votes: Record<string, number> = { BUY: 0, SELL: 0, HOLD: 0 };

    for (const signal of signals) {
      votes[signal.action]++;
    }

    const [action] = Object.entries(votes).reduce((max, [a, count]) =>
      count > max.count ? [a, count] : max, ['HOLD', 0]
    );

    const totalVotes = Object.values(votes).reduce((sum, count) => sum + count, 0);
    const confidence = totalVotes > 0 ? votes[action] / totalVotes : 0;

    return {
      action: action as 'BUY' | 'SELL' | 'HOLD',
      confidence,
      consensusLevel: confidence,
      weightedScores: votes,
      voteBreakdown: {
        BUY: { votes: votes.BUY, weight: votes.BUY, providers: [] },
        SELL: { votes: votes.SELL, weight: votes.SELL, providers: [] },
        HOLD: { votes: votes.HOLD, weight: votes.HOLD, providers: [] },
      },
      executionRecommendation: confidence > 0.6 ? action : 'HOLD',
      riskAssessment: {
        disagreement: 1 - confidence,
        conviction: confidence,
        stability: confidence,
      },
    };
  }

  /**
   * Update performance history for learning
   */
  async updatePerformanceHistory(
    provider: string,
    outcome: PerformanceHistory['outcome'],
    confidence: number,
    marketCondition: string,
    metrics?: {
      responseTime?: number;
      cost?: number;
    }
  ): Promise<void> {
    if (!this.performanceHistory.has(provider)) {
      this.performanceHistory.set(provider, []);
    }

    const history = this.performanceHistory.get(provider)!;
    history.push({
      provider,
      timestamp: Date.now(),
      accuracy: outcome === 'correct' ? 1 : outcome === 'incorrect' ? 0 : 0.5,
      confidence,
      responseTime: metrics?.responseTime || 0,
      cost: metrics?.cost || 0,
      marketCondition,
      outcome,
    });

    // Limit history size
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    // Clear weights cache to force recalculation
    this.weightsCache.clear();

    tradingLogger.debug('Performance history updated', {
      provider,
      outcome,
      confidence,
      marketCondition,
      historySize: history.length,
    });
  }

  /**
   * Get voting analytics
   */
  getVotingAnalytics(): {
    totalVotes: number;
    averageConfidence: number;
    averageConsensus: number;
    providerPerformance: Record<string, any>;
    recentAccuracy: number;
  } {
    let totalVotes = 0;
    let totalConfidence = 0;
    let totalConsensus = 0;

    const providerPerformance: Record<string, any> = {};

    for (const [provider, history] of this.performanceHistory.entries()) {
      const recentHistory = history.slice(-50);
      const accuracy = recentHistory.filter(h => h.outcome === 'correct').length / recentHistory.length;
      const avgConfidence = recentHistory.reduce((sum, h) => sum + h.confidence, 0) / recentHistory.length;

      providerPerformance[provider] = {
        totalDecisions: history.length,
        recentDecisions: recentHistory.length,
        accuracy,
        avgConfidence,
        avgResponseTime: recentHistory.reduce((sum, h) => sum + h.responseTime, 0) / recentHistory.length,
        avgCost: recentHistory.reduce((sum, h) => sum + h.cost, 0) / recentHistory.length,
      };

      totalVotes += recentHistory.length;
      totalConfidence += avgConfidence * recentHistory.length;
    }

    const overallAccuracy = Object.values(providerPerformance)
      .reduce((sum, p) => sum + p.accuracy, 0) / Object.keys(providerPerformance).length;

    return {
      totalVotes,
      averageConfidence: totalVotes > 0 ? totalConfidence / totalVotes : 0,
      averageConsensus: 0.7, // Would be calculated from actual voting results
      providerPerformance,
      recentAccuracy: overallAccuracy,
    };
  }

  /**
   * Update voting configuration
   */
  updateConfig(newConfig: Partial<VotingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    tradingLogger.info('Voting configuration updated', { config: this.config });
  }

  /**
   * Get current voting configuration
   */
  getConfig(): VotingConfig {
    return { ...this.config };
  }

  /**
   * Clear performance history (for testing)
   */
  clearHistory(): void {
    this.performanceHistory.clear();
    this.weightsCache.clear();
    tradingLogger.info('Voting performance history cleared');
  }
}

export default WeightedVotingService;