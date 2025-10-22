import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { AIProviderInterface, AIProviderRequest, AIProviderResponse, ProviderMetrics, AIProviderConfig } from '@/types/ai.types';
export declare abstract class BaseAIProvider implements AIProviderInterface {
    protected config: AIProviderConfig;
    protected metrics: ProviderMetrics;
    protected requestQueue: Map<string, Promise<AIProviderResponse>>;
    constructor(config: AIProviderConfig);
    abstract get name(): string;
    abstract generateResponse(request: AIProviderRequest): Promise<AIProviderResponse>;
    abstract getModels(): string[];
    abstract validateApiCall(requestData: any): boolean;
    abstract parseResponse(response: any): AIProviderResponse;
    isHealthy(): Promise<boolean>;
    getMetrics(): ProviderMetrics;
    validateConfig(): boolean;
    protected makeApiRequest(endpoint: string, data: any, config?: Partial<AxiosRequestConfig>): Promise<AxiosResponse>;
    protected createResponse(content: string, model: string, usage?: any, startTime?: number): AIProviderResponse;
    protected calculateCost(usage?: any): number;
    protected checkRateLimit(): Promise<void>;
    protected setProviderName(name: string): void;
    private updateMetrics;
    private recordError;
    private isRecoverableError;
    protected deduplicateRequest(requestKey: string, requestFn: () => Promise<AIProviderResponse>): Promise<AIProviderResponse>;
    protected generateRequestKey(request: AIProviderRequest): string;
}
//# sourceMappingURL=base.provider.d.ts.map