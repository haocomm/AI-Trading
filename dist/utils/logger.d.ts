import winston from 'winston';
export declare const logger: winston.Logger;
export declare const tradingLogger: {
    trade: (symbol: string, side: "BUY" | "SELL", quantity: number, price: number, orderId?: string, metadata?: any) => string;
    position: (action: string, symbol: string, quantity: number, price: number, pnl?: number, correlationId?: string, metadata?: any) => void;
    aiDecision: (symbol: string, action: "BUY" | "SELL" | "HOLD", confidence: number, reasoning: string, provider?: string, modelVersion?: string, metadata?: any) => void;
    risk: (type: string, details: any, severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", correlationId?: string) => void;
    apiCall: (exchange: string, endpoint: string, success: boolean, responseTime?: number, error?: string, metadata?: any) => void;
    alert: (type: string, message: string, data?: any, deliveryChannels?: string[], deliveryStatus?: Record<string, boolean>) => void;
    marketData: (symbol: string, price: number, volume: number, change24h: number, metadata?: any) => void;
    performance: (operation: string, duration: number, metadata?: any, success?: boolean) => void;
    security: (event: string, details: any, severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") => void;
};
export declare const logError: (error: Error, context?: any) => void;
export declare const logPerformance: (operation: string, startTime: number, metadata?: any) => void;
export declare const setupLogRotation: () => void;
export default logger;
//# sourceMappingURL=logger.d.ts.map