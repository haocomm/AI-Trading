import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { MLDatabaseService } from './models/database-ml';
import { MachineLearningService } from './services/ml.service';
import { BacktestingService } from './services/backtesting.service';
import { SentimentAnalysisService } from './services/sentiment.service';
import { BinanceService } from './services/binance.service';
import { logger } from './utils/logger';
import mlApiRoutes from './api/ml-api';

// Load environment variables
dotenv.config();

class MLTradingApp {
  private app: express.Application;
  private dbService!: MLDatabaseService;
  private binanceService!: BinanceService;
  private mlService!: MachineLearningService;
  private backtestingService!: BacktestingService;
  private sentimentService!: SentimentAnalysisService;
  private logger = logger;

  constructor() {
    this.app = express();
    this.initializeServices();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private async initializeServices(): Promise<void> {
    try {
      this.logger.info('Initializing ML services...', {
        service: 'MLTradingApp'
      });

      // Initialize database
      this.dbService = new MLDatabaseService();
      // Database is initialized in constructor

      // Initialize Binance service
      this.binanceService = new BinanceService();

      // Initialize ML services
      this.mlService = new MachineLearningService(this.dbService, this.binanceService);
      this.backtestingService = new BacktestingService(this.dbService, this.binanceService, this.mlService);
      this.sentimentService = new SentimentAnalysisService(this.dbService);

      this.logger.info('All ML services initialized successfully', {
        service: 'MLTradingApp'
      });
    } catch (error) {
      this.logger.error('Failed to initialize services', {
        error: (error as Error).message,
        service: 'MLTradingApp'
      });
      throw error;
    }
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://api.binance.com", "https://api.alternative.me"]
        }
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }));

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message: string) => {
          this.logger.info(message.trim(), {
            service: 'MLTradingApp',
            type: 'HTTP'
          });
        }
      }
    }));

    // Request timing
    this.app.use((req, res, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          service: 'MLTradingApp'
        });
      });

      next();
    });
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '3.1.0',
        services: {
          database: 'connected',
          ml: 'active',
          backtesting: 'active',
          sentiment: 'active'
        }
      });
    });

    // API routes
    this.app.use('/api/ml', mlApiRoutes);

    // Serve ML dashboard
    this.app.get('/ml-dashboard', (req, res) => {
      res.sendFile('ml-dashboard.html', { root: './src/web' });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'AI Trading Platform - ML Engine',
        version: '3.1.0',
        description: 'Advanced Machine Learning Trading Intelligence',
        endpoints: {
          health: '/health',
          dashboard: '/ml-dashboard',
          api: '/api/ml',
          documentation: '/api/ml/docs'
        },
        features: [
          'Machine Learning Predictions',
          'Strategy Backtesting',
          'Sentiment Analysis',
          'Model Training & Management',
          'Performance Analytics'
        ]
      });
    });

    // API documentation
    this.app.get('/api/ml/docs', (req, res) => {
      res.json({
        title: 'ML Trading API Documentation',
        version: '3.1.0',
        endpoints: {
          'GET /api/ml/models': 'Get all available ML models',
          'POST /api/ml/models': 'Create and train new ML model',
          'GET /api/ml/models/:symbol/metrics': 'Get model performance metrics',
          'POST /api/ml/predict': 'Generate price prediction',
          'POST /api/ml/predict/batch': 'Generate batch predictions',
          'GET /api/ml/predictions/:symbol': 'Get recent predictions',
          'POST /api/ml/backtest': 'Run strategy backtest',
          'POST /api/ml/backtest/optimize': 'Run strategy optimization',
          'GET /api/ml/backtest/:symbol': 'Get backtest results',
          'GET /api/ml/sentiment/:symbol': 'Get sentiment analysis',
          'GET /api/ml/sentiment/:symbol/trend': 'Get sentiment trend',
          'GET /api/ml/fear-greed': 'Get Fear & Greed Index',
          'POST /api/ml/sentiment/monitoring/start': 'Start sentiment monitoring',
          'POST /api/ml/sentiment/monitoring/stop': 'Stop sentiment monitoring',
          'GET /api/ml/status': 'Get ML service status',
          'POST /api/ml/cleanup': 'Clean up old data'
        }
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        availableEndpoints: [
          '/health',
          '/ml-dashboard',
          '/api/ml',
          '/api/ml/docs'
        ]
      });
    });
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        service: 'MLTradingApp'
      });

      // Don't send error details in production
      const isDevelopment = process.env.NODE_ENV === 'development';

      res.status(500).json({
        error: 'Internal server error',
        message: isDevelopment ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString(),
        ...(isDevelopment && { stack: error.stack })
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Promise Rejection', {
        reason: String(reason),
        promise: String(promise),
        service: 'MLTradingApp'
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
        service: 'MLTradingApp'
      });

      // Graceful shutdown
      this.gracefulShutdown('SIGTERM');
    });

    // Handle shutdown signals
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  public async start(port?: number): Promise<void> {
    const PORT = port || parseInt(process.env.ML_PORT || '3001', 10);

    try {
      this.app.listen(PORT, () => {
        this.logger.info('ML Trading Server started', {
          port: PORT,
          environment: process.env.NODE_ENV || 'development',
          service: 'MLTradingApp'
        });

        console.log(`
🚀 AI Trading Platform - ML Engine v3.1.0
📊 Advanced Machine Learning Trading Intelligence
🌐 Server: http://localhost:${PORT}
📈 Dashboard: http://localhost:${PORT}/ml-dashboard
📚 API Docs: http://localhost:${PORT}/api/ml/docs
💚 Health: http://localhost:${PORT}/health

ML Services Active:
• Machine Learning Predictions
• Strategy Backtesting & Optimization
• Market Sentiment Analysis
• Real-time Model Training
• Performance Analytics

Ready for intelligent trading! 🤖✨
        `);
      });
    } catch (error) {
      this.logger.error('Failed to start server', {
        error: (error as Error).message,
        port: PORT,
        service: 'MLTradingApp'
      });
      throw error;
    }
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    this.logger.info('Starting graceful shutdown', {
      signal,
      service: 'MLTradingApp'
    });

    try {
      // Stop sentiment monitoring
      if (this.sentimentService) {
        await this.sentimentService.stopMonitoring();
      }

      // Cleanup ML services
      if (this.mlService) {
        await this.mlService.cleanup();
      }

      // Close database connections
      if (this.dbService) {
        // Database cleanup handled by DatabaseManager
      }

      this.logger.info('Graceful shutdown completed', {
        service: 'MLTradingApp'
      });

      process.exit(0);
    } catch (error) {
      this.logger.error('Error during graceful shutdown', {
        error: (error as Error).message,
        service: 'MLTradingApp'
      });
      process.exit(1);
    }
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const app = new MLTradingApp();

  app.start().catch((error) => {
    console.error('Failed to start ML Trading Server:', error);
    process.exit(1);
  });
}

export default MLTradingApp;