/**
 * Portfolio Management Service
 *
 * Advanced portfolio management with sector analysis, correlation monitoring,
 * dynamic allocation, and automated rebalancing.
 */

import { tradingLogger } from '@/utils/logger';
import { DynamicRiskService } from './dynamic-risk.service';

export interface PortfolioAsset {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: 'LARGE' | 'MEDIUM' | 'SMALL';
  quantity: number;
  averageCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalPnL: number;
  allocationPercentage: number;
  weight: number;
  beta: number;
  sharpeRatio: number;
  lastUpdate: number;
}

export interface Sector {
  name: string;
  description: string;
  allocation: number; // Target allocation percentage
  currentAllocation: number;
  exposure: number;
  performance: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  assets: string[];
  risk: {
    beta: number;
    volatility: number;
    concentration: number;
  };
}

export interface CorrelationData {
  timestamp: number;
  matrix: Record<string, Record<string, number>>;
  averageCorrelation: number;
  maxCorrelation: number;
  highCorrelationPairs: Array<{
    asset1: string;
    asset2: string;
    correlation: number;
  }>;
}

export interface RebalancingTrigger {
  type: 'TIME_BASED' | 'THRESHOLD_BASED' | 'VOLATILITY_BASED' | 'CORRELATION_BASED';
  frequency: number; // In hours
  threshold: number;
  lastRebalanced: number;
  active: boolean;
}

export interface RebalancingPlan {
  id: string;
  timestamp: number;
  targetAllocations: Record<string, number>;
  currentAllocations: Record<string, number>;
  requiredTrades: Array<{
    symbol: string;
    action: 'BUY' | 'SELL';
    quantity: number;
    targetWeight: number;
    currentWeight: number;
  }>;
  estimatedCost: number;
  taxImplications: Array<{
    symbol: string;
    type: 'SHORT_TERM' | 'LONG_TERM';
    rate: number;
  }>;
  riskAssessment: {
    marketImpact: 'LOW' | 'MEDIUM' | 'HIGH';
    taxEfficiency: 'LOW' | 'MEDIUM' | 'HIGH';
    executionRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

export interface PortfolioMetrics {
  totalValue: number;
  totalPnL: number;
  dailyPnL: number;
  weeklyPnL: number;
  monthlyPnL: number;
  sharpeRatio: number;
  sortinoRatio: number;
  alpha: number;
  beta: number;
  trackingError: number;
  informationRatio: number;
  var: number;
  maxDrawdown: number;
  calmarRatio: number;
  turnover: number;
  concentration: number;
  diversificationRatio: number;
  sectorAllocations: Record<string, number>;
  qualityScore: number;
}

export interface OptimizationObjective {
  type: 'MAXIMIZE_SHARPE' | 'MINIMIZE_VOLATILITY' | 'MAXIMIZE_ALPHA' | 'BALANCED' | 'INCOME_FOCUSED' | 'GROWTH_FOCUSED';
  constraints: {
    maxTurnover: number;
    maxConcentration: number;
    minDiversification: number;
    maxRisk: number;
    sectorLimits: Record<string, number>;
  };
  weights: Record<string, number>;
}

export class PortfolioManagementService {
  private static instance: PortfolioManagementService;
  private dynamicRiskService: DynamicRiskService;

  private portfolio: Map<string, PortfolioAsset> = new Map();
  private sectors: Map<string, Sector> = new Map();
  private correlationHistory: CorrelationData[] = [];
  private rebalancingHistory: RebalancingPlan[] = [];
  private performanceHistory: Array<{ timestamp: number; metrics: PortfolioMetrics }> = [];

  // Rebalancing configuration
  private rebalancingTriggers: RebalancingTrigger[] = [];
  private rebalancingSchedule: Map<string, number> = new Map();

  // Portfolio benchmarks
  private benchmark: string = 'SPY'; // S&P 500 as default benchmark

  private constructor() {
    this.dynamicRiskService = DynamicRiskService.getInstance();
    this.initializeDefaultSectors();
    this.initializeRebalancingTriggers();
  }

  static getInstance(): PortfolioManagementService {
    if (!PortfolioManagementService.instance) {
      PortfolioManagementService.instance = new PortfolioManagementService();
    }
    return PortfolioManagementService.instance;
  }

  /**
   * Add or update asset in portfolio
   */
  addOrUpdateAsset(asset: Omit<PortfolioAsset, 'totalPnL' | 'lastUpdate'>): void {
    const symbol = asset.symbol;
    const existingAsset = this.portfolio.get(symbol);

    if (existingAsset) {
      // Update existing asset
      const updatedAsset: PortfolioAsset = {
        ...existingAsset,
        ...asset,
        totalPnL: existingAsset.totalPnL + (asset.unrealizedPnL || 0) + (asset.realizedPnL || 0),
        allocationPercentage: (asset.marketValue / this.getTotalPortfolioValue()) * 100,
        lastUpdate: Date.now(),
      };
      this.portfolio.set(symbol, updatedAsset);
    } else {
      // Add new asset
      const newAsset: PortfolioAsset = {
        ...asset,
        totalPnL: (asset.unrealizedPnL || 0) + (asset.realizedPnL || 0),
        allocationPercentage: (asset.marketValue / this.getTotalPortfolioValue()) * 100,
        weight: asset.marketValue / this.getTotalPortfolioValue(),
        lastUpdate: Date.now(),
      };
      this.portfolio.set(symbol, newAsset);
    }

    // Update sector allocation
    this.updateSectorAllocation(asset);

    tradingLogger.debug('Asset updated in portfolio', {
      symbol,
      action: existingAsset ? 'updated' : 'added',
      marketValue: asset.marketValue,
      allocationPercentage: this.portfolio.get(symbol)?.allocationPercentage,
    });
  }

  /**
   * Remove asset from portfolio
   */
  removeAsset(symbol: string): void {
    const asset = this.portfolio.get(symbol);
    if (asset) {
      this.portfolio.delete(symbol);
      this.updateSectorAllocation(asset);

      tradingLogger.info('Asset removed from portfolio', {
        symbol,
        marketValue: asset.marketValue,
        totalPnL: asset.totalPnL,
      });
    }
  }

  /**
   * Calculate correlation matrix for portfolio assets
   */
  calculateCorrelationMatrix(): CorrelationData {
    const symbols = Array.from(this.portfolio.keys());
    const matrix: Record<string, Record<string, number>> = {};

    // Initialize matrix
    for (const symbol1 of symbols) {
      matrix[symbol1] = {};
      for (const symbol2 of symbols) {
        matrix[symbol1][symbol2] = this.calculateCorrelation(symbol1, symbol2);
      }
    }

    // Calculate statistics
    const correlations: number[] = [];
    let maxCorrelation = 0;
    const highCorrelationPairs: Array<{ asset1: string; asset2: string; correlation: number }> = [];

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const correlation = matrix[symbols[i]][symbols[j]];
        correlations.push(Math.abs(correlation));
        maxCorrelation = Math.max(maxCorrelation, Math.abs(correlation));

        if (Math.abs(correlation) > 0.7) {
          highCorrelationPairs.push({
            asset1: symbols[i],
            asset2: symbols[j],
            correlation: Math.abs(correlation),
          });
        }
      }
    }

    const averageCorrelation = correlations.length > 0 ?
      correlations.reduce((sum, corr) => sum + corr, 0) / correlations.length : 0;

    const correlationData: CorrelationData = {
      timestamp: Date.now(),
      matrix,
      averageCorrelation,
      maxCorrelation,
      highCorrelationPairs,
    };

    // Store in history
    this.correlationHistory.push(correlationData);
    if (this.correlationHistory.length > 100) {
      this.correlationHistory = this.correlationHistory.slice(-50);
    }

    return correlationData;
  }

  /**
   * Calculate diversification ratio
   */
  calculateDiversificationRatio(): number {
    const correlationData = this.calculateCorrelationMatrix();
    return 1 - correlationData.averageCorrelation;
  }

  /**
   * Get sector exposure analysis
   */
  getSectorExposure(): {
    sectors: Map<string, Sector>;
    totalExposure: number;
    overConcentratedSectors: Array<{
      sector: string;
      allocation: number;
      recommendedMax: number;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
  } {
    let totalExposure = 0;
    const sectors = new Map<string, Sector>();
    const overConcentratedSectors: Array<{
      sector: string;
      allocation: number;
      recommendedMax: number;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    }> = [];

    for (const [sectorName, sector] of this.sectors.entries()) {
      totalExposure += sector.exposure;
      sectors.set(sectorName, sector);

      // Check for over-concentration
      const recommendedMax = 30; // 30% max per sector
      if (sector.currentAllocation > recommendedMax) {
        overConcentratedSectors.push({
          sector: sectorName,
          allocation: sector.currentAllocation,
          recommendedMax,
          riskLevel: sector.currentAllocation > 40 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    return {
      sectors,
      totalExposure,
      overConcentratedSectors,
    };
  }

  /**
   * Generate rebalancing plan
   */
  generateRebalancingPlan(
    targetAllocations: Record<string, number>,
    objective: OptimizationObjective
  ): RebalancingPlan {
    const planId = this.generateRebalancingId();
    const timestamp = Date.now();

    const currentAllocations = this.getCurrentAllocations();
    const requiredTrades: RebalancingPlan['requiredTrades'] = [];

    let totalEstimatedCost = 0;

    // Calculate required trades for each asset
    for (const [symbol, targetAllocation] of Object.entries(targetAllocations)) {
      const currentAllocation = currentAllocations[symbol] || 0;
      const totalPortfolioValue = this.getTotalPortfolioValue();

      const targetValue = (targetAllocation / 100) * totalPortfolioValue;
      const currentValue = (currentAllocation / 100) * totalPortfolioValue;
      const targetWeight = targetAllocation / 100;

      const currentWeight = currentAllocation / 100;
      const asset = this.portfolio.get(symbol);

      if (asset) {
        const currentValuePrice = asset.currentPrice;
        const currentQuantity = asset.quantity;

        let action: 'BUY' | 'SELL';
        let quantity: number;

        if (targetValue > currentValue) {
          action = 'BUY';
          quantity = (targetValue - currentValue) / currentValuePrice;
        } else if (targetValue < currentValue) {
          action = 'SELL';
          quantity = (currentValue - targetValue) / currentValuePrice;
        }

        if (Math.abs(quantity * currentValuePrice) > 100) { // Minimum trade size
          requiredTrades.push({
            symbol,
            action,
            quantity,
            targetWeight,
            currentWeight,
          });

          // Estimate trading costs
          const estimatedTradeCost = Math.abs(quantity * currentValuePrice) * 0.001; // 0.1% trading cost
          totalEstimatedCost += estimatedTradeCost;
        }
      }
    }

    // Sort trades by size (largest first)
    requiredTrades.sort((a, b) =>
      Math.abs(b.quantity * (this.portfolio.get(b.symbol)?.currentPrice || 0)) -
      Math.abs(a.quantity * (this.portfolio.get(a.symbol)?.currentPrice || 0))
    );

    // Calculate tax implications
    const taxImplications = this.calculateTaxImplications(requiredTrades);

    // Risk assessment
    const riskAssessment = this.assessRebalancingRisk(requiredTrades);

    const plan: RebalancingPlan = {
      id: planId,
      timestamp,
      targetAllocations,
      currentAllocations,
      requiredTrades,
      estimatedCost: totalEstimatedCost,
      taxImplications,
      riskAssessment,
    };

    // Store in history
    this.rebalancingHistory.push(plan);
    if (this.rebalancingHistory.length > 100) {
      this.rebalancingHistory = this.rebalancingHistory.slice(-50);
    }

    tradingLogger.info('Rebalancing plan generated', {
      planId,
      requiredTrades: requiredTrades.length,
      estimatedCost: totalEstimatedCost,
      riskLevel: riskAssessment.marketImpact,
    });

    return plan;
  }

  /**
   * Execute rebalancing plan
   */
  async executeRebalancingPlan(plan: RebalancingPlan): Promise<{
    executed: RebalancingPlan['requiredTrades'];
    failed: RebalancingPlan['requiredTrades'];
    totalCost: number;
    executionTime: number;
  }> {
    const startTime = Date.now();
    const executed: RebalancingPlan['requiredTrades'] = [];
    const failed: RebalancingPlan['requiredTrades'] = [];
    let totalCost = 0;

    try {
      for (const trade of plan.requiredTrades) {
        try {
          // Execute trade (simplified - would integrate with exchange API)
          const success = await this.executeTrade(trade);

          if (success) {
            executed.push(trade);
            totalCost += Math.abs(trade.quantity * (this.portfolio.get(trade.symbol)?.currentPrice || 0)) * 0.001;

            // Update portfolio
            if (trade.action === 'BUY') {
              const asset = this.portfolio.get(trade.symbol);
              if (asset) {
                const newQuantity = asset.quantity + trade.quantity;
                this.addOrUpdateAsset({
                  ...asset,
                  quantity: newQuantity,
                });
              }
            } else {
              const asset = this.portfolio.get(trade.symbol);
              if (asset) {
                const newQuantity = asset.quantity - trade.quantity;
                this.addOrUpdateAsset({
                  ...asset,
                  quantity: newQuantity,
                });
              }
            }
          } else {
            failed.push(trade);
          }
        } catch (error) {
          failed.push(trade);
          tradingLogger.error('Trade execution failed', {
            symbol: trade.symbol,
            action: trade.action,
            quantity: trade.quantity,
            error: error instanceof Error ? error.message : error,
          });
        }
      }

      const executionTime = Date.now() - startTime;

      // Update correlation matrix after rebalancing
      this.calculateCorrelationMatrix();

      tradingLogger.info('Rebalancing executed', {
        planId: plan.id,
        executedTrades: executed.length,
        failedTrades: failed.length,
        totalCost,
        executionTime,
      });

    } catch (error) {
      tradingLogger.error('Rebalancing execution failed', {
        planId: plan.id,
        error: error instanceof Error ? error.message : error,
      });
    }

    return { executed, failed, totalCost, executionTime };
  }

  /**
   * Check if rebalancing is needed
   */
  checkRebalancingNeeded(): {
    needed: boolean;
    reason: string;
    recommendedAction: string;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  } {
    // Check each trigger
    for (const trigger of this.rebalancingTriggers) {
      if (!trigger.active) continue;

      if (this.shouldTriggerRebalancing(trigger)) {
        return {
          needed: true,
          reason: `${trigger.type} trigger activated`,
          recommendedAction: this.getRebalancingAction(trigger),
          urgency: this.getRebalancingUrgency(trigger),
        };
      }
    }

    return {
      needed: false,
      reason: 'No rebalancing triggers met',
      recommendedAction: 'Maintain current allocation',
      urgency: 'LOW',
    };
  }

  /**
   * Get portfolio metrics
   */
  getPortfolioMetrics(): PortfolioMetrics {
    const portfolioValue = this.getTotalPortfolioValue();
    const assets = Array.from(this.portfolio.values());

    // Calculate returns
    const totalPnL = assets.reduce((sum, asset) => sum + asset.totalPnL, 0);
    const unrealizedPnL = assets.reduce((sum, asset) => sum + asset.unrealizedPnL, 0);
    const realizedPnL = assets.reduce((sum, asset) => sum + asset.realizedPnL, 0);

    // Calculate performance metrics
    const returns = this.calculatePortfolioReturns();
    const sharpeRatio = this.calculateSharpeRatioFromReturns(returns);
    const sortinoRatio = this.calculateSortinoRatioFromReturns(returns);
    const alpha = this.calculateAlpha(returns);
    const beta = this.calculateBetaFromReturns(returns);
    const trackingError = this.calculateTrackingError(returns);
    const informationRatio = alpha / (trackingError || 0.01);
    const var = this.calculateVAR(returns, 0.05);
    const maxDrawdown = this.calculateMaxDrawdown(returns);
    const calmarRatio = this.calculateCalmarRatioFromReturns(returns);

    // Calculate concentration metrics
    const concentration = this.calculateConcentration();
    const diversificationRatio = this.calculateDiversificationRatio();

    // Calculate sector allocations
    const sectorAllocations: Record<string, number> = {};
    for (const [sectorName, sector] of this.sectors.entries()) {
      sectorAllocations[sectorName] = sector.currentAllocation;
    }

    // Calculate quality score
    const qualityScore = this.calculatePortfolioQuality();

    return {
      totalValue: portfolioValue,
      totalPnL,
      dailyPnL: this.calculatePeriodPnL('DAILY'),
      weeklyPnL: this.calculatePeriodPnL('WEEKLY'),
      monthlyPnL: this.calculatePeriodPnL('MONTHLY'),
      sharpeRatio,
      sortinoRatio,
      alpha,
      beta,
      trackingError,
      informationRatio,
      var,
      maxDrawdown,
      calmarRatio,
      turnover: this.calculateTurnover(),
      concentration,
      diversificationRatio,
      sectorAllocations,
      qualityScore,
    };
  }

  /**
   * Optimize portfolio weights based on objective
   */
  optimizePortfolio(
    objective: OptimizationObjective,
    constraints?: Partial<OptimizationObjective['constraints']>
  ): {
    optimalWeights: Record<string, number>;
    expectedReturn: number;
    expectedRisk: number;
    efficientFrontier: boolean;
  } {
    const finalConstraints = {
      maxTurnover: 0.3, // 30% annual turnover
      maxConcentration: 0.25, // 25% max single position
      minDiversification: 0.6, // 60% minimum diversification
      maxRisk: 0.15, // 15% max volatility
      sectorLimits: {
        TECHNOLOGY: 40,
        HEALTHCARE: 30,
        FINANCE: 30,
      },
      ...constraints,
    };

    // Get current asset data
    const assets = Array.from(this.portfolio.values());
    const expectedReturns = assets.map(asset => this.calculateExpectedReturn(asset));
    const risks = assets.map(asset => this.calculateAssetRisk(asset));
    const correlations = this.getCorrelationMatrix().matrix;

    // Use mean-variance optimization (simplified)
    const optimalWeights = this.meanVarianceOptimization(
      expectedReturns,
      risks,
      correlations,
      finalConstraints
    );

    const expectedReturn = optimalWeights.reduce((sum, weight, index) =>
      sum + (weight * expectedReturns[index]), 0);

    const expectedRisk = Math.sqrt(
      optimalWeights.reduce((sum, weight, i) =>
        sum + optimalWeights.reduce((sum2, weight2, j) =>
          sum2 + (weight * weight * correlations[i][j] * risks[j]), 0), 0), 0)
    );

    return {
      optimalWeights,
      expectedReturn,
      expectedRisk,
      efficientFrontier: true,
    };
  }

  /**
   * Get portfolio analytics
   */
  getPortfolioAnalytics(): {
    totalAssets: number;
    totalSectors: number;
    totalValue: number;
    averageCorrelation: number;
    diversificationRatio: number;
    concentration: number;
    turnover: number;
    rebalancingHistory: number;
    lastRebalancing?: number;
    qualityScore: number;
    sectorDiversification: number;
  } {
    const totalValue = this.getTotalPortfolioValue();
    const correlationData = this.calculateCorrelationMatrix();

    return {
      totalAssets: this.portfolio.size,
      totalSectors: this.sectors.size,
      totalValue,
      averageCorrelation: correlationData.averageCorrelation,
      diversificationRatio: this.calculateDistributionRatio(),
      concentration: this.calculateConcentration(),
      turnover: this.calculateTurnover(),
      rebalancingHistory: this.rebalancingHistory.length,
      lastRebalancing: this.rebalancingHistory.length > 0 ?
        this.rebalancingHistory[this.rebalancingHistory.length - 1].timestamp : undefined,
      qualityScore: this.calculatePortfolioQuality(),
      sectorDiversification: this.calculateSectorDiversification(),
    };
  }

  // Private helper methods
  private calculateCorrelation(symbol1: string, symbol2: string): number {
    // Simplified correlation calculation
    // In a real implementation, this would use historical price data
    return Math.random() * 0.8 - 0.4; // Random correlation between -0.4 and 0.4
  }

  private getCurrentAllocations(): Record<string, number> {
    const allocations: Record<string, number> = {};
    const totalValue = this.getTotalPortfolioValue();

    for (const [symbol, asset] of this.portfolio.entries()) {
      allocations[symbol] = (asset.marketValue / totalValue) * 100;
    }

    return allocations;
  }

  private getTotalPortfolioValue(): number {
    return Array.from(this.portfolio.values())
      .reduce((sum, asset) => sum + asset.marketValue, 0);
  }

  private updateSectorAllocation(asset: PortfolioAsset): void {
    const sector = asset.sector;

    if (!this.sectors.has(sector)) {
      this.sectors.set(sector, {
        name: sector,
        description: `${sector} sector`,
        allocation: 0,
        currentAllocation: 0,
        exposure: 0,
        performance: { daily: 0, weekly: 0, monthly: 0 },
        assets: [],
        risk: { beta: 1.0, volatility: 0.2, concentration: 0 },
      });
    }

    const sectorData = this.sectors.get(sector)!;
    sectorData.currentAllocation += asset.allocationPercentage;
    sectorData.exposure += asset.marketValue;
    sectorData.assets.push(asset.symbol);
  }

  private calculateTaxImplications(trades: RebalancingPlan['requiredTrades']): RebalancingPlan['taxImplications'] {
    return trades.map(trade => ({
      symbol: trade.symbol,
      type: Math.abs(trade.quantity) > this.getAssetHoldingPeriod(trade.symbol) ? 'LONG_TERM' : 'SHORT_TERM',
      rate: 0.2, // 20% tax rate for short-term, 15% for long-term
    }));
  }

  private getAssetHoldingPeriod(symbol: string): number {
    // Simplified holding period calculation
    const asset = this.portfolio.get(symbol);
    if (!asset) return 365; // Default 1 year

    // Would calculate based on actual holding period data
    return Math.random() * 365 + 30;
  }

  private assessRebalancingRisk(trades: RebalancingPlan['requiredTrades']): RebalancingPlan['riskAssessment'] {
    const totalValue = this.getTotalPortfolioValue();
    const totalTradeValue = trades.reduce((sum, trade) =>
      sum + Math.abs(trade.quantity * (this.portfolio.get(trade.symbol)?.currentPrice || 0)), 0);

    const marketImpact = totalTradeValue / totalValue;
    const taxEfficiency = trades.reduce((sum, trade) =>
      sum + (trade.type === 'LONG_TERM' ? 0.85 : 0.75), 0) / trades.length;
    const executionRisk = trades.length > 10 ? 'HIGH' : trades.length > 5 ? 'MEDIUM' : 'LOW';

    let riskAssessment: 'LOW';
    if (marketImpact > 0.2) riskAssessment = 'HIGH';
    else if (marketImpact > 0.1 || executionRisk === 'HIGH') riskAssessment = 'MEDIUM';

    return {
      marketImpact,
      taxEfficiency,
      executionRisk,
    };
  }

  private executeTrade(trade: RebalancingPlan['requiredTrades']): Promise<boolean> {
    // Simplified trade execution
    // In a real implementation, this would integrate with exchange APIs
    return Promise.resolve(Math.random() > 0.1); // 90% success rate
  }

  private shouldTriggerRebalancing(trigger: RebalancingTrigger): boolean {
    const now = Date.now();
    const timeSinceLastRebalancing = (now - trigger.lastRebalanced) / (1000 * 60 * 60); // In hours

    if (trigger.type === 'TIME_BASED') {
      return timeSinceLastRebalancing >= trigger.frequency;
    }

    // Add other trigger checks here
    return false;
  }

  private getRebalancingAction(trigger: RebalancingTrigger): string {
    switch (trigger.type) {
      case 'TIME_BASED':
        return `Execute scheduled rebalancing (${trigger.frequency}h frequency)`;
      case 'THRESHOLD_BASED':
        return `Execute threshold-based rebalancing (threshold: ${trigger.threshold})`;
      case 'VOLATILITY_BASED':
        return `Execute volatility-based rebalancing`;
      case 'CORRELATION_BASED':
        return `Execute correlation-based rebalancing`;
      default:
        return 'Execute rebalancing';
    }
  }

  private getRebalancingUrgency(trigger: RebalancingTrigger): 'LOW' | 'MEDIUM' | 'HIGH' {
    switch (trigger.type) {
      case 'TIME_BASED':
        return 'LOW';
      case 'THRESHOLD_BASED':
        return trigger.threshold > 0.2 ? 'HIGH' : 'MEDIUM';
      case 'VOLATILITY_BASED':
        return 'HIGH';
      case 'CORRELATION_BASED':
        return 'HIGH';
      default:
        return 'LOW';
    }
  }

  private calculatePortfolioReturns(): number[] {
    const portfolioValues = this.performanceHistory.map(h => h.metrics.totalValue);
    const returns: number[] = [];

    for (let i = 1; i < portfolioValues.length; i++) {
      returns.push((portfolioValues[i] - portfolioValues[i - 1]) / portfolioValues[i - 1]);
    }

    return returns;
  }

  private calculatePeriodPnL(period: 'DAILY' | 'WEEKLY' | 'MONTHLY'): number {
    const now = Date.now();
    let cutoffTime: number;

    switch (period) {
      case 'DAILY':
        cutoffTime = now - (24 * 60 * 60 * 1000); // 24 hours ago
        break;
      case 'WEEKLY':
        cutoffTime = now - (7 * 24 * 60 * 60 * 1000); // 7 days ago
        break;
      case 'MONTHLY':
        cutoffTime = now - (30 * 24 * 60 * 60 * 1000); // 30 days ago
        break;
    }

    const recentHistory = this.performanceHistory
      .filter(h => h.timestamp >= cutoffTime)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (recentHistory.length === 0) return 0;

    const startValue = recentHistory[0].metrics.totalValue;
    const endValue = recentHistory[recentHistory.length - 1].metrics.totalValue;

    return endValue - startValue;
  }

  private calculateSharpeRatioFromReturns(returns: number[]): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const riskFreeRate = 0.02 / 252; // 2% annual risk-free rate
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    return volatility > 0 ? (mean - riskFreeRate) / volatility : 0;
  }

  private calculateSortinoRatioFromReturns(returns: number[]): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const downsideReturns = returns.filter(r => r < 0);

    if (downsideReturns.length === 0) return mean * 2; // If no downside returns, double the mean

    const downsideMean = downsideReturns.reduce((sum, r) => sum + r, 0) / downsideReturns.length;
    const downsideDeviation = Math.sqrt(
      downsideReturns.reduce((sum, r) => sum + Math.pow(r - downsideMean, 2), 0) / downsideReturns.length
    );

    return downsideDeviation > 0 ? mean / downsideDeviation : 0;
  }

  private calculateAlpha(returns: number[]): number {
    // Simplified alpha calculation
    const beta = this.calculateBetaFromReturns(returns);
    const marketReturn = 0.0008; // 20% annual market return
    const riskFreeRate = 0.00008; // 2% annual risk-free rate

    const expectedReturn = returns.length > 0 ?
      returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;

    return expectedReturn - (riskFreeRate + beta * (marketReturn - riskFreeRate));
  }

  private calculateBetaFromReturns(returns: number[]): number {
    // Simplified beta calculation
    return 1.0; // Would calculate against market index
  }

  private calculateTrackingError(returns: number[]): number {
    // Simplified tracking error calculation
    return 0.02; // 2% tracking error
  }

  private calculateVAR(returns: number[], confidence: number): number {
    if (returns.length === 0) return 0;

    returns.sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * returns.length);
    return Math.abs(returns[index] || 0);
  }

  private calculateMaxDrawdown(returns: number[]): number {
    if (returns.length === 0) return 0;

    let peak = returns[0];
    let maxDrawdown = 0;

    for (const returnValue of returns) {
      if (returnValue > peak) {
        peak = returnValue;
      }
      const drawdown = (peak - returnValue) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  private calculateCalmarRatioFromReturns(values: number[], returns: number[]): number {
    if (values.length === 0 || returns.length === 0) return 0;

    const totalReturn = (values[values.length - 1] - values[0]) / values[0];
    const maxDrawdown = this.calculateMaxDrawdown(returns);

    return maxDrawdown > 0 ? Math.abs(totalReturn) / maxDrawdown : totalReturn * 2;
  }

  private calculateTurnover(): number {
    const assets = Array.from(this.portfolio.values());
    const averageHoldings = assets.map(asset => this.getAssetHoldingPeriod(asset.symbol));

    const averageHoldingPeriod = averageHoldings.length > 0 ?
      averageHoldings.reduce((sum, period) => sum + period, 0) / averageHoldings.length : 365;

    return 365 / averageHoldingPeriod;
  }

  private calculateConcentration(): number {
    const exposures = Array.from(this.portfolio.values())
      .map(asset => Math.abs(asset.allocationPercentage / 100));

    const totalExposure = exposures.reduce((sum, exp) => sum + exp, 0);
    const normalizedExposures = exposures.map(exp => exp / totalExposure);

    // Calculate Herfindahl index
    return normalizedExposures.reduce((sum, exp) => sum + Math.pow(exp, 2), 0);
  }

  private calculateDistributionRatio(): number {
    const exposures = Array.from(this.portfolio.values())
      .map(asset => Math.abs(asset.allocationPercentage / 100));

    // Calculate distribution ratio (inverse of concentration)
    const concentration = this.calculateConcentration();
    return concentration > 0 ? 1 / concentration : 1;
  }

  private calculateSectorDiversification(): number {
    const sectorAllocations = Array.from(this.sectors.values())
      .map(sector => sector.currentAllocation / 100);

    // Calculate entropy for sector diversification
    const entropy = sectorAllocations.reduce((sum, allocation) => {
      return sum + (allocation * Math.log2(allocation + 1));
    }, 0);

    const maxEntropy = Math.log2(sectorAllocations.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 1;
  }

  private calculatePortfolioQuality(): number {
    const metrics = this.getPortfolioMetrics();

    let qualityScore = 0.5; // Base score

    // Sharpe ratio contribution (30%)
    qualityScore += Math.min(2, metrics.sharpeRatio) * 0.3;

    // Diversification ratio contribution (25%)
    qualityScore += metrics.diversificationRatio * 0.25;

    // Concentration penalty (20%)
    qualityScore += Math.max(0, 1 - metrics.concentration) * 0.2;

    // Turnover penalty (15%)
    qualityScore += Math.max(0, 1 - metrics.turnover) * 0.15;

    // Quality score bonus (10%)
    qualityScore += metrics.qualityScore * 0.1;

    return Math.min(1, qualityScore);
  }

  private calculateExpectedReturn(asset: PortfolioAsset): number {
    // Simplified expected return calculation
    return 0.12 + (Math.random() - 0.5) * 0.2; // 12% base return ± 10%
  }

  private calculateAssetRisk(asset: PortfolioAsset): number {
    // Simplified risk calculation
    return 0.15 + (Math.random() - 0.5) * 0.1; // 15% base risk ± 5%
  }

  private meanVarianceOptimization(
    returns: number[],
    risks: number[],
    correlations: Record<string, Record<string, number>>,
    constraints: OptimizationObjective['constraints']
  ): Record<string, number> {
    const n = returns.length;
    const ones = new Array(n).fill(1);

    // Create constraint matrices
    const turnoverPenalty = constraints.maxTurnover > 0 ?
      Array(n).fill(1).map((_, i, j) => i === j ? 1 : 1.1) : 1) :
      Array(n).fill(1);

    const concentrationPenalty = constraints.maxConcentration > 0 ?
      Array(n).fill(1).map((_, i, j) => {
        const concentration = 1 / n;
        return concentration > constraints.maxConcentration ? 10 : 1;
      }) : Array(n).fill(1);

    const sectorLimits = constraints.sectorLimits || {};
    const sectorPenalty = new Array(n).fill(1);

    // For simplicity, return equal weights
    const weights = new Array(n).fill(1 / n);

    return weights.reduce((obj, weight, index) => {
      obj[Object.keys(weights)[index]] = weight;
      return obj;
    }, {});
  }

  private initializeDefaultSectors(): void {
    const defaultSectors = [
      {
        name: 'Technology',
        description: 'Technology companies',
        allocation: 40,
        currentAllocation: 0,
        exposure: 0,
        performance: { daily: 0, weekly: 0, monthly: 0 },
        assets: [],
        risk: { beta: 1.2, volatility: 0.25, concentration: 0.15 },
      },
      {
        name: 'Healthcare',
        description: 'Healthcare companies',
        allocation: 30,
        currentAllocation: 0,
        exposure: 0,
        performance: { daily: 0, weekly: 0, monthly: 0 },
        assets: [],
        risk: { beta: 0.8, volatility: 0.2, concentration: 0.1 },
      },
      {
        name: 'Finance',
        description: 'Financial institutions',
        allocation: 30,
        currentAllocation: 0,
        exposure: 0,
        performance: { daily: 0, weekly: 0, monthly: 0 },
        assets: [],
        risk: { beta: 1.1, volatility: 0.3, concentration: 0.2 },
      },
    ];

    for (const sector of defaultSectors) {
      this.sectors.set(sector.name, sector);
    }
  }

  private initializeRebalancingTriggers(): void {
      this.rebalancingTriggers = [
      {
        type: 'TIME_BASED',
        frequency: 24 * 7, // Weekly
        threshold: 0,
        lastRebalanced: 0,
        active: true,
      },
      {
        type: 'THRESHOLD_BASED',
        frequency: 0,
        threshold: 0.1, // 10% allocation deviation
        lastRebalanced: 0,
        active: true,
      },
      {
        type: 'VOLATILITY_BASED',
        frequency: 0,
        threshold: 0.3, // 30% volatility spike
        lastRebalanced: 0,
        active: true,
      },
      {
        type: 'CORRELATION_BASED',
        frequency: 0,
        threshold: 0.8, // 80% correlation
        lastRebalanced: 0,
        active: true,
      },
    ];
  }

  private generateRebalancingId(): string {
    return `rebalance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate dynamic allocation based on market volatility
   */
  async calculateDynamicAllocation(
    baseAllocation: { [symbol: string]: number },
    marketVolatility: number,
    volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME',
    correlationMatrix: { [symbol: string]: { [symbol: string]: number } },
    riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE' = 'MODERATE'
  ): Promise<{
    adjustedAllocation: { [symbol: string]: number };
    allocationChanges: { [symbol: string]: { from: number; to: number; change: number; reason: string } };
    riskAdjustment: {
      overallRisk: number;
      diversificationBenefit: number;
      volatilityReduction: number;
    };
    recommendations: string[];
  }> {
    const symbols = Object.keys(baseAllocation);
    const adjustedAllocation: { [symbol: string]: number } = { ...baseAllocation };
    const allocationChanges: { [symbol: string]: { from: number; to: number; change: number; reason: string } } = {};

    // Volatility adjustment factors based on regime and risk tolerance
    const volatilityFactors = this.getVolatilityAdjustmentFactors(volatilityRegime, riskTolerance);

    // Calculate risk contributions for each asset
    const riskContributions = await this.calculateRiskContributions(
      baseAllocation,
      correlationMatrix,
      marketVolatility
    );

    // Apply volatility-based adjustments
    for (const symbol of symbols) {
      const currentWeight = baseAllocation[symbol];
      const riskContribution = riskContributions[symbol] || 0;

      let adjustedWeight = currentWeight;
      let adjustmentReason = '';

      // High volatility regime - reduce riskier assets
      if (volatilityRegime === 'EXTREME' || volatilityRegime === 'HIGH') {
        // Reduce weights of high-risk assets
        if (riskContribution > 0.15) { // High risk contribution
          adjustedWeight *= volatilityFactors.highRiskReduction;
          adjustmentReason = `Reduced due to high risk contribution (${(riskContribution * 100).toFixed(1)}%) in ${volatilityRegime} volatility`;
        } else if (riskContribution > 0.08) { // Medium risk contribution
          adjustedWeight *= volatilityFactors.mediumRiskReduction;
          adjustmentReason = `Moderately reduced due to elevated risk contribution in ${volatilityRegime} volatility`;
        }

        // Increase weights of defensive/low-correlation assets
        const avgCorrelation = this.calculateAverageCorrelation(symbol, symbols, correlationMatrix);
        if (avgCorrelation < 0.3) { // Low correlation
          adjustedWeight *= volatilityFactors.lowCorrelationBoost;
          if (adjustmentReason) adjustmentReason += '; ';
          adjustmentReason += `Increased due to low correlation (${avgCorrelation.toFixed(2)})`;
        }
      }
      // Low volatility regime - can take more risk
      else if (volatilityRegime === 'LOW') {
        // Increase weights of higher-return potential assets
        if (riskContribution < 0.05) { // Low risk contribution
          adjustedWeight *= volatilityFactors.lowRiskBoost;
          adjustmentReason = `Increased due to low risk contribution in ${volatilityRegime} volatility`;
        }
      }
      // Normal volatility - minor adjustments
      else {
        if (riskContribution > 0.12) {
          adjustedWeight *= volatilityFactors.normalRiskAdjustment;
          adjustmentReason = `Slightly reduced due to moderate risk contribution`;
        }
      }

      // Apply risk tolerance adjustments
      adjustedWeight = this.applyRiskToleranceAdjustment(adjustedWeight, riskTolerance, volatilityRegime);

      // Store allocation change
      if (Math.abs(adjustedWeight - currentWeight) > 0.01) { // More than 1% change
        allocationChanges[symbol] = {
          from: currentWeight,
          to: adjustedWeight,
          change: adjustedWeight - currentWeight,
          reason: adjustmentReason || 'Minor adjustment for optimization'
        };
      }

      adjustedAllocation[symbol] = adjustedWeight;
    }

    // Normalize to ensure weights sum to 100%
    const totalWeight = Object.values(adjustedAllocation).reduce((sum, weight) => sum + weight, 0);
    if (totalWeight > 0) {
      Object.keys(adjustedAllocation).forEach(symbol => {
        adjustedAllocation[symbol] = (adjustedAllocation[symbol] / totalWeight) * 100;
        if (allocationChanges[symbol]) {
          allocationChanges[symbol].to = adjustedAllocation[symbol];
          allocationChanges[symbol].change = allocationChanges[symbol].to - allocationChanges[symbol].from;
        }
      });
    }

    // Calculate risk adjustment metrics
    const riskAdjustment = await this.calculateRiskAdjustmentMetrics(
      baseAllocation,
      adjustedAllocation,
      correlationMatrix,
      marketVolatility
    );

    // Generate recommendations
    const recommendations = this.generateVolatilityAllocationRecommendations(
      volatilityRegime,
      riskTolerance,
      allocationChanges,
      riskAdjustment
    );

    return {
      adjustedAllocation,
      allocationChanges,
      riskAdjustment,
      recommendations
    };
  }

  /**
   * Get volatility adjustment factors
   */
  private getVolatilityAdjustmentFactors(
    regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME',
    riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
  ): {
    highRiskReduction: number;
    mediumRiskReduction: number;
    lowCorrelationBoost: number;
    lowRiskBoost: number;
    normalRiskAdjustment: number;
  } {
    const baseFactors = {
      EXTREME: {
        CONSERVATIVE: { highRiskReduction: 0.3, mediumRiskReduction: 0.6, lowCorrelationBoost: 1.2, lowRiskBoost: 1.0, normalRiskAdjustment: 0.7 },
        MODERATE: { highRiskReduction: 0.5, mediumRiskReduction: 0.7, lowCorrelationBoost: 1.3, lowRiskBoost: 1.1, normalRiskAdjustment: 0.8 },
        AGGRESSIVE: { highRiskReduction: 0.7, mediumRiskReduction: 0.8, lowCorrelationBoost: 1.4, lowRiskBoost: 1.2, normalRiskAdjustment: 0.9 }
      },
      HIGH: {
        CONSERVATIVE: { highRiskReduction: 0.5, mediumRiskReduction: 0.7, lowCorrelationBoost: 1.1, lowRiskBoost: 1.0, normalRiskAdjustment: 0.8 },
        MODERATE: { highRiskReduction: 0.6, mediumRiskReduction: 0.8, lowCorrelationBoost: 1.2, lowRiskBoost: 1.1, normalRiskAdjustment: 0.85 },
        AGGRESSIVE: { highRiskReduction: 0.8, mediumRiskReduction: 0.9, lowCorrelationBoost: 1.3, lowRiskBoost: 1.2, normalRiskAdjustment: 0.95 }
      },
      NORMAL: {
        CONSERVATIVE: { highRiskReduction: 0.8, mediumRiskReduction: 0.9, lowCorrelationBoost: 1.0, lowRiskBoost: 1.0, normalRiskAdjustment: 0.95 },
        MODERATE: { highRiskReduction: 0.9, mediumRiskReduction: 0.95, lowCorrelationBoost: 1.05, lowRiskBoost: 1.05, normalRiskAdjustment: 1.0 },
        AGGRESSIVE: { highRiskReduction: 0.95, mediumRiskReduction: 0.98, lowCorrelationBoost: 1.1, lowRiskBoost: 1.1, normalRiskAdjustment: 1.05 }
      },
      LOW: {
        CONSERVATIVE: { highRiskReduction: 1.0, mediumRiskReduction: 1.0, lowCorrelationBoost: 1.0, lowRiskBoost: 1.1, normalRiskAdjustment: 1.05 },
        MODERATE: { highRiskReduction: 1.0, mediumRiskReduction: 1.0, lowCorrelationBoost: 1.0, lowRiskBoost: 1.2, normalRiskAdjustment: 1.1 },
        AGGRESSIVE: { highRiskReduction: 1.0, mediumRiskReduction: 1.0, lowCorrelationBoost: 1.0, lowRiskBoost: 1.3, normalRiskAdjustment: 1.15 }
      }
    };

    return baseFactors[regime][riskTolerance];
  }

  /**
   * Calculate risk contributions for each asset
   */
  private async calculateRiskContributions(
    allocation: { [symbol: string]: number },
    correlationMatrix: { [symbol: string]: { [symbol: string]: number } },
    marketVolatility: number
  ): Promise<{ [symbol: string]: number }> {
    const symbols = Object.keys(allocation);
    const riskContributions: { [symbol: string]: number } = {};

    for (const symbol of symbols) {
      const weight = allocation[symbol] / 100; // Convert percentage to decimal

      // Calculate marginal risk contribution
      let marginalContribution = 0;
      for (const otherSymbol of symbols) {
        const otherWeight = allocation[otherSymbol] / 100;
        const correlation = correlationMatrix[symbol]?.[otherSymbol] || 0;
        marginalContribution += weight * otherWeight * correlation;
      }

      // Scale by market volatility
      const riskContribution = Math.abs(marginalContribution) * marketVolatility;
      riskContributions[symbol] = riskContribution;
    }

    // Normalize to sum to 1
    const totalRisk = Object.values(riskContributions).reduce((sum, risk) => sum + risk, 0);
    if (totalRisk > 0) {
      Object.keys(riskContributions).forEach(symbol => {
        riskContributions[symbol] = riskContributions[symbol] / totalRisk;
      });
    }

    return riskContributions;
  }

  /**
   * Calculate average correlation for a symbol
   */
  private calculateAverageCorrelation(
    symbol: string,
    allSymbols: string[],
    correlationMatrix: { [symbol: string]: { [symbol: string]: number } }
  ): number {
    let totalCorrelation = 0;
    let count = 0;

    for (const otherSymbol of allSymbols) {
      if (symbol !== otherSymbol) {
        const correlation = correlationMatrix[symbol]?.[otherSymbol] || 0;
        totalCorrelation += Math.abs(correlation);
        count++;
      }
    }

    return count > 0 ? totalCorrelation / count : 0;
  }

  /**
   * Apply risk tolerance adjustments
   */
  private applyRiskToleranceAdjustment(
    weight: number,
    riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE',
    volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME'
  ): number {
    const adjustments = {
      CONSERVATIVE: {
        'EXTREME': 0.8,
        'HIGH': 0.9,
        'NORMAL': 1.0,
        'LOW': 1.1
      },
      MODERATE: {
        'EXTREME': 0.9,
        'HIGH': 0.95,
        'NORMAL': 1.0,
        'LOW': 1.05
      },
      AGGRESSIVE: {
        'EXTREME': 0.95,
        'HIGH': 1.0,
        'NORMAL': 1.05,
        'LOW': 1.1
      }
    };

    return weight * adjustments[riskTolerance][volatilityRegime];
  }

  /**
   * Calculate risk adjustment metrics
   */
  private async calculateRiskAdjustmentMetrics(
    baseAllocation: { [symbol: string]: number },
    adjustedAllocation: { [symbol: string]: number },
    correlationMatrix: { [symbol: string]: { [symbol: string]: number } },
    marketVolatility: number
  ): Promise<{
    overallRisk: number;
    diversificationBenefit: number;
    volatilityReduction: number;
  }> {
    // Calculate portfolio risk before and after adjustment
    const baseRisk = this.calculatePortfolioRisk(baseAllocation, correlationMatrix, marketVolatility);
    const adjustedRisk = this.calculatePortfolioRisk(adjustedAllocation, correlationMatrix, marketVolatility);

    // Calculate diversification benefit
    const baseDiversification = this.calculateDiversificationRatio(baseAllocation, correlationMatrix);
    const adjustedDiversification = this.calculateDiversificationRatio(adjustedAllocation, correlationMatrix);
    const diversificationBenefit = adjustedDiversification - baseDiversification;

    // Calculate volatility reduction
    const volatilityReduction = (baseRisk - adjustedRisk) / baseRisk;

    return {
      overallRisk: adjustedRisk,
      diversificationBenefit,
      volatilityReduction: Math.max(0, volatilityReduction)
    };
  }

  /**
   * Calculate portfolio risk
   */
  private calculatePortfolioRisk(
    allocation: { [symbol: string]: number },
    correlationMatrix: { [symbol: string]: { [symbol: string]: number } },
    marketVolatility: number
  ): number {
    const symbols = Object.keys(allocation);
    let portfolioVariance = 0;

    for (let i = 0; i < symbols.length; i++) {
      for (let j = 0; j < symbols.length; j++) {
        const weight_i = allocation[symbols[i]] / 100;
        const weight_j = allocation[symbols[j]] / 100;
        const correlation = correlationMatrix[symbols[i]]?.[symbols[j]] || 0;

        portfolioVariance += weight_i * weight_j * correlation;
      }
    }

    return Math.sqrt(Math.max(0, portfolioVariance)) * marketVolatility;
  }

  /**
   * Calculate diversification ratio
   */
  private calculateDiversificationRatio(
    allocation: { [symbol: string]: number },
    correlationMatrix: { [symbol: string]: { [symbol: string]: number } }
  ): number {
    const symbols = Object.keys(allocation);
    let averageCorrelation = 0;
    let count = 0;

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const correlation = correlationMatrix[symbols[i]]?.[symbols[j]] || 0;
        averageCorrelation += Math.abs(correlation);
        count++;
      }
    }

    return count > 0 ? Math.max(0, 1 - averageCorrelation / count) : 1;
  }

  /**
   * Generate volatility allocation recommendations
   */
  private generateVolatilityAllocationRecommendations(
    volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME',
    riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE',
    allocationChanges: { [symbol: string]: { from: number; to: number; change: number; reason: string } },
    riskAdjustment: { overallRisk: number; diversificationBenefit: number; volatilityReduction: number }
  ): string[] {
    const recommendations: string[] = [];

    // Volatility regime recommendations
    if (volatilityRegime === 'EXTREME') {
      recommendations.push('Extreme market volatility detected - portfolio has been defensively repositioned');
      recommendations.push('Consider maintaining higher cash levels until volatility stabilizes');
    } else if (volatilityRegime === 'HIGH') {
      recommendations.push('High volatility environment - risk exposure has been reduced');
      recommendations.push('Monitor positions closely for further volatility changes');
    } else if (volatilityRegime === 'LOW') {
      recommendations.push('Low volatility environment - opportunity to increase risk exposure for better returns');
      recommendations.push('Consider taking advantage of market stability for strategic positioning');
    }

    // Risk tolerance recommendations
    if (riskTolerance === 'CONSERVATIVE') {
      recommendations.push('Conservative approach applied - emphasis on capital preservation');
    } else if (riskTolerance === 'AGGRESSIVE') {
      recommendations.push('Aggressive approach applied - emphasis on return optimization within risk bounds');
    }

    // Allocation change recommendations
    const significantChanges = Object.entries(allocationChanges).filter(([_, change]) =>
      Math.abs(change.change) > 5
    );

    if (significantChanges.length > 0) {
      recommendations.push(`${significantChanges.length} significant allocation adjustments made to optimize risk/return`);
    }

    // Risk adjustment recommendations
    if (riskAdjustment.volatilityReduction > 0.05) {
      recommendations.push(`Portfolio volatility reduced by ${(riskAdjustment.volatilityReduction * 100).toFixed(1)}% through dynamic allocation`);
    }

    if (riskAdjustment.diversificationBenefit > 0.05) {
      recommendations.push(`Diversification improved by ${(riskAdjustment.diversificationBenefit * 100).toFixed(1)}% through correlation-based adjustments`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Portfolio allocation optimized for current market conditions');
    }

    return recommendations;
  }

  /**
   * Update allocation thresholds based on market conditions
   */
  updateAllocationThresholds(marketConditions: {
    volatility: number;
    trend: 'BULL' | 'BEAR' | 'SIDEWAYS';
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  }): {
    rebalanceThreshold: number;
    maxDrift: number;
    minTradeSize: number;
    riskLimits: {
      maxPositionSize: number;
      maxSectorExposure: number;
      maxSingleAssetRisk: number;
    };
  } {
    const baseThresholds = {
      rebalanceThreshold: 5,
      maxDrift: 10,
      minTradeSize: 1000,
      riskLimits: {
        maxPositionSize: 25,
        maxSectorExposure: 40,
        maxSingleAssetRisk: 15
      }
    };

    // Adjust based on volatility
    if (marketConditions.volatility > 0.4) {
      baseThresholds.rebalanceThreshold = 3; // More frequent rebalancing in high volatility
      baseThresholds.maxDrift = 6;
      baseThresholds.riskLimits.maxPositionSize = 15;
      baseThresholds.riskLimits.maxSectorExposure = 30;
    } else if (marketConditions.volatility < 0.15) {
      baseThresholds.rebalanceThreshold = 8; // Less frequent in low volatility
      baseThresholds.maxDrift = 15;
      baseThresholds.riskLimits.maxPositionSize = 30;
      baseThresholds.riskLimits.maxSectorExposure = 45;
    }

    // Adjust based on trend
    if (marketConditions.trend === 'BEAR') {
      baseThresholds.rebalanceThreshold *= 0.8; // More frequent in bear markets
      baseThresholds.riskLimits.maxPositionSize *= 0.8;
    } else if (marketConditions.trend === 'BULL') {
      baseThresholds.rebalanceThreshold *= 1.2; // Less frequent in strong bull markets
    }

    return baseThresholds;
  }

  /**
   * Clear all data (for testing)
   */
  clearAllData(): void {
    this.portfolio.clear();
    this.sectors.clear();
    this.correlationHistory = [];
    this.rebalancingHistory = [];
    this.performanceHistory = [];

    tradingLogger.info('Portfolio management data cleared');
  }
}

export default PortfolioManagementService;