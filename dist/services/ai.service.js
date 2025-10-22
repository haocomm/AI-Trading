"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
const database_1 = require("@/models/database");
const multi_ai_service_1 = require("./multi-ai.service");
const prompt_engineering_service_1 = require("./prompt-engineering.service");
const cost_optimization_service_1 = require("./cost-optimization.service");
class AIService {
    constructor() {
        this.geminiApiKey = config_1.aiConfig.gemini.apiKey;
        this.model = config_1.aiConfig.gemini.model;
        this.useMultiProvider = config_1.aiConfig.ensemble.enabled && this.hasValidMultiProviderConfig();
        if (!this.geminiApiKey) {
            throw new Error('Gemini API key is required');
        }
        if (this.useMultiProvider) {
            this.initializeMultiProviderServices();
        }
    }
    async generateTradingSignal(symbol, marketData) {
        try {
            if (this.useMultiProvider && this.multiAIService) {
                return this.generateMultiProviderSignal(symbol, marketData);
            }
            else {
                return this.generateGeminiSignal(symbol, marketData);
            }
        }
        catch (error) {
            logger_1.tradingLogger.apiCall('AI', 'generateTradingSignal', false, undefined, error instanceof Error ? error.message : 'Unknown error');
            (0, logger_1.logError)(error instanceof Error ? error : new Error('AI signal generation failed'), { symbol, marketData });
            return {
                action: 'HOLD',
                confidence: 0,
                reasoning: `AI service error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                entryPrice: marketData.currentPrice,
                stopLoss: marketData.currentPrice * 0.98,
                takeProfit: marketData.currentPrice * 1.06,
                positionSize: 0,
                riskReward: 0,
                provider: 'gemini',
                model: this.model,
            };
        }
    }
    async generateMultiProviderSignal(symbol, marketData) {
        if (!this.multiAIService || !this.promptEngineering) {
            throw new Error('Multi-provider services not initialized');
        }
        const startTime = Date.now();
        try {
            const context = this.createDynamicContext(marketData);
            const prompt = this.promptEngineering.generateDynamicPrompt('trading_signal', {
                symbol,
                marketData: JSON.stringify(marketData, null, 2)
            }, context);
            const request = {
                prompt,
                temperature: 0.3,
                maxTokens: 1024,
                metadata: {
                    type: 'trading_signal',
                    symbol,
                    context,
                    timestamp: Date.now()
                }
            };
            const result = await this.multiAIService.generateSignal(symbol, marketData, {
                useEnsemble: true,
                useCache: config_1.aiConfig.caching.enabled,
                priority: 'MEDIUM'
            });
            let signal;
            if ('action' in result) {
                signal = this.convertEnsembleToTradingSignal(result);
            }
            else {
                signal = this.parseAIResponse(result, symbol, marketData.currentPrice);
            }
            database_1.db.insertAIDecision({
                symbol,
                action: signal.action,
                confidence: signal.confidence,
                reasoning: signal.reasoning,
                timestamp: Date.now(),
                executed: false,
                model: signal.model || 'ensemble',
                input_data: JSON.stringify({ marketData, context }),
            });
            const responseTime = Date.now() - startTime;
            logger_1.tradingLogger.aiDecision(symbol, signal.action, signal.confidence, signal.reasoning);
            logger_1.tradingLogger.apiCall('MultiAI', 'generateTradingSignal', true, responseTime, `Provider: ${signal.model}, Ensemble: ${'action' in result}`);
            return signal;
        }
        catch (error) {
            logger_1.tradingLogger.apiCall('MultiAI', 'fallbackToSingleProvider', true, 0, error instanceof Error ? error.message : 'Unknown error');
            return this.generateGeminiSignal(symbol, marketData);
        }
    }
    async generateGeminiSignal(symbol, marketData) {
        const prompt = this.buildTradingPrompt(symbol, marketData);
        const startTime = Date.now();
        const response = await this.callGeminiAPI(prompt);
        const responseTime = Date.now() - startTime;
        logger_1.tradingLogger.apiCall('gemini', 'generateTradingSignal', true, responseTime);
        const signal = this.parseAIResponse(response.data, symbol, marketData.currentPrice);
        database_1.db.insertAIDecision({
            symbol,
            action: signal.action,
            confidence: signal.confidence,
            reasoning: signal.reasoning,
            timestamp: Date.now(),
            executed: false,
            model: this.model,
            input_data: JSON.stringify(marketData),
        });
        logger_1.tradingLogger.aiDecision(symbol, signal.action, signal.confidence, signal.reasoning);
        return signal;
    }
    buildTradingPrompt(symbol, marketData) {
        return `You are an expert cryptocurrency trading AI specializing in technical analysis and risk management.

Analyze the following market data for ${symbol} and provide a trading recommendation:

MARKET DATA:
- Current Price: $${marketData.currentPrice.toLocaleString()}
- 24h Change: ${marketData.priceChange24h.toFixed(2)}%
- 24h Volume: ${marketData.volume.toLocaleString()}
- 24h High: $${marketData.high24h.toLocaleString()}
- 24h Low: $${marketData.low24h.toLocaleString()}
- Volatility: ${(marketData.volatility * 100).toFixed(2)}%
- Trend: ${marketData.trend}
- Momentum: ${marketData.momentum.toFixed(4)}
- Support Level: $${marketData.support.toLocaleString()}
- Resistance Level: $${marketData.resistance.toLocaleString()}

TRADING RULES:
1. Risk Management: Maximum 5% risk per trade
2. Stop Loss: Default 2% below entry (adjust for volatility)
3. Take Profit: Minimum 2:1 risk/reward ratio
4. Position Sizing: Based on 5% portfolio risk
5. Avoid overtrading during sideways markets
6. Consider market volatility for stop loss width

Provide your analysis in this EXACT JSON format:
{
  "action": "BUY|SELL|HOLD",
  "confidence": 0.00-1.00,
  "reasoning": "Detailed technical analysis explanation",
  "keyIndicators": ["RSI", "MACD", "Volume", "Support/Resistance"],
  "marketCondition": "BULLISH|BEARISH|SIDEWAYS|VOLATILE",
  "riskFactors": ["High volatility", "Low volume", "Overbought", "Oversold"],
  "expectedMove": "Percentage move expected",
  "timeframe": "Short-term (hours) / Medium-term (days)"
}

CRITICAL: Focus on risk management and preserve capital. High confidence (>0.8) required for BUY signals during bearish conditions.`;
    }
    async callGeminiAPI(prompt) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.geminiApiKey}`;
        const requestBody = {
            contents: [{
                    parts: [{
                            text: prompt
                        }]
                }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1024,
                candidateCount: 1,
            }
        };
        const response = await axios_1.default.post(url, requestBody, {
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data;
        }
        else {
            throw new Error('No response from Gemini API');
        }
    }
    parseAIResponse(response, symbol, currentPrice) {
        try {
            const text = response.candidates[0]?.content?.parts[0]?.text || '';
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in AI response');
            }
            const aiResponse = JSON.parse(jsonMatch[0]);
            const validActions = ['BUY', 'SELL', 'HOLD'];
            const action = validActions.includes(aiResponse.action) ? aiResponse.action : 'HOLD';
            const confidence = typeof aiResponse.confidence === 'number' ?
                Math.max(0, Math.min(1, aiResponse.confidence)) : 0;
            const stopLossPercentage = 0.02;
            const takeProfitPercentage = 0.06;
            const positionSize = action !== 'HOLD' ?
                this.calculatePositionSize(currentPrice, stopLossPercentage) : 0;
            return {
                action,
                confidence,
                reasoning: aiResponse.reasoning || 'No reasoning provided',
                entryPrice: currentPrice,
                stopLoss: currentPrice * (1 - stopLossPercentage),
                takeProfit: currentPrice * (1 + takeProfitPercentage),
                positionSize,
                riskReward: takeProfitPercentage / stopLossPercentage,
                provider: 'gemini',
                model: this.model,
            };
        }
        catch (error) {
            logger_1.tradingLogger.aiDecision(symbol, 'HOLD', 0, `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                action: 'HOLD',
                confidence: 0,
                reasoning: 'AI response parsing failed',
                entryPrice: currentPrice,
                stopLoss: currentPrice * 0.98,
                takeProfit: currentPrice * 1.06,
                positionSize: 0,
                riskReward: 0,
                provider: 'gemini',
                model: this.model,
            };
        }
    }
    calculatePositionSize(currentPrice, stopLossPercentage) {
        const portfolioValue = 1000;
        const riskAmount = portfolioValue * 0.05;
        const stopLossAmount = currentPrice * stopLossPercentage;
        return riskAmount / stopLossAmount;
    }
    async analyzeMarketData(symbol, exchange = 'binance') {
        try {
            const endTime = Date.now();
            const startTime = endTime - (24 * 60 * 60 * 1000);
            const historicalData = database_1.db.getHistoricalData(symbol, exchange, startTime, endTime);
            if (historicalData.length < 2) {
                throw new Error('Insufficient historical data');
            }
            const prices = historicalData.map(d => d.price);
            const currentPrice = prices[prices.length - 1];
            const previousPrice = prices[0];
            const priceChange24h = ((currentPrice - previousPrice) / previousPrice) * 100;
            const volumes = historicalData.map(d => d.volume);
            const totalVolume = volumes.reduce((sum, vol) => sum + vol, 0);
            const high24h = Math.max(...prices);
            const low24h = Math.min(...prices);
            const returns = [];
            for (let i = 1; i < prices.length; i++) {
                returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
            }
            const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
            const volatility = Math.sqrt(variance);
            let trend;
            if (priceChange24h > 2) {
                trend = 'BULLISH';
            }
            else if (priceChange24h < -2) {
                trend = 'BEARISH';
            }
            else {
                trend = 'SIDEWAYS';
            }
            const momentum = priceChange24h / 24;
            const sortedPrices = [...prices].sort((a, b) => a - b);
            const q1Index = Math.floor(sortedPrices.length * 0.25);
            const q3Index = Math.floor(sortedPrices.length * 0.75);
            const support = sortedPrices[q1Index];
            const resistance = sortedPrices[q3Index];
            return {
                symbol,
                currentPrice,
                priceChange24h,
                volume: totalVolume,
                high24h,
                low24h,
                volatility,
                trend,
                momentum,
                support,
                resistance,
            };
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Market analysis failed'), { symbol, exchange });
            throw error;
        }
    }
    async analyzeMultipleSymbols(symbols) {
        const analyses = [];
        for (const symbol of symbols) {
            try {
                const analysis = await this.analyzeMarketData(symbol);
                analyses.push(analysis);
                logger_1.tradingLogger.marketData(symbol, analysis.currentPrice, analysis.volume, analysis.priceChange24h);
            }
            catch (error) {
                (0, logger_1.logError)(error instanceof Error ? error : new Error(`Failed to analyze ${symbol}`), { symbol });
            }
        }
        return analyses;
    }
    async getRecentDecisions(symbol, limit = 50) {
        return database_1.db.getAIDecisions(symbol, limit);
    }
    async updateDecisionExecution(decisionId, executed, result) {
        try {
            logger_1.tradingLogger.aiDecision('UNKNOWN', 'HOLD', 1, `Decision ${decisionId} ${executed ? 'EXECUTED' : 'SKIPPED'}`);
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Failed to update decision execution'), { decisionId, executed, result });
        }
    }
    async healthCheck() {
        try {
            const geminiHealthy = await this.checkGeminiHealth();
            let multiProviderStatus = { enabled: this.useMultiProvider };
            if (this.useMultiProvider && this.multiAIService) {
                const providerHealth = await this.multiAIService.performHealthCheck();
                const cacheStats = this.multiAIService.getCacheStats();
                multiProviderStatus = {
                    enabled: true,
                    providers: providerHealth,
                    cacheStats
                };
            }
            return {
                status: geminiHealthy ? 'healthy' : 'unhealthy',
                model: this.model,
                lastCheck: new Date().toISOString(),
                multiProvider: multiProviderStatus
            };
        }
        catch (error) {
            return {
                status: 'error',
                model: this.model,
                lastCheck: new Date().toISOString(),
            };
        }
    }
    async getAIMetrics() {
        const metrics = {
            gemini: {
                status: await this.checkGeminiHealth(),
                model: this.model
            },
            performance: {
                totalRequests: 0,
                successRate: 0,
                averageResponseTime: 0,
                dailyCost: 0
            }
        };
        if (this.multiAIService && this.useMultiProvider) {
            const providerMetrics = await this.multiAIService.getAllProviderMetrics();
            const cacheStats = this.multiAIService.getCacheStats();
            metrics.multiProvider = {
                providers: providerMetrics,
                cache: cacheStats,
                cost: this.costOptimization?.getCostMetrics() || null
            };
        }
        return metrics;
    }
    hasValidMultiProviderConfig() {
        const { providers } = config_1.aiConfig;
        return !!(providers.openai.apiKey || providers.claude.apiKey || providers.custom.apiKey);
    }
    initializeMultiProviderServices() {
        try {
            const providerConfigs = {};
            if (config_1.aiConfig.providers.openai.apiKey) {
                providerConfigs.openai = {
                    name: 'OpenAI',
                    enabled: true,
                    apiKey: config_1.aiConfig.providers.openai.apiKey,
                    models: config_1.aiConfig.providers.openai.models,
                    defaultModel: config_1.aiConfig.providers.openai.defaultModel,
                    maxTokens: 2048,
                    temperature: 0.3,
                    timeout: 30000,
                    rateLimit: {
                        requestsPerMinute: 60,
                        tokensPerMinute: 90000
                    },
                    pricing: {
                        inputTokenCost: 0.00001,
                        outputTokenCost: 0.00003
                    },
                    weights: {
                        accuracy: 0.4,
                        speed: 0.3,
                        cost: 0.3
                    }
                };
            }
            if (config_1.aiConfig.providers.claude.apiKey) {
                providerConfigs.claude = {
                    name: 'Claude',
                    enabled: true,
                    apiKey: config_1.aiConfig.providers.claude.apiKey,
                    models: config_1.aiConfig.providers.claude.models,
                    defaultModel: config_1.aiConfig.providers.claude.defaultModel,
                    maxTokens: 2048,
                    temperature: 0.3,
                    timeout: 30000,
                    rateLimit: {
                        requestsPerMinute: 50,
                        tokensPerMinute: 40000
                    },
                    pricing: {
                        inputTokenCost: 0.000008,
                        outputTokenCost: 0.000024
                    },
                    weights: {
                        accuracy: 0.5,
                        speed: 0.3,
                        cost: 0.2
                    }
                };
            }
            if (config_1.aiConfig.providers.custom.apiKey) {
                providerConfigs.custom = {
                    name: 'Custom',
                    enabled: true,
                    apiKey: config_1.aiConfig.providers.custom.apiKey || 'dummy-key',
                    baseUrl: config_1.aiConfig.providers.custom.baseUrl,
                    models: config_1.aiConfig.providers.custom.models,
                    defaultModel: config_1.aiConfig.providers.custom.defaultModel,
                    maxTokens: 2048,
                    temperature: 0.3,
                    timeout: 30000,
                    rateLimit: {
                        requestsPerMinute: 100,
                        tokensPerMinute: 100000
                    },
                    pricing: {
                        inputTokenCost: 0.000005,
                        outputTokenCost: 0.000015
                    },
                    weights: {
                        accuracy: 0.3,
                        speed: 0.4,
                        cost: 0.3
                    }
                };
            }
            const ensembleConfig = {
                minProviders: config_1.aiConfig.ensemble.minProviders,
                maxProviders: 4,
                consensusThreshold: config_1.aiConfig.ensemble.consensusThreshold,
                disagreementThreshold: 0.3,
                fallbackStrategy: 'WEIGHTED_VOTE',
                weights: {
                    accuracy: 0.5,
                    speed: 0.2,
                    cost: 0.2,
                    diversity: 0.1
                },
                rebalancing: {
                    enabled: true,
                    frequency: 24,
                    performanceWindow: 168,
                    minSamples: 50
                }
            };
            this.multiAIService = new multi_ai_service_1.MultiAIService(providerConfigs, ensembleConfig);
            this.promptEngineering = new prompt_engineering_service_1.PromptEngineeringService();
            const costStrategy = {
                provider: 'gemini',
                caching: config_1.aiConfig.caching.enabled,
                batching: true,
                modelSelection: 'default',
                promptCompression: true,
                costThreshold: 0.10
            };
            this.costOptimization = new cost_optimization_service_1.CostOptimizationService(costStrategy);
            this.setupEventListeners();
            logger_1.tradingLogger.apiCall('AI', 'initializeMultiProviderServices', true, 0, `Providers: ${Object.keys(providerConfigs).join(', ')}, Ensemble: true`);
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Failed to initialize multi-provider services'), {});
            this.useMultiProvider = false;
        }
    }
    setupEventListeners() {
        if (!this.multiAIService)
            return;
        this.multiAIService.on('ensembleDecision', (decision) => {
            logger_1.tradingLogger.apiCall('Ensemble', 'decisionGenerated', true, 0, `Action: ${decision.action}, Confidence: ${decision.confidence}, Consensus: ${decision.consensus}, Providers: ${decision.providerSignals.length}`);
        });
        this.multiAIService.on('providerError', (error) => {
            (0, logger_1.logError)(new Error(`Provider error: ${error.message}`), { provider: error.provider });
        });
    }
    createDynamicContext(marketData) {
        const now = new Date();
        const volatilityLevel = marketData.volatility > 0.05 ? 'HIGH' :
            marketData.volatility > 0.02 ? 'MEDIUM' : 'LOW';
        const marketCondition = marketData.priceChange24h > 3 ? 'BULLISH' :
            marketData.priceChange24h < -3 ? 'BEARISH' :
                marketData.volatility > 0.05 ? 'VOLATILE' : 'SIDEWAYS';
        return {
            marketCondition,
            volatilityLevel,
            timeOfDay: now.toLocaleTimeString(),
            dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
            recentPerformance: marketData.priceChange24h,
            riskTolerance: volatilityLevel === 'HIGH' ? 'CONSERVATIVE' : 'MODERATE',
            positionSize: 5,
            portfolioHeat: 25,
            marketSentiment: marketData.priceChange24h > 0 ? 0.7 : 0.3
        };
    }
    convertEnsembleToTradingSignal(ensemble) {
        const bestSignal = ensemble.providerSignals
            .sort((a, b) => b.signal.confidence - a.signal.confidence)[0];
        return {
            action: ensemble.action,
            confidence: ensemble.confidence,
            reasoning: ensemble.reasoning,
            entryPrice: bestSignal.signal.entryPrice,
            stopLoss: bestSignal.signal.stopLoss,
            takeProfit: bestSignal.signal.takeProfit,
            positionSize: bestSignal.signal.positionSize,
            riskReward: bestSignal.signal.riskReward,
            provider: 'ensemble',
            model: bestSignal.signal.model
        };
    }
    async checkGeminiHealth() {
        try {
            const testPrompt = "Respond with: 'OK'";
            const response = await this.callGeminiAPI(testPrompt);
            return response.candidates && response.candidates.length > 0;
        }
        catch {
            return false;
        }
    }
}
exports.AIService = AIService;
exports.default = AIService;
//# sourceMappingURL=ai.service.js.map