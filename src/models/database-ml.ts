import DatabaseManager, { db } from './database';
import { MachineLearningService, PredictionResult, ModelMetrics } from '../services/ml.service';
import { BacktestingService, BacktestResult, Trade } from '../services/backtesting.service';
import { SentimentAnalysisService, SentimentData, SentimentAnalysis } from '../services/sentiment.service';
import { logger } from '../utils/logger';

// ML-specific database interface extensions
export interface MLModelRecord {
  id: string;
  symbol: string;
  timeframe: string;
  modelType: string;
  modelPath: string;
  createdAt: number;
  lastTrained: number;
  status: 'training' | 'active' | 'inactive' | 'error';
  metrics?: ModelMetrics;
  metadata?: Record<string, any>;
}

export interface PredictionRecord {
  id: string;
  symbol: string;
  timeframe: string;
  prediction: number;
  actualPrice?: number;
  confidence: number;
  timeHorizon: number;
  signals: any;
  modelId: string;
  createdAt: number;
  resolvedAt?: number;
  accuracy?: number;
}

export interface BacktestRecord {
  id: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  config: any;
  result: BacktestResult;
  createdAt: number;
  status: 'running' | 'completed' | 'error';
}

export interface SentimentRecord {
  id: string;
  symbol: string;
  source: string;
  sentiment: number;
  confidence: number;
  volume: number;
  content?: string;
  metadata?: any;
  timestamp: number;
}

export interface SentimentAnalysisRecord {
  id: string;
  symbol: string;
  overallScore: number;
  overallConfidence: number;
  trend: string;
  volume: number;
  fearGreedValue: number;
  fearGreedClassification: string;
  technicalSentimentScore: number;
  technicalSignals: string[];
  technicalConfidence: number;
  createdAt: number;
  metadata?: any;
}

export class MLDatabaseService {
  private logger = logger;
  private db = db;

  constructor() {
    this.initializeMLTables();
  }

  private run(sql: string, params?: any[]): any {
    return this.db.db.prepare(sql).run(...(params || []));
  }

  private all(sql: string, params?: any[]): any[] {
    return this.db.db.prepare(sql).all(...(params || []));
  }

  private get(sql: string, params?: any[]): any {
    return this.db.db.prepare(sql).get(...(params || []));
  }

  /**
   * Initialize ML-specific database tables
   */
  private initializeMLTables(): void {
    try {
      // ML Models table
      this.run(`
        CREATE TABLE IF NOT EXISTS ml_models (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          model_type TEXT NOT NULL,
          model_path TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_trained INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'training',
          metrics TEXT, -- JSON string
          metadata TEXT, -- JSON string
          UNIQUE(symbol, timeframe, model_type)
        )
      `);

      // Predictions table
      this.run(`
        CREATE TABLE IF NOT EXISTS predictions (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          prediction REAL NOT NULL,
          actual_price REAL,
          confidence REAL NOT NULL,
          time_horizon INTEGER NOT NULL,
          signals TEXT, -- JSON string
          model_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          resolved_at INTEGER,
          accuracy REAL,
          FOREIGN KEY (model_id) REFERENCES ml_models (id)
        )
      `);

      // Backtests table
      this.run(`
        CREATE TABLE IF NOT EXISTS backtests (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          strategy TEXT NOT NULL,
          config TEXT NOT NULL, -- JSON string
          result TEXT NOT NULL, -- JSON string
          created_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'running'
        )
      `);

      // Sentiment data table
      this.run(`
        CREATE TABLE IF NOT EXISTS sentiment_data (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          source TEXT NOT NULL,
          sentiment REAL NOT NULL,
          confidence REAL NOT NULL,
          volume INTEGER NOT NULL,
          content TEXT,
          metadata TEXT, -- JSON string
          timestamp INTEGER NOT NULL,
          INDEX(symbol, timestamp),
          INDEX(source, timestamp)
        )
      `);

      // Sentiment analysis table
      this.run(`
        CREATE TABLE IF NOT EXISTS sentiment_analysis (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          overall_score REAL NOT NULL,
          overall_confidence REAL NOT NULL,
          trend TEXT NOT NULL,
          volume INTEGER NOT NULL,
          fear_greed_value REAL NOT NULL,
          fear_greed_classification TEXT NOT NULL,
          technical_sentiment_score REAL NOT NULL,
          technical_signals TEXT, -- JSON string
          technical_confidence REAL NOT NULL,
          created_at INTEGER NOT NULL,
          metadata TEXT, -- JSON string
          INDEX(symbol, created_at)
        )
      `);

      // Model performance tracking
      this.run(`
        CREATE TABLE IF NOT EXISTS model_performance (
          id TEXT PRIMARY KEY,
          model_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          accuracy REAL NOT NULL,
          predictions_count INTEGER NOT NULL,
          avg_confidence REAL NOT NULL,
          FOREIGN KEY (model_id) REFERENCES ml_models (id),
          INDEX(model_id, timestamp)
        )
      `);

      this.logger.info('ML database tables initialized successfully', {
        service: 'MLDatabaseService'
      });
    } catch (error) {
      this.logger.error('Failed to initialize ML database tables', {
        error: (error as Error).message,
        service: 'MLDatabaseService'
      });
      throw error;
    }
  }

  /**
   * Save ML model information
   */
  public async saveMLModel(modelInfo: {
    symbol: string;
    timeframe: string;
    modelType: string;
    modelPath: string;
    createdAt: number;
    lastTrained: number;
    status: string;
    metrics?: ModelMetrics;
    metadata?: any;
  }): Promise<string> {
    try {
      const id = `${modelInfo.symbol}_${modelInfo.timeframe}_${modelInfo.modelType}_${Date.now()}`;

      this.run(`
        INSERT OR REPLACE INTO ml_models (
          id, symbol, timeframe, model_type, model_path, created_at,
          last_trained, status, metrics, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        modelInfo.symbol,
        modelInfo.timeframe,
        modelInfo.modelType,
        modelInfo.modelPath,
        modelInfo.createdAt,
        modelInfo.lastTrained,
        modelInfo.status,
        JSON.stringify(modelInfo.metrics),
        JSON.stringify(modelInfo.metadata)
      ]);

      this.logger.info('ML model saved successfully', {
        modelId: id,
        symbol: modelInfo.symbol,
        timeframe: modelInfo.timeframe,
        service: 'MLDatabaseService'
      });

      return id;
    } catch (error) {
      this.logger.error('Failed to save ML model', {
        error: (error as Error).message,
        modelInfo,
        service: 'MLDatabaseService'
      });
      throw error;
    }
  }

  /**
   * Get saved ML models
   */
  public async getSavedModels(): Promise<MLModelRecord[]> {
    try {
      const rows = await this.all(`
        SELECT * FROM ml_models
        ORDER BY last_trained DESC
      `);

      return rows.map(row => ({
        id: row.id,
        symbol: row.symbol,
        timeframe: row.timeframe,
        modelType: row.model_type,
        modelPath: row.model_path,
        createdAt: row.created_at,
        lastTrained: row.last_trained,
        status: row.status,
        metrics: row.metrics ? JSON.parse(row.metrics) : undefined,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      }));
    } catch (error) {
      this.logger.error('Failed to get saved models', {
        error: (error as Error).message,
        service: 'MLDatabaseService'
      });
      return [];
    }
  }

  /**
   * Save prediction result
   */
  public async savePrediction(result: PredictionResult, modelId: string): Promise<string> {
    try {
      const id = `prediction_${result.symbol}_${result.timestamp}_${Math.random().toString(36).substr(2, 9)}`;

      this.run(`
        INSERT INTO predictions (
          id, symbol, timeframe, prediction, confidence, time_horizon,
          signals, model_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        result.symbol,
        '1h', // Default timeframe
        result.prediction,
        result.confidence,
        result.timeHorizon,
        JSON.stringify(result.signals),
        modelId,
        result.timestamp
      ]);

      this.logger.debug('Prediction saved', {
        predictionId: id,
        symbol: result.symbol,
        confidence: result.confidence,
        service: 'MLDatabaseService'
      });

      return id;
    } catch (error) {
      this.logger.error('Failed to save prediction', {
        error: (error as Error).message,
        result,
        service: 'MLDatabaseService'
      });
      throw error;
    }
  }

  /**
   * Get recent predictions for a symbol
   */
  public async getRecentPredictions(symbol: string, hours: number = 24): Promise<PredictionRecord[]> {
    try {
      const since = Date.now() - (hours * 60 * 60 * 1000);

      const rows = await this.all(`
        SELECT * FROM predictions
        WHERE symbol = ? AND created_at > ?
        ORDER BY created_at DESC
      `, [symbol, since]);

      return rows.map(row => ({
        id: row.id,
        symbol: row.symbol,
        timeframe: row.timeframe,
        prediction: row.prediction,
        actualPrice: row.actual_price,
        confidence: row.confidence,
        timeHorizon: row.time_horizon,
        signals: row.signals ? JSON.parse(row.signals) : undefined,
        modelId: row.model_id,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        accuracy: row.accuracy
      }));
    } catch (error) {
      this.logger.error('Failed to get recent predictions', {
        error: (error as Error).message,
        symbol,
        hours,
        service: 'MLDatabaseService'
      });
      return [];
    }
  }

  /**
   * Update prediction with actual price and accuracy
   */
  public async updatePredictionAccuracy(
    predictionId: string,
    actualPrice: number
  ): Promise<void> {
    try {
      const prediction = await this.get('SELECT * FROM predictions WHERE id = ?', [predictionId]);
      if (!prediction) {
        throw new Error('Prediction not found');
      }

      const predictedPrice = prediction.prediction;
      const accuracy = 1 - Math.abs((actualPrice - predictedPrice) / predictedPrice);

      this.run(`
        UPDATE predictions
        SET actual_price = ?, resolved_at = ?, accuracy = ?
        WHERE id = ?
      `, [actualPrice, Date.now(), accuracy, predictionId]);

      this.logger.debug('Prediction accuracy updated', {
        predictionId,
        actualPrice,
        accuracy,
        service: 'MLDatabaseService'
      });
    } catch (error) {
      this.logger.error('Failed to update prediction accuracy', {
        error: (error as Error).message,
        predictionId,
        actualPrice,
        service: 'MLDatabaseService'
      });
      throw error;
    }
  }

  /**
   * Save backtest result
   */
  public async saveBacktest(
    symbol: string,
    timeframe: string,
    strategy: string,
    config: any,
    result: BacktestResult
  ): Promise<string> {
    try {
      const id = `backtest_${symbol}_${strategy}_${Date.now()}`;

      this.run(`
        INSERT INTO backtests (
          id, symbol, timeframe, strategy, config, result, created_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')
      `, [
        id,
        symbol,
        timeframe,
        strategy,
        JSON.stringify(config),
        JSON.stringify(result),
        Date.now()
      ]);

      this.logger.info('Backtest saved successfully', {
        backtestId: id,
        symbol,
        strategy,
        returnPercentage: result.summary.returnPercentage,
        service: 'MLDatabaseService'
      });

      return id;
    } catch (error) {
      this.logger.error('Failed to save backtest', {
        error: (error as Error).message,
        symbol,
        strategy,
        service: 'MLDatabaseService'
      });
      throw error;
    }
  }

  /**
   * Get backtest results for a symbol
   */
  public async getBacktestResults(symbol: string, limit: number = 10): Promise<BacktestRecord[]> {
    try {
      const rows = await this.all(`
        SELECT * FROM backtests
        WHERE symbol = ?
        ORDER BY created_at DESC
        LIMIT ?
      `, [symbol, limit]);

      return rows.map(row => ({
        id: row.id,
        symbol: row.symbol,
        timeframe: row.timeframe,
        strategy: row.strategy,
        config: JSON.parse(row.config),
        result: JSON.parse(row.result),
        createdAt: row.created_at,
        status: row.status
      }));
    } catch (error) {
      this.logger.error('Failed to get backtest results', {
        error: (error as Error).message,
        symbol,
        service: 'MLDatabaseService'
      });
      return [];
    }
  }

  /**
   * Save sentiment data
   */
  public async saveSentimentData(data: SentimentData): Promise<string> {
    try {
      const id = `sentiment_${data.source}_${data.symbol}_${data.timestamp}_${Math.random().toString(36).substr(2, 9)}`;

      this.run(`
        INSERT INTO sentiment_data (
          id, symbol, source, sentiment, confidence, volume, content, metadata, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        data.symbol,
        data.source,
        data.sentiment,
        data.confidence,
        data.volume,
        data.content,
        JSON.stringify(data.metadata),
        data.timestamp
      ]);

      this.logger.debug('Sentiment data saved', {
        sentimentId: id,
        symbol: data.symbol,
        source: data.source,
        sentiment: data.sentiment,
        service: 'MLDatabaseService'
      });

      return id;
    } catch (error) {
      this.logger.error('Failed to save sentiment data', {
        error: (error as Error).message,
        data,
        service: 'MLDatabaseService'
      });
      throw error;
    }
  }

  /**
   * Get recent sentiment data for a symbol
   */
  public async getRecentSentimentData(symbol: string, hours: number = 24): Promise<SentimentRecord[]> {
    try {
      const since = Date.now() - (hours * 60 * 60 * 1000);

      const rows = await this.all(`
        SELECT * FROM sentiment_data
        WHERE symbol = ? AND timestamp > ?
        ORDER BY timestamp DESC
      `, [symbol, since]);

      return rows.map(row => ({
        id: row.id,
        symbol: row.symbol,
        source: row.source,
        sentiment: row.sentiment,
        confidence: row.confidence,
        volume: row.volume,
        content: row.content,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        timestamp: row.timestamp
      }));
    } catch (error) {
      this.logger.error('Failed to get recent sentiment data', {
        error: (error as Error).message,
        symbol,
        hours,
        service: 'MLDatabaseService'
      });
      return [];
    }
  }

  /**
   * Save sentiment analysis
   */
  public async saveSentimentAnalysis(analysis: SentimentAnalysis): Promise<string> {
    try {
      const id = `sentiment_analysis_${analysis.symbol}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      this.run(`
        INSERT INTO sentiment_analysis (
          id, symbol, overall_score, overall_confidence, trend, volume,
          fear_greed_value, fear_greed_classification, technical_sentiment_score,
          technical_signals, technical_confidence, created_at, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        analysis.symbol,
        analysis.overall.score,
        analysis.overall.confidence,
        analysis.overall.trend,
        analysis.overall.volume,
        analysis.fearGreedIndex.value,
        analysis.fearGreedIndex.classification,
        analysis.technicalSentiment.score,
        JSON.stringify(analysis.technicalSentiment.signals),
        analysis.technicalSentiment.confidence,
        Date.now(),
        JSON.stringify(analysis)
      ]);

      this.logger.debug('Sentiment analysis saved', {
        analysisId: id,
        symbol: analysis.symbol,
        overallScore: analysis.overall.score,
        service: 'MLDatabaseService'
      });

      return id;
    } catch (error) {
      this.logger.error('Failed to save sentiment analysis', {
        error: (error as Error).message,
        analysis,
        service: 'MLDatabaseService'
      });
      throw error;
    }
  }

  /**
   * Get sentiment trend data
   */
  public async getSentimentTrend(symbol: string, hours: number = 24): Promise<any[]> {
    try {
      const since = Date.now() - (hours * 60 * 60 * 1000);

      const rows = await this.all(`
        SELECT
          created_at as timestamp,
          overall_score as sentiment_score,
          volume as mention_volume
        FROM sentiment_analysis
        WHERE symbol = ? AND created_at > ?
        ORDER BY created_at ASC
      `, [symbol, since]);

      return rows;
    } catch (error) {
      this.logger.error('Failed to get sentiment trend', {
        error: (error as Error).message,
        symbol,
        hours,
        service: 'MLDatabaseService'
      });
      return [];
    }
  }

  /**
   * Get technical indicators for sentiment analysis
   */
  public async getTechnicalIndicators(symbol: string, timeframe: string, limit: number = 100): Promise<any> {
    try {
      // This would typically pull from price data
      // For now, returning mock data structure
      const mockData = {
        close: Array.from({ length: limit }, () => 40000 + Math.random() * 10000),
        volume: Array.from({ length: limit }, () => 1000000 + Math.random() * 500000),
        rsi: Array.from({ length: limit }, () => 30 + Math.random() * 40),
        sma20: Array.from({ length: limit }, () => 41000 + Math.random() * 8000),
        sma50: Array.from({ length: limit }, () => 40500 + Math.random() * 9000)
      };

      return mockData;
    } catch (error) {
      this.logger.error('Failed to get technical indicators', {
        error: (error as Error).message,
        symbol,
        timeframe,
        service: 'MLDatabaseService'
      });
      return {};
    }
  }

  /**
   * Update model performance metrics
   */
  public async updateModelPerformance(
    modelId: string,
    accuracy: number,
    predictionsCount: number,
    avgConfidence: number
  ): Promise<void> {
    try {
      const id = `perf_${modelId}_${Date.now()}`;

      this.run(`
        INSERT INTO model_performance (
          id, model_id, timestamp, accuracy, predictions_count, avg_confidence
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [id, modelId, Date.now(), accuracy, predictionsCount, avgConfidence]);

      this.logger.debug('Model performance updated', {
        modelId,
        accuracy,
        predictionsCount,
        avgConfidence,
        service: 'MLDatabaseService'
      });
    } catch (error) {
      this.logger.error('Failed to update model performance', {
        error: (error as Error).message,
        modelId,
        service: 'MLDatabaseService'
      });
      throw error;
    }
  }

  /**
   * Get model performance history
   */
  public async getModelPerformance(modelId: string, days: number = 7): Promise<any[]> {
    try {
      const since = Date.now() - (days * 24 * 60 * 60 * 1000);

      const rows = await this.all(`
        SELECT * FROM model_performance
        WHERE model_id = ? AND timestamp > ?
        ORDER BY timestamp ASC
      `, [modelId, since]);

      return rows;
    } catch (error) {
      this.logger.error('Failed to get model performance', {
        error: (error as Error).message,
        modelId,
        days,
        service: 'MLDatabaseService'
      });
      return [];
    }
  }

  /**
   * Clean up old data
   */
  public async cleanupOldData(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

      // Clean up old sentiment data
      await this.run('DELETE FROM sentiment_data WHERE timestamp < ?', [cutoff]);

      // Clean up old sentiment analysis
      await this.run('DELETE FROM sentiment_analysis WHERE created_at < ?', [cutoff]);

      // Clean up old model performance data
      await this.run('DELETE FROM model_performance WHERE timestamp < ?', [cutoff]);

      this.logger.info('Old ML data cleaned up', {
        daysToKeep,
        cutoffDate: new Date(cutoff).toISOString(),
        service: 'MLDatabaseService'
      });
    } catch (error) {
      this.logger.error('Failed to cleanup old ML data', {
        error: (error as Error).message,
        daysToKeep,
        service: 'MLDatabaseService'
      });
      throw error;
    }
  }
}