import { tradingConfig } from '@/config';
import { tradingLogger } from '@/utils/logger';
import { db } from '@/models/database';
import { RiskService } from './risk.service';

/**
 * Volatility-Adaptive Risk Management Service
 * Implements dynamic risk adjustments based on real-time market volatility
 */

export interface VolatilityMetrics {
  currentVolatility: number;
  averageVolatility: number;
  volatilityPercentile: number;
  volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  atr: number; // Average True Range
  atrPercentile: number;
  priceChange: number;
  volumeRatio: number;
}

export interface AdaptiveRiskParameters {
  riskPerTrade: number;
  maxDailyLoss: number;
  stopLossMultiplier: number;
  takeProfitMultiplier: number;
  maxConcurrentPositions: number;
  positionSizingMethod: 'fixed' | 'volatility' | 'kelly' | 'adaptive';
  volatilityAdjustment: number;
}

export interface MarketDataForVolatility {
  symbol: string;
  currentPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  avgVolume: number;
  priceChange24h: number;
  timestamp: number;
}

export class VolatilityAdaptiveRiskService {
  private riskService: RiskService;
  private volatilityHistory: Map<string, VolatilityMetrics[]> = new Map();
  private readonly MAX_HISTORY_LENGTH = 100;
  private readonly VOLATILITY_WINDOW = 20; // 20-period lookback

  constructor() {
    this.riskService = new RiskService();
  }

  /**
   * Calculate comprehensive volatility metrics for a symbol
   */
  async calculateVolatilityMetrics(symbol: string, marketData: MarketDataForVolatility): Promise<VolatilityMetrics> {
    try {
      // Get historical price data for volatility calculation
      const historicalData = await this.getHistoricalVolatilityData(symbol, 50);

      // Calculate current volatility
      const currentVolatility = this.calculateRealizedVolatility(historicalData);

      // Calculate Average True Range (ATR)
      const atr = await this.calculateATR(symbol, 14);

      // Get volatility history for percentile calculation
      const volatilityHistory = this.volatilityHistory.get(symbol) || [];
      const allVolatilities = [...volatilityHistory.map(v => v.currentVolatility), currentVolatility];

      // Calculate volatility percentiles
      const volatilityPercentile = this.calculatePercentile(currentVolatility, allVolatilities);
      const atrPercentile = this.calculatePercentile(atr, allVolatilities.map(v => v.atr || 0));

      // Determine volatility regime
      const volatilityRegime = this.determineVolatilityRegime(volatilityPercentile);

      // Calculate volume ratio
      const volumeRatio = marketData.avgVolume > 0 ? marketData.volume24h / marketData.avgVolume : 1;

      const metrics: VolatilityMetrics = {
        currentVolatility,
        averageVolatility: this.calculateAverage(volatilityHistory.map(v => v.currentVolatility)),
        volatilityPercentile,
        volatilityRegime,
        atr,
        atrPercentile,
        priceChange: marketData.priceChange24h,
        volumeRatio
      };

      // Store in history
      this.updateVolatilityHistory(symbol, metrics);

      tradingLogger.risk('VOLATILITY_METRICS_CALCULATED', {
        symbol,
        currentVolatility,
        volatilityRegime,
        atr,
        volumeRatio
      });

      return metrics;
    } catch (error) {
      tradingLogger.error('Failed to calculate volatility metrics', { symbol, error });
      throw error;
    }
  }

  /**
   * Get adaptive risk parameters based on current market conditions
   */
  async getAdaptiveRiskParameters(symbol: string, marketData: MarketDataForVolatility): Promise<AdaptiveRiskParameters> {
    try {
      const volatilityMetrics = await this.calculateVolatilityMetrics(symbol, marketData);
      const baseRisk = tradingConfig.riskPerTradePercentage;
      const baseDailyLoss = tradingConfig.maxDailyLossPercentage;

      // Calculate volatility adjustment factor
      const volatilityAdjustment = this.calculateVolatilityAdjustment(volatilityMetrics);

      // Adjust risk per trade based on volatility
      const adaptiveRiskPerTrade = baseRisk * volatilityAdjustment;

      // Adjust daily loss limit based on volatility
      const adaptiveMaxDailyLoss = baseDailyLoss * volatilityAdjustment;

      // Adjust stop loss and take profit multipliers
      const stopLossMultiplier = this.getAdaptiveStopLossMultiplier(volatilityMetrics);
      const takeProfitMultiplier = this.getAdaptiveTakeProfitMultiplier(volatilityMetrics);

      // Adjust position limits based on volatility
      const maxPositions = this.getAdaptiveMaxPositions(volatilityMetrics);

      // Determine position sizing method
      const positionSizingMethod = this.getOptimalPositionSizingMethod(volatilityMetrics);

      const parameters: AdaptiveRiskParameters = {
        riskPerTrade: Math.max(0.5, Math.min(adaptiveRiskPerTrade, 10)), // Clamp between 0.5% and 10%
        maxDailyLoss: Math.max(1, Math.min(adaptiveMaxDailyLoss, 20)), // Clamp between 1% and 20%
        stopLossMultiplier,
        takeProfitMultiplier,
        maxConcurrentPositions: maxPositions,
        positionSizingMethod,
        volatilityAdjustment
      };

      tradingLogger.risk('ADAPTIVE_RISK_PARAMETERS', {
        symbol,
        volatilityRegime: volatilityMetrics.volatilityRegime,
        riskPerTrade: parameters.riskPerTrade,
        maxDailyLoss: parameters.maxDailyLoss,
        volatilityAdjustment
      });

      return parameters;
    } catch (error) {
      tradingLogger.error('Failed to get adaptive risk parameters', { symbol, error });
      // Return conservative defaults on error
      return this.getConservativeDefaultParameters();
    }
  }

  /**
   * Calculate position size based on volatility and account balance
   */
  async calculateVolatilityBasedPositionSize(
    symbol: string,
    accountBalance: number,
    marketData: MarketDataForVolatility,
    riskParameters: AdaptiveRiskParameters
  ): Promise<number> {
    try {
      const volatilityMetrics = await this.calculateVolatilityMetrics(symbol, marketData);
      const riskAmount = accountBalance * (riskParameters.riskPerTrade / 100);

      if (riskParameters.positionSizingMethod === 'volatility') {
        // Use ATR-based position sizing
        const atr = volatilityMetrics.atr;
        const atrValue = marketData.currentPrice * (atr / 100);
        const positionSize = riskAmount / (atrValue * riskParameters.stopLossMultiplier);

        tradingLogger.risk('VOLATILITY_BASED_POSITION_SIZE', {
          symbol,
          method: 'ATR',
          riskAmount,
          atr,
          positionSize
        });

        return positionSize;
      } else if (riskParameters.positionSizingMethod === 'kelly') {
        // Kelly Criterion (simplified for crypto)
        const winRate = await this.getHistoricalWinRate(symbol);
        const avgWin = await this.getAverageWin(symbol);
        const avgLoss = Math.abs(await this.getAverageLoss(symbol));
        const kellyFraction = winRate - ((1 - winRate) * (avgLoss / avgWin));

        const kellyPosition = (accountBalance * Math.max(0, kellyFraction) * 0.5) / marketData.currentPrice; // Use 50% of Kelly

        tradingLogger.risk('KELLY_POSITION_SIZE', {
          symbol,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction,
          positionSize: kellyPosition
        });

        return kellyPosition;
      } else {
        // Fixed risk amount method
        const stopLossPercent = volatilityMetrics.atr * riskParameters.stopLossMultiplier;
        const positionSize = riskAmount / (marketData.currentPrice * (stopLossPercent / 100));

        return positionSize;
      }
    } catch (error) {
      tradingLogger.error('Failed to calculate position size', { symbol, error });
      // Return conservative position size
      return (accountBalance * 0.01) / marketData.currentPrice; // 1% of account
    }
  }

  /**
   * Check if current market conditions are suitable for trading
   */
  async assessMarketConditions(symbol: string, marketData: MarketDataForVolatility): Promise<{
    tradeable: boolean;
    reasons: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    recommendations: string[];
  }> {
    const volatilityMetrics = await this.calculateVolatilityMetrics(symbol, marketData);
    const reasons: string[] = [];
    const recommendations: string[] = [];
    let tradeable = true;
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' = 'MEDIUM';

    // Check volatility extremes
    if (volatilityMetrics.volatilityRegime === 'EXTREME') {
      reasons.push('Extreme volatility detected');
      recommendations.push('Consider reducing position sizes by 50%');
      riskLevel = 'EXTREME';
    } else if (volatilityMetrics.volatilityRegime === 'HIGH') {
      reasons.push('High volatility detected');
      recommendations.push('Use wider stop losses');
      riskLevel = 'HIGH';
    }

    // Check volume anomalies
    if (volatilityMetrics.volumeRatio < 0.5) {
      reasons.push('Low volume detected');
      recommendations.push('Be cautious of liquidity');
      tradeable = false;
    } else if (volatilityMetrics.volumeRatio > 3) {
      reasons.push('Unusually high volume');
      recommendations.push('Check for news events');
    }

    // Check price movements
    if (Math.abs(volatilityMetrics.priceChange) > 15) {
      reasons.push('Extreme price movement detected');
      recommendations.push('Wait for market stabilization');
      riskLevel = 'EXTREME';
    }

    // Determine overall risk level
    if (volatilityMetrics.volatilityRegime === 'LOW' && volatilityMetrics.volumeRatio > 0.8) {
      riskLevel = 'LOW';
      recommendations.push('Good conditions for trading');
    }

    tradingLogger.risk('MARKET_CONDITIONS_ASSESSED', {
      symbol,
      tradeable,
      riskLevel,
      reasons,
      recommendations
    });

    return {
      tradeable,
      reasons,
      riskLevel,
      recommendations
    };
  }

  /**
   * Calculate realized volatility from historical data
   */
  private calculateRealizedVolatility(historicalData: number[]): number {
    if (historicalData.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < historicalData.length; i++) {
      returns.push(Math.log(historicalData[i] / historicalData[i - 1]));
    }

    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);

    return Math.sqrt(variance * 365) * 100; // Annualized volatility percentage
  }

  /**
   * Calculate Average True Range (ATR)
   */
  private async calculateATR(symbol: string, period: number): Promise<number> {
    try {
      // Get recent OHLCV data for ATR calculation
      const sql = `
        SELECT high, low, close, timestamp
        FROM market_data
        WHERE symbol = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;

      const rows = db.prepare(sql).all(symbol, period + 1) as any[];

      if (rows.length < period) return 2; // Default 2% ATR

      const trueRanges: number[] = [];
      for (let i = 1; i < rows.length; i++) {
        const current = rows[i];
        const previous = rows[i - 1];

        const high = current.high;
        const low = current.low;
        const previousClose = previous.close;

        const tr = Math.max(
          high - low,
          Math.abs(high - previousClose),
          Math.abs(low - previousClose)
        );

        trueRanges.push((tr / previousClose) * 100); // Convert to percentage
      }

      const atr = trueRanges.reduce((sum, tr) => sum + tr, 0) / trueRanges.length;
      return atr;
    } catch (error) {
      tradingLogger.error('Failed to calculate ATR', { symbol, error });
      return 2; // Default 2% ATR
    }
  }

  /**
   * Calculate percentile of a value in an array
   */
  private calculatePercentile(value: number, array: number[]): number {
    if (array.length === 0) return 50;

    const sorted = [...array].sort((a, b) => a - b);
    const index = sorted.indexOf(value);
    return (index / (sorted.length - 1)) * 100;
  }

  /**
   * Determine volatility regime based on percentile
   */
  private determineVolatilityRegime(percentile: number): 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' {
    if (percentile < 20) return 'LOW';
    if (percentile < 40) return 'NORMAL';
    if (percentile < 80) return 'HIGH';
    return 'EXTREME';
  }

  /**
   * Calculate volatility adjustment factor
   */
  private calculateVolatilityAdjustment(metrics: VolatilityMetrics): number {
    switch (metrics.volatilityRegime) {
      case 'LOW':
        return 1.5; // Increase risk in low volatility
      case 'NORMAL':
        return 1.0; // Normal risk
      case 'HIGH':
        return 0.7; // Decrease risk in high volatility
      case 'EXTREME':
        return 0.4; // Significantly decrease risk in extreme volatility
      default:
        return 1.0;
    }
  }

  /**
   * Get adaptive stop loss multiplier based on volatility
   */
  private getAdaptiveStopLossMultiplier(metrics: VolatilityMetrics): number {
    const baseMultiplier = 2.0;
    const adjustment = metrics.atr / 2; // Use ATR as adjustment

    switch (metrics.volatilityRegime) {
      case 'LOW':
        return Math.max(1.5, baseMultiplier - adjustment);
      case 'NORMAL':
        return baseMultiplier;
      case 'HIGH':
        return baseMultiplier + adjustment;
      case 'EXTREME':
        return Math.min(4.0, baseMultiplier + (adjustment * 1.5));
      default:
        return baseMultiplier;
    }
  }

  /**
   * Get adaptive take profit multiplier based on volatility
   */
  private getAdaptiveTakeProfitMultiplier(metrics: VolatilityMetrics): number {
    const baseMultiplier = 3.0;

    switch (metrics.volatilityRegime) {
      case 'LOW':
        return baseMultiplier * 0.8; // Tighter targets in low volatility
      case 'NORMAL':
        return baseMultiplier;
      case 'HIGH':
        return baseMultiplier * 1.2; // Wider targets in high volatility
      case 'EXTREME':
        return baseMultiplier * 1.5; // Much wider targets in extreme volatility
      default:
        return baseMultiplier;
    }
  }

  /**
   * Get adaptive maximum positions based on volatility
   */
  private getAdaptiveMaxPositions(metrics: VolatilityMetrics): number {
    const baseMax = tradingConfig.maxConcurrentPositions;

    switch (metrics.volatilityRegime) {
      case 'LOW':
        return Math.min(baseMax + 2, 10);
      case 'NORMAL':
        return baseMax;
      case 'HIGH':
        return Math.max(baseMax - 1, 2);
      case 'EXTREME':
        return Math.max(baseMax - 2, 1);
      default:
        return baseMax;
    }
  }

  /**
   * Get optimal position sizing method based on market conditions
   */
  private getOptimalPositionSizingMethod(metrics: VolatilityMetrics): 'fixed' | 'volatility' | 'kelly' | 'adaptive' {
    if (metrics.volatilityRegime === 'EXTREME') {
      return 'fixed'; // Use fixed sizing in extreme conditions
    } else if (metrics.volatilityRegime === 'HIGH') {
      return 'volatility'; // Use volatility-based in high volatility
    } else if (metrics.volumeRatio > 1.5) {
      return 'kelly'; // Use Kelly in good liquidity conditions
    } else {
      return 'adaptive'; // Use adaptive method otherwise
    }
  }

  /**
   * Get historical volatility data for a symbol
   */
  private async getHistoricalVolatilityData(symbol: string, periods: number): Promise<number[]> {
    try {
      const sql = `
        SELECT close
        FROM market_data
        WHERE symbol = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `;

      const rows = db.prepare(sql).all(symbol, periods) as any[];
      return rows.map(row => row.close).reverse();
    } catch (error) {
      tradingLogger.error('Failed to get historical volatility data', { symbol, error });
      return [];
    }
  }

  /**
   * Update volatility history for a symbol
   */
  private updateVolatilityHistory(symbol: string, metrics: VolatilityMetrics): void {
    const history = this.volatilityHistory.get(symbol) || [];
    history.push(metrics);

    // Keep only recent history
    if (history.length > this.MAX_HISTORY_LENGTH) {
      history.splice(0, history.length - this.MAX_HISTORY_LENGTH);
    }

    this.volatilityHistory.set(symbol, history);
  }

  /**
   * Calculate average of an array
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Get historical win rate for a symbol
   */
  private async getHistoricalWinRate(symbol: string): Promise<number> {
    try {
      const sql = `
        SELECT COUNT(*) as total,
               SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins
        FROM trades
        WHERE symbol = ? AND status = 'CLOSED'
      `;

      const result = db.prepare(sql).get(symbol) as any;
      return result.total > 0 ? result.wins / result.total : 0.5;
    } catch (error) {
      return 0.5; // Default 50% win rate
    }
  }

  /**
   * Get average win amount for a symbol
   */
  private async getAverageWin(symbol: string): Promise<number> {
    try {
      const sql = `
        SELECT AVG(pnl) as avg_win
        FROM trades
        WHERE symbol = ? AND status = 'CLOSED' AND pnl > 0
      `;

      const result = db.prepare(sql).get(symbol) as any;
      return result.avg_win || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get average loss amount for a symbol
   */
  private async getAverageLoss(symbol: string): Promise<number> {
    try {
      const sql = `
        SELECT AVG(pnl) as avg_loss
        FROM trades
        WHERE symbol = ? AND status = 'CLOSED' AND pnl < 0
      `;

      const result = db.prepare(sql).get(symbol) as any;
      return result.avg_loss || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get conservative default parameters
   */
  private getConservativeDefaultParameters(): AdaptiveRiskParameters {
    return {
      riskPerTrade: 1,
      maxDailyLoss: 3,
      stopLossMultiplier: 2.5,
      takeProfitMultiplier: 4,
      maxConcurrentPositions: 2,
      positionSizingMethod: 'fixed',
      volatilityAdjustment: 0.5
    };
  }

  /**
   * Get current volatility metrics for a symbol
   */
  getCurrentVolatilityMetrics(symbol: string): VolatilityMetrics | null {
    const history = this.volatilityHistory.get(symbol);
    return history && history.length > 0 ? history[history.length - 1] : null;
  }

  /**
   * Get volatility trend for a symbol
   */
  getVolatilityTrend(symbol: string, periods: number = 10): 'RISING' | 'FALLING' | 'STABLE' {
    const history = this.volatilityHistory.get(symbol);
    if (!history || history.length < periods) return 'STABLE';

    const recent = history.slice(-periods);
    const first = recent[0].currentVolatility;
    const last = recent[recent.length - 1].currentVolatility;
    const change = (last - first) / first;

    if (change > 0.1) return 'RISING';
    if (change < -0.1) return 'FALLING';
    return 'STABLE';
  }
}