interface AlertData {
    type: 'TRADE' | 'POSITION' | 'RISK' | 'SYSTEM' | 'AI_DECISION' | 'DAILY_SUMMARY';
    title: string;
    message: string;
    data?: any;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    timestamp: number;
}
interface TradeAlert {
    symbol: string;
    action: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    orderId?: string;
    confidence?: number;
    reasoning?: string;
}
interface PositionAlert {
    symbol: string;
    action: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    pnl: number;
    reason: string;
}
export declare class AlertService {
    private isEnabled;
    private lastDailySummary;
    private dailyPnL;
    private dailyTrades;
    constructor();
    sendAlert(alertData: AlertData): Promise<boolean>;
    sendTradeAlert(tradeData: TradeAlert): Promise<boolean>;
    sendPositionAlert(positionData: PositionAlert): Promise<boolean>;
    sendRiskAlert(riskType: string, details: any): Promise<boolean>;
    sendAIAlert(symbol: string, action: string, confidence: number, reasoning: string): Promise<boolean>;
    sendDailySummary(): Promise<boolean>;
    sendSystemAlert(error: Error, context?: any): Promise<boolean>;
    private sendWebhookAlert;
    private sendEmailAlert;
    private formatAlertMessage;
    private formatTradeMessage;
    private formatPositionMessage;
    private formatRiskMessage;
    private formatAIMessage;
    private formatDailySummary;
    private formatSystemMessage;
    private formatAlertFields;
    private formatHTMLEmail;
    private getAlertColor;
    updateDailyStats(pnl: number, trades: number): void;
    healthCheck(): Promise<{
        status: string;
        enabled: boolean;
        webhookConfigured: boolean;
        emailConfigured: boolean;
        lastDailySummary: string;
    }>;
}
export default AlertService;
//# sourceMappingURL=alert.service.d.ts.map