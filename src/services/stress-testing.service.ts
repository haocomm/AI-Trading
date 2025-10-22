/**
 * Stress Testing Service
 *
 * Tests portfolio resilience against historical market scenarios
 * and extreme market events to validate risk management.
 */

export interface HistoricalScenario {
  id: string;
  name: string;
  description: string;
  dateRange: { start: Date; end: Date };
  marketConditions: {
    volatility: number;
    trend: 'BULL' | 'BEAR' | 'SIDEWAYS';
    volume: 'HIGH' | 'NORMAL' | 'LOW';
  };
  keyEvents: string[];
}

export interface StressTestResult {
  scenarioId: string;
  scenarioName: string;
  portfolioStartValue: number;
  portfolioEndValue: number;
  maxDrawdown: number;
  maxLoss: number;
  recoveryTime: number;
  riskMetrics: {
    var95: number; // Value at Risk 95%
    var99: number; // Value at Risk 99%
    expectedShortfall: number;
      sharpeRatio: number;
    maxDrawdown: number;
    volatility: number;
  };
  performance: {
    totalReturn: number;
    annualizedReturn: number;
    winRate: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
  };
  recommendations: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface StressTestConfig {
  portfolioValue: number;
  positions: Array<{
    symbol: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    sector?: string;
  }>;
  timeframe: '1D' | '1W' | '1M';
  scenarios: string[];
}

export class StressTestingService {
  private scenarios: Map<string, HistoricalScenario> = new Map();

  constructor() {
    this.initializeHistoricalScenarios();
  }

  /**
   * Run comprehensive stress test
   */
  async runStressTest(config: StressTestConfig): Promise<StressTestResult[]> {
    const results: StressTestResult[] = [];

    for (const scenarioId of config.scenarios) {
      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        console.warn(`Scenario ${scenarioId} not found`);
        continue;
      }

      const result = await this.runSingleScenarioTest(config, scenario);
      results.push(result);
    }

    return results;
  }

  /**
   * Run test for a single scenario
   */
  private async runSingleScenarioTest(
    config: StressTestConfig,
    scenario: HistoricalScenario
  ): Promise<StressTestResult> {
    const { portfolioValue, positions, timeframe } = config;

    // Simulate market data for the scenario
    const marketData = await this.generateScenarioMarketData(scenario, positions, timeframe);

    // Track portfolio value over time
    let currentValue = portfolioValue;
    let peakValue = portfolioValue;
    let maxDrawdown = 0;
    let maxLoss = 0;
    let recoveryTime = 0;
    let inDrawdown = false;
    let drawdownStart = 0;

    const dailyReturns: number[] = [];
    let totalTrades = 0;
    let winningTrades = 0;
    let totalWinAmount = 0;
    let totalLossAmount = 0;

    // Simulate through the scenario period
    for (let day = 0; day < marketData.length; day++) {
      const dayData = marketData[day];
      let dayPortfolioValue = 0;

      // Calculate portfolio value for this day
      for (const position of positions) {
        const symbolData = dayData[position.symbol];
        if (symbolData) {
          dayPortfolioValue += position.quantity * symbolData.price;
        }
      }

      // Calculate daily return
      const dailyReturn = (dayPortfolioValue - currentValue) / currentValue;
      dailyReturns.push(dailyReturn);

      // Track drawdown
      if (dayPortfolioValue > peakValue) {
        peakValue = dayPortfolioValue;
        if (inDrawdown) {
          recoveryTime = day - drawdownStart;
          inDrawdown = false;
        }
      } else {
        const drawdown = (peakValue - dayPortfolioValue) / peakValue;
        maxDrawdown = Math.max(maxDrawdown, drawdown);

        if (drawdown > 0.05 && !inDrawdown) { // 5% drawdown threshold
          inDrawdown = true;
          drawdownStart = day;
        }
      }

      // Track maximum loss
      const loss = (portfolioValue - dayPortfolioValue) / portfolioValue;
      maxLoss = Math.max(maxLoss, loss);

      // Simulate trading decisions (simplified)
      const tradeResult = this.simulateTradingDecision(dayData, scenario);
      if (tradeResult !== 0) {
        totalTrades++;
        if (tradeResult > 0) {
          winningTrades++;
          totalWinAmount += tradeResult;
        } else {
          totalLossAmount += Math.abs(tradeResult);
        }
      }

      currentValue = dayPortfolioValue;
    }

    // Calculate risk metrics
    const riskMetrics = this.calculateRiskMetrics(dailyReturns, portfolioValue);

    // Calculate performance metrics
    const performance = this.calculatePerformanceMetrics(
      dailyReturns,
      totalTrades,
      winningTrades,
      totalWinAmount,
      totalLossAmount
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      maxDrawdown,
      maxLoss,
      riskMetrics,
      performance
    );

    // Determine risk level
    const riskLevel = this.determineRiskLevel(maxDrawdown, maxLoss, riskMetrics.var95);

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      portfolioStartValue: portfolioValue,
      portfolioEndValue: currentValue,
      maxDrawdown,
      maxLoss,
      recoveryTime,
      riskMetrics,
      performance,
      recommendations,
      riskLevel
    };
  }

  /**
   * Generate scenario market data
   */
  private async generateScenarioMarketData(
    scenario: HistoricalScenario,
    positions: Array<{ symbol: string; quantity: number; entryPrice: number; currentPrice: number }>,
    timeframe: string
  ): Promise<Array<{ [symbol: string]: { price: number; volume: number; volatility: number } }>> {
    const days = timeframe === '1D' ? 1 : timeframe === '1W' ? 7 : 30;
    const marketData: Array<{ [symbol: string]: { price: number; volume: number; volatility: number } }> = [];

    let baseVolatility = scenario.marketConditions.volatility;
    const trendMultiplier = scenario.marketConditions.trend === 'BULL' ? 1.02 :
                           scenario.marketConditions.trend === 'BEAR' ? 0.98 : 1.0;

    for (let day = 0; day < days; day++) {
      const dayData: { [symbol: string]: { price: number; volume: number; volatility: number } } = {};

      for (const position of positions) {
        // Simulate price movement based on scenario conditions
        const dailyVolatility = baseVolatility * (0.8 + Math.random() * 0.4); // ±20% variation
        const dailyReturn = (Math.random() - 0.5) * dailyVolatility * trendMultiplier;

        const previousPrice = day === 0 ? position.currentPrice :
          marketData[day - 1][position.symbol].price;

        const newPrice = previousPrice * (1 + dailyReturn);

        dayData[position.symbol] = {
          price: newPrice,
          volume: scenario.marketConditions.volume === 'HIGH' ? 1.5 :
                  scenario.marketConditions.volume === 'LOW' ? 0.7 : 1.0,
          volatility: dailyVolatility
        };
      }

      // Add scenario-specific events
      if (this.isEventDay(day, days, scenario)) {
        this.applyMarketShock(dayData, scenario);
      }

      marketData.push(dayData);
    }

    return marketData;
  }

  /**
   * Check if current day should have a market event
   */
  private isEventDay(day: number, totalDays: number, scenario: HistoricalScenario): boolean {
    // Place events randomly but with higher probability mid-scenario
    const eventProbability = scenario.keyEvents.length / totalDays;
    const midScenarioWeight = day > totalDays * 0.2 && day < totalDays * 0.8 ? 1.5 : 1.0;

    return Math.random() < (eventProbability * midScenarioWeight);
  }

  /**
   * Apply market shock for specific events
   */
  private applyMarketShock(
    dayData: { [symbol: string]: { price: number; volume: number; volatility: number } },
    scenario: HistoricalScenario
  ): void {
    const shockMagnitude = scenario.marketConditions.volatility > 0.5 ? 0.1 : 0.05;

    Object.keys(dayData).forEach(symbol => {
      const shock = (Math.random() - 0.5) * shockMagnitude * 2; // Can be positive or negative
      dayData[symbol].price *= (1 + shock);
      dayData[symbol].volume *= 2; // Higher volume during events
      dayData[symbol].volatility *= 1.5;
    });
  }

  /**
   * Simulate trading decision (simplified)
   */
  private simulateTradingDecision(
    dayData: { [symbol: string]: { price: number; volume: number; volatility: number } },
    scenario: HistoricalScenario
  ): number {
    // Simple trading logic based on market conditions
    if (scenario.marketConditions.trend === 'BEAR' && Math.random() < 0.3) {
      return -Math.random() * 1000; // Random loss
    } else if (scenario.marketConditions.trend === 'BULL' && Math.random() < 0.4) {
      return Math.random() * 1000; // Random profit
    }

    return 0; // No trade
  }

  /**
   * Calculate risk metrics
   */
  private calculateRiskMetrics(dailyReturns: number[], portfolioValue: number) {
    const sortedReturns = [...dailyReturns].sort((a, b) => a - b);

    // Value at Risk calculations
    const var95 = sortedReturns[Math.floor(sortedReturns.length * 0.05)] * portfolioValue;
    const var99 = sortedReturns[Math.floor(sortedReturns.length * 0.01)] * portfolioValue;

    // Expected Shortfall (average of worst 5% returns)
    const worst5Percent = sortedReturns.slice(0, Math.floor(sortedReturns.length * 0.05));
    const expectedShortfall = worst5Percent.reduce((sum, ret) => sum + ret, 0) / worst5Percent.length * portfolioValue;

    // Calculate other metrics
    const avgReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / dailyReturns.length;
    const volatility = Math.sqrt(variance);
    const sharpeRatio = avgReturn / volatility || 0;

    // Calculate maximum drawdown
    let peak = 1;
    let maxDrawdown = 0;
    let cumulative = 1;

    for (const ret of dailyReturns) {
      cumulative *= (1 + ret);
      peak = Math.max(peak, cumulative);
      const drawdown = (peak - cumulative) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return {
      var95: Math.abs(var95),
      var99: Math.abs(var99),
      expectedShortfall: Math.abs(expectedShortfall),
      sharpeRatio,
      maxDrawdown,
      volatility
    };
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(
    dailyReturns: number[],
    totalTrades: number,
    winningTrades: number,
    totalWinAmount: number,
    totalLossAmount: number
  ) {
    const totalReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0);
    const avgDailyReturn = totalReturn / dailyReturns.length;
    const annualizedReturn = avgDailyReturn * 252; // Trading days per year

    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount :
                        totalWinAmount > 0 ? 10 : 1;
    const avgWin = winningTrades > 0 ? totalWinAmount / winningTrades : 0;
    const avgLoss = (totalTrades - winningTrades) > 0 ? totalLossAmount / (totalTrades - winningTrades) : 0;

    return {
      totalReturn,
      annualizedReturn,
      winRate,
      profitFactor,
      avgWin,
      avgLoss
    };
  }

  /**
   * Generate recommendations based on stress test results
   */
  private generateRecommendations(
    maxDrawdown: number,
    maxLoss: number,
    riskMetrics: any,
    performance: any
  ): string[] {
    const recommendations: string[] = [];

    if (maxDrawdown > 0.25) {
      recommendations.push('Consider reducing position sizes to limit maximum drawdown');
    }

    if (riskMetrics.var95 > 0.1) {
      recommendations.push('Value at Risk is high - implement stricter risk controls');
    }

    if (performance.sharpeRatio < 0.5) {
      recommendations.push('Risk-adjusted returns are low - review strategy performance');
    }

    if (performance.winRate < 0.4) {
      recommendations.push('Win rate is below 40% - consider refining entry/exit criteria');
    }

    if (riskMetrics.volatility > 0.3) {
      recommendations.push('Portfolio volatility is high - consider adding diversification');
    }

    if (maxLoss > 0.15) {
      recommendations.push('Maximum loss exceeded 15% - implement tighter stop-losses');
    }

    if (recommendations.length === 0) {
      recommendations.push('Portfolio shows good resilience under stress conditions');
    }

    return recommendations;
  }

  /**
   * Determine risk level
   */
  private determineRiskLevel(maxDrawdown: number, maxLoss: number, var95: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (maxDrawdown > 0.4 || maxLoss > 0.25 || var95 > 0.15) {
      return 'CRITICAL';
    } else if (maxDrawdown > 0.25 || maxLoss > 0.15 || var95 > 0.1) {
      return 'HIGH';
    } else if (maxDrawdown > 0.15 || maxLoss > 0.1 || var95 > 0.05) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * Initialize historical scenarios
   */
  private initializeHistoricalScenarios(): void {
    // 2008 Financial Crisis
    this.scenarios.set('2008_CRISIS', {
      id: '2008_CRISIS',
      name: '2008 Financial Crisis',
      description: 'Global financial crisis with severe market downturn',
      dateRange: { start: new Date('2008-09-01'), end: new Date('2009-03-31') },
      marketConditions: {
        volatility: 0.8,
        trend: 'BEAR',
        volume: 'HIGH'
      },
      keyEvents: [
        'Lehman Brothers collapse',
        'TARP program announcement',
        'Federal Reserve emergency actions',
        'Global market synchronization'
      ]
    });

    // COVID-19 Crash
    this.scenarios.set('2020COVID', {
      id: '2020COVID',
      name: 'COVID-19 Market Crash',
      description: 'Rapid market decline due to pandemic fears',
      dateRange: { start: new Date('2020-02-19'), end: new Date('2020-04-30') },
      marketConditions: {
        volatility: 0.9,
        trend: 'BEAR',
        volume: 'HIGH'
      },
      keyEvents: [
        'WHO pandemic declaration',
        'Global travel restrictions',
        'Federal Reserve rate cuts',
        'Government stimulus packages'
      ]
    });

    // 2010 Flash Crash
    this.scenarios.set('2010_FLASH', {
      id: '2010_FLASH',
      name: '2010 Flash Crash',
      description: 'Rapid market decline and recovery within minutes',
      dateRange: { start: new Date('2010-05-06'), end: new Date('2010-05-07') },
      marketConditions: {
        volatility: 0.95,
        trend: 'SIDEWAYS',
        volume: 'HIGH'
      },
      keyEvents: [
        'High-frequency trading issues',
        'Liquidity evaporation',
        'Rapid market recovery'
      ]
    });

    // Bull Market 2019-2021
    this.scenarios.set('2019_BULL', {
      id: '2019_BULL',
      name: '2019-2021 Bull Market',
      description: 'Strong upward market trend with low volatility',
      dateRange: { start: new Date('2019-01-01'), end: new Date('2021-12-31') },
      marketConditions: {
        volatility: 0.2,
        trend: 'BULL',
        volume: 'NORMAL'
      },
      keyEvents: [
        'Trade resolution optimism',
        'Technology sector rally',
        'Fed monetary easing',
        'Economic recovery expectations'
      ]
    });

    // High Inflation 2022
    this.scenarios.set('2022_INFLATION', {
      id: '2022_INFLATION',
      name: '2022 Inflation Shock',
      description: 'Market decline due to high inflation and rate hikes',
      dateRange: { start: new Date('2022-01-01'), end: new Date('2022-12-31') },
      marketConditions: {
        volatility: 0.4,
        trend: 'BEAR',
        volume: 'HIGH'
      },
      keyEvents: [
        'Fed rate hikes',
        'Supply chain disruptions',
        'Energy price spikes',
        'Recession fears'
      ]
    });
  }

  /**
   * Get available scenarios
   */
  getAvailableScenarios(): HistoricalScenario[] {
    return Array.from(this.scenarios.values());
  }

  /**
   * Get scenario by ID
   */
  getScenario(id: string): HistoricalScenario | undefined {
    return this.scenarios.get(id);
  }
}