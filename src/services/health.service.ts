/**
 * Health Monitoring Service
 *
 * Provides comprehensive health check endpoints and monitoring capabilities
 * for production deployment of the AI Trading Platform.
 */

import { performance } from 'perf_hooks';
import { tradingLogger } from '@/utils/logger';
import { ErrorRecoveryService } from './error-recovery.service';
import { tradingConfig, environmentFeatures } from '@/config';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  duration: number;
  details: Record<string, any>;
  metrics?: Record<string, number>;
  alerts?: string[];
}

export interface SystemMetrics {
  uptime: number;
  memoryUsage: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  cpuUsage: {
    percentage: number;
    loadAverage: number[];
  };
  diskUsage: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  processInfo: {
    pid: number;
    version: string;
    nodeVersion: string;
    platform: string;
  };
}

export interface ServiceHealth {
  binance: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    connected: boolean;
    lastCheck: string;
    responseTime?: number;
    error?: string;
  };
  database: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    connected: boolean;
    lastCheck: string;
    responseTime?: number;
    error?: string;
  };
  aiProviders: {
    [provider: string]: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      available: boolean;
      lastCheck: string;
      responseTime?: number;
      error?: string;
    };
  };
  websockets: {
    [exchange: string]: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      connected: boolean;
      lastMessage: string;
      messageCount: number;
      error?: string;
    };
  };
}

export interface ApplicationHealth {
  trading: {
    enabled: boolean;
    isRunning: boolean;
    lastTrade?: string;
    openPositions: number;
    dailyPnL: number;
    riskLimitUsage: number;
  };
  risk: {
    status: 'healthy' | 'warning' | 'critical';
    portfolioValue: number;
    maxDrawdown: number;
    dailyLoss: number;
    riskLimits: {
      used: number;
      limit: number;
      percentage: number;
    };
  };
  alerts: {
    active: number;
    critical: number;
    lastAlert?: string;
  };
}

export class HealthService {
  private static instance: HealthService;
  private healthCache: Map<string, { result: HealthCheckResult; expires: number }> = new Map();
  private startTime: number = Date.now();
  private metrics: {
    totalChecks: number;
    failedChecks: number;
    averageResponseTime: number;
    lastCheck: number;
  } = {
    totalChecks: 0,
    failedChecks: 0,
    averageResponseTime: 0,
    lastCheck: 0,
  };

  private constructor() {}

  static getInstance(): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService();
    }
    return HealthService.instance;
  }

  /**
   * Comprehensive health check
   */
  async getHealthCheck(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    const cacheKey = 'comprehensive';

    // Check cache for recent results (cache for 30 seconds)
    const cached = this.healthCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.result;
    }

    try {
      const details: Record<string, any> = {};
      const alerts: string[] = [];
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      // System health
      const systemMetrics = await this.getSystemMetrics();
      details.system = systemMetrics;

      if (systemMetrics.memoryUsage.percentage > 85) {
        alerts.push('High memory usage');
        overallStatus = 'degraded';
      }
      if (systemMetrics.diskUsage.percentage > 90) {
        alerts.push('Low disk space');
        overallStatus = 'degraded';
      }
      if (systemMetrics.cpuUsage.percentage > 80) {
        alerts.push('High CPU usage');
        overallStatus = 'degraded';
      }

      // Service health
      const serviceHealth = await this.getServiceHealth();
      details.services = serviceHealth;

      // Check critical services
      if (serviceHealth.binance.status === 'unhealthy') {
        alerts.push('Binance service unhealthy');
        overallStatus = 'unhealthy';
      }
      if (serviceHealth.database.status === 'unhealthy') {
        alerts.push('Database service unhealthy');
        overallStatus = 'unhealthy';
      }

      // Application health
      const applicationHealth = await this.getApplicationHealth();
      details.application = applicationHealth;

      if (applicationHealth.risk.status === 'critical') {
        alerts.push('Critical risk level');
        overallStatus = 'unhealthy';
      }

      // Circuit breaker status
      const errorRecovery = ErrorRecoveryService.getInstance();
      const circuitBreakerStats = errorRecovery.getCircuitBreakerStats();
      details.circuitBreakers = circuitBreakerStats;

      // Check for open circuit breakers
      const openCircuits = Object.entries(circuitBreakerStats)
        .filter(([_, stats]: [string, any]) => stats.state === 'OPEN');

      if (openCircuits.length > 0) {
        alerts.push(`${openCircuits.length} circuit breakers open`);
        overallStatus = 'degraded';
      }

      const duration = performance.now() - startTime;
      const result: HealthCheckResult = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        duration: Math.round(duration * 100) / 100,
        details,
        metrics: this.getPerformanceMetrics(),
        alerts: alerts.length > 0 ? alerts : undefined,
      };

      // Update metrics
      this.updateMetrics(duration);

      // Cache result
      this.healthCache.set(cacheKey, {
        result,
        expires: Date.now() + 30000, // 30 seconds
      });

      tradingLogger.performance('health_check_comprehensive', duration, {
        status: overallStatus,
        alerts: alerts.length,
      });

      return result;

    } catch (error) {
      const duration = performance.now() - startTime;

      tradingLogger.error('Health check failed', {
        error: error instanceof Error ? error.message : error,
        duration,
      });

      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        duration: Math.round(duration * 100) / 100,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        alerts: ['Health check system error'],
      };
    }
  }

  /**
   * Quick health check for load balancers
   */
  async getLivenessCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      // Just check if the process is responsive
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error('Service unavailable');
    }
  }

  /**
   * Readiness check - checks if the service is ready to accept traffic
   */
  async getReadinessCheck(): Promise<{ status: string; ready: boolean; checks: Record<string, boolean> }> {
    const checks: Record<string, boolean> = {};

    try {
      // Check database connection
      checks.database = await this.checkDatabaseHealth();

      // Check configuration
      checks.config = this.checkConfiguration();

      // Check critical services
      checks.binance = await this.checkBinanceHealth();

      const ready = Object.values(checks).every(check => check === true);

      return {
        status: ready ? 'ready' : 'not_ready',
        ready,
        checks,
      };
    } catch (error) {
      return {
        status: 'not_ready',
        ready: false,
        checks,
      };
    }
  }

  /**
   * System metrics for monitoring
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAvg = require('os').loadavg();

    try {
      // Get disk usage
      const { stdout } = await execAsync('df -k .');
      const diskLines = stdout.trim().split('\n');
      const diskData = diskLines[diskLines.length - 1].split(/\s+/);
      const diskTotal = parseInt(diskData[1]) * 1024;
      const diskUsed = parseInt(diskData[2]) * 1024;
      const diskFree = parseInt(diskData[3]) * 1024;

      return {
        uptime: process.uptime(),
        memoryUsage: {
          total: memUsage.heapTotal,
          used: memUsage.heapUsed,
          free: memUsage.heapTotal - memUsage.heapUsed,
          percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
        },
        cpuUsage: {
          percentage: Math.round((cpuUsage.user + cpuUsage.system) / 1000000), // Convert to percentage
          loadAverage: loadAvg,
        },
        diskUsage: {
          total: diskTotal,
          used: diskUsed,
          free: diskFree,
          percentage: Math.round((diskUsed / diskTotal) * 100),
        },
        processInfo: {
          pid: process.pid,
          version: process.env.APP_VERSION || '1.0.0',
          nodeVersion: process.version,
          platform: process.platform,
        },
      };
    } catch (error) {
      // Fallback if disk check fails
      return {
        uptime: process.uptime(),
        memoryUsage: {
          total: memUsage.heapTotal,
          used: memUsage.heapUsed,
          free: memUsage.heapTotal - memUsage.heapUsed,
          percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
        },
        cpuUsage: {
          percentage: Math.round((cpuUsage.user + cpuUsage.system) / 1000000),
          loadAverage: loadAvg,
        },
        diskUsage: {
          total: 0,
          used: 0,
          free: 0,
          percentage: 0,
        },
        processInfo: {
          pid: process.pid,
          version: process.env.APP_VERSION || '1.0.0',
          nodeVersion: process.version,
          platform: process.platform,
        },
      };
    }
  }

  /**
   * Service health status
   */
  async getServiceHealth(): Promise<ServiceHealth> {
    const startTime = performance.now();

    const [binanceHealth, databaseHealth, aiHealth] = await Promise.allSettled([
      this.checkBinanceHealth(),
      this.checkDatabaseHealth(),
      this.checkAIProvidersHealth(),
    ]);

    return {
      binance: {
        status: binanceHealth.status === 'fulfilled' && binanceHealth.value ? 'healthy' : 'unhealthy',
        connected: binanceHealth.status === 'fulfilled' ? binanceHealth.value : false,
        lastCheck: new Date().toISOString(),
        error: binanceHealth.status === 'rejected' ? binanceHealth.reason?.message : undefined,
      },
      database: {
        status: databaseHealth.status === 'fulfilled' && databaseHealth.value ? 'healthy' : 'unhealthy',
        connected: databaseHealth.status === 'fulfilled' ? databaseHealth.value : false,
        lastCheck: new Date().toISOString(),
        error: databaseHealth.status === 'rejected' ? databaseHealth.reason?.message : undefined,
      },
      aiProviders: aiHealth.status === 'fulfilled' ? aiHealth.value : {},
      websockets: {
        // WebSocket health would be checked by the actual service
        binance: {
          status: 'healthy', // Placeholder
          connected: true,
          lastMessage: new Date().toISOString(),
          messageCount: 0,
        },
      },
    };
  }

  /**
   * Application-specific health
   */
  async getApplicationHealth(): Promise<ApplicationHealth> {
    try {
      // This would integrate with the actual trading bot
      return {
        trading: {
          enabled: tradingConfig.tradingEnabled,
          isRunning: true, // Would come from actual bot state
          openPositions: 0,
          dailyPnL: 0,
          riskLimitUsage: 0,
        },
        risk: {
          status: 'healthy',
          portfolioValue: 0,
          maxDrawdown: 0,
          dailyLoss: 0,
          riskLimits: {
            used: 0,
            limit: tradingConfig.maxDailyLossPercentage,
            percentage: 0,
          },
        },
        alerts: {
          active: 0,
          critical: 0,
        },
      };
    } catch (error) {
      return {
        trading: {
          enabled: false,
          isRunning: false,
          openPositions: 0,
          dailyPnL: 0,
          riskLimitUsage: 100,
        },
        risk: {
          status: 'critical',
          portfolioValue: 0,
          maxDrawdown: 0,
          dailyLoss: 0,
          riskLimits: {
            used: 100,
            limit: tradingConfig.maxDailyLossPercentage,
            percentage: 100,
          },
        },
        alerts: {
          active: 1,
          critical: 1,
        },
      };
    }
  }

  /**
   * Prometheus metrics endpoint
   */
  getPrometheusMetrics(): string {
    const systemMetrics = this.getSystemMetrics();
    const performanceMetrics = this.getPerformanceMetrics();

    const metrics = [
      `# HELP ai_trading_uptime_seconds Uptime of the trading bot in seconds`,
      `# TYPE ai_trading_uptime_seconds counter`,
      `ai_trading_uptime_seconds ${systemMetrics.then ? 0 : systemMetrics.uptime}`,
      '',
      `# HELP ai_trading_memory_usage_percentage Memory usage percentage`,
      `# TYPE ai_trading_memory_usage_percentage gauge`,
      `ai_trading_memory_usage_percentage ${systemMetrics.then ? 0 : systemMetrics.memoryUsage.percentage}`,
      '',
      `# HELP ai_trading_health_checks_total Total number of health checks`,
      `# TYPE ai_trading_health_checks_total counter`,
      `ai_trading_health_checks_total ${this.metrics.totalChecks}`,
      '',
      `# HELP ai_trading_health_checks_failed_total Total number of failed health checks`,
      `# TYPE ai_trading_health_checks_failed_total counter`,
      `ai_trading_health_checks_failed_total ${this.metrics.failedChecks}`,
      '',
      `# HELP ai_trading_average_response_time_ms Average health check response time in milliseconds`,
      `# TYPE ai_trading_average_response_time_ms gauge`,
      `ai_trading_average_response_time_ms ${this.metrics.averageResponseTime}`,
      '',
    ];

    return metrics.join('\n');
  }

  private async checkBinanceHealth(): Promise<boolean> {
    // This would integrate with the actual Binance service
    return true; // Placeholder
  }

  private async checkDatabaseHealth(): Promise<boolean> {
    // This would check actual database connectivity
    return true; // Placeholder
  }

  private async checkAIProvidersHealth(): Promise<Record<string, any>> {
    // This would check AI provider health
    return {
      gemini: {
        status: 'healthy',
        available: true,
        lastCheck: new Date().toISOString(),
      },
    };
  }

  private checkConfiguration(): boolean {
    try {
      // Basic configuration validation
      return !!(process.env.BINANCE_API_KEY && process.env.GEMINI_API_KEY);
    } catch {
      return false;
    }
  }

  private getPerformanceMetrics(): Record<string, number> {
    return {
      uptime: process.uptime(),
      totalHealthChecks: this.metrics.totalChecks,
      failedHealthChecks: this.metrics.failedChecks,
      averageResponseTime: this.metrics.averageResponseTime,
      lastHealthCheck: this.metrics.lastCheck,
      memoryUsage: process.memoryUsage().heapUsed,
      cpuUsage: process.cpuUsage().user,
    };
  }

  private updateMetrics(duration: number): void {
    this.metrics.totalChecks++;
    this.metrics.lastCheck = Date.now();

    // Update average response time
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalChecks - 1) + duration) /
      this.metrics.totalChecks;
  }

  /**
   * Clear health check cache
   */
  clearCache(): void {
    this.healthCache.clear();
    tradingLogger.info('Health check cache cleared');
  }

  /**
   * Get health statistics
   */
  getHealthStats(): {
    uptime: number;
    metrics: typeof this.metrics;
    cacheSize: number;
  } {
    return {
      uptime: Date.now() - this.startTime,
      metrics: { ...this.metrics },
      cacheSize: this.healthCache.size,
    };
  }
}

export default HealthService;