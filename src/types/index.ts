// Trading Types
export interface Trade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  timestamp: Date;
  orderId?: string;
  exchange: 'binance' | 'bitkub';
  type: 'MARKET' | 'LIMIT';
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'FAILED';
  fees?: number;
  notes?: string;
}

export interface Position {
  id: string;
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  timestamp: Date;
  exchange: 'binance' | 'bitkub';
  stopLoss?: number;
  takeProfit?: number;
  status: 'OPEN' | 'CLOSED';
}

export interface AIDecision {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  timestamp: Date;
  executed: boolean;
  result?: 'PROFIT' | 'LOSS' | 'BREAK_EVEN';
  model: string;
  inputData: any;
}

export interface MarketData {
  symbol: string;
  price: number;
  volume: number;
  high24h: number;
  low24h: number;
  change24h: number;
  timestamp: Date;
  exchange: 'binance' | 'bitkub';
}

export interface MarketAnalysis {
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  volume: number;
  high24h: number;
  low24h: number;
  volatility: number;
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  momentum: number;
  support: number;
  resistance: number;
}

export interface RiskMetrics {
  portfolioValue: number;
  availableBalance: number;
  totalPnL: number;
  dailyPnL: number;
  openPositions: number;
  riskPerTrade: number;
  maxDailyLoss: number;
  currentDailyLoss: number;
}

// Configuration Types
export interface TradingConfig {
  riskPerTradePercentage: number;
  maxDailyLossPercentage: number;
  maxConcurrentPositions: number;
  defaultStopLossPercentage: number;
  defaultTakeProfitPercentage: number;
  tradingEnabled: boolean;
  minTradeAmountUSD: number;
  maxTradesPerHour: number;
  positionCheckIntervalSeconds: number;
}

export interface ExchangeConfig {
  binance: {
    apiKey: string;
    apiSecret: string;
    sandbox: boolean;
  };
  bitkub: {
    apiKey: string;
    apiSecret: string;
  };
}

export interface AIConfig {
  gemini: {
    apiKey: string;
    model: string;
  };
  providers: {
    openai: {
      apiKey: string;
      models: string[];
      defaultModel: string;
    };
    claude: {
      apiKey: string;
      models: string[];
      defaultModel: string;
    };
    custom: {
      apiKey?: string;
      baseUrl?: string;
      models: string[];
      defaultModel: string;
    };
  };
  ensemble: {
    enabled: boolean;
    minProviders: number;
    consensusThreshold: number;
  };
  caching: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
}

export interface AlertConfig {
  webhookUrl?: string;
  email: {
    smtpHost?: string;
    smtpPort?: number;
    user?: string;
    password?: string;
    to?: string;
  };
}

// API Response Types
export interface BinanceTicker {
  symbol: string;
  price: string;
  volume: string;
  high24h: string;
  low24h: string;
  change24h: string;
}

export interface OrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity?: number;
  quoteOrderQty?: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
}

export interface OrderResponse {
  orderId: string;
  symbol: string;
  status: 'NEW' | 'FILLED' | 'CANCELED' | 'REJECTED';
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  transactTime: number;
  fills?: Array<{
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
}

// Error Types
export class TradingError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TradingError';
  }
}

export class RiskError extends Error {
  constructor(
    message: string,
    public riskType: 'POSITION_SIZE' | 'DAILY_LOSS' | 'MAX_POSITIONS' | 'VOLATILITY',
    public details?: any
  ) {
    super(message);
    this.name = 'RiskError';
  }
}

export class ExchangeError extends Error {
  constructor(
    message: string,
    public exchange: 'binance' | 'bitkub',
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ExchangeError';
  }
}