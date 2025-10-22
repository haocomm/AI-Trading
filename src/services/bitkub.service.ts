/**
 * Bitkub API Service
 *
 * Complete integration with Bitkub exchange for Thai market access.
 * Supports all major trading functions with Thai market-specific features
 * and regulatory compliance requirements.
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import crypto from 'crypto';
import { exchangeConfig } from '@/config';
import { logger, tradingLogger, logError } from '@/utils/logger';
import { OrderRequest, OrderResponse, ExchangeError } from '@/types';
import WebSocket from 'ws';

// Bitkub API Types
export interface BitkubTicker {
  id: string;
  last: number;
  lowestAsk: number;
  highestBid: number;
  percentChange: number;
  baseVolume: number;
  quoteVolume: number;
  isFrozen: string;
  high24hr: number;
  low24hr: number;
}

export interface BitkubBalance {
  THB: {
    available: number;
    reserved: number;
  };
  [symbol: string]: {
    available: number;
    reserved: number;
  };
}

export interface BitkubOrder {
  id: number;
  hash: string;
  type: string; // 'buy' | 'sell'
  rate: number;
  amount: number;
  fee: number;
  recv: number;
  src: string;
  dst: string;
  status: string; // 'pending', 'filled', 'cancelled'
  created_at: string;
  updated_at: string;
}

export interface BitkubMarketSymbol {
  id: string;
  info: string;
  symbol: string;
  primary: string;
  secondary: string;
  active: boolean;
  last: number;
  change: number;
  volume: number;
  volumePercent: number;
  high: number;
  low: number;
  current: number;
  baseVolume: number;
  quoteVolume: number;
  state: string;
  orderTypes: string[];
  fees: {
    maker: number;
    taker: number;
  };
}

export interface BitkubServerTime {
  serverTime: number;
}

export interface BitkubUserTradingCredits {
  user_id: number;
  limit: number;
  remaining: number;
  used: number;
  limit_btc: number;
  remaining_btc: number;
  used_btc: number;
}

interface BitkubWebSocket {
  [symbol: string]: WebSocket;
}

export class BitkubService {
  private client: AxiosInstance;
  private webSockets: BitkubWebSocket = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;
  private readonly baseUrl: string;
  private readonly apiVersion: string = 'v3';

  constructor() {
    // Bitkub API configuration
    this.baseUrl = exchangeConfig.bitkub?.sandbox
      ? 'https://api-sbx.bitkub.com'
      : 'https://api.bitkub.com';

    this.client = axios.create({
      baseURL: `${this.baseUrl}/api`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Request interceptor for authentication
    this.client.interceptors.request.use(
      (config) => {
        if (config.url?.includes('/market/') || config.url?.includes('/user/')) {
          this.signRequest(config);
        }
        return config;
      },
      (error) => {
        logError(error, { action: 'bitkub_request_interceptor' });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        const startTime = response.config.metadata?.startTime;
        const responseTime = startTime ? Date.now() - startTime : undefined;

        tradingLogger.apiCall(
          'bitkub',
          response.config.url || 'unknown',
          true,
          responseTime
        );

        return response;
      },
      (error) => {
        const startTime = error.config?.metadata?.startTime;
        const responseTime = startTime ? Date.now() - startTime : undefined;

        tradingLogger.apiCall(
          'bitkub',
          error.config?.url || 'unknown',
          false,
          responseTime,
          error.response?.data?.error?.message || error.message
        );

        // Convert to ExchangeError
        if (error.response?.data?.error) {
          throw new ExchangeError(
            error.response.data.error.message,
            error.response.data.error.code,
            error.response.status
          );
        }

        throw error;
      }
    );

    // Add metadata for response time tracking
    this.client.interceptors.request.use((config) => {
      config.metadata = { startTime: Date.now() };
      return config;
    });
  }

  /**
   * Test connection to Bitkub API
   */
  async testConnection(): Promise<boolean> {
    try {
      const startTime = Date.now();
      const response = await this.client.get<BitkubServerTime>('/api/v3/market/time');
      const responseTime = Date.now() - startTime;

      const serverTime = response.data.serverTime;
      const timeDiff = Date.now() - serverTime;

      // Check if server time is recent (within 1 minute)
      if (Math.abs(timeDiff) > 60000) {
        throw new Error('Server time difference too large');
      }

      logger.info('Bitkub connection test successful', {
        serverTime,
        timeDiff,
        responseTime,
      });

      return true;
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Unknown connection error'), {
        action: 'bitkub_testConnection',
      });
      return false;
    }
  }

  /**
   * Get market symbols
   */
  async getMarketSymbols(): Promise<BitkubMarketSymbol[]> {
    try {
      const response = await this.client.get<{ symbols: BitkubMarketSymbol[] }>('/market/symbols');
      return response.data.symbols;
    } catch (error) {
      throw this.handleApiError(error, 'getMarketSymbols');
    }
  }

  /**
   * Get ticker information for a symbol
   */
  async getTicker(symbol: string): Promise<BitkubTicker> {
    try {
      const response = await this.client.get<{ symbol: BitkubTicker }>(`/market/ticker?sym=${symbol}`);

      if (!response.data.symbol) {
        throw new ExchangeError(`Symbol ${symbol} not found`, 'SYMBOL_NOT_FOUND');
      }

      return response.data.symbol;
    } catch (error) {
      throw this.handleApiError(error, 'getTicker', { symbol });
    }
  }

  /**
   * Get tickers for all symbols
   */
  async getAllTickers(): Promise<BitkubTicker[]> {
    try {
      const response = await this.client.get<{ symbols: BitkubTicker[] }>('/market/ticker');
      return response.data.symbols;
    } catch (error) {
      throw this.handleApiError(error, 'getAllTickers');
    }
  }

  /**
   * Get order book
   */
  async getOrderBook(symbol: string, limit: number = 100): Promise<{
    bids: Array<[number, number]>;
    asks: Array<[number, number]>;
  }> {
    try {
      const response = await this.client.get(`/market/orders?sym=${symbol}&lmt=${limit}`);

      return {
        bids: response.data.result.bids.map((bid: any) => [parseFloat(bid[0]), parseFloat(bid[1])]),
        asks: response.data.result.asks.map((ask: any) => [parseFloat(ask[0]), parseFloat(ask[1])]),
      };
    } catch (error) {
      throw this.handleApiError(error, 'getOrderBook', { symbol, limit });
    }
  }

  /**
   * Get recent trades
   */
  async getRecentTrades(symbol: string, limit: number = 100): Promise<Array<{
    id: string;
    price: number;
    quantity: number;
    side: 'BUY' | 'SELL';
    timestamp: number;
  }>> {
    try {
      const response = await this.client.get(`/market/trades?sym=${symbol}&lmt=${limit}`);

      return response.data.result.map((trade: any) => ({
        id: trade[0],
        price: parseFloat(trade[1]),
        quantity: parseFloat(trade[2]),
        side: trade[3] as 'BUY' | 'SELL',
        timestamp: parseInt(trade[4]),
      }));
    } catch (error) {
      throw this.handleApiError(error, 'getRecentTrades', { symbol, limit });
    }
  }

  /**
   * Get user balance
   */
  async getBalance(): Promise<BitkubBalance> {
    try {
      const response = await this.client.post<{ result: BitkubBalance }>('/api/v3/market/balance', {});
      return response.data.result;
    } catch (error) {
      throw this.handleApiError(error, 'getBalance');
    }
  }

  /**
   * Get user trading credits (Thai market specific)
   */
  async getUserTradingCredits(): Promise<BitkubUserTradingCredits> {
    try {
      const response = await this.client.post<{ result: BitkubUserTradingCredits }>('/api/v3/market/trading-credits', {});
      return response.data.result;
    } catch (error) {
      throw this.handleApiError(error, 'getUserTradingCredits');
    }
  }

  /**
   * Place buy order
   */
  async placeBuyOrder(symbol: string, amount: number, rate: number, type: 'limit' | 'market' = 'limit'): Promise<OrderResponse> {
    try {
      const orderData = {
        sym: symbol,
        amt: amount.toString(),
        rat: rate.toString(),
        typ: type.toUpperCase(),
      };

      const response = await this.client.post<{ result: BitkubOrder }>('/market/place-bid', orderData);
      const order = response.data.result;

      return {
        orderId: order.id.toString(),
        symbol,
        status: this.mapBitkubStatus(order.status),
        side: 'BUY',
        type: type.toUpperCase() as 'MARKET' | 'LIMIT',
        quantity: order.amount.toString(),
        price: order.rate.toString(),
        executedQty: order.recv.toString(),
        cummulativeQuoteQty: (order.rate * order.recv).toString(),
        transactTime: new Date(order.created_at).getTime(),
        fills: [{
          price: order.rate.toString(),
          qty: order.recv.toString(),
          commission: order.fee.toString(),
          commissionAsset: this.getQuoteAsset(symbol),
        }],
      };
    } catch (error) {
      throw this.handleApiError(error, 'placeBuyOrder', { symbol, amount, rate, type });
    }
  }

  /**
   * Place sell order
   */
  async placeSellOrder(symbol: string, amount: number, rate: number, type: 'limit' | 'market' = 'limit'): Promise<OrderResponse> {
    try {
      const orderData = {
        sym: symbol,
        amt: amount.toString(),
        rat: rate.toString(),
        typ: type.toUpperCase(),
      };

      const response = await this.client.post<{ result: BitkubOrder }>('/market/place-ask', orderData);
      const order = response.data.result;

      return {
        orderId: order.id.toString(),
        symbol,
        status: this.mapBitkubStatus(order.status),
        side: 'SELL',
        type: type.toUpperCase() as 'MARKET' | 'LIMIT',
        quantity: order.amount.toString(),
        price: order.rate.toString(),
        executedQty: order.recv.toString(),
        cummulativeQuoteQty: (order.rate * order.recv).toString(),
        transactTime: new Date(order.created_at).getTime(),
        fills: [{
          price: order.rate.toString(),
          qty: order.recv.toString(),
          commission: order.fee.toString(),
          commissionAsset: this.getQuoteAsset(symbol),
        }],
      };
    } catch (error) {
      throw this.handleApiError(error, 'placeSellOrder', { symbol, amount, rate, type });
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(symbol: string, orderId: string | number): Promise<OrderResponse> {
    try {
      const response = await this.client.post<{ result: BitkubOrder }>('/market/cancel-order', {
        sym: symbol,
        id: orderId.toString(),
        hash: '', // Optional order hash
      });
      const order = response.data.result;

      return {
        orderId: order.id.toString(),
        symbol,
        status: this.mapBitkubStatus(order.status),
        side: order.type === 'buy' ? 'BUY' : 'SELL',
        type: 'LIMIT',
        quantity: order.amount.toString(),
        price: order.rate.toString(),
        executedQty: order.recv.toString(),
        cummulativeQuoteQty: (order.rate * order.recv).toString(),
        transactTime: new Date(order.updated_at).getTime(),
      };
    } catch (error) {
      throw this.handleApiError(error, 'cancelOrder', { symbol, orderId });
    }
  }

  /**
   * Get order info
   */
  async getOrderInfo(symbol: string, orderId: string | number): Promise<OrderResponse | null> {
    try {
      const response = await this.client.post<{ result: BitkubOrder }>('/market/order-info', {
        sym: symbol,
        id: orderId.toString(),
      });
      const order = response.data.result;

      return {
        orderId: order.id.toString(),
        symbol,
        status: this.mapBitkubStatus(order.status),
        side: order.type === 'buy' ? 'BUY' : 'SELL',
        type: 'LIMIT',
        quantity: order.amount.toString(),
        price: order.rate.toString(),
        executedQty: order.recv.toString(),
        cummulativeQuoteQty: (order.rate * order.recv).toString(),
        transactTime: new Date(order.updated_at).getTime(),
        fills: order.fee > 0 ? [{
          price: order.rate.toString(),
          qty: order.recv.toString(),
          commission: order.fee.toString(),
          commissionAsset: this.getQuoteAsset(symbol),
        }] : undefined,
      };
    } catch (error) {
      // Order not found is not an error in this context
      if (error instanceof ExchangeError && error.code === 'ORDER_NOT_FOUND') {
        return null;
      }
      throw this.handleApiError(error, 'getOrderInfo', { symbol, orderId });
    }
  }

  /**
   * Get open orders
   */
  async getOpenOrders(symbol?: string): Promise<OrderResponse[]> {
    try {
      const response = await this.client.post<{ result: BitkubOrder[] }>('/market/open-orders', {
        sym: symbol,
      });

      return response.data.result.map(order => ({
        orderId: order.id.toString(),
        symbol: order.src === 'THB' ? `THB_${order.dst}` : `${order.src}_${order.dst}`,
        status: this.mapBitkubStatus(order.status),
        side: order.type === 'buy' ? 'BUY' : 'SELL',
        type: 'LIMIT',
        quantity: order.amount.toString(),
        price: order.rate.toString(),
        executedQty: order.recv.toString(),
        cummulativeQuoteQty: (order.rate * order.recv).toString(),
        transactTime: new Date(order.created_at).getTime(),
      }));
    } catch (error) {
      throw this.handleApiError(error, 'getOpenOrders', { symbol });
    }
  }

  /**
   * Get user trade history
   */
  async getUserTradeHistory(symbol?: string, limit: number = 100): Promise<Array<{
    id: string;
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    fee: number;
    timestamp: number;
  }>> {
    try {
      const response = await this.client.post<{ result: BitkubOrder[] }>('/market/my-open-orders', {
        sym: symbol,
        lmt: limit,
      });

      return response.data.result.map(order => ({
        id: order.hash,
        orderId: order.id.toString(),
        symbol: order.src === 'THB' ? `THB_${order.dst}` : `${order.src}_${order.dst}`,
        side: order.type === 'buy' ? 'BUY' : 'SELL',
        quantity: order.amount,
        price: order.rate,
        fee: order.fee,
        timestamp: new Date(order.created_at).getTime(),
      }));
    } catch (error) {
      throw this.handleApiError(error, 'getUserTradeHistory', { symbol, limit });
    }
  }

  /**
   * Get trading fee (Thai market specific)
   */
  async getTradingFee(symbol: string): Promise<{
    maker: number;
    taker: number;
  }> {
    try {
      const symbols = await this.getMarketSymbols();
      const symbolInfo = symbols.find(s => s.symbol === symbol);

      if (!symbolInfo) {
        throw new ExchangeError(`Symbol ${symbol} not found`, 'SYMBOL_NOT_FOUND');
      }

      return {
        maker: symbolInfo.fees.maker,
        taker: symbolInfo.fees.taker,
      };
    } catch (error) {
      throw this.handleApiError(error, 'getTradingFee', { symbol });
    }
  }

  /**
   * Subscribe to ticker updates (WebSocket)
   */
  subscribeToTicker(symbol: string, callback: (ticker: BitkubTicker) => void): void {
    const wsUrl = exchangeConfig.bitkub?.sandbox
      ? 'wss://api-sbx.bitkub.com/websocket-api/v3'
      : 'wss://api.bitkub.com/websocket-api/v3';

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      // Subscribe to ticker updates
      ws.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: [`market.ticker.${symbol}`],
        id: Date.now(),
      }));

      logger.info(`Subscribed to Bitkub ticker for ${symbol}`);
    });

    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        if (message.method === 'trade.ticker' && message.params?.symbol === symbol) {
          callback(message.params);
        }
      } catch (error) {
        logError(error instanceof Error ? error : new Error('WebSocket parsing error'), {
          action: 'bitkub_ticker_subscription',
          symbol,
        });
      }
    });

    ws.on('error', (error) => {
      logError(error, { action: 'bitkub_websocket_error', symbol });
    });

    ws.on('close', () => {
      logger.warn(`Bitkub WebSocket closed for ${symbol}`);
      this.handleWebSocketReconnect(symbol, () => this.subscribeToTicker(symbol, callback));
    });

    this.webSockets[symbol] = ws;
  }

  /**
   * Subscribe to order book updates (WebSocket)
   */
  subscribeToOrderBook(symbol: string, callback: (orderBook: {
    bids: Array<[number, number]>;
    asks: Array<[number, number]>;
  }) => void): void {
    const wsUrl = exchangeConfig.bitkub?.sandbox
      ? 'wss://api-sbx.bitkub.com/websocket-api/v3'
      : 'wss://api.bitkub.com/websocket-api/v3';

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      // Subscribe to order book updates
      ws.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: [`market.depth.${symbol}`],
        id: Date.now(),
      }));

      logger.info(`Subscribed to Bitkub order book for ${symbol}`);
    });

    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        if (message.method === 'trade.depth' && message.params?.symbol === symbol) {
          const orderBook = message.params;
          callback({
            bids: orderBook.bids.map((bid: any) => [parseFloat(bid[0]), parseFloat(bid[1])]),
            asks: orderBook.asks.map((ask: any) => [parseFloat(ask[0]), parseFloat(ask[1])]),
          });
        }
      } catch (error) {
        logError(error instanceof Error ? error : new Error('WebSocket parsing error'), {
          action: 'bitkub_orderbook_subscription',
          symbol,
        });
      }
    });

    ws.on('error', (error) => {
      logError(error, { action: 'bitkub_websocket_error', symbol });
    });

    ws.on('close', () => {
      logger.warn(`Bitkub WebSocket closed for ${symbol}`);
      this.handleWebSocketReconnect(symbol, () => this.subscribeToOrderBook(symbol, callback));
    });

    this.webSockets[`orderbook_${symbol}`] = ws;
  }

  /**
   * Unsubscribe from WebSocket updates
   */
  unsubscribe(symbol: string): void {
    const tickerWs = this.webSockets[symbol];
    if (tickerWs) {
      tickerWs.close();
      delete this.webSockets[symbol];
    }

    const orderBookWs = this.webSockets[`orderbook_${symbol}`];
    if (orderBookWs) {
      orderBookWs.close();
      delete this.webSockets[`orderbook_${symbol}`];
    }

    logger.info(`Unsubscribed from Bitkub WebSocket for ${symbol}`);
  }

  /**
   * Unsubscribe from all WebSocket connections
   */
  unsubscribeAll(): void {
    Object.keys(this.webSockets).forEach(symbol => {
      this.unsubscribe(symbol);
    });
  }

  /**
   * Get Thai market specific information
   */
  async getThaiMarketInfo(): Promise<{
    tradingHours: {
      open: string;
      close: string;
      days: string[];
    };
    settlement: {
      currency: string;
      timeframe: string;
    };
    regulations: {
      kycRequired: boolean;
      tradingLimits: {
        daily: number;
        monthly: number;
      };
      taxInfo: {
        withholdingTax: number;
        vat: number;
      };
    };
  }> {
    return {
      tradingHours: {
        open: '10:00',
        close: '22:00',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      },
      settlement: {
        currency: 'THB',
        timeframe: 'T+0', // Same day settlement
      },
      regulations: {
        kycRequired: true,
        tradingLimits: {
          daily: 5000000, // 5M THB daily limit
          monthly: 50000000, // 50M THB monthly limit
        },
        taxInfo: {
          withholdingTax: 0.15, // 15% withholding tax on gains
          vat: 0.07, // 7% VAT on fees
        },
      },
    };
  }

  /**
   * Validate Thai market compliance
   */
  async validateThaiCompliance(order: OrderRequest): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if symbol is available for Thai trading
      const symbols = await this.getMarketSymbols();
      const symbolInfo = symbols.find(s => s.symbol === order.symbol);

      if (!symbolInfo) {
        errors.push(`Symbol ${order.symbol} is not available on Bitkub`);
      }

      // Check trading hours
      const now = new Date();
      const currentHour = now.getHours();
      if (currentHour < 10 || currentHour > 22) {
        warnings.push('Order placed outside regular Thai market hours (10:00-22:00)');
      }

      // Check if it's a valid Thai market symbol (must have THB as base or quote)
      if (!order.symbol.includes('THB')) {
        errors.push('Thai market trading requires THB as base or quote currency');
      }

      // Validate order size
      const minOrderSize = this.getMinimumOrderSize(order.symbol);
      if (order.quantity && order.quantity < minOrderSize) {
        errors.push(`Order size ${order.quantity} is below minimum ${minOrderSize}`);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(`Compliance validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        valid: false,
        errors,
        warnings,
      };
    }
  }

  // Private helper methods

  /**
   * Sign API request
   */
  private signRequest(config: any): void {
    const apiKey = exchangeConfig.bitkub.apiKey;
    const apiSecret = exchangeConfig.bitkub.apiSecret;

    if (!apiKey || !apiSecret) {
      throw new ExchangeError('Bitkub API credentials not configured', 'MISSING_CREDENTIALS');
    }

    const timestamp = Date.now().toString();
    const payload = config.data ? JSON.stringify(config.data) : '';
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(timestamp + payload)
      .digest('hex');

    config.headers = {
      ...config.headers,
      'X-BTK-APIKEY': apiKey,
      'X-BTK-TIMESTAMP': timestamp,
      'X-BTK-SIGNATURE': signature,
    };
  }

  /**
   * Handle API errors
   */
  private handleApiError(error: any, operation: string, context?: any): ExchangeError {
    if (error instanceof ExchangeError) {
      return error;
    }

    const message = error.response?.data?.error?.message || error.message || 'Unknown error';
    const code = error.response?.data?.error?.code || 'UNKNOWN_ERROR';

    logError(error instanceof Error ? error : new Error(message), {
      action: `bitkub_${operation}`,
      context,
    });

    return new ExchangeError(message, code, error.response?.status);
  }

  /**
   * Map Bitkub order status to standard format
   */
  private mapBitkubStatus(status: string): 'NEW' | 'FILLED' | 'CANCELED' | 'REJECTED' {
    switch (status) {
      case 'pending':
        return 'NEW';
      case 'filled':
        return 'FILLED';
      case 'cancelled':
        return 'CANCELED';
      default:
        return 'REJECTED';
    }
  }

  /**
   * Get quote asset from symbol
   */
  private getQuoteAsset(symbol: string): string {
    if (symbol.startsWith('THB_')) {
      return 'THB';
    }
    return symbol.split('_')[1] || 'THB';
  }

  /**
   * Get minimum order size for symbol
   */
  private getMinimumOrderSize(symbol: string): number {
    // Thai market minimum order sizes
    const minSizes: { [symbol: string]: number } = {
      'THB_BTC': 0.000001,
      'THB_ETH': 0.001,
      'THB_USDT': 0.01,
    };

    return minSizes[symbol] || 0.000001; // Default minimum
  }

  /**
   * Handle WebSocket reconnection
   */
  private handleWebSocketReconnect(symbol: string, reconnectCallback: () => void): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(`Attempting to reconnect Bitkub WebSocket for ${symbol} (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        reconnectCallback();
      }, this.reconnectDelay);
    } else {
      logger.error(`Max reconnection attempts reached for Bitkub WebSocket ${symbol}`);
      this.reconnectAttempts = 0;
    }
  }
}

export default BitkubService;