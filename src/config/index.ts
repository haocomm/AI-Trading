import dotenv from 'dotenv';
import { TradingConfig, ExchangeConfig, AIConfig, AlertConfig } from '@/types';

// Load environment variables
dotenv.config();

export const tradingConfig: TradingConfig = {
  riskPerTradePercentage: parseFloat(process.env.RISK_PER_TRADE_PERCENTAGE || '5'),
  maxDailyLossPercentage: parseFloat(process.env.MAX_DAILY_LOSS_PERCENTAGE || '10'),
  maxConcurrentPositions: parseInt(process.env.MAX_CONCURRENT_POSITIONS || '3'),
  defaultStopLossPercentage: parseFloat(process.env.DEFAULT_STOP_LOSS_PERCENTAGE || '2'),
  defaultTakeProfitPercentage: parseFloat(process.env.DEFAULT_TAKE_PROFIT_PERCENTAGE || '4'),
  tradingEnabled: process.env.TRADING_ENABLED === 'true',
  minTradeAmountUSD: parseFloat(process.env.MIN_TRADE_AMOUNT_USD || '10'),
  maxTradesPerHour: parseInt(process.env.MAX_TRADES_PER_HOUR || '10'),
  positionCheckIntervalSeconds: parseInt(process.env.POSITION_CHECK_INTERVAL_SECONDS || '30'),
};

export const exchangeConfig: ExchangeConfig = {
  binance: {
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET || '',
    sandbox: process.env.NODE_ENV !== 'production',
  },
  bitkub: {
    apiKey: process.env.BITKUB_API_KEY || '',
    apiSecret: process.env.BITKUB_API_SECRET || '',
  },
};

export const aiConfig: AIConfig = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
  },
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo'],
      defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4-turbo-preview',
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY || '',
      models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229'],
      defaultModel: process.env.CLAUDE_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
    },
    custom: {
      apiKey: process.env.CUSTOM_AI_API_KEY || '',
      baseUrl: process.env.CUSTOM_AI_BASE_URL || 'http://localhost:8000/v1',
      models: ['llama-3.1-70b', 'mixtral-8x7b', 'mistral-7b'],
      defaultModel: process.env.CUSTOM_AI_DEFAULT_MODEL || 'llama-3.1-70b',
    },
  },
  ensemble: {
    enabled: process.env.ENSEMBLE_ENABLED === 'true',
    minProviders: parseInt(process.env.ENSEMBLE_MIN_PROVIDERS || '2'),
    consensusThreshold: parseFloat(process.env.ENSEMBLE_CONSENSUS_THRESHOLD || '0.6'),
  },
  caching: {
    enabled: process.env.AI_CACHING_ENABLED === 'true',
    ttl: parseInt(process.env.AI_CACHE_TTL || '300'), // 5 minutes
    maxSize: parseInt(process.env.AI_CACHE_MAX_SIZE || '1000'),
  },
};

export const alertConfig: AlertConfig = {
  webhookUrl: process.env.ALERT_WEBHOOK_URL,
  email: {
    smtpHost: process.env.ALERT_EMAIL_SMTP_HOST,
    smtpPort: process.env.ALERT_EMAIL_SMTP_PORT ? parseInt(process.env.ALERT_EMAIL_SMTP_PORT) : 587,
    user: process.env.ALERT_EMAIL_USER,
    password: process.env.ALERT_EMAIL_PASS,
    to: process.env.ALERT_EMAIL_TO,
  },
};

export const databaseConfig = {
  path: process.env.DATABASE_PATH || './data/trading.db',
};

export const loggingConfig = {
  level: process.env.LOG_LEVEL || 'info',
  file: process.env.LOG_FILE || './logs/trading.log',
};

export const dashboardConfig = {
  port: parseInt(process.env.DASHBOARD_PORT || '3000'),
  enabled: process.env.DASHBOARD_ENABLED === 'true',
};

// Configuration validation
export function validateConfig(): void {
  const errors: string[] = [];

  // Validate exchange configuration
  if (!exchangeConfig.binance.apiKey || !exchangeConfig.binance.apiSecret) {
    errors.push('Binance API credentials are required');
  }

  // Validate AI configuration
  if (!aiConfig.gemini.apiKey) {
    errors.push('Gemini API key is required');
  }

  // Validate trading configuration
  if (tradingConfig.riskPerTradePercentage <= 0 || tradingConfig.riskPerTradePercentage > 100) {
    errors.push('Risk per trade percentage must be between 0 and 100');
  }

  if (tradingConfig.maxDailyLossPercentage <= 0 || tradingConfig.maxDailyLossPercentage > 100) {
    errors.push('Max daily loss percentage must be between 0 and 100');
  }

  if (tradingConfig.maxConcurrentPositions <= 0) {
    errors.push('Max concurrent positions must be greater than 0');
  }

  // Validate numeric values
  if (tradingConfig.minTradeAmountUSD <= 0) {
    errors.push('Minimum trade amount must be greater than 0');
  }

  if (tradingConfig.positionCheckIntervalSeconds <= 0) {
    errors.push('Position check interval must be greater than 0');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Development mode check
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';