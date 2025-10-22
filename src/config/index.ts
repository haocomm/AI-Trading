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

// Enhanced configuration validation with environment-specific rules
export function validateConfig(): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  const environment = process.env.NODE_ENV || 'development';

  // Environment-specific validation
  if (environment === 'production') {
    validateProductionConfig(errors, warnings);
  } else if (environment === 'staging') {
    validateStagingConfig(errors, warnings);
  } else {
    validateDevelopmentConfig(errors, warnings);
  }

  // Base validation for all environments
  validateBaseConfig(errors, warnings);

  // Report warnings first
  if (warnings.length > 0) {
    console.warn('⚠️  Configuration Warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  // Report errors and fail if critical
  if (errors.length > 0) {
    console.error('❌ Configuration Validation Failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    throw new Error(`Configuration validation failed: ${errors.length} critical errors found`);
  }

  console.log(`✅ Configuration validation passed for ${environment} environment`);
}

// Production-specific validation
function validateProductionConfig(errors: string[], warnings: string[]): void {
  // Strict API key validation for production
  if (!exchangeConfig.binance.apiKey || exchangeConfig.binance.apiKey.includes('demo') || exchangeConfig.binance.apiKey.includes('test')) {
    errors.push('Production requires real Binance API keys (no demo/test keys)');
  }

  if (!exchangeConfig.binance.apiSecret || exchangeConfig.binance.apiSecret.includes('demo') || exchangeConfig.binance.apiSecret.includes('test')) {
    errors.push('Production requires real Binance API secret (no demo/test keys)');
  }

  // AI provider validation
  if (!aiConfig.gemini.apiKey || aiConfig.gemini.apiKey.includes('demo')) {
    errors.push('Production requires real Gemini API key');
  }

  // Risk management validation for production
  if (tradingConfig.riskPerTradePercentage > 3) {
    warnings.push('High risk per trade percentage for production (>3%). Consider reducing risk.');
  }

  if (tradingConfig.maxDailyLossPercentage > 8) {
    warnings.push('High daily loss limit for production (>8%). Consider reducing risk.');
  }

  // Production safety checks
  if (!process.env.DASHBOARD_USERNAME || !process.env.DASHBOARD_PASSWORD) {
    errors.push('Production dashboard requires authentication credentials');
  }

  if (process.env.DASHBOARD_PASSWORD === 'change_me_in_production') {
    errors.push('Default dashboard password detected. Must be changed for production.');
  }

  // Backup and recovery validation
  if (process.env.BACKUP_ENABLED !== 'true') {
    warnings.push('Backups are disabled in production. Consider enabling for data safety.');
  }

  // Security validation
  if (process.env.API_RATE_LIMIT_ENABLED !== 'true') {
    warnings.push('API rate limiting is disabled in production. Consider enabling for security.');
  }

  // Trading safety validation
  if (process.TRADING_ENABLED === 'true' && process.PAPER_TRADING_ENABLED === 'true') {
    errors.push('Cannot have both real trading and paper trading enabled simultaneously');
  }
}

// Staging-specific validation
function validateStagingConfig(errors: string[], warnings: string[]): void {
  // Staging allows test keys but should have them configured
  if (!exchangeConfig.binance.apiKey) {
    errors.push('Staging requires Binance API keys (testnet keys acceptable)');
  }

  if (!aiConfig.gemini.apiKey) {
    errors.push('Staging requires Gemini API key');
  }

  // Staging should use paper trading by default
  if (process.env.TRADING_ENABLED === 'true' && process.env.PAPER_TRADING_ENABLED !== 'true') {
    warnings.push('Real trading enabled in staging. Consider using paper trading for safety.');
  }

  // Ensure testing features are available
  if (process.env.DEBUG !== 'true') {
    warnings.push('Consider enabling DEBUG mode in staging for better troubleshooting');
  }
}

// Development-specific validation
function validateDevelopmentConfig(errors: string[], warnings: string[]): void {
  // Development is more lenient but should have basic configuration
  if (!exchangeConfig.binance.apiKey) {
    warnings.push('No Binance API key configured. Some features may be limited.');
  }

  if (!aiConfig.gemini.apiKey) {
    warnings.push('No Gemini API key configured. AI features will be limited.');
  }

  // Development should use paper trading
  if (process.env.TRADING_ENABLED === 'true' && process.env.PAPER_TRADING_ENABLED !== 'true') {
    warnings.push('Real trading enabled in development. Consider using paper trading for safety.');
  }
}

// Base validation for all environments
function validateBaseConfig(errors: string[], warnings: string[]): void {
  // Trading configuration validation
  if (tradingConfig.riskPerTradePercentage <= 0 || tradingConfig.riskPerTradePercentage > 100) {
    errors.push('Risk per trade percentage must be between 0 and 100');
  }

  if (tradingConfig.maxDailyLossPercentage <= 0 || tradingConfig.maxDailyLossPercentage > 100) {
    errors.push('Max daily loss percentage must be between 0 and 100');
  }

  if (tradingConfig.maxConcurrentPositions <= 0 || tradingConfig.maxConcurrentPositions > 20) {
    errors.push('Max concurrent positions must be between 1 and 20');
  }

  // Stop loss and take profit validation
  if (tradingConfig.defaultStopLossPercentage <= 0 || tradingConfig.defaultStopLossPercentage > 50) {
    errors.push('Default stop loss percentage must be between 0 and 50');
  }

  if (tradingConfig.defaultTakeProfitPercentage <= 0 || tradingConfig.defaultTakeProfitPercentage > 100) {
    errors.push('Default take profit percentage must be between 0 and 100');
  }

  // Validate take profit is greater than stop loss
  if (tradingConfig.defaultTakeProfitPercentage <= tradingConfig.defaultStopLossPercentage) {
    errors.push('Take profit percentage must be greater than stop loss percentage');
  }

  // Numeric value validation
  if (tradingConfig.minTradeAmountUSD <= 0) {
    errors.push('Minimum trade amount must be greater than 0');
  }

  if (tradingConfig.maxTradesPerHour <= 0 || tradingConfig.maxTradesPerHour > 100) {
    errors.push('Max trades per hour must be between 1 and 100');
  }

  if (tradingConfig.positionCheckIntervalSeconds <= 0 || tradingConfig.positionCheckIntervalSeconds > 3600) {
    errors.push('Position check interval must be between 1 second and 1 hour');
  }

  // Dashboard configuration validation
  if (dashboardConfig.port < 1024 || dashboardConfig.port > 65535) {
    errors.push('Dashboard port must be between 1024 and 65535');
  }

  // Database path validation
  if (!databaseConfig.path) {
    errors.push('Database path cannot be empty');
  }

  // Log level validation
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLogLevels.includes(loggingConfig.level)) {
    errors.push(`Log level must be one of: ${validLogLevels.join(', ')}`);
  }

  // AI ensemble validation
  if (aiConfig.ensemble.enabled) {
    if (aiConfig.ensemble.minProviders < 1 || aiConfig.ensemble.minProviders > 5) {
      errors.push('Ensemble minimum providers must be between 1 and 5');
    }

    if (aiConfig.ensemble.consensusThreshold < 0.1 || aiConfig.ensemble.consensusThreshold > 1.0) {
      errors.push('Ensemble consensus threshold must be between 0.1 and 1.0');
    }
  }

  // AI caching validation
  if (aiConfig.caching.enabled) {
    if (aiConfig.caching.ttl <= 0 || aiConfig.caching.ttl > 3600) {
      errors.push('AI cache TTL must be between 1 second and 1 hour');
    }

    if (aiConfig.caching.maxSize <= 0 || aiConfig.caching.maxSize > 10000) {
      errors.push('AI cache max size must be between 1 and 10000');
    }
  }
}

// Environment detection functions
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';
export const isStaging = process.env.NODE_ENV === 'staging';
export const isTest = process.env.NODE_ENV === 'test';

// Environment-specific feature flags
export const environmentFeatures = {
  isProduction,
  isStaging,
  isDevelopment,
  isTest,
  canUseRealTrading: isProduction || (isStaging && process.env.TRADING_ENABLED === 'true'),
  requiresAuthentication: isProduction,
  requiresBackups: isProduction,
  requiresRateLimiting: isProduction,
  allowsDebugMode: !isProduction,
  allowsHotReload: isDevelopment,
  requiresPaperTrading: isDevelopment || isStaging,
};