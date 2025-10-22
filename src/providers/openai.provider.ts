import { BaseAIProvider } from './base.provider';
import {
  AIProviderRequest,
  AIProviderResponse,
  AIProviderConfig,
  AIProviderError
} from '@/types/ai.types';
import { tradingLogger } from '@/utils/logger';

export class OpenAIProvider extends BaseAIProvider {
  private readonly baseUrl = 'https://api.openai.com/v1';

  constructor(config: AIProviderConfig) {
    super(config);
    this.setProviderName('OpenAI');
  }

  get name(): string {
    return 'OpenAI';
  }

  async generateResponse(request: AIProviderRequest): Promise<AIProviderResponse> {
    const requestKey = this.generateRequestKey(request);

    return this.deduplicateRequest(requestKey, async () => {
      const startTime = Date.now();

      tradingLogger.apiCall('OpenAI', 'generateResponse', true, 0, `Model: ${request.model || this.config.defaultModel}, Prompt length: ${request.prompt.length}`);

      try {
        const requestData = this.buildRequestData(request);
        const response = await this.makeApiRequest(
          `${this.baseUrl}/chat/completions`,
          requestData
        );

        return this.parseResponse(response.data);
      } catch (error) {
        tradingLogger.apiCall('OpenAI', 'generateResponse', false, Date.now() - startTime, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });
  }

  getModels(): string[] {
    return [
      'gpt-4-turbo-preview',
      'gpt-4-1106-preview',
      'gpt-4-0613',
      'gpt-4',
      'gpt-3.5-turbo-16k-0613',
      'gpt-3.5-turbo-0613',
      ...this.config.models
    ];
  }

  validateApiCall(requestData: any): boolean {
    return !!(
      requestData &&
      requestData.model &&
      requestData.messages &&
      Array.isArray(requestData.messages) &&
      requestData.messages.length > 0 &&
      requestData.messages[0].content
    );
  }

  parseResponse(response: any): AIProviderResponse {
    try {
      if (!response.choices || response.choices.length === 0) {
        throw new AIProviderError(
          'No choices returned from OpenAI',
          this.name,
          'NO_CHOICES',
          false
        );
      }

      const choice = response.choices[0];
      const message = choice.message;

      if (!message?.content) {
        throw new AIProviderError(
          'No content in OpenAI response',
          this.name,
          'NO_CONTENT',
          false
        );
      }

      return this.createResponse(
        message.content,
        response.model,
        response.usage,
        response.created ? response.created * 1000 : Date.now()
      );
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }
      throw new AIProviderError(
        `Failed to parse OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'PARSE_ERROR',
        false
      );
    }
  }

  private buildRequestData(request: AIProviderRequest): any {
    const messages: any[] = [];

    // System message
    messages.push({
      role: 'system',
      content: this.buildSystemPrompt()
    });

    // Context if provided
    if (request.context) {
      messages.push({
        role: 'system',
        content: `Context: ${request.context}`
      });
    }

    // User prompt
    messages.push({
      role: 'user',
      content: request.prompt
    });

    return {
      model: request.model || this.config.defaultModel,
      messages,
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.maxTokens || this.config.maxTokens,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      stream: false
    };
  }

  private buildSystemPrompt(): string {
    return `You are an expert cryptocurrency trading AI assistant specializing in technical analysis, risk management, and quantitative trading strategies.

Key principles:
1. Always prioritize risk management and capital preservation
2. Use data-driven analysis, not emotional decisions
3. Consider multiple timeframes and market conditions
4. Provide clear, actionable reasoning for all recommendations
5. Maintain consistency in your decision-making process

Response format:
- Use JSON for structured responses when requested
- Include confidence levels and risk assessments
- Provide clear entry/exit points with stop losses
- Explain the reasoning behind your decisions

Market awareness:
- Cryptocurrency markets are highly volatile
- 24/7 trading requires continuous monitoring
- Correlation with traditional markets varies
- Regulatory and macroeconomic factors are important

Remember: Better to miss an opportunity than to lose capital.`;
  }

  // Trading-specific methods for enhanced functionality
  async generateTradingSignal(
    symbol: string,
    marketData: any,
    riskParams?: any
  ): Promise<AIProviderResponse> {
    const prompt = this.buildTradingPrompt(symbol, marketData, riskParams);

    return this.generateResponse({
      prompt,
      temperature: 0.3, // Lower temperature for more consistent trading decisions
      maxTokens: 1024,
      metadata: { type: 'trading_signal', symbol }
    });
  }

  async generateMarketAnalysis(
    symbols: string[],
    timeframe: string = '24h'
  ): Promise<AIProviderResponse> {
    const prompt = `Provide a comprehensive market analysis for the following cryptocurrency symbols: ${symbols.join(', ')}

Timeframe: ${timeframe}

Include:
1. Overall market sentiment
2. Individual symbol analysis
3. Correlation analysis
4. Risk factors
5. Trading opportunities
6. Key support/resistance levels

Provide your analysis in a structured format with clear recommendations.`;

    return this.generateResponse({
      prompt,
      temperature: 0.4,
      maxTokens: 2048,
      metadata: { type: 'market_analysis', symbols, timeframe }
    });
  }

  async generateRiskAssessment(
    portfolio: any,
    marketConditions: any
  ): Promise<AIProviderResponse> {
    const prompt = `Analyze the portfolio risk based on current market conditions.

Portfolio: ${JSON.stringify(portfolio, null, 2)}
Market Conditions: ${JSON.stringify(marketConditions, null, 2)}

Assess:
1. Current portfolio risk level (LOW/MEDIUM/HIGH/EXTREME)
2. Concentration risk
3. Market correlation risk
4. Volatility exposure
5. Liquidity risk
6. Recommended risk mitigation strategies

Provide specific, actionable risk management recommendations.`;

    return this.generateResponse({
      prompt,
      temperature: 0.2,
      maxTokens: 1024,
      metadata: { type: 'risk_assessment' }
    });
  }

  private buildTradingPrompt(
    symbol: string,
    marketData: any,
    riskParams?: any
  ): string {
    return `Analyze ${symbol} and provide a detailed trading signal.

Market Data:
${JSON.stringify(marketData, null, 2)}

Risk Parameters:
${JSON.stringify(riskParams || {}, null, 2)}

Provide your analysis in this EXACT JSON format:
{
  "action": "BUY|SELL|HOLD",
  "confidence": 0.00-1.00,
  "reasoning": "Detailed technical analysis explanation",
  "entryPrice": number,
  "stopLoss": number,
  "takeProfit": number,
  "positionSize": number,
  "riskReward": number,
  "keyIndicators": ["RSI", "MACD", "Volume", "Support/Resistance"],
  "marketCondition": "BULLISH|BEARISH|SIDEWAYS|VOLATILE",
  "riskFactors": ["High volatility", "Low volume", "Overbought", "Oversold"],
  "expectedMove": "Percentage move expected",
  "timeframe": "Short-term (hours) / Medium-term (days)",
  "technicalScore": 0-100,
  "momentumScore": 0-100,
  "volumeScore": 0-100
}

CRITICAL: Focus on risk management. High confidence (>0.8) required for BUY/SELL signals. Always provide specific stop loss and take profit levels.`;
  }
}