import winston from 'winston';
import { loggingConfig, environmentFeatures } from '@/config';
import fs from 'fs';
import path from 'path';

// Ensure log directories exist
const ensureLogDirectory = (filePath: string) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Enhanced structured JSON format for production
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Create structured log entry
    const logEntry: any = {
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

    // Add correlation ID if available
    if (meta.correlationId) {
      logEntry.correlationId = meta.correlationId;
    }

    // Add trace information for debugging
    if (environmentFeatures.allowsDebugMode && meta.trace) {
      logEntry.trace = meta.trace;
    }

    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    if (Object.keys(meta).length > 0) {
      if (meta.symbol) msg += ` (${meta.symbol})`;
      if (meta.side) msg += ` ${meta.side}`;
      if (meta.quantity) msg += ` ${meta.quantity}`;
      if (meta.price) msg += ` @${meta.price}`;
      if (meta.duration) msg += ` [${meta.duration}ms]`;
      if (meta.correlationId) msg += ` [${meta.correlationId}]`;
    }

    return msg;
  })
);

// Determine log format based on environment
const logFormat = process.env.LOG_STRUCTURED === 'true' ? productionFormat : consoleFormat;

// Create main logger instance
export const logger = winston.createLogger({
  level: loggingConfig.level,
  format: logFormat,
  defaultMeta: {
    service: 'ai-trading',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [],
});

// Add file transports with proper path handling
ensureLogDirectory(loggingConfig.file);

// Error log file
logger.add(new winston.transports.File({
  filename: loggingConfig.file.replace('.log', '-error.log'),
  level: 'error',
  maxsize: parseInt(process.env.LOG_MAX_SIZE_MB || '100') * 1024 * 1024, // Configurable size
  maxFiles: parseInt(process.env.LOG_MAX_FILES || '30'),
  format: productionFormat, // Always use structured format for files
}));

// Combined log file
logger.add(new winston.transports.File({
  filename: loggingConfig.file,
  maxsize: parseInt(process.env.LOG_MAX_SIZE_MB || '100') * 1024 * 1024,
  maxFiles: parseInt(process.env.LOG_MAX_FILES || '30'),
  format: productionFormat, // Always use structured format for files
}));

// Audit log file for compliance
if (process.env.AUDIT_LOG_ENABLED === 'true') {
  const auditLogFile = process.env.AUDIT_LOG_FILE || './logs/audit.log';
  ensureLogDirectory(auditLogFile);

  logger.add(new winston.transports.File({
    filename: auditLogFile,
    level: 'info',
    maxsize: 50 * 1024 * 1024, // 50MB for audit logs
    maxFiles: 90, // Keep 90 days of audit logs
    format: productionFormat,
  }));
}

// Trade log file for detailed trade tracking
if (process.env.TRADE_LOG_ENABLED === 'true') {
  const tradeLogFile = process.env.TRADE_LOG_FILE || './logs/trades.log';
  ensureLogDirectory(tradeLogFile);

  logger.add(new winston.transports.File({
    filename: tradeLogFile,
    level: 'info',
    maxsize: 20 * 1024 * 1024, // 20MB for trade logs
    maxFiles: 30, // Keep 30 days of trade logs
    format: productionFormat,
  }));
}

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Correlation ID generator for request tracking
let correlationCounter = 0;
const generateCorrelationId = (): string => {
  return `req_${Date.now()}_${++correlationCounter}`;
};

// Enhanced trading-specific logging functions with audit trails
export const tradingLogger = {
  // Trade execution logs with comprehensive audit trail
  trade: (
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    orderId?: string,
    metadata?: any
  ) => {
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

    // Log to main logger
    logger.info('Trade executed', tradeData);

    // Log to trade-specific log if enabled
    if (process.env.TRADE_LOG_ENABLED === 'true') {
      logger.info('Trade execution audit', {
        ...tradeData,
        auditType: 'TRADE_EXECUTION',
        regulatoryCompliance: true,
      });
    }

    return correlationId;
  },

  // Position management logs with detailed tracking
  position: (
    action: string,
    symbol: string,
    quantity: number,
    price: number,
    pnl?: number,
    correlationId?: string,
    metadata?: any
  ) => {
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

    logger.info('Position update', positionData);

    // Log to audit trail for compliance
    if (process.env.AUDIT_LOG_ENABLED === 'true') {
      logger.info('Position management audit', {
        ...positionData,
        auditType: 'POSITION_MANAGEMENT',
        regulatoryCompliance: true,
      });
    }
  },

  // Enhanced AI decision logs with reasoning chain
  aiDecision: (
    symbol: string,
    action: 'BUY' | 'SELL' | 'HOLD',
    confidence: number,
    reasoning: string,
    provider?: string,
    modelVersion?: string,
    metadata?: any
  ) => {
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

    logger.info('AI decision', decisionData);

    // Log detailed AI decision to audit trail
    if (process.env.AUDIT_LOG_ENABLED === 'true') {
      logger.info('AI decision audit', {
        ...decisionData,
        auditType: 'AI_DECISION',
        regulatoryCompliance: true,
        dataRetention: '7_years',
      });
    }
  },

  // Enhanced risk management logs with severity levels
  risk: (
    type: string,
    details: any,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM',
    correlationId?: string
  ) => {
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

    // Log with appropriate level based on severity
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      logger.error('Critical risk event', riskData);
    } else if (severity === 'MEDIUM') {
      logger.warn('Risk management alert', riskData);
    } else {
      logger.info('Risk monitoring', riskData);
    }

    // Always log risk events to audit trail
    if (process.env.AUDIT_LOG_ENABLED === 'true') {
      logger.error('Risk management audit', {
        ...riskData,
        auditType: 'RISK_MANAGEMENT',
        regulatoryCompliance: true,
        immediateAttention: severity === 'CRITICAL',
      });
    }
  },

  // Enhanced API call logs with performance metrics
  apiCall: (
    exchange: string,
    endpoint: string,
    success: boolean,
    responseTime?: number,
    error?: string,
    metadata?: any
  ) => {
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
      logger.info('API call successful', apiData);
    } else {
      logger.error('API call failed', apiData);
    }

    // Log API failures to audit trail
    if (!success && process.env.AUDIT_LOG_ENABLED === 'true') {
      logger.error('API failure audit', {
        ...apiData,
        auditType: 'API_FAILURE',
        regulatoryCompliance: true,
      });
    }
  },

  // Enhanced alert logs with delivery tracking
  alert: (
    type: string,
    message: string,
    data?: any,
    deliveryChannels?: string[],
    deliveryStatus?: Record<string, boolean>
  ) => {
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

    logger.info('Alert sent', alertData);

    // Log critical alerts to audit trail
    if (data?.severity === 'CRITICAL' && process.env.AUDIT_LOG_ENABLED === 'true') {
      logger.error('Critical alert audit', {
        ...alertData,
        auditType: 'CRITICAL_ALERT',
        regulatoryCompliance: true,
        immediateAttention: true,
      });
    }
  },

  // Enhanced market data logs with quality metrics
  marketData: (
    symbol: string,
    price: number,
    volume: number,
    change24h: number,
    metadata?: any
  ) => {
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

    logger.debug('Market data update', marketData);

    // Log data quality issues
    if (metadata?.dataQuality !== 'good' && process.env.AUDIT_LOG_ENABLED === 'true') {
      logger.warn('Market data quality issue', {
        ...marketData,
        auditType: 'DATA_QUALITY',
        regulatoryCompliance: true,
      });
    }
  },

  // System performance logs
  performance: (
    operation: string,
    duration: number,
    metadata?: any,
    success: boolean = true
  ) => {
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

    if (duration > 5000) { // Log slow operations as warnings
      logger.warn('Slow operation detected', performanceData);
    } else {
      logger.info('Performance metric', performanceData);
    }
  },

  // Security and compliance logs
  security: (
    event: string,
    details: any,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM'
  ) => {
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
      logger.error('Security event', securityData);
    } else {
      logger.warn('Security monitoring', securityData);
    }

    // Always log security events to audit trail
    if (process.env.AUDIT_LOG_ENABLED === 'true') {
      logger.error('Security audit', {
        ...securityData,
        auditType: 'SECURITY_EVENT',
        regulatoryCompliance: true,
        retentionPeriod: '10_years',
      });
    }
  },
};

// Error logging with context
export const logError = (error: Error, context?: any) => {
  logger.error('Application error', {
    type: 'ERROR',
    name: error.name,
    message: error.message,
    stack: error.stack,
    context,
  });
};

// Performance logging
export const logPerformance = (operation: string, startTime: number, metadata?: any) => {
  const duration = Date.now() - startTime;
  logger.info('Performance metric', {
    type: 'PERFORMANCE',
    operation,
    duration,
    ...metadata,
  });
};

// Create log rotation and cleanup
export const setupLogRotation = () => {
  // Log rotation is handled by winston transports with maxsize and maxFiles
  logger.info('Log rotation setup completed');
};

export default logger;