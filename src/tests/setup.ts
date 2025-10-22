// Jest setup file
import 'dotenv/config';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to suppress console.log during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock external dependencies
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

// Global test utilities
(global as any).createMockMarketData = (overrides = {}) => ({
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

(global as any).createMockAIResponse = (overrides = {}) => ({
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

(global as any).sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});