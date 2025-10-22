import { BaseAIProvider } from './base.provider';
import { AIProviderRequest, AIProviderResponse, AIProviderConfig } from '@/types/ai.types';
export declare class ClaudeProvider extends BaseAIProvider {
    private readonly baseUrl;
    constructor(config: AIProviderConfig);
    get name(): string;
    generateResponse(request: AIProviderRequest): Promise<AIProviderResponse>;
    getModels(): string[];
    validateApiCall(requestData: any): boolean;
    parseResponse(response: any): AIProviderResponse;
    private buildRequestData;
    private buildSystemPrompt;
    generateTradingSignal(symbol: string, marketData: any, riskParams?: any, historicalContext?: any): Promise<AIProviderResponse>;
    generateMarketSentimentAnalysis(newsData: any[], socialMediaData: any[], marketMetrics: any[]): Promise<AIProviderResponse>;
    generateChainOfThoughtAnalysis(problem: string, availableData: any[], constraints: any[]): Promise<AIProviderResponse>;
    generateRiskScenarioAnalysis(portfolio: any, marketScenarios: any[]): Promise<AIProviderResponse>;
    private buildDetailedTradingPrompt;
}
//# sourceMappingURL=claude.provider.d.ts.map