"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupLogRotation = exports.logPerformance = exports.logError = exports.tradingLogger = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const config_1 = require("@/config");
const tradingFormat = winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
        timestamp,
        level,
        message,
        ...meta,
    });
}));
const consoleFormat = winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
        if (meta.symbol)
            msg += ` (${meta.symbol})`;
        if (meta.side)
            msg += ` ${meta.side}`;
        if (meta.quantity)
            msg += ` ${meta.quantity}`;
        if (meta.price)
            msg += ` @${meta.price}`;
    }
    return msg;
}));
exports.logger = winston_1.default.createLogger({
    level: config_1.loggingConfig.level,
    format: tradingFormat,
    defaultMeta: { service: 'ai-trading' },
    transports: [
        new winston_1.default.transports.File({
            filename: config_1.loggingConfig.file.replace('.log', '-error.log'),
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5,
        }),
        new winston_1.default.transports.File({
            filename: config_1.loggingConfig.file,
            maxsize: 5242880,
            maxFiles: 5,
        }),
    ],
});
if (process.env.NODE_ENV !== 'production') {
    exports.logger.add(new winston_1.default.transports.Console({
        format: consoleFormat,
    }));
}
exports.tradingLogger = {
    trade: (symbol, side, quantity, price, orderId) => {
        exports.logger.info('Trade executed', {
            type: 'TRADE',
            symbol,
            side,
            quantity,
            price,
            orderId,
        });
    },
    position: (action, symbol, quantity, price, pnl) => {
        exports.logger.info('Position update', {
            type: 'POSITION',
            action,
            symbol,
            quantity,
            price,
            pnl,
        });
    },
    aiDecision: (symbol, action, confidence, reasoning) => {
        exports.logger.info('AI decision', {
            type: 'AI_DECISION',
            symbol,
            action,
            confidence,
            reasoning,
        });
    },
    risk: (type, details) => {
        exports.logger.warn('Risk management', {
            type: 'RISK',
            riskType: type,
            details,
        });
    },
    apiCall: (exchange, endpoint, success, responseTime, error) => {
        exports.logger.info('API call', {
            type: 'API_CALL',
            exchange,
            endpoint,
            success,
            responseTime,
            error,
        });
    },
    alert: (type, message, data) => {
        exports.logger.info('Alert sent', {
            type: 'ALERT',
            alertType: type,
            message,
            data,
        });
    },
    marketData: (symbol, price, volume, change24h) => {
        exports.logger.debug('Market data update', {
            type: 'MARKET_DATA',
            symbol,
            price,
            volume,
            change24h,
        });
    },
};
const logError = (error, context) => {
    exports.logger.error('Application error', {
        type: 'ERROR',
        name: error.name,
        message: error.message,
        stack: error.stack,
        context,
    });
};
exports.logError = logError;
const logPerformance = (operation, startTime, metadata) => {
    const duration = Date.now() - startTime;
    exports.logger.info('Performance metric', {
        type: 'PERFORMANCE',
        operation,
        duration,
        ...metadata,
    });
};
exports.logPerformance = logPerformance;
const setupLogRotation = () => {
    exports.logger.info('Log rotation setup completed');
};
exports.setupLogRotation = setupLogRotation;
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map