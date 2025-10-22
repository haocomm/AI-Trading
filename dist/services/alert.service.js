"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertService = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
class AlertService {
    constructor() {
        this.lastDailySummary = new Date().toDateString();
        this.dailyPnL = 0;
        this.dailyTrades = 0;
        this.isEnabled = !!(config_1.alertConfig.webhookUrl || config_1.alertConfig.email.to);
    }
    async sendAlert(alertData) {
        try {
            if (!this.isEnabled) {
                logger_1.logger.debug('Alerts disabled - skipping notification');
                return false;
            }
            const alertMessage = this.formatAlertMessage(alertData);
            let webhookSuccess = false;
            if (config_1.alertConfig.webhookUrl) {
                webhookSuccess = await this.sendWebhookAlert(alertData, alertMessage);
            }
            let emailSuccess = false;
            if (config_1.alertConfig.email.to && config_1.alertConfig.email.smtpHost) {
                emailSuccess = await this.sendEmailAlert(alertData, alertMessage);
            }
            const success = webhookSuccess || emailSuccess;
            if (success) {
                logger_1.tradingLogger.alert(alertData.type, alertData.title, alertData.data);
            }
            return success;
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Alert sending failed'), { alertData });
            return false;
        }
    }
    async sendTradeAlert(tradeData) {
        const alertData = {
            type: 'TRADE',
            title: `Trade Executed: ${tradeData.symbol} ${tradeData.action}`,
            message: this.formatTradeMessage(tradeData),
            data: tradeData,
            priority: 'HIGH',
            timestamp: Date.now(),
        };
        return this.sendAlert(alertData);
    }
    async sendPositionAlert(positionData) {
        const alertData = {
            type: 'POSITION',
            title: `Position ${positionData.action}: ${positionData.symbol}`,
            message: this.formatPositionMessage(positionData),
            data: positionData,
            priority: Math.abs(positionData.pnl) > 100 ? 'HIGH' : 'MEDIUM',
            timestamp: Date.now(),
        };
        return this.sendAlert(alertData);
    }
    async sendRiskAlert(riskType, details) {
        const alertData = {
            type: 'RISK',
            title: `Risk Management: ${riskType}`,
            message: this.formatRiskMessage(riskType, details),
            data: { riskType, details },
            priority: 'CRITICAL',
            timestamp: Date.now(),
        };
        return this.sendAlert(alertData);
    }
    async sendAIAlert(symbol, action, confidence, reasoning) {
        const alertData = {
            type: 'AI_DECISION',
            title: `AI Decision: ${symbol} ${action}`,
            message: this.formatAIMessage(symbol, action, confidence, reasoning),
            data: { symbol, action, confidence, reasoning },
            priority: confidence > 0.8 ? 'HIGH' : confidence > 0.6 ? 'MEDIUM' : 'LOW',
            timestamp: Date.now(),
        };
        return this.sendAlert(alertData);
    }
    async sendDailySummary() {
        try {
            const today = new Date().toDateString();
            if (today === this.lastDailySummary) {
                logger_1.logger.debug('Daily summary already sent today');
                return false;
            }
            const alertData = {
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
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Daily summary failed'), {});
            return false;
        }
    }
    async sendSystemAlert(error, context) {
        const alertData = {
            type: 'SYSTEM',
            title: 'System Error',
            message: this.formatSystemMessage(error, context),
            data: { error: error.message, context },
            priority: 'CRITICAL',
            timestamp: Date.now(),
        };
        return this.sendAlert(alertData);
    }
    async sendWebhookAlert(alertData, message) {
        try {
            if (!config_1.alertConfig.webhookUrl)
                return false;
            const payload = {
                embeds: [{
                        title: alertData.title,
                        description: message,
                        color: this.getAlertColor(alertData.priority),
                        fields: this.formatAlertFields(alertData),
                        timestamp: new Date(alertData.timestamp).toISOString(),
                    }],
            };
            const response = await axios_1.default.post(config_1.alertConfig.webhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            });
            return response.status === 204 || response.status === 200;
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Webhook alert failed'), { alertData });
            return false;
        }
    }
    async sendEmailAlert(alertData, message) {
        try {
            if (!config_1.alertConfig.email.smtpHost || !config_1.alertConfig.email.to)
                return false;
            const emailContent = {
                to: config_1.alertConfig.email.to,
                subject: `[AI Trading Bot] ${alertData.title}`,
                text: message,
                html: this.formatHTMLEmail(alertData, message),
            };
            logger_1.logger.info('Email alert would be sent', {
                to: config_1.alertConfig.email.to,
                subject: emailContent.subject,
            });
            return true;
        }
        catch (error) {
            (0, logger_1.logError)(error instanceof Error ? error : new Error('Email alert failed'), { alertData });
            return false;
        }
    }
    formatAlertMessage(alertData) {
        let message = `**${alertData.title}**\n\n${alertData.message}`;
        if (alertData.timestamp) {
            message += `\n\n*Time: ${new Date(alertData.timestamp).toISOString()}*`;
        }
        if (alertData.priority) {
            message += `\n\n*Priority: ${alertData.priority}*`;
        }
        return message;
    }
    formatTradeMessage(trade) {
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
    formatPositionMessage(position) {
        let message = `**Position ${position.action}**\n\n`;
        message += `**Symbol**: ${position.symbol}\n`;
        message += `**Quantity**: ${position.quantity}\n`;
        message += `**Entry Price**: $${position.entryPrice.toLocaleString()}\n`;
        message += `**Current Price**: $${position.currentPrice.toLocaleString()}\n`;
        message += `**P&L**: $${position.pnl.toFixed(2)} ${position.pnl >= 0 ? '✅' : '❌'}\n`;
        message += `**Reason**: ${position.reason}\n`;
        return message;
    }
    formatRiskMessage(riskType, details) {
        let message = `**Risk Management Alert**\n\n`;
        message += `**Type**: ${riskType}\n`;
        if (typeof details === 'object') {
            Object.entries(details).forEach(([key, value]) => {
                message += `**${key}**: ${value}\n`;
            });
        }
        else {
            message += `**Details**: ${details}\n`;
        }
        message += `\n**Immediate Action Required** ⚠️`;
        return message;
    }
    formatAIMessage(symbol, action, confidence, reasoning) {
        let message = `**AI Trading Decision**\n\n`;
        message += `**Symbol**: ${symbol}\n`;
        message += `**Action**: ${action}\n`;
        message += `**Confidence**: ${(confidence * 100).toFixed(1)}%\n`;
        message += `**Reasoning**: ${reasoning}\n`;
        const confidenceEmoji = confidence > 0.8 ? '🟢' : confidence > 0.6 ? '🟡' : '🔴';
        message += `**Signal Strength**: ${confidenceEmoji}\n`;
        return message;
    }
    formatDailySummary() {
        let message = `**Daily Trading Summary**\n\n`;
        message += `**Date**: ${new Date().toDateString()}\n`;
        message += `**Total P&L**: $${this.dailyPnL.toFixed(2)} ${this.dailyPnL >= 0 ? '✅' : '❌'}\n`;
        message += `**Total Trades**: ${this.dailyTrades}\n`;
        if (this.dailyPnL > 0) {
            message += `\n**Great day! Keep it up! 🎉**`;
        }
        else if (this.dailyPnL < 0) {
            message += `\n**Tough day. Tomorrow's a new one! 💪**`;
        }
        else {
            message += `\n**Breakeven day. Stay consistent! 📊**`;
        }
        return message;
    }
    formatSystemMessage(error, context) {
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
    formatAlertFields(alertData) {
        const fields = [];
        if (alertData.data) {
            Object.entries(alertData.data).forEach(([key, value]) => {
                if (typeof value === 'number') {
                    fields.push({
                        name: key,
                        value: value.toLocaleString(),
                        inline: true,
                    });
                }
                else {
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
    formatHTMLEmail(alertData, textMessage) {
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
    getAlertColor(priority) {
        switch (priority) {
            case 'CRITICAL': return '#FF0000';
            case 'HIGH': return '#FF6B6B';
            case 'MEDIUM': return '#FFA500';
            case 'LOW': return '#28A745';
            default: return '#007BFF';
        }
    }
    updateDailyStats(pnl, trades) {
        this.dailyPnL += pnl;
        this.dailyTrades += trades;
    }
    async healthCheck() {
        return {
            status: this.isEnabled ? 'enabled' : 'disabled',
            enabled: this.isEnabled,
            webhookConfigured: !!config_1.alertConfig.webhookUrl,
            emailConfigured: !!(config_1.alertConfig.email.smtpHost && config_1.alertConfig.email.to),
            lastDailySummary: this.lastDailySummary,
        };
    }
}
exports.AlertService = AlertService;
exports.default = AlertService;
//# sourceMappingURL=alert.service.js.map