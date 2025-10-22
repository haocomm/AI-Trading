interface MarketAnalysis {
    symbol: string;
    currentPrice: number;
    priceChange24h: number;
    volume: number;
    high24h: number;
    low24h: number;
    volatility: number;
    trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
    momentum: number;
    support: number;
    resistance: number;
}
interface TradingSignal {
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reasoning: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    positionSize: number;
    riskReward: number;
}
export declare class AIService {
    private geminiApiKey;
    private model;
    constructor();
    generateTradingSignal(symbol: string, marketData: MarketAnalysis): Promise<TradingSignal>;
    private buildTradingPrompt;
    private callGeminiAPI;
    private parseAIResponse;
    private calculatePositionSize;
    analyzeMarketData(symbol: string, exchange?: 'binance' | 'bitkub'): Promise<MarketAnalysis>;
    analyzeMultipleSymbols(symbols: string[]): Promise<MarketAnalysis[]>;
    getRecentDecisions(symbol?: string, limit?: number): Promise<any[]>;
    updateDecisionExecution(decisionId: string, executed: boolean, result?: 'PROFIT' | 'LOSS' | 'BREAK_EVEN'): Promise<void>;
    healthCheck(): Promise<{
        status: string;
        model: string;
        lastCheck: string;
    }>;
}
export default AIService;
//# sourceMappingURL=ai.service.d.ts.map