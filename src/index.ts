import { validateConfig } from '@/config';
import { logger } from '@/utils/logger';
import BinanceService from '@/services/binance.service';
import RiskService from '@/services/risk.service';
import DecisionService from '@/services/decision.service';
import AlertService from '@/services/alert.service';
import { OrderRequest, ExchangeError, RiskError } from '@/types';
import { db } from '@/models/database';

class TradingBot {
  private binanceService: BinanceService;
  private riskService: RiskService;
  private decisionService: DecisionService;
  private alertService: AlertService;
  private isRunning = false;
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  private aiDecisionInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.binanceService = new BinanceService();
    this.riskService = new RiskService();
    this.decisionService = new DecisionService();
    this.alertService = new AlertService();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing AI Trading Bot...');

      // Validate configuration
      validateConfig();
      logger.info('Configuration validated successfully');

      // Test Binance connection
      const connectionTest = await this.binanceService.testConnection();
      if (!connectionTest) {
        throw new Error('Failed to connect to Binance API');
      }
      logger.info('Binance API connection successful');

      // Get account information
      const accountInfo = await this.binanceService.getAccountInfo();
      logger.info('Account information retrieved', {
        canTrade: accountInfo.canTrade,
        accountType: accountInfo.accountType,
      });

      // Get initial risk metrics
      const riskMetrics = await this.riskService.getRiskMetrics();
      logger.info('Initial risk metrics', riskMetrics);

      logger.info('AI Trading Bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AI Trading Bot', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        logger.warn('Trading bot is already running');
        return;
      }

      await this.initialize();
      this.isRunning = true;

      logger.info('Starting AI Trading Bot...');

      // Start monitoring prices
      this.startPriceMonitoring(['BTCUSDT', 'ETHUSDT', 'BNBUSDT']);

      // Start position monitoring
      this.startPositionMonitoring();

      // Start AI decision making
      this.startAIDecisionMaking();

      logger.info('AI Trading Bot started successfully');
    } catch (error) {
      logger.error('Failed to start AI Trading Bot', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        logger.warn('Trading bot is not running');
        return;
      }

      logger.info('Stopping AI Trading Bot...');

      this.isRunning = false;

      // Stop price monitoring
      if (this.priceUpdateInterval) {
        clearInterval(this.priceUpdateInterval);
        this.priceUpdateInterval = null;
      }

      // Stop WebSocket connections
      this.binanceService.stopAllWebSockets();

      // Stop AI decision making
      if (this.aiDecisionInterval) {
        clearInterval(this.aiDecisionInterval);
        this.aiDecisionInterval = null;
      }

      logger.info('AI Trading Bot stopped successfully');
    } catch (error) {
      logger.error('Error stopping AI Trading Bot', error);
      throw error;
    }
  }

  private startPriceMonitoring(symbols: string[]): void {
    logger.info('Starting price monitoring for symbols', { symbols });

    // Start WebSocket price updates
    this.binanceService.startPriceWebSocket(symbols, (symbol, price) => {
      this.handlePriceUpdate(symbol, price);
    });

    // Also poll for price updates every 30 seconds as backup
    this.priceUpdateInterval = setInterval(async () => {
      for (const symbol of symbols) {
        try {
          const ticker = await this.binanceService.getTicker(symbol);
          await this.handleTickerUpdate(symbol, ticker);
        } catch (error) {
          logger.error(`Failed to get ticker for ${symbol}`, error);
        }
      }
    }, 30000);
  }

  private startPositionMonitoring(): void {
    // Monitor positions every 30 seconds
    setInterval(async () => {
      try {
        if (!this.isRunning) return;

        const openPositions = db.getOpenPositions();
        const riskMetrics = await this.riskService.getRiskMetrics();

        logger.info('Position monitoring update', {
          openPositions: openPositions.length,
          portfolioValue: riskMetrics.portfolioValue,
          dailyPnL: riskMetrics.dailyPnL,
        });

        // Check if emergency stop should be triggered
        if (riskMetrics.dailyPnL < -riskMetrics.maxDailyLoss) {
          this.riskService.enableEmergencyStop('Daily loss limit exceeded');
          logger.error('Emergency stop triggered - daily loss limit exceeded');
        }
      } catch (error) {
        logger.error('Error in position monitoring', error);
      }
    }, 30000);
  }

  private startAIDecisionMaking(): void {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];

    logger.info('Starting AI decision making loop', { symbols });

    // Make initial decisions
    this.makeAIDecisions(symbols);

    // Schedule regular AI decisions every 5 minutes
    this.aiDecisionInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.makeAIDecisions(symbols);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  private async makeAIDecisions(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      if (!this.isRunning) break;

      try {
        const decision = await this.decisionService.makeTradingDecision(symbol);

        if (decision.shouldExecute) {
          logger.info('Executing AI decision', { symbol, action: decision.action });
          await this.decisionService.executeDecision(symbol, decision.action);
        } else {
          logger.debug('AI decision: HOLD', { symbol, confidence: decision.confidence });
        }
      } catch (error) {
        logger.error('Error making AI decision', { symbol, error });
      }
    }
  }

  private async handlePriceUpdate(symbol: string, price: number): Promise<void> {
    try {
      // Store price data in database
      const marketData = {
        symbol,
        price,
        volume: 0,
        high_24h: 0,
        low_24h: 0,
        change_24h: 0,
        timestamp: Date.now(),
        exchange: 'binance' as const,
      };

      db.insertMarketData(marketData);

      // Check if any stop losses or take profits are hit
      await this.checkStopLevels(symbol, price);
    } catch (error) {
      logger.error(`Failed to handle price update for ${symbol}`, error);
    }
  }

  private async handleTickerUpdate(symbol: string, ticker: any): Promise<void> {
    try {
      const marketData = {
        symbol,
        price: parseFloat(ticker.price),
        volume: parseFloat(ticker.volume),
        high_24h: parseFloat(ticker.high24h),
        low_24h: parseFloat(ticker.low24h),
        change_24h: parseFloat(ticker.change24h),
        timestamp: Date.now(),
        exchange: 'binance' as const,
      };

      db.insertMarketData(marketData);

      // Update position prices
      await this.updatePositionPrices(symbol, parseFloat(ticker.price));
    } catch (error) {
      logger.error(`Failed to handle ticker update for ${symbol}`, error);
    }
  }

  private async checkStopLevels(symbol: string, currentPrice: number): Promise<void> {
    try {
      const position = db.getPositionBySymbol(symbol);
      if (!position || position.status !== 'OPEN') {
        return;
      }

      let shouldClose = false;
      let reason = '';

      // Check stop loss
      if (position.stop_loss && currentPrice <= position.stop_loss) {
        shouldClose = true;
        reason = 'Stop loss triggered';
      }

      // Check take profit
      if (position.take_profit && currentPrice >= position.take_profit) {
        shouldClose = true;
        reason = 'Take profit triggered';
      }

      if (shouldClose) {
        logger.info(`${reason} for ${symbol}`, {
          symbol,
          currentPrice,
          stopLoss: position.stop_loss,
          takeProfit: position.take_profit,
        });

        await this.closePosition(symbol, reason);
      }
    } catch (error) {
      logger.error(`Failed to check stop levels for ${symbol}`, error);
    }
  }

  private async updatePositionPrices(symbol: string, currentPrice: number): Promise<void> {
    try {
      const openPositions = db.getOpenPositions();
      const symbolPositions = openPositions.filter((p: any) => p.symbol === symbol);

      for (const position of symbolPositions) {
        const unrealizedPnL = (currentPrice - position.entry_price) * position.quantity;

        db.updatePosition(position.id, {
          current_price: currentPrice,
          unrealized_pnl: unrealizedPnL,
        });
      }
    } catch (error) {
      logger.error(`Failed to update position prices for ${symbol}`, error);
    }
  }

  private async closePosition(symbol: string, reason: string): Promise<void> {
    try {
      const position = db.getPositionBySymbol(symbol);
      if (!position) {
        logger.warn(`No open position found for ${symbol}`);
        return;
      }

      logger.info(`Position closed for ${symbol}`, {
        reason,
        quantity: position.quantity,
        realizedPnL: position.unrealized_pnl,
      });
    } catch (error) {
      logger.error(`Failed to close position for ${symbol}`, error);
    }
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const isHealthy = this.isRunning;
      const connectionTest = await this.binanceService.testConnection();
      const riskMetrics = await this.riskService.getRiskMetrics();

      return {
        status: isHealthy ? 'healthy' : 'stopped',
        details: {
          isRunning: this.isRunning,
          connectionStatus: connectionTest ? 'connected' : 'disconnected',
          riskMetrics,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
}

// Create and export bot instance
const bot = new TradingBot();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

// Unhandled error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start bot if this file is run directly
if (require.main === module) {
  bot.start().catch(error => {
    logger.error('Failed to start bot', error);
    process.exit(1);
  });
}

export default bot;