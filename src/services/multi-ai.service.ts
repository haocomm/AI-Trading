import {
  AIProviderInterface,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderConfig,
  EnsembleDecision,
  ProviderSignal,
  RiskAssessment,
  ExecutionRecommendation,
  EnsembleConfig,
  CacheEntry,
  BatchRequest,
  BatchResponse,
  ProviderMetrics,
  AIProviderError,
  EnsembleError
} from '@/types/ai.types';
import { OpenAIProvider } from '@/providers/openai.provider';
import { ClaudeProvider } from '@/providers/claude.provider';
import { CustomProvider } from '@/providers/custom.provider';
import { tradingLogger, logError } from '@/utils/logger';
import { EventEmitter } from 'events';

export class MultiAIService extends EventEmitter {
  private providers: Map<string, AIProviderInterface> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private batchQueue: Map<string, BatchRequest> = new Map();
  private metrics: Map<string, ProviderMetrics> = new Map();
  private ensembleConfig: EnsembleConfig;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    providerConfigs: Record<string, AIProviderConfig>,
    ensembleConfig: EnsembleConfig
  ) {
    super();
    this.ensembleConfig = ensembleConfig;
    this.initializeProviders(providerConfigs);
    this.startHealthChecks();
  }

  async generateSignal(
    symbol: string,
    marketData: any,
    options: {
      useEnsemble?: boolean;
      useCache?: boolean;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH';
      timeout?: number;
    } = {}
  ): Promise<EnsembleDecision | AIProviderResponse> {
    const {
      useEnsemble = true,
      useCache = true,
      priority = 'MEDIUM',
      timeout = 30000
    } = options;

    try {
      tradingLogger.apiCall('MultiAI', 'generateSignal', true, 0, {
        symbol,
        useEnsemble,
        useCache,
        priority
      });

      // Check cache first
      if (useCache) {
        const cached = this.getCachedResponse(symbol, marketData);
        if (cached) {
          tradingLogger.apiCall('MultiAI', 'generateSignal', true, 0, { cacheHit: true });
          return cached;
        }
      }

      const startTime = Date.now();

      if (useEnsemble && this.providers.size >= this.ensembleConfig.minProviders) {
        const decision = await this.generateEnsembleDecision(symbol, marketData, timeout);
        this.cacheResponse(symbol, marketData, decision);
        return decision;
      } else {
        // Single provider fallback
        const bestProvider = await this.selectBestProvider(priority);
        const response = await bestProvider.generateResponse({
          prompt: this.buildTradingPrompt(symbol, marketData),
          temperature: 0.3,
          maxTokens: 1024,
          metadata: { type: 'trading_signal', symbol }
        });

        this.updateProviderMetrics(bestProvider.name, response);
        this.cacheResponse(symbol, marketData, response);

        return response;
      }

    } catch (error) {
      tradingLogger.apiCall('MultiAI', 'generateSignal', false, 0, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async generateEnsembleDecision(
    symbol: string,
    marketData: any,
    timeout: number = 30000
  ): Promise<EnsembleDecision> {
    const availableProviders = Array.from(this.providers.values());
    const selectedProviders = await this.selectProvidersForEnsemble(availableProviders);

    if (selectedProviders.length < this.ensembleConfig.minProviders) {
      throw new EnsembleError(
        `Insufficient providers for ensemble decision. Required: ${this.ensembleConfig.minProviders}, Available: ${selectedProviders.length}`,
        selectedProviders.map(p => p.name)
      );
    }

    try {
      // Generate requests for all selected providers
      const requests = selectedProviders.map(provider => {
        return this.generateProviderSignal(provider, symbol, marketData, timeout);
      });

      // Execute requests in parallel with timeout
      const responses = await Promise.allSettled(requests);
      const providerSignals: ProviderSignal[] = [];

      // Process responses and create provider signals
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        const provider = selectedProviders[i];

        if (response.status === 'fulfilled') {
          const signal = this.parseProviderSignal(provider.name, response.value, marketData.currentPrice);
          providerSignals.push(signal);
        } else {
          tradingLogger.apiCall('Ensemble', 'providerError', false, 0, {
            provider: provider.name,
            error: response.reason instanceof Error ? response.reason.message : 'Unknown error'
          });
        }
      }

      if (providerSignals.length < this.ensembleConfig.minProviders) {
        throw new EnsembleError(
          `Insufficient successful responses for ensemble decision. Required: ${this.ensembleConfig.minProviders}, Received: ${providerSignals.length}`,
          selectedProviders.map(p => p.name)
        );
      }

      // Generate ensemble decision
      const decision = await this.aggregateSignals(providerSignals, marketData);

      tradingLogger.apiCall('Ensemble', 'generateDecision', true, Date.now() - Date.now(), {
        providers: providerSignals.length,
        action: decision.action,
        confidence: decision.confidence
      });

      return decision;

    } catch (error) {
      if (error instanceof EnsembleError) {
        throw error;
      }
      throw new EnsembleError(
        `Failed to generate ensemble decision: ${error instanceof Error ? error.message : 'Unknown error'}`,
        selectedProviders.map(p => p.name),
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  async batchGenerateSignals(
    requests: Array<{ symbol: string; marketData: any }>,
    options: {
      useEnsemble?: boolean;
      maxConcurrency?: number;
      timeout?: number;
    } = {}
  ): Promise<BatchResponse> {
    const {
      useEnsemble = true,
      maxConcurrency = 5,
      timeout = 60000
    } = options;

    const requestId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const batchRequest: BatchRequest = {
      id: requestId,
      requests: requests.map(req => ({
        prompt: this.buildTradingPrompt(req.symbol, req.marketData),
        metadata: { type: 'trading_signal', symbol: req.symbol }
      })),
      priority: 'MEDIUM',
      timeout,
      timestamp: Date.now()
    };

    this.batchQueue.set(requestId, batchRequest);

    try {
      const startTime = Date.now();
      const responses: any[] = [];
      const errors: string[] = [];

      // Process requests with concurrency control
      const chunks = this.chunkArray(requests, maxConcurrency);

      for (const chunk of chunks) {
        const chunkPromises = chunk.map(req =>
          this.generateSignal(req.symbol, req.marketData, {
            useEnsemble,
            timeout: timeout / chunks.length
          }).catch(error => {
            errors.push(`${req.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
          })
        );

        const chunkResults = await Promise.all(chunkPromises);
        responses.push(...chunkResults.filter(r => r !== null));
      }

      const totalTime = Date.now() - startTime;
      const totalCost = responses.reduce((sum, r) => sum + (r.cost || 0), 0);

      const batchResponse: BatchResponse = {
        requestId,
        responses,
        success: errors.length === 0,
        errors,
        totalCost,
        totalTime
      };

      this.batchQueue.delete(requestId);
      return batchResponse;

    } catch (error) {
      this.batchQueue.delete(requestId);
      throw new EnsembleError(
        `Batch processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        requests.map(r => r.symbol),
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  private async generateProviderSignal(
    provider: AIProviderInterface,
    symbol: string,
    marketData: any,
    timeout: number
  ): Promise<AIProviderResponse> {
    const request: AIProviderRequest = {
      prompt: this.buildTradingPrompt(symbol, marketData),
      temperature: 0.3,
      maxTokens: 1024,
      metadata: { type: 'trading_signal', symbol, provider: provider.name }
    };

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Provider response timeout')), timeout);
    });

    // Race between provider response and timeout
    return Promise.race([
      provider.generateResponse(request),
      timeoutPromise
    ]);
  }

  private parseProviderSignal(
    providerName: string,
    response: AIProviderResponse,
    currentPrice: number
  ): ProviderSignal {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      let signalData: any = {};

      if (jsonMatch) {
        signalData = JSON.parse(jsonMatch[0]);
      }

      const action = ['BUY', 'SELL', 'HOLD'].includes(signalData.action)
        ? signalData.action
        : 'HOLD';

      const confidence = typeof signalData.confidence === 'number'
        ? Math.max(0, Math.min(1, signalData.confidence))
        : 0.5;

      return {
        provider: providerName,
        model: response.model,
        signal: {
          action,
          confidence,
          reasoning: signalData.reasoning || response.content,
          entryPrice: currentPrice,
          stopLoss: signalData.stopLoss || currentPrice * 0.98,
          takeProfit: signalData.takeProfit || currentPrice * 1.06,
          positionSize: signalData.positionSize || 0,
          riskReward: signalData.riskReward || 3,
          provider: providerName,
          model: response.model,
          metadata: signalData.metadata || {}
        },
        weight: await this.calculateProviderWeight(providerName),
        reliability: this.getProviderReliability(providerName),
        responseTime: response.responseTime
      };
    } catch (error) {
      return {
        provider: providerName,
        model: response.model,
        signal: {
          action: 'HOLD',
          confidence: 0,
          reasoning: `Failed to parse ${providerName} response`,
          entryPrice: currentPrice,
          stopLoss: currentPrice * 0.98,
          takeProfit: currentPrice * 1.06,
          positionSize: 0,
          riskReward: 0,
          provider: providerName,
          model: response.model
        },
        weight: 0,
        reliability: 0,
        responseTime: response.responseTime
      };
    }
  }

  private async aggregateSignals(
    providerSignals: ProviderSignal[],
    marketData: any
  ): Promise<EnsembleDecision> {
    // Calculate weighted voting
    const weights = providerSignals.map(s => s.weight * s.reliability);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    // Count weighted votes for each action
    const actionWeights: Record<string, number> = { BUY: 0, SELL: 0, HOLD: 0 };
    const totalConfidence: Record<string, number> = { BUY: 0, SELL: 0, HOLD: 0 };

    for (let i = 0; i < providerSignals.length; i++) {
      const signal = providerSignals[i];
      const weight = weights[i] / totalWeight;
      actionWeights[signal.signal.action] += weight;
      totalConfidence[signal.signal.action] += signal.signal.confidence * weight;
    }

    // Determine action with highest weighted vote
    const action = Object.entries(actionWeights).reduce((a, b) =>
      actionWeights[a[0] as keyof typeof actionWeights] > actionWeights[b[0] as keyof typeof actionWeights] ? a : b
    )[0] as 'BUY' | 'SELL' | 'HOLD';

    const consensus = actionWeights[action];
    const confidence = totalConfidence[action] / (providerSignals.filter(s => s.signal.action === action).length || 1);

    // Generate reasoning
    const reasoning = this.generateEnsembleReasoning(providerSignals, action, consensus);

    // Risk assessment
    const riskAssessment = this.assessRisk(providerSignals, marketData);

    // Execution recommendation
    const executionRecommendation = this.generateExecutionRecommendation(
      action, confidence, consensus, riskAssessment
    );

    return {
      action,
      confidence,
      consensus,
      reasoning,
      providerSignals,
      riskAssessment,
      executionRecommendation
    };
  }

  private generateEnsembleReasoning(
    signals: ProviderSignal[],
    action: string,
    consensus: number
  ): string {
    const agreement = signals.filter(s => s.signal.action === action).length;
    const disagreement = signals.length - agreement;

    const strongProviders = signals
      .filter(s => s.signal.action === action)
      .sort((a, b) => b.reliability - a.reliability)
      .slice(0, 3)
      .map(s => s.provider);

    let reasoning = `Ensemble decision: ${action} with ${consensus.toFixed(2)} consensus (${agreement}/${signals.length} providers agree). `;

    if (consensus > 0.8) {
      reasoning += `Strong consensus among high-reliability providers: ${strongProviders.join(', ')}. `;
    } else if (consensus > 0.6) {
      reasoning += `Moderate consensus. Key supporting providers: ${strongProviders.join(', ')}. `;
    } else {
      reasoning += `Low consensus with significant disagreement. Decision based on weighted reliability scoring. `;
    }

    // Add top reasoning from supporting providers
    const topReasonings = signals
      .filter(s => s.signal.action === action)
      .sort((a, b) => b.signal.confidence - a.signal.confidence)
      .slice(0, 2)
      .map(s => `${s.provider}: ${s.signal.reasoning.substring(0, 100)}...`);

    if (topReasonings.length > 0) {
      reasoning += ` Key reasoning: ${topReasonings.join(' | ')}`;
    }

    return reasoning;
  }

  private assessRisk(signals: ProviderSignal[], marketData: any): RiskAssessment {
    const volatilities = signals.map(s =>
      s.signal.metadata?.volatility || marketData.volatility || 0
    );
    const avgVolatility = volatilities.reduce((a, b) => a + b, 0) / volatilities.length;

    let overall: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' = 'MEDIUM';
    if (avgVolatility > 0.05) overall = 'EXTREME';
    else if (avgVolatility > 0.03) overall = 'HIGH';
    else if (avgVolatility > 0.02) overall = 'MEDIUM';
    else overall = 'LOW';

    return {
      overall,
      factors: {
        volatility: avgVolatility,
        liquidity: marketData.volume > 1000000 ? 0.8 : 0.4, // Simple liquidity score
        correlation: 0.5, // Would need portfolio correlation data
        marketRegime: marketData.trend || 'SIDEWAYS'
      },
      recommendedPositionSize: Math.max(0.01, 0.05 * (1 - avgVolatility * 10)), // Inverse volatility sizing
      maxDrawdownRisk: avgVolatility * 2.58 // 99% confidence interval
    };
  }

  private generateExecutionRecommendation(
    action: string,
    confidence: number,
    consensus: number,
    riskAssessment: RiskAssessment
  ): ExecutionRecommendation {
    if (action === 'HOLD') {
      return {
        execute: false,
        urgency: 'LOW',
        timing: 'Not applicable',
        reason: 'Ensemble recommendation is to hold current position'
      };
    }

    const execute = confidence > 0.7 && consensus > 0.6 && riskAssessment.overall !== 'EXTREME';

    let urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'IMMEDIATE' = 'MEDIUM';
    if (confidence > 0.9 && consensus > 0.8) urgency = 'HIGH';
    else if (confidence > 0.8 && consensus > 0.7) urgency = 'MEDIUM';
    else urgency = 'LOW';

    let reason = execute
      ? `Strong signal with ${confidence.toFixed(2)} confidence and ${consensus.toFixed(2)} consensus. Risk level: ${riskAssessment.overall}.`
      : `Signal execution not recommended due to insufficient confidence (${confidence.toFixed(2)}), low consensus (${consensus.toFixed(2)}), or high risk (${riskAssessment.overall}).`;

    return {
      execute,
      urgency,
      timing: execute ? 'Immediate execution recommended' : 'Monitor for confirmation',
      reason
    };
  }

  private async selectProvidersForEnsemble(availableProviders: AIProviderInterface[]): Promise<AIProviderInterface[]> {
    const maxProviders = Math.min(this.ensembleConfig.maxProviders, availableProviders.length);
    const minProviders = this.ensembleConfig.minProviders;

    // Get provider metrics and filter by reliability
    const providersWithMetrics = await Promise.all(
      availableProviders.map(async provider => ({
        provider,
        metrics: this.getProviderMetrics(provider.name)
      }))
    );

    // Sort by reliability and performance
    providersWithMetrics.sort((a, b) => {
      const scoreA = a.metrics.accuracy * 0.5 + a.metrics.uptime * 0.3 + (1 - a.metrics.failedRequests / Math.max(1, a.metrics.totalRequests)) * 0.2;
      const scoreB = b.metrics.accuracy * 0.5 + b.metrics.uptime * 0.3 + (1 - b.metrics.failedRequests / Math.max(1, b.metrics.totalRequests)) * 0.2;
      return scoreB - scoreA;
    });

    // Select top providers
    return providersWithMetrics.slice(0, maxProviders).map(p => p.provider);
  }

  private async selectBestProvider(priority: 'LOW' | 'MEDIUM' | 'HIGH'): Promise<AIProviderInterface> {
    const providers = Array.from(this.providers.values());
    if (providers.length === 0) {
      throw new Error('No providers available');
    }

    // Get provider metrics and select best based on criteria
    const providersWithMetrics = await Promise.all(
      providers.map(async provider => ({
        provider,
        metrics: this.getProviderMetrics(provider.name)
      }))
    );

    // Score providers based on priority
    providersWithMetrics.sort((a, b) => {
      let scoreA = a.metrics.accuracy * 0.4;
      let scoreB = b.metrics.accuracy * 0.4;

      if (priority === 'HIGH') {
        scoreA += a.metrics.averageResponseTime < 5000 ? 0.3 : 0;
        scoreB += b.metrics.averageResponseTime < 5000 ? 0.3 : 0;
      } else if (priority === 'MEDIUM') {
        scoreA += a.metrics.totalCost < 0.01 ? 0.3 : 0;
        scoreB += b.metrics.totalCost < 0.01 ? 0.3 : 0;
      } else {
        scoreA += a.metrics.averageResponseTime < 10000 ? 0.6 : 0;
        scoreB += b.metrics.averageResponseTime < 10000 ? 0.6 : 0;
      }

      return scoreB - scoreA;
    });

    return providersWithMetrics[0].provider;
  }

  private async calculateProviderWeight(providerName: string): Promise<number> {
    const metrics = this.getProviderMetrics(providerName);
    return metrics.accuracy * 0.5 + (1 - metrics.failedRequests / Math.max(1, metrics.totalRequests)) * 0.3 + 0.2;
  }

  private getProviderReliability(providerName: string): number {
    const metrics = this.getProviderMetrics(providerName);
    const successRate = metrics.totalRequests > 0 ? (metrics.successfulRequests / metrics.totalRequests) : 0;
    return (metrics.accuracy + successRate) / 2;
  }

  private getProviderMetrics(providerName: string): ProviderMetrics {
    return this.metrics.get(providerName) || {
      provider: providerName,
      model: 'unknown',
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      averageConfidence: 0,
      accuracy: 0.5, // Default accuracy
      totalCost: 0,
      uptime: Date.now(),
      lastUsed: 0,
      errors: []
    };
  }

  private updateProviderMetrics(providerName: string, response: AIProviderResponse): void {
    const metrics = this.getProviderMetrics(providerName);
    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.lastUsed = Date.now();
    metrics.totalCost += response.cost || 0;

    // Update average response time
    const totalResponseTime = metrics.averageResponseTime * (metrics.successfulRequests - 1) + response.responseTime;
    metrics.averageResponseTime = totalResponseTime / metrics.successfulRequests;

    this.metrics.set(providerName, metrics);
  }

  private buildTradingPrompt(symbol: string, marketData: any): string {
    return `You are an expert cryptocurrency trading AI. Analyze the following market data for ${symbol}:

Current Market Data:
- Price: $${marketData.currentPrice?.toLocaleString()}
- 24h Change: ${marketData.priceChange24h?.toFixed(2)}%
- Volume: ${marketData.volume?.toLocaleString()}
- High: $${marketData.high24h?.toLocaleString()}
- Low: $${marketData.low24h?.toLocaleString()}
- Volatility: ${((marketData.volatility || 0) * 100).toFixed(2)}%
- Trend: ${marketData.trend}
- Support: $${marketData.support?.toLocaleString()}
- Resistance: $${marketData.resistance?.toLocaleString()}

Provide your trading recommendation in JSON format:
{
  "action": "BUY|SELL|HOLD",
  "confidence": 0.00-1.00,
  "reasoning": "Detailed analysis",
  "entryPrice": number,
  "stopLoss": number,
  "takeProfit": number,
  "positionSize": number,
  "riskReward": number,
  "marketCondition": "BULLISH|BEARISH|SIDEWAYS|VOLATILE",
  "riskFactors": ["List of risk factors"]
}

Focus on risk management and provide specific, actionable recommendations.`;
  }

  private getCachedResponse(symbol: string, marketData: any): EnsembleDecision | AIProviderResponse | null {
    const key = this.generateCacheKey(symbol, marketData);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.response;
  }

  private cacheResponse(symbol: string, marketData: any, response: EnsembleDecision | AIProviderResponse): void {
    const key = this.generateCacheKey(symbol, marketData);
    const entry: CacheEntry = {
      key,
      response,
      timestamp: Date.now(),
      ttl: 300000, // 5 minutes
      provider: 'ensemble',
      hits: 0
    };

    this.cache.set(key, entry);

    // Limit cache size
    if (this.cache.size > 1000) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.cache.delete(oldestKey);
    }
  }

  private generateCacheKey(symbol: string, marketData: any): string {
    const price = marketData.currentPrice || 0;
    const volume = marketData.volume || 0;
    const trend = marketData.trend || 'UNKNOWN';
    return `${symbol}_${Math.round(price)}_${Math.round(volume)}_${trend}`;
  }

  private initializeProviders(providerConfigs: Record<string, AIProviderConfig>): void {
    for (const [name, config] of Object.entries(providerConfigs)) {
      if (!config.enabled) continue;

      try {
        let provider: AIProviderInterface;

        switch (name.toLowerCase()) {
          case 'openai':
            provider = new OpenAIProvider(config);
            break;
          case 'claude':
            provider = new ClaudeProvider(config);
            break;
          case 'custom':
            provider = new CustomProvider(config);
            break;
          default:
            throw new Error(`Unknown provider type: ${name}`);
        }

        this.providers.set(name, provider);
        tradingLogger.apiCall('MultiAI', 'initializeProvider', true, 0, { provider: name });
      } catch (error) {
        logError(error instanceof Error ? error : new Error(`Failed to initialize provider ${name}`), { provider: name });
      }
    }
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [name, provider] of this.providers) {
        try {
          const healthy = await provider.isHealthy();
          if (!healthy) {
            tradingLogger.apiCall('MultiAI', 'healthCheck', false, 0, { provider: name, status: 'unhealthy' });
          }
        } catch (error) {
          tradingLogger.apiCall('MultiAI', 'healthCheck', false, 0, {
            provider: name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }, 60000); // Check every minute
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Public methods for monitoring and management
  getProviderList(): string[] {
    return Array.from(this.providers.keys());
  }

  async getAllProviderMetrics(): Promise<Record<string, ProviderMetrics>> {
    const metrics: Record<string, ProviderMetrics> = {};

    for (const [name, provider] of this.providers) {
      metrics[name] = await provider.getMetrics();
    }

    return metrics;
  }

  getCacheStats(): { size: number; hitRate: number } {
    const entries = Array.from(this.cache.values());
    const totalHits = entries.reduce((sum, entry) => sum + entry.hits, 0);
    const hitRate = entries.length > 0 ? totalHits / (entries.length + totalHits) : 0;

    return {
      size: this.cache.size,
      hitRate
    };
  }

  async performHealthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [name, provider] of this.providers) {
      try {
        results[name] = await provider.isHealthy();
      } catch {
        results[name] = false;
      }
    }

    return results;
  }

  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.removeAllListeners();
    this.providers.clear();
    this.cache.clear();
    this.batchQueue.clear();
  }
}