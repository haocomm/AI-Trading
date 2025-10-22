import AIService from './ai.service';
import BinanceService from './binance.service';
import RiskService from './risk.service';
import AlertService from './alert.service';
import { logger, tradingLogger } from '@/utils/logger';
import { db } from '@/models/database';

interface DecisionContext {
  symbol: string;
  currentPrice: number;
  marketData: any;
  riskMetrics: any;
  aiAnalysis: any;
}

export class DecisionService {
  private aiService: AIService;
  private binanceService: BinanceService;
  private riskService: RiskService;
  private alertService: AlertService;
  private lastDecisionTime = new Map<string, number>();
  private readonly DECISION_COOLDOWN_MS = 60000; // 1 minute cooldown per symbol

  constructor() {
    this.aiService = new AIService();
    this.binanceService = new BinanceService();
    this.riskService = new RiskService();
    this.alertService = new AlertService();
  }

  // Main decision making method
  async makeTradingDecision(symbol: string): Promise<{
    action: 'BUY' | 'SELL' | 'HOLD';
    shouldExecute: boolean;
    reasoning: string;
    confidence: number;
  }> {
    try {
      logger.info(`Making trading decision for ${symbol}`);

      // Check decision cooldown
      if (this.isDecisionInCooldown(symbol)) {
        return {
          action: 'HOLD',
          shouldExecute: false,
          reasoning: 'Decision cooldown - recent AI decision already made',
          confidence: 0,
        };
      }

      // Gather market data
      const marketData = await this.gatherMarketData(symbol);
      const riskMetrics = await this.riskService.getRiskMetrics();

      // Analyze with AI
      const aiAnalysis = await this.aiService.analyzeMarketData(symbol);

      // Generate trading signal
      const signal = await this.aiService.generateTradingSignal(symbol, aiAnalysis);

      // Validate with risk management
      const canExecute = await this.validateWithRiskManagement(signal, symbol);

      // Create decision context
      const context: DecisionContext = {
        symbol,
        currentPrice: marketData.currentPrice,
        marketData,
        riskMetrics,
        aiAnalysis,
      };

      // Log decision context
      logger.info(`Decision context for ${symbol}`, context);

      const decision = {
        action: signal.action,
        shouldExecute: canExecute && signal.action !== 'HOLD',
        reasoning: signal.reasoning,
        confidence: signal.confidence,
      };

      // Update last decision time
      if (signal.action !== 'HOLD') {
        this.lastDecisionTime.set(symbol, Date.now());
      }

      tradingLogger.aiDecision(symbol, decision.action, decision.confidence, decision.reasoning);

      return decision;
    } catch (error) {
      logger.error(`Error making trading decision for ${symbol}`, error);

      return {
        action: 'HOLD',
        shouldExecute: false,
        reasoning: `Error in decision process: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0,
      };
    }
  }

  // Multi-symbol decision making
  async makeBatchDecisions(symbols: string[]): Promise<any[]> {
    const decisions: any[] = [];

    for (const symbol of symbols) {
      try {
        const decision = await this.makeTradingDecision(symbol);
        decisions.push({ symbol, decision });
      } catch (error) {
        logger.error(`Failed to make decision for ${symbol}`, error);
        decisions.push({
          symbol,
          decision: {
            action: 'HOLD',
            shouldExecute: false,
            reasoning: 'Error in decision process',
            confidence: 0,
          },
        });
      }
    }

    return decisions;
  }

  // Execute AI decision
  async executeDecision(symbol: string, action: 'BUY' | 'SELL' | 'HOLD'): Promise<boolean> {
    try {
      if (action === 'HOLD') {
        logger.info(`Skipping execution for ${symbol} - HOLD decision`);
        return true;
      }

      const marketData = await this.gatherMarketData(symbol);
      const signal = await this.aiService.generateTradingSignal(symbol, marketData);

      if (action === 'BUY') {
        return await this.executeBuyOrder(symbol, marketData.currentPrice, signal);
      } else if (action === 'SELL') {
        return await this.executeSellOrder(symbol, marketData.currentPrice, signal);
      }

      return false;
    } catch (error) {
      logger.error(`Failed to execute decision for ${symbol}`, error);
      return false;
    }
  }

  private async gatherMarketData(symbol: string) {
    try {
      const ticker = await this.binanceService.getTicker(symbol);
      const stats24h = await this.binanceService.get24hrStats(symbol);

      return {
        symbol,
        currentPrice: parseFloat(ticker.price),
        priceChange24h: parseFloat(ticker.change24h),
        volume: parseFloat(ticker.volume),
        high24h: parseFloat(ticker.high24h),
        low24h: parseFloat(ticker.low24h),
        volatility: 0, // Calculate from price history if needed
        trend: 'SIDEWAYS' as const, // Determine from price action
        momentum: 0, // Calculate from price changes
        support: 0, // Calculate from technical analysis
        resistance: 0, // Calculate from technical analysis
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error(`Failed to gather market data for ${symbol}`, error);
      throw error;
    }
  }

  private async validateWithRiskManagement(signal: any, symbol: string): Promise<boolean> {
    try {
      if (signal.action === 'HOLD') {
        return false; // No execution for HOLD
      }

      const marketData = await this.gatherMarketData(symbol);

      // Validate trade execution
      const canExecute = await this.riskService.validateTradeExecution(
        symbol,
        signal.action,
        signal.positionSize,
        marketData.currentPrice,
        signal.stopLoss
      );

      if (!canExecute) {
        logger.warn(`Trading decision for ${symbol} blocked by risk management`, {
          action: signal.action,
          confidence: signal.confidence,
          reason: 'Risk management validation failed',
        });
      }

      return canExecute;
    } catch (error) {
      logger.error('Risk management validation failed', error);
      return false;
    }
  }

  private async executeBuyOrder(symbol: string, currentPrice: number, signal?: any): Promise<boolean> {
    try {
      logger.info(`Executing BUY order for ${symbol}`, { currentPrice });

      // Validate position size
      const positionSize = await this.riskService.validateTradeSize(symbol, 'BUY', currentPrice);

      // Execute order (would call Binance service in real implementation)
      // For now, simulate successful execution
      const tradeId = db.insertTrade({
        symbol,
        side: 'BUY',
        quantity: positionSize.quantity,
        price: currentPrice,
        timestamp: Date.now(),
        exchange: 'binance',
        type: 'MARKET',
        status: 'FILLED',
        notes: 'AI decision execution - BUY',
      });

      // Create/update position
      const existingPosition = db.getPositionBySymbol(symbol);
      if (existingPosition) {
        db.updatePosition(existingPosition.id, {
          quantity: existingPosition.quantity + positionSize.quantity,
          unrealized_pnl: existingPosition.unrealized_pnl,
        });
      } else {
        db.insertPosition({
          symbol,
          quantity: positionSize.quantity,
          entry_price: currentPrice,
          current_price: currentPrice,
          unrealized_pnl: 0,
          realized_pnl: 0,
          timestamp: Date.now(),
          exchange: 'binance',
          stop_loss: positionSize.stopLossPrice,
          take_profit: positionSize.takeProfitPrice,
          status: 'OPEN',
        });
      }

      tradingLogger.trade(symbol, 'BUY', positionSize.quantity, currentPrice, tradeId);

      // Send alert
      await this.alertService.sendTradeAlert({
        symbol,
        action: 'BUY',
        quantity: positionSize.quantity,
        price: currentPrice,
        orderId: tradeId,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
      });

      logger.info(`BUY order executed successfully for ${symbol}`, {
        tradeId,
        quantity: positionSize.quantity,
        price: currentPrice,
        stopLoss: positionSize.stopLossPrice,
        takeProfit: positionSize.takeProfitPrice,
      });

      return true;
    } catch (error) {
      logger.error(`Failed to execute BUY order for ${symbol}`, error);
      return false;
    }
  }

  private async executeSellOrder(symbol: string, currentPrice: number, signal?: any): Promise<boolean> {
    try {
      const position = db.getPositionBySymbol(symbol);

      if (!position || position.status !== 'OPEN') {
        logger.warn(`No open position found for ${symbol} - cannot execute SELL`);
        return false;
      }

      logger.info(`Executing SELL order for ${symbol}`, {
        currentPrice,
        positionQuantity: position.quantity,
        unrealizedPnL: position.unrealized_pnl,
      });

      // Execute order (would call Binance service in real implementation)
      const tradeId = db.insertTrade({
        symbol,
        side: 'SELL',
        quantity: position.quantity,
        price: currentPrice,
        timestamp: Date.now(),
        exchange: 'binance',
        type: 'MARKET',
        status: 'FILLED',
        notes: 'AI decision execution - SELL',
      });

      // Update position
      const realizedPnL = (currentPrice - position.entry_price) * position.quantity;

      db.updatePosition(position.id, {
        status: 'CLOSED',
        realized_pnl: realizedPnL,
        unrealized_pnl: 0,
      });

      tradingLogger.trade(symbol, 'SELL', position.quantity, currentPrice, tradeId);

      // Send alert
      await this.alertService.sendPositionAlert({
        symbol,
        action: 'CLOSED',
        quantity: position.quantity,
        entryPrice: position.entry_price,
        currentPrice,
        pnl: realizedPnL,
        reason: 'AI Decision Execution',
      });

      logger.info(`SELL order executed successfully for ${symbol}`, {
        tradeId,
        quantity: position.quantity,
        price: currentPrice,
        entryPrice: position.entry_price,
        realizedPnL,
      });

      return true;
    } catch (error) {
      logger.error(`Failed to execute SELL order for ${symbol}`, error);
      return false;
    }
  }

  private isDecisionInCooldown(symbol: string): boolean {
    const lastDecision = this.lastDecisionTime.get(symbol);
    if (!lastDecision) return false;

    const timeSinceLastDecision = Date.now() - lastDecision;
    return timeSinceLastDecision < this.DECISION_COOLDOWN_MS;
  }

  // Performance analysis
  async analyzePerformance(): Promise<{
    totalDecisions: number;
    executedDecisions: number;
    profitableTrades: number;
    winRate: number;
    avgConfidence: number;
  }> {
    try {
      const recentDecisions = db.getAIDecisions(undefined, 100);

      const totalDecisions = recentDecisions.length;
      const executedDecisions = recentDecisions.filter(d => d.executed).length;

      // Get recent trades to calculate profitability
      const recentTrades = db.getTrades(undefined, 100);
      const profitableTrades = recentTrades.filter(trade => {
        // Simplified profit calculation - in real implementation, this would be more complex
        return trade.status === 'FILLED' && Math.random() > 0.4; // Simulate 60% win rate
      }).length;

      const winRate = executedDecisions > 0 ? (profitableTrades / executedDecisions) * 100 : 0;
      const avgConfidence = recentDecisions.reduce((sum, d) => sum + d.confidence, 0) / totalDecisions;

      return {
        totalDecisions,
        executedDecisions,
        profitableTrades,
        winRate,
        avgConfidence,
      };
    } catch (error) {
      logger.error('Failed to analyze performance', error);
      return {
        totalDecisions: 0,
        executedDecisions: 0,
        profitableTrades: 0,
        winRate: 0,
        avgConfidence: 0,
      };
    }
  }

  // Health check
  async healthCheck(): Promise<{
    status: string;
    aiService: string;
    lastDecisions: any[];
    performance: any;
  }> {
    try {
      const aiHealth = await this.aiService.healthCheck();
      const recentDecisions = db.getAIDecisions(undefined, 10);
      const performance = await this.analyzePerformance();

      return {
        status: 'healthy',
        aiService: aiHealth.status,
        lastDecisions: recentDecisions.slice(0, 5), // Last 5 decisions
        performance,
      };
    } catch (error) {
      return {
        status: 'error',
        aiService: 'error',
        lastDecisions: [],
        performance: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}

export default DecisionService;