import { TradingSignal } from '@/types/ai.types';
import { MarketAnalysis } from '@/types';
export declare class AIService {
    private geminiApiKey;
    private model;
    private multiAIService?;
    private promptEngineering?;
    private costOptimization?;
    private useMultiProvider;
    constructor();
    generateTradingSignal(symbol: string, marketData: MarketAnalysis): Promise<TradingSignal>;
    private generateMultiProviderSignal;
    private generateGeminiSignal;
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
        multiProvider?: {
            enabled: boolean;
            providers?: Record<string, boolean>;
            cacheStats?: {
                size: number;
                hitRate: number;
            };
        };
    }>;
    getAIMetrics(): Promise<{
        gemini: {
            status: boolean;
            model: string;
        };
        multiProvider?: {
            providers: Record<string, any>;
            cache: any;
            cost: any;
        };
        performance: {
            totalRequests: number;
            successRate: number;
            averageResponseTime: number;
            dailyCost: number;
        };
    }>;
    private hasValidMultiProviderConfig;
    private initializeMultiProviderServices;
    private setupEventListeners;
    private createDynamicContext;
    private convertEnsembleToTradingSignal;
    private checkGeminiHealth;
}
export default AIService;
//# sourceMappingURL=ai.service.d.ts.map