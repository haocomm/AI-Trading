"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
global.console = {
    ...console,
};
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
jest.mock('axios', () => ({
    post: jest.fn(),
    get: jest.fn(),
    create: jest.fn(() => ({
        post: jest.fn(),
        get: jest.fn(),
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() }
        }
    }))
}));
global.createMockMarketData = (overrides = {}) => ({
    symbol: 'BTCUSDT',
    currentPrice: 50000,
    priceChange24h: 2.5,
    volume: 1000000,
    high24h: 51000,
    low24h: 49000,
    volatility: 0.03,
    trend: 'BULLISH',
    momentum: 0.1,
    support: 49000,
    resistance: 51000,
    ...overrides
});
global.createMockAIResponse = (overrides = {}) => ({
    content: JSON.stringify({
        action: 'BUY',
        confidence: 0.8,
        reasoning: 'Strong bullish trend detected',
        entryPrice: 50000,
        stopLoss: 48500,
        takeProfit: 53000,
        positionSize: 0.1,
        riskReward: 3
    }),
    model: 'gpt-4',
    provider: 'OpenAI',
    usage: {
        promptTokens: 100,
        completionTokens: 150,
        totalTokens: 250
    },
    cost: 0.01,
    responseTime: 1500,
    timestamp: Date.now(),
    ...overrides
});
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
afterEach(() => {
    jest.clearAllMocks();
});
//# sourceMappingURL=setup.js.map