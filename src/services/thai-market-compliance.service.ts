/**
 * Thai Market Compliance Service
 *
 * Handles Thai market-specific regulations, compliance requirements,
 * and trading restrictions for Bitkub exchange integration.
 */

import { logger, tradingLogger } from '@/utils/logger';
import { OrderRequest, OrderResponse } from '@/types';

export interface ThaiComplianceRule {
  id: string;
  name: string;
  description: string;
  type: 'RESTRICTION' | 'LIMITATION' | 'REQUIREMENT' | 'WARNING';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
  checkFunction: (order: OrderRequest, context: ComplianceContext) => ComplianceResult;
}

export interface ComplianceContext {
  userId?: string;
  userTier: 'BASIC' | 'VERIFIED' | 'PREMIUM' | 'INSTITUTIONAL';
  currentBalance: { [currency: string]: number };
  dailyTradeVolume: { [symbol: string]: number };
  monthlyTradeVolume: { [symbol: string]: number };
  lastTradeTime?: Date;
  accountAge?: number; // days
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  riskProfile: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
}

export interface ComplianceResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
  requiredActions?: string[];
  additionalData?: any;
}

export interface ThaiTradingLimits {
  daily: {
    maxVolume: number;
    maxTrades: number;
    maxSingleTrade: number;
  };
  monthly: {
    maxVolume: number;
    maxTrades: number;
  };
  annual: {
    maxVolume: number;
    maxProfitThreshold: number; // Tax reporting threshold
  };
  currency: {
    thb: {
      minOrder: number;
      maxOrder: number;
      precision: number;
    };
    crypto: {
      minOrder: number;
      maxDailyVolume: number;
    };
  };
}

export interface ThaiTaxInfo {
  withholdingTax: number;
  capitalGainsTax: number;
  vat: number;
  reportingThreshold: number;
  exemptions: {
    smallInvestor: boolean;
    threshold: number;
  };
}

export interface ThaiMarketHours {
  regular: {
    monday: { open: string; close: string };
    tuesday: { open: string; close: string };
    wednesday: { open: string; close: string };
    thursday: { open: string; close: string };
    friday: { open: string; close: string };
    saturday: { open: string; close: string };
    sunday: { open: string; close: string };
  };
  holidays: Array<{
    date: string;
    name: string;
    type: 'TRADING_CLOSED' | 'EARLY_CLOSE' | 'LIMITED_TRADING';
  }>;
  maintenance: Array<{
    start: string;
    end: string;
    description: string;
  }>;
}

export class ThaiMarketComplianceService {
  private complianceRules: ThaiComplianceRule[] = [];
  private tradingLimits: ThaiTradingLimits;
  private taxInfo: ThaiTaxInfo;
  private marketHours: ThaiMarketHours;

  constructor() {
    this.initializeTradingLimits();
    this.initializeTaxInfo();
    this.initializeMarketHours();
    this.initializeComplianceRules();
  }

  /**
   * Comprehensive compliance check for order
   */
  async checkOrderCompliance(
    order: OrderRequest,
    context: ComplianceContext
  ): Promise<{
    result: ComplianceResult;
    thaiMarketSpecific: {
      tradingHoursCheck: { valid: boolean; message: string };
      volumeLimitsCheck: { valid: boolean; currentVolume: number; limit: number; period: string };
      kycRequirementsCheck: { valid: boolean; requirements: string[] };
      taxImplications: { taxAmount: number; reportingRequired: boolean };
    };
  }> {
    const result: ComplianceResult = {
      passed: true,
      errors: [],
      warnings: [],
      recommendations: [],
    };

    // Thai market specific checks
    const tradingHoursCheck = this.checkTradingHours();
    const volumeLimitsCheck = this.checkVolumeLimits(order, context);
    const kycCheck = this.checkKYCRequirements(order, context);
    const taxImplications = this.calculateTaxImplications(order, context);

    // Run all compliance rules
    for (const rule of this.complianceRules) {
      if (!rule.enabled) continue;

      try {
        const ruleResult = rule.checkFunction(order, context);

        if (!ruleResult.passed) {
          result.passed = false;
          result.errors.push(...ruleResult.errors);
        }

        result.warnings.push(...ruleResult.warnings);
        result.recommendations.push(...ruleResult.recommendations);

        if (ruleResult.requiredActions) {
          if (!result.requiredActions) {
            result.requiredActions = [];
          }
          result.requiredActions.push(...ruleResult.requiredActions);
        }
      } catch (error) {
        logger.error(`Error in compliance rule ${rule.id}:`, error);
        result.warnings.push(`Compliance check failed for rule: ${rule.name}`);
      }
    }

    // Trading hours validation
    if (!tradingHoursCheck.valid) {
      result.passed = false;
      result.errors.push(tradingHoursCheck.message);
    }

    // Volume limits validation
    if (!volumeLimitsCheck.valid) {
      result.passed = false;
      result.errors.push(`Volume limit exceeded: ${volumeLimitsCheck.currentVolume} > ${volumeLimitsCheck.limit} (${volumeLimitsCheck.period})`);
    }

    // KYC validation
    if (!kycCheck.valid) {
      result.passed = false;
      result.errors.push(`KYC requirements not met: ${kycCheck.requirements.join(', ')}`);
    }

    return {
      result,
      thaiMarketSpecific: {
        tradingHoursCheck,
        volumeLimitsCheck,
        kycRequirementsCheck: kycCheck,
        taxImplications,
      },
    };
  }

  /**
   * Post-trade compliance validation
   */
  async validateTradeExecution(
    order: OrderRequest,
    execution: OrderResponse,
    context: ComplianceContext
  ): Promise<{
    valid: boolean;
    issues: string[];
    requiredReporting: string[];
    taxReporting: {
      required: boolean;
      details: any;
    };
  }> {
    const issues: string[] = [];
    const requiredReporting: string[] = [];

    // Check execution time compliance
    const executionTime = new Date(execution.transactTime);
    if (!this.isWithinTradingHours(executionTime)) {
      issues.push('Trade executed outside regular trading hours');
      requiredReporting.push('IRREGULAR_HOURS_TRADE');
    }

    // Check for wash trades (same symbol bought and sold within short timeframe)
    if (context.lastTradeTime) {
      const timeDiff = executionTime.getTime() - context.lastTradeTime.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (hoursDiff < 1 && order.symbol === this.getLastTradedSymbol(context)) {
        issues.push('Potential wash trade detected');
        requiredReporting.push('WASH_TRADE_SUSPICION');
      }
    }

    // Large trade reporting
    const tradeValue = parseFloat(execution.cummulativeQuoteQty);
    if (tradeValue > this.taxInfo.reportingThreshold) {
      requiredReporting.push('LARGE_TRADE_REPORTING');
    }

    // Tax reporting calculation
    const taxReporting = this.calculateTradeTax(execution, context);

    return {
      valid: issues.length === 0,
      issues,
      requiredReporting,
      taxReporting,
    };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    userId: string,
    period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
    startDate: Date,
    endDate: Date
  ): Promise<{
    userId: string;
    period: string;
    startDate: string;
    endDate: string;
    summary: {
      totalTrades: number;
      totalVolume: number;
      totalProfit: number;
      totalTax: number;
      complianceScore: number;
      violations: number;
    };
    details: {
      trades: Array<{
        symbol: string;
        side: string;
        volume: number;
        value: number;
        timestamp: Date;
        compliant: boolean;
        issues: string[];
      }>;
      violations: Array<{
        rule: string;
        description: string;
        timestamp: Date;
        severity: string;
      }>;
      recommendations: string[];
    };
    regulatoryReporting: {
      required: boolean;
      reports: Array<{
        type: string;
        description: string;
        deadline: Date;
      }>;
    };
  }> {
    // This would typically fetch trade data from database
    // For now, returning a template structure

    return {
      userId,
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      summary: {
        totalTrades: 0,
        totalVolume: 0,
        totalProfit: 0,
        totalTax: 0,
        complianceScore: 100,
        violations: 0,
      },
      details: {
        trades: [],
        violations: [],
        recommendations: [],
      },
      regulatoryReporting: {
        required: false,
        reports: [],
      },
    };
  }

  /**
   * Get Thai market trading limits
   */
  getTradingLimits(userTier: string = 'BASIC'): ThaiTradingLimits {
    const baseLimits = { ...this.tradingLimits };

    // Adjust limits based on user tier
    switch (userTier) {
      case 'VERIFIED':
        baseLimits.daily.maxVolume *= 2;
        baseLimits.monthly.maxVolume *= 2;
        break;
      case 'PREMIUM':
        baseLimits.daily.maxVolume *= 5;
        baseLimits.monthly.maxVolume *= 5;
        baseLimits.daily.maxTrades *= 2;
        baseLimits.monthly.maxTrades *= 2;
        break;
      case 'INSTITUTIONAL':
        baseLimits.daily.maxVolume *= 20;
        baseLimits.monthly.maxVolume *= 20;
        baseLimits.daily.maxTrades *= 5;
        baseLimits.monthly.maxTrades *= 5;
        break;
    }

    return baseLimits;
  }

  /**
   * Get tax information
   */
  getTaxInfo(): ThaiTaxInfo {
    return { ...this.taxInfo };
  }

  /**
   * Get market hours
   */
  getMarketHours(): ThaiMarketHours {
    return { ...this.marketHours };
  }

  /**
   * Check if current time is within trading hours
   */
  checkTradingHours(): { valid: boolean; message: string } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentTime = now.getHours() * 60 + now.getMinutes();

    // Map day of week to trading hours
    const dayMap = [
      'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
    ];
    const currentDay = dayMap[dayOfWeek];

    const todayHours = this.marketHours.regular[currentDay as keyof typeof this.marketHours.regular];

    if (!todayHours) {
      return { valid: false, message: 'No trading hours defined for today' };
    }

    const [openHour, openMin] = todayHours.open.split(':').map(Number);
    const [closeHour, closeMin] = todayHours.close.split(':').map(Number);

    const openTime = openHour * 60 + openMin;
    const closeTime = closeHour * 60 + closeMin;

    if (currentTime < openTime || currentTime > closeTime) {
      return { valid: false, message: `Market closed. Trading hours: ${todayHours.open} - ${todayHours.close}` };
    }

    // Check for holidays
    const todayStr = now.toISOString().split('T')[0];
    const holiday = this.marketHours.holidays.find(h => h.date === todayStr);

    if (holiday) {
      return { valid: false, message: `Market closed for holiday: ${holiday.name}` };
    }

    // Check for maintenance
    const maintenance = this.marketHours.maintenance.find(m => {
      const start = new Date(m.start);
      const end = new Date(m.end);
      return now >= start && now <= end;
    });

    if (maintenance) {
      return { valid: false, message: `Market under maintenance: ${maintenance.description}` };
    }

    return { valid: true, message: 'Within trading hours' };
  }

  /**
   * Check volume limits
   */
  private checkVolumeLimits(order: OrderRequest, context: ComplianceContext): {
    valid: boolean;
    currentVolume: number;
    limit: number;
    period: string;
  } {
    const limits = this.getTradingLimits(context.userTier);
    const orderValue = (order.quantity || 0) * (order.price || 0);

    // Check daily limit
    const currentDailyVolume = context.dailyTradeVolume[order.symbol] || 0;
    if (currentDailyVolume + orderValue > limits.daily.maxVolume) {
      return {
        valid: false,
        currentVolume: currentDailyVolume + orderValue,
        limit: limits.daily.maxVolume,
        period: 'daily',
      };
    }

    // Check monthly limit
    const currentMonthlyVolume = context.monthlyTradeVolume[order.symbol] || 0;
    if (currentMonthlyVolume + orderValue > limits.monthly.maxVolume) {
      return {
        valid: false,
        currentVolume: currentMonthlyVolume + orderValue,
        limit: limits.monthly.maxVolume,
        period: 'monthly',
      };
    }

    return {
      valid: true,
      currentVolume: currentDailyVolume + orderValue,
      limit: limits.daily.maxVolume,
      period: 'daily',
    };
  }

  /**
   * Check KYC requirements
   */
  private checkKYCRequirements(order: OrderRequest, context: ComplianceContext): {
    valid: boolean;
    requirements: string[];
  } {
    const requirements: string[] = [];

    // Basic KYC check
    if (context.kycStatus !== 'VERIFIED') {
      requirements.push('KYC verification required');
    }

    // Account age requirement
    if (context.accountAge && context.accountAge < 7) {
      requirements.push('Account must be at least 7 days old for trading');
    }

    // Tier-based requirements
    const orderValue = (order.quantity || 0) * (order.price || 0);
    if (orderValue > 100000 && context.userTier === 'BASIC') {
      requirements.push('Account verification required for trades over 100,000 THB');
    }

    // Large trade requirements
    if (orderValue > 1000000) {
      requirements.push('Additional verification required for trades over 1,000,000 THB');
    }

    return {
      valid: requirements.length === 0,
      requirements,
    };
  }

  /**
   * Calculate tax implications
   */
  private calculateTaxImplications(order: OrderRequest, context: ComplianceContext): {
    taxAmount: number;
    reportingRequired: boolean;
  } {
    const orderValue = (order.quantity || 0) * (order.price || 0);
    let taxAmount = 0;

    // VAT on trading fees (7%)
    const estimatedFee = orderValue * 0.0015; // 0.15% estimated fee
    taxAmount += estimatedFee * this.taxInfo.vat;

    // Withholding tax on profits (15%) - estimated
    // This would be calculated based on actual profit/loss
    const estimatedProfit = orderValue * 0.05; // 5% estimated profit
    taxAmount += estimatedProfit * this.taxInfo.withholdingTax;

    // Check if reporting is required
    const reportingRequired = orderValue > this.taxInfo.reportingThreshold;

    return {
      taxAmount,
      reportingRequired,
    };
  }

  /**
   * Check if time is within trading hours
   */
  private isWithinTradingHours(time: Date): boolean {
    const hoursCheck = this.checkTradingHours();
    return hoursCheck.valid;
  }

  /**
   * Get last traded symbol (simplified)
   */
  private getLastTradedSymbol(context: ComplianceContext): string {
    // This would typically fetch from database
    return 'THB_BTC'; // Placeholder
  }

  /**
   * Calculate trade tax
   */
  private calculateTradeTax(execution: OrderResponse, context: ComplianceContext): {
    required: boolean;
    details: any;
  } {
    const tradeValue = parseFloat(execution.cummulativeQuoteQty);

    return {
      required: tradeValue > this.taxInfo.reportingThreshold,
      details: {
        tradeValue,
        vatAmount: tradeValue * 0.0015 * this.taxInfo.vat,
        withholdingTax: 0, // Would calculate based on actual profit/loss
        reportingThreshold: this.taxInfo.reportingThreshold,
      },
    };
  }

  /**
   * Initialize trading limits
   */
  private initializeTradingLimits(): void {
    this.tradingLimits = {
      daily: {
        maxVolume: 5000000, // 5M THB daily limit for basic users
        maxTrades: 50,
        maxSingleTrade: 500000, // 500K THB max single trade
      },
      monthly: {
        maxVolume: 50000000, // 50M THB monthly limit
        maxTrades: 1000,
      },
      annual: {
        maxVolume: 500000000, // 500M THB annual limit
        maxProfitThreshold: 200000, // 200K THB profit reporting threshold
      },
      currency: {
        thb: {
          minOrder: 100, // 100 THB minimum order
          maxOrder: 5000000, // 5M THB maximum order
          precision: 2, // 2 decimal places
        },
        crypto: {
          minOrder: 0.000001, // Minimum crypto amount
          maxDailyVolume: 1000000, // 1M THB equivalent max daily crypto volume
        },
      },
    };
  }

  /**
   * Initialize tax information
   */
  private initializeTaxInfo(): void {
    this.taxInfo = {
      withholdingTax: 0.15, // 15% withholding tax on investment gains
      capitalGainsTax: 0, // No capital gains tax in Thailand for individuals
      vat: 0.07, // 7% VAT on services and fees
      reportingThreshold: 200000, // 200K THB annual profit reporting threshold
      exemptions: {
        smallInvestor: true,
        threshold: 100000, // 100K THB exemption for small investors
      },
    };
  }

  /**
   * Initialize market hours
   */
  private initializeMarketHours(): void {
    this.marketHours = {
      regular: {
        monday: { open: '10:00', close: '22:00' },
        tuesday: { open: '10:00', close: '22:00' },
        wednesday: { open: '10:00', close: '22:00' },
        thursday: { open: '10:00', close: '22:00' },
        friday: { open: '10:00', close: '22:00' },
        saturday: { open: '10:00', close: '22:00' },
        sunday: { open: '10:00', close: '22:00' },
      },
      holidays: [
        // Thai holidays would be listed here
        // { date: '2024-01-01', name: 'New Year\'s Day', type: 'TRADING_CLOSED' },
      ],
      maintenance: [
        // Scheduled maintenance windows
        // { start: '2024-01-01T02:00:00Z', end: '2024-01-01T04:00:00Z', description: 'System maintenance' },
      ],
    };
  }

  /**
   * Initialize compliance rules
   */
  private initializeComplianceRules(): void {
    this.complianceRules = [
      {
        id: 'thb_currency_only',
        name: 'THB Currency Requirement',
        description: 'Thai market trades must involve THB currency',
        type: 'RESTRICTION',
        severity: 'CRITICAL',
        enabled: true,
        checkFunction: (order: OrderRequest) => ({
          passed: order.symbol.includes('THB'),
          errors: order.symbol.includes('THB') ? [] : ['Thai market trades must involve THB currency'],
          warnings: [],
          recommendations: order.symbol.includes('THB') ? [] : ['Choose a symbol that involves THB currency'],
        }),
      },
      {
        id: 'minimum_order_size',
        name: 'Minimum Order Size',
        description: 'Minimum order size requirement',
        type: 'LIMITATION',
        severity: 'HIGH',
        enabled: true,
        checkFunction: (order: OrderRequest) => {
          const orderValue = (order.quantity || 0) * (order.price || 0);
          const minValue = this.tradingLimits.currency.thb.minOrder;

          return {
            passed: orderValue >= minValue,
            errors: orderValue >= minValue ? [] : [`Order value ${orderValue} THB is below minimum ${minValue} THB`],
            warnings: [],
            recommendations: orderValue >= minValue ? [] : [`Increase order to at least ${minValue} THB`],
          };
        },
      },
      {
        id: 'trading_frequency_limit',
        name: 'Trading Frequency Limit',
        description: 'Limit on number of trades per day',
        type: 'LIMITATION',
        severity: 'MEDIUM',
        enabled: true,
        checkFunction: (order: OrderRequest, context: ComplianceContext) => {
          const todayTrades = Object.values(context.dailyTradeVolume).filter(v => v > 0).length;
          const maxTrades = this.tradingLimits.daily.maxTrades;

          return {
            passed: todayTrades < maxTrades,
            errors: todayTrades < maxTrades ? [] : [`Daily trade limit (${maxTrades}) exceeded`],
            warnings: todayTrades >= maxTrades * 0.8 ? [`Approaching daily trade limit (${todayTrades}/${maxTrades})`] : [],
            recommendations: todayTrades < maxTrades ? [] : ['Wait until next trading day or upgrade account tier'],
          };
        },
      },
      {
        id: 'account_age_requirement',
        name: 'Account Age Requirement',
        description: 'Minimum account age for trading',
        type: 'REQUIREMENT',
        severity: 'HIGH',
        enabled: true,
        checkFunction: (order: OrderRequest, context: ComplianceContext) => {
          const minAge = 7; // 7 days
          const accountAge = context.accountAge || 0;

          return {
            passed: accountAge >= minAge,
            errors: accountAge >= minAge ? [] : [`Account must be at least ${minAge} days old (${accountAge} days)`],
            warnings: [],
            recommendations: accountAge >= minAge ? [] : ['Wait for account to age or contact support'],
          };
        },
      },
      {
        id: 'large_trade_warning',
        name: 'Large Trade Warning',
        description: 'Warning for unusually large trades',
        type: 'WARNING',
        severity: 'LOW',
        enabled: true,
        checkFunction: (order: OrderRequest) => {
          const orderValue = (order.quantity || 0) * (order.price || 0);
          const largeTradeThreshold = 100000; // 100K THB

          return {
            passed: true,
            errors: [],
            warnings: orderValue > largeTradeThreshold ? [`Large trade detected: ${orderValue} THB`] : [],
            recommendations: orderValue > largeTradeThreshold ? ['Consider breaking into smaller orders for better execution'] : [],
          };
        },
      },
    ];
  }
}

export default ThaiMarketComplianceService;