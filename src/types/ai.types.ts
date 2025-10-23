// Enhanced AI Types for Multi-Provider System

import { AIDecision } from './index';

export interface AIProviderResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost?: number;
  responseTime: number;
  timestamp: number;
}

export interface AIProviderRequest {
  prompt: string;
  context?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  metadata?: Record<string, any>;
}

export interface MarketAnalysis {
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  volume: number;
  high24h: number;
  low24h: number;
  volatility: number;
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  momentum: number;
  support: number;
  resistance: number;
  indicators?: {
    rsi?: number;
    macd?: number;
    bollinger?: {
      upper: number;
      middle: number;
      lower: number;
    };
    volumeProfile?: number;
  };
  marketSentiment?: number;
  liquidityScore?: number;
}

export interface TradingSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  riskReward: number;
  provider: string;
  model: string;
  metadata?: {
    keyIndicators: string[];
    marketCondition: string;
    riskFactors: string[];
    expectedMove: string;
    timeframe: string;
  };
}

export interface EnsembleDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  consensus: number; // 0-1, how much providers agree
  reasoning: string;
  providerSignals: ProviderSignal[];
  riskAssessment: RiskAssessment;
  executionRecommendation: ExecutionRecommendation;
}

export interface ProviderSignal {
  provider: string;
  model: string;
  signal: TradingSignal;
  weight: number;
  reliability: number; // Historical performance score
  responseTime: number;
}

export interface RiskAssessment {
  overall: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  factors: {
    volatility: number;
    liquidity: number;
    correlation: number;
    marketRegime: string;
  };
  recommendedPositionSize: number;
  maxDrawdownRisk: number;
}

export interface ExecutionRecommendation {
  execute: boolean;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'IMMEDIATE';
  timing: string;
  reason: string;
}

export interface AIProviderConfig {
  name: string;
  enabled: boolean;
  apiKey: string;
  apiSecret?: string;
  baseUrl?: string;
  models: string[];
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  pricing: {
    inputTokenCost: number;
    outputTokenCost: number;
  };
  weights: {
    accuracy: number;
    speed: number;
    cost: number;
  };
}

export interface CacheEntry {
  key: string;
  response: AIProviderResponse;
  timestamp: number;
  ttl: number;
  provider: string;
  hits: number;
}

export interface ProviderMetrics {
  provider: string;
  model: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  averageConfidence: number;
  accuracy: number; // Historical decision accuracy
  totalCost: number;
  uptime: number;
  lastUsed: number;
  errors: Array<{
    timestamp: number;
    error: string;
    recoverable: boolean;
  }>;
}

export interface BatchRequest {
  id: string;
  requests: AIProviderRequest[];
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  timeout: number;
  timestamp: number;
}

export interface BatchResponse {
  requestId: string;
  responses: AIProviderResponse[];
  success: boolean;
  errors: string[];
  totalCost: number;
  totalTime: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  variables: string[];
  category: 'TRADING' | 'ANALYSIS' | 'RISK' | 'PORTFOLIO';
  version: string;
  createdAt: number;
  updatedAt: number;
}

export interface DynamicPromptContext {
  marketCondition: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'VOLATILE';
  volatilityLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  timeOfDay: string;
  dayOfWeek: string;
  recentPerformance: number;
  riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  positionSize: number;
  portfolioHeat: number;
  marketSentiment: number;
  recentLosses?: number;
}

export interface ChainOfThoughtStep {
  step: number;
  description: string;
  reasoning: string;
  conclusion: string;
  confidence: number;
}

export interface AIProviderInterface {
  name: string;
  isHealthy(): Promise<boolean>;
  generateResponse(request: AIProviderRequest): Promise<AIProviderResponse>;
  getMetrics(): ProviderMetrics;
  getModels(): string[];
  validateConfig(): boolean;
}

export interface EnsembleConfig {
  minProviders: number;
  maxProviders: number;
  consensusThreshold: number;
  disagreementThreshold: number;
  fallbackStrategy: 'MAJORITY' | 'HIGHEST_CONFIDENCE' | 'WEIGHTED_VOTE' | 'SAFE_HOLD';
  weights: {
    accuracy: number;
    speed: number;
    cost: number;
    diversity: number;
  };
  rebalancing: {
    enabled: boolean;
    frequency: number; // hours
    performanceWindow: number; // hours
    minSamples: number;
  };
}

export interface AIDecisionEnhanced extends Omit<AIDecision, 'inputData'> {
  inputData: MarketAnalysis;
  ensembleDecision?: EnsembleDecision;
  providerResponses: AIProviderResponse[];
  cost: number;
  totalResponseTime: number;
  cacheHit: boolean;
  chainOfThought?: ChainOfThoughtStep[];
}

// Error types
export class AIProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code: string,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export class EnsembleError extends Error {
  constructor(
    message: string,
    public providers: string[],
    public cause?: Error
  ) {
    super(message);
    this.name = 'EnsembleError';
  }
}

export class PromptEngineeringError extends Error {
  constructor(
    message: string,
    public templateId?: string,
    public variable?: string
  ) {
    super(message);
    this.name = 'PromptEngineeringError';
  }
}

export interface OptimizationStrategy {
  provider: string;
  caching: boolean;
  batching: boolean;
  modelSelection: string;
  promptCompression: boolean;
  costThreshold: number;
}

// Additional types needed for cost optimization
export interface ProviderPricing {
  provider: string;
  inputTokenCost: number;
  outputTokenCost: number;
  currency: string;
  model?: string;
  tier?: string;
}

export interface CostOptimizationRequest {
  request: AIProviderRequest;
  strategy: OptimizationStrategy;
  budget: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface CostOptimizationResult {
  optimizedRequest: AIProviderRequest;
  estimatedCost: number;
  savings: number;
  optimizations: string[];
}

// Additional signal types
export interface AISignal {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD' | 'STRONG_BUY' | 'STRONG_SELL';
  confidence: number;
  reasoning: string;
  provider: string;
  timestamp: number;
  metadata?: Record<string, any>;
}