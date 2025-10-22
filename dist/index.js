"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
const binance_service_1 = __importDefault(require("@/services/binance.service"));
const risk_service_1 = __importDefault(require("@/services/risk.service"));
const decision_service_1 = __importDefault(require("@/services/decision.service"));
const alert_service_1 = __importDefault(require("@/services/alert.service"));
const database_1 = require("@/models/database");
class TradingBot {
    constructor() {
        this.isRunning = false;
        this.priceUpdateInterval = null;
        this.aiDecisionInterval = null;
        this.binanceService = new binance_service_1.default();
        this.riskService = new risk_service_1.default();
        this.decisionService = new decision_service_1.default();
        this.alertService = new alert_service_1.default();
    }
    async initialize() {
        try {
            logger_1.logger.info('Initializing AI Trading Bot...');
            (0, config_1.validateConfig)();
            logger_1.logger.info('Configuration validated successfully');
            const connectionTest = await this.binanceService.testConnection();
            if (!connectionTest) {
                throw new Error('Failed to connect to Binance API');
            }
            logger_1.logger.info('Binance API connection successful');
            const accountInfo = await this.binanceService.getAccountInfo();
            logger_1.logger.info('Account information retrieved', {
                canTrade: accountInfo.canTrade,
                accountType: accountInfo.accountType,
            });
            const riskMetrics = await this.riskService.getRiskMetrics();
            logger_1.logger.info('Initial risk metrics', riskMetrics);
            logger_1.logger.info('AI Trading Bot initialized successfully');
        }
        catch (error) {
            logger_1.logger.error('Failed to initialize AI Trading Bot', error);
            throw error;
        }
    }
    async start() {
        try {
            if (this.isRunning) {
                logger_1.logger.warn('Trading bot is already running');
                return;
            }
            await this.initialize();
            this.isRunning = true;
            logger_1.logger.info('Starting AI Trading Bot...');
            this.startPriceMonitoring(['BTCUSDT', 'ETHUSDT', 'BNBUSDT']);
            this.startPositionMonitoring();
            this.startAIDecisionMaking();
            logger_1.logger.info('AI Trading Bot started successfully');
        }
        catch (error) {
            logger_1.logger.error('Failed to start AI Trading Bot', error);
            this.isRunning = false;
            throw error;
        }
    }
    async stop() {
        try {
            if (!this.isRunning) {
                logger_1.logger.warn('Trading bot is not running');
                return;
            }
            logger_1.logger.info('Stopping AI Trading Bot...');
            this.isRunning = false;
            if (this.priceUpdateInterval) {
                clearInterval(this.priceUpdateInterval);
                this.priceUpdateInterval = null;
            }
            this.binanceService.stopAllWebSockets();
            if (this.aiDecisionInterval) {
                clearInterval(this.aiDecisionInterval);
                this.aiDecisionInterval = null;
            }
            logger_1.logger.info('AI Trading Bot stopped successfully');
        }
        catch (error) {
            logger_1.logger.error('Error stopping AI Trading Bot', error);
            throw error;
        }
    }
    startPriceMonitoring(symbols) {
        logger_1.logger.info('Starting price monitoring for symbols', { symbols });
        this.binanceService.startPriceWebSocket(symbols, (symbol, price) => {
            this.handlePriceUpdate(symbol, price);
        });
        this.priceUpdateInterval = setInterval(async () => {
            for (const symbol of symbols) {
                try {
                    const ticker = await this.binanceService.getTicker(symbol);
                    await this.handleTickerUpdate(symbol, ticker);
                }
                catch (error) {
                    logger_1.logger.error(`Failed to get ticker for ${symbol}`, error);
                }
            }
        }, 30000);
    }
    startPositionMonitoring() {
        setInterval(async () => {
            try {
                if (!this.isRunning)
                    return;
                const openPositions = database_1.db.getOpenPositions();
                const riskMetrics = await this.riskService.getRiskMetrics();
                logger_1.logger.info('Position monitoring update', {
                    openPositions: openPositions.length,
                    portfolioValue: riskMetrics.portfolioValue,
                    dailyPnL: riskMetrics.dailyPnL,
                });
                if (riskMetrics.dailyPnL < -riskMetrics.maxDailyLoss) {
                    this.riskService.enableEmergencyStop('Daily loss limit exceeded');
                    logger_1.logger.error('Emergency stop triggered - daily loss limit exceeded');
                }
            }
            catch (error) {
                logger_1.logger.error('Error in position monitoring', error);
            }
        }, 30000);
    }
    startAIDecisionMaking() {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
        logger_1.logger.info('Starting AI decision making loop', { symbols });
        this.makeAIDecisions(symbols);
        this.aiDecisionInterval = setInterval(async () => {
            if (this.isRunning) {
                await this.makeAIDecisions(symbols);
            }
        }, 5 * 60 * 1000);
    }
    async makeAIDecisions(symbols) {
        for (const symbol of symbols) {
            if (!this.isRunning)
                break;
            try {
                const decision = await this.decisionService.makeTradingDecision(symbol);
                if (decision.shouldExecute) {
                    logger_1.logger.info('Executing AI decision', { symbol, action: decision.action });
                    await this.decisionService.executeDecision(symbol, decision.action);
                }
                else {
                    logger_1.logger.debug('AI decision: HOLD', { symbol, confidence: decision.confidence });
                }
            }
            catch (error) {
                logger_1.logger.error('Error making AI decision', { symbol, error });
            }
        }
    }
    async handlePriceUpdate(symbol, price) {
        try {
            const marketData = {
                symbol,
                price,
                volume: 0,
                high_24h: 0,
                low_24h: 0,
                change_24h: 0,
                timestamp: Date.now(),
                exchange: 'binance',
            };
            database_1.db.insertMarketData(marketData);
            await this.checkStopLevels(symbol, price);
        }
        catch (error) {
            logger_1.logger.error(`Failed to handle price update for ${symbol}`, error);
        }
    }
    async handleTickerUpdate(symbol, ticker) {
        try {
            const marketData = {
                symbol,
                price: parseFloat(ticker.price),
                volume: parseFloat(ticker.volume),
                high_24h: parseFloat(ticker.high24h),
                low_24h: parseFloat(ticker.low24h),
                change_24h: parseFloat(ticker.change24h),
                timestamp: Date.now(),
                exchange: 'binance',
            };
            database_1.db.insertMarketData(marketData);
            await this.updatePositionPrices(symbol, parseFloat(ticker.price));
        }
        catch (error) {
            logger_1.logger.error(`Failed to handle ticker update for ${symbol}`, error);
        }
    }
    async checkStopLevels(symbol, currentPrice) {
        try {
            const position = database_1.db.getPositionBySymbol(symbol);
            if (!position || position.status !== 'OPEN') {
                return;
            }
            let shouldClose = false;
            let reason = '';
            if (position.stop_loss && currentPrice <= position.stop_loss) {
                shouldClose = true;
                reason = 'Stop loss triggered';
            }
            if (position.take_profit && currentPrice >= position.take_profit) {
                shouldClose = true;
                reason = 'Take profit triggered';
            }
            if (shouldClose) {
                logger_1.logger.info(`${reason} for ${symbol}`, {
                    symbol,
                    currentPrice,
                    stopLoss: position.stop_loss,
                    takeProfit: position.take_profit,
                });
                await this.closePosition(symbol, reason);
            }
        }
        catch (error) {
            logger_1.logger.error(`Failed to check stop levels for ${symbol}`, error);
        }
    }
    async updatePositionPrices(symbol, currentPrice) {
        try {
            const openPositions = database_1.db.getOpenPositions();
            const symbolPositions = openPositions.filter((p) => p.symbol === symbol);
            for (const position of symbolPositions) {
                const unrealizedPnL = (currentPrice - position.entry_price) * position.quantity;
                database_1.db.updatePosition(position.id, {
                    current_price: currentPrice,
                    unrealized_pnl: unrealizedPnL,
                });
            }
        }
        catch (error) {
            logger_1.logger.error(`Failed to update position prices for ${symbol}`, error);
        }
    }
    async closePosition(symbol, reason) {
        try {
            const position = database_1.db.getPositionBySymbol(symbol);
            if (!position) {
                logger_1.logger.warn(`No open position found for ${symbol}`);
                return;
            }
            logger_1.logger.info(`Position closed for ${symbol}`, {
                reason,
                quantity: position.quantity,
                realizedPnL: position.unrealized_pnl,
            });
        }
        catch (error) {
            logger_1.logger.error(`Failed to close position for ${symbol}`, error);
        }
    }
    async healthCheck() {
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
        }
        catch (error) {
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
const bot = new TradingBot();
process.on('SIGINT', async () => {
    logger_1.logger.info('Received SIGINT, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    logger_1.logger.info('Received SIGTERM, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.error('Unhandled Rejection at:', { promise, reason });
});
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Uncaught Exception:', error);
    process.exit(1);
});
if (require.main === module) {
    bot.start().catch(error => {
        logger_1.logger.error('Failed to start bot', error);
        process.exit(1);
    });
}
exports.default = bot;
//# sourceMappingURL=index.js.map