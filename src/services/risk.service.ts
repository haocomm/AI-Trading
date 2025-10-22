import { tradingConfig } from '@/config';
import { tradingLogger, logError } from '@/utils/logger';
import { RiskError, RiskMetrics, Trade } from '@/types';
import { db } from '@/models/database';

interface PositionSize {
  quantity: number;
  riskAmount: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}

interface DailyPnL {
  date: string;
  totalPnL: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
}

export class RiskService {
  private dailyPnL: DailyPnL | null = null;
  private emergencyStop = false;
  private lastResetTime = new Date().toISOString().split('T')[0];

  constructor() {
    this.loadDailyPnL();
    this.resetDailyCounters();
  }

  // Initialize or reset daily P&L tracking
  private resetDailyCounters(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastResetTime !== today) {
      this.dailyPnL = {
        date: today,
        totalPnL: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
      };
      this.lastResetTime = today;
      tradingLogger.risk('DAILY_RESET', { date: today });
    }
  }

  // Load daily P&L from database
  private loadDailyPnL(): void {
    try {
      const today = new Date().toISOString().split('T')[0];
      const startOfDay = new Date(today).getTime();
      const endOfDay = startOfDay + (24 * 60 * 60 * 1000) - 1;

      // Get completed trades for today
      const trades = db.getTrades(undefined, 1000);
      const todayTrades = trades.filter(trade => {
        const tradeTime = new Date(trade.timestamp).getTime();
        return tradeTime >= startOfDay && tradeTime <= endOfDay && trade.status === 'FILLED';
      });

      // Calculate daily P&L
      let totalPnL = 0;
      let totalTrades = 0;
      let winningTrades = 0;
      let losingTrades = 0;

      // Group trades by symbol and calculate P&L for each position
      const symbolTrades: { [symbol: string]: any[] } = {};
      todayTrades.forEach(trade => {
        if (!symbolTrades[trade.symbol]) {
          symbolTrades[trade.symbol] = [];
        }
        symbolTrades[trade.symbol].push(trade);
      });

      Object.entries(symbolTrades).forEach(([symbol, trades]) => {
        const positionPnL = this.calculatePositionPnL(trades);
        totalPnL += positionPnL;
        totalTrades += trades.length;

        if (positionPnL > 0) {
          winningTrades++;
        } else if (positionPnL < 0) {
          losingTrades++;
        }
      });

      this.dailyPnL = {
        date: today,
        totalPnL,
        totalTrades,
        winningTrades,
        losingTrades,
      };

      tradingLogger.risk('DAILY_PNL_LOADED', this.dailyPnL);
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Failed to load daily P&L'), { action: 'loadDailyPnL' });
    }
  }

  // Calculate P&L for a series of trades
  private calculatePositionPnL(trades: any[]): number {
    if (trades.length < 2) return 0;

    let totalPnL = 0;
    let runningQuantity = 0;
    let weightedCost = 0;

    trades.forEach(trade => {
      if (trade.side === 'BUY') {
        const newQuantity = runningQuantity + trade.quantity;
        weightedCost = ((weightedCost * runningQuantity) + (trade.price * trade.quantity)) / newQuantity;
        runningQuantity = newQuantity;
      } else if (trade.side === 'SELL') {
        if (runningQuantity > 0) {
          const soldQuantity = Math.min(trade.quantity, runningQuantity);
          totalPnL += (trade.price - weightedCost) * soldQuantity;
          runningQuantity -= soldQuantity;
        }
      }
    });

    return totalPnL;
  }

  // Core risk validation methods
  async validateTradeSize(
    symbol: string,
    side: 'BUY' | 'SELL',
    currentPrice: number,
    stopLossPrice?: number,
    portfolioValue?: number
  ): Promise<PositionSize> {
    try {
      // Get current portfolio value if not provided
      const currentPortfolioValue = portfolioValue || await this.getPortfolioValue();

      // Calculate risk amount (5% of portfolio value)
      const riskAmount = currentPortfolioValue * (tradingConfig.riskPerTradePercentage / 100);

      // Calculate stop loss distance
      let stopLossDistance: number;
      if (stopLossPrice) {
        stopLossDistance = Math.abs(currentPrice - stopLossPrice) / currentPrice;
      } else {
        // Default stop loss based on trading config
        stopLossDistance = tradingConfig.defaultStopLossPercentage / 100;
      }

      // Calculate position size based on risk
      const stopLossAmount = currentPrice * stopLossDistance;
      const quantity = riskAmount / stopLossDistance / currentPrice;

      // Calculate actual stop loss and take profit prices
      const calculatedStopLoss = side === 'BUY'
        ? currentPrice * (1 - stopLossDistance)
        : currentPrice * (1 + stopLossDistance);

      const takeProfitDistance = stopLossDistance * 2; // 2:1 risk/reward ratio
      const calculatedTakeProfit = side === 'BUY'
        ? currentPrice * (1 + takeProfitDistance)
        : currentPrice * (1 - takeProfitDistance);

      const positionSize: PositionSize = {
        quantity,
        riskAmount,
        stopLossPrice: calculatedStopLoss,
        takeProfitPrice: calculatedTakeProfit,
      };

      tradingLogger.risk('POSITION_SIZE_VALIDATED', {
        symbol,
        side,
        currentPrice,
        quantity,
        riskAmount,
        stopLossPrice: calculatedStopLoss,
        takeProfitPrice: calculatedTakeProfit,
        portfolioValue: currentPortfolioValue,
      });

      return positionSize;
    } catch (error) {
      throw new RiskError(
        `Failed to validate trade size: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'POSITION_SIZE',
        error
      );
    }
  }

  async validateDailyLossLimit(tradePnL?: number): Promise<boolean> {
    try {
      this.resetDailyCounters();

      if (!this.dailyPnL) {
        return true; // No tracking yet, allow trade
      }

      // Simulate the trade impact on daily P&L
      const simulatedDailyPnL = this.dailyPnL.totalPnL + (tradePnL || 0);

      // Get current portfolio value for percentage calculation
      const portfolioValue = await this.getPortfolioValue();
      const maxDailyLossAmount = portfolioValue * (tradingConfig.maxDailyLossPercentage / 100);

      const isWithinLimit = simulatedDailyPnL >= -maxDailyLossAmount;

      if (!isWithinLimit) {
        tradingLogger.risk('DAILY_LOSS_LIMIT_EXCEEDED', {
          currentDailyPnL: this.dailyPnL.totalPnL,
          simulatedPnL: simulatedDailyPnL,
          maxDailyLossAmount,
          portfolioValue,
          limitPercentage: tradingConfig.maxDailyLossPercentage,
        });

        // Enable emergency stop if we hit daily loss limit
        if (simulatedDailyPnL < -maxDailyLossAmount) {
          this.emergencyStop = true;
          tradingLogger.risk('EMERGENCY_STOP_ACTIVATED', {
            reason: 'Daily loss limit exceeded',
            dailyPnL: simulatedDailyPnL,
            limit: maxDailyLossAmount,
          });
        }
      }

      return isWithinLimit;
    } catch (error) {
      throw new RiskError(
        `Failed to validate daily loss limit: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DAILY_LOSS',
        error
      );
    }
  }

  async validateMaxPositions(): Promise<boolean> {
    try {
      const openPositions = db.getOpenPositions();
      const isWithinLimit = openPositions.length < tradingConfig.maxConcurrentPositions;

      if (!isWithinLimit) {
        tradingLogger.risk('MAX_POSITIONS_EXCEEDED', {
          currentPositions: openPositions.length,
          maxPositions: tradingConfig.maxConcurrentPositions,
          positions: openPositions.map(p => ({ symbol: p.symbol, quantity: p.quantity })),
        });
      }

      return isWithinLimit;
    } catch (error) {
      throw new RiskError(
        `Failed to validate max positions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'MAX_POSITIONS',
        error
      );
    }
  }

  async validateTradeExecution(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    currentPrice: number,
    stopLossPrice?: number
  ): Promise<boolean> {
    try {
      // Check all risk conditions
      const dailyLossValid = await this.validateDailyLossLimit();
      const maxPositionsValid = await this.validateMaxPositions();
      const emergencyStopClear = !this.emergencyStop;

      // Additional validations for specific trade
      const minTradeAmountValid = (quantity * currentPrice) >= tradingConfig.minTradeAmountUSD;

      // Check if we already have a position for this symbol (for simplicity, one position per symbol)
      const existingPosition = db.getPositionBySymbol(symbol);
      const existingPositionValid = !existingPosition || existingPosition.status === 'CLOSED';

      const allValid = dailyLossValid &&
                      maxPositionsValid &&
                      emergencyStopClear &&
                      minTradeAmountValid &&
                      existingPositionValid;

      if (!allValid) {
        tradingLogger.risk('TRADE_EXECUTION_BLOCKED', {
          symbol,
          side,
          quantity,
          currentPrice,
          stopLossPrice,
          dailyLossValid,
          maxPositionsValid,
          emergencyStopClear,
          minTradeAmountValid,
          existingPositionValid,
          estimatedTradeValue: quantity * currentPrice,
          minTradeRequired: tradingConfig.minTradeAmountUSD,
        });
      }

      return allValid;
    } catch (error) {
      throw new RiskError(
        `Failed to validate trade execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'VOLATILITY',
        error
      );
    }
  }

  // Portfolio and metrics
  async getPortfolioValue(): Promise<number> {
    try {
      // For now, return a default portfolio value
      // In a real implementation, this would query the exchange API for current balances
      return 1000; // Default for MVP
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Failed to get portfolio value'), { action: 'getPortfolioValue' });
      return 1000; // Fallback value
    }
  }

  async getRiskMetrics(): Promise<RiskMetrics> {
    try {
      const portfolioValue = await this.getPortfolioValue();
      const openPositions = db.getOpenPositions();
      const availableBalance = portfolioValue * 0.1; // Assume 10% available for new trades

      // Calculate total unrealized P&L
      const totalUnrealizedPnL = openPositions.reduce((total, position) => total + position.unrealized_pnl, 0);

      // Calculate daily P&L
      const dailyPnL = this.dailyPnL?.totalPnL || 0;

      return {
        portfolioValue,
        availableBalance,
        totalPnL: totalUnrealizedPnL,
        dailyPnL,
        openPositions: openPositions.length,
        riskPerTrade: portfolioValue * (tradingConfig.riskPerTradePercentage / 100),
        maxDailyLoss: portfolioValue * (tradingConfig.maxDailyLossPercentage / 100),
        currentDailyLoss: Math.max(0, -dailyPnL),
      };
    } catch (error) {
      throw new Error(`Failed to get risk metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Emergency controls
  enableEmergencyStop(reason: string): void {
    this.emergencyStop = true;
    tradingLogger.risk('EMERGENCY_STOP_MANUAL', { reason });
  }

  disableEmergencyStop(): void {
    this.emergencyStop = false;
    tradingLogger.risk('EMERGENCY_STOP_DISABLED', {});
  }

  isEmergencyStopActive(): boolean {
    return this.emergencyStop;
  }

  // Trade tracking and P&L updates
  updateDailyPnL(trade: Trade): void {
    this.resetDailyCounters();

    if (this.dailyPnL) {
      this.dailyPnL.totalTrades++;

      // This is simplified - in a real implementation, we'd need to track positions more carefully
      // For now, we'll update based on completed trades
      tradingLogger.risk('DAILY_PNL_UPDATED', {
        totalTrades: this.dailyPnL.totalTrades,
        totalPnL: this.dailyPnL.totalPnL,
      });
    }
  }

  // Volatility-based stop loss calculation
  calculateDynamicStopLoss(
    currentPrice: number,
    volatility: number,
    side: 'BUY' | 'SELL'
  ): number {
    try {
      // Base stop loss distance
      const baseStopDistance = tradingConfig.defaultStopLossPercentage / 100;

      // Adjust based on volatility (higher volatility = wider stops)
      const volatilityMultiplier = Math.max(1, volatility / 2);
      const adjustedStopDistance = baseStopDistance * volatilityMultiplier;

      // Calculate stop loss price
      const stopLossPrice = side === 'BUY'
        ? currentPrice * (1 - adjustedStopDistance)
        : currentPrice * (1 + adjustedStopDistance);

      tradingLogger.risk('DYNAMIC_STOP_LOSS', {
        currentPrice,
        volatility,
        side,
        baseStopDistance,
        volatilityMultiplier,
        adjustedStopDistance,
        stopLossPrice,
      });

      return stopLossPrice;
    } catch (error) {
      // Fallback to default stop loss
      const defaultStopPrice = side === 'BUY'
        ? currentPrice * (1 - tradingConfig.defaultStopLossPercentage / 100)
        : currentPrice * (1 + tradingConfig.defaultStopLossPercentage / 100);

      logError(error instanceof Error ? error : new Error('Failed to calculate dynamic stop loss'), {
        currentPrice,
        volatility,
        side,
        fallbackStopPrice: defaultStopPrice,
      });

      return defaultStopPrice;
    }
  }

  // Calculate volatility (simplified implementation)
  async calculateVolatility(symbol: string, periodMinutes: number = 60): Promise<number> {
    try {
      const endTime = Date.now();
      const startTime = endTime - (periodMinutes * 60 * 1000);

      // Get historical data for the period
      const historicalData = db.getHistoricalData(symbol, 'binance', startTime, endTime);

      if (historicalData.length < 2) {
        return 0.02; // Default volatility for insufficient data
      }

      // Calculate price changes
      const priceChanges: number[] = [];
      for (let i = 1; i < historicalData.length; i++) {
        const previousPrice = historicalData[i - 1].price;
        const currentPrice = historicalData[i].price;
        const priceChange = (currentPrice - previousPrice) / previousPrice;
        priceChanges.push(priceChange);
      }

      // Calculate standard deviation of price changes
      const mean = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
      const variance = priceChanges.reduce((sum, change) => sum + Math.pow(change - mean, 2), 0) / priceChanges.length;
      const standardDeviation = Math.sqrt(variance);

      // Return annualized volatility (simplified)
      return standardDeviation * Math.sqrt(365 * 24 * 60); // Annualized
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Failed to calculate volatility'), { symbol, periodMinutes });
      return 0.02; // Default volatility on error
    }
  }
}

export default RiskService;