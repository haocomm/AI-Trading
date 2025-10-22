import { AIProviderRequest, AIProviderResponse, BatchResponse, OptimizationStrategy } from '@/types/ai.types';
import { EventEmitter } from 'events';
interface CostMetrics {
    totalCost: number;
    tokenCosts: {
        input: number;
        output: number;
    };
    providerCosts: Record<string, number>;
    dailyCost: number;
    monthlyCost: number;
    costPerRequest: number;
    savingsFromCaching: number;
    savingsFromBatching: number;
}
interface ProviderPricing {
    inputTokenCost: number;
    outputTokenCost: number;
    requestCost?: number;
    freeTokensPerMonth?: number;
    tierDiscounts?: Array<{
        threshold: number;
        discount: number;
    }>;
}
export declare class CostOptimizationService extends EventEmitter {
    private costMetrics;
    private pricingData;
    private requestQueue;
    private batchTimers;
    private strategy;
    private costHistory;
    constructor(strategy: OptimizationStrategy);
    optimizeRequest(request: AIProviderRequest, providerName: string, priority?: 'LOW' | 'MEDIUM' | 'HIGH'): Promise<{
        optimizedRequest: AIProviderRequest;
        estimatedCost: number;
        cachingEnabled: boolean;
        batchingEnabled: boolean;
    }>;
    processBatch(providerName: string, requests: AIProviderRequest[], executeBatch: (requests: AIProviderRequest[]) => Promise<AIProviderResponse[]>): Promise<BatchResponse>;
    setProviderPricing(providerName: string, pricing: ProviderPricing): void;
    updateStrategy(newStrategy: Partial<OptimizationStrategy>): void;
    getCostMetrics(): CostMetrics;
    getCostAnalysis(): {
        dailyTrend: number;
        monthlyProjection: number;
        topCostProviders: Array<{
            provider: string;
            cost: number;
            percentage: number;
        }>;
        savingsBreakdown: {
            caching: number;
            batching: number;
            optimization: number;
        };
        recommendations: string[];
    };
    resetCostTracking(): void;
    private optimizeRequestForCost;
    private estimateRequestCost;
    private calculateActualCost;
    private estimateTokenCount;
    private getApplicableDiscount;
    private generateCacheKey;
    private checkCache;
    private cacheResponse;
    private addToBatch;
    private processBatchQueue;
    private initializeCostMetrics;
    private initializeDefaultPricing;
    private startCostTracking;
    private updateCostMetrics;
    private calculateOptimizationSavings;
    private generateRecommendations;
    private getDaysInCurrentMonth;
}
export {};
//# sourceMappingURL=cost-optimization.service.d.ts.map