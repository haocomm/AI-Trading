import { tradingConfig } from '@/config';
import { tradingLogger, auditLogger } from '@/utils/logger';
import { db } from '@/models/database';
import { Trade } from '@/types';

/**
 * Trade Reporting Service
 * Implements comprehensive trade reporting for regulatory compliance and tax purposes
 */

export interface TradeReport {
  id: string;
  date: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  totalValue: number;
  fees: number;
  pnl: number;
  pnlPercent: number;
  holdingPeriod: number; // in days
  shortTerm: boolean;
  notes: string;
  aiDecision?: {
    provider: string;
    confidence: number;
    reasoning: string;
    timestamp: number;
  };
}

export interface TaxReport {
  year: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  totalShortTermGains: number;
  totalLongTermGains: number;
  totalLosses: number;
  netGain: number;
  estimatedTax: number;
  trades: TradeReport[];
  summary: {
    bestTrade: TradeReport;
    worstTrade: TradeReport;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
}

export interface ComplianceReport {
  period: string;
  startDate: string;
  endDate: string;
  totalTrades: number;
  totalVolume: number;
  totalFees: number;
  riskViolations: string[];
  complianceScore: number;
  recommendations: string[];
  auditTrail: {
    timestamp: number;
    event: string;
    details: any;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }[];
}

export interface Form8949Data {
  year: number;
  shortTerm: {
    proceeds: number;
    costBasis: number;
    gains: number;
    trades: Array<{
      description: string;
      dateAcquired: string;
      dateSold: string;
      proceeds: number;
      costBasis: number;
      gain: number;
    }>;
  };
  longTerm: {
    proceeds: number;
    costBasis: number;
    gains: number;
    trades: Array<{
      description: string;
      dateAcquired: string;
      dateSold: string;
      proceeds: number;
      costBasis: number;
      gain: number;
    }>;
  };
}

export class TradeReportingService {
  private readonly TAX_RATES = {
    shortTerm: 0.35, // 35% for short-term capital gains
    longTerm: 0.20,  // 20% for long-term capital gains
    washSale: 0.35   // Wash sales taxed at short-term rate
  };

  private readonly WASH_SALE_RULE_DAYS = 30; // 30 days before/after for wash sale rule
  private readonly LONG_TERM_HOLDING_DAYS = 365; // 1 year for long-term treatment

  constructor() {
    this.initializeReportingTables();
  }

  /**
   * Generate comprehensive trade report for a specific period
   */
  async generateTradeReport(startDate: string, endDate: string): Promise<TradeReport[]> {
    try {
      const sql = `
        SELECT
          t.*,
          m.symbol,
          m.price as current_price
        FROM trades t
        LEFT JOIN market_data m ON t.symbol = m.symbol
        WHERE t.status = 'CLOSED'
        AND t.close_date BETWEEN ? AND ?
        ORDER BY t.close_date DESC
      `;

      const rows = db.prepare(sql).all(startDate, endDate) as any[];
      const reports: TradeReport[] = [];

      for (const row of rows) {
        const holdingPeriod = this.calculateHoldingPeriod(row.open_date, row.close_date);
        const shortTerm = holdingPeriod < this.LONG_TERM_HOLDING_DAYS;

        // Get AI decision data if available
        const aiDecision = await this.getAIDecisionData(row.id);

        const report: TradeReport = {
          id: row.id,
          date: row.close_date,
          symbol: row.symbol,
          action: row.side,
          quantity: row.quantity,
          price: row.price,
          totalValue: row.quantity * row.price,
          fees: row.fees || 0,
          pnl: row.pnl || 0,
          pnlPercent: this.calculatePnLPercent(row),
          holdingPeriod,
          shortTerm,
          notes: row.notes || '',
          aiDecision
        };

        reports.push(report);
      }

      tradingLogger.report('TRADE_REPORT_GENERATED', {
        startDate,
        endDate,
        tradesCount: reports.length,
        totalPnL: reports.reduce((sum, r) => sum + r.pnl, 0)
      });

      return reports;
    } catch (error) {
      tradingLogger.error('Failed to generate trade report', { startDate, endDate, error });
      throw error;
    }
  }

  /**
   * Generate tax report (Form 8949 preparation)
   */
  async generateTaxReport(year: number): Promise<TaxReport> {
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const tradeReports = await this.generateTradeReport(startDate, endDate);
      const winningTrades = tradeReports.filter(t => t.pnl > 0);
      const losingTrades = tradeReports.filter(t => t.pnl < 0);

      // Calculate gains by holding period
      const shortTermGains = winningTrades.filter(t => t.shortTerm).reduce((sum, t) => sum + t.pnl, 0);
      const longTermGains = winningTrades.filter(t => !t.shortTerm).reduce((sum, t) => sum + t.pnl, 0);
      const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

      const totalPnL = shortTermGains + longTermGains - totalLosses;
      const estimatedTax = (shortTermGains * this.TAX_RATES.shortTerm) +
                          (longTermGains * this.TAX_RATES.longTerm);

      // Calculate summary statistics
      const avgWin = winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
        : 0;
      const avgLoss = losingTrades.length > 0
        ? losingTrades.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / losingTrades.length
        : 0;

      const profitFactor = totalLosses > 0
        ? (shortTermGains + longTermGains) / totalLosses
        : 0;

      const bestTrade = tradeReports.reduce((best, current) =>
        current.pnl > best.pnl ? current : best, tradeReports[0] || { pnl: 0 } as TradeReport);
      const worstTrade = tradeReports.reduce((worst, current) =>
        current.pnl < worst.pnl ? current : worst, tradeReports[0] || { pnl: 0 } as TradeReport);

      const sharpeRatio = this.calculateSharpeRatio(tradeReports);
      const maxDrawdown = await this.calculateMaxDrawdownForYear(year);

      const taxReport: TaxReport = {
        year,
        totalTrades: tradeReports.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: tradeReports.length > 0 ? (winningTrades.length / tradeReports.length) * 100 : 0,
        totalPnL,
        totalShortTermGains: shortTermGains,
        totalLongTermGains: longTermGains,
        totalLosses,
        netGain: totalPnL,
        estimatedTax,
        trades: tradeReports,
        summary: {
          bestTrade,
          worstTrade,
          avgWin,
          avgLoss,
          profitFactor,
          sharpeRatio,
          maxDrawdown
        }
      };

      tradingLogger.report('TAX_REPORT_GENERATED', {
        year,
        totalTrades: taxReport.totalTrades,
        totalPnL: taxReport.totalPnL,
        estimatedTax: taxReport.estimatedTax
      });

      // Log to audit trail
      auditLogger.info('TAX_REPORT_GENERATED', {
        year,
        totalPnL,
        estimatedTax,
        generatedBy: 'TradeReportingService'
      });

      return taxReport;
    } catch (error) {
      tradingLogger.error('Failed to generate tax report', { year, error });
      throw error;
    }
  }

  /**
   * Generate Form 8949 data for tax filing
   */
  async generateForm8949Data(year: number): Promise<Form8949Data> {
    try {
      const taxReport = await this.generateTaxReport(year);
      const shortTermTrades = taxReport.trades.filter(t => t.shortTerm);
      const longTermTrades = taxReport.trades.filter(t => !t.shortTerm);

      // Process short-term trades
      const shortTermProceeds = shortTermTrades.reduce((sum, t) => sum + t.totalValue, 0);
      const shortTermCostBasis = shortTermTrades.reduce((sum, t) => sum + (t.totalValue - t.pnl - t.fees), 0);
      const shortTermGains = shortTermProceeds - shortTermCostBasis;

      const shortTermFormData = shortTermTrades.map(trade => ({
        description: `${trade.quantity} ${trade.symbol}`,
        dateAcquired: this.formatDateForForm8949(trade.date - (trade.holdingPeriod * 24 * 60 * 60 * 1000)),
        dateSold: this.formatDateForForm8949(trade.date),
        proceeds: trade.totalValue,
        costBasis: trade.totalValue - trade.pnl - trade.fees,
        gain: trade.pnl
      }));

      // Process long-term trades
      const longTermProceeds = longTermTrades.reduce((sum, t) => sum + t.totalValue, 0);
      const longTermCostBasis = longTermTrades.reduce((sum, t) => sum + (t.totalValue - t.pnl - t.fees), 0);
      const longTermGains = longTermProceeds - longTermCostBasis;

      const longTermFormData = longTermTrades.map(trade => ({
        description: `${trade.quantity} ${trade.symbol}`,
        dateAcquired: this.formatDateForForm8949(trade.date - (trade.holdingPeriod * 24 * 60 * 60 * 1000)),
        dateSold: this.formatDateForForm8949(trade.date),
        proceeds: trade.totalValue,
        costBasis: trade.totalValue - trade.pnl - trade.fees,
        gain: trade.pnl
      }));

      const form8949Data: Form8949Data = {
        year,
        shortTerm: {
          proceeds: shortTermProceeds,
          costBasis: shortTermCostBasis,
          gains: shortTermGains,
          trades: shortTermFormData
        },
        longTerm: {
          proceeds: longTermProceeds,
          costBasis: longTermCostBasis,
          gains: longTermGains,
          trades: longTermFormData
        }
      };

      tradingLogger.report('FORM_8949_DATA_GENERATED', {
        year,
        shortTermGains,
        longTermGains,
        totalGains: shortTermGains + longTermGains
      });

      return form8949Data;
    } catch (error) {
      tradingLogger.error('Failed to generate Form 8949 data', { year, error });
      throw error;
    }
  }

  /**
   * Check for wash sale violations
   */
  async checkWashSaleViolations(trade: TradeReport): Promise<{
    isWashSale: boolean;
    affectedTrades: TradeReport[];
    adjustmentAmount: number;
  }> {
    try {
      const thirtyDaysBefore = new Date(trade.date);
      thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - this.WASH_SALE_RULE_DAYS);

      const thirtyDaysAfter = new Date(trade.date);
      thirtyDaysAfter.setDate(thirtyDaysAfter.getDate() + this.WASH_SALE_RULE_DAYS);

      // Find trades that could trigger wash sale rule
      const sql = `
        SELECT * FROM trades
        WHERE symbol = ?
        AND status = 'CLOSED'
        AND close_date BETWEEN ? AND ?
        AND pnl < 0
        AND id != ?
        ORDER BY close_date DESC
      `;

      const rows = db.prepare(sql).all(
        trade.symbol,
        thirtyDaysBefore.toISOString().split('T')[0],
        thirtyDaysAfter.toISOString().split('T')[0],
        trade.id
      ) as any[];

      const affectedTrades: TradeReport[] = [];

      for (const row of rows) {
        const affectedTrade = await this.convertRowToTradeReport(row);
        affectedTrades.push(affectedTrade);
      }

      const isWashSale = affectedTrades.length > 0;
      const adjustmentAmount = isWashSale ? Math.abs(trade.pnl) : 0;

      if (isWashSale) {
        tradingLogger.report('WASH_SALE_DETECTED', {
          tradeId: trade.id,
          symbol: trade.symbol,
          affectedTradesCount: affectedTrades.length,
          adjustmentAmount
        });

        auditLogger.warn('WASH_SALE_VIOLATION', {
          trade,
          affectedTrades,
          adjustmentAmount
        });
      }

      return {
        isWashSale,
        affectedTrades,
        adjustmentAmount
      };
    } catch (error) {
      tradingLogger.error('Failed to check wash sale violations', { tradeId: trade.id, error });
      return {
        isWashSale: false,
        affectedTrades: [],
        adjustmentAmount: 0
      };
    }
  }

  /**
   * Generate compliance report for regulatory purposes
   */
  async generateComplianceReport(startDate: string, endDate: string): Promise<ComplianceReport> {
    try {
      const tradeReports = await this.generateTradeReport(startDate, endDate);
      const auditTrail = await this.getAuditTrailForPeriod(startDate, endDate);

      const totalTrades = tradeReports.length;
      const totalVolume = tradeReports.reduce((sum, t) => sum + t.totalValue, 0);
      const totalFees = tradeReports.reduce((sum, t) => sum + t.fees, 0);

      // Check for compliance violations
      const riskViolations = await this.checkRiskViolations(tradeReports);
      const complianceScore = this.calculateComplianceScore(tradeReports, riskViolations);
      const recommendations = this.generateComplianceRecommendations(riskViolations);

      const report: ComplianceReport = {
        period: `${startDate} to ${endDate}`,
        startDate,
        endDate,
        totalTrades,
        totalVolume,
        totalFees,
        riskViolations,
        complianceScore,
        recommendations,
        auditTrail
      };

      tradingLogger.report('COMPLIANCE_REPORT_GENERATED', {
        period: report.period,
        complianceScore,
        violationsCount: riskViolations.length
      });

      return report;
    } catch (error) {
      tradingLogger.error('Failed to generate compliance report', { startDate, endDate, error });
      throw error;
    }
  }

  /**
   * Export reports in various formats
   */
  async exportReport(report: TaxReport | ComplianceReport, format: 'CSV' | 'JSON' | 'PDF'): Promise<string> {
    try {
      let content = '';

      switch (format) {
        case 'CSV':
          content = this.exportToCSV(report);
          break;
        case 'JSON':
          content = JSON.stringify(report, null, 2);
          break;
        case 'PDF':
          content = await this.exportToPDF(report);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      tradingLogger.report('REPORT_EXPORTED', {
        reportType: 'tax' in report ? 'tax' : 'compliance',
        format,
        contentLength: content.length
      });

      return content;
    } catch (error) {
      tradingLogger.error('Failed to export report', { format, error });
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private initializeReportingTables(): void {
    try {
      // Create audit trail table
      const auditTableSql = `
        CREATE TABLE IF NOT EXISTS audit_trail (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          event TEXT NOT NULL,
          details TEXT,
          severity TEXT NOT NULL,
          user_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      db.prepare(auditTableSql).run();

      // Create trade metadata table for additional reporting data
      const metadataTableSql = `
        CREATE TABLE IF NOT EXISTS trade_metadata (
          trade_id TEXT PRIMARY KEY,
          ai_provider TEXT,
          ai_confidence REAL,
          ai_reasoning TEXT,
          ai_timestamp INTEGER,
          wash_sale_adjustment REAL DEFAULT 0,
          tax_notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (trade_id) REFERENCES trades (id)
        )
      `;

      db.prepare(metadataTableSql).run();

      tradingLogger.report('REPORTING_TABLES_INITIALIZED', {});
    } catch (error) {
      tradingLogger.error('Failed to initialize reporting tables', { error });
    }
  }

  private calculateHoldingPeriod(openDate: string, closeDate: string): number {
    const open = new Date(openDate);
    const close = new Date(closeDate);
    const diffTime = Math.abs(close.getTime() - open.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private calculatePnLPercent(trade: any): number {
    const costBasis = (trade.quantity * trade.price) + (trade.fees || 0);
    return costBasis > 0 ? ((trade.pnl || 0) / costBasis) * 100 : 0;
  }

  private async getAIDecisionData(tradeId: string): Promise<TradeReport['aiDecision']> {
    try {
      const sql = `
        SELECT ai_provider, ai_confidence, ai_reasoning, ai_timestamp
        FROM trade_metadata
        WHERE trade_id = ?
      `;

      const row = db.prepare(sql).get(tradeId) as any;

      return row ? {
        provider: row.ai_provider,
        confidence: row.ai_confidence,
        reasoning: row.ai_reasoning,
        timestamp: row.ai_timestamp
      } : undefined;
    } catch (error) {
      return undefined;
    }
  }

  private calculateSharpeRatio(trades: TradeReport[]): number {
    if (trades.length === 0) return 0;

    const returns = trades.map(t => t.pnlPercent / 100);
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    const riskFreeRate = 0.02; // 2% annual risk-free rate
    const excessReturn = meanReturn - riskFreeRate;

    return stdDev > 0 ? excessReturn / stdDev : 0;
  }

  private async calculateMaxDrawdownForYear(year: number): Promise<number> {
    try {
      const sql = `
        SELECT portfolio_value, timestamp
        FROM portfolio_snapshots
        WHERE strftime('%Y', timestamp) = ?
        ORDER BY timestamp ASC
      `;

      const snapshots = db.prepare(sql).all(year) as any[];
      if (snapshots.length < 2) return 0;

      let maxValue = snapshots[0].portfolio_value;
      let maxDrawdown = 0;

      for (let i = 1; i < snapshots.length; i++) {
        const currentValue = snapshots[i].portfolio_value;
        const drawdown = ((maxValue - currentValue) / maxValue) * 100;

        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }

        if (currentValue > maxValue) {
          maxValue = currentValue;
        }
      }

      return maxDrawdown;
    } catch (error) {
      return 0;
    }
  }

  private formatDateForForm8949(date: string | number): string {
    const d = new Date(date);
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  private async convertRowToTradeReport(row: any): Promise<TradeReport> {
    const holdingPeriod = this.calculateHoldingPeriod(row.open_date, row.close_date);
    const shortTerm = holdingPeriod < this.LONG_TERM_HOLDING_DAYS;
    const aiDecision = await this.getAIDecisionData(row.id);

    return {
      id: row.id,
      date: row.close_date,
      symbol: row.symbol,
      action: row.side,
      quantity: row.quantity,
      price: row.price,
      totalValue: row.quantity * row.price,
      fees: row.fees || 0,
      pnl: row.pnl || 0,
      pnlPercent: this.calculatePnLPercent(row),
      holdingPeriod,
      shortTerm,
      notes: row.notes || '',
      aiDecision
    };
  }

  private async checkRiskViolations(trades: TradeReport[]): Promise<string[]> {
    const violations: string[] = [];

    // Check for excessive day trading
    const tradesPerDay = new Map<string, number>();
    trades.forEach(trade => {
      const date = trade.date;
      tradesPerDay.set(date, (tradesPerDay.get(date) || 0) + 1);
    });

    for (const [date, count] of tradesPerDay) {
      if (count > 10) {
        violations.push(`Excessive trading on ${date}: ${count} trades`);
      }
    }

    // Check for large position sizes
    const maxPositionValue = Math.max(...trades.map(t => t.totalValue));
    if (maxPositionValue > 100000) { // $100k threshold
      violations.push(`Large position detected: $${maxPositionValue.toLocaleString()}`);
    }

    // Check for pattern day trading
    const dayTrades = trades.filter(t => t.holdingPeriod === 0);
    if (dayTrades.length > 4) {
      violations.push(`Pattern day trading detected: ${dayTrades.length} day trades`);
    }

    return violations;
  }

  private calculateComplianceScore(trades: TradeReport[], violations: string[]): number {
    const baseScore = 100;
    const violationPenalty = violations.length * 10;
    const maxScore = Math.max(0, baseScore - violationPenalty);

    // Bonus points for good practices
    let bonusScore = 0;

    // Diversification bonus
    const uniqueSymbols = new Set(trades.map(t => t.symbol)).size;
    if (uniqueSymbols > 5) bonusScore += 5;

    // Documentation bonus
    const tradesWithNotes = trades.filter(t => t.notes.length > 0).length;
    if (tradesWithNotes / trades.length > 0.8) bonusScore += 5;

    // Risk management bonus
    const profitableTrades = trades.filter(t => t.pnl > 0).length;
    if (profitableTrades / trades.length > 0.6) bonusScore += 10;

    return Math.min(100, maxScore + bonusScore);
  }

  private generateComplianceRecommendations(violations: string[]): string[] {
    const recommendations: string[] = [];

    if (violations.some(v => v.includes('Excessive trading'))) {
      recommendations.push('Consider implementing position limits to reduce excessive trading');
    }

    if (violations.some(v => v.includes('Large position'))) {
      recommendations.push('Implement position size limits based on account balance');
    }

    if (violations.some(v => v.includes('Pattern day trading'))) {
      recommendations.push('Monitor day trading activity and consider PDT rules');
    }

    if (violations.length === 0) {
      recommendations.push('Continue maintaining good trading practices');
      recommendations.push('Consider implementing additional risk monitoring tools');
    }

    return recommendations;
  }

  private async getAuditTrailForPeriod(startDate: string, endDate: string): Promise<ComplianceReport['auditTrail']> {
    try {
      const sql = `
        SELECT timestamp, event, details, severity
        FROM audit_trail
        WHERE timestamp BETWEEN ? AND ?
        ORDER BY timestamp DESC
        LIMIT 100
      `;

      const rows = db.prepare(sql).all(startDate, endDate) as any[];

      return rows.map(row => ({
        timestamp: new Date(row.timestamp).getTime(),
        event: row.event,
        details: JSON.parse(row.details || '{}'),
        severity: row.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      }));
    } catch (error) {
      return [];
    }
  }

  private exportToCSV(report: TaxReport | ComplianceReport): string {
    if ('tax' in report) {
      // Tax report CSV
      const taxReport = report as TaxReport;
      let csv = 'Date,Symbol,Action,Quantity,Price,Total Value,Fees,P&L,P&L %,Holding Period,Short Term\n';

      taxReport.trades.forEach(trade => {
        csv += `${trade.date},${trade.symbol},${trade.action},${trade.quantity},${trade.price},`;
        csv += `${trade.totalValue},${trade.fees},${trade.pnl},${trade.pnlPercent.toFixed(2)},`;
        csv += `${trade.holdingPeriod},${trade.shortTerm}\n`;
      });

      return csv;
    } else {
      // Compliance report CSV
      const complianceReport = report as ComplianceReport;
      let csv = 'Period,Total Trades,Total Volume,Total Fees,Compliance Score\n';
      csv += `${complianceReport.period},${complianceReport.totalTrades},${complianceReport.totalVolume},`;
      csv += `${complianceReport.totalFees},${complianceReport.complianceScore}\n`;
      return csv;
    }
  }

  private async exportToPDF(report: TaxReport | ComplianceReport): Promise<string> {
    // Placeholder for PDF generation
    // In a real implementation, this would use a PDF library like jsPDF or Puppeteer
    return `PDF export not yet implemented. Report data:\n\n${JSON.stringify(report, null, 2)}`;
  }
}