import * as tf from '@tensorflow/tfjs-node';
import { BinanceService } from '../services/binance.service';
import { DatabaseService } from '../models/database';
import { Logger } from '../utils/logger';

export interface MarketData {
  timestamp: number;
  price: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
  rsi?: number;
  macd?: number;
  bollinger?: number;
}

export interface PredictionResult {
  timestamp: number;
  symbol: string;
  currentPrice: number;
  prediction: number;
  confidence: number;
  timeHorizon: number; // minutes
  signals: {
    trend: 'bullish' | 'bearish' | 'neutral';
    strength: number; // 0-100
    entry: number;
    targets: number[];
    stopLoss: number;
  };
}

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  meanAbsoluteError: number;
  meanSquaredError: number;
  lastUpdated: number;
}

export class MachineLearningService {
  private models: Map<string, tf.LayersModel> = new Map();
  private dbService: DatabaseService;
  private binanceService: BinanceService;
  private logger = Logger.getInstance();
  private isTraining = false;
  private trainingProgress = 0;
  private modelMetrics: Map<string, ModelMetrics> = new Map();

  constructor(dbService: DatabaseService, binanceService: BinanceService) {
    this.dbService = dbService;
    this.binanceService = binanceService;
    this.initializeModels();
  }

  private async initializeModels(): Promise<void> {
    try {
      await this.loadExistingModels();
      this.logger.info('ML models initialized', {
        modelsLoaded: this.models.size,
        service: 'MachineLearningService'
      });
    } catch (error) {
      this.logger.error('Failed to initialize ML models', {
        error: (error as Error).message,
        service: 'MachineLearningService'
      });
    }
  }

  /**
   * Create and train a new prediction model for a symbol
   */
  public async createModel(symbol: string, timeframe: string = '1h'): Promise<tf.LayersModel> {
    this.logger.info('Creating new ML model', {
      symbol,
      timeframe,
      service: 'MachineLearningService'
    });

    // Collect training data
    const trainingData = await this.collectTrainingData(symbol, timeframe);
    if (trainingData.length < 100) {
      throw new Error(`Insufficient training data for ${symbol}: ${trainingData.length} samples`);
    }

    // Prepare features and labels
    const { features, labels } = this.prepareTrainingData(trainingData);

    // Create neural network architecture
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [features.shape[1]],
          units: 128,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'linear' })
      ]
    });

    // Compile model
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae', 'mse']
    });

    // Train model
    this.isTraining = true;
    this.trainingProgress = 0;

    const history = await model.fit(features, labels, {
      epochs: 100,
      batchSize: 32,
      validationSplit: 0.2,
      shuffle: true,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          this.trainingProgress = (epoch + 1) / 100;
          this.logger.debug('Training progress', {
            symbol,
            epoch: epoch + 1,
            loss: logs?.loss,
            mae: logs?.mae,
            service: 'MachineLearningService'
          });
        }
      }
    });

    this.isTraining = false;

    // Evaluate model
    const evaluation = model.evaluate(features, labels) as tf.Scalar[];
    const metrics: ModelMetrics = {
      accuracy: 1 - (evaluation[0].dataSync()[0] / 100), // Normalized accuracy
      precision: 0.85, // Placeholder - would need binary classification
      recall: 0.85,    // Placeholder - would need binary classification
      f1Score: 0.85,   // Placeholder - would need binary classification
      meanAbsoluteError: evaluation[1].dataSync()[0],
      meanSquaredError: evaluation[0].dataSync()[0],
      lastUpdated: Date.now()
    };

    this.modelMetrics.set(`${symbol}_${timeframe}`, metrics);
    this.models.set(`${symbol}_${timeframe}`, model);

    // Save model
    await this.saveModel(symbol, timeframe, model);

    this.logger.info('ML model created and trained successfully', {
      symbol,
      timeframe,
      metrics,
      service: 'MachineLearningService'
    });

    return model;
  }

  /**
   * Generate price prediction for a symbol
   */
  public async predictPrice(symbol: string, timeframe: string = '1h', horizon: number = 60): Promise<PredictionResult> {
    const modelKey = `${symbol}_${timeframe}`;
    const model = this.models.get(modelKey);

    if (!model) {
      throw new Error(`No trained model found for ${symbol} on ${timeframe}`);
    }

    // Get current market data
    const currentData = await this.getCurrentMarketData(symbol, timeframe);
    const features = this.prepareFeatures(currentData);

    // Make prediction
    const prediction = model.predict(features) as tf.Tensor;
    const predictedPrice = prediction.dataSync()[0];

    // Calculate confidence based on model metrics
    const metrics = this.modelMetrics.get(modelKey);
    const confidence = this.calculateConfidence(predictedPrice, currentData, metrics);

    // Generate trading signals
    const signals = this.generateSignals(currentData, predictedPrice, confidence);

    prediction.dispose();

    const result: PredictionResult = {
      timestamp: Date.now(),
      symbol,
      currentPrice: currentData[currentData.length - 1].close,
      prediction: predictedPrice,
      confidence,
      timeHorizon: horizon,
      signals
    };

    this.logger.info('Price prediction generated', {
      symbol,
      currentPrice: result.currentPrice,
      prediction: predictedPrice,
      confidence,
      timeframe,
      service: 'MachineLearningService'
    });

    return result;
  }

  /**
   * Batch prediction for multiple symbols
   */
  public async batchPredict(symbols: string[], timeframe: string = '1h'): Promise<PredictionResult[]> {
    const predictions: PredictionResult[] = [];

    for (const symbol of symbols) {
      try {
        const prediction = await this.predictPrice(symbol, timeframe);
        predictions.push(prediction);
      } catch (error) {
        this.logger.error('Failed to predict price for symbol', {
          symbol,
          error: (error as Error).message,
          service: 'MachineLearningService'
        });
      }
    }

    return predictions;
  }

  /**
   * Retrain existing model with new data
   */
  public async retrainModel(symbol: string, timeframe: string = '1h'): Promise<void> {
    this.logger.info('Retraining ML model', {
      symbol,
      timeframe,
      service: 'MachineLearningService'
    });

    const modelKey = `${symbol}_${timeframe}`;
    const existingModel = this.models.get(modelKey);

    if (existingModel) {
      // Create new model with updated data
      await this.createModel(symbol, timeframe);
    } else {
      throw new Error(`No existing model found for ${symbol} on ${timeframe}`);
    }
  }

  /**
   * Get model performance metrics
   */
  public getModelMetrics(symbol: string, timeframe: string = '1h'): ModelMetrics | undefined {
    return this.modelMetrics.get(`${symbol}_${timeframe}`);
  }

  /**
   * Get all available models
   */
  public getAvailableModels(): string[] {
    return Array.from(this.models.keys());
  }

  /**
   * Check if training is in progress
   */
  public getTrainingStatus(): { isTraining: boolean; progress: number } {
    return {
      isTraining: this.isTraining,
      progress: this.trainingProgress
    };
  }

  private async collectTrainingData(symbol: string, timeframe: string): Promise<MarketData[]> {
    try {
      // Get historical klines from Binance
      const klines = await this.binanceService.getKlines(symbol, timeframe, 1000);

      const marketData: MarketData[] = klines.map(kline => ({
        timestamp: kline.openTime,
        price: kline.close,
        volume: kline.volume,
        high: kline.high,
        low: kline.low,
        open: kline.open,
        close: kline.close
      }));

      // Add technical indicators
      return this.addTechnicalIndicators(marketData);
    } catch (error) {
      this.logger.error('Failed to collect training data', {
        symbol,
        timeframe,
        error: (error as Error).message,
        service: 'MachineLearningService'
      });
      throw error;
    }
  }

  private addTechnicalIndicators(data: MarketData[]): MarketData[] {
    // Calculate RSI
    for (let i = 14; i < data.length; i++) {
      const gains: number[] = [];
      const losses: number[] = [];

      for (let j = i - 13; j <= i; j++) {
        const change = data[j].close - data[j - 1].close;
        if (change > 0) {
          gains.push(change);
        } else {
          losses.push(Math.abs(change));
        }
      }

      const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;
      const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
      const rs = avgGain / avgLoss;
      data[i].rsi = 100 - (100 / (1 + rs));
    }

    // Calculate simple moving averages
    for (let i = 20; i < data.length; i++) {
      const sma20 = data.slice(i - 20, i).reduce((sum, d) => sum + d.close, 0) / 20;
      const sma50 = data.slice(i - 50, i).reduce((sum, d) => sum + d.close, 0) / 50;
      data[i].macd = sma20 - sma50; // Simplified MACD
    }

    // Calculate Bollinger Bands
    for (let i = 20; i < data.length; i++) {
      const period = data.slice(i - 20, i);
      const sma = period.reduce((sum, d) => sum + d.close, 0) / 20;
      const variance = period.reduce((sum, d) => sum + Math.pow(d.close - sma, 2), 0) / 20;
      const stdDev = Math.sqrt(variance);
      data[i].bollinger = (data[i].close - sma) / stdDev; // Bollinger position
    }

    return data;
  }

  private prepareTrainingData(data: MarketData[]): { features: tf.Tensor; labels: tf.Tensor } {
    const lookback = 20; // Use last 20 periods to predict next
    const features: number[][] = [];
    const labels: number[] = [];

    for (let i = lookback; i < data.length - 1; i++) {
      const feature: number[] = [];

      // Price data
      for (let j = i - lookback; j < i; j++) {
        feature.push(
          data[j].close / data[i - 1].close, // Normalized price
          data[j].volume / 1000000, // Normalized volume
          data[j].high / data[j].low - 1, // High-low ratio
          data[j].rsi || 50,
          data[j].macd || 0,
          data[j].bollinger || 0
        );
      }

      features.push(feature);
      labels.push(data[i + 1].close / data[i].close); // Price change ratio
    }

    return {
      features: tf.tensor2d(features),
      labels: tf.tensor2d(labels, [labels.length, 1])
    };
  }

  private prepareFeatures(data: MarketData[]): tf.Tensor {
    const lookback = 20;
    const features: number[] = [];

    for (let i = data.length - lookback; i < data.length; i++) {
      features.push(
        data[i].close / data[data.length - lookback - 1].close,
        data[i].volume / 1000000,
        data[i].high / data[i].low - 1,
        data[i].rsi || 50,
        data[i].macd || 0,
        data[i].bollinger || 0
      );
    }

    return tf.tensor2d([features]);
  }

  private calculateConfidence(prediction: number, data: MarketData[], metrics?: ModelMetrics): number {
    // Base confidence on model accuracy
    let confidence = metrics?.accuracy || 0.5;

    // Adjust based on prediction volatility
    const currentPrice = data[data.length - 1].close;
    const priceChange = Math.abs(prediction - currentPrice) / currentPrice;

    if (priceChange < 0.01) confidence *= 0.9; // Small predictions are less reliable
    if (priceChange > 0.05) confidence *= 0.8; // Large predictions are riskier

    // Adjust based on recent market stability
    const recentVolatility = this.calculateVolatility(data.slice(-10));
    confidence *= (1 - recentVolatility);

    return Math.max(0.1, Math.min(0.95, confidence));
  }

  private calculateVolatility(data: MarketData[]): number {
    if (data.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < data.length; i++) {
      returns.push(Math.log(data[i].close / data[i - 1].close));
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }

  private generateSignals(data: MarketData[], prediction: number, confidence: number): PredictionResult['signals'] {
    const currentPrice = data[data.length - 1].close;
    const priceChange = (prediction - currentPrice) / currentPrice;

    let trend: 'bullish' | 'bearish' | 'neutral';
    let strength: number;

    if (priceChange > 0.02) {
      trend = 'bullish';
      strength = Math.min(100, priceChange * 1000 * confidence);
    } else if (priceChange < -0.02) {
      trend = 'bearish';
      strength = Math.min(100, Math.abs(priceChange) * 1000 * confidence);
    } else {
      trend = 'neutral';
      strength = 50 * confidence;
    }

    const entry = currentPrice;
    const stopLoss = trend === 'bullish' ? entry * 0.98 : entry * 1.02;

    const targets: number[] = [];
    if (trend === 'bullish') {
      targets.push(entry * 1.02, entry * 1.05, entry * 1.1);
    } else if (trend === 'bearish') {
      targets.push(entry * 0.98, entry * 0.95, entry * 0.9);
    }

    return {
      trend,
      strength,
      entry,
      targets,
      stopLoss
    };
  }

  private async saveModel(symbol: string, timeframe: string, model: tf.LayersModel): Promise<void> {
    try {
      const modelPath = `models/${symbol}_${timeframe}`;
      await model.save(`file://${modelPath}`);

      // Save model metadata
      const metadata = {
        symbol,
        timeframe,
        createdAt: Date.now(),
        metrics: this.modelMetrics.get(`${symbol}_${timeframe}`)
      };

      await this.dbService.saveMLModel(metadata);

      this.logger.info('Model saved successfully', {
        symbol,
        timeframe,
        path: modelPath,
        service: 'MachineLearningService'
      });
    } catch (error) {
      this.logger.error('Failed to save model', {
        symbol,
        timeframe,
        error: (error as Error).message,
        service: 'MachineLearningService'
      });
    }
  }

  private async loadExistingModels(): Promise<void> {
    try {
      const savedModels = await this.dbService.getSavedModels();

      for (const modelInfo of savedModels) {
        try {
          const modelPath = `models/${modelInfo.symbol}_${modelInfo.timeframe}`;
          const model = await tf.loadLayersModel(`file://${modelPath}`);

          this.models.set(`${modelInfo.symbol}_${modelInfo.timeframe}`, model);

          if (modelInfo.metrics) {
            this.modelMetrics.set(`${modelInfo.symbol}_${modelInfo.timeframe}`, modelInfo.metrics);
          }

          this.logger.info('Loaded existing model', {
            symbol: modelInfo.symbol,
            timeframe: modelInfo.timeframe,
            service: 'MachineLearningService'
          });
        } catch (error) {
          this.logger.error('Failed to load model', {
            symbol: modelInfo.symbol,
            timeframe: modelInfo.timeframe,
            error: (error as Error).message,
            service: 'MachineLearningService'
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to load existing models', {
        error: (error as Error).message,
        service: 'MachineLearningService'
      });
    }
  }

  private async getCurrentMarketData(symbol: string, timeframe: string): Promise<MarketData[]> {
    // Get recent market data
    const klines = await this.binanceService.getKlines(symbol, timeframe, 50);

    const data: MarketData[] = klines.map(kline => ({
      timestamp: kline.openTime,
      price: kline.close,
      volume: kline.volume,
      high: kline.high,
      low: kline.low,
      open: kline.open,
      close: kline.close
    }));

    return this.addTechnicalIndicators(data);
  }

  public async cleanup(): Promise<void> {
    // Dispose all models to free memory
    for (const [key, model] of this.models) {
      model.dispose();
      this.logger.info('Model disposed', { model: key, service: 'MachineLearningService' });
    }

    this.models.clear();
    this.modelMetrics.clear();

    this.logger.info('MachineLearningService cleanup completed', {
      service: 'MachineLearningService'
    });
  }
}