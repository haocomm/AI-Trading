"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeProvider = void 0;
const base_provider_1 = require("./base.provider");
const ai_types_1 = require("@/types/ai.types");
const logger_1 = require("@/utils/logger");
class ClaudeProvider extends base_provider_1.BaseAIProvider {
    constructor(config) {
        super(config);
        this.baseUrl = 'https://api.anthropic.com/v1';
    }
    get name() {
        return 'Claude';
    }
    async generateResponse(request) {
        const requestKey = this.generateRequestKey(request);
        return this.deduplicateRequest(requestKey, async () => {
            const startTime = Date.now();
            logger_1.tradingLogger.apiCall('Claude', 'generateResponse', true, 0);
            try {
                const requestData = this.buildRequestData(request);
                const response = await this.makeApiRequest(`${this.baseUrl}/messages`, requestData, {
                    headers: {
                        'anthropic-version': '2023-06-01',
                        'x-api-key': this.config.apiKey
                    }
                });
                return this.parseResponse(response.data);
            }
            catch (error) {
                logger_1.tradingLogger.apiCall('Claude', 'generateResponse', false, Date.now() - startTime);
                throw error;
            }
        });
    }
    getModels() {
        return [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307',
            ...this.config.models
        ];
    }
    validateApiCall(requestData) {
        return !!(requestData &&
            requestData.model &&
            requestData.messages &&
            Array.isArray(requestData.messages) &&
            requestData.messages.length > 0);
    }
    parseResponse(response) {
        try {
            if (!response.content || response.content.length === 0) {
                throw new ai_types_1.AIProviderError('No content returned from Claude', this.name, 'NO_CONTENT', false);
            }
            const content = response.content[0];
            if (!content.text) {
                throw new ai_types_1.AIProviderError('No text content in Claude response', this.name, 'NO_TEXT_CONTENT', false);
            }
            return this.createResponse(content.text, response.model, {
                prompt_tokens: response.usage?.input_tokens || 0,
                completion_tokens: response.usage?.output_tokens || 0,
                total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
            });
        }
        catch (error) {
            if (error instanceof ai_types_1.AIProviderError) {
                throw error;
            }
            throw new ai_types_1.AIProviderError(`Failed to parse Claude response: ${error instanceof Error ? error.message : 'Unknown error'}`, this.name, 'PARSE_ERROR', false);
        }
    }
    buildRequestData(request) {
        const messages = [];
        let systemMessage = this.buildSystemPrompt();
        if (request.context) {
            systemMessage += `\n\nAdditional Context: ${request.context}`;
        }
        messages.push({
            role: 'user',
            content: request.prompt
        });
        const requestData = {
            model: request.model || this.config.defaultModel,
            max_tokens: request.maxTokens || this.config.maxTokens,
            temperature: request.temperature ?? this.config.temperature,
            messages
        };
        if (systemMessage) {
            requestData.system = systemMessage;
        }
        return requestData;
    }
    buildSystemPrompt() {
        return `You are Claude, an expert cryptocurrency trading AI assistant with deep expertise in technical analysis, quantitative strategies, and risk management.

Your core competencies include:
- Advanced technical analysis and chart pattern recognition
- Risk management and position sizing strategies
- Market sentiment analysis and correlation studies
- Algorithmic trading strategy development

Key trading principles:
1. Capital preservation is paramount - never risk more than you can afford to lose
2. Use data-driven decisions, avoid emotional trading
3. Implement proper risk management with stop losses and position sizing
4. Consider multiple timeframes for comprehensive analysis
5. Maintain discipline in following trading rules

Analysis approach:
- Provide clear, actionable recommendations with specific entry/exit points
- Include risk-reward ratios and confidence levels
- Consider market volatility and liquidity factors
- Account for correlations between different cryptocurrencies
- Factor in macroeconomic and regulatory considerations

Risk management focus:
- Always define stop loss levels before entry
- Calculate appropriate position sizes based on risk tolerance
- Consider maximum drawdown and portfolio heat
- Implement diversification strategies
- Monitor market volatility and adjust accordingly

Remember: The goal is consistent profitability with managed risk, not chasing high-risk, high-reward opportunities.`;
    }
    async generateTradingSignal(symbol, marketData, riskParams, historicalContext) {
        const prompt = this.buildDetailedTradingPrompt(symbol, marketData, riskParams, historicalContext);
        return this.generateResponse({
            prompt,
            temperature: 0.2,
            maxTokens: 1500,
            metadata: { type: 'trading_signal', symbol, provider: 'claude' }
        });
    }
    async generateMarketSentimentAnalysis(newsData, socialMediaData, marketMetrics) {
        const prompt = `Perform a comprehensive sentiment analysis using the following data:

News Data:
${JSON.stringify(newsData, null, 2)}

Social Media Sentiment:
${JSON.stringify(socialMediaData, null, 2)}

Market Metrics:
${JSON.stringify(marketMetrics, null, 2)}

Analyze:
1. Overall market sentiment (BULLISH/BEARISH/NEUTRAL)
2. Sentiment strength and conviction level
3. Key sentiment drivers and themes
4. Contrarian indicators
5. Short-term vs long-term sentiment outlook
6. Potential sentiment shifts catalysts
7. Risk factors based on sentiment analysis

Provide a structured analysis with specific actionable insights for trading decisions.`;
        return this.generateResponse({
            prompt,
            temperature: 0.3,
            maxTokens: 2048,
            metadata: { type: 'sentiment_analysis' }
        });
    }
    async generateChainOfThoughtAnalysis(problem, availableData, constraints) {
        const prompt = `Perform a detailed chain-of-thought analysis for this trading problem:

Problem: ${problem}

Available Data:
${JSON.stringify(availableData, null, 2)}

Constraints:
${JSON.stringify(constraints, null, 2)}

Think through this step by step:
1. Identify the core problem and objectives
2. Analyze the available data for relevant patterns
3. Consider the constraints and limitations
4. Develop multiple hypotheses
5. Test each hypothesis against the data
6. Identify the most likely outcome
7. Consider alternative scenarios and edge cases
8. Formulate a final recommendation with reasoning

Provide your analysis in a clear, step-by-step format showing your reasoning process.`;
        return this.generateResponse({
            prompt,
            temperature: 0.1,
            maxTokens: 3000,
            metadata: { type: 'chain_of_thought', problem }
        });
    }
    async generateRiskScenarioAnalysis(portfolio, marketScenarios) {
        const prompt = `Analyze portfolio risk across multiple market scenarios:

Current Portfolio:
${JSON.stringify(portfolio, null, 2)}

Market Scenarios:
${JSON.stringify(marketScenarios, null, 2)}

For each scenario, analyze:
1. Expected portfolio impact
2. Risk exposure breakdown
3. Correlation effects
4. Liquidity considerations
5. Potential drawdown scenarios
6. Hedging opportunities
7. Risk mitigation strategies

Provide scenario-specific risk assessments and portfolio recommendations.`;
        return this.generateResponse({
            prompt,
            temperature: 0.2,
            maxTokens: 2048,
            metadata: { type: 'risk_scenario_analysis' }
        });
    }
    buildDetailedTradingPrompt(symbol, marketData, riskParams, historicalContext) {
        return `Perform a comprehensive trading analysis for ${symbol} with the following data:

Current Market Data:
${JSON.stringify(marketData, null, 2)}

Risk Parameters:
${JSON.stringify(riskParams || {}, null, 2)}

Historical Context:
${JSON.stringify(historicalContext || {}, null, 2)}

Provide your analysis in this exact JSON format:
{
  "action": "BUY|SELL|HOLD",
  "confidence": 0.00-1.00,
  "reasoning": "Comprehensive analysis including technical, fundamental, and risk factors",
  "entryPrice": number,
  "stopLoss": number,
  "takeProfit": number,
  "positionSize": number,
  "riskReward": number,
  "technicalAnalysis": {
    "trend": "BULLISH|BEARISH|SIDEWAYS",
    "momentum": "STRONG|MODERATE|WEAK",
    "volatility": "HIGH|MEDIUM|LOW",
    "keyLevels": {
      "support": [number],
      "resistance": [number]
    }
  },
  "riskFactors": ["List of specific risk factors"],
  "opportunityFactors": ["List of opportunity factors"],
  "marketCondition": "BULLISH|BEARISH|SIDEWAYS|VOLATILE|UNCERTAIN",
  "timeHorizon": "IMMEDIATE|SHORT_TERM|MEDIUM_TERM|LONG_TERM",
  "convictionLevel": "LOW|MEDIUM|HIGH",
  "correlationRisk": "LOW|MEDIUM|HIGH",
  "liquidityAnalysis": "EXCELLENT|GOOD|FAIR|POOR"
}

Key requirements:
- Ensure at least 2:1 risk-reward ratio for BUY/SELL signals
- Consider market volatility in stop loss placement
- Account for correlation risks with major crypto assets
- Factor in liquidity and market depth
- Provide specific, actionable risk management guidance`;
    }
}
exports.ClaudeProvider = ClaudeProvider;
//# sourceMappingURL=claude.provider.js.map