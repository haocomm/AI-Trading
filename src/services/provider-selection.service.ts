/**
 * Provider Selection Service
 *
 * Dynamic provider selection based on market conditions,
 * performance metrics, and cost optimization.
 */

import { ProviderMetrics } from '@/types/ai.types';
import { tradingLogger } from '@/utils/logger';

export interface ProviderProfile {
  name: string;
  strengths: string[];
  weaknesses: string[];
  bestConditions: string[];
  costPerRequest: number;
  averageResponseTime: number;
  reliability: number;
  accuracy: Record<string, number>; // By market condition
  currentLoad: number;
  lastUsed: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MarketCondition {
  regime: 'trending' | 'ranging' | 'volatile' | 'reversal';
  volatility: number;
  liquidity: 'HIGH' | 'MEDIUM' | 'LOW';
  timeOfDay: 'ASIA' | 'EUROPE' | 'AMERICAS' | 'OFF_HOURS';
  sentiment: 'positive' | 'neutral' | 'negative';
  complexity: 'LOW' | 'MEDIUM' | 'HIGH'; // Analysis complexity required
}

export interface SelectionCriteria {
  prioritizeAccuracy: boolean;
  prioritizeSpeed: boolean;
  prioritizeCost: boolean;
  maxProviders: number;
  minReliability: number;
  budgetConstraints?: {
    maxCostPerDecision: number;
    dailyBudget: number;
    currentSpend: number;
  };
  diversification: boolean;
  loadBalancing: boolean;
}

export interface SelectionResult {
  selectedProviders: string[];
  selectionReason: string[];
  expectedPerformance: {
    accuracy: number;
    responseTime: number;
    cost: number;
    reliability: number;
  };
  riskFactors: string[];
  alternatives: string[];
}

export interface PerformanceRecord {
  provider: string;
  timestamp: number;
  marketCondition: string;
  accuracy: number;
  responseTime: number;
  cost: number;
  success: boolean;
  confidence: number;
}

export class ProviderSelectionService {
  private static instance: ProviderSelectionService;
  private providerProfiles: Map<string, ProviderProfile> = new Map();
  private performanceHistory: Map<string, PerformanceRecord[]> = new Map();
  private currentLoads: Map<string, number> = new Map();
  private selectionCache: Map<string, SelectionResult> = new Map();

  private constructor() {
    this.initializeProviderProfiles();
  }

  static getInstance(): ProviderSelectionService {
    if (!ProviderSelectionService.instance) {
      ProviderSelectionService.instance = new ProviderSelectionService();
    }
    return ProviderSelectionService.instance;
  }

  /**
   * Select optimal providers for current conditions
   */
  async selectOptimalProviders(
    availableProviders: string[],
    marketCondition: MarketCondition,
    criteria: SelectionCriteria,
    providerMetrics?: Record<string, ProviderMetrics>
  ): Promise<SelectionResult> {
    const startTime = performance.now();

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(availableProviders, marketCondition, criteria);
      const cached = this.selectionCache.get(cacheKey);
      if (cached && (Date.now() - cached.expectedPerformance.responseTime) < 300000) { // 5 minute cache
        return cached;
      }

      // Score each provider
      const providerScores = await this.scoreProviders(
        availableProviders,
        marketCondition,
        criteria,
        providerMetrics
      );

      // Select top providers
      const selectedProviders = this.selectTopProviders(providerScores, criteria);

      // Generate selection reasoning
      const selectionReason = this.generateSelectionReason(selectedProviders, marketCondition);

      // Calculate expected performance
      const expectedPerformance = this.calculateExpectedPerformance(selectedProviders, providerMetrics);

      // Identify risk factors
      const riskFactors = this.identifyRiskFactors(selectedProviders, marketCondition);

      // Generate alternatives
      const alternatives = this.generateAlternatives(providerScores, selectedProviders, criteria);

      const result: SelectionResult = {
        selectedProviders: selectedProviders.map(p => p.name),
        selectionReason,
        expectedPerformance,
        riskFactors,
        alternatives,
      };

      // Cache result
      this.selectionCache.set(cacheKey, result);

      const duration = performance.now() - startTime;
      tradingLogger.performance('provider_selection', duration, {
        providersCount: availableProviders.length,
        selectedCount: selectedProviders.length,
        marketRegime: marketCondition.regime,
        topProvider: selectedProviders[0]?.name,
      });

      return result;

    } catch (error) {
      const duration = performance.now() - startTime;
      tradingLogger.error('Provider selection failed', {
        providersCount: availableProviders.length,
        error: error instanceof Error ? error.message : error,
        duration,
      });

      // Fallback to basic selection
      return this.createFallbackSelection(availableProviders, criteria);
    }
  }

  /**
   * Score providers based on criteria and conditions
   */
  private async scoreProviders(
    providers: string[],
    marketCondition: MarketCondition,
    criteria: SelectionCriteria,
    providerMetrics?: Record<string, ProviderMetrics>
  ): Promise<Array<{ provider: string; score: number; profile: ProviderProfile }>> {
    const scores = [];

    for (const providerName of providers) {
      const profile = this.providerProfiles.get(providerName);
      const metrics = providerMetrics?.[providerName];

      if (!profile || !metrics) {
        continue;
      }

      let score = 0;

      // Base score from overall accuracy
      score += metrics.accuracy * 0.25;

      // Market condition-specific performance
      const conditionKey = this.getConditionKey(marketCondition);
      const conditionAccuracy = profile.accuracy[conditionKey] || profile.accuracy.overall || 0.5;
      score += conditionAccuracy * 0.20;

      // Response time score (lower is better)
      const responseTimeScore = Math.max(0, 1 - (metrics.averageResponseTime / 10000));
      score += responseTimeScore * 0.15;

      // Reliability score
      score += profile.reliability * 0.15;

      // Cost score (lower is better)
      const costScore = Math.max(0, 1 - (profile.costPerRequest / 100));
      score += costScore * 0.10;

      // Load balancing score
      const currentLoad = this.currentLoads.get(providerName) || 0;
      const loadScore = Math.max(0, 1 - currentLoad);
      score += loadScore * 0.10;

      // Recency score (recent usage penalty)
      const timeSinceLastUse = Date.now() - profile.lastUsed;
      const recencyScore = Math.min(1, timeSinceLastUse / (5 * 60 * 1000)); // 5 minutes
      score += recencyScore * 0.05;

      // Apply criteria adjustments
      score = this.applyCriteriaAdjustments(score, profile, criteria, marketCondition);

      scores.push({
        provider: providerName,
        score,
        profile,
      });
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Apply criteria-specific adjustments to scores
   */
  private applyCriteriaAdjustments(
    baseScore: number,
    profile: ProviderProfile,
    criteria: SelectionCriteria,
    marketCondition: MarketCondition
  ): number {
    let adjustedScore = baseScore;

    // Accuracy prioritization
    if (criteria.prioritizeAccuracy) {
      const accuracyBonus = profile.accuracy.overall || 0.5;
      adjustedScore *= (1 + accuracyBonus * 0.2);
    }

    // Speed prioritization
    if (criteria.prioritizeSpeed) {
      const speedBonus = Math.max(0, 1 - (profile.averageResponseTime / 5000));
      adjustedScore *= (1 + speedBonus * 0.2);
    }

    // Cost prioritization
    if (criteria.prioritizeCost) {
      const costBonus = Math.max(0, 1 - (profile.costPerRequest / 50));
      adjustedScore *= (1 + costBonus * 0.2);
    }

    // Reliability minimum check
    if (profile.reliability < criteria.minReliability) {
      adjustedScore *= 0.5; // Penalize low reliability
    }

    // Budget constraints
    if (criteria.budgetConstraints) {
      const { maxCostPerDecision, dailyBudget, currentSpend } = criteria.budgetConstraints;

      if (profile.costPerRequest > maxCostPerDecision) {
        adjustedScore *= 0.3; // Heavy penalty for exceeding cost per decision
      }

      if (currentSpend + profile.costPerRequest > dailyBudget) {
        adjustedScore *= 0.1; // Very heavy penalty for exceeding daily budget
      }
    }

    // Market condition matching
    const conditionKey = this.getConditionKey(marketCondition);
    if (profile.bestConditions.includes(conditionKey)) {
      adjustedScore *= 1.15; // Bonus for good condition match
    }

    // Priority adjustment
    switch (profile.priority) {
      case 'HIGH':
        adjustedScore *= 1.1;
        break;
      case 'MEDIUM':
        adjustedScore *= 1.0;
        break;
      case 'LOW':
        adjustedScore *= 0.9;
        break;
    }

    return adjustedScore;
  }

  /**
   * Select top providers based on scores and criteria
   */
  private selectTopProviders(
    scoredProviders: Array<{ provider: string; score: number; profile: ProviderProfile }>,
    criteria: SelectionCriteria
  ): Array<{ name: string; score: number; profile: ProviderProfile }> {
    let selected = scoredProviders.slice(0, criteria.maxProviders);

    // Apply diversification if required
    if (criteria.diversification && selected.length > 1) {
      selected = this.applyDiversification(selected, criteria.maxProviders);
    }

    // Apply load balancing if required
    if (criteria.loadBalancing) {
      selected = this.applyLoadBalancing(selected);
    }

    return selected;
  }

  /**
   * Apply diversification to provider selection
   */
  private applyDiversification(
    providers: Array<{ provider: string; score: number; profile: ProviderProfile }>,
    maxProviders: number
  ): Array<{ name: string; score: number; profile: ProviderProfile }> {
    // For now, return top providers
    // In a full implementation, this would ensure variety in provider types/models
    return providers.slice(0, maxProviders);
  }

  /**
   * Apply load balancing to provider selection
   */
  private applyLoadBalancing(
    providers: Array<{ provider: string; score: number; profile: ProviderProfile }>
  ): Array<{ name: string; score: number; profile: ProviderProfile }> {
    // Sort by current load (ascending) then by score (descending)
    return providers.sort((a, b) => {
      const loadA = this.currentLoads.get(a.provider) || 0;
      const loadB = this.currentLoads.get(b.provider) || 0;

      if (loadA !== loadB) {
        return loadA - loadB; // Lower load first
      }

      return b.score - a.score; // Higher score first
    });
  }

  /**
   * Generate selection reasoning
   */
  private generateSelectionReason(
    selectedProviders: Array<{ name: string; score: number; profile: ProviderProfile }>,
    marketCondition: MarketCondition
  ): string[] {
    const reasons: string[] = [];

    if (selectedProviders.length > 0) {
      const top = selectedProviders[0];
      reasons.push(`Selected ${top.name} as primary provider (score: ${top.score.toFixed(2)})`);

      if (top.profile.bestConditions.includes(this.getConditionKey(marketCondition))) {
        reasons.push(`${top.name} performs well in current market conditions`);
      }

      if (top.profile.reliability > 0.9) {
        reasons.push(`${top.name} has high reliability (${(top.profile.reliability * 100).toFixed(1)}%)`);
      }

      if (selectedProviders.length > 1) {
        reasons.push(`Using ${selectedProviders.length} providers for ensemble decision`);
        const diversity = selectedProviders.map(p => p.name).join(', ');
        reasons.push(`Ensemble diversity: ${diversity}`);
      }
    }

    return reasons;
  }

  /**
   * Calculate expected performance metrics
   */
  private calculateExpectedPerformance(
    selectedProviders: Array<{ name: string; score: number; profile: ProviderProfile }>,
    providerMetrics?: Record<string, ProviderMetrics>
  ): SelectionResult['expectedPerformance'] {
    if (selectedProviders.length === 0) {
      return {
        accuracy: 0.5,
        responseTime: 5000,
        cost: 50,
        reliability: 0.8,
      };
    }

    let totalAccuracy = 0;
    let totalResponseTime = 0;
    let totalCost = 0;
    let totalReliability = 0;

    for (const provider of selectedProviders) {
      const metrics = providerMetrics?.[provider.name];
      if (metrics) {
        totalAccuracy += metrics.accuracy;
        totalResponseTime += metrics.averageResponseTime;
        totalCost += provider.profile.costPerRequest;
        totalReliability += provider.profile.reliability;
      }
    }

    const count = selectedProviders.length;

    return {
      accuracy: totalAccuracy / count,
      responseTime: totalResponseTime / count,
      cost: totalCost,
      reliability: totalReliability / count,
    };
  }

  /**
   * Identify risk factors for selected providers
   */
  private identifyRiskFactors(
    selectedProviders: Array<{ name: string; score: number; profile: ProviderProfile }>,
    marketCondition: MarketCondition
  ): string[] {
    const riskFactors: string[] = [];

    for (const provider of selectedProviders) {
      // Reliability risks
      if (provider.profile.reliability < 0.8) {
        riskFactors.push(`${provider.name} has low reliability (${(provider.profile.reliability * 100).toFixed(1)}%)`);
      }

      // Cost risks
      if (provider.profile.costPerRequest > 50) {
        riskFactors.push(`${provider.name} has high cost per request ($${provider.profile.costPerRequest})`);
      }

      // Speed risks
      if (provider.profile.averageResponseTime > 8000) {
        riskFactors.push(`${provider.name} has slow response time (${provider.profile.averageResponseTime}ms)`);
      }

      // Load risks
      const currentLoad = this.currentLoads.get(provider.name) || 0;
      if (currentLoad > 0.8) {
        riskFactors.push(`${provider.name} is currently under high load`);
      }

      // Condition mismatch risks
      const conditionKey = this.getConditionKey(marketCondition);
      if (!provider.profile.bestConditions.includes(conditionKey)) {
        riskFactors.push(`${provider.name} may not perform optimally in current market conditions`);
      }
    }

    // Ensemble-specific risks
    if (selectedProviders.length > 3) {
      riskFactors.push('Large ensemble size may increase latency and cost');
    }

    if (selectedProviders.length === 1) {
      riskFactors.push('Single provider selection lacks redundancy');
    }

    return riskFactors;
  }

  /**
   * Generate alternative provider selections
   */
  private generateAlternatives(
    allProviders: Array<{ provider: string; score: number; profile: ProviderProfile }>,
    selectedProviders: Array<{ name: string; score: number; profile: ProviderProfile }>,
    criteria: SelectionCriteria
  ): string[] {
    const selectedNames = new Set(selectedProviders.map(p => p.name));
    const alternatives: string[] = [];

    // Find next best providers
    for (const provider of allProviders) {
      if (!selectedNames.has(provider.provider) && alternatives.length < 3) {
        alternatives.push(provider.provider);
      }
    }

    return alternatives;
  }

  /**
   * Update provider performance for learning
   */
  async updateProviderPerformance(
    provider: string,
    record: Omit<PerformanceRecord, 'provider' | 'timestamp'>
  ): Promise<void> {
    if (!this.performanceHistory.has(provider)) {
      this.performanceHistory.set(provider, []);
    }

    const history = this.performanceHistory.get(provider)!;
    history.push({
      provider,
      timestamp: Date.now(),
      ...record,
    });

    // Limit history size
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    // Update provider profile
    await this.updateProviderProfile(provider);

    // Clear cache
    this.selectionCache.clear();

    tradingLogger.debug('Provider performance updated', {
      provider,
      success: record.success,
      accuracy: record.accuracy,
      marketCondition: record.marketCondition,
    });
  }

  /**
   * Update provider profile based on performance history
   */
  private async updateProviderProfile(provider: string): Promise<void> {
    const history = this.performanceHistory.get(provider);
    const profile = this.providerProfiles.get(provider);

    if (!history || !profile) {
      return;
    }

    // Update accuracy by market condition
    const conditionGroups = new Map<string, PerformanceRecord[]>();
    for (const record of history) {
      if (!conditionGroups.has(record.marketCondition)) {
        conditionGroups.set(record.marketCondition, []);
      }
      conditionGroups.get(record.marketCondition)!.push(record);
    }

    for (const [condition, records] of conditionGroups.entries()) {
      const accuracy = records.filter(r => r.success).length / records.length;
      profile.accuracy[condition] = accuracy;
    }

    // Update overall accuracy
    const overallAccuracy = history.filter(r => r.success).length / history.length;
    profile.accuracy.overall = overallAccuracy;

    // Update average response time
    const avgResponseTime = history.reduce((sum, r) => sum + r.responseTime, 0) / history.length;
    profile.averageResponseTime = avgResponseTime;

    // Update reliability
    const recentHistory = history.slice(-100);
    const reliability = recentHistory.filter(r => r.success).length / recentHistory.length;
    profile.reliability = reliability;
  }

  /**
   * Get provider analytics
   */
  getProviderAnalytics(): Record<string, any> {
    const analytics: Record<string, any> = {};

    for (const [provider, profile] of this.providerProfiles.entries()) {
      const history = this.performanceHistory.get(provider) || [];
      const recentHistory = history.slice(-50);

      analytics[provider] = {
        profile,
        totalRequests: history.length,
        recentRequests: recentHistory.length,
        overallAccuracy: profile.accuracy.overall || 0,
        recentAccuracy: recentHistory.filter(r => r.success).length / recentHistory.length,
        averageResponseTime: profile.averageResponseTime,
        currentLoad: this.currentLoads.get(provider) || 0,
        lastUsed: profile.lastUsed,
        performanceByCondition: profile.accuracy,
      };
    }

    return analytics;
  }

  /**
   * Initialize provider profiles
   */
  private initializeProviderProfiles(): void {
    // OpenAI profile
    this.providerProfiles.set('openai', {
      name: 'openai',
      strengths: ['reasoning', 'analysis', 'market interpretation'],
      weaknesses: ['cost', 'rate limits'],
      bestConditions: ['trending_bullish', 'volatile_neutral', 'complex_analysis'],
      costPerRequest: 15,
      averageResponseTime: 2500,
      reliability: 0.92,
      accuracy: {
        overall: 0.68,
        trending_bullish: 0.72,
        trending_bearish: 0.65,
        ranging_neutral: 0.70,
        volatile_neutral: 0.64,
        reversal_positive: 0.66,
        reversal_negative: 0.62,
      },
      currentLoad: 0,
      lastUsed: 0,
      priority: 'HIGH',
    });

    // Claude profile
    this.providerProfiles.set('claude', {
      name: 'claude',
      strengths: ['cautious analysis', 'risk assessment', 'detailed reasoning'],
      weaknesses: ['speed', 'availability'],
      bestConditions: ['ranging_neutral', 'volatile_risk', 'conservative_analysis'],
      costPerRequest: 12,
      averageResponseTime: 3200,
      reliability: 0.88,
      accuracy: {
        overall: 0.65,
        trending_bullish: 0.62,
        trending_bearish: 0.68,
        ranging_neutral: 0.70,
        volatile_risk: 0.66,
        reversal_positive: 0.64,
        reversal_negative: 0.67,
      },
      currentLoad: 0,
      lastUsed: 0,
      priority: 'HIGH',
    });

    // Gemini profile
    this.providerProfiles.set('gemini', {
      name: 'gemini',
      strengths: ['speed', 'cost efficiency', 'availability'],
      weaknesses: ['complex reasoning', 'nuanced analysis'],
      bestConditions: ['trending_simple', 'high_volume', 'quick_decisions'],
      costPerRequest: 8,
      averageResponseTime: 1800,
      reliability: 0.90,
      accuracy: {
        overall: 0.62,
        trending_simple: 0.68,
        high_volume_fast: 0.65,
        quick_decisions: 0.66,
        complex_analysis: 0.58,
        volatile_risk: 0.60,
        reversal_neutral: 0.61,
      },
      currentLoad: 0,
      lastUsed: 0,
      priority: 'MEDIUM',
    });

    // Custom model profile
    this.providerProfiles.set('custom', {
      name: 'custom',
      strengths: ['specialized', 'customizable', 'cost control'],
      weaknesses: ['reliability', 'maintenance'],
      bestConditions: ['specialized_markets', 'custom_strategies', 'specific_conditions'],
      costPerRequest: 5,
      averageResponseTime: 4000,
      reliability: 0.75,
      accuracy: {
        overall: 0.58,
        specialized_markets: 0.68,
        custom_strategies: 0.65,
        general_analysis: 0.55,
        high_volume: 0.60,
        volatile_conditions: 0.56,
      },
      currentLoad: 0,
      lastUsed: 0,
      priority: 'LOW',
    });
  }

  /**
   * Generate cache key for selection results
   */
  private generateCacheKey(
    providers: string[],
    condition: MarketCondition,
    criteria: SelectionCriteria
  ): string {
    const providerStr = providers.sort().join(',');
    const conditionStr = `${condition.regime}_${condition.volatility.toFixed(2)}_${condition.sentiment}`;
    const criteriaStr = `${criteria.maxProviders}_${criteria.prioritizeAccuracy}_${criteria.prioritizeSpeed}_${criteria.prioritizeCost}`;

    return `${providerStr}_${conditionStr}_${criteriaStr}`;
  }

  /**
   * Get condition key for performance tracking
   */
  private getConditionKey(condition: MarketCondition): string {
    return `${condition.regime}_${condition.sentiment}`;
  }

  /**
   * Create fallback selection
   */
  private createFallbackSelection(providers: string[], criteria: SelectionCriteria): SelectionResult {
    const selectedProviders = providers.slice(0, Math.min(criteria.maxProviders, providers.length));

    return {
      selectedProviders,
      selectionReason: ['Fallback selection due to error'],
      expectedPerformance: {
        accuracy: 0.5,
        responseTime: 5000,
        cost: 25,
        reliability: 0.8,
      },
      riskFactors: ['Fallback selection - reduced reliability'],
      alternatives: [],
    };
  }

  /**
   * Update provider load
   */
  updateProviderLoad(provider: string, load: number): void {
    this.currentLoads.set(provider, Math.max(0, Math.min(1, load)));
  }

  /**
   * Update provider last used timestamp
   */
  updateProviderLastUsed(provider: string): void {
    const profile = this.providerProfiles.get(provider);
    if (profile) {
      profile.lastUsed = Date.now();
    }
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.selectionCache.clear();
    tradingLogger.info('Provider selection cache cleared');
  }
}

export default ProviderSelectionService;