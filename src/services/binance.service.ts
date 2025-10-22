import Binance from 'binance-api-node';
import { exchangeConfig } from '@/config';
import { logger, tradingLogger, logError } from '@/utils/logger';
import { OrderRequest, OrderResponse, BinanceTicker, ExchangeError } from '@/types';
import WebSocket from 'ws';
import * as BinanceTypes from 'binance-api-node';

interface BinanceWebSocket {
  [symbol: string]: WebSocket;
}

export class BinanceService {
  private client: BinanceTypes.Binance;
  private webSockets: BinanceWebSocket = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;

  constructor() {
    this.client = Binance({
      apiKey: exchangeConfig.binance.apiKey,
      apiSecret: exchangeConfig.binance.apiSecret,
    });
  }

  // Connection management
  async testConnection(): Promise<boolean> {
    try {
      const startTime = Date.now();
      const serverTime = await this.client.time();
      const responseTime = Date.now() - startTime;

      tradingLogger.apiCall('binance', 'time', true, responseTime);

      // Check if server time is recent (within 1 minute)
      const timeDiff = Date.now() - serverTime;
      if (Math.abs(timeDiff) > 60000) {
        throw new Error('Server time difference too large');
      }

      logger.info('Binance connection test successful', {
        serverTime: serverTime,
        timeDiff,
        responseTime,
      });

      return true;
    } catch (error) {
      tradingLogger.apiCall('binance', 'time', false, undefined, error instanceof Error ? error.message : 'Unknown error');
      logError(error instanceof Error ? error : new Error('Unknown connection error'), { action: 'testConnection' });
      return false;
    }
  }

  // Account information
  async getAccountInfo(): Promise<any> {
    try {
      const startTime = Date.now();
      const accountInfo = await this.client.accountInfo();
      const responseTime = Date.now() - startTime;

      tradingLogger.apiCall('binance', 'accountInfo', true, responseTime);

      return {
        balances: accountInfo.balances,
        permissions: accountInfo.permissions,
        accountType: accountInfo.accountType,
        canTrade: accountInfo.canTrade,
        canWithdraw: accountInfo.canWithdraw,
        canDeposit: accountInfo.canDeposit,
        updateTime: accountInfo.updateTime,
      };
    } catch (error) {
      tradingLogger.apiCall('binance', 'accountInfo', false, undefined, error instanceof Error ? error.message : 'Unknown error');
      throw new ExchangeError(
        `Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'binance',
        'ACCOUNT_INFO_ERROR',
        error
      );
    }
  }

  async getBalance(asset: string = 'USDT'): Promise<number> {
    try {
      const accountInfo = await this.getAccountInfo();
      const balance = accountInfo.balances.find((b: any) => b.asset === asset);

      if (!balance) {
        throw new Error(`Balance for ${asset} not found`);
      }

      return parseFloat(balance.free);
    } catch (error) {
      throw new ExchangeError(
        `Failed to get balance for ${asset}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'binance',
        'BALANCE_ERROR',
        error
      );
    }
  }

  // Market data
  async getTicker(symbol: string): Promise<BinanceTicker> {
    try {
      const startTime = Date.now();
      const ticker = await this.client.prices({ symbol });
      const responseTime = Date.now() - startTime;

      tradingLogger.apiCall('binance', 'prices', true, responseTime);

      if (!ticker[symbol]) {
        throw new Error(`No price data for ${symbol}`);
      }

      const price = parseFloat(ticker[symbol]);

      // Get 24hr ticker stats for additional data
      const stats24h = await this.client.dailyStats({ symbol });
      const statsData = Array.isArray(stats24h) ? stats24h[0] : stats24h;

      const tickerData: BinanceTicker = {
        symbol,
        price: ticker[symbol],
        volume: statsData?.volume || '0',
        high24h: statsData?.highPrice || '0',
        low24h: statsData?.lowPrice || '0',
        change24h: statsData?.priceChange || '0',
      };

      tradingLogger.marketData(symbol, price, parseFloat(statsData?.volume || '0'), parseFloat(statsData?.priceChange || '0'));

      return tickerData;
    } catch (error) {
      tradingLogger.apiCall('binance', 'ticker', false, undefined, error instanceof Error ? error.message : 'Unknown error');
      throw new ExchangeError(
        `Failed to get ticker for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'binance',
        'TICKER_ERROR',
        error
      );
    }
  }

  async get24hrStats(symbol: string): Promise<any> {
    try {
      const startTime = Date.now();
      const stats = await this.client.dailyStats({ symbol });
      const responseTime = Date.now() - startTime;

      tradingLogger.apiCall('binance', 'dailyStats', true, responseTime);

      // Handle case where stats can be an array
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
    } catch (error) {
      tradingLogger.apiCall('binance', 'dailyStats', false, undefined, error instanceof Error ? error.message : 'Unknown error');
      throw new ExchangeError(
        `Failed to get 24hr stats for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'binance',
        'STATS_ERROR',
        error
      );
    }
  }

  // Order management
  async createOrder(orderRequest: OrderRequest): Promise<OrderResponse> {
    try {
      const startTime = Date.now();

      // Validate order request
      this.validateOrderRequest(orderRequest);

      let orderParams: any = {
        symbol: orderRequest.symbol,
        side: orderRequest.side,
        type: orderRequest.type,
      };

      // Add quantity or quoteOrderQty based on order type
      if (orderRequest.quantity) {
        orderParams.quantity = orderRequest.quantity.toString();
      } else if (orderRequest.quoteOrderQty) {
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

      tradingLogger.apiCall('binance', 'order', true, responseTime);

      // Log the trade
      tradingLogger.trade(
        order.symbol,
        order.side as 'BUY' | 'SELL',
        parseFloat(order.executedQty),
        parseFloat(order.price || '0'),
        order.orderId.toString()
      );

      return {
        orderId: order.orderId.toString(),
        symbol: order.symbol,
        status: order.status as OrderResponse['status'],
        side: order.side as 'BUY' | 'SELL',
        type: order.type as 'MARKET' | 'LIMIT',
        quantity: order.origQty,
        price: order.price || '0',
        executedQty: order.executedQty,
        cummulativeQuoteQty: order.cummulativeQuoteQty || '0',
        transactTime: order.transactTime || Date.now(),
        fills: order.fills?.map((fill: any) => ({
          price: fill.price,
          qty: fill.qty,
          commission: fill.commission,
          commissionAsset: fill.commissionAsset,
        })),
      };
    } catch (error) {
      tradingLogger.apiCall('binance', 'order', false, undefined, error instanceof Error ? error.message : 'Unknown error');
      throw new ExchangeError(
        `Failed to create order: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'binance',
        'ORDER_ERROR',
        error
      );
    }
  }

  async cancelOrder(symbol: string, orderId: string): Promise<any> {
    try {
      const startTime = Date.now();
      const result = await this.client.cancelOrder({ symbol, orderId: parseInt(orderId) });
      const responseTime = Date.now() - startTime;

      tradingLogger.apiCall('binance', 'cancelOrder', true, responseTime);

      return result;
    } catch (error) {
      tradingLogger.apiCall('binance', 'cancelOrder', false, undefined, error instanceof Error ? error.message : 'Unknown error');
      throw new ExchangeError(
        `Failed to cancel order: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'binance',
        'CANCEL_ORDER_ERROR',
        error
      );
    }
  }

  async getOrderStatus(symbol: string, orderId: string): Promise<any> {
    try {
      const startTime = Date.now();
      const order = await this.client.getOrder({ symbol, orderId: parseInt(orderId) });
      const responseTime = Date.now() - startTime;

      tradingLogger.apiCall('binance', 'getOrder', true, responseTime);

      return order;
    } catch (error) {
      tradingLogger.apiCall('binance', 'getOrder', false, undefined, error instanceof Error ? error.message : 'Unknown error');
      throw new ExchangeError(
        `Failed to get order status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'binance',
        'GET_ORDER_ERROR',
        error
      );
    }
  }

  async getOpenOrders(symbol?: string): Promise<any[]> {
    try {
      const startTime = Date.now();
      const orders = symbol
        ? await this.client.openOrders({ symbol })
        : await this.client.openOrders({});
      const responseTime = Date.now() - startTime;

      tradingLogger.apiCall('binance', 'openOrders', true, responseTime);

      return orders;
    } catch (error) {
      tradingLogger.apiCall('binance', 'openOrders', false, undefined, error instanceof Error ? error.message : 'Unknown error');
      throw new ExchangeError(
        `Failed to get open orders: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'binance',
        'OPEN_ORDERS_ERROR',
        error
      );
    }
  }

  // WebSocket streaming
  startPriceWebSocket(symbols: string[], callback: (symbol: string, price: number) => void): void {
    symbols.forEach(symbol => {
      if (this.webSockets[symbol]) {
        this.webSockets[symbol].close();
      }

      try {
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`);

        ws.on('open', () => {
          logger.info(`WebSocket connection opened for ${symbol}`);
          this.reconnectAttempts = 0;
        });

        ws.on('message', (data: WebSocket.Data) => {
          try {
            const trade = JSON.parse(data.toString());
            callback(trade.s, parseFloat(trade.p));
          } catch (error) {
            logError(error instanceof Error ? error : new Error('WebSocket parse error'), { symbol, data: data.toString() });
          }
        });

        ws.on('close', () => {
          logger.warn(`WebSocket connection closed for ${symbol}`);
          delete this.webSockets[symbol];
          this.reconnectWebSocket(symbol, callback);
        });

        ws.on('error', (error) => {
          logError(error, { symbol, action: 'websocket_error' });
        });

        this.webSockets[symbol] = ws;
      } catch (error) {
        logError(error instanceof Error ? error : new Error('WebSocket creation error'), { symbol });
      }
    });
  }

  private reconnectWebSocket(symbol: string, callback: (symbol: string, price: number) => void): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Max reconnection attempts reached for ${symbol}`);
      return;
    }

    this.reconnectAttempts++;
    logger.info(`Reconnecting WebSocket for ${symbol} (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.startPriceWebSocket([symbol], callback);
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  stopPriceWebSocket(symbol: string): void {
    if (this.webSockets[symbol]) {
      this.webSockets[symbol].close();
      delete this.webSockets[symbol];
    }
  }

  stopAllWebSockets(): void {
    Object.keys(this.webSockets).forEach(symbol => {
      this.stopPriceWebSocket(symbol);
    });
  }

  // Utility methods
  private validateOrderRequest(orderRequest: OrderRequest): void {
    if (!orderRequest.symbol) {
      throw new ExchangeError('Symbol is required', 'binance', 'VALIDATION_ERROR');
    }

    if (!orderRequest.side) {
      throw new ExchangeError('Side is required', 'binance', 'VALIDATION_ERROR');
    }

    if (!orderRequest.type) {
      throw new ExchangeError('Type is required', 'binance', 'VALIDATION_ERROR');
    }

    if (orderRequest.type === 'LIMIT' && !orderRequest.price) {
      throw new ExchangeError('Price is required for limit orders', 'binance', 'VALIDATION_ERROR');
    }

    if (!orderRequest.quantity && !orderRequest.quoteOrderQty) {
      throw new ExchangeError('Quantity or quoteOrderQty is required', 'binance', 'VALIDATION_ERROR');
    }
  }

  // Get symbol info for validation
  async getSymbolInfo(symbol: string): Promise<any> {
    try {
      const exchangeInfo = await this.client.exchangeInfo();
      const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);

      if (!symbolInfo) {
        throw new Error(`Symbol ${symbol} not found`);
      }

      return symbolInfo;
    } catch (error) {
      throw new ExchangeError(
        `Failed to get symbol info for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'binance',
        'SYMBOL_INFO_ERROR',
        error
      );
    }
  }

  // Format quantity according to exchange rules
  formatQuantity(symbol: string, quantity: number): number {
    // This would normally use the symbol info from exchange
    // For now, return the quantity as-is (to be enhanced)
    return quantity;
  }

  // Format price according to exchange rules
  formatPrice(symbol: string, price: number): number {
    // This would normally use the symbol info from exchange
    // For now, return the price as-is (to be enhanced)
    return price;
  }
}

export default BinanceService;