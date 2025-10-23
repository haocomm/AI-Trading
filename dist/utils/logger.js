"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupLogRotation = exports.logPerformance = exports.logError = exports.tradingLogger = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const config_1 = require("@/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ensureLogDirectory = (filePath) => {
    const dir = path_1.default.dirname(filePath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
};
const productionFormat = winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
    const logEntry = {
        timestamp: new Date(timestamp).toISOString(),
        level: level.toUpperCase(),
        message,
        service: 'ai-trading',
        environment: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || '1.0.0',
        hostname: require('os').hostname(),
        pid: process.pid,
        ...meta,
    };
    if (meta.correlationId) {
        logEntry.correlationId = meta.correlationId;
    }
    if (config_1.environmentFeatures.allowsDebugMode && meta.trace) {
        logEntry.trace = meta.trace;
    }
    return JSON.stringify(logEntry);
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
        if (meta.duration)
            msg += ` [${meta.duration}ms]`;
        if (meta.correlationId)
            msg += ` [${meta.correlationId}]`;
    }
    return msg;
}));
const logFormat = process.env.LOG_STRUCTURED === 'true' ? productionFormat : consoleFormat;
exports.logger = winston_1.default.createLogger({
    level: config_1.loggingConfig.level,
    format: logFormat,
    defaultMeta: {
        service: 'ai-trading',
        environment: process.env.NODE_ENV || 'development',
    },
    transports: [],
});
ensureLogDirectory(config_1.loggingConfig.file);
exports.logger.add(new winston_1.default.transports.File({
    filename: config_1.loggingConfig.file.replace('.log', '-error.log'),
    level: 'error',
    maxsize: parseInt(process.env.LOG_MAX_SIZE_MB || '100') * 1024 * 1024,
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '30'),
    format: productionFormat,
}));
exports.logger.add(new winston_1.default.transports.File({
    filename: config_1.loggingConfig.file,
    maxsize: parseInt(process.env.LOG_MAX_SIZE_MB || '100') * 1024 * 1024,
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '30'),
    format: productionFormat,
}));
if (process.env.AUDIT_LOG_ENABLED === 'true') {
    const auditLogFile = process.env.AUDIT_LOG_FILE || './logs/audit.log';
    ensureLogDirectory(auditLogFile);
    exports.logger.add(new winston_1.default.transports.File({
        filename: auditLogFile,
        level: 'info',
        maxsize: 50 * 1024 * 1024,
        maxFiles: 90,
        format: productionFormat,
    }));
}
if (process.env.TRADE_LOG_ENABLED === 'true') {
    const tradeLogFile = process.env.TRADE_LOG_FILE || './logs/trades.log';
    ensureLogDirectory(tradeLogFile);
    exports.logger.add(new winston_1.default.transports.File({
        filename: tradeLogFile,
        level: 'info',
        maxsize: 20 * 1024 * 1024,
        maxFiles: 30,
        format: productionFormat,
    }));
}
if (process.env.NODE_ENV !== 'production') {
    exports.logger.add(new winston_1.default.transports.Console({
        format: consoleFormat,
    }));
}
let correlationCounter = 0;
const generateCorrelationId = () => {
    return `req_${Date.now()}_${++correlationCounter}`;
};
exports.tradingLogger = {
    trade: (symbol, side, quantity, price, orderId, metadata) => {
        const correlationId = generateCorrelationId();
        const tradeData = {
            type: 'TRADE',
            subType: 'EXECUTION',
            correlationId,
            timestamp: new Date().toISOString(),
            symbol,
            side,
            quantity,
            price,
            orderId,
            totalValue: quantity * price,
            metadata,
            userId: process.env.USER_ID || 'system',
            tradingMode: process.env.TRADING_MODE || 'live',
        };
        exports.logger.info('Trade executed', tradeData);
        if (process.env.TRADE_LOG_ENABLED === 'true') {
            exports.logger.info('Trade execution audit', {
                ...tradeData,
                auditType: 'TRADE_EXECUTION',
                regulatoryCompliance: true,
            });
        }
        return correlationId;
    },
    position: (action, symbol, quantity, price, pnl, correlationId, metadata) => {
        const positionData = {
            type: 'POSITION',
            subType: action.toUpperCase(),
            correlationId: correlationId || generateCorrelationId(),
            timestamp: new Date().toISOString(),
            symbol,
            quantity,
            price,
            pnl,
            portfolioValue: metadata?.portfolioValue,
            riskScore: metadata?.riskScore,
            metadata,
        };
        exports.logger.info('Position update', positionData);
        if (process.env.AUDIT_LOG_ENABLED === 'true') {
            exports.logger.info('Position management audit', {
                ...positionData,
                auditType: 'POSITION_MANAGEMENT',
                regulatoryCompliance: true,
            });
        }
    },
    aiDecision: (symbol, action, confidence, reasoning, provider, modelVersion, metadata) => {
        const decisionData = {
            type: 'AI_DECISION',
            subType: action,
            correlationId: generateCorrelationId(),
            timestamp: new Date().toISOString(),
            symbol,
            action,
            confidence,
            reasoning,
            provider,
            modelVersion,
            metadata: {
                ...metadata,
                ensembleEnabled: process.env.ENSEMBLE_ENABLED === 'true',
                decisionLatency: metadata?.decisionLatency,
                marketDataUsed: metadata?.marketDataUsed,
            },
        };
        exports.logger.info('AI decision', decisionData);
        if (process.env.AUDIT_LOG_ENABLED === 'true') {
            exports.logger.info('AI decision audit', {
                ...decisionData,
                auditType: 'AI_DECISION',
                regulatoryCompliance: true,
                dataRetention: '7_years',
            });
        }
    },
    risk: (type, details, severity = 'MEDIUM', correlationId) => {
        const riskData = {
            type: 'RISK',
            subType: type.toUpperCase(),
            correlationId: correlationId || generateCorrelationId(),
            timestamp: new Date().toISOString(),
            severity,
            riskType: type,
            details,
            automatedAction: details?.automatedAction,
            riskLimits: details?.riskLimits,
            currentExposure: details?.currentExposure,
        };
        if (severity === 'CRITICAL' || severity === 'HIGH') {
            exports.logger.error('Critical risk event', riskData);
        }
        else if (severity === 'MEDIUM') {
            exports.logger.warn('Risk management alert', riskData);
        }
        else {
            exports.logger.info('Risk monitoring', riskData);
        }
        if (process.env.AUDIT_LOG_ENABLED === 'true') {
            exports.logger.error('Risk management audit', {
                ...riskData,
                auditType: 'RISK_MANAGEMENT',
                regulatoryCompliance: true,
                immediateAttention: severity === 'CRITICAL',
            });
        }
    },
    apiCall: (exchange, endpoint, success, responseTime, error, metadata) => {
        const apiData = {
            type: 'API_CALL',
            subType: success ? 'SUCCESS' : 'FAILURE',
            correlationId: generateCorrelationId(),
            timestamp: new Date().toISOString(),
            exchange,
            endpoint,
            success,
            responseTime,
            error,
            metadata: {
                ...metadata,
                rateLimitRemaining: metadata?.rateLimitRemaining,
                rateLimitReset: metadata?.rateLimitReset,
                requestSize: metadata?.requestSize,
                responseSize: metadata?.responseSize,
            },
        };
        if (success) {
            exports.logger.info('API call successful', apiData);
        }
        else {
            exports.logger.error('API call failed', apiData);
        }
        if (!success && process.env.AUDIT_LOG_ENABLED === 'true') {
            exports.logger.error('API failure audit', {
                ...apiData,
                auditType: 'API_FAILURE',
                regulatoryCompliance: true,
            });
        }
    },
    alert: (type, message, data, deliveryChannels, deliveryStatus) => {
        const alertData = {
            type: 'ALERT',
            subType: type.toUpperCase(),
            correlationId: generateCorrelationId(),
            timestamp: new Date().toISOString(),
            alertType: type,
            message,
            data,
            deliveryChannels,
            deliveryStatus,
            severity: data?.severity || 'MEDIUM',
            automatedResponse: data?.automatedResponse,
        };
        exports.logger.info('Alert sent', alertData);
        if (data?.severity === 'CRITICAL' && process.env.AUDIT_LOG_ENABLED === 'true') {
            exports.logger.error('Critical alert audit', {
                ...alertData,
                auditType: 'CRITICAL_ALERT',
                regulatoryCompliance: true,
                immediateAttention: true,
            });
        }
    },
    marketData: (symbol, price, volume, change24h, metadata) => {
        const marketData = {
            type: 'MARKET_DATA',
            subType: 'PRICE_UPDATE',
            correlationId: generateCorrelationId(),
            timestamp: new Date().toISOString(),
            symbol,
            price,
            volume,
            change24h,
            metadata: {
                ...metadata,
                dataSource: metadata?.dataSource || 'exchange_api',
                dataQuality: metadata?.dataQuality || 'good',
                latency: metadata?.latency,
                bidAskSpread: metadata?.bidAskSpread,
                orderBookDepth: metadata?.orderBookDepth,
            },
        };
        exports.logger.debug('Market data update', marketData);
        if (metadata?.dataQuality !== 'good' && process.env.AUDIT_LOG_ENABLED === 'true') {
            exports.logger.warn('Market data quality issue', {
                ...marketData,
                auditType: 'DATA_QUALITY',
                regulatoryCompliance: true,
            });
        }
    },
    performance: (operation, duration, metadata, success = true) => {
        const performanceData = {
            type: 'PERFORMANCE',
            subType: success ? 'SUCCESS' : 'FAILURE',
            correlationId: generateCorrelationId(),
            timestamp: new Date().toISOString(),
            operation,
            duration,
            success,
            metadata: {
                ...metadata,
                memoryUsage: metadata?.memoryUsage,
                cpuUsage: metadata?.cpuUsage,
                databaseConnections: metadata?.databaseConnections,
                activePositions: metadata?.activePositions,
            },
        };
        if (duration > 5000) {
            exports.logger.warn('Slow operation detected', performanceData);
        }
        else {
            exports.logger.info('Performance metric', performanceData);
        }
    },
    security: (event, details, severity = 'MEDIUM') => {
        const securityData = {
            type: 'SECURITY',
            subType: event.toUpperCase(),
            correlationId: generateCorrelationId(),
            timestamp: new Date().toISOString(),
            event,
            severity,
            details: {
                ...details,
                ipAddress: details?.ipAddress,
                userAgent: details?.userAgent,
                userId: details?.userId,
                sessionId: details?.sessionId,
            },
        };
        if (severity === 'CRITICAL' || severity === 'HIGH') {
            exports.logger.error('Security event', securityData);
        }
        else {
            exports.logger.warn('Security monitoring', securityData);
        }
        if (process.env.AUDIT_LOG_ENABLED === 'true') {
            exports.logger.error('Security audit', {
                ...securityData,
                auditType: 'SECURITY_EVENT',
                regulatoryCompliance: true,
                retentionPeriod: '10_years',
            });
        }
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