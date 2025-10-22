"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTest = exports.isProduction = exports.isDevelopment = exports.dashboardConfig = exports.loggingConfig = exports.databaseConfig = exports.alertConfig = exports.aiConfig = exports.exchangeConfig = exports.tradingConfig = void 0;
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
    if (!exports.exchangeConfig.binance.apiKey || !exports.exchangeConfig.binance.apiSecret) {
        errors.push('Binance API credentials are required');
    }
    if (!exports.aiConfig.gemini.apiKey) {
        errors.push('Gemini API key is required');
    }
    if (exports.tradingConfig.riskPerTradePercentage <= 0 || exports.tradingConfig.riskPerTradePercentage > 100) {
        errors.push('Risk per trade percentage must be between 0 and 100');
    }
    if (exports.tradingConfig.maxDailyLossPercentage <= 0 || exports.tradingConfig.maxDailyLossPercentage > 100) {
        errors.push('Max daily loss percentage must be between 0 and 100');
    }
    if (exports.tradingConfig.maxConcurrentPositions <= 0) {
        errors.push('Max concurrent positions must be greater than 0');
    }
    if (exports.tradingConfig.minTradeAmountUSD <= 0) {
        errors.push('Minimum trade amount must be greater than 0');
    }
    if (exports.tradingConfig.positionCheckIntervalSeconds <= 0) {
        errors.push('Position check interval must be greater than 0');
    }
    if (errors.length > 0) {
        throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
}
exports.isDevelopment = process.env.NODE_ENV === 'development';
exports.isProduction = process.env.NODE_ENV === 'production';
exports.isTest = process.env.NODE_ENV === 'test';
//# sourceMappingURL=index.js.map