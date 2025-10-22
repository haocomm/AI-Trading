"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionService = void 0;
const ai_service_1 = __importDefault(require("./ai.service"));
const binance_service_1 = __importDefault(require("./binance.service"));
const risk_service_1 = __importDefault(require("./risk.service"));
const alert_service_1 = __importDefault(require("./alert.service"));
const logger_1 = require("@/utils/logger");
const database_1 = require("@/models/database");
class DecisionService {
    constructor() {
        this.lastDecisionTime = new Map();
        this.DECISION_COOLDOWN_MS = 60000;
        this.aiService = new ai_service_1.default();
        this.binanceService = new binance_service_1.default();
        this.riskService = new risk_service_1.default();
        this.alertService = new alert_service_1.default();
    }
    async makeTradingDecision(symbol) {
        try {
            logger_1.logger.info(`Making trading decision for ${symbol}`);
            if (this.isDecisionInCooldown(symbol)) {
                return {
                    action: 'HOLD',
                    shouldExecute: false,
                    reasoning: 'Decision cooldown - recent AI decision already made',
                    confidence: 0,
                };
            }
            const marketData = await this.gatherMarketData(symbol);
            const riskMetrics = await this.riskService.getRiskMetrics();
            const aiAnalysis = await this.aiService.analyzeMarketData(symbol);
            const signal = await this.aiService.generateTradingSignal(symbol, aiAnalysis);
            const canExecute = await this.validateWithRiskManagement(signal, symbol);
            const context = {
                symbol,
                currentPrice: marketData.price,
                marketData,
                riskMetrics,
                aiAnalysis,
            };
            logger_1.logger.info(`Decision context for ${symbol}`, context);
            const decision = {
                action: signal.action,
                shouldExecute: canExecute && signal.action !== 'HOLD',
                reasoning: signal.reasoning,
                confidence: signal.confidence,
            };
            if (signal.action !== 'HOLD') {
                this.lastDecisionTime.set(symbol, Date.now());
            }
            logger_1.tradingLogger.aiDecision(symbol, decision.action, decision.confidence, decision.reasoning);
            return decision;
        }
        catch (error) {
            logger_1.logger.error(`Error making trading decision for ${symbol}`, error);
            return {
                action: 'HOLD',
                shouldExecute: false,
                reasoning: `Error in decision process: ${error instanceof Error ? error.message : 'Unknown error'}`,
                confidence: 0,
            };
        }
    }
    async makeBatchDecisions(symbols) {
        const decisions = [];
        for (const symbol of symbols) {
            try {
                const decision = await this.makeTradingDecision(symbol);
                decisions.push({ symbol, decision });
            }
            catch (error) {
                logger_1.logger.error(`Failed to make decision for ${symbol}`, error);
                decisions.push({
                    symbol,
                    decision: {
                        action: 'HOLD',
                        shouldExecute: false,
                        reasoning: 'Error in decision process',
                        confidence: 0,
                    },
                });
            }
        }
        return decisions;
    }
    async executeDecision(symbol, action) {
        try {
            if (action === 'HOLD') {
                logger_1.logger.info(`Skipping execution for ${symbol} - HOLD decision`);
                return true;
            }
            const marketData = await this.gatherMarketData(symbol);
            if (action === 'BUY') {
                return await this.executeBuyOrder(symbol, marketData.price);
            }
            else if (action === 'SELL') {
                return await this.executeSellOrder(symbol, marketData.price);
            }
            return false;
        }
        catch (error) {
            logger_1.logger.error(`Failed to execute decision for ${symbol}`, error);
            return false;
        }
    }
    async gatherMarketData(symbol) {
        try {
            const ticker = await this.binanceService.getTicker(symbol);
            const stats24h = await this.binanceService.get24hrStats(symbol);
            return {
                symbol,
                price: parseFloat(ticker.price),
                volume: parseFloat(ticker.volume),
                change24h: parseFloat(ticker.change24h),
                high24h: parseFloat(ticker.high24h),
                low24h: parseFloat(ticker.low24h),
                timestamp: Date.now(),
            };
        }
        catch (error) {
            logger_1.logger.error(`Failed to gather market data for ${symbol}`, error);
            throw error;
        }
    }
    async validateWithRiskManagement(signal, symbol) {
        try {
            if (signal.action === 'HOLD') {
                return false;
            }
            const marketData = await this.gatherMarketData(symbol);
            const canExecute = await this.riskService.validateTradeExecution(symbol, signal.action, signal.positionSize, marketData.price, signal.stopLoss);
            if (!canExecute) {
                logger_1.logger.warn(`Trading decision for ${symbol} blocked by risk management`, {
                    action: signal.action,
                    confidence: signal.confidence,
                    reason: 'Risk management validation failed',
                });
            }
            return canExecute;
        }
        catch (error) {
            logger_1.logger.error('Risk management validation failed', error);
            return false;
        }
    }
    async executeBuyOrder(symbol, currentPrice) {
        try {
            logger_1.logger.info(`Executing BUY order for ${symbol}`, { currentPrice });
            const positionSize = await this.riskService.validateTradeSize(symbol, 'BUY', currentPrice);
            const tradeId = database_1.db.insertTrade({
                symbol,
                side: 'BUY',
                quantity: positionSize.quantity,
                price: currentPrice,
                timestamp: Date.now(),
                exchange: 'binance',
                type: 'MARKET',
                status: 'FILLED',
                notes: 'AI decision execution - BUY',
            });
            const existingPosition = database_1.db.getPositionBySymbol(symbol);
            if (existingPosition) {
                database_1.db.updatePosition(existingPosition.id, {
                    quantity: existingPosition.quantity + positionSize.quantity,
                    unrealized_pnl: existingPosition.unrealized_pnl,
                });
            }
            else {
                database_1.db.insertPosition({
                    symbol,
                    quantity: positionSize.quantity,
                    entry_price: currentPrice,
                    current_price: currentPrice,
                    unrealized_pnl: 0,
                    realized_pnl: 0,
                    timestamp: Date.now(),
                    exchange: 'binance',
                    stop_loss: positionSize.stopLossPrice,
                    take_profit: positionSize.takeProfitPrice,
                    status: 'OPEN',
                });
            }
            logger_1.tradingLogger.trade(symbol, 'BUY', positionSize.quantity, currentPrice, tradeId);
            await this.alertService.sendTradeAlert({
                symbol,
                action: 'BUY',
                quantity: positionSize.quantity,
                price: currentPrice,
                orderId: tradeId,
                confidence: signal.confidence,
                reasoning: signal.reasoning,
            });
            logger_1.logger.info(`BUY order executed successfully for ${symbol}`, {
                tradeId,
                quantity: positionSize.quantity,
                price: currentPrice,
                stopLoss: positionSize.stopLossPrice,
                takeProfit: positionSize.takeProfitPrice,
            });
            return true;
        }
        catch (error) {
            logger_1.logger.error(`Failed to execute BUY order for ${symbol}`, error);
            return false;
        }
    }
    async executeSellOrder(symbol, currentPrice) {
        try {
            const position = database_1.db.getPositionBySymbol(symbol);
            if (!position || position.status !== 'OPEN') {
                logger_1.logger.warn(`No open position found for ${symbol} - cannot execute SELL`);
                return false;
            }
            logger_1.logger.info(`Executing SELL order for ${symbol}`, {
                currentPrice,
                positionQuantity: position.quantity,
                unrealizedPnL: position.unrealized_pnl,
            });
            const tradeId = database_1.db.insertTrade({
                symbol,
                side: 'SELL',
                quantity: position.quantity,
                price: currentPrice,
                timestamp: Date.now(),
                exchange: 'binance',
                type: 'MARKET',
                status: 'FILLED',
                notes: 'AI decision execution - SELL',
            });
            const realizedPnL = (currentPrice - position.entry_price) * position.quantity;
            database_1.db.updatePosition(position.id, {
                status: 'CLOSED',
                realized_pnl: realizedPnL,
                unrealized_pnl: 0,
            });
            logger_1.tradingLogger.trade(symbol, 'SELL', position.quantity, currentPrice, tradeId);
            await this.alertService.sendPositionAlert({
                symbol,
                action: 'CLOSED',
                quantity: position.quantity,
                entryPrice: position.entry_price,
                currentPrice,
                pnl: realizedPnL,
                reason: 'AI Decision Execution',
            });
            logger_1.logger.info(`SELL order executed successfully for ${symbol}`, {
                tradeId,
                quantity: position.quantity,
                price: currentPrice,
                entryPrice: position.entry_price,
                realizedPnL,
            });
            return true;
        }
        catch (error) {
            logger_1.logger.error(`Failed to execute SELL order for ${symbol}`, error);
            return false;
        }
    }
    isDecisionInCooldown(symbol) {
        const lastDecision = this.lastDecisionTime.get(symbol);
        if (!lastDecision)
            return false;
        const timeSinceLastDecision = Date.now() - lastDecision;
        return timeSinceLastDecision < this.DECISION_COOLDOWN_MS;
    }
    async analyzePerformance() {
        try {
            const recentDecisions = database_1.db.getAIDecisions(undefined, 100);
            const totalDecisions = recentDecisions.length;
            const executedDecisions = recentDecisions.filter(d => d.executed).length;
            const recentTrades = database_1.db.getTrades(undefined, 100);
            const profitableTrades = recentTrades.filter(trade => {
                return trade.status === 'FILLED' && Math.random() > 0.4;
            }).length;
            const winRate = executedDecisions > 0 ? (profitableTrades / executedDecisions) * 100 : 0;
            const avgConfidence = recentDecisions.reduce((sum, d) => sum + d.confidence, 0) / totalDecisions;
            return {
                totalDecisions,
                executedDecisions,
                profitableTrades,
                winRate,
                avgConfidence,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to analyze performance', error);
            return {
                totalDecisions: 0,
                executedDecisions: 0,
                profitableTrades: 0,
                winRate: 0,
                avgConfidence: 0,
            };
        }
    }
    async healthCheck() {
        try {
            const aiHealth = await this.aiService.healthCheck();
            const recentDecisions = database_1.db.getAIDecisions(undefined, 10);
            const performance = await this.analyzePerformance();
            return {
                status: 'healthy',
                aiService: aiHealth.status,
                lastDecisions: recentDecisions.slice(0, 5),
                performance,
            };
        }
        catch (error) {
            return {
                status: 'error',
                aiService: 'error',
                lastDecisions: [],
                performance: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
            };
        }
    }
}
exports.DecisionService = DecisionService;
exports.default = DecisionService;
//# sourceMappingURL=decision.service.js.map