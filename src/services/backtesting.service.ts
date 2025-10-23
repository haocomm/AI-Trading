import { DatabaseService } from '../models/database';
import { BinanceService } from '../services/binance.service';
import { MachineLearningService, MarketData } from './ml.service';
import { Logger } from '../utils/logger';

export interface BacktestConfig {
  symbol: string;
  timeframe: string;
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  strategy: BacktestStrategy;
  riskManagement: RiskConfig;
  commissions?: number;
  slippage?: number;
}

export interface BacktestStrategy {
  name: string;
  type: 'ml-based' | 'technical' | 'mixed';
  parameters: Record<string, any>;
  indicators?: string[];
  mlModel?: string;
}

export interface RiskConfig {
  maxPositionSize: number; // percentage
  stopLoss: number; // percentage
  takeProfit: number; // percentage
  maxDrawdown: number; // percentage
  dailyLossLimit: number; // percentage
  maxOpenPositions: number;
}

export interface Trade {
  id: string;
  timestamp: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  exitTime?: number;
  pnl?: number;
  pnlPercentage?: number;
  fees: number;
  strategy: string;
  reason: string;
  status: 'OPEN' | 'CLOSED';
}

export interface BacktestResult {
  summary: {
    totalReturn: number;
    returnPercentage: number;
    annualizedReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    averageWin: number;
    averageLoss: number;
    largestWin: number;
    largestLoss: number;
    averageTradeDuration: number; // hours
    commissions: number;
  };
  trades: Trade[];
  equityCurve: { timestamp: number; equity: number; }[];
  monthlyReturns: { month: string; return: number; }[];
  performance: {
    totalPnL: number;
    winRate: number;
    profitFactor: number;
    averageWin: number;
    averageLoss: number;
    sharpeRatio: number;
    maxDrawdown: number;
    calmarRatio: number;
    sortinoRatio: number;
  };
  risk: {
    volatility: number;
    beta: number;
    alpha: number;
    informationRatio: number;
    var95: number; // Value at Risk 95%
    cvar95: number; // Conditional Value at Risk 95%
  };
}

export class BacktestingService {
  private dbService: DatabaseService;
  private binanceService: BinanceService;
  private mlService?: MachineLearningService;
  private logger = Logger.getInstance();
  private isRunning = false;
  private currentProgress = 0;

  constructor(dbService: DatabaseService, binanceService: BinanceService, mlService?: MachineLearningService) {
    this.dbService = dbService;
    this.binanceService = binanceService;
    this.mlService = mlService;
  }

  /**
   * Run comprehensive backtest
   */
  public async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    if (this.isRunning) {
      throw new Error('Backtest already running');
    }

    this.isRunning = true;
    this.currentProgress = 0;

    this.logger.info('Starting backtest', {
      symbol: config.symbol,
      strategy: config.strategy.name,
      period: `${config.startDate.toISOString()} to ${config.endDate.toISOString()}`,
      service: 'BacktestingService'
    });

    try {
      // 1. Load historical data
      this.currentProgress = 10;
      const marketData = await this.loadHistoricalData(config);

      // 2. Initialize simulation
      this.currentProgress = 20;
      const simulation = this.initializeSimulation(config, marketData);

      // 3. Run simulation
      this.currentProgress = 30;
      const { trades, equityCurve } = await this.runSimulation(config, marketData, simulation);

      // 4. Calculate results
      this.currentProgress = 90;
      const result = await this.calculateResults(config, trades, equityCurve, marketData);

      this.currentProgress = 100;
      this.isRunning = false;

      this.logger.info('Backtest completed successfully', {
        symbol: config.symbol,
        strategy: config.strategy.name,
        totalTrades: trades.length,
        returnPercentage: result.summary.returnPercentage,
        sharpeRatio: result.summary.sharpeRatio,
        maxDrawdown: result.summary.maxDrawdown,
        service: 'BacktestingService'
      });

      return result;
    } catch (error) {
      this.isRunning = false;
      this.logger.error('Backtest failed', {
        symbol: config.symbol,
        strategy: config.strategy.name,
        error: (error as Error).message,
        service: 'BacktestingService'
      });
      throw error;
    }
  }

  /**
   * Run multiple backtests for strategy optimization
   */
  public async runOptimization(
    baseConfig: BacktestConfig,
    parameterRanges: Record<string, any[]>,
    iterations: number = 10
  ): Promise<{ config: BacktestConfig; result: BacktestResult; }[]> {
    this.logger.info('Starting strategy optimization', {
      baseStrategy: baseConfig.strategy.name,
      iterations,
      parameters: Object.keys(parameterRanges),
      service: 'BacktestingService'
    });

    const results: { config: BacktestConfig; result: BacktestResult; }[] = [];

    for (let i = 0; i < iterations; i++) {
      // Generate random parameter combination
      const parameters = this.generateRandomParameters(baseConfig.strategy.parameters, parameterRanges);
      const config: BacktestConfig = {
        ...baseConfig,
        strategy: {
          ...baseConfig.strategy,
          parameters
        }
      };

      try {
        const result = await this.runBacktest(config);
        results.push({ config, result });

        this.logger.info('Optimization iteration completed', {
          iteration: i + 1,
          returnPercentage: result.summary.returnPercentage,
          sharpeRatio: result.summary.sharpeRatio,
          service: 'BacktestingService'
        });
      } catch (error) {
        this.logger.error('Optimization iteration failed', {
          iteration: i + 1,
          parameters,
          error: (error as Error).message,
          service: 'BacktestingService'
        });
      }
    }

    // Sort by Sharpe ratio (best first)
    results.sort((a, b) => b.result.summary.sharpeRatio - a.result.summary.sharpeRatio);

    this.logger.info('Strategy optimization completed', {
      totalIterations: iterations,
      successfulRuns: results.length,
      bestSharpeRatio: results[0]?.result.summary.sharpeRatio || 0,
      service: 'BacktestingService'
    });

    return results;
  }

  /**
   * Compare multiple strategies
   */
  public async compareStrategies(
    configs: BacktestConfig[]
  ): Promise<{ strategy: string; result: BacktestResult; }[]> {
    this.logger.info('Starting strategy comparison', {
      strategies: configs.map(c => c.strategy.name),
      service: 'BacktestingService'
    });

    const results: { strategy: string; result: BacktestResult; }[] = [];

    for (const config of configs) {
      try {
        const result = await this.runBacktest(config);
        results.push({
          strategy: config.strategy.name,
          result
        });
      } catch (error) {
        this.logger.error('Strategy comparison failed', {
          strategy: config.strategy.name,
          error: (error as Error).message,
          service: 'BacktestingService'
        });
      }
    }

    this.logger.info('Strategy comparison completed', {
      totalStrategies: configs.length,
      successfulRuns: results.length,
      service: 'BacktestingService'
    });

    return results;
  }

  /**
   * Get backtest progress
   */
  public getProgress(): { isRunning: boolean; progress: number } {
    return {
      isRunning: this.isRunning,
      progress: this.currentProgress
    };
  }

  private async loadHistoricalData(config: BacktestConfig): Promise<MarketData[]> {
    try {
      // Calculate number of candles needed
      const timeDiff = config.endDate.getTime() - config.startDate.getTime();
      const days = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

      let limit = 1000;
      if (config.timeframe === '1m') limit = Math.min(days * 1440, 1000);
      else if (config.timeframe === '5m') limit = Math.min(days * 288, 1000);
      else if (config.timeframe === '15m') limit = Math.min(days * 96, 1000);
      else if (config.timeframe === '1h') limit = Math.min(days * 24, 1000);
      else if (config.timeframe === '4h') limit = Math.min(days * 6, 1000);
      else if (config.timeframe === '1d') limit = Math.min(days, 1000);

      const klines = await this.binanceService.getHistoricalKlines(
        config.symbol,
        config.timeframe,
        config.startDate,
        config.endDate,
        limit
      );

      const marketData: MarketData[] = klines.map(kline => ({
        timestamp: kline.openTime,
        price: kline.close,
        volume: kline.volume,
        high: kline.high,
        low: kline.low,
        open: kline.open,
        close: kline.close
      }));

      this.logger.info('Historical data loaded', {
        symbol: config.symbol,
        timeframe: config.timeframe,
        candles: marketData.length,
        service: 'BacktestingService'
      });

      return marketData;
    } catch (error) {
      this.logger.error('Failed to load historical data', {
        symbol: config.symbol,
        timeframe: config.timeframe,
        error: (error as Error).message,
        service: 'BacktestingService'
      });
      throw error;
    }
  }

  private initializeSimulation(config: BacktestConfig, marketData: MarketData[]) {
    return {
      balance: config.initialBalance,
      equity: config.initialBalance,
      openPositions: new Map<string, Trade>(),
      trades: [] as Trade[],
      equityCurve: [{ timestamp: marketData[0].timestamp, equity: config.initialBalance }],
      currentData: marketData,
      currentIndex: 0,
      commissions: 0,
      fees: config.commissions || 0.001, // 0.1% default
      slippage: config.slippage || 0.0005 // 0.05% default
    };
  }

  private async runSimulation(
    config: BacktestConfig,
    marketData: MarketData[],
    simulation: any
  ): Promise<{ trades: Trade[]; equityCurve: any[] }> {
    const { strategy, riskManagement } = config;

    for (let i = 50; i < marketData.length; i++) { // Start at 50 to have enough history
      simulation.currentIndex = i;
      const currentCandle = marketData[i];
      const historicalData = marketData.slice(0, i);

      // Update progress
      this.currentProgress = 30 + (i / marketData.length) * 50;

      // Check risk limits
      if (this.checkRiskLimits(simulation, riskManagement)) {
        continue;
      }

      // Generate trading signals
      const signals = await this.generateSignals(
        historicalData,
        currentCandle,
        strategy,
        simulation
      );

      // Process signals
      for (const signal of signals) {
        this.processSignal(signal, currentCandle, config, simulation);
      }

      // Update equity
      this.updateEquity(currentCandle, simulation);

      // Check for position exits
      this.checkPositionExits(currentCandle, config, simulation);
    }

    // Close any remaining positions
    this.closeAllPositions(marketData[marketData.length - 1], simulation);

    return {
      trades: simulation.trades,
      equityCurve: simulation.equityCurve
    };
  }

  private async generateSignals(
    historicalData: MarketData[],
    currentCandle: MarketData,
    strategy: BacktestStrategy,
    simulation: any
  ): Promise<any[]> {
    const signals: any[] = [];

    if (strategy.type === 'ml-based' && this.mlService) {
      try {
        const prediction = await this.mlService.predictPrice(
          'BTCUSDT', // Should come from config
          '1h' // Should come from config
        );

        if (prediction.confidence > 0.7) {
          signals.push({
            type: prediction.signals.trend === 'bullish' ? 'BUY' : 'SELL',
            strength: prediction.signals.strength,
            price: currentCandle.close,
            confidence: prediction.confidence,
            reason: `ML prediction: ${prediction.signals.trend} with ${(prediction.confidence * 100).toFixed(1)}% confidence`
          });
        }
      } catch (error) {
        this.logger.error('ML signal generation failed', {
          error: (error as Error).message,
          service: 'BacktestingService'
        });
      }
    }

    if (strategy.type === 'technical' || strategy.type === 'mixed') {
      // Technical analysis signals
      const technicalSignals = this.generateTechnicalSignals(historicalData, currentCandle, strategy.parameters);
      signals.push(...technicalSignals);
    }

    return signals;
  }

  private generateTechnicalSignals(
    historicalData: MarketData[],
    currentCandle: MarketData,
    parameters: Record<string, any>
  ): any[] {
    const signals: any[] = [];

    // Moving average crossover
    const shortMA = this.calculateSMA(historicalData, parameters.shortMA || 10);
    const longMA = this.calculateSMA(historicalData, parameters.longMA || 30);

    if (shortMA[shortMA.length - 2] <= longMA[longMA.length - 2] &&
        shortMA[shortMA.length - 1] > longMA[longMA.length - 1]) {
      signals.push({
        type: 'BUY',
        strength: 70,
        price: currentCandle.close,
        confidence: 0.8,
        reason: `MA crossover: Short(${parameters.shortMA || 10}) above Long(${parameters.longMA || 30})`
      });
    }

    if (shortMA[shortMA.length - 2] >= longMA[longMA.length - 2] &&
        shortMA[shortMA.length - 1] < longMA[longMA.length - 1]) {
      signals.push({
        type: 'SELL',
        strength: 70,
        price: currentCandle.close,
        confidence: 0.8,
        reason: `MA crossover: Short(${parameters.shortMA || 10}) below Long(${parameters.longMA || 30})`
      });
    }

    // RSI signals
    const rsi = this.calculateRSI(historicalData, parameters.rsiPeriod || 14);
    const currentRSI = rsi[rsi.length - 1];

    if (currentRSI < (parameters.rsiOversold || 30)) {
      signals.push({
        type: 'BUY',
        strength: 60,
        price: currentCandle.close,
        confidence: 0.7,
        reason: `RSI oversold: ${currentRSI.toFixed(2)}`
      });
    }

    if (currentRSI > (parameters.rsiOverbought || 70)) {
      signals.push({
        type: 'SELL',
        strength: 60,
        price: currentCandle.close,
        confidence: 0.7,
        reason: `RSI overbought: ${currentRSI.toFixed(2)}`
      });
    }

    return signals;
  }

  private processSignal(
    signal: any,
    currentCandle: MarketData,
    config: BacktestConfig,
    simulation: any
  ): void {
    const { riskManagement } = config;

    // Check if we already have an open position
    if (simulation.openPositions.size > 0) {
      return;
    }

    // Check if we can open a new position
    if (signal.confidence < 0.6) {
      return;
    }

    // Calculate position size
    const positionSize = (simulation.balance * riskManagement.maxPositionSize) / 100;
    const quantity = positionSize / (signal.price * (1 + simulation.slippage));
    const fees = positionSize * simulation.fees;

    if (positionSize < 10) { // Minimum position size
      return;
    }

    const trade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: currentCandle.timestamp,
      symbol: config.symbol,
      side: signal.type,
      quantity,
      entryPrice: signal.price * (1 + (signal.type === 'BUY' ? simulation.slippage : -simulation.slippage)),
      fees,
      strategy: config.strategy.name,
      reason: signal.reason,
      status: 'OPEN'
    };

    simulation.openPositions.set(trade.id, trade);
    simulation.balance -= fees;
    simulation.commissions += fees;

    this.logger.debug('Trade opened', {
      tradeId: trade.id,
      side: trade.side,
      quantity: trade.quantity,
      entryPrice: trade.entryPrice,
      reason: trade.reason,
      service: 'BacktestingService'
    });
  }

  private checkPositionExits(
    currentCandle: MarketData,
    config: BacktestService,
    simulation: any
  ): void {
    const { riskManagement } = config;

    for (const [tradeId, trade] of simulation.openPositions) {
      const currentPrice = currentCandle.close;
      const unrealizedPnL = this.calculateUnrealizedPnL(trade as Trade, currentPrice);
      const unrealizedPnLPercentage = (unrealizedPnL / ((trade as Trade).entryPrice * (trade as Trade).quantity)) * 100;

      let shouldClose = false;
      let closeReason = '';

      // Stop loss
      if (unrealizedPnLPercentage <= -riskManagement.stopLoss) {
        shouldClose = true;
        closeReason = 'Stop loss';
      }

      // Take profit
      if (unrealizedPnLPercentage >= riskManagement.takeProfit) {
        shouldClose = true;
        closeReason = 'Take profit';
      }

      // Maximum drawdown
      const portfolioDrawdown = ((simulation.equity - simulation.balance) / simulation.balance) * 100;
      if (portfolioDrawdown >= riskManagement.maxDrawdown) {
        shouldClose = true;
        closeReason = 'Maximum drawdown';
      }

      if (shouldClose) {
        this.closePosition(trade as Trade, currentPrice, currentCandle.timestamp, closeReason, simulation);
      }
    }
  }

  private closePosition(
    trade: Trade,
    exitPrice: number,
    exitTime: number,
    reason: string,
    simulation: any
  ): void {
    // Apply slippage
    const actualExitPrice = exitPrice * (1 - (trade.side === 'BUY' ? simulation.slippage : -simulation.slippage));

    // Calculate P&L
    const grossPnL = trade.side === 'BUY'
      ? (actualExitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - actualExitPrice) * trade.quantity;

    const fees = actualExitPrice * trade.quantity * simulation.fees;
    const netPnL = grossPnL - fees;
    const pnlPercentage = (netPnL / (trade.entryPrice * trade.quantity)) * 100;

    // Update trade
    trade.exitPrice = actualExitPrice;
    trade.exitTime = exitTime;
    trade.pnl = netPnL;
    trade.pnlPercentage = pnlPercentage;
    trade.status = 'CLOSED';

    // Update simulation
    simulation.balance += (trade.entryPrice * trade.quantity) + netPnL;
    simulation.trades.push(trade);
    simulation.openPositions.delete(trade.id);
    simulation.commissions += fees;

    this.logger.debug('Trade closed', {
      tradeId: trade.id,
      pnl: netPnL,
      pnlPercentage,
      reason,
      service: 'BacktestingService'
    });
  }

  private closeAllPositions(
    lastCandle: MarketData,
    simulation: any
  ): void {
    for (const [tradeId, trade] of simulation.openPositions) {
      this.closePosition(trade as Trade, lastCandle.close, lastCandle.timestamp, 'End of backtest', simulation);
    }
  }

  private updateEquity(currentCandle: MarketData, simulation: any): void {
    let totalEquity = simulation.balance;

    // Add unrealized P&L from open positions
    for (const [tradeId, trade] of simulation.openPositions) {
      const unrealizedPnL = this.calculateUnrealizedPnL(trade as Trade, currentCandle.close);
      totalEquity += (trade as Trade).entryPrice * (trade as Trade).quantity + unrealizedPnL;
    }

    simulation.equity = totalEquity;
    simulation.equityCurve.push({
      timestamp: currentCandle.timestamp,
      equity: totalEquity
    });
  }

  private calculateUnrealizedPnL(trade: Trade, currentPrice: number): number {
    return trade.side === 'BUY'
      ? (currentPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - currentPrice) * trade.quantity;
  }

  private checkRiskLimits(simulation: any, riskManagement: RiskConfig): boolean {
    // Check maximum open positions
    if (simulation.openPositions.size >= riskManagement.maxOpenPositions) {
      return true;
    }

    // Check daily loss limit
    const dailyPnL = this.calculateDailyPnL(simulation.trades, Date.now());
    const dailyLossPercentage = (Math.abs(dailyPnL) / simulation.balance) * 100;

    if (dailyPnL < 0 && dailyLossPercentage >= riskManagement.dailyLossLimit) {
      return true;
    }

    return false;
  }

  private calculateDailyPnL(trades: Trade[], currentTime: number): number {
    const startOfDay = new Date(currentTime).setHours(0, 0, 0, 0);

    return trades
      .filter(trade => trade.status === 'CLOSED' && trade.exitTime! >= startOfDay)
      .reduce((total, trade) => total + (trade.pnl || 0), 0);
  }

  private async calculateResults(
    config: BacktestConfig,
    trades: Trade[],
    equityCurve: any[],
    marketData: MarketData[]
  ): Promise<BacktestResult> {
    const closedTrades = trades.filter(trade => trade.status === 'CLOSED');

    // Calculate basic metrics
    const totalPnL = closedTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
    const totalReturn = config.initialBalance + totalPnL;
    const returnPercentage = (totalPnL / config.initialBalance) * 100;

    const winningTrades = closedTrades.filter(trade => (trade.pnl || 0) > 0);
    const losingTrades = closedTrades.filter(trade => (trade.pnl || 0) < 0);

    const winRate = (winningTrades.length / closedTrades.length) * 100;
    const averageWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0) / winningTrades.length
      : 0;
    const averageLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0) / losingTrades.length
      : 0;

    const grossProfit = winningTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    // Calculate advanced metrics
    const maxDrawdown = this.calculateMaxDrawdown(equityCurve);
    const sharpeRatio = this.calculateSharpeRatio(equityCurve);
    const volatility = this.calculateVolatility(equityCurve);
    const calmarRatio = Math.abs(returnPercentage) > 0 ? Math.abs(returnPercentage / maxDrawdown) : 0;
    const sortinoRatio = this.calculateSortinoRatio(equityCurve);

    // Calculate monthly returns
    const monthlyReturns = this.calculateMonthlyReturns(equityCurve);

    // Calculate risk metrics
    const var95 = this.calculateVaR(equityCurve, 0.05);
    const cvar95 = this.calculateCVaR(equityCurve, 0.05);

    // Calculate average trade duration
    const averageTradeDuration = closedTrades.length > 0
      ? closedTrades.reduce((sum, trade) => sum + ((trade.exitTime! - trade.timestamp) / (1000 * 60 * 60)), 0) / closedTrades.length
      : 0;

    // Calculate annualized return
    const days = (config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24);
    const annualizedReturn = Math.pow(1 + (returnPercentage / 100), 365 / days) - 1;

    return {
      summary: {
        totalReturn,
        returnPercentage,
        annualizedReturn: annualizedReturn * 100,
        sharpeRatio,
        maxDrawdown,
        winRate,
        profitFactor,
        totalTrades: closedTrades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        averageWin,
        averageLoss,
        largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl || 0)) : 0,
        largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl || 0)) : 0,
        averageTradeDuration,
        commissions: simulation?.commissions || 0
      },
      trades,
      equityCurve,
      monthlyReturns,
      performance: {
        totalPnL,
        winRate,
        profitFactor,
        averageWin,
        averageLoss,
        sharpeRatio,
        maxDrawdown,
        calmarRatio,
        sortinoRatio
      },
      risk: {
        volatility,
        beta: 1, // Would need benchmark data
        alpha: 0, // Would need benchmark data
        informationRatio: 0, // Would need benchmark data
        var95,
        cvar95
      }
    };
  }

  private calculateSMA(data: MarketData[], period: number): number[] {
    const sma: number[] = [];

    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((sum, d) => sum + d.close, 0);
      sma.push(sum / period);
    }

    return sma;
  }

  private calculateRSI(data: MarketData[], period: number): number[] {
    const rsi: number[] = [];
    let gains = 0;
    let losses = 0;

    // Calculate initial average gains and losses
    for (let i = 1; i <= period; i++) {
      const change = data[i].close - data[i - 1].close;
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;

      if (change > 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
      }

      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }

    return rsi;
  }

  private calculateMaxDrawdown(equityCurve: any[]): number {
    let maxDrawdown = 0;
    let peak = equityCurve[0].equity;

    for (const point of equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }

      const drawdown = ((peak - point.equity) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  private calculateSharpeRatio(equityCurve: any[]): number {
    const returns: number[] = [];

    for (let i = 1; i < equityCurve.length; i++) {
      const returnRate = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
      returns.push(returnRate);
    }

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Assuming risk-free rate of 2% annually
    const riskFreeRate = 0.02 / 365; // Daily rate
    return stdDev > 0 ? (avgReturn - riskFreeRate) / stdDev : 0;
  }

  private calculateVolatility(equityCurve: any[]): number {
    const returns: number[] = [];

    for (let i = 1; i < equityCurve.length; i++) {
      const returnRate = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
      returns.push(returnRate);
    }

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;

    return Math.sqrt(variance) * Math.sqrt(365) * 100; // Annualized volatility
  }

  private calculateSortinoRatio(equityCurve: any[]): number {
    const returns: number[] = [];

    for (let i = 1; i < equityCurve.length; i++) {
      const returnRate = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
      returns.push(returnRate);
    }

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const negativeReturns = returns.filter(r => r < 0);

    if (negativeReturns.length === 0) return 0;

    const downwardDeviation = Math.sqrt(
      negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
    );

    const riskFreeRate = 0.02 / 365;
    return downwardDeviation > 0 ? (avgReturn - riskFreeRate) / downwardDeviation : 0;
  }

  private calculateMonthlyReturns(equityCurve: any[]): { month: string; return: number; }[] {
    const monthlyData: Map<string, { start: number; end: number; }> = new Map();

    for (const point of equityCurve) {
      const date = new Date(point.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { start: point.equity, end: point.equity });
      } else {
        monthlyData.get(monthKey)!.end = point.equity;
      }
    }

    const monthlyReturns: { month: string; return: number; }[] = [];

    for (const [month, data] of monthlyData) {
      const returnRate = ((data.end - data.start) / data.start) * 100;
      monthlyReturns.push({ month, return: returnRate });
    }

    return monthlyReturns;
  }

  private calculateVaR(equityCurve: any[], confidenceLevel: number): number {
    const returns: number[] = [];

    for (let i = 1; i < equityCurve.length; i++) {
      const returnRate = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
      returns.push(returnRate);
    }

    returns.sort((a, b) => a - b);

    const index = Math.floor(returns.length * confidenceLevel);
    return Math.abs(returns[index]) * 100;
  }

  private calculateCVaR(equityCurve: any[], confidenceLevel: number): number {
    const returns: number[] = [];

    for (let i = 1; i < equityCurve.length; i++) {
      const returnRate = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
      returns.push(returnRate);
    }

    returns.sort((a, b) => a - b);

    const index = Math.floor(returns.length * confidenceLevel);
    const tailReturns = returns.slice(0, index);

    const averageTailReturn = tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length;
    return Math.abs(averageTailReturn) * 100;
  }

  private generateRandomParameters(
    baseParameters: Record<string, any>,
    parameterRanges: Record<string, any[]>
  ): Record<string, any> {
    const parameters = { ...baseParameters };

    for (const [key, values] of Object.entries(parameterRanges)) {
      if (Array.isArray(values) && values.length > 0) {
        parameters[key] = values[Math.floor(Math.random() * values.length)];
      }
    }

    return parameters;
  }
}