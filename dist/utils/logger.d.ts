import winston from 'winston';
export declare const logger: winston.Logger;
export declare const tradingLogger: {
    trade: (symbol: string, side: "BUY" | "SELL", quantity: number, price: number, orderId?: string) => void;
    position: (action: string, symbol: string, quantity: number, price: number, pnl?: number) => void;
    aiDecision: (symbol: string, action: "BUY" | "SELL" | "HOLD", confidence: number, reasoning: string) => void;
    risk: (type: string, details: any) => void;
    apiCall: (exchange: string, endpoint: string, success: boolean, responseTime?: number, error?: string) => void;
    alert: (type: string, message: string, data?: any) => void;
    marketData: (symbol: string, price: number, volume: number, change24h: number) => void;
};
export declare const logError: (error: Error, context?: any) => void;
export declare const logPerformance: (operation: string, startTime: number, metadata?: any) => void;
export declare const setupLogRotation: () => void;
export default logger;
//# sourceMappingURL=logger.d.ts.map