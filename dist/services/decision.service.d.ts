export declare class DecisionService {
    private aiService;
    private binanceService;
    private riskService;
    private alertService;
    private lastDecisionTime;
    private readonly DECISION_COOLDOWN_MS;
    constructor();
    makeTradingDecision(symbol: string): Promise<{
        action: 'BUY' | 'SELL' | 'HOLD';
        shouldExecute: boolean;
        reasoning: string;
        confidence: number;
    }>;
    makeBatchDecisions(symbols: string[]): Promise<any[]>;
    executeDecision(symbol: string, action: 'BUY' | 'SELL' | 'HOLD'): Promise<boolean>;
    private gatherMarketData;
    private validateWithRiskManagement;
    private executeBuyOrder;
    private executeSellOrder;
    private isDecisionInCooldown;
    analyzePerformance(): Promise<{
        totalDecisions: number;
        executedDecisions: number;
        profitableTrades: number;
        winRate: number;
        avgConfidence: number;
    }>;
    healthCheck(): Promise<{
        status: string;
        aiService: string;
        lastDecisions: any[];
        performance: any;
    }>;
}
export default DecisionService;
//# sourceMappingURL=decision.service.d.ts.map