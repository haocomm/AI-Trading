/**
 * Health Check HTTP Server
 *
 * Express server providing comprehensive health monitoring endpoints
 * for production deployment and external monitoring systems.
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { HealthService } from '@/services/health.service';
import { tradingLogger } from '@/utils/logger';
import { environmentFeatures } from '@/config';
import { ErrorRecoveryService } from '@/services/error-recovery.service';

export class HealthServer {
  private app: Application;
  private server?: any;
  private healthService: HealthService;
  private port: number;

  constructor(port: number = parseInt(process.env.HEALTH_CHECK_PORT || '3001')) {
    this.app = express();
    this.port = port;
    this.healthService = HealthService.getInstance();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Start the health server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        tradingLogger.info(`Health server started on port ${this.port}`, {
          type: 'SERVER_START',
          port: this.port,
          environment: process.env.NODE_ENV,
        });

        // Log available endpoints
        this.logEndpoints();
        resolve();
      });

      this.server.on('error', (error: any) => {
        tradingLogger.error('Failed to start health server', {
          type: 'SERVER_ERROR',
          error: error.message,
          port: this.port,
        });
        reject(error);
      });
    });
  }

  /**
   * Stop the health server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          tradingLogger.info('Health server stopped', {
            type: 'SERVER_STOP',
            port: this.port,
          });
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    if (process.env.CORS_ENABLED === 'true') {
      const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];
      this.app.use(cors({
        origin: allowedOrigins,
        credentials: true,
      }));
    }

    // Rate limiting
    if (process.env.API_RATE_LIMIT_ENABLED === 'true') {
      const limiter = rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: parseInt(process.env.API_RATE_LIMIT_REQUESTS_PER_MINUTE || '100'),
        message: {
          error: 'Too many requests',
          retryAfter: 60,
        },
        standardHeaders: true,
        legacyHeaders: false,
      });

      this.app.use('/health', limiter);
      this.app.use('/metrics', limiter);
    }

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;

        tradingLogger.debug('Health endpoint request', {
          type: 'HTTP_REQUEST',
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        });
      });

      next();
    });
  }

  private setupRoutes(): void {
    // Basic liveness probe
    this.app.get('/health/live', async (req: Request, res: Response) => {
      try {
        const result = await this.healthService.getLivenessCheck();
        res.status(200).json(result);
      } catch (error) {
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Readiness probe
    this.app.get('/health/ready', async (req: Request, res: Response) => {
      try {
        const result = await this.healthService.getReadinessCheck();

        if (result.ready) {
          res.status(200).json(result);
        } else {
          res.status(503).json(result);
        }
      } catch (error) {
        res.status(503).json({
          status: 'not_ready',
          ready: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Comprehensive health check
    this.app.get('/health', async (req: Request, res: Response) => {
      try {
        const result = await this.healthService.getHealthCheck();

        const statusCode = result.status === 'healthy' ? 200 :
                          result.status === 'degraded' ? 200 : 503;

        res.status(statusCode).json(result);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // System metrics
    this.app.get('/health/system', async (req: Request, res: Response) => {
      try {
        const metrics = await this.healthService.getSystemMetrics();
        res.status(200).json({
          status: 'success',
          timestamp: new Date().toISOString(),
          data: metrics,
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Service health
    this.app.get('/health/services', async (req: Request, res: Response) => {
      try {
        const services = await this.healthService.getServiceHealth();
        res.status(200).json({
          status: 'success',
          timestamp: new Date().toISOString(),
          data: services,
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Application health
    this.app.get('/health/application', async (req: Request, res: Response) => {
      try {
        const appHealth = await this.healthService.getApplicationHealth();
        res.status(200).json({
          status: 'success',
          timestamp: new Date().toISOString(),
          data: appHealth,
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Prometheus metrics
    this.app.get('/metrics', (req: Request, res: Response) => {
      try {
        const metrics = this.healthService.getPrometheusMetrics();

        res.set('Content-Type', 'text/plain; version=0.0.4');
        res.status(200).send(metrics);
      } catch (error) {
        res.status(500).set('Content-Type', 'text/plain').send(
          '# Error generating metrics\n' +
          `# ${error instanceof Error ? error.message : 'Unknown error'}\n`
        );
      }
    });

    // Circuit breaker status
    this.app.get('/health/circuit-breakers', (req: Request, res: Response) => {
      try {
        const errorRecovery = ErrorRecoveryService.getInstance();
        const circuitBreakerStats = errorRecovery.getCircuitBreakerStats();

        res.status(200).json({
          status: 'success',
          timestamp: new Date().toISOString(),
          data: circuitBreakerStats,
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Recovery metrics
    this.app.get('/health/recovery', (req: Request, res: Response) => {
      try {
        const errorRecovery = ErrorRecoveryService.getInstance();
        const metrics = errorRecovery.getRecoveryMetrics();

        res.status(200).json({
          status: 'success',
          timestamp: new Date().toISOString(),
          data: metrics,
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Health statistics
    this.app.get('/health/stats', (req: Request, res: Response) => {
      try {
        const stats = this.healthService.getHealthStats();

        res.status(200).json({
          status: 'success',
          timestamp: new Date().toISOString(),
          data: stats,
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Cache management
    this.app.post('/health/cache/clear', (req: Request, res: Response) => {
      try {
        this.healthService.clearCache();

        res.status(200).json({
          status: 'success',
          timestamp: new Date().toISOString(),
          message: 'Health check cache cleared',
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Emergency reset (use with caution)
    this.app.post('/health/emergency/reset', (req: Request, res: Response) => {
      try {
        // Reset all recovery mechanisms
        const errorRecovery = ErrorRecoveryService.getInstance();
        errorRecovery.resetAll();

        // Clear health cache
        this.healthService.clearCache();

        tradingLogger.warn('Emergency reset triggered via health endpoint', {
          type: 'EMERGENCY_RESET',
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });

        res.status(200).json({
          status: 'success',
          timestamp: new Date().toISOString(),
          message: 'Emergency reset completed',
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // API documentation
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        title: 'AI Trading Platform - Health Check API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
          'GET /health': 'Comprehensive health check',
          'GET /health/live': 'Liveness probe',
          'GET /health/ready': 'Readiness probe',
          'GET /health/system': 'System metrics',
          'GET /health/services': 'Service health status',
          'GET /health/application': 'Application health',
          'GET /metrics': 'Prometheus metrics',
          'GET /health/circuit-breakers': 'Circuit breaker status',
          'GET /health/recovery': 'Error recovery metrics',
          'GET /health/stats': 'Health service statistics',
          'POST /health/cache/clear': 'Clear health check cache',
          'POST /health/emergency/reset': 'Emergency reset (use with caution)',
        },
      });
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString(),
      });
    });

    // Global error handler
    this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      tradingLogger.error('Health server error', {
        type: 'SERVER_ERROR',
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
      });

      res.status(error.status || 500).json({
        error: 'Internal server error',
        message: environmentFeatures.allowsDebugMode ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString(),
      });
    });
  }

  private logEndpoints(): void {
    const endpoints = [
      'GET  /health/live',
      'GET  /health/ready',
      'GET  /health',
      'GET  /health/system',
      'GET  /health/services',
      'GET  /health/application',
      'GET  /metrics',
      'GET  /health/circuit-breakers',
      'GET  /health/recovery',
      'GET  /health/stats',
      'POST /health/cache/clear',
      'POST /health/emergency/reset',
    ];

    tradingLogger.info('Health server endpoints available', {
      type: 'SERVER_ENDPOINTS',
      endpoints,
      port: this.port,
      baseUrl: `http://localhost:${this.port}/health`,
    });
  }
}

export default HealthServer;