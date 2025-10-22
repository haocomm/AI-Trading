"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptEngineeringService = void 0;
const ai_types_1 = require("@/types/ai.types");
const logger_1 = require("@/utils/logger");
const events_1 = require("events");
class PromptEngineeringService extends events_1.EventEmitter {
    constructor() {
        super();
        this.templates = new Map();
        this.contextHistory = [];
        this.performanceMetrics = new Map();
        this.initializeDefaultTemplates();
    }
    generateDynamicPrompt(templateId, variables, context) {
        try {
            const template = this.templates.get(templateId);
            if (!template) {
                throw new ai_types_1.PromptEngineeringError(`Template not found: ${templateId}`, templateId);
            }
            this.validateVariables(template, variables);
            let prompt = this.buildContextPrompt(context);
            prompt += '\n\n';
            prompt += this.interpolateTemplate(template.template, variables);
            prompt += '\n\n';
            prompt += this.buildRiskInstructions(context);
            this.trackTemplateUsage(templateId, context);
            logger_1.tradingLogger.apiCall('PromptEngineering', 'generateDynamicPrompt', true, 0);
            return prompt;
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Failed to generate dynamic prompt'), {
                templateId,
                variables,
                context
            });
            throw error;
        }
    }
    generateChainOfThoughtPrompt(problem, steps, context) {
        const prompt = `You are an expert cryptocurrency trading analyst. Think through this problem step by step:

Problem: ${problem}

Current Market Context:
${this.buildContextString(context)}

Please analyze this step by step:

${steps.map((step, index) => `
Step ${index + 1}: ${step.description}
${step.reasoning ? `Previous reasoning: ${step.reasoning}` : ''}
Your analysis:
`).join('')}

For each step, provide:
1. Your detailed reasoning
2. Key factors considered
3. Confidence level (0-100%)
4. Conclusion or next step

Important: Show your work clearly and build logically from one step to the next.
Focus on risk management and data-driven analysis.`;
        return {
            prompt,
            temperature: 0.1,
            maxTokens: 3000,
            metadata: {
                type: 'chain_of_thought',
                problem,
                steps: steps.length,
                context
            }
        };
    }
    generateRiskAwarePrompt(basePrompt, riskParams, context) {
        const riskInstructions = this.buildRiskInstructions({
            ...context,
            riskTolerance: riskParams.riskTolerance,
            portfolioHeat: riskParams.portfolioHeat
        });
        const riskContext = `
Current Risk Parameters:
- Maximum risk per trade: ${riskParams.maxRisk}%
- Risk tolerance: ${riskParams.riskTolerance}
- Portfolio heat: ${riskParams.portfolioHeat}%
- Recent losses: ${riskParams.recentLosses}%

${riskParams.recentLosses > 5 ? '⚠️ HIGH RISK: Recent losses detected - be extra conservative' : ''}
${riskParams.portfolioHeat > 80 ? '⚠️ HIGH EXPOSURE: Portfolio is heavily allocated - reduce position sizes' : ''}
`;
        const enhancedPrompt = `${basePrompt}

${riskContext}

${riskInstructions}

CRITICAL: All recommendations must pass the risk filter. High-risk trades require higher confidence levels.`;
        return {
            prompt: enhancedPrompt,
            temperature: 0.2,
            maxTokens: 2048,
            metadata: {
                type: 'risk_aware',
                riskLevel: riskParams.riskTolerance,
                portfolioHeat: riskParams.portfolioHeat
            }
        };
    }
    generateMarketConditionPrompt(symbol, marketData, indicators) {
        const marketCondition = this.assessMarketCondition(marketData, indicators);
        const sentiment = this.assessMarketSentiment(marketData);
        const prompt = `Analyze ${symbol} under current market conditions:

Market Condition: ${marketCondition}
Market Sentiment: ${sentiment}
Overall Risk Level: ${this.assessRiskLevel(marketData, indicators)}

Market Data:
- Current Price: $${marketData.currentPrice.toLocaleString()}
- 24h Change: ${marketData.priceChange24h.toFixed(2)}%
- Volume: ${marketData.volume.toLocaleString()}
- Volatility: ${(marketData.volatility * 100).toFixed(2)}%
- Trend: ${marketData.trend}
- Support: $${marketData.support.toLocaleString()}
- Resistance: $${marketData.resistance.toLocaleString()}

Technical Indicators:
${Object.entries(indicators).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

Market Context Factors:
${this.buildMarketContextFactors(marketData, indicators)}

Provide a detailed analysis in JSON format:
{
  "action": "BUY|SELL|HOLD",
  "confidence": 0.00-1.00,
  "reasoning": "Detailed analysis considering market conditions and indicators",
  "marketCondition": "${marketCondition}",
  "sentimentScore": 0.00-1.00,
  "riskLevel": "LOW|MEDIUM|HIGH|EXTREME",
  "keyFactors": ["List of key factors"],
  "contrarianOpportunity": boolean,
  "recommendedPositionSize": number,
  "stopLoss": number,
  "takeProfit": number,
  "timeHorizon": "IMMEDIATE|SHORT|MEDIUM|LONG",
  "correlationRisk": "LOW|MEDIUM|HIGH"
}

Consider market regime, liquidity, and macro factors in your analysis.`;
        return {
            prompt,
            temperature: 0.3,
            maxTokens: 1500,
            metadata: {
                type: 'market_condition',
                symbol,
                marketCondition,
                sentiment,
                riskLevel: this.assessRiskLevel(marketData, indicators)
            }
        };
    }
    optimizePromptTemplate(templateId, performanceData) {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new ai_types_1.PromptEngineeringError(`Template not found: ${templateId}`, templateId);
        }
        const avgSuccess = performanceData.reduce((sum, p) => sum + (p.success ? 1 : 0), 0) / performanceData.length;
        const avgConfidence = performanceData.reduce((sum, p) => sum + p.confidence, 0) / performanceData.length;
        const avgResponseTime = performanceData.reduce((sum, p) => sum + p.responseTime, 0) / performanceData.length;
        const optimizations = [];
        if (avgSuccess < 0.7) {
            optimizations.push('Increase clarity and structure');
        }
        if (avgConfidence < 0.6) {
            optimizations.push('Add more context and examples');
        }
        if (avgResponseTime > 5000) {
            optimizations.push('Reduce prompt length and complexity');
        }
        const optimizedTemplate = this.applyOptimizations(template, optimizations);
        const updatedTemplate = {
            ...template,
            template: optimizedTemplate,
            version: this.incrementVersion(template.version),
            updatedAt: Date.now()
        };
        this.templates.set(templateId, updatedTemplate);
        this.trackTemplateOptimization(templateId, performanceData, optimizations);
        logger_1.tradingLogger.apiCall('PromptEngineering', 'optimizePromptTemplate', true, 0);
        return updatedTemplate;
    }
    createCustomTemplate(name, template, category) {
        const templateId = `${category.toLowerCase()}_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
        const variables = this.extractVariables(template);
        const promptTemplate = {
            id: templateId,
            name,
            template,
            variables,
            category,
            version: '1.0.0',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.templates.set(templateId, promptTemplate);
        logger_1.tradingLogger.apiCall('PromptEngineering', 'createCustomTemplate', true, 0);
        return promptTemplate;
    }
    getTemplate(templateId) {
        return this.templates.get(templateId);
    }
    listTemplates(category) {
        const templates = Array.from(this.templates.values());
        return category ? templates.filter(t => t.category === category) : templates;
    }
    buildContextPrompt(context) {
        const contextPrompt = `Current Trading Context:
- Market Condition: ${context.marketCondition}
- Volatility Level: ${context.volatilityLevel}
- Time of Day: ${context.timeOfDay}
- Day of Week: ${context.dayOfWeek}
- Recent Performance: ${context.recentPerformance}%
- Risk Tolerance: ${context.riskTolerance}
- Position Size: ${context.positionSize}%
- Portfolio Heat: ${context.portfolioHeat}%
- Market Sentiment: ${context.marketSentiment.toFixed(2)}`;
        let guidance = '\n\nContextual Guidelines:\n';
        if (context.marketCondition === 'BULLISH') {
            guidance += '- Focus on momentum and trend-following strategies\n';
            guidance += '- Consider taking partial profits at resistance levels\n';
        }
        else if (context.marketCondition === 'BEARISH') {
            guidance += '- Prioritize capital preservation\n';
            guidance += '- Look for shorting opportunities with strong confirmations\n';
        }
        else {
            guidance += '- Wait for clear signals before entering positions\n';
            guidance += '- Consider range-bound trading strategies\n';
        }
        if (context.volatilityLevel === 'HIGH') {
            guidance += '- Reduce position sizes due to high volatility\n';
            guidance += '- Use wider stop losses to avoid premature exits\n';
        }
        if (context.portfolioHeat > 80) {
            guidance += '- HIGH PORTFOLIO EXPOSURE: Be extremely selective with new positions\n';
            guidance += '- Consider reducing existing positions if risk increases\n';
        }
        return contextPrompt + guidance;
    }
    buildRiskInstructions(context) {
        let instructions = '\n\nRisk Management Instructions:\n';
        switch (context.riskTolerance) {
            case 'CONSERVATIVE':
                instructions += '- Maximum 2% risk per trade\n';
                instructions += '- Minimum 3:1 risk-reward ratio required\n';
                instructions += '- Avoid highly volatile assets\n';
                instructions += '- Require higher confidence levels (>80%)\n';
                break;
            case 'MODERATE':
                instructions += '- Maximum 3% risk per trade\n';
                instructions += '- Minimum 2:1 risk-reward ratio\n';
                instructions += '- Can consider moderate volatility\n';
                instructions += '- Require confidence levels >70%\n';
                break;
            case 'AGGRESSIVE':
                instructions += '- Maximum 5% risk per trade\n';
                instructions += '- Minimum 1.5:1 risk-reward ratio\n';
                instructions += '- Can trade higher volatility assets\n';
                instructions += '- Accept confidence levels >60%\n';
                break;
        }
        if (context.recentLosses > 10) {
            instructions += '- RECENT LOSSES: Reduce position sizes by 50%\n';
            instructions += '- Require higher conviction signals\n';
        }
        return instructions;
    }
    interpolateTemplate(template, variables) {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            result = result.replace(regex, String(value));
        }
        return result;
    }
    validateVariables(template, variables) {
        const missingVariables = template.variables.filter(v => !(v in variables));
        if (missingVariables.length > 0) {
            throw new ai_types_1.PromptEngineeringError(`Missing required variables: ${missingVariables.join(', ')}`, template.id, missingVariables[0]);
        }
    }
    buildContextString(context) {
        return `Market: ${context.marketCondition}
Volatility: ${context.volatilityLevel}
Time: ${context.timeOfDay} on ${context.dayOfWeek}
Recent Performance: ${context.recentPerformance}%
Risk Tolerance: ${context.riskTolerance}
Portfolio Exposure: ${context.portfolioHeat}%
Market Sentiment: ${context.marketSentiment.toFixed(2)}`;
    }
    assessMarketCondition(marketData, indicators) {
        const priceChange = marketData.priceChange24h;
        const volume = marketData.volume;
        const volatility = marketData.volatility;
        const rsi = indicators.rsi || 50;
        if (priceChange > 5 && volume > 1000000 && rsi > 50) {
            return 'STRONG_BULLISH';
        }
        else if (priceChange > 2) {
            return 'BULLISH';
        }
        else if (priceChange < -5 && volume > 1000000 && rsi < 50) {
            return 'STRONG_BEARISH';
        }
        else if (priceChange < -2) {
            return 'BEARISH';
        }
        else if (volatility > 0.05) {
            return 'VOLATILE';
        }
        else {
            return 'SIDEWAYS';
        }
    }
    assessMarketSentiment(marketData) {
        const priceChange = marketData.priceChange24h;
        const volume = marketData.volume;
        const volatility = marketData.volatility;
        let sentiment = 0.5;
        if (priceChange > 3)
            sentiment += 0.2;
        else if (priceChange < -3)
            sentiment -= 0.2;
        if (volume > 1000000)
            sentiment += priceChange > 0 ? 0.1 : -0.1;
        if (volatility < 0.02)
            sentiment += 0.05;
        else if (volatility > 0.05)
            sentiment -= 0.05;
        return sentiment.toFixed(2);
    }
    assessRiskLevel(marketData, indicators) {
        const volatility = marketData.volatility;
        const volume = marketData.volume;
        const rsi = indicators.rsi || 50;
        if (volatility > 0.08 || rsi > 80 || rsi < 20) {
            return 'EXTREME';
        }
        else if (volatility > 0.05 || rsi > 70 || rsi < 30) {
            return 'HIGH';
        }
        else if (volatility > 0.03 || volume < 100000) {
            return 'MEDIUM';
        }
        else {
            return 'LOW';
        }
    }
    buildMarketContextFactors(marketData, indicators) {
        const factors = [];
        if (marketData.volume > 2000000)
            factors.push('High volume indicates strong conviction');
        if (marketData.volume < 100000)
            factors.push('Low volume suggests weak participation');
        if (marketData.volatility > 0.05)
            factors.push('High volatility increases risk');
        if (indicators.rsi > 70)
            factors.push('Overbought conditions - potential reversal');
        if (indicators.rsi < 30)
            factors.push('Oversold conditions - potential bounce opportunity');
        return factors.join('\n');
    }
    extractVariables(template) {
        const regex = /\{\{(\w+)\}\}/g;
        const variables = [];
        let match;
        while ((match = regex.exec(template)) !== null) {
            variables.push(match[1]);
        }
        return [...new Set(variables)];
    }
    applyOptimizations(template, optimizations) {
        let optimizedTemplate = template.template;
        if (optimizations.includes('Increase clarity and structure')) {
            optimizedTemplate = this.addStructureToTemplate(optimizedTemplate);
        }
        if (optimizations.includes('Add more context and examples')) {
            optimizedTemplate = this.addContextToTemplate(optimizedTemplate);
        }
        if (optimizations.includes('Reduce prompt length and complexity')) {
            optimizedTemplate = this.simplifyTemplate(optimizedTemplate);
        }
        return optimizedTemplate;
    }
    addStructureToTemplate(template) {
        return `${template}

Response Format:
- Provide analysis in clear, structured format
- Include specific numerical values
- Use JSON for structured data when requested
- Add confidence levels and risk assessments`;
    }
    addContextToTemplate(template) {
        return `Context: Consider current market conditions, volatility levels, and recent price action.

${template}

Example format:
{
  "analysis": "Your detailed analysis here",
  "confidence": 0.85,
  "key_factors": ["Factor 1", "Factor 2"],
  "risk_level": "MEDIUM"
}`;
    }
    simplifyTemplate(template) {
        return template
            .replace(/\n+/g, '\n')
            .replace(/\s+/g, ' ')
            .trim();
    }
    incrementVersion(version) {
        const parts = version.split('.');
        const patch = parseInt(parts[2] || '0') + 1;
        return `${parts[0]}.${parts[1]}.${patch}`;
    }
    summarizeContext(context) {
        return {
            marketCondition: context.marketCondition,
            volatilityLevel: context.volatilityLevel,
            riskTolerance: context.riskTolerance,
            portfolioHeat: context.portfolioHeat
        };
    }
    trackTemplateUsage(templateId, context) {
        const existing = this.performanceMetrics.get(templateId);
        if (!existing) {
            this.performanceMetrics.set(templateId, {
                templateId,
                usageCount: 0,
                averageResponseTime: 0,
                successRate: 0,
                lastUsed: 0
            });
        }
        const metrics = this.performanceMetrics.get(templateId);
        metrics.usageCount++;
        metrics.lastUsed = Date.now();
    }
    trackTemplateOptimization(templateId, performanceData, optimizations) {
        const metrics = this.performanceMetrics.get(templateId);
        if (metrics) {
            metrics.lastOptimization = Date.now();
            metrics.optimizationCount = (metrics.optimizationCount || 0) + 1;
        }
        this.emit('templateOptimized', { templateId, performanceData, optimizations });
    }
}
exports.PromptEngineeringService = PromptEngineeringService;
//# sourceMappingURL=prompt-engineering.service.js.map