import { tradingLogger } from '@/utils/logger';
import { db } from '@/models/database';
import { BitkubService } from './bitkub.service';
import { BinanceService } from './binance.service';

/**
 * Exchange Intelligence Service
 * Smart routing, latency optimization, and cross-exchange decision making
 */

export interface ExchangeInfo {
  name: string;
  latency: number; // Average latency in ms
  reliability: number; // 0-100 reliability score
  fees: {
    maker: number;
    taker: number;
  };
  supportedPairs: string[];
  rateLimits: {
    requestsPerSecond: number;
    requestsPerMinute: number;
  };
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  lastHealthCheck: number;
}

export interface ExchangeMetrics {
  exchange: string;
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  bidSize: number;
  askSize: number;
  volume24h: number;
  price: number;
  timestamp: number;
  depth: {
    bids: Array<[number, number]>;
    asks: Array<[number, number]>;
  };
}

export interface Route {
  exchange: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  expectedPrice: number;
  executionProbability: number;
  estimatedCost: number;
  estimatedLatency: number;
  reliability: number;
}

export interface ArbitrageOpportunity {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  buyVolume: number;
  sellVolume: number;
  profitAfterFees: number;
  estimatedProfitPercent: number;
  executionRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: number;
}

export interface ExecutionPlan {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  amount: number;
  routes: Route[];
  expectedCost: number;
  expectedLatency: number;
  reliabilityScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  fallbackRoutes: Route[];
  recommendations: string[];
}

export interface CrossExchangePosition {
  symbol: string;
  exchanges: {
    [exchange: string]: {
      balance: number;
      price: number;
      value: number;
      weight: number;
    };
  };
  totalValue: number;
  bestPrice: number;
  worstPrice: number;
  priceSpread: number;
  arbitrageOpportunity: boolean;
}

export class ExchangeIntelligenceService {
  private exchanges: Map<string, any> = new Map();
  private exchangeMetrics: Map<string, ExchangeMetrics[]> = new Map();
  private arbitrageOpportunities: ArbitrageOpportunity[] = [];
  private lastUpdateTime = 0;
  private readonly UPDATE_INTERVAL = 5000; // 5 seconds
  private readonly MIN_SPREAD_THRESHOLD = 0.1; // 0.1% minimum spread for arbitrage
  private readonly MAX_ARBITRAGE_AGE = 30000; // 30 seconds max age for arbitrage opportunities

  constructor() {
    this.initializeExchanges();
    this.startMonitoring();
  }

  /**
   * Get best execution route for an order
   */
  async getBestRoute(
    symbol: string,
    action: 'BUY' | 'SELL',
    amount: number,
    exchanges?: string[]
  ): Promise<ExecutionPlan> {
    try {
      const availableExchanges = exchanges || this.getAvailableExchangesForSymbol(symbol);
      const routes: Route[] = [];

      for (const exchangeName of availableExchanges) {
        const route = await this.calculateRoute(exchangeName, symbol, action, amount);
        if (route) {
          routes.push(route);
        }
      }

      if (routes.length === 0) {
        throw new Error(`No available routes for ${symbol} on specified exchanges`);
      }

      // Sort routes by cost and reliability
      routes.sort((a, b) => {
        const scoreA = this.calculateRouteScore(a);
        const scoreB = this.calculateRouteScore(b);
        return scoreB - scoreA;
      });

      const primaryRoute = routes[0];
      const fallbackRoutes = routes.slice(1, 3); // Keep up to 3 fallback routes

      const executionPlan: ExecutionPlan = {
        id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        symbol,
        action,
        amount,
        routes: [primaryRoute],
        expectedCost: primaryRoute.estimatedCost,
        expectedLatency: primaryRoute.estimatedLatency,
        reliabilityScore: primaryRoute.reliability,
        riskLevel: this.calculateRiskLevel(primaryRoute, fallbackRoutes),
        fallbackRoutes,
        recommendations: this.generateRecommendations(primaryRoute, fallbackRoutes)
      };

      tradingLogger.intelligence('BEST_ROUTE_CALCULATED', {
        planId: executionPlan.id,
        symbol,
        action,
        amount,
        primaryExchange: primaryRoute.exchange,
        expectedCost: executionPlan.expectedCost,
        reliabilityScore: executionPlan.reliabilityScore
      });

      return executionPlan;
    } catch (error) {
      tradingLogger.error('FAILED_TO_GET_BEST_ROUTE', {
        symbol,
        action,
        amount,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get cross-exchange price information
   */
  async getCrossExchangePrices(symbols: string[]): Promise<Map<string, CrossExchangePosition>> {
    try {
      const crossExchangePositions = new Map<string, CrossExchangePosition>();

      for (const symbol of symbols) {
        const positions = await this.getCrossExchangePosition(symbol);
        crossExchangePositions.set(symbol, positions);
      }

      return crossExchangePositions;
    } catch (error) {
      tradingLogger.error('FAILED_TO_GET_CROSS_EXCHANGE_PRICES', {
        symbols,
        error: error.message
      });
      return new Map();
    }
  }

  /**
   * Scan for arbitrage opportunities
   */
  async scanArbitrageOpportunities(): Promise<ArbitrageOpportunity[]> {
    try {
      const opportunities: ArbitrageOpportunity[] = [];
      const commonSymbols = await this.getCommonSymbols();

      for (const symbol of commonSymbols) {
        const position = await this.getCrossExchangePosition(symbol);

        if (position.exchanges && Object.keys(position.exchanges).length >= 2) {
          const opportunity = this.analyzeArbitrageOpportunity(position);
          if (opportunity && opportunity.profitAfterFees > 0) {
            opportunities.push(opportunity);
          }
        }
      }

      // Sort by profit percentage
      opportunities.sort((a, b) => b.estimatedProfitPercent - a.estimatedProfitPercent);

      // Keep only profitable opportunities
      this.arbitrageOpportunities = opportunities.filter(op => op.profitAfterFees > 0);

      tradingLogger.intelligence('ARBITRAGE_SCAN_COMPLETED', {
        opportunitiesFound: opportunities.length,
        bestOpportunity: opportunities[0]?.symbol || 'none',
        maxProfitPercent: opportunities[0]?.estimatedProfitPercent || 0
      });

      return this.arbitrageOpportunities;
    } catch (error) {
      tradingLogger.error('FAILED_ARBITRAGE_SCAN', { error: error.message });
      return [];
    }
  }

  /**
   * Get exchange health status
   */
  async getExchangeHealthStatus(): Promise<Map<string, ExchangeInfo>> {
    const healthStatus = new Map<string, ExchangeInfo>();

    for (const [exchangeName, exchange] of this.exchanges) {
      try {
        const startTime = Date.now();
        const healthInfo = await this.checkExchangeHealth(exchange);
        const latency = Date.now() - startTime;

        healthStatus.set(exchangeName, {
          ...healthInfo,
          latency,
          lastHealthCheck: Date.now()
        });
      } catch (error) {
        tradingLogger.error('EXCHANGE_HEALTH_CHECK_FAILED', {
          exchange: exchangeName,
          error: error.message
        });

        healthStatus.set(exchangeName, {
          name: exchangeName,
          latency: 9999,
          reliability: 0,
          fees: { maker: 0, taker: 0 },
          supportedPairs: [],
          rateLimits: { requestsPerSecond: 0, requestsPerMinute: 0 },
          healthStatus: 'UNHEALTHY',
          lastHealthCheck: Date.now()
        });
      }
    }

    return healthStatus;
  }

  /**
   * Get fee optimization recommendations
   */
  async getFeeOptimization(symbol: string, amount: number): Promise<{
    exchange: string;
    orderType: 'MAKER' | 'TAKER';
    estimatedFee: number;
    savings: number;
  }> {
    try {
      const exchanges = this.getAvailableExchangesForSymbol(symbol);
      let bestOption = {
        exchange: '',
        orderType: 'MAKER' as 'MAKER' | 'TAKER',
        estimatedFee: Infinity,
        savings: 0
      };

      for (const exchangeName of exchanges) {
        const exchangeInfo = await this.getExchangeInfo(exchangeName);
        const metrics = await this.getExchangeMetrics(exchangeName, symbol);

        if (metrics) {
          // Calculate maker fee (if order book has sufficient depth)
          const makerFee = this.calculateMakerFee(metrics, amount);
          const takerFee = amount * (exchangeInfo.fees.taker / 100);

          const minFee = Math.min(makerFee, takerFee);
          const orderType = makerFee <= takerFee ? 'MAKER' : 'TAKER';

          if (minFee < bestOption.estimatedFee) {
            const savings = bestOption.estimatedFee - minFee;
            bestOption = {
              exchange: exchangeName,
              orderType,
              estimatedFee: minFee,
              savings
            };
          }
        }
      }

      tradingLogger.intelligence('FEE_OPTIMIZATION_CALCULATED', {
        symbol,
        amount,
        bestExchange: bestOption.exchange,
        orderType: bestOption.orderType,
        estimatedFee: bestOption.estimatedFee,
        savings: bestOption.savings
      });

      return bestOption;
    } catch (error) {
      tradingLogger.error('FAILED_FEE_OPTIMIZATION', {
        symbol,
        amount,
        error: error.message
      });
      return {
        exchange: '',
        orderType: 'TAKER',
        estimatedFee: 0,
        savings: 0
      };
    }
  }

  /**
   * Get rate limit management recommendations
   */
  async getRateLimitRecommendations(): Promise<{
    [exchange: string]: {
      currentUsage: number;
      limit: number;
      utilization: number;
      recommendation: string;
    };
  }> {
    const recommendations: any = {};

    for (const [exchangeName, exchange] of this.exchanges) {
      try {
        const exchangeInfo = await this.getExchangeInfo(exchangeName);
        const currentUsage = this.getCurrentRateLimitUsage(exchangeName);
        const utilization = (currentUsage / exchangeInfo.rateLimits.requestsPerMinute) * 100;

        let recommendation = '';
        if (utilization > 80) {
          recommendation = 'Reduce request frequency - approaching rate limit';
        } else if (utilization > 60) {
          recommendation = 'Monitor request frequency carefully';
        } else if (utilization < 20) {
          recommendation = 'Can increase request frequency if needed';
        } else {
          recommendation = 'Optimal request frequency';
        }

        recommendations[exchangeName] = {
          currentUsage,
          limit: exchangeInfo.rateLimits.requestsPerMinute,
          utilization,
          recommendation
        };
      } catch (error) {
        recommendations[exchangeName] = {
          currentUsage: 0,
          limit: 0,
          utilization: 0,
          recommendation: 'Unable to get rate limit info'
        };
      }
    }

    return recommendations;
  }

  /**
   * Execute order with intelligent routing
   */
  async executeOrderWithRouting(plan: ExecutionPlan): Promise<{
    success: boolean;
    exchange: string;
    orderId: string;
    executedPrice: number;
    executedAmount: number;
    fees: number;
    latency: number;
    error?: string;
    usedFallback: boolean;
  }> {
    try {
      tradingLogger.info('EXECUTING_ORDER_WITH_ROUTING', {
        planId: plan.id,
        symbol: plan.symbol,
        action: plan.action,
        amount: plan.amount,
        primaryExchange: plan.routes[0].exchange
      });

      const startTime = Date.now();
      let lastError: string | undefined;

      // Try primary route first
      for (const route of plan.routes) {
        try {
          const result = await this.executeOrderOnExchange(route, plan.amount);

          if (result.success) {
            const latency = Date.now() - startTime;

            tradingLogger.info('ORDER_EXECUTED_SUCCESS', {
              planId: plan.id,
              exchange: route.exchange,
              orderId: result.orderId,
              executedPrice: result.executedPrice,
              executedAmount: result.executedAmount,
              fees: result.fees,
              latency,
              usedFallback: route !== plan.routes[0]
            });

            return {
              success: true,
              exchange: route.exchange,
              orderId: result.orderId,
              executedPrice: result.executedPrice,
              executedAmount: result.executedAmount,
              fees: result.fees,
              latency,
              usedFallback: route !== plan.routes[0]
            };
          }
        } catch (error) {
          lastError = error.message;
          tradingLogger.warn('PRIMARY_ROUTE_FAILED', {
            planId: plan.id,
            exchange: route.exchange,
            error: error.message
          });
        }
      }

      // Try fallback routes if all primary routes failed
      for (const fallbackRoute of plan.fallbackRoutes) {
        try {
          const result = await this.executeOrderOnExchange(fallbackRoute, plan.amount);

          if (result.success) {
            const latency = Date.now() - startTime;

            tradingLogger.info('FALLBACK_ROUTE_SUCCESS', {
              planId: plan.id,
              exchange: fallbackRoute.exchange,
              orderId: result.orderId,
              executedPrice: result.executedPrice,
              executedAmount: result.executedAmount,
              fees: result.fees,
              latency,
              usedFallback: true
            });

            return {
              success: true,
              exchange: fallbackRoute.exchange,
              orderId: result.orderId,
              executedPrice: result.executedPrice,
              executedAmount: result.executedAmount,
              fees: result.fees,
              latency,
              usedFallback: true
            };
          }
        } catch (error) {
          lastError = error.message;
          tradingLogger.error('FALLBACK_ROUTE_FAILED', {
            planId: plan.id,
            exchange: fallbackRoute.exchange,
            error: error.message
          });
        }
      }

      return {
        success: false,
        exchange: '',
        orderId: '',
        executedPrice: 0,
        executedAmount: 0,
        fees: 0,
        latency: Date.now() - startTime,
        error: lastError || 'All routes failed',
        usedFallback: false
      };
    } catch (error) {
      tradingLogger.error('ORDER_EXECUTION_ROUTING_FAILED', {
        planId: plan.id,
        error: error.message
      });

      return {
        success: false,
        exchange: '',
        orderId: '',
        executedPrice: 0,
        executedAmount: 0,
        fees: 0,
        latency: 0,
        error: error.message,
        usedFallback: false
      };
    }
  }

  /**
   * Private helper methods
   */

  private initializeExchanges(): void {
    // Initialize Binance
    this.exchanges.set('binance', new BinanceService());

    // Initialize Bitkub
    this.exchanges.set('bitkub', new BitkubService());

    tradingLogger.info('EXCHANGE_INTELLIGENCE_INITIALIZED', {
      exchangesCount: this.exchanges.size,
      exchanges: Array.from(this.exchanges.keys())
    });
  }

  private startMonitoring(): void {
    setInterval(async () => {
      await this.updateExchangeMetrics();
      await this.scanArbitrageOpportunities();
      this.lastUpdateTime = Date.now();
    }, this.UPDATE_INTERVAL);

    tradingLogger.info('EXCHANGE_MONITORING_STARTED', {
      updateInterval: this.UPDATE_INTERVAL
    });
  }

  private async updateExchangeMetrics(): Promise<void> {
    try {
      const symbols = await this.getCommonSymbols();

      for (const symbol of symbols) {
        const metrics: ExchangeMetrics[] = [];

        for (const [exchangeName, exchange] of this.exchanges) {
          try {
            const exchangeMetrics = await this.getExchangeMetrics(exchangeName, symbol);
            if (exchangeMetrics) {
              metrics.push(exchangeMetrics);
            }
          } catch (error) {
            tradingLogger.error('FAILED_TO_UPDATE_EXCHANGE_METRICS', {
              exchange: exchangeName,
              symbol,
              error: error.message
            });
          }
        }

        if (metrics.length > 0) {
          this.exchangeMetrics.set(symbol, metrics);
        }
      }
    } catch (error) {
      tradingLogger.error('FAILED_TO_UPDATE_EXCHANGE_METRICS', { error: error.message });
    }
  }

  private async getExchangeMetrics(exchangeName: string, symbol: string): Promise<ExchangeMetrics | null> {
    try {
      const exchange = this.exchanges.get(exchangeName);
      if (!exchange) return null;

      // Get ticker data
      const ticker = await exchange.getTicker(symbol);
      if (!ticker) return null;

      // Get order book
      const orderBook = await exchange.getOrderBook(symbol, 10);
      if (!orderBook) return null;

      const bid = orderBook.bids[0]?.[0] || 0;
      const ask = orderBook.asks[0]?.[0] || 0;
      const bidSize = orderBook.bids[0]?.[1] || 0;
      const askSize = orderBook.asks[0]?.[1] || 0;

      return {
        exchange: exchangeName,
        symbol,
        bid,
        ask,
        spread: ask - bid,
        bidSize,
        askSize,
        volume24h: ticker.baseVolume || 0,
        price: ticker.last,
        timestamp: Date.now(),
        depth: orderBook
      };
    } catch (error) {
      return null;
    }
  }

  private async calculateRoute(
    exchangeName: string,
    symbol: string,
    action: 'BUY' | 'SELL',
    amount: number
  ): Promise<Route | null> {
    try {
      const exchange = this.exchanges.get(exchangeName);
      if (!exchange) return null;

      const metrics = await this.getExchangeMetrics(exchangeName, symbol);
      if (!metrics) return null;

      const exchangeInfo = await this.getExchangeInfo(exchangeName);
      const price = action === 'BUY' ? metrics.ask : metrics.bid;
      const feeRate = action === 'BUY' ? exchangeInfo.fees.taker : exchangeInfo.fees.taker;
      const estimatedFee = amount * (price * feeRate / 100);

      return {
        exchange: exchangeName,
        symbol,
        action,
        expectedPrice: price,
        executionProbability: this.calculateExecutionProbability(metrics, amount),
        estimatedCost: estimatedFee,
        estimatedLatency: exchangeInfo.latency,
        reliability: exchangeInfo.reliability
      };
    } catch (error) {
      return null;
    }
  }

  private calculateRouteScore(route: Route): number {
    const costWeight = 0.4;
    const reliabilityWeight = 0.3;
    const latencyWeight = 0.2;
    const probabilityWeight = 0.1;

    const costScore = Math.max(0, 100 - (route.estimatedCost / 100)); // Normalize cost
    const reliabilityScore = route.reliability;
    const latencyScore = Math.max(0, 100 - (route.estimatedLatency / 100)); // Normalize latency
    const probabilityScore = route.executionProbability * 100;

    return (
      costScore * costWeight +
      reliabilityScore * reliabilityWeight +
      latencyScore * latencyWeight +
      probabilityScore * probabilityWeight
    );
  }

  private calculateRiskLevel(primaryRoute: Route, fallbackRoutes: Route[]): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (primaryRoute.reliability > 80 && primaryRoute.executionProbability > 0.9) {
      return 'LOW';
    } else if (primaryRoute.reliability > 60 && primaryRoute.executionProbability > 0.7) {
      return 'MEDIUM';
    } else {
      return 'HIGH';
    }
  }

  private generateRecommendations(primaryRoute: Route, fallbackRoutes: Route[]): string[] {
    const recommendations: string[] = [];

    if (primaryRoute.estimatedCost > 100) {
      recommendations.push('Consider using maker orders to reduce fees');
    }

    if (primaryRoute.estimatedLatency > 1000) {
      recommendations.push('High latency detected - monitor execution closely');
    }

    if (primaryRoute.reliability < 80) {
      recommendations.push('Exchange reliability is suboptimal - monitor closely');
    }

    if (fallbackRoutes.length === 0) {
      recommendations.push('No fallback routes available - consider splitting order');
    }

    return recommendations;
  }

  private async getCommonSymbols(): Promise<string[]> {
    // This would normally check all exchanges for common symbols
    // For now, return a hardcoded list of common crypto pairs
    return [
      'BTC_USDT',
      'ETH_USDT',
      'BNB_USDT',
      'ADA_USDT',
      'SOL_USDT',
      'DOT_USDT',
      'MATIC_USDT',
      'LINK_USDT',
      'UNI_USDT',
      'ATOM_USDT'
    ];
  }

  private async getCrossExchangePosition(symbol: string): Promise<CrossExchangePosition> {
    const exchanges: { [exchange: string]: any } = {};
    let totalValue = 0;
    let bestPrice = 0;
    let worstPrice = Infinity;

    for (const [exchangeName, exchange] of this.exchanges) {
      try {
        const metrics = await this.getExchangeMetrics(exchangeName, symbol);
        if (metrics) {
          const balance = await this.getExchangeBalance(exchange, symbol);
          const value = balance * metrics.price;

          exchanges[exchangeName] = {
            balance,
            price: metrics.price,
            value,
            weight: 0 // Will be calculated later
          };

          totalValue += value;
          bestPrice = Math.max(bestPrice, metrics.price);
          worstPrice = Math.min(worstPrice, metrics.price);
        }
      } catch (error) {
        // Skip exchange if unable to get data
      }
    }

    // Calculate weights based on value
    for (const [exchangeName, position] of Object.entries(exchanges)) {
      if (totalValue > 0) {
        position.weight = position.value / totalValue;
      }
    }

    const priceSpread = bestPrice > 0 ? ((bestPrice - worstPrice) / bestPrice) * 100 : 0;
    const arbitrageOpportunity = priceSpread > this.MIN_SPREAD_THRESHOLD;

    return {
      symbol,
      exchanges,
      totalValue,
      bestPrice,
      worstPrice,
      priceSpread,
      arbitrageOpportunity
    };
  }

  private analyzeArbitrageOpportunity(position: CrossExchangePosition): ArbitrageOpportunity | null {
    const exchanges = Object.keys(position.exchanges);
    if (exchanges.length < 2) return null;

    // Find best buy and sell exchanges
    let bestBuyExchange = '';
    let bestBuyPrice = Infinity;
    let bestBuyVolume = 0;

    let bestSellExchange = '';
    let bestSellPrice = 0;
    let bestSellVolume = 0;

    for (const [exchangeName, positionData] of Object.entries(position.exchanges)) {
      if (positionData.price > 0) {
        // This is a buy opportunity (we want to buy at the lowest price)
        if (positionData.price < bestBuyPrice && positionData.balance > 0) {
          bestBuyExchange = exchangeName;
          bestBuyPrice = positionData.price;
          bestBuyVolume = positionData.balance;
        }

        // This is a sell opportunity (we want to sell at the highest price)
        if (positionData.price > bestSellPrice) {
          bestSellExchange = exchangeName;
          bestSellPrice = positionData.price;
          bestSellVolume = positionData.balance;
        }
      }
    }

    if (bestBuyExchange && bestSellExchange && bestBuyPrice < bestSellPrice) {
      const spread = bestSellPrice - bestBuyPrice;
      const spreadPercent = (spread / bestBuyPrice) * 100;

      // Calculate fees
      const buyFee = await this.calculateTradingFee(bestBuyExchange, bestBuyPrice, bestBuyVolume);
      const sellFee = await this.calculateTradingFee(bestSellExchange, bestSellPrice, bestSellVolume);
      const profitAfterFees = (spread * Math.min(bestBuyVolume, bestSellVolume)) - buyFee - sellFee;

      const profitPercent = bestBuyPrice > 0 ? (profitAfterFees / (bestBuyPrice * Math.min(bestBuyVolume, bestSellVolume))) * 100 : 0;

      if (profitAfterFees > 0) {
        return {
          symbol: position.symbol,
          buyExchange: bestBuyExchange,
          sellExchange: bestSellExchange,
          buyPrice: bestBuyPrice,
          sellPrice: bestSellPrice,
          spread,
          spreadPercent,
          buyVolume: bestBuyVolume,
          sellVolume: bestSellVolume,
          profitAfterFees,
          estimatedProfitPercent: profitPercent,
          executionRisk: this.calculateArbitrageRisk(bestBuyExchange, bestSellExchange),
          timestamp: Date.now()
        };
      }
    }

    return null;
  }

  private calculateArbitrageRisk(buyExchange: string, sellExchange: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    // Risk assessment based on exchange reliability and liquidity
    const buyExchangeInfo = this.getExchangeInfo(buyExchange);
    const sellExchangeInfo = this.getExchangeInfo(sellExchange);

    const avgReliability = (buyExchangeInfo.reliability + sellExchangeInfo.reliability) / 2;

    if (avgReliability > 80) return 'LOW';
    if (avgReliability > 60) return 'MEDIUM';
    return 'HIGH';
  }

  private async calculateTradingFee(exchangeName: string, price: number, amount: number): Promise<number> {
    try {
      const exchange = this.exchanges.get(exchangeName);
      if (!exchange) return 0;

      const exchangeInfo = await this.getExchangeInfo(exchangeName);
      return amount * price * (exchangeInfo.fees.taker / 100);
    } catch (error) {
      return 0;
    }
  }

  private calculateExecutionProbability(metrics: ExchangeMetrics, amount: number): number {
    // Calculate probability based on order book depth and spread
    const spreadPercent = (metrics.spread / metrics.price) * 100;
    const totalDepth = metrics.bidSize + metrics.askSize;
    const relativeDepth = totalDepth / amount;

    let probability = 0.5; // Base probability

    // Adjust for spread (tighter spread = higher probability)
    if (spreadPercent < 0.1) probability += 0.3;
    else if (spreadPercent < 0.5) probability += 0.2;
    else if (spreadPercent > 2) probability -= 0.2;

    // Adjust for depth (more depth = higher probability)
    if (relativeDepth > 10) probability += 0.2;
    else if (relativeDepth > 5) probability += 0.1;
    else if (relativeDepth < 2) probability -= 0.2;

    return Math.max(0.1, Math.min(0.95, probability));
  }

  private calculateMakerFee(metrics: ExchangeMetrics, amount: number): number {
    // Estimate maker fee based on order book depth
    const limitPrice = metrics.bid + (metrics.spread * 0.5); // Mid price
    const makerFeeRate = 0.25; // Assume 0.25% maker fee

    return amount * limitPrice * (makerFeeRate / 100);
  }

  private getAvailableExchangesForSymbol(symbol: string): string[] {
    // Check which exchanges support this symbol
    const availableExchanges: string[] = [];

    for (const [exchangeName, exchange] of this.exchanges) {
      // This would normally check if the exchange supports the symbol
      // For now, assume all exchanges support all symbols
      availableExchanges.push(exchangeName);
    }

    return availableExchanges;
  }

  private async getExchangeInfo(exchangeName: string): Promise<ExchangeInfo> {
    // This would normally fetch real exchange info
    // For now, return mock data
    const mockInfo: { [key: string]: ExchangeInfo } = {
      binance: {
        name: 'binance',
        latency: 50,
        reliability: 95,
        fees: { maker: 0.1, taker: 0.1 },
        supportedPairs: [],
        rateLimits: { requestsPerSecond: 10, requestsPerMinute: 600 },
        healthStatus: 'HEALTHY',
        lastHealthCheck: Date.now()
      },
      bitkub: {
        name: 'bitkub',
        latency: 200,
        reliability: 85,
        fees: { maker: 0.25, taker: 0.25 },
        supportedPairs: [],
        rateLimits: { requestsPerSecond: 5, requestsPerMinute: 300 },
        healthStatus: 'HEALTHY',
        lastHealthCheck: Date.now()
      }
    };

    return mockInfo[exchangeName] || mockInfo.binance;
  }

  private async checkExchangeHealth(exchange: any): Promise<ExchangeInfo> {
    try {
      const isHealthy = await exchange.testConnection();
      const info = await this.getExchangeInfo(exchange.constructor.name.toLowerCase());

      return {
        ...info,
        healthStatus: isHealthy ? 'HEALTHY' : 'UNHEALTHY'
      };
    } catch (error) {
      return {
        name: exchange.constructor.name.toLowerCase(),
        latency: 9999,
        reliability: 0,
        fees: { maker: 0, taker: 0 },
        supportedPairs: [],
        rateLimits: { requestsPerSecond: 0, requestsPerMinute: 0 },
        healthStatus: 'UNHEALTHY',
        lastHealthCheck: Date.now()
      };
    }
  }

    private async getExchangeBalance(exchange: any, symbol: string): Promise<number> {
      try {
        const balances = await exchange.getBalance();
        // This would normally parse the actual balance for the symbol
        // For now, return a mock balance
        return 100; // Mock balance
      } catch (error) {
        return 0;
      }
    }

    private getCurrentRateLimitUsage(exchangeName: string): number {
      // This would track actual API usage
      // For now, return a mock usage
      return Math.floor(Math.random() * 50);
    }

    private async executeOrderOnExchange(route: Route, amount: number): Promise<{
      success: boolean;
      orderId: string;
      executedPrice: number;
      executedAmount: number;
      fees: number;
    }> {
      try {
        const exchange = this.exchanges.get(route.exchange);
        if (!exchange) {
          throw new Error(`Exchange ${route.exchange} not available`);
        }

        // This would execute the actual order on the exchange
        // For now, return a mock response
        const orderId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        return {
          success: true,
          orderId,
          executedPrice: route.expectedPrice,
          executedAmount: amount,
          fees: route.estimatedCost
        };
      } catch (error) {
        throw error;
      }
    }
}