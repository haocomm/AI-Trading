"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAIProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const ai_types_1 = require("@/types/ai.types");
class BaseAIProvider {
    constructor(config) {
        this.requestQueue = new Map();
        this.config = config;
        this.metrics = {
            provider: '',
            model: config.defaultModel,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            averageConfidence: 0,
            accuracy: 0,
            totalCost: 0,
            uptime: Date.now(),
            lastUsed: 0,
            errors: []
        };
    }
    async isHealthy() {
        try {
            const testRequest = {
                prompt: "Health check - respond with 'OK'",
                maxTokens: 10,
                temperature: 0
            };
            const response = await this.generateResponse(testRequest);
            return response.content.toLowerCase().includes('ok');
        }
        catch (error) {
            this.recordError(error instanceof Error ? error : new Error('Health check failed'));
            return false;
        }
    }
    getMetrics() {
        return { ...this.metrics };
    }
    validateConfig() {
        return !!(this.config.apiKey &&
            this.config.baseUrl &&
            this.config.models.length > 0 &&
            this.config.defaultModel &&
            this.config.models.includes(this.config.defaultModel));
    }
    async makeApiRequest(endpoint, data, config) {
        const startTime = Date.now();
        try {
            await this.checkRateLimit();
            const requestConfig = {
                timeout: this.config.timeout,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    ...config?.headers
                },
                ...config
            };
            if (!this.validateApiCall(data)) {
                throw new ai_types_1.AIProviderError('Invalid request data', this.name, 'INVALID_REQUEST', false);
            }
            const response = await axios_1.default.post(endpoint, data, requestConfig);
            this.updateMetrics(Date.now() - startTime, true);
            return response;
        }
        catch (error) {
            this.updateMetrics(Date.now() - startTime, false);
            this.recordError(error);
            if (error.response) {
                throw new ai_types_1.AIProviderError(`API Error: ${error.response.data?.error?.message || error.response.statusText}`, this.name, error.response.status?.toString() || 'API_ERROR', this.isRecoverableError(error.response.status));
            }
            else if (error.request) {
                throw new ai_types_1.AIProviderError('Network error - no response received', this.name, 'NETWORK_ERROR', true);
            }
            else {
                throw new ai_types_1.AIProviderError(error.message || 'Unknown API error', this.name, 'UNKNOWN_ERROR', false);
            }
        }
    }
    createResponse(content, model, usage, startTime) {
        const responseTime = startTime ? Date.now() - startTime : 0;
        const cost = this.calculateCost(usage);
        return {
            content,
            model,
            provider: this.name,
            usage: usage ? {
                promptTokens: usage.prompt_tokens || 0,
                completionTokens: usage.completion_tokens || 0,
                totalTokens: usage.total_tokens || 0
            } : undefined,
            cost,
            responseTime,
            timestamp: Date.now()
        };
    }
    calculateCost(usage) {
        if (!usage)
            return 0;
        const promptTokens = usage.prompt_tokens || 0;
        const completionTokens = usage.completion_tokens || 0;
        return ((promptTokens * this.config.pricing.inputTokenCost) +
            (completionTokens * this.config.pricing.outputTokenCost));
    }
    async checkRateLimit() {
        const now = Date.now();
        const windowMs = 60000;
        const requestsInWindow = this.metrics.errors.filter(e => now - e.timestamp < windowMs).length;
        if (requestsInWindow >= this.config.rateLimit.requestsPerMinute) {
            throw new ai_types_1.AIProviderError('Rate limit exceeded', this.name, 'RATE_LIMIT', true);
        }
    }
    setProviderName(name) {
        this.metrics.provider = name;
    }
    updateMetrics(responseTime, success) {
        this.metrics.totalRequests++;
        this.metrics.lastUsed = Date.now();
        if (success) {
            this.metrics.successfulRequests++;
            const totalTime = this.metrics.averageResponseTime * (this.metrics.successfulRequests - 1) + responseTime;
            this.metrics.averageResponseTime = totalTime / this.metrics.successfulRequests;
        }
        else {
            this.metrics.failedRequests++;
        }
    }
    recordError(error) {
        const errorRecord = {
            timestamp: Date.now(),
            error: error.message || 'Unknown error',
            recoverable: this.isRecoverableError(error.code)
        };
        this.metrics.errors.push(errorRecord);
        if (this.metrics.errors.length > 100) {
            this.metrics.errors = this.metrics.errors.slice(-100);
        }
    }
    isRecoverableError(statusCode) {
        const recoverableCodes = [429, 500, 502, 503, 504, 'NETWORK_ERROR', 'TIMEOUT'];
        return recoverableCodes.includes(statusCode);
    }
    deduplicateRequest(requestKey, requestFn) {
        const existingRequest = this.requestQueue.get(requestKey);
        if (existingRequest) {
            return existingRequest;
        }
        const promise = requestFn().finally(() => {
            this.requestQueue.delete(requestKey);
        });
        this.requestQueue.set(requestKey, promise);
        return promise;
    }
    generateRequestKey(request) {
        return `${this.name}-${request.prompt.substring(0, 50)}-${request.temperature || 0}-${request.maxTokens || 0}`;
    }
}
exports.BaseAIProvider = BaseAIProvider;
//# sourceMappingURL=base.provider.js.map