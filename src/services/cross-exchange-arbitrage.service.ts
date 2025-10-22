/**
 * Cross-Exchange Arbitrage Service
 *
 * Detects and analyzes arbitrage opportunities between Binance and Bitkub exchanges.
 * Includes real-time monitoring, profitability calculations, and execution planning.
 */

import { logger, tradingLogger } from '@/utils/logger';
import { OrderRequest, OrderResponse, MarketData } from '@/types';
import BinanceService from './binance.service';
import BitkubService from './bitkub.service';

export interface ArbitrageOpportunity {
  id: string;
  symbol: string;
  type: 'SIMPLE' | 'TRIANGULAR' | 'STATISTICAL';
  exchanges: {
    buy: 'binance' | 'bitkub';
    sell: 'binance' | 'bitkub';
  };
  prices: {
    buyExchange: number;
    sellExchange: number;
    spread: number;
    spreadPercent: number;
  };
  profitability: {
    grossProfit: number;
    estimatedFees: number;
    netProfit: number;
    profitPercent: number;
    annualizedReturn: number;
  };
  execution: {
    estimatedTime: number;
    confidence: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendedSize: number;
    maxSize: number;
  };
  liquidity: {
    buyLiquidity: number;
    sellLiquidity: number;
    totalLiquidity: number;
    depthScore: number;
  };
  timing: {
    detected: Date;
    expires: Date;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  };
  metadata: {
    marketConditions: string;
    volatility: number;
    volume24h: number;
    correlation: number;
  };
}

export interface CrossExchangeMarketData {
  symbol: string;
  binance: {
    price: number;
    bid: number;
    ask: number;
    volume: number;
    spread: number;
    timestamp: Date;
  };
  bitkub: {
    price: number;
    bid: number;
    ask: number;
    volume: number;
    spread: number;
    timestamp: Date;
  };
  arbitrage: {
    priceDifference: number;
    priceDifferencePercent: number;
    direction: 'BINANCE_HIGHER' | 'BITKUB_HIGHER';
    opportunity: boolean;
  };
}

export interface ArbitrageExecutionPlan {
  opportunityId: string;
  steps: Array<{
    exchange: 'binance' | 'bitkub';
    action: 'BUY' | 'SELL';
    symbol: string;
    amount: number;
    price: number;
    estimatedCost: number;
    estimatedFee: number;
    executionTime: number;
  }>;
  summary: {
    totalInvestment: number;
    totalFees: number;
    expectedProfit: number;
    profitPercent: number;
    executionTime: number;
    riskAssessment: {
      executionRisk: number;
      marketRisk: number;
      counterpartyRisk: number;
      totalRisk: number;
    };
  };
  requirements: {
    minimumCapital: number;
    availableCapital: number;
    exchangeBalances: {
      binance: { [currency: string]: number };
      bitkub: { [currency: string]: number };
    };
  };
}

export interface ArbitrageConfig {
  minimumProfitPercent: number;
  minimumProfitAmount: number;
  maximumRiskPercent: number;
  executionTimeout: number;
  monitoringInterval: number;
  supportedSymbols: string[];
  fees: {
    binance: { maker: number; taker: number };
    bitkub: { maker: number; taker: number };
  };
  limits: {
    maximumTradeSize: number;
    maximumDailyTrades: number;
    minimumLiquidity: number;
  };
}

export class CrossExchangeArbitrageService {
  private opportunities: Map<string, ArbitrageOpportunity> = new Map();
  private monitoringActive = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private config: ArbitrageConfig;

  constructor(
    private binanceService: BinanceService,
    private bitkubService: BitkubService
  ) {
    this.config = this.getDefaultConfig();
  }

  /**
   * Start arbitrage monitoring
   */
  async startMonitoring(): Promise<void> {
    if (this.monitoringActive) {
      logger.warn('Arbitrage monitoring already active');
      return;
    }

    this.monitoringActive = true;
    logger.info('Starting cross-exchange arbitrage monitoring');

    // Initial scan
    await this.scanForOpportunities();

    // Set up continuous monitoring
    this.monitoringInterval = setInterval(
      () => this.scanForOpportunities(),
      this.config.monitoringInterval
    );

    logger.info('Arbitrage monitoring started', {
      interval: this.config.monitoringInterval,
      symbols: this.config.supportedSymbols.length,
    });
  }

  /**
   * Stop arbitrage monitoring
   */
  stopMonitoring(): void {
    if (!this.monitoringActive) {
      logger.warn('Arbitrage monitoring not active');
      return;
    }

    this.monitoringActive = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('Arbitrage monitoring stopped');
  }

  /**
   * Scan for arbitrage opportunities
   */
  async scanForOpportunities(): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const startTime = Date.now();

    try {
      logger.debug('Scanning for arbitrage opportunities...');

      // Get market data from both exchanges
      const marketData = await this.getCrossExchangeMarketData();

      // Analyze each symbol for arbitrage opportunities
      for (const symbol of this.config.supportedSymbols) {
        const data = marketData.find(d => d.symbol === symbol);
        if (!data) continue;

        const opportunity = this.analyzeArbitrageOpportunity(data);
        if (opportunity) {
          opportunities.push(opportunity);
          this.opportunities.set(opportunity.id, opportunity);

          // Log significant opportunities
          if (opportunity.profitability.profitPercent > this.config.minimumProfitPercent) {
            tradingLogger.arbitrage('opportunity_detected', {
              symbol: opportunity.symbol,
              profitPercent: opportunity.profitability.profitPercent,
              netProfit: opportunity.profitability.netProfit,
              direction: opportunity.exchanges.buy === 'binance' ? 'BUY_BINANCE_SELL_BITKUB' : 'BUY_BITKUB_SELL_BINANCE',
            });
          }
        }
      }

      // Clean up expired opportunities
      this.cleanupExpiredOpportunities();

      const scanTime = Date.now() - startTime;
      logger.debug('Arbitrage scan completed', {
        opportunitiesFound: opportunities.length,
        scanTime,
        activeOpportunities: this.opportunities.size,
      });

      return opportunities;
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Arbitrage scan failed'), {
        action: 'scanForOpportunities',
      });
      return [];
    }
  }

  /**
   * Get current arbitrage opportunities
   */
  getActiveOpportunities(minProfitPercent?: number): ArbitrageOpportunity[] {
    const opportunities = Array.from(this.opportunities.values());

    // Filter by minimum profit if specified
    if (minProfitPercent !== undefined) {
      return opportunities.filter(op => op.profitability.profitPercent >= minProfitPercent);
    }

    return opportunities.sort((a, b) => b.profitability.profitPercent - a.profitability.profitPercent);
  }

  /**
   * Create execution plan for an arbitrage opportunity
   */
  async createExecutionPlan(
    opportunityId: string,
    tradeSize: number,
    availableCapital: number
  ): Promise<ArbitrageExecutionPlan | null> {
    const opportunity = this.opportunities.get(opportunityId);
    if (!opportunity) {
      logger.warn(`Arbitrage opportunity not found: ${opportunityId}`);
      return null;
    }

    try {
      // Validate trade size against opportunity limits
      if (tradeSize > opportunity.execution.maxSize) {
        throw new Error(`Trade size ${tradeSize} exceeds maximum ${opportunity.execution.maxSize}`);
      }

      if (tradeSize < this.config.limits.minimumLiquidity) {
        throw new Error(`Trade size ${tradeSize} below minimum liquidity ${this.config.limits.minimumLiquidity}`);
      }

      // Get current exchange balances
      const exchangeBalances = await this.getExchangeBalances();

      // Calculate optimal execution steps
      const steps = this.calculateExecutionSteps(opportunity, tradeSize);

      // Calculate costs and profits
      const summary = this.calculateExecutionSummary(steps, opportunity);

      // Validate capital requirements
      if (summary.totalInvestment > availableCapital) {
        throw new Error(`Insufficient capital: required ${summary.totalInvestment}, available ${availableCapital}`);
      }

      // Assess execution risks
      const riskAssessment = this.assessExecutionRisks(opportunity, steps, exchangeBalances);

      return {
        opportunityId,
        steps,
        summary: {
          ...summary,
          riskAssessment,
        },
        requirements: {
          minimumCapital: summary.totalInvestment,
          availableCapital,
          exchangeBalances,
        },
      };
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Failed to create execution plan'), {
        action: 'createExecutionPlan',
        opportunityId,
        tradeSize,
      });
      return null;
    }
  }

  /**
   * Execute arbitrage opportunity
   */
  async executeArbitrage(
    executionPlan: ArbitrageExecutionPlan,
    confirmationCallback?: (plan: ArbitrageExecutionPlan) => Promise<boolean>
  ): Promise<{
    success: boolean;
    executedSteps: Array<{
      step: number;
      exchange: string;
      action: string;
      orderResponse: OrderResponse | null;
      error?: string;
    }>;
    totalProfit?: number;
    error?: string;
  }> {
    try {
      // Confirmation callback if provided
      if (confirmationCallback) {
        const confirmed = await confirmationCallback(executionPlan);
        if (!confirmed) {
          return { success: false, executedSteps: [], error: 'Execution not confirmed' };
        }
      }

      const executedSteps: Array<{
        step: number;
        exchange: string;
        action: string;
        orderResponse: OrderResponse | null;
        error?: string;
      }> = [];

      // Execute steps in order
      for (let i = 0; i < executionPlan.steps.length; i++) {
        const step = executionPlan.steps[i];
        const startTime = Date.now();

        try {
          let orderResponse: OrderResponse | null = null;

          if (step.exchange === 'binance') {
            // Execute on Binance
            if (step.action === 'BUY') {
              orderResponse = await this.binanceService.placeOrder({
                symbol: step.symbol,
                side: 'BUY',
                type: 'LIMIT',
                quantity: step.amount,
                price: step.price,
              });
            } else {
              orderResponse = await this.binanceService.placeOrder({
                symbol: step.symbol,
                side: 'SELL',
                type: 'LIMIT',
                quantity: step.amount,
                price: step.price,
              });
            }
          } else if (step.exchange === 'bitkub') {
            // Execute on Bitkub
            const bitkubSymbol = this.convertToBitkubSymbol(step.symbol);
            if (step.action === 'BUY') {
              orderResponse = await this.bitkubService.placeBuyOrder(
                bitkubSymbol,
                step.amount,
                step.price
              );
            } else {
              orderResponse = await this.bitkubService.placeSellOrder(
                bitkubSymbol,
                step.amount,
                step.price
              );
            }
          }

          const executionTime = Date.now() - startTime;

          executedSteps.push({
            step: i + 1,
            exchange: step.exchange,
            action: step.action,
            orderResponse,
          });

          tradingLogger.arbitrage('step_executed', {
            step: i + 1,
            exchange: step.exchange,
            action: step.action,
            symbol: step.symbol,
            amount: step.amount,
            price: step.price,
            executionTime,
            orderId: orderResponse?.orderId,
          });

          // Small delay between steps to allow for processing
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          executedSteps.push({
            step: i + 1,
            exchange: step.exchange,
            action: step.action,
            orderResponse: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          tradingLogger.arbitrage('step_failed', {
            step: i + 1,
            exchange: step.exchange,
            action: step.action,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          // Stop execution on step failure
          break;
        }
      }

      const success = executedSteps.every(step => step.orderResponse !== null && !step.error);

      if (success) {
        tradingLogger.arbitrage('execution_success', {
          opportunityId: executionPlan.opportunityId,
          totalSteps: executedSteps.length,
          expectedProfit: executionPlan.summary.expectedProfit,
          actualProfit: executionPlan.summary.expectedProfit, // Would calculate actual profit
        });
      } else {
        tradingLogger.arbitrage('execution_failed', {
          opportunityId: executionPlan.opportunityId,
          failedSteps: executedSteps.filter(s => s.error).length,
          totalSteps: executedSteps.length,
        });
      }

      return {
        success,
        executedSteps,
        totalProfit: success ? executionPlan.summary.expectedProfit : undefined,
      };

    } catch (error) {
      logError(error instanceof Error ? error : new Error('Arbitrage execution failed'), {
        action: 'executeArbitrage',
        opportunityId: executionPlan.opportunityId,
      });

      return {
        success: false,
        executedSteps: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get arbitrage statistics
   */
  getStatistics(): {
    activeOpportunities: number;
    totalOpportunities: number;
    averageProfitPercent: number;
    highestProfitPercent: number;
    monitoringActive: boolean;
    lastScanTime: Date;
    topOpportunities: ArbitrageOpportunity[];
  } {
    const opportunities = Array.from(this.opportunities.values());

    return {
      activeOpportunities: opportunities.length,
      totalOpportunities: opportunities.length,
      averageProfitPercent: opportunities.length > 0
        ? opportunities.reduce((sum, op) => sum + op.profitability.profitPercent, 0) / opportunities.length
        : 0,
      highestProfitPercent: opportunities.length > 0
        ? Math.max(...opportunities.map(op => op.profitability.profitPercent))
        : 0,
      monitoringActive: this.monitoringActive,
      lastScanTime: new Date(),
      topOpportunities: opportunities
        .sort((a, b) => b.profitability.profitPercent - a.profitability.profitPercent)
        .slice(0, 5),
    };
  }

  /**
   * Update arbitrage configuration
   */
  updateConfig(newConfig: Partial<ArbitrageConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Arbitrage configuration updated', { config: this.config });
  }

  // Private helper methods

  /**
   * Get cross-exchange market data
   */
  private async getCrossExchangeMarketData(): Promise<CrossExchangeMarketData[]> {
    const marketData: CrossExchangeMarketData[] = [];

    // Get market data from Binance
    const binanceTickers = await this.binanceService.getAllTickers();
    const bitkubTickers = await this.bitkubService.getAllTickers();

    for (const symbol of this.config.supportedSymbols) {
      const binanceTicker = binanceTickers.find(t => t.symbol === symbol);
      const bitkubTicker = bitkubTickers.find(t => t.id === symbol);

      if (binanceTicker && bitkubTicker) {
        const binanceData = {
          price: parseFloat(binanceTicker.lastPrice),
          bid: parseFloat(binanceTicker.bidPrice),
          ask: parseFloat(binanceTicker.askPrice),
          volume: parseFloat(binanceTicker.volume),
          spread: parseFloat(binanceTicker.askPrice) - parseFloat(binanceTicker.bidPrice),
          timestamp: new Date(binanceTicker.closeTime),
        };

        const bitkubData = {
          price: bitkubTicker.last,
          bid: bitkubTicker.highestBid,
          ask: bitkubTicker.lowestAsk,
          volume: bitkubTicker.baseVolume,
          spread: bitkubTicker.lowestAsk - bitkubTicker.highestBid,
          timestamp: new Date(),
        };

        const priceDifference = binanceData.price - bitkubData.price;
        const priceDifferencePercent = (priceDifference / Math.min(binanceData.price, bitkubData.price)) * 100;

        marketData.push({
          symbol,
          binance: binanceData,
          bitkub: bitkubData,
          arbitrage: {
            priceDifference,
            priceDifferencePercent,
            direction: priceDifference > 0 ? 'BINANCE_HIGHER' : 'BITKUB_HIGHER',
            opportunity: Math.abs(priceDifferencePercent) > this.config.minimumProfitPercent,
          },
        });
      }
    }

    return marketData;
  }

  /**
   * Analyze arbitrage opportunity
   */
  private analyzeArbitrageOpportunity(data: CrossExchangeMarketData): ArbitrageOpportunity | null {
    if (!data.arbitrage.opportunity) {
      return null;
    }

    const direction = data.arbitrage.direction;
    const buyExchange = direction === 'BINANCE_HIGHER' ? 'bitkub' : 'binance';
    const sellExchange = direction === 'BINANCE_HIGHER' ? 'binance' : 'bitkub';

    const buyPrice = buyExchange === 'binance' ? data.binance.ask : data.bitkub.ask;
    const sellPrice = sellExchange === 'binance' ? data.binance.bid : data.bitkub.bid;
    const spread = sellPrice - buyPrice;
    const spreadPercent = (spread / buyPrice) * 100;

    // Calculate fees
    const buyFees = buyExchange === 'binance'
      ? buyPrice * this.config.fees.binance.taker
      : buyPrice * this.config.fees.bitkub.taker;
    const sellFees = sellExchange === 'binance'
      ? sellPrice * this.config.fees.binance.taker
      : sellPrice * this.config.fees.bitkub.taker;
    const totalFees = buyFees + sellFees;

    // Calculate profitability
    const grossProfit = spread;
    const netProfit = grossProfit - totalFees;
    const profitPercent = (netProfit / buyPrice) * 100;

    // Skip if not profitable
    if (profitPercent <= this.config.minimumProfitPercent || netProfit <= this.config.minimumProfitAmount) {
      return null;
    }

    // Calculate liquidity
    const buyLiquidity = buyExchange === 'binance' ? data.binance.volume : data.bitkub.volume;
    const sellLiquidity = sellExchange === 'binance' ? data.binance.volume : data.bitkub.volume;
    const totalLiquidity = Math.min(buyLiquidity, sellLiquidity);
    const depthScore = totalLiquidity / Math.max(data.binance.volume, data.bitkub.volume);

    // Determine execution parameters
    const recommendedSize = Math.min(
      this.config.limits.maximumTradeSize,
      totalLiquidity * 0.1, // 10% of available liquidity
      10000 // Maximum 10,000 USD equivalent
    );

    const maxSize = Math.min(
      this.config.limits.maximumTradeSize,
      totalLiquidity * 0.2, // 20% of available liquidity
      50000 // Maximum 50,000 USD equivalent
    );

    // Calculate confidence and risk
    const confidence = Math.min(
      depthScore,
      Math.abs(spreadPercent) / 2, // Higher spread = higher confidence
      0.8 // Maximum 80% confidence
    );

    const riskLevel = confidence > 0.7 ? 'LOW' : confidence > 0.5 ? 'MEDIUM' : 'HIGH';

    return {
      id: `arb_${data.symbol}_${Date.now()}`,
      symbol: data.symbol,
      type: 'SIMPLE',
      exchanges: { buy: buyExchange, sell: sellExchange },
      prices: {
        buyExchange: buyPrice,
        sellExchange: sellPrice,
        spread,
        spreadPercent,
      },
      profitability: {
        grossProfit,
        estimatedFees: totalFees,
        netProfit,
        profitPercent,
        annualizedReturn: profitPercent * 365, // Simplified annualization
      },
      execution: {
        estimatedTime: 5000, // 5 seconds estimated execution time
        confidence,
        riskLevel,
        recommendedSize,
        maxSize,
      },
      liquidity: {
        buyLiquidity,
        sellLiquidity,
        totalLiquidity,
        depthScore,
      },
      timing: {
        detected: new Date(),
        expires: new Date(Date.now() + 30000), // 30 seconds expiration
        urgency: profitPercent > 1 ? 'HIGH' : profitPercent > 0.5 ? 'MEDIUM' : 'LOW',
      },
      metadata: {
        marketConditions: 'NORMAL',
        volatility: 0.2, // Would calculate from historical data
        volume24h: data.binance.volume + data.bitkub.volume,
        correlation: 0.95, // High correlation expected
      },
    };
  }

  /**
   * Clean up expired opportunities
   */
  private cleanupExpiredOpportunities(): void {
    const now = new Date();
    const expiredIds: string[] = [];

    for (const [id, opportunity] of this.opportunities.entries()) {
      if (opportunity.timing.expires < now) {
        expiredIds.push(id);
      }
    }

    expiredIds.forEach(id => {
      this.opportunities.delete(id);
    });

    if (expiredIds.length > 0) {
      logger.debug(`Cleaned up ${expiredIds.length} expired arbitrage opportunities`);
    }
  }

  /**
   * Get exchange balances
   */
  private async getExchangeBalances(): Promise<{
    binance: { [currency: string]: number };
    bitkub: { [currency: string]: number };
  }> {
    try {
      const [binanceBalance, bitkubBalance] = await Promise.all([
        this.binanceService.getAccountInfo(),
        this.bitkubService.getBalance(),
      ]);

      return {
        binance: binanceBalance.balances.reduce((acc, bal) => {
          acc[bal.asset] = parseFloat(bal.free);
          return acc;
        }, {} as { [currency: string]: number }),
        bitkub: Object.keys(bitkubBalance).reduce((acc, currency) => {
          acc[currency] = bitkubBalance[currency].available;
          return acc;
        }, {} as { [currency: string]: number }),
      };
    } catch (error) {
      logger.error('Failed to get exchange balances:', error);
      return {
        binance: {},
        bitkub: {},
      };
    }
  }

  /**
   * Calculate execution steps
   */
  private calculateExecutionSteps(
    opportunity: ArbitrageOpportunity,
    tradeSize: number
  ): Array<{
    exchange: 'binance' | 'bitkub';
    action: 'BUY' | 'SELL';
    symbol: string;
    amount: number;
    price: number;
    estimatedCost: number;
    estimatedFee: number;
    executionTime: number;
  }> {
    const steps = [];

    // Buy step
    steps.push({
      exchange: opportunity.exchanges.buy,
      action: 'BUY' as const,
      symbol: opportunity.symbol,
      amount: tradeSize / opportunity.prices.buyExchange,
      price: opportunity.prices.buyExchange,
      estimatedCost: tradeSize,
      estimatedFee: tradeSize * (opportunity.exchanges.buy === 'binance'
        ? this.config.fees.binance.taker
        : this.config.fees.bitkub.taker),
      executionTime: 2000, // 2 seconds estimated
    });

    // Sell step
    steps.push({
      exchange: opportunity.exchanges.sell,
      action: 'SELL' as const,
      symbol: opportunity.symbol,
      amount: tradeSize / opportunity.prices.sellExchange,
      price: opportunity.prices.sellExchange,
      estimatedCost: tradeSize,
      estimatedFee: tradeSize * (opportunity.exchanges.sell === 'binance'
        ? this.config.fees.binance.taker
        : this.config.fees.bitkub.taker),
      executionTime: 2000, // 2 seconds estimated
    });

    return steps;
  }

  /**
   * Calculate execution summary
   */
  private calculateExecutionSummary(
    steps: Array<any>,
    opportunity: ArbitrageOpportunity
  ): {
    totalInvestment: number;
    totalFees: number;
    expectedProfit: number;
    profitPercent: number;
    executionTime: number;
  } {
    const totalInvestment = steps.reduce((sum, step) => sum + step.estimatedCost, 0);
    const totalFees = steps.reduce((sum, step) => sum + step.estimatedFee, 0);
    const executionTime = steps.reduce((sum, step) => sum + step.executionTime, 0);

    // Calculate expected profit based on opportunity data
    const expectedProfit = opportunity.profitability.netProfit * (totalInvestment / opportunity.execution.recommendedSize);
    const profitPercent = (expectedProfit / totalInvestment) * 100;

    return {
      totalInvestment,
      totalFees,
      expectedProfit,
      profitPercent,
      executionTime,
    };
  }

  /**
   * Assess execution risks
   */
  private assessExecutionRisks(
    opportunity: ArbitrageOpportunity,
    steps: Array<any>,
    exchangeBalances: { binance: { [currency: string]: number }; bitkub: { [currency: string]: number } }
  ): {
    executionRisk: number;
    marketRisk: number;
    counterpartyRisk: number;
    totalRisk: number;
  } {
    let executionRisk = 0;
    let marketRisk = 0;
    let counterpartyRisk = 0;

    // Execution risk (liquidity, timing, technical issues)
    if (opportunity.execution.confidence < 0.5) {
      executionRisk += 0.3;
    }
    if (opportunity.liquidity.depthScore < 0.2) {
      executionRisk += 0.2;
    }
    if (opportunity.execution.estimatedTime > 10000) { // > 10 seconds
      executionRisk += 0.1;
    }

    // Market risk (price movement during execution)
    marketRisk = 0.1 + (1 - opportunity.execution.confidence) * 0.2;

    // Counterparty risk (exchange issues)
    counterpartyRisk = 0.05; // Base counterparty risk

    const totalRisk = Math.min(1, executionRisk + marketRisk + counterpartyRisk);

    return {
      executionRisk,
      marketRisk,
      counterpartyRisk,
      totalRisk,
    };
  }

  /**
   * Convert symbol to Bitkub format
   */
  private convertToBitkubSymbol(symbol: string): string {
    // Convert BTCUSDT to THB_BTC, etc.
    if (symbol.endsWith('USDT')) {
      const base = symbol.replace('USDT', '');
      return `THB_${base}`;
    }
    return symbol;
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): ArbitrageConfig {
    return {
      minimumProfitPercent: 0.5, // 0.5% minimum profit
      minimumProfitAmount: 10, // 10 USD minimum profit
      maximumRiskPercent: 5, // 5% maximum risk
      executionTimeout: 30000, // 30 seconds execution timeout
      monitoringInterval: 5000, // 5 seconds monitoring interval
      supportedSymbols: ['BTCUSDT', 'ETHUSDT'], // Start with major pairs
      fees: {
        binance: { maker: 0.001, taker: 0.001 },
        bitkub: { maker: 0.0025, taker: 0.0025 },
      },
      limits: {
        maximumTradeSize: 50000, // 50,000 USD maximum
        maximumDailyTrades: 100,
        minimumLiquidity: 1000, // 1,000 USD minimum liquidity
      },
    };
  }
}

export default CrossExchangeArbitrageService;