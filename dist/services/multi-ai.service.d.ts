import { AIProviderResponse, AIProviderConfig, EnsembleDecision, EnsembleConfig, BatchResponse, ProviderMetrics } from '@/types/ai.types';
import { EventEmitter } from 'events';
export declare class MultiAIService extends EventEmitter {
    private providers;
    private cache;
    private batchQueue;
    private metrics;
    private ensembleConfig;
    private healthCheckInterval?;
    constructor(providerConfigs: Record<string, AIProviderConfig>, ensembleConfig: EnsembleConfig);
    generateSignal(symbol: string, marketData: any, options?: {
        useEnsemble?: boolean;
        useCache?: boolean;
        priority?: 'LOW' | 'MEDIUM' | 'HIGH';
        timeout?: number;
    }): Promise<EnsembleDecision | AIProviderResponse>;
    generateEnsembleDecision(symbol: string, marketData: any, timeout?: number): Promise<EnsembleDecision>;
    batchGenerateSignals(requests: Array<{
        symbol: string;
        marketData: any;
    }>, options?: {
        useEnsemble?: boolean;
        maxConcurrency?: number;
        timeout?: number;
    }): Promise<BatchResponse>;
    private generateProviderSignal;
    private parseProviderSignal;
    private aggregateSignals;
    private generateEnsembleReasoning;
    private assessRisk;
    private generateExecutionRecommendation;
    private selectProvidersForEnsemble;
    private selectBestProvider;
    private calculateProviderWeight;
    private getProviderReliability;
    private getProviderMetrics;
    private updateProviderMetrics;
    private buildTradingPrompt;
    private getCachedResponse;
    private cacheResponse;
    private generateCacheKey;
    private initializeProviders;
    private startHealthChecks;
    private chunkArray;
    getProviderList(): string[];
    getAllProviderMetrics(): Promise<Record<string, ProviderMetrics>>;
    getCacheStats(): {
        size: number;
        hitRate: number;
    };
    performHealthCheck(): Promise<Record<string, boolean>>;
    shutdown(): void;
}
//# sourceMappingURL=multi-ai.service.d.ts.map