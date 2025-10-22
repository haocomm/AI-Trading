"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("@/utils/logger");
const config_1 = require("@/config");
const binance_service_1 = __importDefault(require("@/services/binance.service"));
const risk_service_1 = __importDefault(require("@/services/risk.service"));
const database_1 = require("@/models/database");
class MVPTest {
    constructor() {
        this.binanceService = new binance_service_1.default();
        this.riskService = new risk_service_1.default();
    }
    async runTests() {
        logger_1.logger.info('Starting MVP Tests...');
        const testResults = {};
        try {
            testResults['config_validation'] = await this.testConfigurationValidation();
            testResults['database_connection'] = await this.testDatabaseConnection();
            testResults['binance_connection'] = await this.testBinanceConnection();
            testResults['market_data'] = await this.testMarketData();
            testResults['risk_management'] = await this.testRiskManagement();
            testResults['position_sizing'] = await this.testPositionSizing();
            testResults['order_validation'] = await this.testOrderValidation();
            testResults['database_operations'] = await this.testDatabaseOperations();
            const totalTests = Object.keys(testResults).length;
            const passedTests = Object.values(testResults).filter(Boolean).length;
            const failedTests = totalTests - passedTests;
            logger_1.logger.info('MVP Test Results Summary', {
                totalTests,
                passedTests,
                failedTests,
                results: testResults,
            });
            if (failedTests === 0) {
                logger_1.logger.info('✅ All MVP tests passed! The system is ready for live testing.');
            }
            else {
                logger_1.logger.warn(`❌ ${failedTests} test(s) failed. Please fix issues before proceeding.`);
            }
        }
        catch (error) {
            logger_1.logger.error('MVP test execution failed', error);
        }
    }
    async testConfigurationValidation() {
        try {
            logger_1.logger.info('Testing configuration validation...');
            (0, config_1.validateConfig)();
            logger_1.logger.info('✅ Configuration validation passed');
            return true;
        }
        catch (error) {
            logger_1.logger.error('❌ Configuration validation failed', error);
            return false;
        }
    }
    async testDatabaseConnection() {
        try {
            logger_1.logger.info('Testing database connection...');
            const trades = database_1.db.getTrades();
            const positions = database_1.db.getOpenPositions();
            logger_1.logger.info('✅ Database connection successful', {
                tradesCount: trades.length,
                openPositions: positions.length,
            });
            return true;
        }
        catch (error) {
            logger_1.logger.error('❌ Database connection failed', error);
            return false;
        }
    }
    async testBinanceConnection() {
        try {
            logger_1.logger.info('Testing Binance API connection...');
            const connectionTest = await this.binanceService.testConnection();
            if (connectionTest) {
                logger_1.logger.info('✅ Binance API connection successful');
                return true;
            }
            else {
                logger_1.logger.error('❌ Binance API connection failed');
                return false;
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Binance API connection error', error);
            return false;
        }
    }
    async testMarketData() {
        try {
            logger_1.logger.info('Testing market data retrieval...');
            const ticker = await this.binanceService.getTicker('BTCUSDT');
            if (ticker && ticker.price && parseFloat(ticker.price) > 0) {
                logger_1.logger.info('✅ Market data retrieval successful', {
                    symbol: ticker.symbol,
                    price: ticker.price,
                    volume: ticker.volume,
                });
                database_1.db.insertMarketData({
                    symbol: ticker.symbol,
                    price: parseFloat(ticker.price),
                    volume: parseFloat(ticker.volume),
                    high_24h: parseFloat(ticker.high24h),
                    low_24h: parseFloat(ticker.low24h),
                    change_24h: parseFloat(ticker.change24h),
                    timestamp: Date.now(),
                    exchange: 'binance',
                });
                return true;
            }
            else {
                logger_1.logger.error('❌ Invalid ticker data received');
                return false;
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Market data retrieval failed', error);
            return false;
        }
    }
    async testRiskManagement() {
        try {
            logger_1.logger.info('Testing risk management...');
            const riskMetrics = await this.riskService.getRiskMetrics();
            if (riskMetrics && riskMetrics.portfolioValue > 0) {
                logger_1.logger.info('✅ Risk management metrics successful', {
                    portfolioValue: riskMetrics.portfolioValue,
                    riskPerTrade: riskMetrics.riskPerTrade,
                    maxDailyLoss: riskMetrics.maxDailyLoss,
                });
                return true;
            }
            else {
                logger_1.logger.error('❌ Invalid risk metrics');
                return false;
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Risk management test failed', error);
            return false;
        }
    }
    async testPositionSizing() {
        try {
            logger_1.logger.info('Testing position size calculation...');
            const symbol = 'BTCUSDT';
            const currentPrice = 50000;
            const portfolioValue = 1000;
            const positionSize = await this.riskService.validateTradeSize(symbol, 'BUY', currentPrice, undefined, portfolioValue);
            if (positionSize && positionSize.quantity > 0 && positionSize.riskAmount > 0) {
                logger_1.logger.info('✅ Position size calculation successful', {
                    symbol,
                    currentPrice,
                    quantity: positionSize.quantity,
                    riskAmount: positionSize.riskAmount,
                    stopLossPrice: positionSize.stopLossPrice,
                    takeProfitPrice: positionSize.takeProfitPrice,
                });
                return true;
            }
            else {
                logger_1.logger.error('❌ Invalid position size calculation');
                return false;
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Position sizing test failed', error);
            return false;
        }
    }
    async testOrderValidation() {
        try {
            logger_1.logger.info('Testing order validation...');
            const canExecute = await this.riskService.validateTradeExecution('BTCUSDT', 'BUY', 0.001, 50000, 49000);
            logger_1.logger.info('✅ Order validation test completed', {
                canExecute,
                note: canExecute ? 'Order would be allowed' : 'Order blocked by risk management',
            });
            return true;
        }
        catch (error) {
            logger_1.logger.error('❌ Order validation test failed', error);
            return false;
        }
    }
    async testDatabaseOperations() {
        try {
            logger_1.logger.info('Testing database operations...');
            const decisionId = database_1.db.insertAIDecision({
                symbol: 'BTCUSDT',
                action: 'BUY',
                confidence: 0.85,
                reasoning: 'Test AI decision for MVP',
                timestamp: Date.now(),
                executed: false,
                model: 'gemini-2.0-flash-exp',
                input_data: JSON.stringify({ test: true }),
            });
            const decisions = database_1.db.getAIDecisions();
            const latestMarketData = database_1.db.getLatestMarketData('BTCUSDT', 'binance');
            logger_1.logger.info('✅ Database operations successful', {
                decisionId,
                decisionsCount: decisions.length,
                hasMarketData: !!latestMarketData,
            });
            return true;
        }
        catch (error) {
            logger_1.logger.error('❌ Database operations test failed', error);
            return false;
        }
    }
}
if (require.main === module) {
    const test = new MVPTest();
    test.runTests().catch(error => {
        logger_1.logger.error('Test execution failed', error);
        process.exit(1);
    });
}
exports.default = MVPTest;
//# sourceMappingURL=test-mvp.js.map