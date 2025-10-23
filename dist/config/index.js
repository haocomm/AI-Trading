"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.environmentFeatures = exports.isTest = exports.isStaging = exports.isProduction = exports.isDevelopment = exports.dashboardConfig = exports.loggingConfig = exports.databaseConfig = exports.alertConfig = exports.aiConfig = exports.exchangeConfig = exports.tradingConfig = void 0;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.tradingConfig = {
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
exports.exchangeConfig = {
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
exports.aiConfig = {
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
        ttl: parseInt(process.env.AI_CACHE_TTL || '300'),
        maxSize: parseInt(process.env.AI_CACHE_MAX_SIZE || '1000'),
    },
};
exports.alertConfig = {
    webhookUrl: process.env.ALERT_WEBHOOK_URL,
    email: {
        smtpHost: process.env.ALERT_EMAIL_SMTP_HOST,
        smtpPort: process.env.ALERT_EMAIL_SMTP_PORT ? parseInt(process.env.ALERT_EMAIL_SMTP_PORT) : 587,
        user: process.env.ALERT_EMAIL_USER,
        password: process.env.ALERT_EMAIL_PASS,
        to: process.env.ALERT_EMAIL_TO,
    },
};
exports.databaseConfig = {
    path: process.env.DATABASE_PATH || './data/trading.db',
};
exports.loggingConfig = {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/trading.log',
};
exports.dashboardConfig = {
    port: parseInt(process.env.DASHBOARD_PORT || '3000'),
    enabled: process.env.DASHBOARD_ENABLED === 'true',
};
function validateConfig() {
    const errors = [];
    const warnings = [];
    const environment = process.env.NODE_ENV || 'development';
    if (environment === 'production') {
        validateProductionConfig(errors, warnings);
    }
    else if (environment === 'staging') {
        validateStagingConfig(errors, warnings);
    }
    else {
        validateDevelopmentConfig(errors, warnings);
    }
    validateBaseConfig(errors, warnings);
    if (warnings.length > 0) {
        console.warn('⚠️  Configuration Warnings:');
        warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    if (errors.length > 0) {
        console.error('❌ Configuration Validation Failed:');
        errors.forEach(error => console.error(`  - ${error}`));
        throw new Error(`Configuration validation failed: ${errors.length} critical errors found`);
    }
    console.log(`✅ Configuration validation passed for ${environment} environment`);
}
function validateProductionConfig(errors, warnings) {
    if (!exports.exchangeConfig.binance.apiKey || exports.exchangeConfig.binance.apiKey.includes('demo') || exports.exchangeConfig.binance.apiKey.includes('test')) {
        errors.push('Production requires real Binance API keys (no demo/test keys)');
    }
    if (!exports.exchangeConfig.binance.apiSecret || exports.exchangeConfig.binance.apiSecret.includes('demo') || exports.exchangeConfig.binance.apiSecret.includes('test')) {
        errors.push('Production requires real Binance API secret (no demo/test keys)');
    }
    if (!exports.aiConfig.gemini.apiKey || exports.aiConfig.gemini.apiKey.includes('demo')) {
        errors.push('Production requires real Gemini API key');
    }
    if (exports.tradingConfig.riskPerTradePercentage > 3) {
        warnings.push('High risk per trade percentage for production (>3%). Consider reducing risk.');
    }
    if (exports.tradingConfig.maxDailyLossPercentage > 8) {
        warnings.push('High daily loss limit for production (>8%). Consider reducing risk.');
    }
    if (!process.env.DASHBOARD_USERNAME || !process.env.DASHBOARD_PASSWORD) {
        errors.push('Production dashboard requires authentication credentials');
    }
    if (process.env.DASHBOARD_PASSWORD === 'change_me_in_production') {
        errors.push('Default dashboard password detected. Must be changed for production.');
    }
    if (process.env.BACKUP_ENABLED !== 'true') {
        warnings.push('Backups are disabled in production. Consider enabling for data safety.');
    }
    if (process.env.API_RATE_LIMIT_ENABLED !== 'true') {
        warnings.push('API rate limiting is disabled in production. Consider enabling for security.');
    }
    if (process.env.TRADING_ENABLED === 'true' && process.env.PAPER_TRADING_ENABLED === 'true') {
        errors.push('Cannot have both real trading and paper trading enabled simultaneously');
    }
}
function validateStagingConfig(errors, warnings) {
    if (!exports.exchangeConfig.binance.apiKey) {
        errors.push('Staging requires Binance API keys (testnet keys acceptable)');
    }
    if (!exports.aiConfig.gemini.apiKey) {
        errors.push('Staging requires Gemini API key');
    }
    if (process.env.TRADING_ENABLED === 'true' && process.env.PAPER_TRADING_ENABLED !== 'true') {
        warnings.push('Real trading enabled in staging. Consider using paper trading for safety.');
    }
    if (process.env.DEBUG !== 'true') {
        warnings.push('Consider enabling DEBUG mode in staging for better troubleshooting');
    }
}
function validateDevelopmentConfig(errors, warnings) {
    if (!exports.exchangeConfig.binance.apiKey) {
        warnings.push('No Binance API key configured. Some features may be limited.');
    }
    if (!exports.aiConfig.gemini.apiKey) {
        warnings.push('No Gemini API key configured. AI features will be limited.');
    }
    if (process.env.TRADING_ENABLED === 'true' && process.env.PAPER_TRADING_ENABLED !== 'true') {
        warnings.push('Real trading enabled in development. Consider using paper trading for safety.');
    }
}
function validateBaseConfig(errors, warnings) {
    if (exports.tradingConfig.riskPerTradePercentage <= 0 || exports.tradingConfig.riskPerTradePercentage > 100) {
        errors.push('Risk per trade percentage must be between 0 and 100');
    }
    if (exports.tradingConfig.maxDailyLossPercentage <= 0 || exports.tradingConfig.maxDailyLossPercentage > 100) {
        errors.push('Max daily loss percentage must be between 0 and 100');
    }
    if (exports.tradingConfig.maxConcurrentPositions <= 0 || exports.tradingConfig.maxConcurrentPositions > 20) {
        errors.push('Max concurrent positions must be between 1 and 20');
    }
    if (exports.tradingConfig.defaultStopLossPercentage <= 0 || exports.tradingConfig.defaultStopLossPercentage > 50) {
        errors.push('Default stop loss percentage must be between 0 and 50');
    }
    if (exports.tradingConfig.defaultTakeProfitPercentage <= 0 || exports.tradingConfig.defaultTakeProfitPercentage > 100) {
        errors.push('Default take profit percentage must be between 0 and 100');
    }
    if (exports.tradingConfig.defaultTakeProfitPercentage <= exports.tradingConfig.defaultStopLossPercentage) {
        errors.push('Take profit percentage must be greater than stop loss percentage');
    }
    if (exports.tradingConfig.minTradeAmountUSD <= 0) {
        errors.push('Minimum trade amount must be greater than 0');
    }
    if (exports.tradingConfig.maxTradesPerHour <= 0 || exports.tradingConfig.maxTradesPerHour > 100) {
        errors.push('Max trades per hour must be between 1 and 100');
    }
    if (exports.tradingConfig.positionCheckIntervalSeconds <= 0 || exports.tradingConfig.positionCheckIntervalSeconds > 3600) {
        errors.push('Position check interval must be between 1 second and 1 hour');
    }
    if (exports.dashboardConfig.port < 1024 || exports.dashboardConfig.port > 65535) {
        errors.push('Dashboard port must be between 1024 and 65535');
    }
    if (!exports.databaseConfig.path) {
        errors.push('Database path cannot be empty');
    }
    const validLogLevels = ['error', 'warn', 'info', 'debug'];
    if (!validLogLevels.includes(exports.loggingConfig.level)) {
        errors.push(`Log level must be one of: ${validLogLevels.join(', ')}`);
    }
    if (exports.aiConfig.ensemble.enabled) {
        if (exports.aiConfig.ensemble.minProviders < 1 || exports.aiConfig.ensemble.minProviders > 5) {
            errors.push('Ensemble minimum providers must be between 1 and 5');
        }
        if (exports.aiConfig.ensemble.consensusThreshold < 0.1 || exports.aiConfig.ensemble.consensusThreshold > 1.0) {
            errors.push('Ensemble consensus threshold must be between 0.1 and 1.0');
        }
    }
    if (exports.aiConfig.caching.enabled) {
        if (exports.aiConfig.caching.ttl <= 0 || exports.aiConfig.caching.ttl > 3600) {
            errors.push('AI cache TTL must be between 1 second and 1 hour');
        }
        if (exports.aiConfig.caching.maxSize <= 0 || exports.aiConfig.caching.maxSize > 10000) {
            errors.push('AI cache max size must be between 1 and 10000');
        }
    }
}
exports.isDevelopment = process.env.NODE_ENV === 'development';
exports.isProduction = process.env.NODE_ENV === 'production';
exports.isStaging = process.env.NODE_ENV === 'staging';
exports.isTest = process.env.NODE_ENV === 'test';
exports.environmentFeatures = {
    isProduction: exports.isProduction,
    isStaging: exports.isStaging,
    isDevelopment: exports.isDevelopment,
    isTest: exports.isTest,
    canUseRealTrading: exports.isProduction || (exports.isStaging && process.env.TRADING_ENABLED === 'true'),
    requiresAuthentication: exports.isProduction,
    requiresBackups: exports.isProduction,
    requiresRateLimiting: exports.isProduction,
    allowsDebugMode: !exports.isProduction,
    allowsHotReload: exports.isDevelopment,
    requiresPaperTrading: exports.isDevelopment || exports.isStaging,
};
//# sourceMappingURL=index.js.map