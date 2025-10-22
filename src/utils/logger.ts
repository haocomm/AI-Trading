import winston from 'winston';
import { loggingConfig } from '@/config';

// Custom format for trading logs
const tradingFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta,
    });
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
    }

    return msg;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: loggingConfig.level,
  format: tradingFormat,
  defaultMeta: { service: 'ai-trading' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: loggingConfig.file.replace('.log', '-error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Combined log file
    new winston.transports.File({
      filename: loggingConfig.file,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Trading-specific logging functions
export const tradingLogger = {
  // Trade execution logs
  trade: (symbol: string, side: 'BUY' | 'SELL', quantity: number, price: number, orderId?: string) => {
    logger.info('Trade executed', {
      type: 'TRADE',
      symbol,
      side,
      quantity,
      price,
      orderId,
    });
  },

  // Position management logs
  position: (action: string, symbol: string, quantity: number, price: number, pnl?: number) => {
    logger.info('Position update', {
      type: 'POSITION',
      action,
      symbol,
      quantity,
      price,
      pnl,
    });
  },

  // AI decision logs
  aiDecision: (symbol: string, action: 'BUY' | 'SELL' | 'HOLD', confidence: number, reasoning: string) => {
    logger.info('AI decision', {
      type: 'AI_DECISION',
      symbol,
      action,
      confidence,
      reasoning,
    });
  },

  // Risk management logs
  risk: (type: string, details: any) => {
    logger.warn('Risk management', {
      type: 'RISK',
      riskType: type,
      details,
    });
  },

  // API call logs
  apiCall: (exchange: string, endpoint: string, success: boolean, responseTime?: number, error?: string) => {
    logger.info('API call', {
      type: 'API_CALL',
      exchange,
      endpoint,
      success,
      responseTime,
      error,
    });
  },

  // Alert logs
  alert: (type: string, message: string, data?: any) => {
    logger.info('Alert sent', {
      type: 'ALERT',
      alertType: type,
      message,
      data,
    });
  },

  // Market data logs
  marketData: (symbol: string, price: number, volume: number, change24h: number) => {
    logger.debug('Market data update', {
      type: 'MARKET_DATA',
      symbol,
      price,
      volume,
      change24h,
    });
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