/**
 * Dynamic Risk Management Service
 *
 * Advanced risk management system with volatility-adaptive position sizing,
 * correlation-based portfolio risk, and dynamic risk limits.
 */

import { tradingLogger } from '@/utils/logger';
import { tradingConfig } from '@/config';

export interface RiskParameters {
  // Position sizing
  maxPositionSizeUSD: number;
  riskPerTradePercentage: number;
  maxDailyLossPercentage: number;
  maxConcurrentPositions: number;

  // Stop loss and take profit
  defaultStopLossPercentage: number;
  defaultTakeProfitPercentage: number;
  trailingStopPercentage: number;

  // Portfolio risk
  maxPortfolioRiskPercentage: number;
  correlationThreshold: number;
  maxSectorExposure: number;

  // Dynamic risk
  volatilityAdjustment: boolean;
  marketConditionAdjustment: boolean;
  drawdownProtection: boolean;

  // Emergency limits
  emergencyStopThreshold: number;
  maxDrawdownThreshold: number;
}

export interface MarketVolatility {
  current: number;
  average: number;
  percentile: number; // 0-1
  trend: 'INCREASING' | 'DECREASING' | 'STABLE';
  regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
}

export interface MarketCondition {
  regime: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'REVERSAL';
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentiment: 'FEARFUL' | 'NEUTRAL' | 'GREEDY';
  liquidity: 'HIGH' | 'NORMAL' | 'LOW';
  volume: 'HIGH' | 'NORMAL' | 'LOW';
  timeOfDay: 'OPENING' | 'MID_DAY' | 'CLOSING' | 'AFTER_HOURS';
}

export interface Position {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  timestamp: number;
  allocation: number; // Percentage of portfolio
  sector?: string;
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: number;
}

export interface PortfolioRisk {
  totalValue: number;
  totalExposure: number;
  totalRisk: number;
  riskUtilization: number; // 0-1
  correlationMatrix: Record<string, Record<string, number>>;
  sectorExposure: Record<string, number>;
  maxDrawdown: number;
  currentDrawdown: number;
  var: number; // Value at Risk
  cvar: number; // Conditional Value at Risk
  sharpeRatio: number;
  beta: number;
}

export interface RiskAssessment {
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD' | 'REDUCE' | 'CLOSE';
  confidence: number;
  suggestedPositionSize: number;
  suggestedStopLoss: number;
  suggestedTakeProfit: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  riskFactors: string[];
  warnings: string[];
  timeHorizon: 'SCALP' | 'DAY' | 'SWING' | 'POSITION';
  adjustedParameters: Partial<RiskParameters>;
}

export interface StressTestScenario {
  id: string;
  name: string;
  description: string;
  type: 'HISTORICAL' | 'MONTE_CARLO' | 'HYPOTHETICAL';

  // Scenario parameters
  marketDrop: number;
  volatilitySpike: number;
  correlationBreakdown: boolean;
  liquidityCrisis: boolean;

  // Test results
  portfolioImpact: number;
  maxLoss: number;
  recoveryTime: number;
  survivingPositions: string[];
  failedPositions: string[];

  // Risk metrics
  varAtRisk: number;
  expectedShortfall: number;
  probabilityOfDefault: number;
}

export interface RiskMetrics {
  // Real-time metrics
  currentVolatility: number;
  averageTrueRange: number;
  beta: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;

  // Value at Risk
  var_1day: number;
  var_5day: number;
  var_30day: number;
  cvar_95: number;
  cvar_99: number;

  // Position metrics
  totalExposure: number;
  netExposure: number;
  leverage: number;
  concentration: number;

  // Time-based metrics
  intradayRisk: number;
  dailyRisk: number;
  weeklyRisk: number;
}

export class DynamicRiskService {
  private static instance: DynamicRiskService;
  private riskParameters: RiskParameters;
  private positions: Position[] = [];
  private portfolioHistory: Array<{ timestamp: number; value: number; risk: number }> = [];
  private volatilityHistory: MarketVolatility[] = [];
  private correlationData: Map<string, Map<string, number>> = new Map();
  private stressTestResults: StressTestScenario[] = [];

  // Risk calculation caches
  private correlationMatrix: Record<string, Record<string, number>> = {};
  private lastCorrelationUpdate: number = 0;
  private varCache: Map<string, number> = new Map();

  private constructor() {
    this.riskParameters = {
      maxPositionSizeUSD: 10000,
      riskPerTradePercentage: 2,
      maxDailyLossPercentage: 5,
      maxConcurrentPositions: 3,
      defaultStopLossPercentage: 2,
      defaultTakeProfitPercentage: 4,
      trailingStopPercentage: 1.5,
      maxPortfolioRiskPercentage: 20,
      correlationThreshold: 0.7,
      maxSectorExposure: 30,
      volatilityAdjustment: true,
      marketConditionAdjustment: true,
      drawdownProtection: true,
      emergencyStopThreshold: 10,
      maxDrawdownThreshold: 15,
    };
  }

  static getInstance(): DynamicRiskService {
    if (!DynamicRiskService.instance) {
      DynamicRiskService.instance = new DynamicRiskService();
    }
    return DynamicRiskService.instance;
  }

  /**
   * Calculate dynamic position size based on volatility and market conditions
   */
  calculateDynamicPositionSize(
    symbol: string,
    volatility: MarketVolatility,
    marketCondition: MarketCondition,
    accountBalance: number,
    basePositionSize?: number
  ): {
    adjustedSize: number;
    adjustmentFactors: Record<string, number>;
    reasoning: string[];
    riskLevel: string;
  } {
    const baseSize = basePositionSize || this.riskParameters.maxPositionSizeUSD;
    const adjustmentFactors: Record<string, number> = {};
    const reasoning: string[] = [];

    // Volatility adjustment
    let volatilityAdjustment = 1.0;
    if (this.riskParameters.volatilityAdjustment) {
      if (volatility.regime === 'EXTREME') {
        volatilityAdjustment = 0.3; // Reduce position size by 70%
        reasoning.push('Extreme volatility - reducing position size to 30%');
      } else if (volatility.regime === 'HIGH') {
        volatilityAdjustment = 0.5; // Reduce position size by 50%
        reasoning.push('High volatility - reducing position size to 50%');
      } else if (volatility.regime === 'LOW') {
        volatilityAdjustment = 1.2; // Increase position size by 20%
        reasoning.push('Low volatility - increasing position size to 120%');
      }
    }
    adjustmentFactors.volatility = volatilityAdjustment;

    // Market condition adjustment
    let marketConditionAdjustment = 1.0;
    if (this.riskParameters.marketConditionAdjustment) {
      if (marketCondition.regime === 'REVERSAL') {
        marketConditionAdjustment = 0.6; // Reduce position size by 40%
        reasoning.push('Market reversal detected - reducing position size to 60%');
      } else if (marketCondition.regime === 'VOLATILE') {
        marketConditionAdjustment = 0.7; // Reduce position size by 30%
        reasoning.push('Volatile market conditions - reducing position size to 70%');
      } else if (marketCondition.trend === 'NEUTRAL' && marketCondition.liquidity === 'LOW') {
        marketConditionAdjustment = 0.8; // Reduce position size by 20%
        reasoning.push('Neutral trend with low liquidity - reducing position size to 80%');
      }
    }
    adjustmentFactors.marketCondition = marketConditionAdjustment;

    // Time of day adjustment
    let timeOfDayAdjustment = 1.0;
    if (marketCondition.timeOfDay === 'OPENING' || marketCondition.timeOfDay === 'CLOSING') {
      timeOfDayAdjustment = 0.8; // Reduce position size by 20%
      reasoning.push(`${marketCondition.timeOfDay} volatility - reducing position size to 80%`);
    } else if (marketCondition.timeOfDay === 'AFTER_HOURS') {
      timeOfDayAdjustment = 0.5; // Reduce position size by 50%
      reasoning.push('After-hours trading - reducing position size to 50%');
    }
    adjustmentFactors.timeOfDay = timeOfDayAdjustment;

    // Sentiment adjustment
    let sentimentAdjustment = 1.0;
    if (marketCondition.sentiment === 'FEARFUL') {
      sentimentAdjustment = 0.8; // Reduce position size by 20%
      reasoning.push('Fearful market sentiment - reducing position size to 80%');
    } else if (marketCondition.sentiment === 'GREEDY') {
      sentimentAdjustment = 0.9; // Reduce position size by 10%
      reasoning.push('Greedy market sentiment - reducing position size to 90%');
    }
    adjustmentFactors.sentiment = sentimentAdjustment;

    // Calculate total adjustment
    const totalAdjustment = volatilityAdjustment *
                           marketConditionAdjustment *
                           timeOfDayAdjustment *
                           sentimentAdjustment;

    // Apply adjustment to base size
    let adjustedSize = baseSize * totalAdjustment;

    // Apply minimum and maximum limits
    const minSize = baseSize * 0.1; // Minimum 10% of base size
    const maxSize = baseSize * 1.5; // Maximum 150% of base size

    adjustedSize = Math.max(minSize, Math.min(maxSize, adjustedSize));

    // Ensure it doesn't exceed maximum position size
    adjustedSize = Math.min(adjustedSize, this.riskParameters.maxPositionSizeUSD);

    // Ensure it doesn't exceed risk per trade percentage
    const maxRiskAmount = accountBalance * (this.riskParameters.riskPerTradePercentage / 100);
    adjustedSize = Math.min(adjustedSize, maxRiskAmount);

    // Determine risk level
    let riskLevel = 'MEDIUM';
    if (totalAdjustment < 0.5) {
      riskLevel = 'HIGH';
    } else if (totalAdjustment > 0.9) {
      riskLevel = 'LOW';
    }

    return {
      adjustedSize,
      adjustmentFactors,
      reasoning,
      riskLevel,
    };
  }

  /**
   * Calculate correlation-based position limits
   */
  async calculateCorrelationBasedLimits(
    currentPositions: Array<{ symbol: string; quantity: number; value: number }>,
    newSymbol: string,
    proposedValue: number
  ): Promise<{
    allowed: boolean;
    adjustedValue: number;
    reason: string;
    portfolioCorrelation: number;
    sectorExposure: { [sector: string]: number };
  }> {
    try {
      // Get correlation matrix for current positions + new position
      const correlationMatrix = await this.getCorrelationMatrix([
        ...currentPositions.map(p => p.symbol),
        newSymbol
      ]);

      // Calculate sector exposures
      const sectorExposure = await this.calculateSectorExposures([
        ...currentPositions,
        { symbol: newSymbol, quantity: 0, value: proposedValue }
      ]);

      // Check portfolio correlation limits
      const portfolioCorrelationScore = this.calculatePortfolioCorrelationScore(
        currentPositions,
        newSymbol,
        proposedValue,
        correlationMatrix
      );

      // Check sector concentration limits
      const sectorConcentrationCheck = this.checkSectorConcentrationLimits(sectorExposure);

      // Calculate maximum allowed value based on correlation
      let maxAllowedValue = proposedValue;
      let reason = 'Position approved';

      if (portfolioCorrelationScore > 0.8) {
        // High correlation - reduce position
        const correlationReduction = 1 - (portfolioCorrelationScore - 0.8) / 0.2;
        maxAllowedValue = Math.min(proposedValue, proposedValue * correlationReduction);
        reason = `High portfolio correlation (${(portfolioCorrelationScore * 100).toFixed(1)}%) - position reduced`;
      }

      if (!sectorConcentrationCheck.withinLimits) {
        maxAllowedValue = Math.min(maxAllowedValue, sectorConcentrationCheck.maxAllowedValue);
        reason = sectorConcentrationCheck.reason;
      }

      return {
        allowed: maxAllowedValue >= this.riskMetrics.minPositionSize,
        adjustedValue: maxAllowedValue,
        reason,
        portfolioCorrelation: portfolioCorrelationScore,
        sectorExposure
      };

    } catch (error) {
      console.error('Error calculating correlation-based limits:', error);
      return {
        allowed: false,
        adjustedValue: 0,
        reason: 'Error calculating correlation limits',
        portfolioCorrelation: 0,
        sectorExposure: {}
      };
    }
  }

  /**
   * Get correlation matrix for symbols
   */
  private async getCorrelationMatrix(symbols: string[]): Promise<{ [key: string]: { [key: string]: number } }> {
    const correlationMatrix: { [key: string]: { [key: string]: number } } = {};

    // Initialize matrix
    symbols.forEach(symbol1 => {
      correlationMatrix[symbol1] = {};
      symbols.forEach(symbol2 => {
        correlationMatrix[symbol1][symbol2] = symbol1 === symbol2 ? 1 : 0;
      });
    });

    // Calculate correlations (simplified - in production, use historical price data)
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const correlation = await this.calculateSymbolCorrelation(symbols[i], symbols[j]);
        correlationMatrix[symbols[i]][symbols[j]] = correlation;
        correlationMatrix[symbols[j]][symbols[i]] = correlation;
      }
    }

    return correlationMatrix;
  }

  /**
   * Calculate correlation between two symbols
   */
  private async calculateSymbolCorrelation(symbol1: string, symbol2: string): Promise<number> {
    try {
      // Get sector information
      const sector1 = await this.getSymbolSector(symbol1);
      const sector2 = await this.getSymbolSector(symbol2);

      // Base correlation on sector (simplified approach)
      if (sector1 === sector2) {
        // Same sector - higher correlation
        return 0.7 + Math.random() * 0.3; // 0.7 to 1.0
      } else if (this.areRelatedSectors(sector1, sector2)) {
        // Related sectors - moderate correlation
        return 0.3 + Math.random() * 0.4; // 0.3 to 0.7
      } else {
        // Unrelated sectors - low correlation
        return Math.random() * 0.3; // 0.0 to 0.3
      }
    } catch (error) {
      console.error(`Error calculating correlation for ${symbol1} and ${symbol2}:`, error);
      return 0.3; // Default moderate correlation
    }
  }

  /**
   * Get sector for symbol
   */
  private async getSymbolSector(symbol: string): Promise<string> {
    // Simplified sector mapping (in production, use proper classification)
    const sectorMap: { [key: string]: string } = {
      'BTC': 'Cryptocurrency',
      'ETH': 'Cryptocurrency',
      'AAPL': 'Technology',
      'GOOGL': 'Technology',
      'MSFT': 'Technology',
      'JPM': 'Finance',
      'GS': 'Finance'
    };

    return sectorMap[symbol] || 'Other';
  }

  /**
   * Check if sectors are related
   */
  private areRelatedSectors(sector1: string, sector2: string): boolean {
    const relatedSectors: { [key: string]: string[] } = {
      'Technology': ['Finance', 'Communication'],
      'Finance': ['Technology', 'Real Estate'],
      'Healthcare': ['Technology', 'Consumer Goods'],
      'Energy': ['Industrial', 'Materials']
    };

    return relatedSectors[sector1]?.includes(sector2) || relatedSectors[sector2]?.includes(sector1);
  }

  /**
   * Calculate sector exposures
   */
  private async calculateSectorExposures(
    positions: Array<{ symbol: string; quantity: number; value: number }>
  ): Promise<{ [sector: string]: number }> {
    const sectorExposure: { [sector: string]: number } = {};
    const totalValue = positions.reduce((sum, p) => sum + p.value, 0);

    for (const position of positions) {
      const sector = await this.getSymbolSector(position.symbol);
      sectorExposure[sector] = (sectorExposure[sector] || 0) + position.value;
    }

    // Convert to percentages
    Object.keys(sectorExposure).forEach(sector => {
      sectorExposure[sector] = totalValue > 0 ? sectorExposure[sector] / totalValue : 0;
    });

    return sectorExposure;
  }

  /**
   * Calculate portfolio correlation score
   */
  private calculatePortfolioCorrelationScore(
    currentPositions: Array<{ symbol: string; quantity: number; value: number }>,
    newSymbol: string,
    newValue: number,
    correlationMatrix: { [key: string]: { [key: string]: number } }
  ): number {
    if (currentPositions.length === 0) return 0;

    const allPositions = [
      ...currentPositions,
      { symbol: newSymbol, quantity: 0, value: newValue }
    ];

    const totalValue = allPositions.reduce((sum, p) => sum + p.value, 0);
    let weightedCorrelation = 0;

    // Calculate weighted average correlation
    for (let i = 0; i < allPositions.length; i++) {
      for (let j = i + 1; j < allPositions.length; j++) {
        const weight1 = allPositions[i].value / totalValue;
        const weight2 = allPositions[j].value / totalValue;
        const correlation = correlationMatrix[allPositions[i].symbol][allPositions[j].symbol];

        weightedCorrelation += weight1 * weight2 * correlation;
      }
    }

    return weightedCorrelation;
  }

  /**
   * Check sector concentration limits
   */
  private checkSectorConcentrationLimits(
    sectorExposure: { [sector: string]: number }
  ): { withinLimits: boolean; maxAllowedValue: number; reason: string } {
    const maxSectorExposure = 0.4; // 40% max in any sector
    const maxTotalExposure = 0.6; // 60% max in top 2 sectors

    let violatingSector = '';
    let maxAllowedValue = Infinity;

    // Check individual sector limits
    Object.entries(sectorExposure).forEach(([sector, exposure]) => {
      if (exposure > maxSectorExposure) {
        violatingSector = sector;
        maxAllowedValue = Math.min(maxAllowedValue, maxSectorExposure / exposure);
      }
    });

    // Check concentration in top sectors
    const sortedSectors = Object.values(sectorExposure).sort((a, b) => b - a);
    const topTwoExposure = sortedSectors.slice(0, 2).reduce((sum, exp) => sum + exp, 0);

    if (topTwoExposure > maxTotalExposure) {
      return {
        withinLimits: false,
        maxAllowedValue: maxTotalExposure / topTwoExposure,
        reason: `Excessive sector concentration: top 2 sectors ${(topTwoExposure * 100).toFixed(1)}% > ${(maxTotalExposure * 100).toFixed(1)}%`
      };
    }

    if (violatingSector) {
      return {
        withinLimits: false,
        maxAllowedValue,
        reason: `Sector ${violatingSector} exposure ${(sectorExposure[violatingSector] * 100).toFixed(1)}% > ${(maxSectorExposure * 100).toFixed(1)}%`
      };
    }

    return {
      withinLimits: true,
      maxAllowedValue: Infinity,
      reason: 'Sector concentrations within limits'
    };
  }

  /**
   * Update risk parameters based on market conditions
   */
  updateRiskParameters(
    volatility: MarketVolatility,
    marketCondition: MarketCondition,
    portfolioMetrics: PortfolioRisk
  ): Partial<RiskParameters> {
    const updates: Partial<RiskParameters> = {};

    // Adjust risk per trade based on volatility
    if (volatility.regime === 'EXTREME') {
      updates.riskPerTradePercentage = Math.max(1, this.riskParameters.riskPerTradePercentage * 0.5);
    } else if (volatility.regime === 'HIGH') {
      updates.riskPerTradePercentage = Math.max(1.5, this.riskParameters.riskPerTradePercentage * 0.75);
    }

    // Adjust max daily loss based on drawdown
    if (portfolioMetrics.currentDrawdown > this.riskParameters.maxDrawdownThreshold * 0.8) {
      updates.maxDailyLossPercentage = Math.max(
        1,
        this.riskParameters.maxDailyLossPercentage * 0.5
      );
    }

    // Adjust stop loss based on volatility
    if (volatility.regime === 'HIGH' || volatility.regime === 'EXTREME') {
      updates.defaultStopLossPercentage = this.riskParameters.defaultStopLossPercentage * 1.5;
    }

    return updates;
  }

  /**
   * Check maximum drawdown protection
   */
  async checkDrawdownProtection(
    portfolioValue: number,
    historicalValues: number[],
    riskLimits?: {
      maxDrawdown?: number;
      emergencyStop?: number;
      recoveryMode?: boolean;
    }
  ): Promise<{
    protectionTriggered: boolean;
    currentDrawdown: number;
    maxAllowedDrawdown: number;
    actionRequired: 'NONE' | 'REDUCE_POSITIONS' | 'STOP_TRADING' | 'EMERGENCY_EXIT';
    recommendations: string[];
    dynamicLimits: {
      maxPositionSize: number;
      riskPerTrade: number;
      maxDailyLoss: number;
    };
  }> {
    const currentDrawdown = this.calculateCurrentDrawdown(portfolioValue, historicalValues);
    const maxAllowedDrawdown = riskLimits?.maxDrawdown || this.riskParameters.maxDrawdownThreshold;
    const emergencyStopLevel = riskLimits?.emergencyStop || maxAllowedDrawdown * 1.5;

    let protectionTriggered = false;
    let actionRequired: 'NONE' | 'REDUCE_POSITIONS' | 'STOP_TRADING' | 'EMERGENCY_EXIT' = 'NONE';
    const recommendations: string[] = [];

    // Determine action based on drawdown level
    if (currentDrawdown >= emergencyStopLevel) {
      protectionTriggered = true;
      actionRequired = 'EMERGENCY_EXIT';
      recommendations.push('CRITICAL: Emergency stop triggered - exit all positions immediately');
      recommendations.push('Review risk management strategy before resuming trading');
    } else if (currentDrawdown >= maxAllowedDrawdown) {
      protectionTriggered = true;
      actionRequired = 'STOP_TRADING';
      recommendations.push('Maximum drawdown exceeded - suspend all new trading activity');
      recommendations.push('Consider reducing existing positions to minimize further risk');
    } else if (currentDrawdown >= maxAllowedDrawdown * 0.8) {
      protectionTriggered = true;
      actionRequired = 'REDUCE_POSITIONS';
      recommendations.push('Approaching maximum drawdown - reduce position sizes');
      recommendations.push('Tighten stop-losses and risk parameters');
    } else if (currentDrawdown >= maxAllowedDrawdown * 0.6) {
      recommendations.push('Drawdown is elevated - monitor closely and consider reducing risk');
    }

    // Calculate dynamic limits based on drawdown
    const dynamicLimits = this.calculateDynamicLimits(currentDrawdown, maxAllowedDrawdown);

    return {
      protectionTriggered,
      currentDrawdown,
      maxAllowedDrawdown,
      actionRequired,
      recommendations,
      dynamicLimits
    };
  }

  /**
   * Calculate current drawdown
   */
  private calculateCurrentDrawdown(currentValue: number, historicalValues: number[]): number {
    if (historicalValues.length === 0) return 0;

    const peak = Math.max(...historicalValues, currentValue);
    const drawdown = (peak - currentValue) / peak;

    return Math.max(0, drawdown);
  }

  /**
   * Calculate dynamic risk limits based on drawdown
   */
  private calculateDynamicLimits(
    currentDrawdown: number,
    maxAllowedDrawdown: number
  ): {
    maxPositionSize: number;
    riskPerTrade: number;
    maxDailyLoss: number;
  } {
    const drawdownRatio = currentDrawdown / maxAllowedDrawdown;

    // Progressive risk reduction as drawdown increases
    let positionSizeMultiplier = 1;
    let riskPerTradeMultiplier = 1;
    let maxDailyLossMultiplier = 1;

    if (drawdownRatio >= 1.0) {
      // Emergency - stop all trading
      positionSizeMultiplier = 0;
      riskPerTradeMultiplier = 0;
      maxDailyLossMultiplier = 0;
    } else if (drawdownRatio >= 0.8) {
      // Critical - minimal risk only
      positionSizeMultiplier = 0.1;
      riskPerTradeMultiplier = 0.2;
      maxDailyLossMultiplier = 0.3;
    } else if (drawdownRatio >= 0.6) {
      // High risk reduction
      positionSizeMultiplier = 0.3;
      riskPerTradeMultiplier = 0.4;
      maxDailyLossMultiplier = 0.5;
    } else if (drawdownRatio >= 0.4) {
      // Moderate risk reduction
      positionSizeMultiplier = 0.6;
      riskPerTradeMultiplier = 0.7;
      maxDailyLossMultiplier = 0.7;
    } else if (drawdownRatio >= 0.2) {
      // Slight risk reduction
      positionSizeMultiplier = 0.8;
      riskPerTradeMultiplier = 0.9;
      maxDailyLossMultiplier = 0.9;
    }

    return {
      maxPositionSize: this.riskParameters.maxPositionSizeUSD * positionSizeMultiplier,
      riskPerTrade: this.riskParameters.riskPerTradePercentage * riskPerTradeMultiplier,
      maxDailyLoss: this.riskParameters.maxDailyLossPercentage * maxDailyLossMultiplier
    };
  }

  /**
   * Check recovery mode and gradual risk restoration
   */
  async checkRecoveryMode(
    portfolioValue: number,
    historicalValues: number[],
    lastProtectionTrigger: Date | null
  ): Promise<{
    inRecoveryMode: boolean;
    canRestoreRisk: boolean;
    restorationLevel: number; // 0-100%
    recommendations: string[];
  }> {
    const currentDrawdown = this.calculateCurrentDrawdown(portfolioValue, historicalValues);
    const maxDrawdown = this.riskParameters.maxDrawdownThreshold;

    // Check if we're in recovery mode (drawdown is improving from peak)
    const isDrawdownImproving = this.isDrawdownImproving(historicalValues);
    const daysSinceProtection = lastProtectionTrigger ?
      Math.floor((Date.now() - lastProtectionTrigger.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    const inRecoveryMode = currentDrawdown < maxDrawdown * 0.8 && isDrawdownImproving;

    // Calculate restoration level based on drawdown improvement and time
    let restorationLevel = 0;
    let canRestoreRisk = false;

    if (inRecoveryMode && daysSinceProtection >= 7) { // At least 7 days since protection
      const drawdownImprovement = Math.max(0, (maxDrawdown * 0.8 - currentDrawdown) / (maxDrawdown * 0.8));
      const timeFactor = Math.min(1, daysSinceProtection / 30); // Full restoration after 30 days
      restorationLevel = Math.min(100, (drawdownImprovement * 0.7 + timeFactor * 0.3) * 100);

      canRestoreRisk = restorationLevel >= 50; // Can restore gradually when 50% recovered
    }

    const recommendations: string[] = [];

    if (inRecoveryMode) {
      if (canRestoreRisk) {
        recommendations.push(`Recovery progressing - can restore ${restorationLevel.toFixed(0)}% of normal risk levels`);
        recommendations.push('Gradually increase position sizes as performance improves');
      } else {
        recommendations.push('In recovery mode - maintain reduced risk parameters');
        recommendations.push(`Wait for more improvement before restoring risk (currently ${restorationLevel.toFixed(0)}% recovered)`);
      }
    } else if (currentDrawdown > maxDrawdown * 0.6) {
      recommendations.push('Continue monitoring drawdown - recovery mode not yet activated');
    }

    return {
      inRecoveryMode,
      canRestoreRisk,
      restorationLevel,
      recommendations
    };
  }

  /**
   * Check if drawdown is improving
   */
  private isDrawdownImproving(historicalValues: number[]): boolean {
    if (historicalValues.length < 10) return false; // Need enough data

    const recentValues = historicalValues.slice(-10);
    const olderValues = historicalValues.slice(-20, -10);

    if (olderValues.length === 0) return false;

    const recentAvg = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const olderAvg = olderValues.reduce((sum, val) => sum + val, 0) / olderValues.length;

    return recentAvg > olderAvg;
  }

  /**
   * Implement dynamic position sizing with drawdown protection
   */
  async calculatePositionSizeWithDrawdownProtection(
    basePositionSize: number,
    portfolioValue: number,
    historicalValues: number[],
    marketVolatility: number
  ): Promise<{
    adjustedPositionSize: number;
    drawdownProtection: {
      enabled: boolean;
      reductionFactor: number;
      reason: string;
    };
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }> {
    // Get drawdown protection status
    const drawdownCheck = await this.checkDrawdownProtection(portfolioValue, historicalValues);

    let adjustedPositionSize = basePositionSize;
    let reductionReason = 'No reduction needed';
    let reductionFactor = 1;

    // Apply drawdown-based reductions
    if (drawdownCheck.actionRequired === 'EMERGENCY_EXIT') {
      adjustedPositionSize = 0;
      reductionFactor = 0;
      reductionReason = 'Emergency exit - all positions closed';
    } else if (drawdownCheck.actionRequired === 'STOP_TRADING') {
      adjustedPositionSize = 0;
      reductionFactor = 0;
      reductionReason = 'Trading suspended due to excessive drawdown';
    } else if (drawdownCheck.actionRequired === 'REDUCE_POSITIONS') {
      adjustedPositionSize = basePositionSize * 0.3;
      reductionFactor = 0.3;
      reductionReason = 'Position sizes reduced due to drawdown warnings';
    } else if (drawdownCheck.currentDrawdown > this.riskParameters.maxDrawdownThreshold * 0.4) {
      adjustedPositionSize = basePositionSize * 0.6;
      reductionFactor = 0.6;
      reductionReason = 'Moderate reduction due to elevated drawdown';
    }

    // Apply additional volatility-based adjustments
    if (marketVolatility > 0.5) {
      adjustedPositionSize *= 0.8;
      reductionFactor *= 0.8;
      reductionReason += ' + High market volatility adjustment';
    }

    // Ensure minimum position size
    const minPositionSize = this.riskMetrics.minPositionSize || 100;
    adjustedPositionSize = Math.max(minPositionSize, adjustedPositionSize);

    // Determine risk level
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
    if (drawdownCheck.actionRequired === 'EMERGENCY_EXIT' || drawdownCheck.currentDrawdown > 0.4) {
      riskLevel = 'CRITICAL';
    } else if (drawdownCheck.actionRequired === 'STOP_TRADING' || drawdownCheck.currentDrawdown > 0.25) {
      riskLevel = 'HIGH';
    } else if (drawdownCheck.currentDrawdown > 0.15 || reductionFactor < 0.8) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'LOW';
    }

    return {
      adjustedPositionSize,
      drawdownProtection: {
        enabled: reductionFactor < 1,
        reductionFactor,
        reason: reductionReason
      },
      riskLevel
    };
  }

  /**
   * Check correlation-based position limits
   */
  checkCorrelationLimits(
    newSymbol: string,
    newSize: number,
    currentPositions: Position[]
  ): {
    allowed: boolean;
    maxAllowedSize: number;
    correlatedPositions: Array<{
      symbol: string;
      correlation: number;
      impact: string;
    }>;
    warnings: string[];
  } {
    const correlatedPositions: Array<{
      symbol: string;
      correlation: number;
      impact: string;
    }> = [];
    const warnings: string[] = [];

    // Calculate correlations with existing positions
    for (const position of currentPositions) {
      const correlation = this.calculateCorrelation(newSymbol, position.symbol);

      if (Math.abs(correlation) > this.riskParameters.correlationThreshold) {
        correlatedPositions.push({
          symbol: position.symbol,
          correlation,
          impact: `High correlation (${correlation.toFixed(2)}) with existing position`,
        });

        if (correlation > 0.8) {
          warnings.push(`Very high positive correlation (${correlation.toFixed(2)}) with ${position.symbol}`);
        } else if (correlation < -0.8) {
          warnings.push(`Very high negative correlation (${correlation.toFixed(2)}) with ${position.symbol}`);
        }
      }
    }

    // Calculate maximum allowed size considering correlations
    let maxAllowedSize = newSize;

    for (const correlated of correlatedPositions) {
      const correlationImpact = Math.abs(correlated.correlation);
      const reduction = 1 - (correlationImpact * 0.5); // Reduce by up to 50% for perfect correlation
      maxAllowedSize *= reduction;
    }

    const allowed = maxAllowedSize > newSize * 0.1; // Allow if at least 10% of requested size

    return {
      allowed,
      maxAllowedSize,
      correlatedPositions,
      warnings,
    };
  }

  /**
   * Perform stress testing with historical market scenarios
   */
  async performStressTest(
    portfolio: Position[],
    scenario: Partial<StressTestScenario>
  ): Promise<StressTestScenario> {
    const stressTest: StressTestScenario = {
      id: this.generateTestId(),
      name: scenario.name || 'Custom Stress Test',
      description: scenario.description || 'Custom stress test scenario',
      type: scenario.type || 'MONTE_CARLO',
      marketDrop: scenario.marketDrop || 0.2,
      volatilitySpike: scenario.volatilitySpike || 2.0,
      correlationBreakdown: scenario.correlationBreakdown || false,
      liquidityCrisis: scenario.liquidityCrisis || false,
      portfolioImpact: 0,
      maxLoss: 0,
      recoveryTime: 0,
      survivingPositions: [],
      failedPositions: [],
      varAtRisk: 0,
      expectedShortfall: 0,
      probabilityOfDefault: 0,
    };

    try {
      // Simulate market scenario
      const simulatedResults = await this.simulateMarketScenario(portfolio, stressTest);

      // Calculate results
      stressTest.portfolioImpact = simulatedResults.totalImpact;
      stressTest.maxLoss = simulatedResults.maxLoss;
      stressTest.recoveryTime = simulatedResults.recoveryTime;
      stressTest.survivingPositions = simulatedResults.survivingPositions;
      stressTest.failedPositions = simulatedResults.failedPositions;

      // Calculate risk metrics
      stressTest.varAtRisk = this.calculateVAR(simulatedResults.portfolioValues, 0.05);
      stressTest.expectedShortfall = this.calculateExpectedShortfall(simulatedResults.portfolioValues, 0.05);
      stressTest.probabilityOfDefault = Math.max(0, simulatedResults.failedPositions.length / portfolio.length);

      tradingLogger.info('Stress test completed', {
        testId: stressTest.id,
        scenario: stressTest.name,
        portfolioImpact: stressTest.portfolioImpact,
        maxLoss: stressTest.maxLoss,
      });

    } catch (error) {
      tradingLogger.error('Stress test failed', {
        testId: stressTest.id,
        error: error instanceof Error ? error.message : error,
      });
    }

    this.stressTestResults.push(stressTest);
    return stressTest;
  }

  /**
   * Calculate maximum drawdown protection with dynamic limits
   */
  calculateDrawdownProtection(
    portfolioValue: number,
    historicalValues: number[],
    currentDrawdown: number
  ): {
    protectionActive: boolean;
    dynamicLimit: number;
    recommendedAction: 'NONE' | 'REDUCE_POSITIONS' | 'STOP_TRADING' | 'EMERGENCY_EXIT';
    riskLevel: string;
    timeToRecovery?: number;
  } {
    let protectionActive = false;
    let recommendedAction: 'NONE' | 'REDUCE_POSITIONS' | 'STOP_TRADING' | 'EMERGENCY_EXIT' = 'NONE';
    let riskLevel = 'LOW';
    let dynamicLimit = this.riskParameters.maxDrawdownThreshold;

    // Adjust limit based on volatility and correlation
    const currentVolatility = this.getCurrentVolatility();
    if (currentVolatility.regime === 'HIGH' || currentVolatility.regime === 'EXTREME') {
      dynamicLimit *= 0.8; // Reduce limit by 20% in high volatility
    }

    // Check if protection should be active
    if (currentDrawdown >= dynamicLimit * 0.8) {
      protectionActive = true;

      if (currentDrawdown >= dynamicLimit * 0.95) {
        recommendedAction = 'EMERGENCY_EXIT';
        riskLevel = 'EXTREME';
      } else if (currentDrawdown >= dynamicLimit * 0.9) {
        recommendedAction = 'STOP_TRADING';
        riskLevel = 'HIGH';
      } else {
        recommendedAction = 'REDUCE_POSITIONS';
        riskLevel = 'MEDIUM';
      }
    }

    // Estimate time to recovery
    let timeToRecovery: number | undefined;
    if (currentDrawdown > 0.01) {
      // Simple estimation based on historical recovery patterns
      const recentRecoveries = this.calculateRecentRecoveries(historicalValues);
      const avgRecoveryTime = recentRecoveries.length > 0 ?
        recentRecoveries.reduce((sum, time) => sum + time, 0) / recentRecoveries.length : 0;

      timeToRecovery = avgRecoveryTime * (currentDrawdown / 0.1); // Scale by drawdown percentage
    }

    return {
      protectionActive,
      dynamicLimit,
      recommendedAction,
      riskLevel,
      timeToRecovery,
    };
  }

  /**
   * Calculate multi-timeframe risk assessment
   */
  calculateMultiTimeframeRisk(
    intradayData: Position[],
    dailyData: Position[],
    weeklyData: Position[]
  ): {
    intraday: RiskMetrics;
    daily: RiskMetrics;
    weekly: RiskMetrics;
    overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    recommendations: string[];
  } {
    const intradayRisk = this.calculateRiskMetrics(intradayData, 'INTRADAY');
    const dailyRisk = this.calculateRiskMetrics(dailyData, 'DAILY');
    const weeklyRisk = this.calculateRiskMetrics(weeklyData, 'WEEKLY');

    // Determine overall risk level
    const riskScores = [
      { score: intradayRisk.maxDrawdown, timeframe: 'INTRADAY' },
      { score: dailyRisk.maxDrawdown, timeframe: 'DAILY' },
      { score: weeklyRisk.maxDrawdown, timeframe: 'WEEKLY' },
    ];

    const maxRisk = Math.max(...riskScores.map(r => r.score));

    let overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    if (maxRisk > 0.15) {
      overallRisk = 'EXTREME';
    } else if (maxRisk > 0.10) {
      overallRisk = 'HIGH';
    } else if (maxRisk > 0.05) {
      overallRisk = 'MEDIUM';
    } else {
      overallRisk = 'LOW';
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (intradayRisk.maxDrawdown > 0.05) {
      recommendations.push('High intraday risk detected - consider shorter holding periods');
    }

    if (dailyRisk.maxDrawdown > 0.10) {
      recommendations.push('Daily drawdown exceeding limits - review position sizing');
    }

    if (weeklyRisk.currentVolatility > 0.3) {
      recommendations.push('High weekly volatility - consider reducing exposure');
    }

    return {
      intraday: intradayRisk,
      daily: dailyRisk,
      weekly: weeklyRisk,
      overallRisk,
      recommendations,
    };
  }

  /**
   * Get current risk metrics
   */
  getCurrentRiskMetrics(): RiskMetrics {
    const currentVolatility = this.getCurrentVolatility();

    return {
      currentVolatility: currentVolatility.current,
      averageTrueRange: this.calculateATR(),
      beta: this.calculateBeta(),
      sharpeRatio: this.calculateSharpeRatio(),
      sortinoRatio: this.calculateSortinoRatio(),
      maxDrawdown: this.calculateCurrentDrawdown(),
      calmarRatio: this.calculateCalmarRatio(),

      var_1day: this.calculateVAR(this.portfolioHistory.map(h => h.value), 0.05),
      var_5day: this.calculateVAR(this.portfolioHistory.map(h => h.value), 0.01),
      var_30day: this.calculateVAR(this.portfolioHistory.map(h => h.value), 0.003),
      cvar_95: 0, // Would calculate from actual data
      cvar_99: 0,

      totalExposure: this.positions.reduce((sum, p) => sum + Math.abs(p.quantity * p.currentPrice), 0),
      netExposure: this.positions.reduce((sum, p) => sum + (p.quantity * p.currentPrice), 0),
      leverage: this.calculateLeverage(),
      concentration: this.calculateConcentration(),

      intradayRisk: this.calculateIntradayRisk(),
      dailyRisk: this.calculateDailyRisk(),
      weeklyRisk: this.calculateWeeklyRisk(),
    };
  }

  // Private helper methods
  private calculateCorrelation(symbol1: string, symbol2: string): number {
    const correlationData = this.correlationData.get(symbol1);
    if (!correlationData) return 0;

    return correlationData.get(symbol2) || 0;
  }

  private async simulateMarketScenario(
    portfolio: Position[],
    scenario: StressTestScenario
  ): Promise<{
    totalImpact: number;
    maxLoss: number;
    recoveryTime: number;
    survivingPositions: string[];
    failedPositions: string[];
    portfolioValues: number[];
  }> {
    // Simplified Monte Carlo simulation
    const numSimulations = 1000;
    const portfolioValues: number[] = [];
    const maxLosses: number[] = [];

    const currentPortfolioValue = portfolio.reduce((sum, p) => sum + (p.quantity * p.currentPrice), 0);

    for (let i = 0; i < numSimulations; i++) {
      let simulatedValue = currentPortfolioValue;
      let maxLoss = 0;

      // Apply market drop
      simulatedValue *= (1 - scenario.marketDrop);

      // Apply volatility spike
      const volatilityMultiplier = scenario.volatilitySpike;
      for (const position of portfolio) {
        const priceChange = this.generateRandomPriceChange(volatilityMultiplier);
        simulatedValue += (position.quantity * position.currentPrice * priceChange);
        maxLoss = Math.max(maxLoss, -priceChange);
      }

      portfolioValues.push(simulatedValue);
      maxLosses.push(maxLoss);
    }

    const totalImpact = portfolioValues.reduce((sum, val, index) =>
      sum + Math.abs(val - currentPortfolioValue), 0) / numSimulations;

    const maxLoss = Math.max(...maxLosses);

    // Estimate recovery time (simplified)
    const recoveryTime = this.estimateRecoveryTime(portfolioValues, currentPortfolioValue);

    // Determine surviving positions (simplified)
    const survivingPositions = portfolio
      .filter(p => Math.random() > 0.1) // 90% survival rate
      .map(p => p.symbol);

    const failedPositions = portfolio
      .filter(p => !survivingPositions.includes(p.symbol))
      .map(p => p.symbol);

    return {
      totalImpact,
      maxLoss,
      recoveryTime,
      survivingPositions,
      failedPositions,
      portfolioValues,
    };
  }

  private generateRandomPriceChange(volatilityMultiplier: number): number {
    // Generate random price change based on volatility
    const mean = 0;
    const stdDev = 0.02 * volatilityMultiplier; // 2% base volatility adjusted by multiplier

    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

    return z0 * stdDev + mean;
  }

  private estimateRecoveryTime(portfolioValues: number[], initialValue: number): number {
    let timeToRecovery = 0;
    let minPortfolioValue = Math.min(...portfolioValues);

    // Find the point where portfolio recovers to 95% of initial value
    const recoveryTarget = initialValue * 0.95;

    for (let i = 0; i < portfolioValues.length; i++) {
      if (portfolioValues[i] >= recoveryTarget) {
        timeToRecovery = i;
        break;
      }
    }

    return timeToRecovery;
  }

  private calculateVAR(values: number[], confidence: number): number {
    if (values.length === 0) return 0;

    values.sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * values.length);
    return Math.abs(values[index]);
  }

  private calculateExpectedShortfall(values: number[], confidence: number): number {
    if (values.length === 0) return 0;

    values.sort((a, b) => a - b);
    const varIndex = Math.floor((1 - confidence) * values.length);
    const tailLosses = values.slice(0, varIndex);

    return tailLosses.length > 0 ?
      tailLosses.reduce((sum, loss) => sum + Math.abs(loss), 0) / tailLosses.length : 0;
  }

  private calculateRiskMetrics(positions: Position[], timeframe: string): RiskMetrics {
    const portfolioValues = positions.map(p => p.quantity * p.currentPrice);
    const returns = this.calculateReturns(portfolioValues);

    return {
      currentVolatility: this.calculateVolatility(returns),
      averageTrueRange: this.calculateATR(),
      beta: 1.0, // Would calculate relative to market
      sharpeRatio: this.calculateSharpeRatioFromReturns(returns),
      sortinoRatio: this.calculateSortinoRatioFromReturns(returns),
      maxDrawdown: this.calculateMaxDrawdown(portfolioValues),
      calmarRatio: this.calculateCalmarRatioFromReturns(portfolioValues, returns),
      var_1day: 0,
      var_5day: 0,
      var_30day: 0,
      cvar_95: 0,
      cvar_99: 0,
      totalExposure: positions.reduce((sum, p) => sum + Math.abs(p.quantity * p.currentPrice), 0),
      netExposure: positions.reduce((sum, p) => sum + (p.quantity * p.currentPrice), 0),
      leverage: this.calculateLeverage(),
      concentration: this.calculateConcentration(),
      intradayRisk: timeframe === 'INTRADAY' ? this.calculateIntradayRisk() : 0,
      dailyRisk: timeframe === 'DAILY' ? this.calculateDailyRisk() : 0,
      weeklyRisk: timeframe === 'WEEKLY' ? this.calculateWeeklyRisk() : 0,
    };
  }

  private calculateReturns(values: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < values.length; i++) {
      returns.push((values[i] - values[i - 1]) / values[i - 1]);
    }
    return returns;
  }

  private calculateVolatility(returns: number[]): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }

  private calculateSharpeRatio(): number {
    // Simplified calculation
    return 1.5; // Would calculate from actual returns
  }

  private calculateSharpeRatioFromReturns(returns: number[]): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = this.calculateVolatility(returns);

    return stdDev > 0 ? mean / stdDev : 0;
  }

  private calculateSortinoRatio(): number {
    // Simplified calculation
    return 2.0; // Would calculate from actual downside deviation
  }

  private calculateSortinoRatioFromReturns(returns: number[]): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const downsideReturns = returns.filter(r => r < 0);

    if (downsideReturns.length === 0) return mean * 2; // If no downside returns, double the mean

    const downsideDeviation = Math.sqrt(
      downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
    );

    return downsideDeviation > 0 ? mean / downsideDeviation : 0;
  }

  private calculateCurrentDrawdown(): number {
    if (this.portfolioHistory.length < 2) return 0;

    let peak = this.portfolioHistory[0].value;
    let currentDrawdown = 0;

    for (const record of this.portfolioHistory) {
      if (record.value > peak) {
        peak = record.value;
      }
      const drawdown = (peak - record.value) / peak;
      currentDrawdown = Math.max(currentDrawdown, drawdown);
    }

    return currentDrawdown;
  }

  private calculateMaxDrawdown(values: number[]): number {
    if (values.length === 0) return 0;

    let peak = values[0];
    let maxDrawdown = 0;

    for (const value of values) {
      if (value > peak) {
        peak = value;
      }
      const drawdown = (peak - value) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  private calculateCalmarRatio(): number {
    // Simplified calculation
    return 1.2; // Would calculate from actual returns and drawdown
  }

  private calculateCalmarRatioFromReturns(values: number[], returns: number[]): number {
    if (values.length === 0 || returns.length === 0) return 0;

    const totalReturn = (values[values.length - 1] - values[0]) / values[0];
    const maxDrawdown = this.calculateMaxDrawdown(values);

    return maxDrawdown > 0 ? Math.abs(totalReturn) / maxDrawdown : totalReturn * 2;
  }

  private calculateATR(): number {
    // Simplified ATR calculation
    return 0.02; // Would calculate from actual price data
  }

  private calculateBeta(): number {
    // Simplified beta calculation
    return 1.0; // Would calculate relative to market index
  }

  private calculateLeverage(): number {
    const totalExposure = this.positions.reduce((sum, p) => sum + Math.abs(p.quantity * p.currentPrice), 0);
    const portfolioValue = this.positions.reduce((sum, p) => sum + (p.quantity * p.currentPrice), 0);

    return portfolioValue > 0 ? totalExposure / portfolioValue : 1;
  }

  private calculateConcentration(): number {
    if (this.positions.length === 0) return 0;

    const exposures = this.positions.map(p => Math.abs(p.quantity * p.currentPrice));
    const totalExposure = exposures.reduce((sum, exp) => sum + exp, 0);

    // Calculate Herfindahl index
    const hhi = exposures.reduce((sum, exp) => sum + Math.pow(exp / totalExposure, 2), 0);

    return hhi;
  }

  private getCurrentVolatility(): MarketVolatility {
    // Simplified current volatility calculation
    return {
      current: 0.2,
      average: 0.18,
      percentile: 0.6,
      trend: 'STABLE',
      regime: 'NORMAL',
    };
  }

  private calculateIntradayRisk(): number {
    // Simplified intraday risk calculation
    return 0.03;
  }

  private calculateDailyRisk(): number {
    // Simplified daily risk calculation
    return 0.08;
  }

  private calculateWeeklyRisk(): number {
    // Simplified weekly risk calculation
    return 0.15;
  }

  private calculateRecentRecoveries(values: number[]): number[] {
    const recoveries: number[] = [];

    for (let i = 1; i < values.length; i++) {
      if (values[i] < values[i - 1]) { // Drawdown detected
        for (let j = i; j < values.length; j++) {
          if (values[j] >= values[i - 1]) { // Recovery detected
            recoveries.push(j - i + 1);
            break;
          }
        }
      }
    }

    return recoveries;
  }

  private generateTestId(): string {
    return `stress_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get risk analytics
   */
  getRiskAnalytics(): {
    totalPositions: number;
    totalExposure: number;
    currentDrawdown: number;
    protectionActive: boolean;
    stressTestsRun: number;
    correlationMatrixSize: number;
    riskUtilization: number;
  } {
    const currentMetrics = this.getCurrentRiskMetrics();
    const drawdownProtection = this.calculateDrawdownProtection(
      this.portfolioHistory[this.portfolioHistory.length - 1]?.value || 0,
      this.portfolioHistory.map(h => h.value),
      currentMetrics.maxDrawdown
    );

    return {
      totalPositions: this.positions.length,
      totalExposure: currentMetrics.totalExposure,
      currentDrawdown: currentMetrics.maxDrawdown,
      protectionActive: drawdownProtection.protectionActive,
      stressTestsRun: this.stressTestResults.length,
      correlationMatrixSize: Object.keys(this.correlationMatrix).length,
      riskUtilization: currentMetrics.totalExposure / (this.riskParameters.maxPortfolioRiskPercentage / 100 * 100000), // Assuming $100k portfolio
    };
  }

  /**
   * Update risk parameters
   */
  updateRiskParameters(updates: Partial<RiskParameters>): void {
    this.riskParameters = { ...this.riskParameters, ...updates };
    tradingLogger.info('Risk parameters updated', { updates });
  }

  /**
   * Get current risk parameters
   */
  getRiskParameters(): RiskParameters {
    return { ...this.riskParameters };
  }

  /**
   * Add position
   */
  addPosition(position: Omit<Position, 'unrealizedPnL' | 'realizedPnL'>): void {
    this.positions.push({
      ...position,
      unrealizedPnL: 0,
      realizedPnL: 0,
    });

    // Clean up old positions
    if (this.positions.length > 100) {
      this.positions = this.positions.slice(-50);
    }
  }

  /**
   * Update position
   */
  updatePosition(symbol: string, updates: Partial<Position>): void {
    const index = this.positions.findIndex(p => p.symbol === symbol);
    if (index !== -1) {
      this.positions[index] = { ...this.positions[index], ...updates };
    }
  }

  /**
   * Remove position
   */
  removePosition(symbol: string): void {
    this.positions = this.positions.filter(p => p.symbol !== symbol);
  }

  /**
   * Update portfolio history
   */
  updatePortfolioHistory(value: number, risk: number): void {
    this.portfolioHistory.push({
      timestamp: Date.now(),
      value,
      risk,
    });

    // Keep only recent history
    if (this.portfolioHistory.length > 1000) {
      this.portfolioHistory = this.portfolioHistory.slice(-500);
    }
  }

  /**
   * Clear all data (for testing)
   */
  clearAllData(): void {
    this.positions = [];
    this.portfolioHistory = [];
    this.volatilityHistory = [];
    this.correlationData.clear();
    this.stressTestResults = [];
    this.correlationMatrix = {};
    this.lastCorrelationUpdate = 0;
    this.varCache.clear();

    tradingLogger.info('Dynamic risk service data cleared');
  }
}

export default DynamicRiskService;