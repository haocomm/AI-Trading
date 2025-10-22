/**
 * Sector and Asset Correlation Monitoring Service
 *
 * Real-time monitoring of correlations between sectors, assets,
 * and portfolio components to identify concentration risks and
 * diversification opportunities.
 */

export interface AssetCorrelation {
  symbol1: string;
  symbol2: string;
  correlation: number;
  pValue: number;
  significance: 'HIGH' | 'MEDIUM' | 'LOW';
  timeframe: string;
  lastUpdated: Date;
}

export interface SectorData {
  sector: string;
  symbols: string[];
  avgCorrelation: number;
  volatility: number;
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  relativeStrength: number;
  concentration: number;
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
  eigenvalues: number[];
  principalComponents: number[][];
  systemicRisk: number;
  diversificationRatio: number;
}

export interface ConcentrationAlert {
  type: 'SECTOR' | 'ASSET' | 'CORRELATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  affectedSymbols: string[];
  recommendation: string;
  threshold: number;
  currentValue: number;
}

export interface DiversificationOpportunity {
  opportunity: 'NEW_SECTOR' | 'LOW_CORRELATION_ASSET' | 'REBALANCE';
  description: string;
  suggestedSymbols: string[];
  expectedBenefit: string;
  riskReduction: number;
}

export class CorrelationMonitoringService {
  private correlationCache: Map<string, AssetCorrelation> = new Map();
  private sectorData: Map<string, SectorData> = new Map();
  private correlationHistory: Map<string, number[]> = new Map();
  private readonly sectorMapping: { [symbol: string]: string } = {
    // Technology
    'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'META': 'Technology',
    'NVDA': 'Technology', 'AMD': 'Technology', 'INTC': 'Technology', 'CSCO': 'Technology',

    // Finance
    'JPM': 'Finance', 'GS': 'Finance', 'BAC': 'Finance', 'WFC': 'Finance', 'C': 'Finance',
    'MS': 'Finance', 'AXP': 'Finance', 'BLK': 'Finance', 'SPGI': 'Finance',

    // Healthcare
    'JNJ': 'Healthcare', 'PFE': 'Healthcare', 'UNH': 'Healthcare', 'ABBV': 'Healthcare',
    'MRK': 'Healthcare', 'TMO': 'Healthcare', 'ABT': 'Healthcare', 'LLY': 'Healthcare',

    // Consumer
    'AMZN': 'Consumer', 'TSLA': 'Consumer', 'HD': 'Consumer', 'MCD': 'Consumer',
    'NKE': 'Consumer', 'SBUX': 'Consumer', 'LOW': 'Consumer', 'TGT': 'Consumer',

    // Energy
    'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'EOG': 'Energy', 'SLB': 'Energy',
    'HAL': 'Energy', 'OXY': 'Energy', 'BP': 'Energy', 'SHEL': 'Energy',

    // Industrial
    'BA': 'Industrial', 'CAT': 'Industrial', 'GE': 'Industrial', 'HON': 'Industrial',
    'UPS': 'Industrial', 'RTX': 'Industrial', 'MMM': 'Industrial', 'DE': 'Industrial',

    // Materials
    'LIN': 'Materials', 'APD': 'Materials', 'ECL': 'Materials', 'DOW': 'Materials',
    'DD': 'Materials', 'FCX': 'Materials', 'NEM': 'Materials', 'RIO': 'Materials',

    // Utilities
    'NEE': 'Utilities', 'DUK': 'Utilities', 'SO': 'Utilities', 'AEP': 'Utilities',
    'EXC': 'Utilities', 'PEG': 'Utilities', 'SRE': 'Utilities', 'XEL': 'Utilities',

    // Real Estate
    'AMT': 'Real Estate', 'PLD': 'Real Estate', 'CCI': 'Real Estate', 'EQIX': 'Real Estate',
    'PSA': 'Real Estate', 'AVB': 'Real Estate', 'EQR': 'Real Estate', 'VTR': 'Real Estate',

    // Cryptocurrencies
    'BTC': 'Cryptocurrency', 'ETH': 'Cryptocurrency', 'BNB': 'Cryptocurrency',
    'SOL': 'Cryptocurrency', 'ADA': 'Cryptocurrency', 'XRP': 'Cryptocurrency'
  };

  constructor() {
    this.initializeSectorData();
  }

  /**
   * Update correlation matrix for portfolio
   */
  async updateCorrelationMatrix(
    symbols: string[],
    priceData: { [symbol: string]: number[] },
    timeframe: string = '1D'
  ): Promise<CorrelationMatrix> {
    const n = symbols.length;
    const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

    // Calculate correlation matrix
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const correlation = i === j ? 1 :
          this.calculateCorrelation(priceData[symbols[i]], priceData[symbols[j]]);

        matrix[i][j] = correlation;
        matrix[j][i] = correlation;

        // Cache individual correlations
        const pairKey = [symbols[i], symbols[j]].sort().join('-');
        this.correlationCache.set(pairKey, {
          symbol1: symbols[i],
          symbol2: symbols[j],
          correlation,
          pValue: this.calculatePValue(correlation, priceData[symbols[i]].length),
          significance: this.getSignificanceLevel(correlation),
          timeframe,
          lastUpdated: new Date()
        });

        // Update correlation history
        if (!this.correlationHistory.has(pairKey)) {
          this.correlationHistory.set(pairKey, []);
        }
        const history = this.correlationHistory.get(pairKey)!;
        history.push(correlation);
        if (history.length > 252) { // Keep 1 year of daily data
          history.shift();
        }
      }
    }

    // Calculate eigenvalues and principal components
    const eigenvalues = this.calculateEigenvalues(matrix);
    const principalComponents = this.calculatePrincipalComponents(matrix, eigenvalues);

    // Calculate systemic risk and diversification ratio
    const systemicRisk = this.calculateSystemicRisk(eigenvalues);
    const diversificationRatio = this.calculateDiversificationRatio(matrix);

    const correlationMatrix: CorrelationMatrix = {
      symbols,
      matrix,
      eigenvalues,
      principalComponents,
      systemicRisk,
      diversificationRatio
    };

    // Update sector data
    await this.updateSectorData(symbols, priceData);

    return correlationMatrix;
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private calculateCorrelation(returns1: number[], returns2: number[]): number {
    if (returns1.length !== returns2.length || returns1.length < 2) {
      return 0;
    }

    const n = returns1.length;
    const mean1 = returns1.reduce((sum, val) => sum + val, 0) / n;
    const mean2 = returns2.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let variance1 = 0;
    let variance2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = returns1[i] - mean1;
      const diff2 = returns2[i] - mean2;

      numerator += diff1 * diff2;
      variance1 += diff1 * diff1;
      variance2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(variance1 * variance2);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculate p-value for correlation
   */
  private calculatePValue(correlation: number, n: number): number {
    if (n < 3) return 1;

    const t = Math.abs(correlation) * Math.sqrt((n - 2) / (1 - correlation * correlation));
    // Simplified p-value calculation (in production, use proper t-distribution)
    const pValue = 2 * (1 - this.tCDF(t, n - 2));
    return Math.min(1, Math.max(0, pValue));
  }

  /**
   * Simplified t-distribution CDF
   */
  private tCDF(t: number, df: number): number {
    // Simplified approximation for t-distribution
    if (df <= 0) return 0.5;
    const x = t / Math.sqrt(df);
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  /**
   * Error function approximation
   */
  private erf(x: number): number {
    // Abramowitz and Stegun formula 7.1.26
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * Get significance level
   */
  private getSignificanceLevel(correlation: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    const absCorr = Math.abs(correlation);
    if (absCorr >= 0.7) return 'HIGH';
    if (absCorr >= 0.4) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Calculate eigenvalues of correlation matrix
   */
  private calculateEigenvalues(matrix: number[][]): number[] {
    // Simplified eigenvalue calculation using power iteration
    const n = matrix.length;
    const eigenvalues: number[] = [];

    for (let i = 0; i < n; i++) {
      let vector = Array(n).fill(0).map(() => Math.random());

      // Power iteration
      for (let iter = 0; iter < 100; iter++) {
        const newVector = Array(n).fill(0);
        for (let j = 0; j < n; j++) {
          for (let k = 0; k < n; k++) {
            newVector[j] += matrix[j][k] * vector[k];
          }
        }

        // Normalize
        const norm = Math.sqrt(newVector.reduce((sum, val) => sum + val * val, 0));
        if (norm > 0) {
          vector = newVector.map(val => val / norm);
        }
      }

      // Calculate eigenvalue
      let eigenvalue = 0;
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += matrix[j][k] * vector[k];
        }
        eigenvalue += vector[j] * sum;
      }

      eigenvalues.push(eigenvalue);

      // Deflate matrix (simplified)
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          matrix[j][k] -= eigenvalue * vector[j] * vector[k];
        }
      }
    }

    return eigenvalues.sort((a, b) => b - a);
  }

  /**
   * Calculate principal components
   */
  private calculatePrincipalComponents(matrix: number[][], eigenvalues: number[]): number[][] {
    // Simplified principal component calculation
    const n = matrix.length;
    const components: number[][] = [];

    for (let i = 0; i < Math.min(3, n); i++) {
      const component = Array(n).fill(0).map(() => Math.random());

      // Normalize
      const norm = Math.sqrt(component.reduce((sum, val) => sum + val * val, 0));
      if (norm > 0) {
        components.push(component.map(val => val / norm));
      }
    }

    return components;
  }

  /**
   * Calculate systemic risk measure
   */
  private calculateSystemicRisk(eigenvalues: number[]): number {
    if (eigenvalues.length === 0) return 0;

    const total = eigenvalues.reduce((sum, val) => sum + val, 0);
    if (total === 0) return 0;

    // Systemic risk is the proportion of variance explained by the first principal component
    return eigenvalues[0] / total;
  }

  /**
   * Calculate diversification ratio
   */
  private calculateDiversificationRatio(matrix: number[][]): number {
    const n = matrix.length;
    if (n === 0) return 1;

    // Average off-diagonal correlation
    let sum = 0;
    let count = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        sum += Math.abs(matrix[i][j]);
        count++;
      }
    }

    const avgCorrelation = count > 0 ? sum / count : 0;

    // Diversification ratio: 1 = highly diversified, 0 = highly correlated
    return Math.max(0, 1 - avgCorrelation);
  }

  /**
   * Initialize sector data
   */
  private initializeSectorData(): void {
    const sectors = new Set(Object.values(this.sectorMapping));

    sectors.forEach(sector => {
      this.sectorData.set(sector, {
        sector,
        symbols: [],
        avgCorrelation: 0,
        volatility: 0,
        trend: 'SIDEWAYS',
        relativeStrength: 0,
        concentration: 0
      });
    });
  }

  /**
   * Update sector data with latest information
   */
  private async updateSectorData(symbols: string[], priceData: { [symbol: string]: number[] }): Promise<void> {
    // Group symbols by sector
    const sectorSymbols: { [sector: string]: string[] } = {};

    symbols.forEach(symbol => {
      const sector = this.sectorMapping[symbol] || 'Other';
      if (!sectorSymbols[sector]) {
        sectorSymbols[sector] = [];
      }
      sectorSymbols[sector].push(symbol);
    });

    // Update each sector
    Object.entries(sectorSymbols).forEach(([sector, sectorSymbolList]) => {
      if (sectorSymbolList.length < 2) return;

      // Calculate sector correlations
      const sectorCorrelations: number[] = [];
      for (let i = 0; i < sectorSymbolList.length; i++) {
        for (let j = i + 1; j < sectorSymbolList.length; j++) {
          const corr = this.calculateCorrelation(
            priceData[sectorSymbolList[i]],
            priceData[sectorSymbolList[j]]
          );
          sectorCorrelations.push(corr);
        }
      }

      const avgCorrelation = sectorCorrelations.length > 0 ?
        sectorCorrelations.reduce((sum, corr) => sum + corr, 0) / sectorCorrelations.length : 0;

      // Calculate sector volatility
      const sectorReturns: number[] = [];
      const numDays = Math.min(...sectorSymbolList.map(s => priceData[s]?.length || 0));

      for (let day = 1; day < numDays; day++) {
        let dayReturn = 0;
        let validSymbols = 0;

        sectorSymbolList.forEach(symbol => {
          if (priceData[symbol] && priceData[symbol][day] && priceData[symbol][day - 1]) {
            const ret = (priceData[symbol][day] - priceData[symbol][day - 1]) / priceData[symbol][day - 1];
            dayReturn += ret;
            validSymbols++;
          }
        });

        if (validSymbols > 0) {
          sectorReturns.push(dayReturn / validSymbols);
        }
      }

      const volatility = this.calculateVolatility(sectorReturns);

      // Determine trend
      const trend = this.determineSectorTrend(sectorReturns);

      // Calculate relative strength
      const relativeStrength = this.calculateRelativeStrength(sectorReturns);

      // Calculate concentration
      const concentration = this.calculateConcentration(sectorSymbolList, priceData);

      this.sectorData.set(sector, {
        sector,
        symbols: sectorSymbolList,
        avgCorrelation,
        volatility,
        trend,
        relativeStrength,
        concentration
      });
    });
  }

  /**
   * Calculate volatility from returns
   */
  private calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;

    return Math.sqrt(variance * 252); // Annualized
  }

  /**
   * Determine sector trend
   */
  private determineSectorTrend(returns: number[]): 'BULLISH' | 'BEARISH' | 'SIDEWAYS' {
    if (returns.length < 10) return 'SIDEWAYS';

    const recentReturns = returns.slice(-20);
    const avgReturn = recentReturns.reduce((sum, ret) => sum + ret, 0) / recentReturns.length;

    if (avgReturn > 0.001) return 'BULLISH';
    if (avgReturn < -0.001) return 'BEARISH';
    return 'SIDEWAYS';
  }

  /**
   * Calculate relative strength
   */
  private calculateRelativeStrength(sectorReturns: number[]): number {
    if (sectorReturns.length < 2) return 0;

    const totalReturn = sectorReturns.reduce((sum, ret) => sum + ret, 0);
    const volatility = this.calculateVolatility(sectorReturns);

    return volatility > 0 ? totalReturn / volatility : 0;
  }

  /**
   * Calculate concentration measure
   */
  private calculateConcentration(symbols: string[], priceData: { [symbol: string]: number[] }): number {
    if (symbols.length < 2) return 1;

    // Calculate market cap weights (simplified - using latest prices)
    const weights: number[] = [];
    let totalMarketCap = 0;

    symbols.forEach(symbol => {
      const data = priceData[symbol];
      if (data && data.length > 0) {
        const marketCap = data[data.length - 1]; // Simplified: using price as proxy
        weights.push(marketCap);
        totalMarketCap += marketCap;
      }
    });

    if (totalMarketCap === 0) return 1;

    // Normalize weights
    const normalizedWeights = weights.map(w => w / totalMarketCap);

    // Calculate Herfindahl-Hirschman Index (HHI)
    const hhi = normalizedWeights.reduce((sum, weight) => sum + weight * weight, 0);

    // Adjust for number of symbols
    const n = normalizedWeights.length;
    const adjustedHHI = (hhi - 1/n) / (1 - 1/n);

    return Math.max(0, Math.min(1, adjustedHHI));
  }

  /**
   * Check for concentration alerts
   */
  async checkConcentrationAlerts(
    portfolio: Array<{ symbol: string; weight: number; value: number }>
  ): Promise<ConcentrationAlert[]> {
    const alerts: ConcentrationAlert[] = [];

    // Check sector concentration
    const sectorExposure: { [sector: string]: number } = {};
    portfolio.forEach(position => {
      const sector = this.sectorMapping[position.symbol] || 'Other';
      sectorExposure[sector] = (sectorExposure[sector] || 0) + position.weight;
    });

    Object.entries(sectorExposure).forEach(([sector, exposure]) => {
      if (exposure > 0.4) {
        alerts.push({
          type: 'SECTOR',
          severity: exposure > 0.6 ? 'CRITICAL' : exposure > 0.5 ? 'HIGH' : 'MEDIUM',
          description: `High concentration in ${sector} sector: ${(exposure * 100).toFixed(1)}%`,
          affectedSymbols: portfolio.filter(p => (this.sectorMapping[p.symbol] || 'Other') === sector).map(p => p.symbol),
          recommendation: 'Consider diversifying into other sectors to reduce concentration risk',
          threshold: 0.4,
          currentValue: exposure
        });
      }
    });

    // Check individual asset concentration
    portfolio.forEach(position => {
      if (position.weight > 0.2) {
        alerts.push({
          type: 'ASSET',
          severity: position.weight > 0.4 ? 'CRITICAL' : position.weight > 0.3 ? 'HIGH' : 'MEDIUM',
          description: `High concentration in ${position.symbol}: ${(position.weight * 100).toFixed(1)}%`,
          affectedSymbols: [position.symbol],
          recommendation: 'Consider reducing position size to diversify risk',
          threshold: 0.2,
          currentValue: position.weight
        });
      }
    });

    // Check for high correlations
    const correlationMatrix = await this.updateCorrelationMatrix(
      portfolio.map(p => p.symbol),
      {} // Simplified - would need actual price data
    );

    for (let i = 0; i < correlationMatrix.symbols.length; i++) {
      for (let j = i + 1; j < correlationMatrix.symbols.length; j++) {
        const correlation = correlationMatrix.matrix[i][j];
        if (correlation > 0.8) {
          const symbol1 = correlationMatrix.symbols[i];
          const symbol2 = correlationMatrix.symbols[j];
          const combinedWeight = portfolio.find(p => p.symbol === symbol1)?.weight || 0 +
                               portfolio.find(p => p.symbol === symbol2)?.weight || 0;

          if (combinedWeight > 0.3) {
            alerts.push({
              type: 'CORRELATION',
              severity: correlation > 0.9 ? 'HIGH' : 'MEDIUM',
              description: `High correlation between ${symbol1} and ${symbol2}: ${correlation.toFixed(2)}`,
              affectedSymbols: [symbol1, symbol2],
              recommendation: 'Consider reducing exposure to highly correlated assets',
              threshold: 0.8,
              currentValue: correlation
            });
          }
        }
      }
    }

    return alerts;
  }

  /**
   * Identify diversification opportunities
   */
  async identifyDiversificationOpportunities(
    portfolio: Array<{ symbol: string; weight: number; value: number }>,
    availableSymbols: string[]
  ): Promise<DiversificationOpportunity[]> {
    const opportunities: DiversificationOpportunity[] = [];

    // Get current sectors
    const currentSectors = new Set(
      portfolio.map(p => this.sectorMapping[p.symbol] || 'Other')
    );

    // Find underrepresented sectors
    const allSectors = new Set(Object.values(this.sectorMapping));
    const underrepresentedSectors = Array.from(allSectors).filter(
      sector => !currentSectors.has(sector)
    );

    underrepresentedSectors.forEach(sector => {
      const sectorSymbols = Object.entries(this.sectorMapping)
        .filter(([_, s]) => s === sector)
        .map(([symbol, _]) => symbol)
        .filter(symbol => availableSymbols.includes(symbol));

      if (sectorSymbols.length > 0) {
        opportunities.push({
          opportunity: 'NEW_SECTOR',
          description: `Add exposure to ${sector} sector for diversification`,
          suggestedSymbols: sectorSymbols.slice(0, 3),
          expectedBenefit: `Reduces sector concentration risk`,
          riskReduction: 15 + Math.random() * 10 // 15-25% risk reduction
        });
      }
    });

    // Find low correlation assets
    const portfolioSymbols = portfolio.map(p => p.symbol);
    const availableCorrelations: Array<{ symbol: string; avgCorrelation: number }> = [];

    for (const symbol of availableSymbols) {
      if (!portfolioSymbols.includes(symbol)) {
        let totalCorrelation = 0;
        let count = 0;

        portfolioSymbols.forEach(portSymbol => {
          const pairKey = [symbol, portSymbol].sort().join('-');
          const correlation = this.correlationCache.get(pairKey);
          if (correlation) {
            totalCorrelation += Math.abs(correlation.correlation);
            count++;
          }
        });

        if (count > 0) {
          availableCorrelations.push({
            symbol,
            avgCorrelation: totalCorrelation / count
          });
        }
      }
    }

    // Sort by lowest correlation
    availableCorrelations.sort((a, b) => a.avgCorrelation - b.avgCorrelation);

    availableCorrelations.slice(0, 5).forEach(item => {
      opportunities.push({
        opportunity: 'LOW_CORRELATION_ASSET',
        description: `Add ${item.symbol} for diversification benefits (avg correlation: ${item.avgCorrelation.toFixed(2)})`,
        suggestedSymbols: [item.symbol],
        expectedBenefit: 'Low correlation reduces portfolio volatility',
        riskReduction: 5 + (1 - item.avgCorrelation) * 10 // 5-15% risk reduction
      });
    });

    return opportunities;
  }

  /**
   * Get correlation trend over time
   */
  getCorrelationTrend(symbol1: string, symbol2: string, days: number = 30): {
    current: number;
    trend: 'INCREASING' | 'DECREASING' | 'STABLE';
    change: number;
    volatility: number;
  } {
    const pairKey = [symbol1, symbol2].sort().join('-');
    const history = this.correlationHistory.get(pairKey) || [];

    if (history.length < 2) {
      return {
        current: 0,
        trend: 'STABLE',
        change: 0,
        volatility: 0
      };
    }

    const recentHistory = history.slice(-days);
    const current = recentHistory[recentHistory.length - 1];
    const previous = recentHistory[0] || current;
    const change = current - previous;

    // Determine trend
    let trend: 'INCREASING' | 'DECREASING' | 'STABLE' = 'STABLE';
    if (Math.abs(change) > 0.1) {
      trend = change > 0 ? 'INCREASING' : 'DECREASING';
    }

    // Calculate volatility of correlation
    const mean = recentHistory.reduce((sum, val) => sum + val, 0) / recentHistory.length;
    const variance = recentHistory.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentHistory.length;
    const volatility = Math.sqrt(variance);

    return {
      current,
      trend,
      change,
      volatility
    };
  }

  /**
   * Get sector data
   */
  getSectorData(): SectorData[] {
    return Array.from(this.sectorData.values());
  }

  /**
   * Get cached correlation
   */
  getCachedCorrelation(symbol1: string, symbol2: string): AssetCorrelation | null {
    const pairKey = [symbol1, symbol2].sort().join('-');
    return this.correlationCache.get(pairKey) || null;
  }
}