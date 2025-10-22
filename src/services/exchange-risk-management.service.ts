/**
 * Exchange-Specific Risk Management Service
 *
 * Manages risk parameters, limits, and monitoring specific to each exchange
 * (Binance and Bitkub) with different regulatory requirements and market characteristics.
 */

import { logger, tradingLogger } from '@/utils/logger';
import { OrderRequest, OrderResponse, Trade, Position } from '@/types';

export interface ExchangeRiskProfile {
  exchange: 'binance' | 'bitkub';
  tradingLimits: {
    maxPositionSize: number;
    maxDailyVolume: number;
    maxMonthlyVolume: number;
    maxLeverage: number;
    minOrderSize: number;
    maxOrderSize: number;
    maxOpenPositions: number;
  };
  riskParameters: {
    maxDrawdown: number;
    maxLossPerTrade: number;
    maxDailyLoss: number;
    volatilityThreshold: number;
    correlationLimit: number;
    concentrationLimit: number;
  };
  fees: {
    maker: number;
    taker: number;
    withdrawal: { [currency: string]: number };
    network: { [currency: string]: number };
  };
  regulatory: {
    kycRequired: boolean;
    verificationLevel: string;
    reportingRequirements: string[];
    restrictedCountries: string[];
    taxReporting: boolean;
  };
  market: {
    tradingHours: {
      open: string;
      close: string;
      timezone: string;
    };
    settlementTime: string;
    supportedSymbols: string[];
    marginTrading: boolean;
    futuresTrading: boolean;
  };
}

export interface ExchangeRiskMetrics {
  exchange: 'binance' | 'bitkub';
  timestamp: Date;
  positions: {
    count: number;
    totalValue: number;
    unrealizedPnL: number;
    realizedPnL: number;
    maxDrawdown: number;
  };
  trading: {
    dailyVolume: number;
    dailyTrades: number;
    dailyPnL: number;
    winRate: number;
    profitFactor: number;
  };
  exposure: {
    bySymbol: { [symbol: string]: number };
    byCurrency: { [currency: string]: number };
    concentration: number;
    leverage: number;
  };
  compliance: {
    violations: Array<{
      type: string;
      description: string;
      timestamp: Date;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    }>;
    warnings: Array<{
      type: string;
      description: string;
      timestamp: Date;
    }>;
  };
}

export interface RiskCheckResult {
  passed: boolean;
  exchange: 'binance' | 'bitkub';
  checks: Array<{
    name: string;
    passed: boolean;
    value: number;
    limit: number;
    message: string;
  }>;
  errors: string[];
  warnings: string[];
  recommendations: string[];
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface CrossExchangeRiskAssessment {
  timestamp: Date;
  totalPortfolioValue: number;
  totalExposure: number;
  totalLeverage: number;
  exchangeDistribution: {
    binance: { value: number; percentage: number };
    bitkub: { value: number; percentage: number };
  };
  concentrationRisks: Array<{
    type: 'EXCHANGE' | 'SYMBOL' | 'CURRENCY' | 'CORRELATION';
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    current: number;
    limit: number;
  }>;
  overallRiskScore: number;
  recommendations: string[];
}

export class ExchangeRiskManagementService {
  private riskProfiles: Map<string, ExchangeRiskProfile> = new Map();
  private currentMetrics: Map<string, ExchangeRiskMetrics> = new Map();
  private riskHistory: Map<string, ExchangeRiskMetrics[]> = new Map();
  private alertThresholds = {
    maxDrawdown: 0.15,
    dailyLoss: 0.05,
    concentration: 0.5,
    leverage: 3.0,
  };

  constructor() {
    this.initializeRiskProfiles();
  }

  /**
   * Check order against exchange-specific risk limits
   */
  async checkOrderRisk(
    order: OrderRequest,
    exchange: 'binance' | 'bitkub',
    currentPositions: Position[],
    dailyTrades: Trade[]
  ): Promise<RiskCheckResult> {
    const profile = this.getRiskProfile(exchange);
    const currentMetrics = this.getCurrentMetrics(exchange, currentPositions, dailyTrades);

    const checks = [];
    const errors = [];
    const warnings = [];
    const recommendations = [];

    // Check 1: Position size limit
    const orderValue = (order.quantity || 0) * (order.price || 0);
    const positionCheck = {
      name: 'Position Size',
      passed: orderValue <= profile.tradingLimits.maxOrderSize,
      value: orderValue,
      limit: profile.tradingLimits.maxOrderSize,
      message: orderValue <= profile.tradingLimits.maxOrderSize
        ? 'Position size within limits'
        : `Position size ${orderValue} exceeds maximum ${profile.tradingLimits.maxOrderSize}`,
    };
    checks.push(positionCheck);
    if (!positionCheck.passed) errors.push(positionCheck.message);

    // Check 2: Minimum order size
    const minSizeCheck = {
      name: 'Minimum Order Size',
      passed: orderValue >= profile.tradingLimits.minOrderSize,
      value: orderValue,
      limit: profile.tradingLimits.minOrderSize,
      message: orderValue >= profile.tradingLimits.minOrderSize
        ? 'Order size meets minimum requirement'
        : `Order size ${orderValue} below minimum ${profile.tradingLimits.minOrderSize}`,
    };
    checks.push(minSizeCheck);
    if (!minSizeCheck.passed) errors.push(minSizeCheck.message);

    // Check 3: Daily volume limit
    const currentDailyVolume = currentMetrics.trading.dailyVolume;
    const updatedDailyVolume = currentDailyVolume + orderValue;
    const dailyVolumeCheck = {
      name: 'Daily Volume',
      passed: updatedDailyVolume <= profile.tradingLimits.maxDailyVolume,
      value: updatedDailyVolume,
      limit: profile.tradingLimits.maxDailyVolume,
      message: updatedDailyVolume <= profile.tradingLimits.maxDailyVolume
        ? 'Daily volume within limits'
        : `Daily volume ${updatedDailyVolume} exceeds maximum ${profile.tradingLimits.maxDailyVolume}`,
    };
    checks.push(dailyVolumeCheck);
    if (!dailyVolumeCheck.passed) errors.push(dailyVolumeCheck.message);
    else if (updatedDailyVolume > profile.tradingLimits.maxDailyVolume * 0.8) {
      warnings.push(`Approaching daily volume limit: ${(updatedDailyVolume / profile.tradingLimits.maxDailyVolume * 100).toFixed(1)}%`);
    }

    // Check 4: Open positions limit
    const currentOpenPositions = currentMetrics.positions.count;
    const updatedOpenPositions = order.side === 'BUY' ? currentOpenPositions + 1 : currentOpenPositions;
    const positionsCheck = {
      name: 'Open Positions',
      passed: updatedOpenPositions <= profile.tradingLimits.maxOpenPositions,
      value: updatedOpenPositions,
      limit: profile.tradingLimits.maxOpenPositions,
      message: updatedOpenPositions <= profile.tradingLimits.maxOpenPositions
        ? 'Open positions within limits'
        : `Open positions ${updatedOpenPositions} exceeds maximum ${profile.tradingLimits.maxOpenPositions}`,
    };
    checks.push(positionsCheck);
    if (!positionsCheck.passed) errors.push(positionsCheck.message);

    // Check 5: Concentration limit
    const symbolExposure = currentMetrics.exposure.bySymbol[order.symbol] || 0;
    const updatedSymbolExposure = symbolExposure + (order.side === 'BUY' ? orderValue : -orderValue);
    const totalExposure = currentMetrics.positions.totalValue;
    const concentrationPercentage = totalExposure > 0 ? Math.abs(updatedSymbolExposure) / totalExposure : 0;
    const concentrationCheck = {
      name: 'Symbol Concentration',
      passed: concentrationPercentage <= profile.riskParameters.concentrationLimit,
      value: concentrationPercentage,
      limit: profile.riskParameters.concentrationLimit,
      message: concentrationPercentage <= profile.riskParameters.concentrationLimit
        ? 'Symbol concentration within limits'
        : `Symbol concentration ${(concentrationPercentage * 100).toFixed(1)}% exceeds maximum ${(profile.riskParameters.concentrationLimit * 100).toFixed(1)}%`,
    };
    checks.push(concentrationCheck);
    if (!concentrationCheck.passed) errors.push(concentrationCheck.message);
    else if (concentrationPercentage > profile.riskParameters.concentrationLimit * 0.8) {
      warnings.push(`High concentration in ${order.symbol}: ${(concentrationPercentage * 100).toFixed(1)}%`);
    }

    // Check 6: Exchange-specific checks
    if (exchange === 'bitkub') {
      // Thai market specific checks
      const thbBalance = currentMetrics.exposure.byCurrency['THB'] || 0;
      if (order.side === 'BUY' && thbBalance < orderValue) {
        errors.push(`Insufficient THB balance: needed ${orderValue}, available ${thbBalance}`);
      }

      // Check trading hours
      const currentHour = new Date().getHours();
      if (currentHour < 10 || currentHour > 22) {
        warnings.push('Order placed outside Thai market regular hours (10:00-22:00)');
      }
    }

    // Calculate overall risk score
    const riskScore = this.calculateRiskScore(checks, errors, warnings);
    const riskLevel = this.determineRiskLevel(riskScore);

    // Generate recommendations
    recommendations.push(...this.generateRiskRecommendations(checks, errors, warnings, exchange));

    return {
      passed: errors.length === 0,
      exchange,
      checks,
      errors,
      warnings,
      recommendations,
      riskScore,
      riskLevel,
    };
  }

  /**
   * Monitor real-time risk metrics for an exchange
   */
  async monitorExchangeRisk(
    exchange: 'binance' | 'bitkub',
    positions: Position[],
    trades: Trade[],
    marketData: { [symbol: string]: { price: number; volume: number; volatility: number } }
  ): Promise<ExchangeRiskMetrics> {
    const profile = this.getRiskProfile(exchange);
    const now = new Date();

    // Calculate position metrics
    const openPositions = positions.filter(p => p.status === 'OPEN');
    const totalValue = openPositions.reduce((sum, p) => sum + (p.quantity * p.currentPrice), 0);
    const unrealizedPnL = openPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const realizedPnL = trades.reduce((sum, t) => sum + (t.fees || 0), 0);

    // Calculate max drawdown
    const maxDrawdown = this.calculateMaxDrawdown(trades);

    // Calculate trading metrics
    const todayTrades = trades.filter(t => {
      const tradeDate = new Date(t.timestamp);
      const today = new Date();
      return tradeDate.toDateString() === today.toDateString();
    });

    const dailyVolume = todayTrades.reduce((sum, t) => {
      return sum + (t.quantity * t.price);
    }, 0);

    const dailyPnL = todayTrades.reduce((sum, t) => {
      const profitLoss = (t.side === 'SELL' ? t.price - t.quantity : 0); // Simplified
      return sum + profitLoss;
    }, 0);

    const winRate = todayTrades.length > 0
      ? todayTrades.filter(t => t.status === 'FILLED').length / todayTrades.length
      : 0;

    const profitFactor = this.calculateProfitFactor(todayTrades);

    // Calculate exposure by symbol and currency
    const exposureBySymbol: { [symbol: string]: number } = {};
    const exposureByCurrency: { [currency: string]: number } = {};

    openPositions.forEach(position => {
      const value = position.quantity * position.currentPrice;
      exposureBySymbol[position.symbol] = (exposureBySymbol[position.symbol] || 0) + value;

      // Extract currency from symbol (simplified)
      const currency = position.symbol.includes('THB') ? 'THB' : 'USDT';
      exposureByCurrency[currency] = (exposureByCurrency[currency] || 0) + value;
    });

    // Calculate concentration
    const concentration = this.calculateConcentration(exposureBySymbol, totalValue);

    // Calculate leverage (simplified)
    const leverage = totalValue > 0 ? totalValue / (totalValue - unrealizedPnL) : 1;

    // Check for violations
    const violations = [];
    const warningsList = [];

    if (Math.abs(maxDrawdown) > profile.riskParameters.maxDrawdown) {
      violations.push({
        type: 'MAX_DRAWDOWN_EXCEEDED',
        description: `Maximum drawdown ${Math.abs(maxDrawdown)} exceeds limit ${profile.riskParameters.maxDrawdown}`,
        timestamp: now,
        severity: 'HIGH' as const,
      });
    }

    if (Math.abs(dailyPnL) > profile.riskParameters.maxDailyLoss) {
      violations.push({
        type: 'DAILY_LOSS_EXCEEDED',
        description: `Daily loss ${Math.abs(dailyPnL)} exceeds limit ${profile.riskParameters.maxDailyLoss}`,
        timestamp: now,
        severity: 'CRITICAL' as const,
      });
    }

    if (concentration > profile.riskParameters.concentrationLimit) {
      violations.push({
        type: 'CONCENTRATION_LIMIT_EXCEEDED',
        description: `Concentration ${concentration} exceeds limit ${profile.riskParameters.concentrationLimit}`,
        timestamp: now,
        severity: 'MEDIUM' as const,
      });
    }

    if (leverage > profile.riskParameters.maxLeverage) {
      violations.push({
        type: 'LEVERAGE_EXCEEDED',
        description: `Leverage ${leverage} exceeds limit ${profile.riskParameters.maxLeverage}`,
        timestamp: now,
        severity: 'HIGH' as const,
      });
    }

    // Add warnings for approaching limits
    if (Math.abs(maxDrawdown) > profile.riskParameters.maxDrawdown * 0.8) {
      warningsList.push({
        type: 'APPROACHING_MAX_DRAWDOWN',
        description: `Approaching maximum drawdown limit: ${Math.abs(maxDrawdown)}/${profile.riskParameters.maxDrawdown}`,
        timestamp: now,
      });
    }

    const metrics: ExchangeRiskMetrics = {
      exchange,
      timestamp: now,
      positions: {
        count: openPositions.length,
        totalValue,
        unrealizedPnL,
        realizedPnL,
        maxDrawdown,
      },
      trading: {
        dailyVolume,
        dailyTrades: todayTrades.length,
        dailyPnL,
        winRate,
        profitFactor,
      },
      exposure: {
        bySymbol: exposureBySymbol,
        byCurrency: exposureByCurrency,
        concentration,
        leverage,
      },
      compliance: {
        violations,
        warnings: warningsList,
      },
    };

    // Update current metrics
    this.currentMetrics.set(exchange, metrics);

    // Update history
    if (!this.riskHistory.has(exchange)) {
      this.riskHistory.set(exchange, []);
    }
    const history = this.riskHistory.get(exchange)!;
    history.push(metrics);

    // Keep only last 1000 records
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    // Log critical issues
    violations.forEach(violation => {
      if (violation.severity === 'CRITICAL' || violation.severity === 'HIGH') {
        tradingLogger.risk('violation', {
          exchange,
          type: violation.type,
          description: violation.description,
          severity: violation.severity,
        });
      }
    });

    return metrics;
  }

  /**
   * Assess cross-exchange risk
   */
  async assessCrossExchangeRisk(
    binanceMetrics: ExchangeRiskMetrics,
    bitkubMetrics: ExchangeRiskMetrics
  ): Promise<CrossExchangeRiskAssessment> {
    const totalPortfolioValue = binanceMetrics.positions.totalValue + bitkubMetrics.positions.totalValue;
    const totalExposure = Math.abs(binanceMetrics.positions.unrealizedPnL) + Math.abs(bitkubMetrics.positions.unrealizedPnL);
    const totalLeverage = (binanceMetrics.exposure.leverage + bitkubMetrics.exposure.leverage) / 2;

    // Calculate exchange distribution
    const exchangeDistribution = {
      binance: {
        value: binanceMetrics.positions.totalValue,
        percentage: totalPortfolioValue > 0 ? binanceMetrics.positions.totalValue / totalPortfolioValue : 0,
      },
      bitkub: {
        value: bitkubMetrics.positions.totalValue,
        percentage: totalPortfolioValue > 0 ? bitkubMetrics.positions.totalValue / totalPortfolioValue : 0,
      },
    };

    // Identify concentration risks
    const concentrationRisks = [];

    // Exchange concentration risk
    const maxExchangePercentage = Math.max(exchangeDistribution.binance.percentage, exchangeDistribution.bitkub.percentage);
    if (maxExchangePercentage > 0.8) {
      concentrationRisks.push({
        type: 'EXCHANGE' as const,
        description: `High concentration in single exchange: ${(maxExchangePercentage * 100).toFixed(1)}%`,
        severity: maxExchangePercentage > 0.9 ? 'HIGH' as const : 'MEDIUM' as const,
        current: maxExchangePercentage,
        limit: 0.8,
      });
    }

    // Combined symbol concentration
    const allSymbols = new Set([
      ...Object.keys(binanceMetrics.exposure.bySymbol),
      ...Object.keys(bitkubMetrics.exposure.bySymbol),
    ]);

    allSymbols.forEach(symbol => {
      const binanceExposure = binanceMetrics.exposure.bySymbol[symbol] || 0;
      const bitkubExposure = bitkubMetrics.exposure.bySymbol[symbol] || 0;
      const totalSymbolExposure = binanceExposure + bitkubExposure;
      const symbolConcentration = totalPortfolioValue > 0 ? totalSymbolExposure / totalPortfolioValue : 0;

      if (symbolConcentration > 0.3) {
        concentrationRisks.push({
          type: 'SYMBOL' as const,
          description: `High concentration in ${symbol}: ${(symbolConcentration * 100).toFixed(1)}%`,
          severity: symbolConcentration > 0.5 ? 'HIGH' as const : 'MEDIUM' as const,
          current: symbolConcentration,
          limit: 0.3,
        });
      }
    });

    // Calculate overall risk score
    const overallRiskScore = this.calculateOverallRiskScore(
      binanceMetrics,
      bitkubMetrics,
      concentrationRisks
    );

    // Generate recommendations
    const recommendations = this.generateCrossExchangeRecommendations(
      exchangeDistribution,
      concentrationRisks,
      totalLeverage
    );

    return {
      timestamp: new Date(),
      totalPortfolioValue,
      totalExposure,
      totalLeverage,
      exchangeDistribution,
      concentrationRisks,
      overallRiskScore,
      recommendations,
    };
  }

  /**
   * Get risk profile for exchange
   */
  getRiskProfile(exchange: 'binance' | 'bitkub'): ExchangeRiskProfile {
    return this.riskProfiles.get(exchange) || this.getDefaultRiskProfile(exchange);
  }

  /**
   * Update risk profile for exchange
   */
  updateRiskProfile(exchange: 'binance' | 'bitkub', updates: Partial<ExchangeRiskProfile>): void {
    const currentProfile = this.getRiskProfile(exchange);
    const updatedProfile = { ...currentProfile, ...updates };
    this.riskProfiles.set(exchange, updatedProfile);

    logger.info(`Risk profile updated for ${exchange}`, { updates });
  }

  /**
   * Get current risk metrics
   */
  getCurrentMetrics(exchange: 'binance' | 'bitkub'): ExchangeRiskMetrics | null {
    return this.currentMetrics.get(exchange) || null;
  }

  /**
   * Get risk history
   */
  getRiskHistory(exchange: 'binance' | 'bitkub', limit?: number): ExchangeRiskMetrics[] {
    const history = this.riskHistory.get(exchange) || [];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Generate risk report
   */
  generateRiskReport(
    exchange: 'binance' | 'bitkub',
    period: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  ): {
    exchange: string;
    period: string;
    generated: Date;
    summary: {
      totalTrades: number;
      totalVolume: number;
      totalPnL: number;
      riskScore: number;
      violations: number;
    };
    details: {
      positions: any;
      trading: any;
      exposure: any;
      compliance: any;
    };
    recommendations: string[];
  } {
    const history = this.getRiskHistory(exchange);
    const currentMetrics = this.getCurrentMetrics(exchange);

    // Filter history by period
    const now = new Date();
    let filteredHistory = history;

    if (period === 'DAILY') {
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      filteredHistory = history.filter(m => m.timestamp >= dayAgo);
    } else if (period === 'WEEKLY') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filteredHistory = history.filter(m => m.timestamp >= weekAgo);
    } else if (period === 'MONTHLY') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filteredHistory = history.filter(m => m.timestamp >= monthAgo);
    }

    // Calculate summary
    const totalTrades = filteredHistory.reduce((sum, m) => sum + m.trading.dailyTrades, 0);
    const totalVolume = filteredHistory.reduce((sum, m) => sum + m.trading.dailyVolume, 0);
    const totalPnL = filteredHistory.reduce((sum, m) => sum + m.trading.dailyPnL, 0);
    const riskScore = currentMetrics ? this.calculateCurrentRiskScore(currentMetrics) : 0;
    const violations = currentMetrics ? currentMetrics.compliance.violations.length : 0;

    return {
      exchange,
      period,
      generated: now,
      summary: {
        totalTrades,
        totalVolume,
        totalPnL,
        riskScore,
        violations,
      },
      details: currentMetrics ? {
        positions: currentMetrics.positions,
        trading: currentMetrics.trading,
        exposure: currentMetrics.exposure,
        compliance: currentMetrics.compliance,
      } : {},
      recommendations: this.generateReportRecommendations(currentMetrics, riskScore),
    };
  }

  // Private helper methods

  /**
   * Initialize risk profiles
   */
  private initializeRiskProfiles(): void {
    this.riskProfiles.set('binance', this.getDefaultRiskProfile('binance'));
    this.riskProfiles.set('bitkub', this.getDefaultRiskProfile('bitkub'));
  }

  /**
   * Get default risk profile
   */
  private getDefaultRiskProfile(exchange: 'binance' | 'bitkub'): ExchangeRiskProfile {
    const baseProfile = {
      exchange,
      tradingLimits: {
        maxPositionSize: exchange === 'binance' ? 100000 : 50000, // USD
        maxDailyVolume: exchange === 'binance' ? 1000000 : 500000,
        maxMonthlyVolume: exchange === 'binance' ? 20000000 : 10000000,
        maxLeverage: exchange === 'binance' ? 5 : 2,
        minOrderSize: exchange === 'binance' ? 10 : 100,
        maxOrderSize: exchange === 'binance' ? 50000 : 10000,
        maxOpenPositions: exchange === 'binance' ? 20 : 10,
      },
      riskParameters: {
        maxDrawdown: 0.15,
        maxLossPerTrade: 0.02,
        maxDailyLoss: 0.05,
        volatilityThreshold: 0.05,
        correlationLimit: 0.8,
        concentrationLimit: 0.3,
      },
      fees: {
        maker: exchange === 'binance' ? 0.001 : 0.0025,
        taker: exchange === 'binance' ? 0.001 : 0.0025,
        withdrawal: exchange === 'binance' ? { BTC: 0.0005, ETH: 0.005 } : { BTC: 0.001, ETH: 0.01 },
        network: exchange === 'binance' ? { BTC: 0.0004, ETH: 0.003 } : { BTC: 0.0005, ETH: 0.004 },
      },
      regulatory: {
        kycRequired: true,
        verificationLevel: exchange === 'bitkub' ? 'ENHANCED' : 'BASIC',
        reportingRequirements: exchange === 'bitkub' ? ['TAX_REPORTING', 'AML_COMPLIANCE'] : [],
        restrictedCountries: [],
        taxReporting: exchange === 'bitkub',
      },
      market: {
        tradingHours: {
          open: exchange === 'binance' ? '00:00' : '10:00',
          close: exchange === 'binance' ? '23:59' : '22:00',
          timezone: exchange === 'binance' ? 'UTC' : 'Asia/Bangkok',
        },
        settlementTime: exchange === 'binance' ? 'T+0' : 'T+0',
        supportedSymbols: exchange === 'binance'
          ? ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT']
          : ['THB_BTC', 'THB_ETH'],
        marginTrading: exchange === 'binance',
        futuresTrading: exchange === 'binance',
      },
    };

    return baseProfile;
  }

  /**
   * Get current metrics
   */
  private getCurrentMetrics(
    exchange: 'binance' | 'bitkub',
    positions: Position[],
    dailyTrades: Trade[]
  ): ExchangeRiskMetrics {
    const existingMetrics = this.currentMetrics.get(exchange);
    if (existingMetrics) {
      return existingMetrics;
    }

    // Create basic metrics if none exist
    return {
      exchange,
      timestamp: new Date(),
      positions: {
        count: positions.filter(p => p.status === 'OPEN').length,
        totalValue: positions.reduce((sum, p) => sum + (p.quantity * p.currentPrice), 0),
        unrealizedPnL: positions.reduce((sum, p) => sum + p.unrealizedPnL, 0),
        realizedPnL: 0,
        maxDrawdown: 0,
      },
      trading: {
        dailyVolume: dailyTrades.reduce((sum, t) => sum + (t.quantity * t.price), 0),
        dailyTrades: dailyTrades.length,
        dailyPnL: 0,
        winRate: 0,
        profitFactor: 0,
      },
      exposure: {
        bySymbol: {},
        byCurrency: {},
        concentration: 0,
        leverage: 1,
      },
      compliance: {
        violations: [],
        warnings: [],
      },
    };
  }

  /**
   * Calculate max drawdown
   */
  private calculateMaxDrawdown(trades: Trade[]): number {
    if (trades.length === 0) return 0;

    let peak = 0;
    let maxDrawdown = 0;
    let runningPnL = 0;

    trades.forEach(trade => {
      // Simplified PnL calculation
      const tradePnL = trade.side === 'SELL' ? trade.price - trade.quantity : 0;
      runningPnL += tradePnL;

      if (runningPnL > peak) {
        peak = runningPnL;
      }

      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    return maxDrawdown;
  }

  /**
   * Calculate profit factor
   */
  private calculateProfitFactor(trades: Trade[]): number {
    if (trades.length === 0) return 0;

    let grossProfit = 0;
    let grossLoss = 0;

    trades.forEach(trade => {
      // Simplified profit/loss calculation
      const pnl = trade.side === 'SELL' ? trade.price - trade.quantity : 0;
      if (pnl > 0) {
        grossProfit += pnl;
      } else {
        grossLoss += Math.abs(pnl);
      }
    });

    return grossLoss > 0 ? grossProfit / grossLoss : 0;
  }

  /**
   * Calculate concentration
   */
  private calculateConcentration(exposureBySymbol: { [symbol: string]: number }, totalValue: number): number {
    if (totalValue === 0) return 0;

    const exposures = Object.values(exposureBySymbol);
    const maxExposure = Math.max(...exposures);

    return maxExposure / totalValue;
  }

  /**
   * Calculate risk score
   */
  private calculateRiskScore(
    checks: Array<{ passed: boolean; value: number; limit: number }>,
    errors: string[],
    warnings: string[]
  ): number {
    let score = 50; // Base score

    // Adjust based on check results
    checks.forEach(check => {
      if (!check.passed) {
        score -= 20;
      } else {
        const utilization = check.value / check.limit;
        if (utilization > 0.8) {
          score -= 5;
        } else if (utilization < 0.5) {
          score += 2;
        }
      }
    });

    // Adjust based on errors and warnings
    score -= errors.length * 15;
    score -= warnings.length * 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine risk level
   */
  private determineRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (score >= 80) return 'LOW';
    if (score >= 60) return 'MEDIUM';
    if (score >= 40) return 'HIGH';
    return 'CRITICAL';
  }

  /**
   * Generate risk recommendations
   */
  private generateRiskRecommendations(
    checks: Array<any>,
    errors: string[],
    warnings: string[],
    exchange: 'binance' | 'bitkub'
  ): string[] {
    const recommendations = [];

    if (errors.length > 0) {
      recommendations.push('Order rejected due to risk limit violations');
      recommendations.push('Review risk parameters and consider reducing order size');
    }

    if (warnings.length > 0) {
      recommendations.push('Monitor risk metrics closely');
      recommendations.push('Consider reducing exposure to approaching limits');
    }

    // Exchange-specific recommendations
    if (exchange === 'bitkub') {
      recommendations.push('Ensure compliance with Thai market regulations');
      recommendations.push('Monitor trading hours (10:00-22:00 ICT)');
    }

    return recommendations;
  }

  /**
   * Calculate overall risk score
   */
  private calculateOverallRiskScore(
    binanceMetrics: ExchangeRiskMetrics,
    bitkubMetrics: ExchangeRiskMetrics,
    concentrationRisks: Array<any>
  ): number {
    let score = 70; // Base score

    // Adjust based on individual exchange metrics
    const binanceScore = this.calculateCurrentRiskScore(binanceMetrics);
    const bitkubScore = this.calculateCurrentRiskScore(bitkubMetrics);
    const avgExchangeScore = (binanceScore + bitkubScore) / 2;

    score += (avgExchangeScore - 50) * 0.5;

    // Adjust based on concentration risks
    concentrationRisks.forEach(risk => {
      if (risk.severity === 'HIGH') {
        score -= 15;
      } else if (risk.severity === 'MEDIUM') {
        score -= 10;
      }
    });

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate current risk score
   */
  private calculateCurrentRiskScore(metrics: ExchangeRiskMetrics): number {
    let score = 70;

    // Adjust based on drawdown
    if (Math.abs(metrics.positions.maxDrawdown) > 0.1) {
      score -= 20;
    }

    // Adjust based on leverage
    if (metrics.exposure.leverage > 2) {
      score -= 15;
    }

    // Adjust based on concentration
    if (metrics.exposure.concentration > 0.5) {
      score -= 10;
    }

    // Adjust based on violations
    score -= metrics.compliance.violations.length * 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate cross-exchange recommendations
   */
  private generateCrossExchangeRecommendations(
    distribution: any,
    concentrationRisks: Array<any>,
    totalLeverage: number
  ): string[] {
    const recommendations = [];

    if (distribution.binance.percentage > 0.8 || distribution.bitkub.percentage > 0.8) {
      recommendations.push('Consider diversifying across exchanges to reduce concentration risk');
    }

    if (concentrationRisks.some(r => r.type === 'SYMBOL' && r.severity === 'HIGH')) {
      recommendations.push('High symbol concentration detected - consider rebalancing portfolio');
    }

    if (totalLeverage > 2.5) {
      recommendations.push('High leverage detected - consider reducing position sizes');
    }

    if (concentrationRisks.length === 0 && totalLeverage < 2) {
      recommendations.push('Risk distribution appears well-balanced across exchanges');
    }

    return recommendations;
  }

  /**
   * Generate report recommendations
   */
  private generateReportRecommendations(metrics: ExchangeRiskMetrics | null, riskScore: number): string[] {
    const recommendations = [];

    if (!metrics) {
      recommendations.push('No data available for analysis');
      return recommendations;
    }

    if (riskScore < 40) {
      recommendations.push('Critical: Review all risk parameters immediately');
    } else if (riskScore < 60) {
      recommendations.push('High risk: Consider reducing position sizes and leverage');
    }

    if (metrics.compliance.violations.length > 0) {
      recommendations.push('Address compliance violations to maintain good standing');
    }

    if (metrics.exposure.concentration > 0.3) {
      recommendations.push('Diversify portfolio to reduce concentration risk');
    }

    if (metrics.exposure.leverage > 2) {
      recommendations.push('Reduce leverage to maintain acceptable risk levels');
    }

    return recommendations;
  }
}

export default ExchangeRiskManagementService;