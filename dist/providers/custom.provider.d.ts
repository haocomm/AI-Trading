import { BaseAIProvider } from './base.provider';
import { AIProviderRequest, AIProviderResponse, AIProviderConfig } from '@/types/ai.types';
export declare class CustomProvider extends BaseAIProvider {
    private customModelEndpoints;
    constructor(config: AIProviderConfig);
    get name(): string;
    generateResponse(request: AIProviderRequest): Promise<AIProviderResponse>;
    getModels(): string[];
    validateApiCall(requestData: any): boolean;
    parseResponse(response: any): AIProviderResponse;
    generateLlamaResponse(request: AIProviderRequest, systemPrompt?: string): Promise<AIProviderResponse>;
    generateMixtralResponse(request: AIProviderRequest, expertMode?: boolean): Promise<AIProviderResponse>;
    generateCodeAnalysisResponse(code: string, question: string): Promise<AIProviderResponse>;
    generateQuantitativeAnalysis(data: any[], analysisType: 'regression' | 'correlation' | 'volatility' | 'backtest'): Promise<AIProviderResponse>;
    generateFineTunedResponse(request: AIProviderRequest, fineTunedModel: string): Promise<AIProviderResponse>;
    addModelEndpoint(model: string, endpoint: string): void;
    removeModelEndpoint(model: string): void;
    private initializeEndpoints;
    private buildRequestData;
    private buildOpenAICompatibleRequest;
    private buildGenericRequest;
    private buildSystemPrompt;
    private getEndpointForModel;
    private isOpenAICompatible;
}
//# sourceMappingURL=custom.provider.d.ts.map