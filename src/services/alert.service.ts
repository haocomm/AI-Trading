import axios from 'axios';
import { alertConfig, tradingConfig } from '@/config';
import { tradingLogger, logError } from '@/utils/logger';

interface AlertData {
  type: 'TRADE' | 'POSITION' | 'RISK' | 'SYSTEM' | 'AI_DECISION' | 'DAILY_SUMMARY';
  title: string;
  message: string;
  data?: any;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: number;
}

interface TradeAlert {
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  orderId?: string;
  confidence?: number;
  reasoning?: string;
}

interface PositionAlert {
  symbol: string;
  action: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  reason: string;
}

export class AlertService {
  private isEnabled: boolean;
  private lastDailySummary = new Date().toDateString();
  private dailyPnL = 0;
  private dailyTrades = 0;

  constructor() {
    this.isEnabled = !!(alertConfig.webhookUrl || alertConfig.email.to);
  }

  // Main alert method
  async sendAlert(alertData: AlertData): Promise<boolean> {
    try {
      if (!this.isEnabled) {
        logger.debug('Alerts disabled - skipping notification');
        return false;
      }

      const alertMessage = this.formatAlertMessage(alertData);

      // Send webhook alert if configured
      let webhookSuccess = false;
      if (alertConfig.webhookUrl) {
        webhookSuccess = await this.sendWebhookAlert(alertData, alertMessage);
      }

      // Send email alert if configured
      let emailSuccess = false;
      if (alertConfig.email.to && alertConfig.email.smtpHost) {
        emailSuccess = await this.sendEmailAlert(alertData, alertMessage);
      }

      const success = webhookSuccess || emailSuccess;

      if (success) {
        tradingLogger.alert(alertData.type, alertData.title, alertData.data);
      }

      return success;
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Alert sending failed'), { alertData });
      return false;
    }
  }

  // Trade execution alerts
  async sendTradeAlert(tradeData: TradeAlert): Promise<boolean> {
    const alertData: AlertData = {
      type: 'TRADE',
      title: `Trade Executed: ${tradeData.symbol} ${tradeData.action}`,
      message: this.formatTradeMessage(tradeData),
      data: tradeData,
      priority: 'HIGH',
      timestamp: Date.now(),
    };

    return this.sendAlert(alertData);
  }

  // Position management alerts
  async sendPositionAlert(positionData: PositionAlert): Promise<boolean> {
    const alertData: AlertData = {
      type: 'POSITION',
      title: `Position ${positionData.action}: ${positionData.symbol}`,
      message: this.formatPositionMessage(positionData),
      data: positionData,
      priority: Math.abs(positionData.pnl) > 100 ? 'HIGH' : 'MEDIUM',
      timestamp: Date.now(),
    };

    return this.sendAlert(alertData);
  }

  // Risk management alerts
  async sendRiskAlert(riskType: string, details: any): Promise<boolean> {
    const alertData: AlertData = {
      type: 'RISK',
      title: `Risk Management: ${riskType}`,
      message: this.formatRiskMessage(riskType, details),
      data: { riskType, details },
      priority: 'CRITICAL',
      timestamp: Date.now(),
    };

    return this.sendAlert(alertData);
  }

  // AI decision alerts
  async sendAIAlert(symbol: string, action: string, confidence: number, reasoning: string): Promise<boolean> {
    const alertData: AlertData = {
      type: 'AI_DECISION',
      title: `AI Decision: ${symbol} ${action}`,
      message: this.formatAIMessage(symbol, action, confidence, reasoning),
      data: { symbol, action, confidence, reasoning },
      priority: confidence > 0.8 ? 'HIGH' : confidence > 0.6 ? 'MEDIUM' : 'LOW',
      timestamp: Date.now(),
    };

    return this.sendAlert(alertData);
  }

  // Daily summary alerts
  async sendDailySummary(): Promise<boolean> {
    try {
      const today = new Date().toDateString();

      if (today === this.lastDailySummary) {
        logger.debug('Daily summary already sent today');
        return false;
      }

      const alertData: AlertData = {
        type: 'DAILY_SUMMARY',
        title: `Daily Trading Summary - ${today}`,
        message: this.formatDailySummary(),
        data: {
          date: today,
          dailyPnL: this.dailyPnL,
          dailyTrades: this.dailyTrades,
        },
        priority: 'LOW',
        timestamp: Date.now(),
      };

      const success = await this.sendAlert(alertData);

      if (success) {
        this.lastDailySummary = today;
        this.dailyPnL = 0;
        this.dailyTrades = 0;
      }

      return success;
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Daily summary failed'), { });
      return false;
    }
  }

  // System error alerts
  async sendSystemAlert(error: Error, context?: any): Promise<boolean> {
    const alertData: AlertData = {
      type: 'SYSTEM',
      title: 'System Error',
      message: this.formatSystemMessage(error, context),
      data: { error: error.message, context },
      priority: 'CRITICAL',
      timestamp: Date.now(),
    };

    return this.sendAlert(alertData);
  }

  // Private webhook implementation
  private async sendWebhookAlert(alertData: AlertData, message: string): Promise<boolean> {
    try {
      if (!alertConfig.webhookUrl) return false;

      const payload = {
        embeds: [{
          title: alertData.title,
          description: message,
          color: this.getAlertColor(alertData.priority),
          fields: this.formatAlertFields(alertData),
          timestamp: new Date(alertData.timestamp).toISOString(),
        }],
      };

      const response = await axios.post(alertConfig.webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      return response.status === 204 || response.status === 200;
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Webhook alert failed'), { alertData });
      return false;
    }
  }

  // Private email implementation
  private async sendEmailAlert(alertData: AlertData, message: string): Promise<boolean> {
    try {
      if (!alertConfig.email.smtpHost || !alertConfig.email.to) return false;

      const emailContent = {
        to: alertConfig.email.to,
        subject: `[AI Trading Bot] ${alertData.title}`,
        text: message,
        html: this.formatHTMLEmail(alertData, message),
      };

      // In a real implementation, this would use an email service like nodemailer
      logger.info('Email alert would be sent', {
        to: alertConfig.email.to,
        subject: emailContent.subject,
      });

      return true; // Simulate success
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Email alert failed'), { alertData });
      return false;
    }
  }

  // Message formatting methods
  private formatAlertMessage(alertData: AlertData): string {
    let message = `**${alertData.title}**\n\n${alertData.message}`;

    if (alertData.timestamp) {
      message += `\n\n*Time: ${new Date(alertData.timestamp).toISOString()}*`;
    }

    if (alertData.priority) {
      message += `\n\n*Priority: ${alertData.priority}*`;
    }

    return message;
  }

  private formatTradeMessage(trade: TradeAlert): string {
    let message = `**Trade Executed**\n\n`;
    message += `**Symbol**: ${trade.symbol}\n`;
    message += `**Action**: ${trade.action}\n`;
    message += `**Quantity**: ${trade.quantity}\n`;
    message += `**Price**: $${trade.price.toLocaleString()}\n`;

    if (trade.orderId) {
      message += `**Order ID**: ${trade.orderId}\n`;
    }

    if (trade.confidence !== undefined) {
      message += `**AI Confidence**: ${(trade.confidence * 100).toFixed(1)}%\n`;
    }

    if (trade.reasoning) {
      message += `**AI Reasoning**: ${trade.reasoning}\n`;
    }

    return message;
  }

  private formatPositionMessage(position: PositionAlert): string {
    let message = `**Position ${position.action}**\n\n`;
    message += `**Symbol**: ${position.symbol}\n`;
    message += `**Quantity**: ${position.quantity}\n`;
    message += `**Entry Price**: $${position.entryPrice.toLocaleString()}\n`;
    message += `**Current Price**: $${position.currentPrice.toLocaleString()}\n`;
    message += `**P&L**: $${position.pnl.toFixed(2)} ${position.pnl >= 0 ? '✅' : '❌'}\n`;
    message += `**Reason**: ${position.reason}\n`;

    return message;
  }

  private formatRiskMessage(riskType: string, details: any): string {
    let message = `**Risk Management Alert**\n\n`;
    message += `**Type**: ${riskType}\n`;

    if (typeof details === 'object') {
      Object.entries(details).forEach(([key, value]) => {
        message += `**${key}**: ${value}\n`;
      });
    } else {
      message += `**Details**: ${details}\n`;
    }

    message += `\n**Immediate Action Required** ⚠️`;

    return message;
  }

  private formatAIMessage(symbol: string, action: string, confidence: number, reasoning: string): string {
    let message = `**AI Trading Decision**\n\n`;
    message += `**Symbol**: ${symbol}\n`;
    message += `**Action**: ${action}\n`;
    message += `**Confidence**: ${(confidence * 100).toFixed(1)}%\n`;
    message += `**Reasoning**: ${reasoning}\n`;

    const confidenceEmoji = confidence > 0.8 ? '🟢' : confidence > 0.6 ? '🟡' : '🔴';
    message += `**Signal Strength**: ${confidenceEmoji}\n`;

    return message;
  }

  private formatDailySummary(): string {
    let message = `**Daily Trading Summary**\n\n`;
    message += `**Date**: ${new Date().toDateString()}\n`;
    message += `**Total P&L**: $${this.dailyPnL.toFixed(2)} ${this.dailyPnL >= 0 ? '✅' : '❌'}\n`;
    message += `**Total Trades**: ${this.dailyTrades}\n`;

    if (this.dailyPnL > 0) {
      message += `\n**Great day! Keep it up! 🎉**`;
    } else if (this.dailyPnL < 0) {
      message += `\n**Tough day. Tomorrow's a new one! 💪**`;
    } else {
      message += `\n**Breakeven day. Stay consistent! 📊**`;
    }

    return message;
  }

  private formatSystemMessage(error: Error, context?: any): string {
    let message = `**System Error**\n\n`;
    message += `**Error**: ${error.message}\n`;

    if (error.stack) {
      message += `**Stack**: ${error.stack}\n`;
    }

    if (context) {
      message += `**Context**: ${JSON.stringify(context, null, 2)}\n`;
    }

    message += `\n**Please check the system immediately** 🔴`;

    return message;
  }

  private formatAlertFields(alertData: AlertData): any[] {
    const fields: any[] = [];

    if (alertData.data) {
      Object.entries(alertData.data).forEach(([key, value]) => {
        if (typeof value === 'number') {
          fields.push({
            name: key,
            value: value.toLocaleString(),
            inline: true,
          });
        } else {
          fields.push({
            name: key,
            value: String(value),
            inline: true,
          });
        }
      });
    }

    return fields;
  }

  private formatHTMLEmail(alertData: AlertData, textMessage: string): string {
    const color = this.getAlertColor(alertData.priority);

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${color}; color: white; padding: 20px; border-radius: 5px;">
          <h1 style="margin: 0; font-size: 24px;">${alertData.title}</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #ddd; border-top: none;">
          <div style="white-space: pre-line; line-height: 1.5;">${textMessage}</div>
        </div>
        <div style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; margin-top: 10px;">
          <small style="color: #666;">
            Sent by AI Trading Bot at ${new Date(alertData.timestamp).toLocaleString()}
          </small>
        </div>
      </div>
    `;
  }

  private getAlertColor(priority: string): string {
    switch (priority) {
      case 'CRITICAL': return '#FF0000';
      case 'HIGH': return '#FF6B6B';
      case 'MEDIUM': return '#FFA500';
      case 'LOW': return '#28A745';
      default: return '#007BFF';
    }
  }

  // Update daily tracking
  updateDailyStats(pnl: number, trades: number): void {
    this.dailyPnL += pnl;
    this.dailyTrades += trades;
  }

  // Health check
  async healthCheck(): Promise<{
    status: string;
    enabled: boolean;
    webhookConfigured: boolean;
    emailConfigured: boolean;
    lastDailySummary: string;
  }> {
    return {
      status: this.isEnabled ? 'enabled' : 'disabled',
      enabled: this.isEnabled,
      webhookConfigured: !!alertConfig.webhookUrl,
      emailConfigured: !!(alertConfig.email.smtpHost && alertConfig.email.to),
      lastDailySummary: this.lastDailySummary,
    };
  }
}

export default AlertService;