"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceService = void 0;
const binance_api_node_1 = __importDefault(require("binance-api-node"));
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
const types_1 = require("@/types");
const ws_1 = __importDefault(require("ws"));
class BinanceService {
    constructor() {
        this.webSockets = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.client = (0, binance_api_node_1.default)({
            apiKey: config_1.exchangeConfig.binance.apiKey,
            apiSecret: config_1.exchangeConfig.binance.apiSecret,
        });
    }
    async testConnection() {
        try {
            const startTime = Date.now();
            const serverTime = await this.client.time();
            const responseTime = Date.now() - startTime;
            logger_1.tradingLogger.apiCall('binance', 'time', true, responseTime);
            const timeDiff = Date.now() - serverTime;
            if (Math.abs(timeDiff) > 60000) {
                throw new Error('Server time difference too large');
            }
            logger_1.logger.info('Binance connection test successful', {
                serverTime: serverTime,
                timeDiff,
                responseTime,
            });
            return true;
        }
        catch (error) {
            logger_1.tradingLogger.apiCall('binance', 'time', false, undefined, error instanceof Error ? error.message : 'Unknown error');
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Unknown connection error'), { action: 'testConnection' });
            return false;
        }
    }
    async getAccountInfo() {
        try {
            const startTime = Date.now();
            const accountInfo = await this.client.accountInfo();
            const responseTime = Date.now() - startTime;
            logger_1.tradingLogger.apiCall('binance', 'accountInfo', true, responseTime);
            return {
                balances: accountInfo.balances,
                permissions: accountInfo.permissions,
                accountType: accountInfo.accountType,
                canTrade: accountInfo.canTrade,
                canWithdraw: accountInfo.canWithdraw,
                canDeposit: accountInfo.canDeposit,
                updateTime: accountInfo.updateTime,
            };
        }
        catch (error) {
            logger_1.tradingLogger.apiCall('binance', 'accountInfo', false, undefined, error instanceof Error ? error.message : 'Unknown error');
            throw new types_1.ExchangeError(`Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`, 'binance', 'ACCOUNT_INFO_ERROR', error);
        }
    }
    async getBalance(asset = 'USDT') {
        try {
            const accountInfo = await this.getAccountInfo();
            const balance = accountInfo.balances.find((b) => b.asset === asset);
            if (!balance) {
                throw new Error(`Balance for ${asset} not found`);
            }
            return parseFloat(balance.free);
        }
        catch (error) {
            throw new types_1.ExchangeError(`Failed to get balance for ${asset}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'binance', 'BALANCE_ERROR', error);
        }
    }
    async getTicker(symbol) {
        try {
            const startTime = Date.now();
            const ticker = await this.client.prices({ symbol });
            const responseTime = Date.now() - startTime;
            logger_1.tradingLogger.apiCall('binance', 'prices', true, responseTime);
            if (!ticker[symbol]) {
                throw new Error(`No price data for ${symbol}`);
            }
            const price = parseFloat(ticker[symbol]);
            const stats24h = await this.client.dailyStats({ symbol });
            const statsData = Array.isArray(stats24h) ? stats24h[0] : stats24h;
            const tickerData = {
                symbol,
                price: ticker[symbol],
                volume: statsData?.volume || '0',
                high24h: statsData?.highPrice || '0',
                low24h: statsData?.lowPrice || '0',
                change24h: statsData?.priceChange || '0',
            };
            logger_1.tradingLogger.marketData(symbol, price, parseFloat(statsData?.volume || '0'), parseFloat(statsData?.priceChange || '0'));
            return tickerData;
        }
        catch (error) {
            logger_1.tradingLogger.apiCall('binance', 'ticker', false, undefined, error instanceof Error ? error.message : 'Unknown error');
            throw new types_1.ExchangeError(`Failed to get ticker for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'binance', 'TICKER_ERROR', error);
        }
    }
    async get24hrStats(symbol) {
        try {
            const startTime = Date.now();
            const stats = await this.client.dailyStats({ symbol });
            const responseTime = Date.now() - startTime;
            logger_1.tradingLogger.apiCall('binance', 'dailyStats', true, responseTime);
            const statsData = Array.isArray(stats) ? stats[0] : stats;
            if (!statsData) {
                throw new Error('No stats data returned');
            }
            return {
                symbol: statsData.symbol,
                priceChange: parseFloat(statsData.priceChange || '0'),
                priceChangePercent: parseFloat(statsData.priceChangePercent || '0'),
                weightedAvgPrice: parseFloat(statsData.weightedAvgPrice || '0'),
                prevClosePrice: parseFloat(statsData.prevClosePrice || '0'),
                lastPrice: parseFloat(statsData.lastPrice || '0'),
                lastQty: parseFloat(statsData.lastQty || '0'),
                bidPrice: parseFloat(statsData.bidPrice || '0'),
                bidQty: parseFloat(statsData.bidQty || '0'),
                askPrice: parseFloat(statsData.askPrice || '0'),
                askQty: parseFloat(statsData.askQty || '0'),
                openPrice: parseFloat(statsData.openPrice || '0'),
                highPrice: parseFloat(statsData.highPrice || '0'),
                lowPrice: parseFloat(statsData.lowPrice || '0'),
                volume: parseFloat(statsData.volume || '0'),
                quoteVolume: parseFloat(statsData.quoteVolume || '0'),
                openTime: statsData.openTime,
                closeTime: statsData.closeTime,
                count: statsData.count || 0,
            };
        }
        catch (error) {
            logger_1.tradingLogger.apiCall('binance', 'dailyStats', false, undefined, error instanceof Error ? error.message : 'Unknown error');
            throw new types_1.ExchangeError(`Failed to get 24hr stats for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'binance', 'STATS_ERROR', error);
        }
    }
    async createOrder(orderRequest) {
        try {
            const startTime = Date.now();
            this.validateOrderRequest(orderRequest);
            let orderParams = {
                symbol: orderRequest.symbol,
                side: orderRequest.side,
                type: orderRequest.type,
            };
            if (orderRequest.quantity) {
                orderParams.quantity = orderRequest.quantity.toString();
            }
            else if (orderRequest.quoteOrderQty) {
                orderParams.quoteOrderQty = orderRequest.quoteOrderQty.toString();
            }
            if (orderRequest.price && orderRequest.type === 'LIMIT') {
                orderParams.price = orderRequest.price.toString();
            }
            if (orderRequest.timeInForce) {
                orderParams.timeInForce = orderRequest.timeInForce;
            }
            const order = await this.client.order(orderParams);
            const responseTime = Date.now() - startTime;
            logger_1.tradingLogger.apiCall('binance', 'order', true, responseTime);
            logger_1.tradingLogger.trade(order.symbol, order.side, parseFloat(order.executedQty), parseFloat(order.price || '0'), order.orderId.toString());
            return {
                orderId: order.orderId.toString(),
                symbol: order.symbol,
                status: order.status,
                side: order.side,
                type: order.type,
                quantity: order.origQty,
                price: order.price || '0',
                executedQty: order.executedQty,
                cummulativeQuoteQty: order.cummulativeQuoteQty || '0',
                transactTime: order.transactTime || Date.now(),
                fills: order.fills?.map((fill) => ({
                    price: fill.price,
                    qty: fill.qty,
                    commission: fill.commission,
                    commissionAsset: fill.commissionAsset,
                })),
            };
        }
        catch (error) {
            logger_1.tradingLogger.apiCall('binance', 'order', false, undefined, error instanceof Error ? error.message : 'Unknown error');
            throw new types_1.ExchangeError(`Failed to create order: ${error instanceof Error ? error.message : 'Unknown error'}`, 'binance', 'ORDER_ERROR', error);
        }
    }
    async cancelOrder(symbol, orderId) {
        try {
            const startTime = Date.now();
            const result = await this.client.cancelOrder({ symbol, orderId: parseInt(orderId) });
            const responseTime = Date.now() - startTime;
            logger_1.tradingLogger.apiCall('binance', 'cancelOrder', true, responseTime);
            return result;
        }
        catch (error) {
            logger_1.tradingLogger.apiCall('binance', 'cancelOrder', false, undefined, error instanceof Error ? error.message : 'Unknown error');
            throw new types_1.ExchangeError(`Failed to cancel order: ${error instanceof Error ? error.message : 'Unknown error'}`, 'binance', 'CANCEL_ORDER_ERROR', error);
        }
    }
    async getOrderStatus(symbol, orderId) {
        try {
            const startTime = Date.now();
            const order = await this.client.getOrder({ symbol, orderId: parseInt(orderId) });
            const responseTime = Date.now() - startTime;
            logger_1.tradingLogger.apiCall('binance', 'getOrder', true, responseTime);
            return order;
        }
        catch (error) {
            logger_1.tradingLogger.apiCall('binance', 'getOrder', false, undefined, error instanceof Error ? error.message : 'Unknown error');
            throw new types_1.ExchangeError(`Failed to get order status: ${error instanceof Error ? error.message : 'Unknown error'}`, 'binance', 'GET_ORDER_ERROR', error);
        }
    }
    async getOpenOrders(symbol) {
        try {
            const startTime = Date.now();
            const orders = symbol
                ? await this.client.openOrders({ symbol })
                : await this.client.openOrders({});
            const responseTime = Date.now() - startTime;
            logger_1.tradingLogger.apiCall('binance', 'openOrders', true, responseTime);
            return orders;
        }
        catch (error) {
            logger_1.tradingLogger.apiCall('binance', 'openOrders', false, undefined, error instanceof Error ? error.message : 'Unknown error');
            throw new types_1.ExchangeError(`Failed to get open orders: ${error instanceof Error ? error.message : 'Unknown error'}`, 'binance', 'OPEN_ORDERS_ERROR', error);
        }
    }
    startPriceWebSocket(symbols, callback) {
        symbols.forEach(symbol => {
            if (this.webSockets[symbol]) {
                this.webSockets[symbol].close();
            }
            try {
                const ws = new ws_1.default(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`);
                ws.on('open', () => {
                    logger_1.logger.info(`WebSocket connection opened for ${symbol}`);
                    this.reconnectAttempts = 0;
                });
                ws.on('message', (data) => {
                    try {
                        const trade = JSON.parse(data.toString());
                        callback(trade.s, parseFloat(trade.p));
                    }
                    catch (error) {
                        (0, logger_1.logError)(error instanceof Error ? error : new Error('WebSocket parse error'), { symbol, data: data.toString() });
                    }
                });
                ws.on('close', () => {
                    logger_1.logger.warn(`WebSocket connection closed for ${symbol}`);
                    delete this.webSockets[symbol];
                    this.reconnectWebSocket(symbol, callback);
                });
                ws.on('error', (error) => {
                    (0, logger_1.logError)(error, { symbol, action: 'websocket_error' });
                });
                this.webSockets[symbol] = ws;
            }
            catch (error) {
                (0, logger_1.logError)(error instanceof Error ? error : new Error('WebSocket creation error'), { symbol });
            }
        });
    }
    reconnectWebSocket(symbol, callback) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger_1.logger.error(`Max reconnection attempts reached for ${symbol}`);
            return;
        }
        this.reconnectAttempts++;
        logger_1.logger.info(`Reconnecting WebSocket for ${symbol} (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => {
            this.startPriceWebSocket([symbol], callback);
        }, this.reconnectDelay * this.reconnectAttempts);
    }
    stopPriceWebSocket(symbol) {
        if (this.webSockets[symbol]) {
            this.webSockets[symbol].close();
            delete this.webSockets[symbol];
        }
    }
    stopAllWebSockets() {
        Object.keys(this.webSockets).forEach(symbol => {
            this.stopPriceWebSocket(symbol);
        });
    }
    validateOrderRequest(orderRequest) {
        if (!orderRequest.symbol) {
            throw new types_1.ExchangeError('Symbol is required', 'binance', 'VALIDATION_ERROR');
        }
        if (!orderRequest.side) {
            throw new types_1.ExchangeError('Side is required', 'binance', 'VALIDATION_ERROR');
        }
        if (!orderRequest.type) {
            throw new types_1.ExchangeError('Type is required', 'binance', 'VALIDATION_ERROR');
        }
        if (orderRequest.type === 'LIMIT' && !orderRequest.price) {
            throw new types_1.ExchangeError('Price is required for limit orders', 'binance', 'VALIDATION_ERROR');
        }
        if (!orderRequest.quantity && !orderRequest.quoteOrderQty) {
            throw new types_1.ExchangeError('Quantity or quoteOrderQty is required', 'binance', 'VALIDATION_ERROR');
        }
    }
    async getSymbolInfo(symbol) {
        try {
            const exchangeInfo = await this.client.exchangeInfo();
            const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
            if (!symbolInfo) {
                throw new Error(`Symbol ${symbol} not found`);
            }
            return symbolInfo;
        }
        catch (error) {
            throw new types_1.ExchangeError(`Failed to get symbol info for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'binance', 'SYMBOL_INFO_ERROR', error);
        }
    }
    formatQuantity(symbol, quantity) {
        return quantity;
    }
    formatPrice(symbol, price) {
        return price;
    }
}
exports.BinanceService = BinanceService;
exports.default = BinanceService;
//# sourceMappingURL=binance.service.js.map