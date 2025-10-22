import { tradingConfig } from '@/config';
import { tradingLogger } from '@/utils/logger';
import { db } from '@/models/database';
import { ExchangeIntelligenceService } from './exchange-intelligence.service';
import { CrossExchangeArbitrageService, ArbitrageOpportunity } from './cross-exchange-arbitrage.service';
import { BinanceService } from './binance.service';
import { BitkubService } from './bitkub.service';

/**
 * Exchange Monitoring Dashboard Service
 * Provides comprehensive real-time monitoring and analytics for multi-exchange operations
 */

export interface ExchangeDashboardData {
  timestamp: number;
  exchanges: {
    binance: ExchangeStatus;
    bitkub: ExchangeStatus;
  };
  arbitrage: {
    opportunities: ArbitrageOpportunity[];
    statistics: ArbitrageStatistics;
  };
  market: {
    overview: MarketOverview;
    topMovers: TopMover[];
    volumeAnalysis: VolumeAnalysis;
  };
  performance: {
    latency: LatencyMetrics;
    uptime: UptimeMetrics;
    errors: ErrorMetrics;
  };
  alerts: DashboardAlert[];
}

export interface ExchangeStatus {
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  connectivity: {
    api: boolean;
    websocket: boolean;
    lastCheck: number;
    responseTime: number;
  };
  trading: {
    enabled: boolean;
    activeOrders: number;
    dailyVolume: number;
    dailyTrades: number;
  };
  balances: {
    totalValue: number;
    available: number;
    inOrders: number;
    currencies: Array<{ currency: string; balance: number; value: number }>;
  };
  markets: Array<{
    symbol: string;
    price: number;
    change24h: number;
    volume24h: number;
    spread: number;
    liquidity: number;
  }>;
  fees: {
    maker: number;
    taker: number;
    volume30d: number;
    tier: string;
  };
}

export interface MarketOverview {
  totalMarketCap: number;
  total24hVolume: number;
  marketCapChange24h: number;
  volumeChange24h: number;
  btcDominance: number;
  activeMarkets: number;
  topGainers: Array<{ symbol: string; change: number; volume: number }>;
  topLosers: Array<{ symbol: string; change: number; volume: number }>;
  volatility: {
    current: number;
    average: number;
    trend: 'RISING' | 'FALLING' | 'STABLE';
  };
}

export interface TopMover {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  change1h?: number;
  change7d?: number;
  marketCap?: number;
  exchanges: string[];
}

export interface VolumeAnalysis {
  totalVolume: number;
  exchangeBreakdown: Array<{
    exchange: string;
    volume: number;
    percentage: number;
  }>;
  symbolBreakdown: Array<{
    symbol: string;
    volume: number;
    percentage: number;
  }>;
  trends: {
    hourly: Array<{ time: string; volume: number }>;
    daily: Array<{ date: string; volume: number }>;
  };
}

export interface ArbitrageStatistics {
  totalOpportunities: number;
  activeOpportunities: number;
  executedToday: number;
  successRate: number;
  totalProfit: number;
  averageProfit: number;
  bestOpportunity: ArbitrageOpportunity | null;
  profitByExchange: Record<string, number>;
  profitBySymbol: Record<string, number>;
}

export interface LatencyMetrics {
  api: {
    binance: number;
    bitkub: number;
    average: number;
  };
  websocket: {
    binance: number;
    bitkub: number;
    average: number;
  };
  execution: {
    buyOrder: number;
    sellOrder: number;
    total: number;
  };
}

export interface UptimeMetrics {
  overall: number;
  binance: number;
  bitkub: number;
  lastDowntime: number;
  totalDowntime: number;
}

export interface ErrorMetrics {
  total: number;
  rate: number;
  byType: Record<string, number>;
  byExchange: Record<string, number>;
  recent: Array<{
    timestamp: number;
    type: string;
    exchange: string;
    message: string;
  }>;
}

export interface DashboardAlert {
  id: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  category: 'CONNECTIVITY' | 'ARBITRAGE' | 'PERFORMANCE' | 'RISK' | 'SYSTEM';
  title: string;
  message: string;
  timestamp: number;
  exchange?: string;
  symbol?: string;
  acknowledged: boolean;
  metadata: Record<string, any>;
}

export interface DashboardConfig {
  refreshInterval: number;
  alertThresholds: {
    latency: number;
    errorRate: number;
    profitThreshold: number;
    volumeThreshold: number;
  };
  enabledFeatures: {
    realTimeUpdates: boolean;
    arbitrageAlerts: boolean;
    performanceMonitoring: boolean;
    balanceTracking: boolean;
  };
  display: {
    maxMarkets: number;
    maxAlerts: number;
    chartPeriods: string[];
    defaultPeriod: string;
  };
}

export class ExchangeMonitoringDashboardService {
  private exchangeIntelligence: ExchangeIntelligenceService;
  private arbitrageService: CrossExchangeArbitrageService;
  private binanceService: BinanceService;
  private bitkubService: BitkubService;

  private alerts: Map<string, DashboardAlert> = new Map();
  private config: DashboardConfig;
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private subscribers: Array<(data: ExchangeDashboardData) => void> = [];

  // Performance tracking
  private latencyHistory: Array<{ timestamp: number; binance: number; bitkub: number }> = [];
  private uptimeHistory: Array<{ timestamp: number; binance: boolean; bitkub: boolean }> = [];
  private errorHistory: Array<{ timestamp: number; exchange: string; error: string }> = [];

  constructor() {
    this.exchangeIntelligence = new ExchangeIntelligenceService();
    this.arbitrageService = new CrossExchangeArbitrageService(
      new BinanceService(),
      new BitkubService()
    );
    this.binanceService = new BinanceService();
    this.bitkubService = new BitkubService();
    this.config = this.getDefaultConfig();
  }

  /**
   * Start the monitoring dashboard
   */
  async startMonitoring(): Promise<void> {
    try {
      if (this.isMonitoring) {
        tradingLogger.warn('Dashboard monitoring already active');
        return;
      }

      this.isMonitoring = true;
      tradingLogger.info('Starting exchange monitoring dashboard');

      // Initialize monitoring
      await this.initializeMonitoring();

      // Start continuous updates
      this.monitoringInterval = setInterval(
        () => this.updateDashboard(),
        this.config.refreshInterval
      );

      // Start arbitrage monitoring
      await this.arbitrageService.startMonitoring();

      tradingLogger.info('Exchange monitoring dashboard started', {
        refreshInterval: this.config.refreshInterval,
        features: this.config.enabledFeatures
      });

    } catch (error) {
      tradingLogger.error('Failed to start dashboard monitoring', { error });
      this.isMonitoring = false;
      throw error;
    }
  }

  /**
   * Stop the monitoring dashboard
   */
  async stopMonitoring(): Promise<void> {
    try {
      this.isMonitoring = false;

      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      await this.arbitrageService.stopMonitoring();

      tradingLogger.info('Exchange monitoring dashboard stopped');

    } catch (error) {
      tradingLogger.error('Failed to stop dashboard monitoring', { error });
      throw error;
    }
  }

  /**
   * Get current dashboard data
   */
  async getDashboardData(): Promise<ExchangeDashboardData> {
    const timestamp = Date.now();

    try {
      // Get exchange statuses
      const [binanceStatus, bitkubStatus] = await Promise.all([
        this.getExchangeStatus('binance'),
        this.getExchangeStatus('bitkub')
      ]);

      // Get arbitrage data
      const arbitrageOpportunities = this.arbitrageService.getActiveOpportunities();
      const arbitrageStatistics = this.calculateArbitrageStatistics(arbitrageOpportunities);

      // Get market overview
      const marketOverview = await this.getMarketOverview();
      const topMovers = await this.getTopMovers();
      const volumeAnalysis = await this.getVolumeAnalysis();

      // Get performance metrics
      const latency = this.calculateLatencyMetrics();
      const uptime = this.calculateUptimeMetrics();
      const errors = this.calculateErrorMetrics();

      return {
        timestamp,
        exchanges: {
          binance: binanceStatus,
          bitkub: bitkubStatus
        },
        arbitrage: {
          opportunities: arbitrageOpportunities,
          statistics: arbitrageStatistics
        },
        market: {
          overview: marketOverview,
          topMovers,
          volumeAnalysis
        },
        performance: {
          latency,
          uptime,
          errors
        },
        alerts: this.getActiveAlerts()
      };

    } catch (error) {
      tradingLogger.error('Failed to get dashboard data', { error });
      throw error;
    }
  }

  /**
   * Subscribe to dashboard updates
   */
  subscribe(callback: (data: ExchangeDashboardData) => void): () => void {
    this.subscribers.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  /**
   * Update dashboard configuration
   */
  updateConfig(newConfig: Partial<DashboardConfig>): void {
    this.config = { ...this.config, ...newConfig };
    tradingLogger.info('Dashboard configuration updated', { config: this.config });

    // Restart monitoring with new config if active
    if (this.isMonitoring) {
      this.stopMonitoring().then(() => this.startMonitoring());
    }
  }

  /**
   * Add manual alert
   */
  addAlert(alert: Omit<DashboardAlert, 'id' | 'timestamp'>): void {
    const fullAlert: DashboardAlert = {
      ...alert,
      id: this.generateAlertId(),
      timestamp: Date.now()
    };

    this.alerts.set(fullAlert.id, fullAlert);
    tradingLogger.info('Alert added', {
      id: fullAlert.id,
      type: fullAlert.type,
      category: fullAlert.category,
      title: fullAlert.title
    });

    // Check for immediate notification
    this.checkAlertThresholds(fullAlert);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      tradingLogger.info('Alert acknowledged', { alertId });
    }
  }

  /**
   * Clear old alerts
   */
  clearOldAlerts(maxAge: number = 24 * 60 * 60 * 1000): void { // 24 hours default
    const cutoff = Date.now() - maxAge;
    const alertsToRemove: string[] = [];

    for (const [id, alert] of this.alerts) {
      if (alert.timestamp < cutoff) {
        alertsToRemove.push(id);
      }
    }

    alertsToRemove.forEach(id => this.alerts.delete(id));

    if (alertsToRemove.length > 0) {
      tradingLogger.info(`Cleared ${alertsToRemove.length} old alerts`);
    }
  }

  // Private methods

  private async initializeMonitoring(): Promise<void> {
    // Initialize performance tracking
    this.latencyHistory = [];
    this.uptimeHistory = [];
    this.errorHistory = [];

    // Clear old alerts
    this.clearOldAlerts();

    // Perform initial health checks
    await this.performHealthChecks();
  }

  private async updateDashboard(): Promise<void> {
    if (!this.isMonitoring) return;

    try {
      const dashboardData = await this.getDashboardData();

      // Notify subscribers
      this.subscribers.forEach(callback => {
        try {
          callback(dashboardData);
        } catch (error) {
          tradingLogger.error('Dashboard subscriber error', { error });
        }
      });

      // Check for alerts
      await this.checkForAlerts(dashboardData);

      // Update performance tracking
      this.updatePerformanceTracking(dashboardData);

    } catch (error) {
      tradingLogger.error('Dashboard update failed', { error });
      this.addErrorAlert('Dashboard update failed', error);
    }
  }

  private async getExchangeStatus(exchange: string): Promise<ExchangeStatus> {
    try {
      const startTime = Date.now();
      let apiStatus = false;
      let websocketStatus = false;
      let balances: any = {};
      let markets: any[] = [];
      let activeOrders = 0;
      let dailyVolume = 0;
      let dailyTrades = 0;

      if (exchange === 'binance') {
        try {
          // Test API connectivity
          await this.binanceService.getServerTime();
          apiStatus = true;

          // Get account info
          const accountInfo = await this.binanceService.getAccountInfo();
          balances = accountInfo.balances.filter(b => parseFloat(b.free) > 0);

          // Get market data
          const tickers = await this.binanceService.getAllTickers();
          markets = tickers.slice(0, 20).map(t => ({
            symbol: t.symbol,
            price: parseFloat(t.lastPrice),
            change24h: parseFloat(t.priceChangePercent),
            volume24h: parseFloat(t.volume),
            spread: parseFloat(t.askPrice) - parseFloat(t.bidPrice),
            liquidity: parseFloat(t.quoteVolume)
          }));

          // Get 24h stats (simplified)
          dailyVolume = markets.reduce((sum, m) => sum + m.volume24h * m.price, 0);
          dailyTrades = 100; // Placeholder

        } catch (error) {
          apiStatus = false;
          this.logExchangeError('binance', error);
        }

      } else if (exchange === 'bitkub') {
        try {
          // Test API connectivity
          await this.bitkubService.getServerTime();
          apiStatus = true;

          // Get balance
          const balance = await this.bitkubService.getBalance();
          balances = Object.entries(balance)
            .filter(([_, data]) => (data as any).available > 0)
            .map(([currency, data]) => ({ currency, ...data }));

          // Get market data
          const tickers = await this.bitkubService.getAllTickers();
          markets = tickers.slice(0, 20).map(t => ({
            symbol: t.id,
            price: t.last,
            change24h: ((t.last - t.prevClose) / t.prevClose) * 100,
            volume24h: t.baseVolume,
            spread: t.lowestAsk - t.highestBid,
            liquidity: t.quoteVolume
          }));

          dailyVolume = markets.reduce((sum, m) => sum + m.volume24h * m.price, 0);
          dailyTrades = 50; // Placeholder

        } catch (error) {
          apiStatus = false;
          this.logExchangeError('bitkub', error);
        }
      }

      const responseTime = Date.now() - startTime;
      const totalValue = balances.reduce((sum, b: any) => {
        const usdValue = this.convertToUSD(b.currency || b.asset, b.balance || b.available || 0);
        return sum + usdValue;
      }, 0);

      return {
        name: exchange.toUpperCase(),
        status: apiStatus ? 'ONLINE' : 'OFFLINE',
        connectivity: {
          api: apiStatus,
          websocket: websocketStatus,
          lastCheck: Date.now(),
          responseTime
        },
        trading: {
          enabled: apiStatus,
          activeOrders,
          dailyVolume,
          dailyTrades
        },
        balances: {
          totalValue,
          available: totalValue * 0.8, // Estimate
          inOrders: totalValue * 0.2, // Estimate
          currencies: balances.slice(0, 10).map((b: any) => ({
            currency: b.currency || b.asset,
            balance: b.balance || b.available || 0,
            value: this.convertToUSD(b.currency || b.asset, b.balance || b.available || 0)
          }))
        },
        markets: markets.slice(0, 10),
        fees: {
          maker: exchange === 'binance' ? 0.001 : 0.0025,
          taker: exchange === 'binance' ? 0.001 : 0.0025,
          volume30d: dailyVolume * 30, // Estimate
          tier: 'Normal'
        }
      };

    } catch (error) {
      tradingLogger.error(`Failed to get ${exchange} status`, { error });
      return this.getDefaultExchangeStatus(exchange);
    }
  }

  private async getMarketOverview(): Promise<MarketOverview> {
    try {
      // Get data from both exchanges
      const [binanceTickers, bitkubTickers] = await Promise.all([
        this.binanceService.getAllTickers().catch(() => []),
        this.bitkubService.getAllTickers().catch(() => [])
      ]);

      // Combine and calculate overview metrics
      const allMarkets = [...binanceTickers, ...bitkubTickers];
      const totalVolume = allMarkets.reduce((sum, t) => {
        const volume = parseFloat(t.volume || t.baseVolume || '0');
        const price = parseFloat(t.lastPrice || t.last || '0');
        return sum + (volume * price);
      }, 0);

      // Calculate top gainers/losers
      const marketsWithChange = allMarkets
        .map(t => ({
          symbol: t.symbol || t.id,
          change: parseFloat(t.priceChangePercent || '0'),
          volume: parseFloat(t.volume || t.baseVolume || '0')
        }))
        .filter(m => m.change !== 0)
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

      const topGainers = marketsWithChange
        .filter(m => m.change > 0)
        .slice(0, 5);

      const topLosers = marketsWithChange
        .filter(m => m.change < 0)
        .slice(0, 5);

      return {
        totalMarketCap: 2000000000000, // Placeholder
        total24hVolume: totalVolume,
        marketCapChange24h: 2.5, // Placeholder
        volumeChange24h: 5.2, // Placeholder
        btcDominance: 45.2, // Placeholder
        activeMarkets: allMarkets.length,
        topGainers,
        topLosers,
        volatility: {
          current: 0.025, // Placeholder
          average: 0.020,
          trend: 'STABLE'
        }
      };

    } catch (error) {
      tradingLogger.error('Failed to get market overview', { error });
      return this.getDefaultMarketOverview();
    }
  }

  private async getTopMovers(): Promise<TopMover[]> {
    try {
      const [binanceTickers, bitkubTickers] = await Promise.all([
        this.binanceService.getAllTickers().catch(() => []),
        this.bitkubService.getAllTickers().catch(() => [])
      ]);

      const allMarkets = [...binanceTickers, ...bitkubTickers];

      return allMarkets
        .map(t => ({
          symbol: t.symbol || t.id,
          price: parseFloat(t.lastPrice || t.last || '0'),
          change24h: parseFloat(t.priceChangePercent || '0'),
          volume24h: parseFloat(t.volume || t.baseVolume || '0'),
          exchanges: [t.symbol ? 'binance' : 'bitkub']
        }))
        .filter(m => Math.abs(m.change24h) > 1) // More than 1% change
        .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
        .slice(0, 10);

    } catch (error) {
      tradingLogger.error('Failed to get top movers', { error });
      return [];
    }
  }

  private async getVolumeAnalysis(): Promise<VolumeAnalysis> {
    try {
      const [binanceTickers, bitkubTickers] = await Promise.all([
        this.binanceService.getAllTickers().catch(() => []),
        this.bitkubService.getAllTickers().catch(() => [])
      ]);

      const binanceVolume = binanceTickers.reduce((sum, t) => {
        const volume = parseFloat(t.volume || '0');
        const price = parseFloat(t.lastPrice || '0');
        return sum + (volume * price);
      }, 0);

      const bitkubVolume = bitkubTickers.reduce((sum, t) => {
        const volume = parseFloat(t.baseVolume || '0');
        const price = parseFloat(t.last || '0');
        return sum + (volume * price);
      }, 0);

      const totalVolume = binanceVolume + bitkubVolume;

      return {
        totalVolume,
        exchangeBreakdown: [
          { exchange: 'binance', volume: binanceVolume, percentage: (binanceVolume / totalVolume) * 100 },
          { exchange: 'bitkub', volume: bitkubVolume, percentage: (bitkubVolume / totalVolume) * 100 }
        ],
        symbolBreakdown: [], // Would be populated with top symbols
        trends: {
          hourly: [], // Would be populated with hourly data
          daily: [] // Would be populated with daily data
        }
      };

    } catch (error) {
      tradingLogger.error('Failed to get volume analysis', { error });
      return this.getDefaultVolumeAnalysis();
    }
  }

  private calculateArbitrageStatistics(opportunities: ArbitrageOpportunity[]): ArbitrageStatistics {
    const profitByExchange: Record<string, number> = {};
    const profitBySymbol: Record<string, number> = {};

    opportunities.forEach(opp => {
      const exchangeKey = `${opp.exchanges.buy}-${opp.exchanges.sell}`;
      profitByExchange[exchangeKey] = (profitByExchange[exchangeKey] || 0) + opp.profitability.netProfit;
      profitBySymbol[opp.symbol] = (profitBySymbol[opp.symbol] || 0) + opp.profitability.netProfit;
    });

    const profitableOpportunities = opportunities.filter(opp => opp.profitability.netProfit > 0);
    const totalProfit = profitableOpportunities.reduce((sum, opp) => sum + opp.profitability.netProfit, 0);
    const averageProfit = profitableOpportunities.length > 0 ? totalProfit / profitableOpportunities.length : 0;

    return {
      totalOpportunities: opportunities.length,
      activeOpportunities: opportunities.filter(opp => opp.timing.expires > Date.now()).length,
      executedToday: 0, // Would be tracked in database
      successRate: 0, // Would be calculated from historical data
      totalProfit,
      averageProfit,
      bestOpportunity: opportunities.length > 0 ?
        opportunities.sort((a, b) => b.profitability.profitPercent - a.profitability.profitPercent)[0] : null,
      profitByExchange,
      profitBySymbol
    };
  }

  private calculateLatencyMetrics(): LatencyMetrics {
    const recentLatency = this.latencyHistory.slice(-10);
    const avgBinance = recentLatency.reduce((sum, l) => sum + l.binance, 0) / (recentLatency.length || 1);
    const avgBitkub = recentLatency.reduce((sum, l) => sum + l.bitkub, 0) / (recentLatency.length || 1);

    return {
      api: {
        binance: avgBinance,
        bitkub: avgBitkub,
        average: (avgBinance + avgBitkub) / 2
      },
      websocket: {
        binance: 50, // Placeholder
        bitkub: 75, // Placeholder
        average: 62.5
      },
      execution: {
        buyOrder: 250, // Placeholder
        sellOrder: 200, // Placeholder
        total: 450
      }
    };
  }

  private calculateUptimeMetrics(): UptimeMetrics {
    const recentUptime = this.uptimeHistory.slice(-100); // Last 100 data points
    const binanceUp = recentUptime.filter(u => u.binance).length;
    const bitkubUp = recentUptime.filter(u => u.bitkub).length;

    return {
      overall: ((binanceUp + bitkubUp) / (recentUptime.length * 2)) * 100,
      binance: (binanceUp / (recentUptime.length || 1)) * 100,
      bitkub: (bitkubUp / (recentUptime.length || 1)) * 100,
      lastDowntime: 0, // Would track actual downtime
      totalDowntime: 0
    };
  }

  private calculateErrorMetrics(): ErrorMetrics {
    const recentErrors = this.errorHistory.slice(-50);
    const errorsByType: Record<string, number> = {};
    const errorsByExchange: Record<string, number> = {};

    recentErrors.forEach(error => {
      errorsByType[error.error] = (errorsByType[error.error] || 0) + 1;
      errorsByExchange[error.exchange] = (errorsByExchange[error.exchange] || 0) + 1;
    });

    return {
      total: recentErrors.length,
      rate: (recentErrors.length / Math.max(this.uptimeHistory.length, 1)) * 100,
      byType: errorsByType,
      byExchange: errorsByExchange,
      recent: recentErrors.slice(-10).map(e => ({
        timestamp: e.timestamp,
        type: e.error,
        exchange: e.exchange,
        message: e.error
      }))
    };
  }

  private getActiveAlerts(): DashboardAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.acknowledged || alert.type === 'CRITICAL')
      .sort((a, b) => {
        const priority = { CRITICAL: 4, ERROR: 3, WARNING: 2, INFO: 1 };
        return priority[b.type] - priority[a.type];
      })
      .slice(0, this.config.display.maxAlerts);
  }

  private async performHealthChecks(): Promise<void> {
    await Promise.all([
      this.checkExchangeHealth('binance'),
      this.checkExchangeHealth('bitkub')
    ]);
  }

  private async checkExchangeHealth(exchange: string): Promise<void> {
    try {
      const startTime = Date.now();
      let isHealthy = false;

      if (exchange === 'binance') {
        await this.binanceService.getServerTime();
        isHealthy = true;
      } else if (exchange === 'bitkub') {
        await this.bitkubService.getServerTime();
        isHealthy = true;
      }

      const responseTime = Date.now() - startTime;

      this.latencyHistory.push({
        timestamp: Date.now(),
        binance: exchange === 'binance' ? responseTime : 0,
        bitkub: exchange === 'bitkub' ? responseTime : 0
      });

      this.uptimeHistory.push({
        timestamp: Date.now(),
        binance: exchange === 'binance' ? isHealthy : false,
        bitkub: exchange === 'bitkub' ? isHealthy : false
      });

      // Keep only recent history
      if (this.latencyHistory.length > 1000) {
        this.latencyHistory = this.latencyHistory.slice(-500);
      }
      if (this.uptimeHistory.length > 1000) {
        this.uptimeHistory = this.uptimeHistory.slice(-500);
      }

    } catch (error) {
      this.logExchangeError(exchange, error);
    }
  }

  private async checkForAlerts(dashboardData: ExchangeDashboardData): Promise<void> {
    // Check latency alerts
    if (dashboardData.performance.latency.api.average > this.config.alertThresholds.latency) {
      this.addAlert({
        type: 'WARNING',
        category: 'PERFORMANCE',
        title: 'High API Latency',
        message: `Average API latency is ${dashboardData.performance.latency.api.average}ms`,
        metadata: { latency: dashboardData.performance.latency }
      });
    }

    // Check error rate alerts
    if (dashboardData.performance.errors.rate > this.config.alertThresholds.errorRate) {
      this.addAlert({
        type: 'ERROR',
        category: 'PERFORMANCE',
        title: 'High Error Rate',
        message: `Error rate is ${dashboardData.performance.errors.rate}%`,
        metadata: { errors: dashboardData.performance.errors }
      });
    }

    // Check exchange connectivity
    if (dashboardData.exchanges.binance.status === 'OFFLINE') {
      this.addAlert({
        type: 'CRITICAL',
        category: 'CONNECTIVITY',
        title: 'Binance Exchange Offline',
        message: 'Binance API is not responding',
        exchange: 'binance'
      });
    }

    if (dashboardData.exchanges.bitkub.status === 'OFFLINE') {
      this.addAlert({
        type: 'CRITICAL',
        category: 'CONNECTIVITY',
        title: 'Bitkub Exchange Offline',
        message: 'Bitkub API is not responding',
        exchange: 'bitkub'
      });
    }

    // Check arbitrage opportunities
    const highProfitOpportunities = dashboardData.arbitrage.opportunities
      .filter(opp => opp.profitability.profitPercent > this.config.alertThresholds.profitThreshold);

    if (highProfitOpportunities.length > 0) {
      this.addAlert({
        type: 'INFO',
        category: 'ARBITRAGE',
        title: 'High Profit Arbitrage Opportunity',
        message: `Found ${highProfitOpportunities.length} opportunities with >${this.config.alertThresholds.profitThreshold}% profit`,
        metadata: { opportunities: highProfitOpportunities }
      });
    }
  }

  private checkAlertThresholds(alert: DashboardAlert): void {
    // Immediate critical alerts handling
    if (alert.type === 'CRITICAL') {
      tradingLogger.error('CRITICAL ALERT', {
        id: alert.id,
        title: alert.title,
        message: alert.message
      });
    }
  }

  private updatePerformanceTracking(dashboardData: ExchangeDashboardData): void {
    // Update performance metrics history
    // This would populate the trends data for charts
  }

  private addErrorAlert(message: string, error: any): void {
    this.addAlert({
      type: 'ERROR',
      category: 'SYSTEM',
      title: 'System Error',
      message,
      metadata: { error: error.message || error }
    });
  }

  private logExchangeError(exchange: string, error: any): void {
    this.errorHistory.push({
      timestamp: Date.now(),
      exchange,
      error: error.message || 'Unknown error'
    });

    // Keep only recent errors
    if (this.errorHistory.length > 1000) {
      this.errorHistory = this.errorHistory.slice(-500);
    }
  }

  private convertToUSD(currency: string, amount: number): number {
    // Simplified USD conversion - would use real exchange rates
    const rates: Record<string, number> = {
      'BTC': 45000,
      'ETH': 3000,
      'USDT': 1,
      'USDC': 1,
      'THB': 0.028,
      'BNB': 400
    };

    return amount * (rates[currency] || 1);
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultConfig(): DashboardConfig {
    return {
      refreshInterval: 5000, // 5 seconds
      alertThresholds: {
        latency: 1000, // 1 second
        errorRate: 5, // 5%
        profitThreshold: 1.0, // 1%
        volumeThreshold: 10000 // $10,000
      },
      enabledFeatures: {
        realTimeUpdates: true,
        arbitrageAlerts: true,
        performanceMonitoring: true,
        balanceTracking: true
      },
      display: {
        maxMarkets: 20,
        maxAlerts: 10,
        chartPeriods: ['1h', '4h', '24h', '7d', '30d'],
        defaultPeriod: '24h'
      }
    };
  }

  private getDefaultExchangeStatus(exchange: string): ExchangeStatus {
    return {
      name: exchange.toUpperCase(),
      status: 'OFFLINE',
      connectivity: {
        api: false,
        websocket: false,
        lastCheck: Date.now(),
        responseTime: 9999
      },
      trading: {
        enabled: false,
        activeOrders: 0,
        dailyVolume: 0,
        dailyTrades: 0
      },
      balances: {
        totalValue: 0,
        available: 0,
        inOrders: 0,
        currencies: []
      },
      markets: [],
      fees: {
        maker: 0,
        taker: 0,
        volume30d: 0,
        tier: 'Unknown'
      }
    };
  }

  private getDefaultMarketOverview(): MarketOverview {
    return {
      totalMarketCap: 0,
      total24hVolume: 0,
      marketCapChange24h: 0,
      volumeChange24h: 0,
      btcDominance: 0,
      activeMarkets: 0,
      topGainers: [],
      topLosers: [],
      volatility: {
        current: 0,
        average: 0,
        trend: 'STABLE'
      }
    };
  }

  private getDefaultVolumeAnalysis(): VolumeAnalysis {
    return {
      totalVolume: 0,
      exchangeBreakdown: [],
      symbolBreakdown: [],
      trends: {
        hourly: [],
        daily: []
      }
    };
  }
}