import express from 'express';
import { MachineLearningService, PredictionResult } from '../services/ml.service';
import { BacktestingService, BacktestConfig, BacktestResult } from '../services/backtesting.service';
import { SentimentAnalysisService, SentimentAnalysis } from '../services/sentiment.service';
import { MLDatabaseService } from '../models/database-ml';
import DatabaseManager, { db } from '../models/database';
import { BinanceService } from '../services/binance.service';
import { logger } from '../utils/logger';

const router = express.Router();

// Initialize services
const dbService = db;
const mlDbService = new MLDatabaseService();
const binanceService = new BinanceService();
const mlService = new MachineLearningService(mlDbService, binanceService);
const backtestingService = new BacktestingService(mlDbService, binanceService, mlService);
const sentimentService = new SentimentAnalysisService(mlDbService);

/**
 * @route GET /api/ml/models
 * @desc Get all available ML models
 * @access Private
 */
router.get('/models', async (req, res) => {
  try {
    const models = mlService.getAvailableModels();
    const modelDetails = await mlDbService.getSavedModels();

    const response = {
      success: true,
      data: {
        available: models,
        details: modelDetails,
        count: models.length
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get ML models', {
      error: (error as Error).message,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve ML models'
    });
  }
});

/**
 * @route POST /api/ml/models
 * @desc Create and train a new ML model
 * @access Private
 */
router.post('/models', async (req, res) => {
  try {
    const { symbol, timeframe, modelType } = req.body;

    if (!symbol || !timeframe) {
      return res.status(400).json({
        success: false,
        error: 'Symbol and timeframe are required'
      });
    }

    logger.info('Creating new ML model', {
      symbol,
      timeframe,
      modelType: modelType || 'price-prediction',
      service: 'MLAPI'
    });

    // Start model training (this is async)
    const modelPromise = mlService.createModel(symbol, timeframe);

    // Respond immediately with training status
    res.json({
      success: true,
      data: {
        message: 'Model training started',
        symbol,
        timeframe,
        modelType: modelType || 'price-prediction',
        status: 'training'
      }
    });

    // Continue training in background
    try {
      await modelPromise;
      logger.info('Model training completed', {
        symbol,
        timeframe,
        service: 'MLAPI'
      });
    } catch (error) {
      logger.error('Model training failed', {
        symbol,
        timeframe,
        error: (error as Error).message,
        service: 'MLAPI'
      });
    }
  } catch (error) {
    logger.error('Failed to create ML model', {
      error: (error as Error).message,
      body: req.body,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create ML model'
    });
  }
});

/**
 * @route GET /api/ml/models/:symbol/metrics
 * @desc Get model performance metrics
 * @access Private
 */
router.get('/models/:symbol/metrics', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1h' } = req.query;

    const metrics = mlService.getModelMetrics(symbol, timeframe as string);
    const performanceHistory = await mlDbService.getModelPerformance(`${symbol}_${timeframe}`);

    res.json({
      success: true,
      data: {
        symbol,
        timeframe,
        currentMetrics: metrics,
        performanceHistory,
        trainingStatus: mlService.getTrainingStatus()
      }
    });
  } catch (error) {
    logger.error('Failed to get model metrics', {
      error: (error as Error).message,
      params: req.params,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve model metrics'
    });
  }
});

/**
 * @route POST /api/ml/predict
 * @desc Generate price prediction
 * @access Private
 */
router.post('/predict', async (req, res) => {
  try {
    const { symbol, timeframe = '1h', horizon = 60 } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required'
      });
    }

    const prediction: PredictionResult = await mlService.predictPrice(symbol, timeframe, horizon);

    // Save prediction to database
    await mlDbService.savePrediction(prediction, `${symbol}_${timeframe}`);

    res.json({
      success: true,
      data: prediction
    });
  } catch (error) {
    logger.error('Failed to generate prediction', {
      error: (error as Error).message,
      body: req.body,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate prediction'
    });
  }
});

/**
 * @route POST /api/ml/predict/batch
 * @desc Generate batch predictions for multiple symbols
 * @access Private
 */
router.post('/predict/batch', async (req, res) => {
  try {
    const { symbols, timeframe = '1h' } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        error: 'Symbols array is required'
      });
    }

    const predictions = await mlService.batchPredict(symbols, timeframe);

    // Save all predictions to database
    for (const prediction of predictions) {
      await mlDbService.savePrediction(prediction, `${prediction.symbol}_${timeframe}`);
    }

    res.json({
      success: true,
      data: {
        predictions,
        count: predictions.length,
        timeframe
      }
    });
  } catch (error) {
    logger.error('Failed to generate batch predictions', {
      error: (error as Error).message,
      body: req.body,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate batch predictions'
    });
  }
});

/**
 * @route GET /api/ml/predictions/:symbol
 * @desc Get recent predictions for a symbol
 * @access Private
 */
router.get('/predictions/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { hours = 24 } = req.query;

    const predictions = await mlDbService.getRecentPredictions(symbol, Number(hours));

    res.json({
      success: true,
      data: {
        symbol,
        hours: Number(hours),
        predictions,
        count: predictions.length
      }
    });
  } catch (error) {
    logger.error('Failed to get predictions', {
      error: (error as Error).message,
      params: req.params,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve predictions'
    });
  }
});

/**
 * @route POST /api/ml/backtest
 * @desc Run backtest
 * @access Private
 */
router.post('/backtest', async (req, res) => {
  try {
    const config: BacktestConfig = req.body;

    // Validate required fields
    if (!config.symbol || !config.startDate || !config.endDate || !config.strategy) {
      return res.status(400).json({
        success: false,
        error: 'Symbol, start date, end date, and strategy are required'
      });
    }

    logger.info('Starting backtest', {
      symbol: config.symbol,
      strategy: config.strategy.name,
      service: 'MLAPI'
    });

    // Start backtest (this is async and can take time)
    const backtestPromise = backtestingService.runBacktest(config);

    // For now, run synchronously and wait for result
    // In production, this should be handled with job queue
    const result: BacktestResult = await backtestPromise;

    // Save backtest result
    await mlDbService.saveBacktest(
      config.symbol,
      config.timeframe || '1h',
      config.strategy.name,
      config,
      result
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to run backtest', {
      error: (error as Error).message,
      body: req.body,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to run backtest'
    });
  }
});

/**
 * @route POST /api/ml/backtest/optimize
 * @desc Run strategy optimization
 * @access Private
 */
router.post('/backtest/optimize', async (req, res) => {
  try {
    const { baseConfig, parameterRanges, iterations = 10 } = req.body;

    if (!baseConfig || !parameterRanges) {
      return res.status(400).json({
        success: false,
        error: 'Base config and parameter ranges are required'
      });
    }

    logger.info('Starting strategy optimization', {
      baseStrategy: baseConfig.strategy?.name,
      iterations,
      service: 'MLAPI'
    });

    const results = await backtestingService.runOptimization(
      baseConfig,
      parameterRanges,
      iterations
    );

    res.json({
      success: true,
      data: {
        results,
        count: results.length,
        bestResult: results[0], // First result has best Sharpe ratio
        iterations
      }
    });
  } catch (error) {
    logger.error('Failed to run optimization', {
      error: (error as Error).message,
      body: req.body,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to run optimization'
    });
  }
});

/**
 * @route GET /api/ml/backtest/:symbol
 * @desc Get backtest results for a symbol
 * @access Private
 */
router.get('/backtest/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 10 } = req.query;

    const results = await mlDbService.getBacktestResults(symbol, Number(limit));

    res.json({
      success: true,
      data: {
        symbol,
        results,
        count: results.length
      }
    });
  } catch (error) {
    logger.error('Failed to get backtest results', {
      error: (error as Error).message,
      params: req.params,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve backtest results'
    });
  }
});

/**
 * @route GET /api/ml/sentiment/:symbol
 * @desc Get sentiment analysis for a symbol
 * @access Private
 */
router.get('/sentiment/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '24h' } = req.query;

    const analysis: SentimentAnalysis = await sentimentService.getSentimentAnalysis(
      symbol,
      timeframe as string
    );

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    logger.error('Failed to get sentiment analysis', {
      error: (error as Error).message,
      params: req.params,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sentiment analysis'
    });
  }
});

/**
 * @route GET /api/ml/sentiment/:symbol/trend
 * @desc Get sentiment trend over time
 * @access Private
 */
router.get('/sentiment/:symbol/trend', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { hours = 24 } = req.query;

    const trend = await sentimentService.getSentimentTrend(symbol, Number(hours));

    res.json({
      success: true,
      data: {
        symbol,
        hours: Number(hours),
        trend,
        count: trend.length
      }
    });
  } catch (error) {
    logger.error('Failed to get sentiment trend', {
      error: (error as Error).message,
      params: req.params,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sentiment trend'
    });
  }
});

/**
 * @route GET /api/ml/fear-greed
 * @desc Get Fear & Greed Index
 * @access Private
 */
router.get('/fear-greed', async (req, res) => {
  try {
    const fearGreed = await sentimentService.getFearGreedIndex();

    res.json({
      success: true,
      data: fearGreed
    });
  } catch (error) {
    logger.error('Failed to get Fear & Greed Index', {
      error: (error as Error).message,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve Fear & Greed Index'
    });
  }
});

/**
 * @route POST /api/ml/sentiment/monitoring/start
 * @desc Start sentiment monitoring
 * @access Private
 */
router.post('/sentiment/monitoring/start', async (req, res) => {
  try {
    const { symbols, intervalMinutes = 15 } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        error: 'Symbols array is required'
      });
    }

    await sentimentService.startMonitoring(symbols, intervalMinutes);

    res.json({
      success: true,
      data: {
        message: 'Sentiment monitoring started',
        symbols,
        intervalMinutes
      }
    });
  } catch (error) {
    logger.error('Failed to start sentiment monitoring', {
      error: (error as Error).message,
      body: req.body,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to start sentiment monitoring'
    });
  }
});

/**
 * @route POST /api/ml/sentiment/monitoring/stop
 * @desc Stop sentiment monitoring
 * @access Private
 */
router.post('/sentiment/monitoring/stop', async (req, res) => {
  try {
    await sentimentService.stopMonitoring();

    res.json({
      success: true,
      data: {
        message: 'Sentiment monitoring stopped'
      }
    });
  } catch (error) {
    logger.error('Failed to stop sentiment monitoring', {
      error: (error as Error).message,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to stop sentiment monitoring'
    });
  }
});

/**
 * @route GET /api/ml/status
 * @desc Get ML service status
 * @access Private
 */
router.get('/status', async (req, res) => {
  try {
    const trainingStatus = mlService.getTrainingStatus();
    const backtestProgress = backtestingService.getProgress();
    const models = mlService.getAvailableModels();

    res.json({
      success: true,
      data: {
        services: {
          ml: {
            status: 'active',
            modelsCount: models.length,
            trainingStatus
          },
          backtesting: {
            status: 'active',
            progress: backtestProgress
          },
          sentiment: {
            status: 'active'
          }
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: Date.now()
      }
    });
  } catch (error) {
    logger.error('Failed to get ML service status', {
      error: (error as Error).message,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve service status'
    });
  }
});

/**
 * @route POST /api/ml/cleanup
 * @desc Clean up old data
 * @access Private
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { daysToKeep = 30 } = req.body;

    await mlDbService.cleanupOldData(Number(daysToKeep));

    res.json({
      success: true,
      data: {
        message: 'Old data cleaned up successfully',
        daysToKeep: Number(daysToKeep)
      }
    });
  } catch (error) {
    logger.error('Failed to cleanup old data', {
      error: (error as Error).message,
      body: req.body,
      service: 'MLAPI'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup old data'
    });
  }
});

export default router;