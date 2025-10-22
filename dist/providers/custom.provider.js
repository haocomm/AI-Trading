"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomProvider = void 0;
const base_provider_1 = require("./base.provider");
const ai_types_1 = require("@/types/ai.types");
const logger_1 = require("@/utils/logger");
class CustomProvider extends base_provider_1.BaseAIProvider {
    constructor(config) {
        super(config);
        this.customModelEndpoints = new Map();
        this.initializeEndpoints();
    }
    get name() {
        return 'Custom';
    }
    async generateResponse(request) {
        const requestKey = this.generateRequestKey(request);
        return this.deduplicateRequest(requestKey, async () => {
            const startTime = Date.now();
            logger_1.tradingLogger.apiCall('Custom', 'generateResponse', true, 0);
            try {
                const requestData = this.buildRequestData(request);
                const endpoint = this.getEndpointForModel(request.model || this.config.defaultModel);
                if (!endpoint) {
                    throw new ai_types_1.AIProviderError(`No endpoint configured for model: ${request.model || this.config.defaultModel}`, this.name, 'NO_ENDPOINT', false);
                }
                const response = await this.makeApiRequest(endpoint, requestData);
                return this.parseResponse(response.data);
            }
            catch (error) {
                logger_1.tradingLogger.apiCall('Custom', 'generateResponse', false, Date.now() - startTime);
                throw error;
            }
        });
    }
    getModels() {
        return [
            'llama-3.1-405b',
            'llama-3.1-70b',
            'llama-3.1-8b',
            'mixtral-8x7b',
            'codellama-34b',
            'mistral-7b',
            ...this.config.models
        ];
    }
    validateApiCall(requestData) {
        return !!(requestData &&
            (requestData.messages || requestData.prompt || requestData.input));
    }
    parseResponse(response) {
        try {
            let content = '';
            let model = '';
            let usage;
            if (response.choices && response.choices[0]) {
                content = response.choices[0].message?.content || response.choices[0].text || '';
                model = response.model || 'custom-model';
                usage = response.usage;
            }
            else if (response.content) {
                content = response.content;
                model = response.model || 'custom-model';
                usage = response.usage;
            }
            else if (response.output) {
                content = response.output;
                model = response.model || 'custom-model';
                usage = response.usage;
            }
            else if (response.text) {
                content = response.text;
                model = response.model || 'custom-model';
                usage = response.usage;
            }
            else {
                content = JSON.stringify(response);
                model = 'custom-model-unknown';
                logger_1.tradingLogger.apiCall('Custom', 'parseResponse', false, 0);
            }
            if (!content) {
                throw new ai_types_1.AIProviderError('No content found in custom model response', this.name, 'NO_CONTENT', false);
            }
            return this.createResponse(content, model, usage);
        }
        catch (error) {
            if (error instanceof ai_types_1.AIProviderError) {
                throw error;
            }
            throw new ai_types_1.AIProviderError(`Failed to parse custom model response: ${error instanceof Error ? error.message : 'Unknown error'}`, this.name, 'PARSE_ERROR', false);
        }
    }
    async generateLlamaResponse(request, systemPrompt) {
        const llamaRequest = {
            ...request,
            metadata: {
                ...request.metadata,
                modelType: 'llama',
                systemPrompt
            }
        };
        return this.generateResponse(llamaRequest);
    }
    async generateMixtralResponse(request, expertMode = false) {
        const mixtralRequest = {
            ...request,
            temperature: expertMode ? 0.1 : (request.temperature ?? this.config.temperature),
            metadata: {
                ...request.metadata,
                modelType: 'mixtral',
                expertMode
            }
        };
        return this.generateResponse(mixtralRequest);
    }
    async generateCodeAnalysisResponse(code, question) {
        const prompt = `Analyze the following trading-related code:

\`\`\`
${code}
\`\`\`

Question: ${question}

Please provide:
1. Code analysis and explanation
2. Potential issues or improvements
3. Trading logic validation
4. Risk assessment of the implementation
5. Optimization suggestions

Focus on trading-specific aspects like risk management, position sizing, and market data handling.`;
        return this.generateResponse({
            prompt,
            temperature: 0.2,
            maxTokens: 2048,
            metadata: {
                type: 'code_analysis',
                codeLength: code.length,
                question
            }
        });
    }
    async generateQuantitativeAnalysis(data, analysisType) {
        const prompt = `Perform quantitative ${analysisType} analysis on the following data:

Data: ${JSON.stringify(data.slice(0, 1000))} // Limiting to first 1000 items for brevity

Data shape: ${data.length} records, ${data[0] ? Object.keys(data[0]).length : 0} fields

Please provide:
1. Detailed ${analysisType} analysis
2. Statistical significance tests
3. Key findings and insights
4. Trading implications
5. Confidence intervals
6. Recommendations based on results

Use appropriate statistical methods and explain your assumptions.`;
        return this.generateResponse({
            prompt,
            temperature: 0.1,
            maxTokens: 3000,
            metadata: {
                type: 'quantitative_analysis',
                analysisType,
                dataSize: data.length
            }
        });
    }
    async generateFineTunedResponse(request, fineTunedModel) {
        const endpoint = this.getEndpointForModel(fineTunedModel);
        if (!endpoint) {
            throw new ai_types_1.AIProviderError(`No endpoint configured for fine-tuned model: ${fineTunedModel}`, this.name, 'NO_FINE_TUNED_ENDPOINT', false);
        }
        const fineTunedRequest = {
            ...request,
            model: fineTunedModel,
            metadata: {
                ...request.metadata,
                fineTuned: true,
                baseModel: this.config.defaultModel
            }
        };
        return this.generateResponse(fineTunedRequest);
    }
    addModelEndpoint(model, endpoint) {
        this.customModelEndpoints.set(model, endpoint);
        logger_1.tradingLogger.apiCall('Custom', 'addModelEndpoint', true, 0, `Model: ${model}, Endpoint: ${endpoint}`);
    }
    removeModelEndpoint(model) {
        this.customModelEndpoints.delete(model);
        logger_1.tradingLogger.apiCall('Custom', 'removeModelEndpoint', true, 0, `Model: ${model}`);
    }
    initializeEndpoints() {
        this.customModelEndpoints.set('llama-3.1-405b', `${this.config.baseUrl}/v1/chat/completions`);
        this.customModelEndpoints.set('llama-3.1-70b', `${this.config.baseUrl}/v1/chat/completions`);
        this.customModelEndpoints.set('mixtral-8x7b', `${this.config.baseUrl}/v1/chat/completions`);
        this.customModelEndpoints.set('mistral-7b', `${this.config.baseUrl}/v1/chat/completions`);
    }
    buildRequestData(request) {
        if (this.isOpenAICompatible()) {
            return this.buildOpenAICompatibleRequest(request);
        }
        return this.buildGenericRequest(request);
    }
    buildOpenAICompatibleRequest(request) {
        const messages = [];
        messages.push({
            role: 'system',
            content: this.buildSystemPrompt()
        });
        if (request.context) {
            messages.push({
                role: 'system',
                content: `Context: ${request.context}`
            });
        }
        messages.push({
            role: 'user',
            content: request.prompt
        });
        return {
            model: request.model || this.config.defaultModel,
            messages,
            temperature: request.temperature ?? this.config.temperature,
            max_tokens: request.maxTokens || this.config.maxTokens,
            stream: false
        };
    }
    buildGenericRequest(request) {
        return {
            model: request.model || this.config.defaultModel,
            prompt: request.prompt,
            context: request.context,
            temperature: request.temperature ?? this.config.temperature,
            max_tokens: request.maxTokens || this.config.maxTokens,
            metadata: request.metadata
        };
    }
    buildSystemPrompt() {
        return `You are a custom AI model integrated into a cryptocurrency trading system. Your role is to provide expert-level analysis and trading recommendations.

Trading principles:
1. Risk management is paramount
2. Use data-driven analysis
3. Provide clear, actionable recommendations
4. Consider multiple market factors
5. Maintain consistency in decision-making

Response guidelines:
- Be specific and precise
- Include risk assessments
- Provide reasoning for recommendations
- Consider market volatility and liquidity
- Account for potential correlations

Focus on delivering high-quality, actionable trading insights while managing risk appropriately.`;
    }
    getEndpointForModel(model) {
        return this.customModelEndpoints.get(model);
    }
    isOpenAICompatible() {
        const baseUrl = this.config.baseUrl || '';
        return baseUrl.includes('openai') || baseUrl.includes('v1/chat/completions');
    }
}
exports.CustomProvider = CustomProvider;
//# sourceMappingURL=custom.provider.js.map