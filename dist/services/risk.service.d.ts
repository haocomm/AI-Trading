import { RiskMetrics, Trade } from '@/types';
interface PositionSize {
    quantity: number;
    riskAmount: number;
    stopLossPrice: number;
    takeProfitPrice: number;
}
export declare class RiskService {
    private dailyPnL;
    private emergencyStop;
    private lastResetTime;
    constructor();
    private resetDailyCounters;
    private loadDailyPnL;
    private calculatePositionPnL;
    validateTradeSize(symbol: string, side: 'BUY' | 'SELL', currentPrice: number, stopLossPrice?: number, portfolioValue?: number): Promise<PositionSize>;
    validateDailyLossLimit(tradePnL?: number): Promise<boolean>;
    validateMaxPositions(): Promise<boolean>;
    validateTradeExecution(symbol: string, side: 'BUY' | 'SELL', quantity: number, currentPrice: number, stopLossPrice?: number): Promise<boolean>;
    getPortfolioValue(): Promise<number>;
    getRiskMetrics(): Promise<RiskMetrics>;
    enableEmergencyStop(reason: string): void;
    disableEmergencyStop(): void;
    isEmergencyStopActive(): boolean;
    updateDailyPnL(trade: Trade): void;
    calculateDynamicStopLoss(currentPrice: number, volatility: number, side: 'BUY' | 'SELL'): number;
    calculateVolatility(symbol: string, periodMinutes?: number): Promise<number>;
}
export default RiskService;
//# sourceMappingURL=risk.service.d.ts.map