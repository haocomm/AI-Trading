import { logger } from '@/utils/logger';
import { validateConfig } from '@/config';
import BinanceService from '@/services/binance.service';
import RiskService from '@/services/risk.service';
import { db } from '@/models/database';

class MVPTest {
  private binanceService: BinanceService;
  private riskService: RiskService;

  constructor() {
    this.binanceService = new BinanceService();
    this.riskService = new RiskService();
  }

  async runTests(): Promise<void> {
    logger.info('Starting MVP Tests...');

    const testResults: { [testName: string]: boolean } = {};

    try {
      // Test 1: Configuration Validation
      testResults['config_validation'] = await this.testConfigurationValidation();

      // Test 2: Database Connection
      testResults['database_connection'] = await this.testDatabaseConnection();

      // Test 3: Binance API Connection
      testResults['binance_connection'] = await this.testBinanceConnection();

      // Test 4: Market Data Retrieval
      testResults['market_data'] = await this.testMarketData();

      // Test 5: Risk Management
      testResults['risk_management'] = await this.testRiskManagement();

      // Test 6: Position Size Calculation
      testResults['position_sizing'] = await this.testPositionSizing();

      // Test 7: Order Validation
      testResults['order_validation'] = await this.testOrderValidation();

      // Test 8: Database Operations
      testResults['database_operations'] = await this.testDatabaseOperations();

      // Summary
      const totalTests = Object.keys(testResults).length;
      const passedTests = Object.values(testResults).filter(Boolean).length;
      const failedTests = totalTests - passedTests;

      logger.info('MVP Test Results Summary', {
        totalTests,
        passedTests,
        failedTests,
        results: testResults,
      });

      if (failedTests === 0) {
        logger.info('✅ All MVP tests passed! The system is ready for live testing.');
      } else {
        logger.warn(`❌ ${failedTests} test(s) failed. Please fix issues before proceeding.`);
      }

    } catch (error) {
      logger.error('MVP test execution failed', error);
    }
  }

  private async testConfigurationValidation(): Promise<boolean> {
    try {
      logger.info('Testing configuration validation...');

      // This should throw if configuration is invalid
      validateConfig();

      logger.info('✅ Configuration validation passed');
      return true;
    } catch (error) {
      logger.error('❌ Configuration validation failed', error);
      return false;
    }
  }

  private async testDatabaseConnection(): Promise<boolean> {
    try {
      logger.info('Testing database connection...');

      // Try to get some data (should work even if empty)
      const trades = db.getTrades();
      const positions = db.getOpenPositions();

      logger.info('✅ Database connection successful', {
        tradesCount: trades.length,
        openPositions: positions.length,
      });
      return true;
    } catch (error) {
      logger.error('❌ Database connection failed', error);
      return false;
    }
  }

  private async testBinanceConnection(): Promise<boolean> {
    try {
      logger.info('Testing Binance API connection...');

      const connectionTest = await this.binanceService.testConnection();

      if (connectionTest) {
        logger.info('✅ Binance API connection successful');
        return true;
      } else {
        logger.error('❌ Binance API connection failed');
        return false;
      }
    } catch (error) {
      logger.error('❌ Binance API connection error', error);
      return false;
    }
  }

  private async testMarketData(): Promise<boolean> {
    try {
      logger.info('Testing market data retrieval...');

      // Test getting ticker for BTCUSDT
      const ticker = await this.binanceService.getTicker('BTCUSDT');

      if (ticker && ticker.price && parseFloat(ticker.price) > 0) {
        logger.info('✅ Market data retrieval successful', {
          symbol: ticker.symbol,
          price: ticker.price,
          volume: ticker.volume,
        });

        // Store in database
        db.insertMarketData({
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
      } else {
        logger.error('❌ Invalid ticker data received');
        return false;
      }
    } catch (error) {
      logger.error('❌ Market data retrieval failed', error);
      return false;
    }
  }

  private async testRiskManagement(): Promise<boolean> {
    try {
      logger.info('Testing risk management...');

      // Test getting risk metrics
      const riskMetrics = await this.riskService.getRiskMetrics();

      if (riskMetrics && riskMetrics.portfolioValue > 0) {
        logger.info('✅ Risk management metrics successful', {
          portfolioValue: riskMetrics.portfolioValue,
          riskPerTrade: riskMetrics.riskPerTrade,
          maxDailyLoss: riskMetrics.maxDailyLoss,
        });
        return true;
      } else {
        logger.error('❌ Invalid risk metrics');
        return false;
      }
    } catch (error) {
      logger.error('❌ Risk management test failed', error);
      return false;
    }
  }

  private async testPositionSizing(): Promise<boolean> {
    try {
      logger.info('Testing position size calculation...');

      // Test calculating position size for BTC
      const symbol = 'BTCUSDT';
      const currentPrice = 50000; // Example price
      const portfolioValue = 1000; // Example portfolio

      const positionSize = await this.riskService.validateTradeSize(
        symbol,
        'BUY',
        currentPrice,
        undefined,
        portfolioValue
      );

      if (positionSize && positionSize.quantity > 0 && positionSize.riskAmount > 0) {
        logger.info('✅ Position size calculation successful', {
          symbol,
          currentPrice,
          quantity: positionSize.quantity,
          riskAmount: positionSize.riskAmount,
          stopLossPrice: positionSize.stopLossPrice,
          takeProfitPrice: positionSize.takeProfitPrice,
        });
        return true;
      } else {
        logger.error('❌ Invalid position size calculation');
        return false;
      }
    } catch (error) {
      logger.error('❌ Position sizing test failed', error);
      return false;
    }
  }

  private async testOrderValidation(): Promise<boolean> {
    try {
      logger.info('Testing order validation...');

      // Test order validation (should pass if trading is disabled or conditions are met)
      const canExecute = await this.riskService.validateTradeExecution(
        'BTCUSDT',
        'BUY',
        0.001, // Small quantity
        50000,  // Example price
        49000   // Stop loss
      );

      // This might fail if daily loss limit exceeded or too many positions
      // The important thing is that the validation runs without error
      logger.info('✅ Order validation test completed', {
        canExecute,
        note: canExecute ? 'Order would be allowed' : 'Order blocked by risk management',
      });

      return true;
    } catch (error) {
      logger.error('❌ Order validation test failed', error);
      return false;
    }
  }

  private async testDatabaseOperations(): Promise<boolean> {
    try {
      logger.info('Testing database operations...');

      // Test inserting an AI decision
      const decisionId = db.insertAIDecision({
        symbol: 'BTCUSDT',
        action: 'BUY',
        confidence: 0.85,
        reasoning: 'Test AI decision for MVP',
        timestamp: Date.now(),
        executed: false,
        model: 'gemini-2.0-flash-exp',
        input_data: JSON.stringify({ test: true }),
      });

      // Test retrieving AI decisions
      const decisions = db.getAIDecisions();

      // Test market data retrieval
      const latestMarketData = db.getLatestMarketData('BTCUSDT', 'binance');

      logger.info('✅ Database operations successful', {
        decisionId,
        decisionsCount: decisions.length,
        hasMarketData: !!latestMarketData,
      });

      return true;
    } catch (error) {
      logger.error('❌ Database operations test failed', error);
      return false;
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const test = new MVPTest();
  test.runTests().catch(error => {
    logger.error('Test execution failed', error);
    process.exit(1);
  });
}

export default MVPTest;