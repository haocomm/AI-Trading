/**
 * Risk-Adjusted Performance Optimization Service
 *
 * Integrates all risk management components to optimize portfolio
 * performance while maintaining appropriate risk levels through
 * sophisticated optimization algorithms.
 */

import { DynamicRiskService } from './dynamic-risk.service';
import { PortfolioManagementService } from './portfolio-management.service';
import { StressTestingService } from './stress-testing.service';
import { MultiTimeframeRiskService } from './multi-timeframe-risk.service';
import { CorrelationMonitoringService } from './correlation-monitoring.service';

export interface OptimizationObjective {
  type: 'SHARPE' | 'SORTINO' | 'MAX_RETURN' | 'MIN_RISK' | 'RISK_PARITY';
  weight: number;
  constraints?: {
    maxVolatility?: number;
    maxDrawdown?: number;
    minDiversification?: number;
    maxConcentration?: number;
  };
}

export interface OptimizationConstraints {
  maxPositionSize: number;
  maxSectorExposure: number;
  minPositionSize: number;
  maxTurnover: number;
  minCorrelation: number;
  maxLeverage: number;
  betaTarget?: number;
  durationTarget?: number;
}

export interface OptimizationResult {
  optimalWeights: { [symbol: string]: number };
  expectedReturn: number;
  expectedRisk: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  var95: number;
  var99: number;
  diversificationRatio: number;
  concentrationRisk: number;
  optimizationMetrics: {
    convergence: boolean;
    iterations: number;
    runtime: number;
    objectiveValue: number;
  };
  riskDecomposition: {
    systematic: number;
    idiosyncratic: number;
    total: number;
  };
  recommendations: string[];
  implementationPlan: {
    trades: Array<{
      symbol: string;
      action: 'BUY' | 'SELL';
      quantity: number;
      reason: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    expectedCost: number;
    expectedBenefit: string;
  };
}

export interface MarketEnvironment {
  volatility: number;
  trend: 'BULL' | 'BEAR' | 'SIDEWAYS';
  correlation: number;
  liquidity: 'HIGH' | 'NORMAL' | 'LOW';
  sentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  regime: 'NORMAL' | 'STRESSED' | 'CRISIS' | 'BULL';
}

export class RiskOptimizedPerformanceService {
  constructor(
    private dynamicRiskService: DynamicRiskService,
    private portfolioService: PortfolioManagementService,
    private stressTestService: StressTestingService,
    private multiTimeframeService: MultiTimeframeRiskService,
    private correlationService: CorrelationMonitoringService
  ) {}

  /**
   * Perform comprehensive portfolio optimization
   */
  async optimizePortfolio(
    symbols: string[],
    currentWeights: { [symbol: string]: number },
    objectives: OptimizationObjective[],
    constraints: OptimizationConstraints,
    marketEnvironment: MarketEnvironment,
    priceData: { [symbol: string]: number[] }
  ): Promise<OptimizationResult> {
    const startTime = Date.now();

    try {
      // Step 1: Gather all risk and return data
      const riskData = await this.gatherRiskData(symbols, priceData, marketEnvironment);

      // Step 2: Calculate expected returns and risk metrics
      const expectedReturns = this.calculateExpectedReturns(symbols, priceData, marketEnvironment);
      const covarianceMatrix = this.calculateCovarianceMatrix(symbols, priceData, riskData.correlations);

      // Step 3: Apply market condition adjustments
      const adjustedReturns = this.applyMarketConditionAdjustments(
        expectedReturns,
        riskData,
        marketEnvironment
      );

      // Step 4: Run optimization algorithm
      const optimizationResult = await this.runOptimization(
        symbols,
        adjustedReturns,
        covarianceMatrix,
        currentWeights,
        objectives,
        constraints,
        riskData
      );

      // Step 5: Validate and stress test results
      const validatedResult = await this.validateOptimization(
        optimizationResult,
        symbols,
        constraints,
        marketEnvironment,
        priceData
      );

      // Step 6: Create implementation plan
      const implementationPlan = this.createImplementationPlan(
        currentWeights,
        validatedResult.optimalWeights,
        constraints
      );

      const runtime = Date.now() - startTime;

      return {
        ...validatedResult,
        optimizationMetrics: {
          ...validatedResult.optimizationMetrics,
          runtime
        },
        implementationPlan
      };

    } catch (error) {
      console.error('Portfolio optimization failed:', error);
      throw new Error(`Optimization failed: ${error}`);
    }
  }

  /**
   * Gather comprehensive risk data
   */
  private async gatherRiskData(
    symbols: string[],
    priceData: { [symbol: string]: number[] },
    marketEnvironment: MarketEnvironment
  ): Promise<{
    volatilities: { [symbol: string]: number };
    correlations: { [symbol: string]: { [symbol: string]: number } };
    multiTimeframeRisks: { [symbol: string]: any };
    stressTestResults: { [symbol: string]: any };
    concentrationRisks: { [symbol: string]: number };
  }> {
    // Calculate individual asset volatilities
    const volatilities: { [symbol: string]: number } = {};
    symbols.forEach(symbol => {
      const returns = this.calculateReturns(priceData[symbol]);
      volatilities[symbol] = this.calculateVolatility(returns);
    });

    // Get correlation matrix
    const correlationMatrix = await this.correlationService.updateCorrelationMatrix(symbols, priceData);

    // Multi-timeframe risk assessment
    const multiTimeframeRisks: { [symbol: string]: any } = {};
    for (const symbol of symbols) {
      const assessment = await this.multiTimeframeService.assessMultiTimeframeRisk(
        symbol,
        priceData[symbol][priceData[symbol].length - 1],
        { '1D': priceData[symbol].slice(-252) } // Daily data for 1 year
      );
      multiTimeframeRisks[symbol] = assessment;
    }

    // Stress testing for individual assets
    const stressTestResults: { [symbol: string]: any } = {};
    for (const symbol of symbols) {
      const stressConfig = {
        portfolioValue: 100000,
        positions: [{
          symbol,
          quantity: 100,
          entryPrice: priceData[symbol][0],
          currentPrice: priceData[symbol][priceData[symbol].length - 1]
        }],
        timeframe: '1M',
        scenarios: ['2008_CRISIS', '2020COVID']
      };
      const results = await this.stressTestService.runStressTest(stressConfig);
      stressTestResults[symbol] = results;
    }

    // Calculate concentration risks
    const concentrationRisks: { [symbol: string]: number } = {};
    symbols.forEach(symbol => {
      concentrationRisks[symbol] = this.calculateConcentrationRisk(symbol, symbols, correlationMatrix);
    });

    return {
      volatilities,
      correlations: correlationMatrix.matrix.reduce((acc, row, i) => {
        acc[symbols[i]] = {};
        symbols.forEach((symbol, j) => {
          acc[symbols[i]][symbol] = row[j];
        });
        return acc;
      }, {} as { [symbol: string]: { [symbol: string]: number } }),
      multiTimeframeRisks,
      stressTestResults,
      concentrationRisks
    };
  }

  /**
   * Calculate expected returns
   */
  private calculateExpectedReturns(
    symbols: string[],
    priceData: { [symbol: string]: number[] },
    marketEnvironment: MarketEnvironment
  ): { [symbol: string]: number } {
    const expectedReturns: { [symbol: string]: number } = {};

    symbols.forEach(symbol => {
      const prices = priceData[symbol];
      const returns = this.calculateReturns(prices);

      // Historical mean return
      const historicalMean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;

      // Adjust for market conditions
      let adjustment = 1;
      if (marketEnvironment.trend === 'BULL') {
        adjustment *= 1.2;
      } else if (marketEnvironment.trend === 'BEAR') {
        adjustment *= 0.8;
      }

      // Adjust for sentiment
      if (marketEnvironment.sentiment === 'RISK_ON') {
        adjustment *= 1.1;
      } else if (marketEnvironment.sentiment === 'RISK_OFF') {
        adjustment *= 0.9;
      }

      expectedReturns[symbol] = historicalMean * adjustment * 252; // Annualized
    });

    return expectedReturns;
  }

  /**
   * Apply market condition adjustments
   */
  private applyMarketConditionAdjustments(
    expectedReturns: { [symbol: string]: number },
    riskData: any,
    marketEnvironment: MarketEnvironment
  ): { [symbol: string]: number } {
    const adjustedReturns = { ...expectedReturns };

    // Adjust based on volatility regime
    if (marketEnvironment.volatility > 0.4) {
      // High volatility - reduce return expectations
      Object.keys(adjustedReturns).forEach(symbol => {
        adjustedReturns[symbol] *= 0.8;
      });
    } else if (marketEnvironment.volatility < 0.15) {
      // Low volatility - increase return expectations
      Object.keys(adjustedReturns).forEach(symbol => {
        adjustedReturns[symbol] *= 1.1;
      });
    }

    // Adjust based on correlation environment
    if (marketEnvironment.correlation > 0.7) {
      // High correlation - reduce return expectations (less diversification benefit)
      Object.keys(adjustedReturns).forEach(symbol => {
        adjustedReturns[symbol] *= 0.9;
      });
    }

    // Adjust based on stress test results
    Object.keys(riskData.stressTestResults).forEach(symbol => {
      const stressResults = riskData.stressTestResults[symbol];
      if (stressResults && stressResults.length > 0) {
        const avgLoss = stressResults.reduce((sum: number, result: any) =>
          sum + Math.abs(result.maxLoss), 0) / stressResults.length;

        if (avgLoss > 0.3) { // More than 30% loss in stress scenarios
          adjustedReturns[symbol] *= 0.85; // Reduce expectations
        }
      }
    });

    return adjustedReturns;
  }

  /**
   * Run optimization algorithm
   */
  private async runOptimization(
    symbols: string[],
    expectedReturns: { [symbol: string]: number },
    covarianceMatrix: number[][],
    currentWeights: { [symbol: string]: number },
    objectives: OptimizationObjective[],
    constraints: OptimizationConstraints,
    riskData: any
  ): Promise<Partial<OptimizationResult>> {
    const n = symbols.length;

    // Initialize weights (start from current weights or equal weights)
    let weights = Object.keys(currentWeights).length > 0 ?
      symbols.map(s => currentWeights[s] || 0) :
      Array(n).fill(1 / n);

    // Normalize weights
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    weights = weights.map(w => w / totalWeight);

    let bestWeights = [...weights];
    let bestObjectiveValue = this.calculateObjectiveValue(
      weights, expectedReturns, covarianceMatrix, objectives
    );
    let iterations = 0;
    const maxIterations = 1000;
    const tolerance = 1e-6;

    // Gradient ascent with constraints
    while (iterations < maxIterations) {
      // Calculate gradient
      const gradient = this.calculateGradient(
        weights, expectedReturns, covarianceMatrix, objectives
      );

      // Update weights with learning rate
      const learningRate = 0.01 / Math.sqrt(iterations + 1);
      const newWeights = weights.map((w, i) =>
        Math.max(0, w + learningRate * gradient[i])
      );

      // Apply constraints
      const constrainedWeights = this.applyConstraints(
        newWeights, symbols, constraints, riskData
      );

      // Normalize
      const constrainedTotal = constrainedWeights.reduce((sum, w) => sum + w, 0);
      const normalizedWeights = constrainedTotal > 0 ?
        constrainedWeights.map(w => w / constrainedTotal) :
        Array(n).fill(1 / n);

      // Calculate new objective value
      const newObjectiveValue = this.calculateObjectiveValue(
        normalizedWeights, expectedReturns, covarianceMatrix, objectives
      );

      // Check convergence
      if (Math.abs(newObjectiveValue - bestObjectiveValue) < tolerance) {
        break;
      }

      // Update best solution
      if (newObjectiveValue > bestObjectiveValue) {
        bestObjectiveValue = newObjectiveValue;
        bestWeights = [...normalizedWeights];
      }

      weights = normalizedWeights;
      iterations++;
    }

    // Calculate portfolio metrics
    const portfolioReturn = weights.reduce((sum, w, i) =>
      sum + w * expectedReturns[symbols[i]], 0);

    const portfolioVariance = weights.reduce((sum, w, i) =>
      sum + weights.reduce((innerSum, w2, j) =>
        innerSum + w * w2 * covarianceMatrix[i][j], 0), 0);
    const portfolioRisk = Math.sqrt(portfolioVariance);

    // Convert weights array back to object
    const optimalWeights: { [symbol: string]: number } = {};
    symbols.forEach((symbol, i) => {
      optimalWeights[symbol] = bestWeights[i] * 100; // Convert to percentage
    });

    return {
      optimalWeights,
      expectedReturn: portfolioReturn,
      expectedRisk: portfolioRisk,
      sharpeRatio: this.calculateSharpeRatio(portfolioReturn, portfolioRisk),
      sortinoRatio: this.calculateSortinoRatio(portfolioReturn, portfolioRisk),
      optimizationMetrics: {
        convergence: iterations < maxIterations,
        iterations,
        runtime: 0, // Will be set by caller
        objectiveValue: bestObjectiveValue
      }
    };
  }

  /**
   * Validate optimization results
   */
  private async validateOptimization(
    result: Partial<OptimizationResult>,
    symbols: string[],
    constraints: OptimizationConstraints,
    marketEnvironment: MarketEnvironment,
    priceData: { [symbol: string]: number[] }
  ): Promise<OptimizationResult> {
    if (!result.optimalWeights || !result.expectedReturn || !result.expectedRisk) {
      throw new Error('Invalid optimization result');
    }

    // Calculate additional risk metrics
    const weights = symbols.map(s => (result.optimalWeights![s] || 0) / 100);
    const returns = this.calculatePortfolioReturns(weights, priceData, symbols);

    const maxDrawdown = this.calculateMaxDrawdown(returns);
    const var95 = this.calculateVaR(returns, 0.05);
    const var99 = this.calculateVaR(returns, 0.01);
    const diversificationRatio = this.calculateDiversificationRatio(weights, symbols);
    const concentrationRisk = this.calculateConcentrationScore(weights);

    // Risk decomposition
    const riskDecomposition = this.calculateRiskDecomposition(weights, symbols, priceData);

    // Generate recommendations
    const recommendations = this.generateOptimizationRecommendations(
      result,
      constraints,
      marketEnvironment,
      {
        maxDrawdown,
        var95,
        diversificationRatio,
        concentrationRisk
      }
    );

    return {
      optimalWeights: result.optimalWeights!,
      expectedReturn: result.expectedReturn,
      expectedRisk: result.expectedRisk,
      sharpeRatio: result.sharpeRatio || 0,
      sortinoRatio: result.sortinoRatio || 0,
      maxDrawdown,
      var95,
      var99,
      diversificationRatio,
      concentrationRisk,
      optimizationMetrics: result.optimizationMetrics!,
      riskDecomposition,
      recommendations,
      implementationPlan: {
        trades: [],
        expectedCost: 0,
        expectedBenefit: ''
      }
    };
  }

  /**
   * Create implementation plan
   */
  private createImplementationPlan(
    currentWeights: { [symbol: string]: number },
    optimalWeights: { [symbol: string]: number },
    constraints: OptimizationConstraints
  ): {
    trades: Array<{
      symbol: string;
      action: 'BUY' | 'SELL';
      quantity: number;
      reason: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    expectedCost: number;
    expectedBenefit: string;
  } {
    const trades: Array<{
      symbol: string;
      action: 'BUY' | 'SELL';
      quantity: number;
      reason: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
    }> = [];

    Object.keys(optimalWeights).forEach(symbol => {
      const currentWeight = currentWeights[symbol] || 0;
      const targetWeight = optimalWeights[symbol];
      const change = targetWeight - currentWeight;

      if (Math.abs(change) > 1) { // More than 1% change
        trades.push({
          symbol,
          action: change > 0 ? 'BUY' : 'SELL',
          quantity: Math.abs(change),
          reason: this.getTradeReason(change, currentWeight, targetWeight),
          priority: Math.abs(change) > 5 ? 'HIGH' : Math.abs(change) > 2 ? 'MEDIUM' : 'LOW'
        });
      }
    });

    // Sort by priority and magnitude
    trades.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return b.quantity - a.quantity;
    });

    const expectedCost = trades.length * 10; // Simplified cost calculation
    const expectedBenefit = `Portfolio optimization for improved risk-adjusted returns`;

    return {
      trades,
      expectedCost,
      expectedBenefit
    };
  }

  // Helper methods
  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  private calculateVolatility(returns: number[]): number {
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    return Math.sqrt(variance * 252); // Annualized
  }

  private calculateCovarianceMatrix(
    symbols: string[],
    priceData: { [symbol: string]: number[] },
    correlations: { [symbol: string]: { [symbol: string]: number } }
  ): number[][] {
    const n = symbols.length;
    const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

    const volatilities: { [symbol: string]: number } = {};
    symbols.forEach(symbol => {
      const returns = this.calculateReturns(priceData[symbol]);
      volatilities[symbol] = this.calculateVolatility(returns);
    });

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const correlation = correlations[symbols[i]]?.[symbols[j]] || 0;
        matrix[i][j] = correlation * volatilities[symbols[i]] * volatilities[symbols[j]];
      }
    }

    return matrix;
  }

  private calculateObjectiveValue(
    weights: number[],
    expectedReturns: { [symbol: string]: number },
    covarianceMatrix: number[][],
    objectives: OptimizationObjective[]
  ): number {
    let totalObjective = 0;

    objectives.forEach(objective => {
      const portfolioReturn = weights.reduce((sum, w, i) =>
        sum + w * Object.values(expectedReturns)[i], 0);

      const portfolioVariance = weights.reduce((sum, w, i) =>
        sum + weights.reduce((innerSum, w2, j) =>
          innerSum + w * w2 * covarianceMatrix[i][j], 0), 0);
      const portfolioRisk = Math.sqrt(portfolioVariance);

      let objectiveValue = 0;

      switch (objective.type) {
        case 'SHARPE':
          objectiveValue = portfolioRisk > 0 ? portfolioReturn / portfolioRisk : 0;
          break;
        case 'SORTINO':
          // Simplified Sortino ratio
          objectiveValue = portfolioRisk > 0 ? portfolioReturn / (portfolioRisk * 0.8) : 0;
          break;
        case 'MAX_RETURN':
          objectiveValue = portfolioReturn;
          break;
        case 'MIN_RISK':
          objectiveValue = -portfolioRisk;
          break;
        case 'RISK_PARITY':
          // Equal risk contribution
          const riskContributions = weights.map((w, i) =>
            w * weights.reduce((sum, w2, j) => w2 * covarianceMatrix[i][j], 0)
          );
          const avgRiskContribution = riskContributions.reduce((sum, rc) => sum + rc, 0) / riskContributions.length;
          const riskParityScore = -riskContributions.reduce((sum, rc) =>
            sum + Math.pow(rc - avgRiskContribution, 2), 0);
          objectiveValue = riskParityScore;
          break;
      }

      totalObjective += objectiveValue * objective.weight;
    });

    return totalObjective;
  }

  private calculateGradient(
    weights: number[],
    expectedReturns: { [symbol: string]: number },
    covarianceMatrix: number[][],
    objectives: OptimizationObjective[]
  ): number[] {
    const n = weights.length;
    const gradient: number[] = Array(n).fill(0);
    const h = 1e-6; // Small step for numerical gradient

    const baseObjective = this.calculateObjectiveValue(weights, expectedReturns, covarianceMatrix, objectives);

    for (let i = 0; i < n; i++) {
      const perturbedWeights = [...weights];
      perturbedWeights[i] += h;

      const perturbedObjective = this.calculateObjectiveValue(
        perturbedWeights, expectedReturns, covarianceMatrix, objectives
      );

      gradient[i] = (perturbedObjective - baseObjective) / h;
    }

    return gradient;
  }

  private applyConstraints(
    weights: number[],
    symbols: string[],
    constraints: OptimizationConstraints,
    riskData: any
  ): number[] {
    let constrainedWeights = [...weights];

    // Position size constraints
    constrainedWeights = constrainedWeights.map(w =>
      Math.min(constraints.maxPositionSize / 100, Math.max(constraints.minPositionSize / 100, w))
    );

    // Normalize
    const total = constrainedWeights.reduce((sum, w) => sum + w, 0);
    if (total > 0) {
      constrainedWeights = constrainedWeights.map(w => w / total);
    }

    return constrainedWeights;
  }

  private calculateSharpeRatio(expectedReturn: number, risk: number): number {
    return risk > 0 ? expectedReturn / risk : 0;
  }

  private calculateSortinoRatio(expectedReturn: number, risk: number): number {
    // Simplified Sortino calculation
    return risk > 0 ? expectedReturn / (risk * 0.8) : 0;
  }

  private calculatePortfolioReturns(
    weights: number[],
    priceData: { [symbol: string]: number[] },
    symbols: string[]
  ): number[] {
    const minLength = Math.min(...symbols.map(s => priceData[s]?.length || 0));
    const returns: number[] = [];

    for (let i = 1; i < minLength; i++) {
      let portfolioReturn = 0;
      symbols.forEach((symbol, j) => {
        const symbolReturn = (priceData[symbol][i] - priceData[symbol][i - 1]) / priceData[symbol][i - 1];
        portfolioReturn += weights[j] * symbolReturn;
      });
      returns.push(portfolioReturn);
    }

    return returns;
  }

  private calculateMaxDrawdown(returns: number[]): number {
    let peak = 1;
    let maxDrawdown = 0;
    let cumulative = 1;

    for (const ret of returns) {
      cumulative *= (1 + ret);
      peak = Math.max(peak, cumulative);
      const drawdown = (peak - cumulative) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  private calculateVaR(returns: number[], confidence: number): number {
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor(returns.length * confidence);
    return Math.abs(sortedReturns[index] || 0);
  }

  private calculateDiversificationRatio(weights: number[], symbols: string[]): number {
    // Simplified diversification ratio
    const n = weights.length;
    const effectiveSize = 1 / weights.reduce((sum, w) => sum + w * w, 0);
    return effectiveSize / n;
  }

  private calculateConcentrationScore(weights: number[]): number {
    // Herfindahl-Hirschman Index
    return weights.reduce((sum, w) => sum + w * w, 0);
  }

  private calculateConcentrationRisk(
    symbol: string,
    allSymbols: string[],
    correlationMatrix: any
  ): number {
    // Simplified concentration risk calculation
    const avgCorrelation = allSymbols.reduce((sum, s) =>
      sum + Math.abs(correlationMatrix[symbol]?.[s] || 0), 0) / allSymbols.length;
    return avgCorrelation;
  }

  private calculateRiskDecomposition(
    weights: number[],
    symbols: string[],
    priceData: { [symbol: string]: number[] }
  ): { systematic: number; idiosyncratic: number; total: number } {
    // Simplified risk decomposition
    const portfolioReturns = this.calculatePortfolioReturns(weights, priceData, symbols);
    const portfolioVolatility = this.calculateVolatility(portfolioReturns);

    // Assume 70% systematic, 30% idiosyncratic for diversified portfolio
    const systematic = portfolioVolatility * 0.7;
    const idiosyncratic = portfolioVolatility * 0.3;
    const total = portfolioVolatility;

    return { systematic, idiosyncratic, total };
  }

  private generateOptimizationRecommendations(
    result: Partial<OptimizationResult>,
    constraints: OptimizationConstraints,
    marketEnvironment: MarketEnvironment,
    riskMetrics: any
  ): string[] {
    const recommendations: string[] = [];

    if (result.sharpeRatio! > 1.5) {
      recommendations.push('Excellent risk-adjusted return potential identified');
    } else if (result.sharpeRatio! < 0.5) {
      recommendations.push('Consider reviewing optimization objectives for better risk-adjusted returns');
    }

    if (riskMetrics.maxDrawdown > 0.2) {
      recommendations.push('High drawdown risk - consider more conservative positioning');
    }

    if (riskMetrics.diversificationRatio < 0.7) {
      recommendations.push('Portfolio concentration is high - consider adding diversification');
    }

    if (marketEnvironment.volatility > 0.4) {
      recommendations.push('High market volatility - maintain defensive positioning');
    }

    return recommendations;
  }

  private getTradeReason(change: number, current: number, target: number): string {
    if (change > 5) {
      return `Significant underweight position - increase from ${current.toFixed(1)}% to ${target.toFixed(1)}%`;
    } else if (change < -5) {
      return `Significant overweight position - reduce from ${current.toFixed(1)}% to ${target.toFixed(1)}%`;
    } else if (change > 0) {
      return `Modest increase from ${current.toFixed(1)}% to ${target.toFixed(1)}% for optimization`;
    } else {
      return `Modest reduction from ${current.toFixed(1)}% to ${target.toFixed(1)}% for optimization`;
    }
  }
}