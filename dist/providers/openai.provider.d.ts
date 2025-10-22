import { BaseAIProvider } from './base.provider';
import { AIProviderRequest, AIProviderResponse, AIProviderConfig } from '@/types/ai.types';
export declare class OpenAIProvider extends BaseAIProvider {
    private readonly baseUrl;
    constructor(config: AIProviderConfig);
    get name(): string;
    generateResponse(request: AIProviderRequest): Promise<AIProviderResponse>;
    getModels(): string[];
    validateApiCall(requestData: any): boolean;
    parseResponse(response: any): AIProviderResponse;
    private buildRequestData;
    private buildSystemPrompt;
    generateTradingSignal(symbol: string, marketData: any, riskParams?: any): Promise<AIProviderResponse>;
    generateMarketAnalysis(symbols: string[], timeframe?: string): Promise<AIProviderResponse>;
    generateRiskAssessment(portfolio: any, marketConditions: any): Promise<AIProviderResponse>;
    private buildTradingPrompt;
}
//# sourceMappingURL=openai.provider.d.ts.map