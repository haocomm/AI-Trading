"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskService = void 0;
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
const types_1 = require("@/types");
const database_1 = require("@/models/database");
class RiskService {
    constructor() {
        this.dailyPnL = null;
        this.emergencyStop = false;
        this.lastResetTime = new Date().toISOString().split('T')[0];
        this.loadDailyPnL();
        this.resetDailyCounters();
    }
    resetDailyCounters() {
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
            logger_1.tradingLogger.risk('DAILY_RESET', { date: today });
        }
    }
    loadDailyPnL() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const startOfDay = new Date(today).getTime();
            const endOfDay = startOfDay + (24 * 60 * 60 * 1000) - 1;
            const trades = database_1.db.getTrades(undefined, 1000);
            const todayTrades = trades.filter(trade => {
                const tradeTime = new Date(trade.timestamp).getTime();
                return tradeTime >= startOfDay && tradeTime <= endOfDay && trade.status === 'FILLED';
            });
            let totalPnL = 0;
            let totalTrades = 0;
            let winningTrades = 0;
            let losingTrades = 0;
            const symbolTrades = {};
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
                }
                else if (positionPnL < 0) {
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
            logger_1.tradingLogger.risk('DAILY_PNL_LOADED', this.dailyPnL);
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Failed to load daily P&L'), { action: 'loadDailyPnL' });
        }
    }
    calculatePositionPnL(trades) {
        if (trades.length < 2)
            return 0;
        let totalPnL = 0;
        let runningQuantity = 0;
        let weightedCost = 0;
        trades.forEach(trade => {
            if (trade.side === 'BUY') {
                const newQuantity = runningQuantity + trade.quantity;
                weightedCost = ((weightedCost * runningQuantity) + (trade.price * trade.quantity)) / newQuantity;
                runningQuantity = newQuantity;
            }
            else if (trade.side === 'SELL') {
                if (runningQuantity > 0) {
                    const soldQuantity = Math.min(trade.quantity, runningQuantity);
                    totalPnL += (trade.price - weightedCost) * soldQuantity;
                    runningQuantity -= soldQuantity;
                }
            }
        });
        return totalPnL;
    }
    async validateTradeSize(symbol, side, currentPrice, stopLossPrice, portfolioValue) {
        try {
            const currentPortfolioValue = portfolioValue || await this.getPortfolioValue();
            const riskAmount = currentPortfolioValue * (config_1.tradingConfig.riskPerTradePercentage / 100);
            let stopLossDistance;
            if (stopLossPrice) {
                stopLossDistance = Math.abs(currentPrice - stopLossPrice) / currentPrice;
            }
            else {
                stopLossDistance = config_1.tradingConfig.defaultStopLossPercentage / 100;
            }
            const stopLossAmount = currentPrice * stopLossDistance;
            const quantity = riskAmount / stopLossDistance / currentPrice;
            const calculatedStopLoss = side === 'BUY'
                ? currentPrice * (1 - stopLossDistance)
                : currentPrice * (1 + stopLossDistance);
            const takeProfitDistance = stopLossDistance * 2;
            const calculatedTakeProfit = side === 'BUY'
                ? currentPrice * (1 + takeProfitDistance)
                : currentPrice * (1 - takeProfitDistance);
            const positionSize = {
                quantity,
                riskAmount,
                stopLossPrice: calculatedStopLoss,
                takeProfitPrice: calculatedTakeProfit,
            };
            logger_1.tradingLogger.risk('POSITION_SIZE_VALIDATED', {
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
        }
        catch (error) {
            throw new types_1.RiskError(`Failed to validate trade size: ${error instanceof Error ? error.message : 'Unknown error'}`, 'POSITION_SIZE', error);
        }
    }
    async validateDailyLossLimit(tradePnL) {
        try {
            this.resetDailyCounters();
            if (!this.dailyPnL) {
                return true;
            }
            const simulatedDailyPnL = this.dailyPnL.totalPnL + (tradePnL || 0);
            const portfolioValue = await this.getPortfolioValue();
            const maxDailyLossAmount = portfolioValue * (config_1.tradingConfig.maxDailyLossPercentage / 100);
            const isWithinLimit = simulatedDailyPnL >= -maxDailyLossAmount;
            if (!isWithinLimit) {
                logger_1.tradingLogger.risk('DAILY_LOSS_LIMIT_EXCEEDED', {
                    currentDailyPnL: this.dailyPnL.totalPnL,
                    simulatedPnL: simulatedDailyPnL,
                    maxDailyLossAmount,
                    portfolioValue,
                    limitPercentage: config_1.tradingConfig.maxDailyLossPercentage,
                });
                if (simulatedDailyPnL < -maxDailyLossAmount) {
                    this.emergencyStop = true;
                    logger_1.tradingLogger.risk('EMERGENCY_STOP_ACTIVATED', {
                        reason: 'Daily loss limit exceeded',
                        dailyPnL: simulatedDailyPnL,
                        limit: maxDailyLossAmount,
                    });
                }
            }
            return isWithinLimit;
        }
        catch (error) {
            throw new types_1.RiskError(`Failed to validate daily loss limit: ${error instanceof Error ? error.message : 'Unknown error'}`, 'DAILY_LOSS', error);
        }
    }
    async validateMaxPositions() {
        try {
            const openPositions = database_1.db.getOpenPositions();
            const isWithinLimit = openPositions.length < config_1.tradingConfig.maxConcurrentPositions;
            if (!isWithinLimit) {
                logger_1.tradingLogger.risk('MAX_POSITIONS_EXCEEDED', {
                    currentPositions: openPositions.length,
                    maxPositions: config_1.tradingConfig.maxConcurrentPositions,
                    positions: openPositions.map(p => ({ symbol: p.symbol, quantity: p.quantity })),
                });
            }
            return isWithinLimit;
        }
        catch (error) {
            throw new types_1.RiskError(`Failed to validate max positions: ${error instanceof Error ? error.message : 'Unknown error'}`, 'MAX_POSITIONS', error);
        }
    }
    async validateTradeExecution(symbol, side, quantity, currentPrice, stopLossPrice) {
        try {
            const dailyLossValid = await this.validateDailyLossLimit();
            const maxPositionsValid = await this.validateMaxPositions();
            const emergencyStopClear = !this.emergencyStop;
            const minTradeAmountValid = (quantity * currentPrice) >= config_1.tradingConfig.minTradeAmountUSD;
            const existingPosition = database_1.db.getPositionBySymbol(symbol);
            const existingPositionValid = !existingPosition || existingPosition.status === 'CLOSED';
            const allValid = dailyLossValid &&
                maxPositionsValid &&
                emergencyStopClear &&
                minTradeAmountValid &&
                existingPositionValid;
            if (!allValid) {
                logger_1.tradingLogger.risk('TRADE_EXECUTION_BLOCKED', {
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
                    minTradeRequired: config_1.tradingConfig.minTradeAmountUSD,
                });
            }
            return allValid;
        }
        catch (error) {
            throw new types_1.RiskError(`Failed to validate trade execution: ${error instanceof Error ? error.message : 'Unknown error'}`, 'VOLATILITY', error);
        }
    }
    async getPortfolioValue() {
        try {
            return 1000;
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Failed to get portfolio value'), { action: 'getPortfolioValue' });
            return 1000;
        }
    }
    async getRiskMetrics() {
        try {
            const portfolioValue = await this.getPortfolioValue();
            const openPositions = database_1.db.getOpenPositions();
            const availableBalance = portfolioValue * 0.1;
            const totalUnrealizedPnL = openPositions.reduce((total, position) => total + position.unrealized_pnl, 0);
            const dailyPnL = this.dailyPnL?.totalPnL || 0;
            return {
                portfolioValue,
                availableBalance,
                totalPnL: totalUnrealizedPnL,
                dailyPnL,
                openPositions: openPositions.length,
                riskPerTrade: portfolioValue * (config_1.tradingConfig.riskPerTradePercentage / 100),
                maxDailyLoss: portfolioValue * (config_1.tradingConfig.maxDailyLossPercentage / 100),
                currentDailyLoss: Math.max(0, -dailyPnL),
            };
        }
        catch (error) {
            throw new Error(`Failed to get risk metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    enableEmergencyStop(reason) {
        this.emergencyStop = true;
        logger_1.tradingLogger.risk('EMERGENCY_STOP_MANUAL', { reason });
    }
    disableEmergencyStop() {
        this.emergencyStop = false;
        logger_1.tradingLogger.risk('EMERGENCY_STOP_DISABLED', {});
    }
    isEmergencyStopActive() {
        return this.emergencyStop;
    }
    updateDailyPnL(trade) {
        this.resetDailyCounters();
        if (this.dailyPnL) {
            this.dailyPnL.totalTrades++;
            logger_1.tradingLogger.risk('DAILY_PNL_UPDATED', {
                totalTrades: this.dailyPnL.totalTrades,
                totalPnL: this.dailyPnL.totalPnL,
            });
        }
    }
    calculateDynamicStopLoss(currentPrice, volatility, side) {
        try {
            const baseStopDistance = config_1.tradingConfig.defaultStopLossPercentage / 100;
            const volatilityMultiplier = Math.max(1, volatility / 2);
            const adjustedStopDistance = baseStopDistance * volatilityMultiplier;
            const stopLossPrice = side === 'BUY'
                ? currentPrice * (1 - adjustedStopDistance)
                : currentPrice * (1 + adjustedStopDistance);
            logger_1.tradingLogger.risk('DYNAMIC_STOP_LOSS', {
                currentPrice,
                volatility,
                side,
                baseStopDistance,
                volatilityMultiplier,
                adjustedStopDistance,
                stopLossPrice,
            });
            return stopLossPrice;
        }
        catch (error) {
            const defaultStopPrice = side === 'BUY'
                ? currentPrice * (1 - config_1.tradingConfig.defaultStopLossPercentage / 100)
                : currentPrice * (1 + config_1.tradingConfig.defaultStopLossPercentage / 100);
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Failed to calculate dynamic stop loss'), {
                currentPrice,
                volatility,
                side,
                fallbackStopPrice: defaultStopPrice,
            });
            return defaultStopPrice;
        }
    }
    async calculateVolatility(symbol, periodMinutes = 60) {
        try {
            const endTime = Date.now();
            const startTime = endTime - (periodMinutes * 60 * 1000);
            const historicalData = database_1.db.getHistoricalData(symbol, 'binance', startTime, endTime);
            if (historicalData.length < 2) {
                return 0.02;
            }
            const priceChanges = [];
            for (let i = 1; i < historicalData.length; i++) {
                const previousPrice = historicalData[i - 1].price;
                const currentPrice = historicalData[i].price;
                const priceChange = (currentPrice - previousPrice) / previousPrice;
                priceChanges.push(priceChange);
            }
            const mean = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
            const variance = priceChanges.reduce((sum, change) => sum + Math.pow(change - mean, 2), 0) / priceChanges.length;
            const standardDeviation = Math.sqrt(variance);
            return standardDeviation * Math.sqrt(365 * 24 * 60);
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Failed to calculate volatility'), { symbol, periodMinutes });
            return 0.02;
        }
    }
}
exports.RiskService = RiskService;
exports.default = RiskService;
//# sourceMappingURL=risk.service.js.map