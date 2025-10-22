"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const database_1 = require("../models/database");
console.log('🧪 Starting Simple MVP Test...');
async function runSimpleTest() {
    try {
        console.log('1. Testing basic imports...');
        logger_1.logger.info('Logger imported successfully');
        console.log('2. Testing configuration validation...');
        (0, config_1.validateConfig)();
        console.log('✅ Configuration validation passed');
        console.log('3. Testing database connection...');
        const trades = database_1.db.getTrades();
        console.log(`✅ Database connection successful (found ${trades.length} trades)`);
        console.log('4. Testing basic database operations...');
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
        console.log(`✅ Test AI decision inserted with ID: ${decisionId}`);
        const decisions = database_1.db.getAIDecisions();
        console.log(`✅ Retrieved ${decisions.length} AI decisions`);
        database_1.db.insertMarketData({
            symbol: 'BTCUSDT',
            price: 50000,
            volume: 1000,
            high_24h: 52000,
            low_24h: 48000,
            change_24h: 2.5,
            timestamp: Date.now(),
            exchange: 'binance',
        });
        console.log('✅ Test market data inserted');
        console.log('\n🎉 All basic tests passed!');
        console.log('\n📋 System Status:');
        console.log('✅ TypeScript compilation');
        console.log('✅ Module imports');
        console.log('✅ Configuration validation');
        console.log('✅ Database connection');
        console.log('✅ Database operations');
        console.log('✅ Basic functionality');
    }
    catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}
runSimpleTest().catch(console.error);
//# sourceMappingURL=simple-test.js.map