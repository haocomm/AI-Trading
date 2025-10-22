"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostOptimizationService = void 0;
const logger_1 = require("@/utils/logger");
const events_1 = require("events");
class CostOptimizationService extends events_1.EventEmitter {
    constructor(strategy) {
        super();
        this.requestQueue = new Map();
        this.batchTimers = new Map();
        this.costHistory = [];
        this.strategy = strategy;
        this.costMetrics = {
            totalCost: 0,
            tokenCosts: { input: 0, output: 0 },
            providerCosts: {},
            dailyCost: 0,
            monthlyCost: 0,
            costPerRequest: 0,
            savingsFromCaching: 0,
            savingsFromBatching: 0
        };
        this.pricingData = new Map();
        this.initializeDefaultPricing();
        this.startCostTracking();
    }
    async optimizeRequest(request, providerName, priority = 'MEDIUM') {
        try {
            if (this.strategy.caching) {
                const cacheKey = this.generateCacheKey(request, providerName);
                const cached = await this.checkCache(cacheKey);
                if (cached) {
                    return {
                        optimizedRequest: request,
                        estimatedCost: 0,
                        cachingEnabled: true,
                        batchingEnabled: false
                    };
                }
            }
            const optimizedRequest = await this.optimizeRequestForCost(request, providerName);
            const estimatedCost = this.estimateRequestCost(optimizedRequest, providerName);
            if (estimatedCost > this.strategy.costThreshold) {
                optimizedRequest.maxTokens = Math.floor((this.strategy.costThreshold / estimatedCost) * (optimizedRequest.maxTokens || 1000));
            }
            let batchingEnabled = false;
            if (this.strategy.batching && priority === 'LOW') {
                this.addToBatch(providerName, optimizedRequest);
                batchingEnabled = true;
            }
            logger_1.tradingLogger.apiCall('CostOptimization', 'optimizeRequest', true, 0, {
                provider: providerName,
                estimatedCost,
                cachingEnabled: this.strategy.caching,
                batchingEnabled
            });
            return {
                optimizedRequest,
                estimatedCost,
                cachingEnabled: this.strategy.caching,
                batchingEnabled
            };
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Failed to optimize request'), {
                request,
                providerName,
                priority
            });
            return {
                optimizedRequest: request,
                estimatedCost: this.estimateRequestCost(request, providerName),
                cachingEnabled: false,
                batchingEnabled: false
            };
        }
    }
    async processBatch(providerName, requests, executeBatch) {
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        try {
            const optimizedRequests = requests.map(req => this.optimizeRequestForCost(req, providerName));
            const responses = await executeBatch(optimizedRequests);
            const totalCost = responses.reduce((sum, response) => {
                return sum + this.calculateActualCost(response, providerName);
            }, 0);
            const totalTime = Date.now() - startTime;
            if (this.strategy.caching) {
                for (let i = 0; i < responses.length; i++) {
                    const cacheKey = this.generateCacheKey(optimizedRequests[i], providerName);
                    await this.cacheResponse(cacheKey, responses[i]);
                }
            }
            const individualCost = requests.reduce((sum, req) => sum + this.estimateRequestCost(req, providerName), 0);
            const savings = Math.max(0, individualCost - totalCost);
            this.updateCostMetrics(totalCost, providerName, 'batch', savings);
            const batchResponse = {
                requestId: batchId,
                responses,
                success: true,
                errors: [],
                totalCost,
                totalTime
            };
            logger_1.tradingLogger.apiCall('CostOptimization', 'processBatch', true, totalTime, {
                provider: providerName,
                requestCount: requests.length,
                totalCost,
                savings
            });
            this.emit('batchProcessed', batchResponse);
            return batchResponse;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Batch processing failed'), {
                provider: providerName,
                requestCount: requests.length
            });
            const batchResponse = {
                requestId: batchId,
                responses: [],
                success: false,
                errors: [errorMessage],
                totalCost: 0,
                totalTime: Date.now() - startTime
            };
            this.emit('batchFailed', batchResponse, error);
            return batchResponse;
        }
    }
    setProviderPricing(providerName, pricing) {
        this.pricingData.set(providerName, pricing);
        logger_1.tradingLogger.apiCall('CostOptimization', 'setProviderPricing', true, 0, {
            provider: providerName,
            inputCost: pricing.inputTokenCost,
            outputCost: pricing.outputTokenCost
        });
    }
    updateStrategy(newStrategy) {
        this.strategy = { ...this.strategy, ...newStrategy };
        logger_1.tradingLogger.apiCall('CostOptimization', 'updateStrategy', true, 0, newStrategy);
        this.emit('strategyUpdated', this.strategy);
    }
    getCostMetrics() {
        return { ...this.costMetrics };
    }
    getCostAnalysis() {
        const now = Date.now();
        const dayAgo = now - (24 * 60 * 60 * 1000);
        const monthAgo = now - (30 * 24 * 60 * 60 * 1000);
        const dailyCost = this.costHistory
            .filter(entry => entry.timestamp > dayAgo)
            .reduce((sum, entry) => sum + entry.cost, 0);
        const monthlyCost = this.costHistory
            .filter(entry => entry.timestamp > monthAgo)
            .reduce((sum, entry) => sum + entry.cost, 0);
        const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);
        const previousDailyCost = this.costHistory
            .filter(entry => entry.timestamp > twoDaysAgo && entry.timestamp <= dayAgo)
            .reduce((sum, entry) => sum + entry.cost, 0);
        const dailyTrend = previousDailyCost > 0
            ? ((dailyCost - previousDailyCost) / previousDailyCost) * 100
            : 0;
        const providerCosts = {};
        this.costHistory
            .filter(entry => entry.timestamp > monthAgo)
            .forEach(entry => {
            providerCosts[entry.provider] = (providerCosts[entry.provider] || 0) + entry.cost;
        });
        const totalMonthlyCost = Object.values(providerCosts).reduce((sum, cost) => sum + cost, 0);
        const topCostProviders = Object.entries(providerCosts)
            .map(([provider, cost]) => ({
            provider,
            cost,
            percentage: totalMonthlyCost > 0 ? (cost / totalMonthlyCost) * 100 : 0
        }))
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 5);
        const savingsBreakdown = {
            caching: this.costMetrics.savingsFromCaching,
            batching: this.costMetrics.savingsFromBatching,
            optimization: this.calculateOptimizationSavings()
        };
        const recommendations = this.generateRecommendations(dailyTrend, topCostProviders, savingsBreakdown);
        return {
            dailyTrend,
            monthlyProjection: monthlyCost * (30 / this.getDaysInCurrentMonth()),
            topCostProviders,
            savingsBreakdown,
            recommendations
        };
    }
    resetCostTracking() {
        this.costMetrics = this.initializeCostMetrics();
        this.costHistory = [];
        logger_1.tradingLogger.apiCall('CostOptimization', 'resetCostTracking', true, 0);
    }
    async optimizeRequestForCost(request, providerName) {
        const optimized = { ...request };
        if (optimized.maxTokens && optimized.maxTokens > 2000) {
            optimized.maxTokens = Math.max(1000, Math.floor(optimized.maxTokens * 0.8));
        }
        if (optimized.temperature && optimized.temperature > 0.7) {
            optimized.temperature = 0.7;
        }
        if (this.strategy.enableCompression) {
            optimized.metadata = {
                ...optimized.metadata,
                compressResponse: true
            };
        }
        return optimized;
    }
    estimateRequestCost(request, providerName) {
        const pricing = this.pricingData.get(providerName);
        if (!pricing) {
            return 0.01;
        }
        const estimatedInputTokens = this.estimateTokenCount(request.prompt);
        const estimatedOutputTokens = request.maxTokens || 1000;
        const inputCost = estimatedInputTokens * pricing.inputTokenCost;
        const outputCost = estimatedOutputTokens * pricing.outputTokenCost;
        const requestCost = pricing.requestCost || 0;
        const totalCost = inputCost + outputCost + requestCost;
        const discount = this.getApplicableDiscount(providerName, totalCost);
        return totalCost * (1 - discount);
    }
    calculateActualCost(response, providerName) {
        const pricing = this.pricingData.get(providerName);
        if (!pricing) {
            return response.cost || 0.01;
        }
        const inputCost = (response.usage?.promptTokens || 0) * pricing.inputTokenCost;
        const outputCost = (response.usage?.completionTokens || 0) * pricing.outputTokenCost;
        const requestCost = pricing.requestCost || 0;
        const totalCost = inputCost + outputCost + requestCost;
        const discount = this.getApplicableDiscount(providerName, totalCost);
        return totalCost * (1 - discount);
    }
    estimateTokenCount(text) {
        return Math.ceil(text.length / 4);
    }
    getApplicableDiscount(providerName, cost) {
        const pricing = this.pricingData.get(providerName);
        if (!pricing || !pricing.tierDiscounts) {
            return 0;
        }
        for (const tier of pricing.tierDiscounts) {
            if (cost >= tier.threshold) {
                return tier.discount;
            }
        }
        return 0;
    }
    generateCacheKey(request, providerName) {
        const keyData = {
            prompt: request.prompt.substring(0, 200),
            temperature: request.temperature || 0,
            maxTokens: request.maxTokens || 1000,
            provider: providerName
        };
        return Buffer.from(JSON.stringify(keyData)).toString('base64');
    }
    async checkCache(cacheKey) {
        return null;
    }
    async cacheResponse(cacheKey, response) {
    }
    addToBatch(providerName, request) {
        if (!this.requestQueue.has(providerName)) {
            this.requestQueue.set(providerName, []);
        }
        const queue = this.requestQueue.get(providerName);
        queue.push(request);
        if (queue.length >= this.strategy.batchSize) {
            this.processBatchQueue(providerName);
        }
        else if (!this.batchTimers.has(providerName)) {
            const timer = setTimeout(() => {
                this.processBatchQueue(providerName);
            }, this.strategy.batchTimeout);
            this.batchTimers.set(providerName, timer);
        }
    }
    processBatchQueue(providerName) {
        const queue = this.requestQueue.get(providerName);
        const timer = this.batchTimers.get(providerName);
        if (!queue || queue.length === 0)
            return;
        const batch = queue.splice(0, this.strategy.batchSize);
        if (timer) {
            clearTimeout(timer);
            this.batchTimers.delete(providerName);
        }
        this.emit('batchReady', providerName, batch);
    }
    initializeCostMetrics() {
        return {
            totalCost: 0,
            tokenCosts: {
                input: 0,
                output: 0
            },
            providerCosts: {},
            dailyCost: 0,
            monthlyCost: 0,
            costPerRequest: 0,
            savingsFromCaching: 0,
            savingsFromBatching: 0
        };
    }
    initializeDefaultPricing() {
        this.pricingData.set('OpenAI', {
            inputTokenCost: 0.00001,
            outputTokenCost: 0.00003,
            freeTokensPerMonth: 100000,
            tierDiscounts: [
                { threshold: 100, discount: 0.1 },
                { threshold: 500, discount: 0.2 },
                { threshold: 1000, discount: 0.3 }
            ]
        });
        this.pricingData.set('Claude', {
            inputTokenCost: 0.000008,
            outputTokenCost: 0.000024,
            tierDiscounts: [
                { threshold: 50, discount: 0.05 },
                { threshold: 200, discount: 0.15 }
            ]
        });
        this.pricingData.set('Custom', {
            inputTokenCost: 0.000005,
            outputTokenCost: 0.000015
        });
    }
    startCostTracking() {
        setInterval(() => {
            this.updateCostMetrics();
        }, 60 * 60 * 1000);
        setInterval(() => {
            const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
            this.costHistory = this.costHistory.filter(entry => entry.timestamp > cutoff);
        }, 24 * 60 * 60 * 1000);
    }
    updateCostMetrics(additionalCost = 0, providerName = '', type = 'request', savings = 0) {
        this.costMetrics.totalCost += additionalCost;
        if (providerName) {
            this.costMetrics.providerCosts[providerName] =
                (this.costMetrics.providerCosts[providerName] || 0) + additionalCost;
        }
        if (type === 'batch') {
            this.costMetrics.savingsFromBatching += savings;
        }
        else if (type === 'cache') {
            this.costMetrics.savingsFromCaching += savings;
        }
        this.costHistory.push({
            timestamp: Date.now(),
            cost: additionalCost,
            provider: providerName,
            type
        });
        const now = Date.now();
        const dayAgo = now - (24 * 60 * 60 * 1000);
        const monthAgo = now - (30 * 24 * 60 * 60 * 1000);
        this.costMetrics.dailyCost = this.costHistory
            .filter(entry => entry.timestamp > dayAgo)
            .reduce((sum, entry) => sum + entry.cost, 0);
        this.costMetrics.monthlyCost = this.costHistory
            .filter(entry => entry.timestamp > monthAgo)
            .reduce((sum, entry) => sum + entry.cost, 0);
        this.costMetrics.costPerRequest = this.costMetrics.totalCost /
            Math.max(1, this.costHistory.filter(entry => entry.type !== 'cache').length);
    }
    calculateOptimizationSavings() {
        return this.costHistory.reduce((savings, entry) => {
            const originalCost = entry.cost * 1.2;
            return savings + (originalCost - entry.cost);
        }, 0);
    }
    generateRecommendations(dailyTrend, topCostProviders, savingsBreakdown) {
        const recommendations = [];
        if (dailyTrend > 20) {
            recommendations.push('Daily costs are rising rapidly (+20%). Consider reducing request frequency or enabling more aggressive caching.');
        }
        else if (dailyTrend < -10) {
            recommendations.push('Daily costs are decreasing. Current optimization strategies are effective.');
        }
        if (topCostProviders.length > 0) {
            const topProvider = topCostProviders[0];
            if (topProvider.percentage > 60) {
                recommendations.push(`${topProvider.provider} accounts for ${topProvider.percentage.toFixed(1)}% of costs. Consider diversifying providers or optimizing usage.`);
            }
        }
        const totalSavings = savingsBreakdown.caching + savingsBreakdown.batching + savingsBreakdown.optimization;
        if (totalSavings < 100) {
            recommendations.push('Consider enabling more aggressive cost optimization strategies.');
        }
        if (savingsBreakdown.caching === 0 && this.strategy.caching) {
            recommendations.push('Caching is enabled but no savings detected. Check cache implementation.');
        }
        if (savingsBreakdown.batching === 0 && this.strategy.batching) {
            recommendations.push('Batching is enabled but no savings detected. Consider adjusting batch size or timeout.');
        }
        return recommendations;
    }
    getDaysInCurrentMonth() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        return new Date(year, month, 0).getDate();
    }
}
exports.CostOptimizationService = CostOptimizationService;
//# sourceMappingURL=cost-optimization.service.js.map