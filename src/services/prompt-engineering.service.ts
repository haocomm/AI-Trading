import {
  PromptTemplate,
  DynamicPromptContext,
  ChainOfThoughtStep,
  MarketAnalysis,
  AIProviderRequest,
  PromptEngineeringError
} from '@/types/ai.types';
import { tradingLogger, logError } from '@/utils/logger';
import { EventEmitter } from 'events';

export class PromptEngineeringService extends EventEmitter {
  private templates: Map<string, PromptTemplate> = new Map();
  private contextHistory: DynamicPromptContext[] = [];
  private performanceMetrics: Map<string, PromptPerformanceMetrics> = new Map();

  constructor() {
    super();
    this.initializeDefaultTemplates();
  }

  generateDynamicPrompt(
    templateId: string,
    variables: Record<string, any>,
    context: DynamicPromptContext
  ): string {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        throw new PromptEngineeringError(
          `Template not found: ${templateId}`,
          templateId
        );
      }

      // Validate required variables
      this.validateVariables(template, variables);

      // Build context-aware prompt
      let prompt = this.buildContextPrompt(context);
      prompt += '\n\n';
      prompt += this.interpolateTemplate(template.template, variables);
      prompt += '\n\n';
      prompt += this.buildRiskInstructions(context);

      // Track usage for performance metrics
      this.trackTemplateUsage(templateId, context);

      tradingLogger.apiCall('PromptEngineering', 'generateDynamicPrompt', true, 0);

      return prompt;
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Failed to generate dynamic prompt'), {
        templateId,
        variables,
        context
      });
      throw error;
    }
  }

  generateChainOfThoughtPrompt(
    problem: string,
    steps: ChainOfThoughtStep[],
    context: DynamicPromptContext
  ): AIProviderRequest {
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
      temperature: 0.1, // Very low for logical reasoning
      maxTokens: 3000,
      metadata: {
        type: 'chain_of_thought',
        problem,
        steps: steps.length,
        context
      }
    };
  }

  generateRiskAwarePrompt(
    basePrompt: string,
    riskParams: {
      maxRisk: number;
      riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
      portfolioHeat: number;
      recentLosses: number;
    },
    context: DynamicPromptContext
  ): AIProviderRequest {
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
      temperature: 0.2, // Lower temperature for risk-aware decisions
      maxTokens: 2048,
      metadata: {
        type: 'risk_aware',
        riskLevel: riskParams.riskTolerance,
        portfolioHeat: riskParams.portfolioHeat
      }
    };
  }

  generateMarketConditionPrompt(
    symbol: string,
    marketData: MarketAnalysis,
    indicators: Record<string, number>
  ): AIProviderRequest {
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

  optimizePromptTemplate(
    templateId: string,
    performanceData: Array<{
      success: boolean;
      confidence: number;
      responseTime: number;
      accuracy: number;
    }>
  ): PromptTemplate {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new PromptEngineeringError(
        `Template not found: ${templateId}`,
        templateId
      );
    }

    const avgSuccess = performanceData.reduce((sum, p) => sum + (p.success ? 1 : 0), 0) / performanceData.length;
    const avgConfidence = performanceData.reduce((sum, p) => sum + p.confidence, 0) / performanceData.length;
    const avgResponseTime = performanceData.reduce((sum, p) => sum + p.responseTime, 0) / performanceData.length;

    // Optimization suggestions
    const optimizations: string[] = [];

    if (avgSuccess < 0.7) {
      optimizations.push('Increase clarity and structure');
    }
    if (avgConfidence < 0.6) {
      optimizations.push('Add more context and examples');
    }
    if (avgResponseTime > 5000) {
      optimizations.push('Reduce prompt length and complexity');
    }

    // Create optimized version
    const optimizedTemplate = this.applyOptimizations(template, optimizations);

    // Update template
    const updatedTemplate: PromptTemplate = {
      ...template,
      template: optimizedTemplate,
      version: this.incrementVersion(template.version),
      updatedAt: Date.now()
    };

    this.templates.set(templateId, updatedTemplate);

    // Track optimization
    this.trackTemplateOptimization(templateId, performanceData, optimizations);

    tradingLogger.apiCall('PromptEngineering', 'optimizePromptTemplate', true, 0);

    return updatedTemplate;
  }

  createCustomTemplate(
    name: string,
    template: string,
    category: 'TRADING' | 'ANALYSIS' | 'RISK' | 'PORTFOLIO'
  ): PromptTemplate {
    const templateId = `${category.toLowerCase()}_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;

    // Extract variables from template
    const variables = this.extractVariables(template);

    const promptTemplate: PromptTemplate = {
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

    tradingLogger.apiCall('PromptEngineering', 'createCustomTemplate', true, 0);

    return promptTemplate;
  }

  getTemplate(templateId: string): PromptTemplate | undefined {
    return this.templates.get(templateId);
  }

  listTemplates(category?: string): PromptTemplate[] {
    const templates = Array.from(this.templates.values());
    return category ? templates.filter(t => t.category === category) : templates;
  }

  private buildContextPrompt(context: DynamicPromptContext): string {
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

    // Add contextual guidance
    let guidance = '\n\nContextual Guidelines:\n';

    if (context.marketCondition === 'BULLISH') {
      guidance += '- Focus on momentum and trend-following strategies\n';
      guidance += '- Consider taking partial profits at resistance levels\n';
    } else if (context.marketCondition === 'BEARISH') {
      guidance += '- Prioritize capital preservation\n';
      guidance += '- Look for shorting opportunities with strong confirmations\n';
    } else {
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

  private buildRiskInstructions(context: DynamicPromptContext): string {
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

  private interpolateTemplate(template: string, variables: Record<string, any>): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }

    return result;
  }

  private validateVariables(template: PromptTemplate, variables: Record<string, any>): void {
    const missingVariables = template.variables.filter(v => !(v in variables));

    if (missingVariables.length > 0) {
      throw new PromptEngineeringError(
        `Missing required variables: ${missingVariables.join(', ')}`,
        template.id,
        missingVariables[0]
      );
    }
  }

  private buildContextString(context: DynamicPromptContext): string {
    return `Market: ${context.marketCondition}
Volatility: ${context.volatilityLevel}
Time: ${context.timeOfDay} on ${context.dayOfWeek}
Recent Performance: ${context.recentPerformance}%
Risk Tolerance: ${context.riskTolerance}
Portfolio Exposure: ${context.portfolioHeat}%
Market Sentiment: ${context.marketSentiment.toFixed(2)}`;
  }

  private assessMarketCondition(marketData: MarketAnalysis, indicators: Record<string, number>): string {
    const priceChange = marketData.priceChange24h;
    const volume = marketData.volume;
    const volatility = marketData.volatility;
    const rsi = indicators.rsi || 50;

    if (priceChange > 5 && volume > 1000000 && rsi > 50) {
      return 'STRONG_BULLISH';
    } else if (priceChange > 2) {
      return 'BULLISH';
    } else if (priceChange < -5 && volume > 1000000 && rsi < 50) {
      return 'STRONG_BEARISH';
    } else if (priceChange < -2) {
      return 'BEARISH';
    } else if (volatility > 0.05) {
      return 'VOLATILE';
    } else {
      return 'SIDEWAYS';
    }
  }

  private assessMarketSentiment(marketData: MarketAnalysis): string {
    const priceChange = marketData.priceChange24h;
    const volume = marketData.volume;
    const volatility = marketData.volatility;

    let sentiment = 0.5; // Neutral

    if (priceChange > 3) sentiment += 0.2;
    else if (priceChange < -3) sentiment -= 0.2;

    if (volume > 1000000) sentiment += priceChange > 0 ? 0.1 : -0.1;

    if (volatility < 0.02) sentiment += 0.05; // Stability is positive
    else if (volatility > 0.05) sentiment -= 0.05; // High volatility is negative

    return sentiment.toFixed(2);
  }

  private assessRiskLevel(marketData: MarketAnalysis, indicators: Record<string, number>): string {
    const volatility = marketData.volatility;
    const volume = marketData.volume;
    const rsi = indicators.rsi || 50;

    if (volatility > 0.08 || rsi > 80 || rsi < 20) {
      return 'EXTREME';
    } else if (volatility > 0.05 || rsi > 70 || rsi < 30) {
      return 'HIGH';
    } else if (volatility > 0.03 || volume < 100000) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  private buildMarketContextFactors(marketData: MarketAnalysis, indicators: Record<string, number>): string {
    const factors: string[] = [];

    if (marketData.volume > 2000000) factors.push('High volume indicates strong conviction');
    if (marketData.volume < 100000) factors.push('Low volume suggests weak participation');
    if (marketData.volatility > 0.05) factors.push('High volatility increases risk');
    if (indicators.rsi > 70) factors.push('Overbought conditions - potential reversal');
    if (indicators.rsi < 30) factors.push('Oversold conditions - potential bounce opportunity');

    return factors.join('\n');
  }

  private extractVariables(template: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
      variables.push(match[1]);
    }

    return [...new Set(variables)];
  }

  private applyOptimizations(template: PromptTemplate, optimizations: string[]): string {
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

  private addStructureToTemplate(template: string): string {
    return `${template}

Response Format:
- Provide analysis in clear, structured format
- Include specific numerical values
- Use JSON for structured data when requested
- Add confidence levels and risk assessments`;
  }

  private addContextToTemplate(template: string): string {
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

  private simplifyTemplate(template: string): string {
    // Remove redundant instructions and focus on key requirements
    return template
      .replace(/\n+/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private incrementVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }

  private summarizeContext(context: DynamicPromptContext): Record<string, any> {
    return {
      marketCondition: context.marketCondition,
      volatilityLevel: context.volatilityLevel,
      riskTolerance: context.riskTolerance,
      portfolioHeat: context.portfolioHeat
    };
  }

  private trackTemplateUsage(templateId: string, context: DynamicPromptContext): void {
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

    const metrics = this.performanceMetrics.get(templateId)!;
    metrics.usageCount++;
    metrics.lastUsed = Date.now();
  }

  private trackTemplateOptimization(
    templateId: string,
    performanceData: any[],
    optimizations: string[]
  ): void {
    const metrics = this.performanceMetrics.get(templateId);
    if (metrics) {
      metrics.lastOptimization = Date.now();
      metrics.optimizationCount = (metrics.optimizationCount || 0) + 1;
    }

    this.emit('templateOptimized', { templateId, performanceData, optimizations });
  }
}

interface PromptPerformanceMetrics {
  templateId: string;
  usageCount: number;
  averageResponseTime: number;
  successRate: number;
  lastUsed: number;
  lastOptimization?: number;
  optimizationCount?: number;
}