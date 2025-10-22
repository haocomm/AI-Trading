/**
 * Liquidity Aggregation Service
 *
 * Aggregates liquidity from multiple exchanges (Binance and Bitkub) to provide
 * unified order books, best execution pricing, and improved market depth analysis.
 */

import { logger, tradingLogger } from '@/utils/logger';
import { OrderRequest, OrderResponse } from '@/types';
import BinanceService from './binance.service';
import BitkubService from './bitkub.service';

export interface AggregatedOrderBook {
  symbol: string;
  timestamp: Date;
  exchanges: {
    binance: {
      bids: Array<[number, number]>;
      asks: Array<[number, number]>;
      lastUpdate: Date;
    };
    bitkub: {
      bids: Array<[number, number]>;
      asks: Array<[number, number]>;
      lastUpdate: Date;
    };
  };
  aggregated: {
    bids: Array<[number, number]>;
    asks: Array<[number, number]>;
    totalBidVolume: number;
    totalAskVolume: number;
    spread: number;
    weightedMidPrice: number;
  };
  quality: {
    depthScore: number;
    spreadScore: number;
    liquidityScore: number;
    overallScore: number;
  };
}

export interface LiquidityAnalysis {
  symbol: string;
  exchanges: {
    binance: {
      volume: number;
      depth: number;
      spread: number;
      volatility: number;
    };
    bitkub: {
      volume: number;
      depth: number;
      spread: number;
      volatility: number;
    };
  };
  comparison: {
    priceDifference: number;
    volumeDifference: number;
    liquidityLeader: 'binance' | 'bitkub' | 'equal';
    bestBid: {
      exchange: 'binance' | 'bitkub';
      price: number;
      volume: number;
    };
    bestAsk: {
      exchange: 'binance' | 'bitkub';
      price: number;
      volume: number;
    };
  };
  recommendations: Array<{
    type: 'BUY' | 'SELL' | 'SPLIT';
    exchange: 'binance' | 'bitkub' | 'both';
    percentage: number;
    reasoning: string;
  }>;
}

export interface ExecutionPlan {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  totalQuantity: number;
  type: 'MARKET' | 'LIMIT';
  splits: Array<{
    exchange: 'binance' | 'bitkub';
    quantity: number;
    price?: number;
    estimatedPrice: number;
    estimatedFillTime: number;
    confidence: number;
    reasoning: string;
  }>;
  summary: {
    averagePrice: number;
    totalCost: number;
    estimatedFees: number;
    slippageEstimate: number;
    executionTime: number;
    liquidityUtilization: number;
  };
  risks: Array<{
    type: 'LIQUIDITY' | 'TIMING' | 'PRICE_MOVEMENT' | 'EXCHANGE_FAILURE';
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
    mitigation: string;
  }>;
}

export interface LiquidityAggregationConfig {
  updateInterval: number;
  maxOrderBookDepth: number;
  minLiquidityThreshold: number;
  priceTolerance: number;
  volumeWeighting: number;
  exchangePriorities: {
    binance: number;
    bitkub: number;
  };
  fees: {
    binance: { maker: number; taker: number };
    bitkub: { maker: number; taker: number };
  };
}

export class LiquidityAggregationService {
  private orderBooks: Map<string, AggregatedOrderBook> = new Map();
  private updateIntervals: Map<string, NodeJS.Timeout> = new Map();
  private config: LiquidityAggregationConfig;

  constructor(
    private binanceService: BinanceService,
    private bitkubService: BitkubService
  ) {
    this.config = this.getDefaultConfig();
  }

  /**
   * Start liquidity aggregation for a symbol
   */
  async startAggregation(symbol: string): Promise<void> {
    if (this.orderBooks.has(symbol)) {
      logger.warn(`Liquidity aggregation already active for ${symbol}`);
      return;
    }

    logger.info(`Starting liquidity aggregation for ${symbol}`);

    // Initial aggregation
    await this.updateOrderBook(symbol);

    // Set up periodic updates
    const interval = setInterval(
      () => this.updateOrderBook(symbol),
      this.config.updateInterval
    );

    this.updateIntervals.set(symbol, interval);

    logger.info(`Liquidity aggregation started for ${symbol}`, {
      updateInterval: this.config.updateInterval,
    });
  }

  /**
   * Stop liquidity aggregation for a symbol
   */
  stopAggregation(symbol: string): void {
    const interval = this.updateIntervals.get(symbol);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(symbol);
    }

    this.orderBooks.delete(symbol);

    logger.info(`Liquidity aggregation stopped for ${symbol}`);
  }

  /**
   * Get aggregated order book for a symbol
   */
  getAggregatedOrderBook(symbol: string): AggregatedOrderBook | null {
    return this.orderBooks.get(symbol) || null;
  }

  /**
   * Analyze liquidity across exchanges
   */
  async analyzeLiquidity(symbol: string): Promise<LiquidityAnalysis | null> {
    try {
      const orderBook = this.orderBooks.get(symbol);
      if (!orderBook) {
        logger.warn(`No aggregated order book available for ${symbol}`);
        return null;
      }

      // Calculate exchange-specific metrics
      const binanceMetrics = this.calculateExchangeMetrics(
        orderBook.exchanges.binance.bids,
        orderBook.exchanges.binance.asks
      );

      const bitkubMetrics = this.calculateExchangeMetrics(
        orderBook.exchanges.bitkub.bids,
        orderBook.exchanges.bitkub.asks
      );

      // Compare exchanges
      const priceDiff = binanceMetrics.midPrice - bitkubMetrics.midPrice;
      const volumeDiff = binanceMetrics.totalVolume - bitkubMetrics.totalVolume;

      // Determine best bids and asks
      const bestBid = binanceMetrics.bestBid.price > bitkubMetrics.bestBid.price
        ? { exchange: 'binance' as const, ...binanceMetrics.bestBid }
        : { exchange: 'bitkub' as const, ...bitkubMetrics.bestBid };

      const bestAsk = binanceMetrics.bestAsk.price < bitkubMetrics.bestAsk.price
        ? { exchange: 'binance' as const, ...binanceMetrics.bestAsk }
        : { exchange: 'bitkub' as const, ...bitkubMetrics.bestAsk };

      // Determine liquidity leader
      const liquidityLeader = binanceMetrics.totalVolume > bitkubMetrics.totalVolume * 1.2
        ? 'binance'
        : bitkubMetrics.totalVolume > binanceMetrics.totalVolume * 1.2
        ? 'bitkub'
        : 'equal';

      // Generate recommendations
      const recommendations = this.generateLiquidityRecommendations(
        binanceMetrics,
        bitkubMetrics,
        bestBid,
        bestAsk
      );

      return {
        symbol,
        exchanges: {
          binance: binanceMetrics,
          bitkub: bitkubMetrics,
        },
        comparison: {
          priceDifference: priceDiff,
          volumeDifference: volumeDiff,
          liquidityLeader,
          bestBid,
          bestAsk,
        },
        recommendations,
      };
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Liquidity analysis failed'), {
        action: 'analyzeLiquidity',
        symbol,
      });
      return null;
    }
  }

  /**
   * Create optimal execution plan
   */
  async createExecutionPlan(order: OrderRequest): Promise<ExecutionPlan | null> {
    try {
      const symbol = order.symbol;
      const orderBook = this.orderBooks.get(symbol);

      if (!orderBook) {
        logger.warn(`No aggregated order book available for ${symbol}`);
        return null;
      }

      const orderId = `exec_${symbol}_${Date.now()}`;
      const side = order.side;
      const totalQuantity = order.quantity || 0;

      if (totalQuantity <= 0) {
        throw new Error('Invalid order quantity');
      }

      // Analyze available liquidity
      const availableLiquidity = this.calculateAvailableLiquidity(
        orderBook,
        side,
        totalQuantity
      );

      if (availableLiquidity.totalAvailable < totalQuantity * 0.9) { // 90% threshold
        throw new Error(`Insufficient liquidity: needed ${totalQuantity}, available ${availableLiquidity.totalAvailable}`);
      }

      // Calculate optimal execution splits
      const splits = this.calculateOptimalSplits(
        orderBook,
        side,
        totalQuantity,
        order.type
      );

      // Calculate summary
      const summary = this.calculateExecutionSummary(splits, order.type);

      // Assess risks
      const risks = this.assessExecutionRisks(splits, orderBook);

      return {
        orderId,
        symbol,
        side,
        totalQuantity,
        type: order.type || 'MARKET',
        splits,
        summary,
        risks,
      };
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Failed to create execution plan'), {
        action: 'createExecutionPlan',
        order,
      });
      return null;
    }
  }

  /**
   * Execute order using liquidity aggregation
   */
  async executeOrder(executionPlan: ExecutionPlan): Promise<{
    success: boolean;
    executions: Array<{
      exchange: string;
      quantity: number;
      price: number;
      orderId?: string;
      error?: string;
    }>;
    averagePrice?: number;
    totalCost?: number;
    error?: string;
  }> {
    try {
      const executions: Array<{
        exchange: string;
        quantity: number;
        price: number;
        orderId?: string;
        error?: string;
      }> = [];

      // Execute each split
      for (const split of executionPlan.splits) {
        try {
          let orderResponse: OrderResponse | null = null;

          if (split.exchange === 'binance') {
            const orderRequest: OrderRequest = {
              symbol: executionPlan.symbol,
              side: executionPlan.side,
              type: executionPlan.type,
              quantity: split.quantity,
              price: split.price,
            };

            orderResponse = await this.binanceService.placeOrder(orderRequest);
          } else if (split.exchange === 'bitkub') {
            const bitkubSymbol = this.convertToBitkubSymbol(executionPlan.symbol);

            if (executionPlan.side === 'BUY') {
              orderResponse = await this.bitkubService.placeBuyOrder(
                bitkubSymbol,
                split.quantity,
                split.price || split.estimatedPrice
              );
            } else {
              orderResponse = await this.bitkubService.placeSellOrder(
                bitkubSymbol,
                split.quantity,
                split.price || split.estimatedPrice
              );
            }
          }

          if (orderResponse) {
            executions.push({
              exchange: split.exchange,
              quantity: split.quantity,
              price: parseFloat(orderResponse.price || '0'),
              orderId: orderResponse.orderId,
            });

            tradingLogger.liquidity('split_executed', {
              exchange: split.exchange,
              symbol: executionPlan.symbol,
              side: executionPlan.side,
              quantity: split.quantity,
              price: split.price || split.estimatedPrice,
              orderId: orderResponse.orderId,
            });
          } else {
            executions.push({
              exchange: split.exchange,
              quantity: split.quantity,
              price: split.price || split.estimatedPrice,
              error: 'No order response received',
            });
          }

          // Small delay between executions
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          executions.push({
            exchange: split.exchange,
            quantity: split.quantity,
            price: split.price || split.estimatedPrice,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          tradingLogger.liquidity('split_failed', {
            exchange: split.exchange,
            symbol: executionPlan.symbol,
            side: executionPlan.side,
            quantity: split.quantity,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Calculate execution results
      const successfulExecutions = executions.filter(e => !e.error);
      const success = successfulExecutions.length === executionPlan.splits.length;

      let averagePrice: number | undefined;
      let totalCost: number | undefined;

      if (successfulExecutions.length > 0) {
        const totalQuantity = successfulExecutions.reduce((sum, e) => sum + e.quantity, 0);
        const totalValue = successfulExecutions.reduce((sum, e) => sum + (e.quantity * e.price), 0);
        averagePrice = totalValue / totalQuantity;
        totalCost = totalValue;
      }

      return {
        success,
        executions,
        averagePrice,
        totalCost,
      };

    } catch (error) {
      logError(error instanceof Error ? error : new Error('Liquidity execution failed'), {
        action: 'executeOrder',
        executionPlan,
      });

      return {
        success: false,
        executions: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get liquidity statistics
   */
  getStatistics(): {
    activeSymbols: number;
    totalLiquidity: number;
    averageSpread: number;
    qualityScore: number;
    lastUpdateTime: Date;
  } {
    const orderBooks = Array.from(this.orderBooks.values());

    if (orderBooks.length === 0) {
      return {
        activeSymbols: 0,
        totalLiquidity: 0,
        averageSpread: 0,
        qualityScore: 0,
        lastUpdateTime: new Date(),
      };
    }

    const totalLiquidity = orderBooks.reduce((sum, ob) =>
      sum + ob.aggregated.totalBidVolume + ob.aggregated.totalAskVolume, 0
    );

    const averageSpread = orderBooks.reduce((sum, ob) => sum + ob.aggregated.spread, 0) / orderBooks.length;
    const qualityScore = orderBooks.reduce((sum, ob) => sum + ob.quality.overallScore, 0) / orderBooks.length;
    const lastUpdateTime = new Date(Math.max(...orderBooks.map(ob => ob.timestamp.getTime())));

    return {
      activeSymbols: orderBooks.length,
      totalLiquidity,
      averageSpread,
      qualityScore,
      lastUpdateTime,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<LiquidityAggregationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Liquidity aggregation configuration updated', { config: this.config });
  }

  // Private helper methods

  /**
   * Update order book for a symbol
   */
  private async updateOrderBook(symbol: string): Promise<void> {
    try {
      // Get order books from both exchanges
      const [binanceOrderBook, bitkubOrderBook] = await Promise.all([
        this.binanceService.getOrderBook(symbol, this.config.maxOrderBookDepth),
        this.bitkubService.getOrderBook(this.convertToBitkubSymbol(symbol), this.config.maxOrderBookDepth),
      ]);

      const now = new Date();

      // Create aggregated order book
      const aggregatedOrderBook: AggregatedOrderBook = {
        symbol,
        timestamp: now,
        exchanges: {
          binance: {
            bids: binanceOrderBook.bids,
            asks: binanceOrderBook.asks,
            lastUpdate: now,
          },
          bitkub: {
            bids: bitkubOrderBook.bids,
            asks: bitkubOrderBook.asks,
            lastUpdate: now,
          },
        },
        aggregated: this.aggregateOrderBooks(binanceOrderBook, bitkubOrderBook),
        quality: this.calculateQualityScore(binanceOrderBook, bitkubOrderBook),
      };

      this.orderBooks.set(symbol, aggregatedOrderBook);

    } catch (error) {
      logError(error instanceof Error ? error : new Error('Failed to update order book'), {
        action: 'updateOrderBook',
        symbol,
      });
    }
  }

  /**
   * Aggregate order books from multiple exchanges
   */
  private aggregateOrderBooks(
    binanceBook: { bids: Array<[number, number]>; asks: Array<[number, number]> },
    bitkubBook: { bids: Array<[number, number]>; asks: Array<[number, number]> }
  ): {
    bids: Array<[number, number]>;
    asks: Array<[number, number]>;
    totalBidVolume: number;
    totalAskVolume: number;
    spread: number;
    weightedMidPrice: number;
  } {
    // Combine bids (sorted by price descending)
    const allBids = [...binanceBook.bids, ...bitkubBook.bids]
      .sort((a, b) => b[0] - a[0])
      .slice(0, this.config.maxOrderBookDepth);

    // Combine asks (sorted by price ascending)
    const allAsks = [...binanceBook.asks, ...bitkubBook.asks]
      .sort((a, b) => a[0] - b[0])
      .slice(0, this.config.maxOrderBookDepth);

    // Calculate totals
    const totalBidVolume = allBids.reduce((sum, bid) => sum + bid[1], 0);
    const totalAskVolume = allAsks.reduce((sum, ask) => sum + ask[1], 0);

    // Calculate spread and weighted mid price
    const bestBid = allBids.length > 0 ? allBids[0][0] : 0;
    const bestAsk = allAsks.length > 0 ? allAsks[0][0] : 0;
    const spread = bestAsk - bestBid;
    const weightedMidPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;

    return {
      bids: allBids,
      asks: allAsks,
      totalBidVolume,
      totalAskVolume,
      spread,
      weightedMidPrice,
    };
  }

  /**
   * Calculate quality score for order book
   */
  private calculateQualityScore(
    binanceBook: { bids: Array<[number, number]>; asks: Array<[number, number]> },
    bitkubBook: { bids: Array<[number, number]>; asks: Array<[number, number]> }
  ): {
    depthScore: number;
    spreadScore: number;
    liquidityScore: number;
    overallScore: number;
  } {
    // Depth score (based on order book depth)
    const binanceDepth = binanceBook.bids.length + binanceBook.asks.length;
    const bitkubDepth = bitkubBook.bids.length + bitkubBook.asks.length;
    const totalDepth = binanceDepth + bitkubDepth;
    const depthScore = Math.min(1, totalDepth / 100); // Normalize to 0-1

    // Spread score (lower spread is better)
    const binanceSpread = binanceBook.asks.length > 0 && binanceBook.bids.length > 0
      ? binanceBook.asks[0][0] - binanceBook.bids[0][0]
      : 0;
    const bitkubSpread = bitkubBook.asks.length > 0 && bitkubBook.bids.length > 0
      ? bitkubBook.asks[0][0] - bitkubBook.bids[0][0]
      : 0;
    const avgSpread = (binanceSpread + bitkubSpread) / 2;
    const spreadScore = Math.max(0, 1 - avgSpread / 0.01); // Assume 1% is worst spread

    // Liquidity score (based on total volume)
    const binanceVolume = binanceBook.bids.reduce((sum, bid) => sum + bid[1], 0) +
                        binanceBook.asks.reduce((sum, ask) => sum + ask[1], 0);
    const bitkubVolume = bitkubBook.bids.reduce((sum, bid) => sum + bid[1], 0) +
                        bitkubBook.asks.reduce((sum, ask) => sum + ask[1], 0);
    const totalVolume = binanceVolume + bitkubVolume;
    const liquidityScore = Math.min(1, totalVolume / 1000000); // Normalize to 0-1 (1M volume = 1.0)

    // Overall score (weighted average)
    const overallScore = (depthScore * 0.3 + spreadScore * 0.3 + liquidityScore * 0.4);

    return {
      depthScore,
      spreadScore,
      liquidityScore,
      overallScore,
    };
  }

  /**
   * Calculate exchange metrics
   */
  private calculateExchangeMetrics(
    bids: Array<[number, number]>,
    asks: Array<[number, number]>
  ): {
    volume: number;
    depth: number;
    spread: number;
    volatility: number;
    midPrice: number;
    totalVolume: number;
    bestBid: { price: number; volume: number };
    bestAsk: { price: number; volume: number };
  } {
    const volume = bids.reduce((sum, bid) => sum + bid[1], 0) +
                   asks.reduce((sum, ask) => sum + ask[1], 0);
    const depth = bids.length + asks.length;
    const spread = bids.length > 0 && asks.length > 0 ? asks[0][0] - bids[0][0] : 0;
    const midPrice = bids.length > 0 && asks.length > 0 ? (bids[0][0] + asks[0][0]) / 2 : 0;
    const volatility = 0; // Would calculate from historical data

    return {
      volume,
      depth,
      spread,
      volatility,
      midPrice,
      totalVolume: volume,
      bestBid: bids.length > 0 ? { price: bids[0][0], volume: bids[0][1] } : { price: 0, volume: 0 },
      bestAsk: asks.length > 0 ? { price: asks[0][0], volume: asks[0][1] } : { price: 0, volume: 0 },
    };
  }

  /**
   * Generate liquidity recommendations
   */
  private generateLiquidityRecommendations(
    binanceMetrics: any,
    bitkubMetrics: any,
    bestBid: any,
    bestAsk: any
  ): Array<{
    type: 'BUY' | 'SELL' | 'SPLIT';
    exchange: 'binance' | 'bitkub' | 'both';
    percentage: number;
    reasoning: string;
  }> {
    const recommendations = [];

    // Buy recommendations
    if (bestBid.exchange === 'binance' && binanceMetrics.volume > bitkubMetrics.volume * 1.5) {
      recommendations.push({
        type: 'BUY' as const,
        exchange: 'binance' as const,
        percentage: 80,
        reasoning: 'Binance has better bid price and significantly higher volume',
      });
    } else if (bestBid.exchange === 'bitkub') {
      recommendations.push({
        type: 'BUY' as const,
        exchange: 'bitkub' as const,
        percentage: 70,
        reasoning: 'Bitkub has better bid price',
      });
    }

    // Sell recommendations
    if (bestAsk.exchange === 'binance' && binanceMetrics.volume > bitkubMetrics.volume * 1.5) {
      recommendations.push({
        type: 'SELL' as const,
        exchange: 'binance' as const,
        percentage: 80,
        reasoning: 'Binance has better ask price and significantly higher volume',
      });
    } else if (bestAsk.exchange === 'bitkub') {
      recommendations.push({
        type: 'SELL' as const,
        exchange: 'bitkub' as const,
        percentage: 70,
        reasoning: 'Bitkub has better ask price',
      });
    }

    // Split recommendations if prices are close
    const priceDiff = Math.abs(binanceMetrics.midPrice - bitkubMetrics.midPrice);
    if (priceDiff < binanceMetrics.spread * 0.5) {
      recommendations.push({
        type: 'SPLIT' as const,
        exchange: 'both' as const,
        percentage: 50,
        reasoning: 'Prices are similar across exchanges, consider splitting for better execution',
      });
    }

    return recommendations;
  }

  /**
   * Calculate available liquidity
   */
  private calculateAvailableLiquidity(
    orderBook: AggregatedOrderBook,
    side: 'BUY' | 'SELL',
    requiredQuantity: number
  ): {
    totalAvailable: number;
    byExchange: {
      binance: number;
      bitkub: number;
    };
    averagePrice: number;
  } {
    const orderSide = side === 'BUY' ? 'asks' : 'bids';
    const aggregatedOrders = orderBook.aggregated[orderSide];

    let availableQuantity = 0;
    let totalValue = 0;

    for (const [price, quantity] of aggregatedOrders) {
      if (availableQuantity >= requiredQuantity) break;

      const neededQuantity = Math.min(quantity, requiredQuantity - availableQuantity);
      availableQuantity += neededQuantity;
      totalValue += neededQuantity * price;
    }

    const averagePrice = availableQuantity > 0 ? totalValue / availableQuantity : 0;

    // Calculate by exchange (simplified)
    const binanceOrders = orderBook.exchanges.binance[orderSide];
    const bitkubOrders = orderBook.exchanges.bitkub[orderSide];

    const binanceAvailable = Math.min(
      requiredQuantity * 0.6, // Assume 60% can be filled on Binance
      binanceOrders.reduce((sum, [_, qty]) => sum + qty, 0)
    );

    const bitkubAvailable = Math.min(
      requiredQuantity * 0.4, // Assume 40% can be filled on Bitkub
      bitkubOrders.reduce((sum, [_, qty]) => sum + qty, 0)
    );

    return {
      totalAvailable: availableQuantity,
      byExchange: {
        binance: binanceAvailable,
        bitkub: bitkubAvailable,
      },
      averagePrice,
    };
  }

  /**
   * Calculate optimal execution splits
   */
  private calculateOptimalSplits(
    orderBook: AggregatedOrderBook,
    side: 'BUY' | 'SELL',
    totalQuantity: number,
    orderType: 'MARKET' | 'LIMIT'
  ): Array<{
    exchange: 'binance' | 'bitkub';
    quantity: number;
    price?: number;
    estimatedPrice: number;
    estimatedFillTime: number;
    confidence: number;
    reasoning: string;
  }> {
    const splits = [];
    const orderSide = side === 'BUY' ? 'asks' : 'bids';

    // Get best prices from each exchange
    const binanceBest = orderBook.exchanges.binance[orderSide][0];
    const bitkubBest = orderBook.exchanges.bitkub[orderSide][0];

    if (!binanceBest || !bitkubBest) {
      throw new Error('Insufficient order book data');
    }

    // Calculate optimal split based on price and liquidity
    const binancePrice = binanceBest[0];
    const bitkubPrice = bitkubBest[0];
    const priceDiff = Math.abs(binancePrice - bitkubPrice);

    // If prices are very similar, prioritize liquidity
    if (priceDiff < this.config.priceTolerance) {
      const binanceVolume = orderBook.exchanges.binance[orderSide].reduce((sum, [_, qty]) => sum + qty, 0);
      const bitkubVolume = orderBook.exchanges.bitkub[orderSide].reduce((sum, [_, qty]) => sum + qty, 0);
      const totalVolume = binanceVolume + bitkubVolume;

      const binancePercentage = binanceVolume / totalVolume;
      const bitkubPercentage = bitkubVolume / totalVolume;

      splits.push({
        exchange: 'binance',
        quantity: totalQuantity * binancePercentage,
        price: orderType === 'LIMIT' ? binancePrice : undefined,
        estimatedPrice: binancePrice,
        estimatedFillTime: 2000,
        confidence: 0.8,
        reasoning: `Split based on liquidity (${(binancePercentage * 100).toFixed(1)}% Binance)`,
      });

      splits.push({
        exchange: 'bitkub',
        quantity: totalQuantity * bitkubPercentage,
        price: orderType === 'LIMIT' ? bitkubPrice : undefined,
        estimatedPrice: bitkubPrice,
        estimatedFillTime: 3000,
        confidence: 0.7,
        reasoning: `Split based on liquidity (${(bitkubPercentage * 100).toFixed(1)}% Bitkub)`,
      });
    } else {
      // Prioritize better price
      const betterExchange = (side === 'BUY' && binancePrice < bitkubPrice) ||
                           (side === 'SELL' && binancePrice > bitkubPrice)
                           ? 'binance' : 'bitkub';

      const betterPrice = betterExchange === 'binance' ? binancePrice : bitkubPrice;
      const worsePrice = betterExchange === 'binance' ? bitkubPrice : binancePrice;

      // Execute 80% on better exchange, 20% on worse exchange
      splits.push({
        exchange: betterExchange,
        quantity: totalQuantity * 0.8,
        price: orderType === 'LIMIT' ? betterPrice : undefined,
        estimatedPrice: betterPrice,
        estimatedFillTime: 2000,
        confidence: 0.9,
        reasoning: `Better price (${(side === 'BUY' ? 'Lower' : 'Higher')} ask/bid)`,
      });

      splits.push({
        exchange: betterExchange === 'binance' ? 'bitkub' : 'binance',
        quantity: totalQuantity * 0.2,
        price: orderType === 'LIMIT' ? worsePrice : undefined,
        estimatedPrice: worsePrice,
        estimatedFillTime: 3000,
        confidence: 0.6,
        reasoning: 'Price diversification and additional liquidity',
      });
    }

    return splits;
  }

  /**
   * Calculate execution summary
   */
  private calculateExecutionSummary(
    splits: Array<any>,
    orderType: 'MARKET' | 'LIMIT'
  ): {
    averagePrice: number;
    totalCost: number;
    estimatedFees: number;
    slippageEstimate: number;
    executionTime: number;
    liquidityUtilization: number;
  } {
    const totalQuantity = splits.reduce((sum, split) => sum + split.quantity, 0);
    const totalValue = splits.reduce((sum, split) => sum + (split.quantity * split.estimatedPrice), 0);
    const averagePrice = totalValue / totalQuantity;

    // Calculate estimated fees
    const estimatedFees = splits.reduce((sum, split) => {
      const fee = split.exchange === 'binance'
        ? this.config.fees.binance.taker
        : this.config.fees.bitkub.taker;
      return sum + (split.quantity * split.estimatedPrice * fee);
    }, 0);

    // Estimate slippage (higher for market orders)
    const slippageEstimate = orderType === 'MARKET' ? 0.001 : 0.0005; // 0.1% for market, 0.05% for limit

    const executionTime = splits.reduce((sum, split) => sum + split.estimatedFillTime, 0);
    const liquidityUtilization = Math.min(1, totalQuantity / 10000); // Normalize to 10,000 units

    return {
      averagePrice,
      totalCost: totalValue,
      estimatedFees,
      slippageEstimate,
      executionTime,
      liquidityUtilization,
    };
  }

  /**
   * Assess execution risks
   */
  private assessExecutionRisks(
    splits: Array<any>,
    orderBook: AggregatedOrderBook
  ): Array<{
    type: 'LIQUIDITY' | 'TIMING' | 'PRICE_MOVEMENT' | 'EXCHANGE_FAILURE';
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
    mitigation: string;
  }> {
    const risks = [];

    // Liquidity risk
    if (orderBook.quality.liquidityScore < 0.3) {
      risks.push({
        type: 'LIQUIDITY' as const,
        level: 'HIGH' as const,
        description: 'Low liquidity in order book',
        mitigation: 'Consider smaller order size or wait for better liquidity',
      });
    }

    // Timing risk
    const totalExecutionTime = splits.reduce((sum, split) => sum + split.estimatedFillTime, 0);
    if (totalExecutionTime > 10000) { // > 10 seconds
      risks.push({
        type: 'TIMING' as const,
        level: 'MEDIUM' as const,
        description: 'Long execution time may lead to price slippage',
        mitigation: 'Monitor execution closely and be prepared to adjust',
      });
    }

    // Price movement risk
    if (orderBook.quality.spreadScore < 0.5) {
      risks.push({
        type: 'PRICE_MOVEMENT' as const,
        level: 'MEDIUM' as const,
        description: 'Wide spread indicates price volatility',
        mitigation: 'Use limit orders and monitor market conditions',
      });
    }

    // Exchange failure risk
    if (splits.some(split => split.confidence < 0.7)) {
      risks.push({
        type: 'EXCHANGE_FAILURE' as const,
        level: 'LOW' as const,
        description: 'Some execution splits have low confidence',
        mitigation: 'Monitor exchange status and have backup plans',
      });
    }

    return risks;
  }

  /**
   * Convert symbol to Bitkub format
   */
  private convertToBitkubSymbol(symbol: string): string {
    if (symbol.endsWith('USDT')) {
      const base = symbol.replace('USDT', '');
      return `THB_${base}`;
    }
    return symbol;
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): LiquidityAggregationConfig {
    return {
      updateInterval: 2000, // 2 seconds
      maxOrderBookDepth: 50,
      minLiquidityThreshold: 1000, // 1,000 USD
      priceTolerance: 0.001, // 0.1%
      volumeWeighting: 0.7,
      exchangePriorities: {
        binance: 0.6,
        bitkub: 0.4,
      },
      fees: {
        binance: { maker: 0.001, taker: 0.001 },
        bitkub: { maker: 0.0025, taker: 0.0025 },
      },
    };
  }
}

export default LiquidityAggregationService;