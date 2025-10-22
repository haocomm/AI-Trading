import { PromptTemplate, DynamicPromptContext, ChainOfThoughtStep, MarketAnalysis, AIProviderRequest } from '@/types/ai.types';
import { EventEmitter } from 'events';
export declare class PromptEngineeringService extends EventEmitter {
    private templates;
    private contextHistory;
    private performanceMetrics;
    constructor();
    generateDynamicPrompt(templateId: string, variables: Record<string, any>, context: DynamicPromptContext): string;
    generateChainOfThoughtPrompt(problem: string, steps: ChainOfThoughtStep[], context: DynamicPromptContext): AIProviderRequest;
    generateRiskAwarePrompt(basePrompt: string, riskParams: {
        maxRisk: number;
        riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
        portfolioHeat: number;
        recentLosses: number;
    }, context: DynamicPromptContext): AIProviderRequest;
    generateMarketConditionPrompt(symbol: string, marketData: MarketAnalysis, indicators: Record<string, number>): AIProviderRequest;
    optimizePromptTemplate(templateId: string, performanceData: Array<{
        success: boolean;
        confidence: number;
        responseTime: number;
        accuracy: number;
    }>): PromptTemplate;
    createCustomTemplate(name: string, template: string, category: 'TRADING' | 'ANALYSIS' | 'RISK' | 'PORTFOLIO'): PromptTemplate;
    getTemplate(templateId: string): PromptTemplate | undefined;
    listTemplates(category?: string): PromptTemplate[];
    private buildContextPrompt;
    private buildRiskInstructions;
    private interpolateTemplate;
    private validateVariables;
    private buildContextString;
    private assessMarketCondition;
    private assessMarketSentiment;
    private assessRiskLevel;
    private buildMarketContextFactors;
    private extractVariables;
    private applyOptimizations;
    private addStructureToTemplate;
    private addContextToTemplate;
    private simplifyTemplate;
    private incrementVersion;
    private summarizeContext;
    private trackTemplateUsage;
    private trackTemplateOptimization;
}
//# sourceMappingURL=prompt-engineering.service.d.ts.map