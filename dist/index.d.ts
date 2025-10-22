declare class TradingBot {
    private binanceService;
    private riskService;
    private decisionService;
    private alertService;
    private isRunning;
    private priceUpdateInterval;
    private aiDecisionInterval;
    constructor();
    initialize(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    private startPriceMonitoring;
    private startPositionMonitoring;
    private startAIDecisionMaking;
    private makeAIDecisions;
    private handlePriceUpdate;
    private handleTickerUpdate;
    private checkStopLevels;
    private updatePositionPrices;
    private closePosition;
    healthCheck(): Promise<{
        status: string;
        details: any;
    }>;
}
declare const bot: TradingBot;
export default bot;
//# sourceMappingURL=index.d.ts.map