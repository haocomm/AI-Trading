/**
 * Error Recovery Service
 *
 * Centralized error recovery and resilience coordination for the trading platform.
 * Integrates circuit breakers, retry mechanisms, and fallback strategies.
 */

import { CircuitBreaker, CircuitBreakerManager, CircuitBreakerState } from '@/utils/circuit-breaker';
import { retry, RetryOptions, RetryPresets, isRetryableError } from '@/utils/retry';
import { tradingConfig, environmentFeatures } from '@/config';
import { tradingLogger } from '@/utils/logger';

export interface RecoveryStrategy {
  name: string;
  priority: number;
  canHandle: (error: any) => boolean;
  execute: (error: any, context: any) => Promise<any>;
}

export interface ErrorContext {
  service: string;
  operation: string;
  symbol?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface RecoveryResult {
  strategy: string;
  succeeded: boolean;
  result?: any;
  error?: any;
  duration: number;
  attempts: number;
}

export class ErrorRecoveryService {
  private static instance: ErrorRecoveryService;
  private circuitBreakerManager: CircuitBreakerManager;
  private recoveryStrategies: Map<string, RecoveryStrategy[]> = new Map();
  private recoveryMetrics: Map<string, any> = new Map();

  private constructor() {
    this.circuitBreakerManager = CircuitBreakerManager.getInstance();
    this.initializeDefaultStrategies();
  }

  static getInstance(): ErrorRecoveryService {
    if (!ErrorRecoveryService.instance) {
      ErrorRecoveryService.instance = new ErrorRecoveryService();
    }
    return ErrorRecoveryService.instance;
  }

  /**
   * Execute an operation with automatic error recovery
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    options: {
      circuitBreaker?: string;
      retry?: RetryOptions;
      fallback?: () => Promise<T>;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: any;

    try {
      // Apply timeout if specified
      const operationWithTimeout = options.timeout ?
        this.withTimeout(operation, options.timeout) : operation;

      // Execute with circuit breaker if specified
      if (options.circuitBreaker) {
        const circuitBreaker = this.circuitBreakerManager.getCircuitBreaker(
          options.circuitBreaker,
          {
            failureThreshold: 5,
            recoveryTimeout: 60000,
            enableLogging: environmentFeatures.allowsDebugMode,
          }
        );

        return await circuitBreaker.execute(async () => {
          return this.executeWithRetry(operationWithTimeout, context, options.retry);
        });
      }

      // Execute with retry
      return await this.executeWithRetry(operationWithTimeout, context, options.retry);

    } catch (error) {
      lastError = error;
      const duration = Date.now() - startTime;

      // Log the failure
      tradingLogger.error('Operation failed', {
        context,
        error: error.message || error,
        duration,
        circuitBreaker: options.circuitBreaker,
      });

      // Try fallback strategy
      if (options.fallback) {
        try {
          tradingLogger.warn('Attempting fallback strategy', { context });
          const result = await options.fallback();

          tradingLogger.info('Fallback strategy succeeded', {
            context,
            duration: Date.now() - startTime,
          });

          return result;
        } catch (fallbackError) {
          tradingLogger.error('Fallback strategy failed', {
            context,
            fallbackError: fallbackError.message || fallbackError,
          });
        }
      }

      // Try recovery strategies
      const recoveryResult = await this.attemptRecovery(error, context);

      if (recoveryResult.succeeded && recoveryResult.result) {
        tradingLogger.info('Recovery strategy succeeded', {
          context,
          strategy: recoveryResult.strategy,
          duration: Date.now() - startTime,
        });

        return recoveryResult.result;
      }

      // No recovery strategy worked, re-throw the original error
      throw this.enhanceError(lastError, context, duration);

    } finally {
      // Update metrics
      this.updateMetrics(context, lastError, Date.now() - startTime);
    }
  }

  /**
   * Add a custom recovery strategy
   */
  addRecoveryStrategy(service: string, strategy: RecoveryStrategy): void {
    if (!this.recoveryStrategies.has(service)) {
      this.recoveryStrategies.set(service, []);
    }

    const strategies = this.recoveryStrategies.get(service)!;
    strategies.push(strategy);

    // Sort by priority (higher priority first)
    strategies.sort((a, b) => b.priority - a.priority);

    tradingLogger.debug('Recovery strategy added', {
      service,
      strategy: strategy.name,
      priority: strategy.priority,
    });
  }

  /**
   * Get recovery metrics
   */
  getRecoveryMetrics(service?: string): Record<string, any> {
    if (service) {
      return this.recoveryMetrics.get(service) || {};
    }

    const metrics: Record<string, any> = {};
    for (const [key, value] of this.recoveryMetrics.entries()) {
      metrics[key] = value;
    }
    return metrics;
  }

  /**
   * Get all circuit breaker statistics
   */
  getCircuitBreakerStats(): Record<string, any> {
    return this.circuitBreakerManager.getAllStats();
  }

  /**
   * Force open all circuit breakers (emergency stop)
   */
  emergencyStop(): void {
    this.circuitBreakerManager.forceOpenAll();
    tradingLogger.warn('Emergency stop triggered - all circuit breakers opened');
  }

  /**
   * Reset all recovery mechanisms
   */
  resetAll(): void {
    this.circuitBreakerManager.resetAll();
    this.recoveryMetrics.clear();
    tradingLogger.info('All recovery mechanisms reset');
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    retryOptions?: RetryOptions
  ): Promise<T> {
    const options = {
      ...RetryPresets.NETWORK,
      ...retryOptions,
      enableLogging: environmentFeatures.allowsDebugMode,
      onRetry: (attempt: number, error: any, delay: number) => {
        tradingLogger.warn('Retry attempt', {
          context,
          attempt,
          error: error.message || error,
          delay,
        });
      },
    };

    return await retry(operation, options);
  }

  private withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): () => Promise<T> {
    return async (): Promise<T> => {
      return Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    };
  }

  private async attemptRecovery(error: any, context: ErrorContext): Promise<RecoveryResult> {
    const strategies = this.recoveryStrategies.get(context.service) || [];

    for (const strategy of strategies) {
      if (strategy.canHandle(error)) {
        const startTime = Date.now();

        try {
          tradingLogger.info('Attempting recovery strategy', {
            context,
            strategy: strategy.name,
          });

          const result = await strategy.execute(error, context);
          const duration = Date.now() - startTime;

          return {
            strategy: strategy.name,
            succeeded: true,
            result,
            duration,
            attempts: 1,
          };

        } catch (recoveryError) {
          const duration = Date.now() - startTime;

          tradingLogger.warn('Recovery strategy failed', {
            context,
            strategy: strategy.name,
            error: recoveryError.message || recoveryError,
            duration,
          });

          // Continue to next strategy
        }
      }
    }

    return {
      strategy: 'none',
      succeeded: false,
      error,
      duration: 0,
      attempts: 0,
    };
  }

  private enhanceError(error: any, context: ErrorContext, duration: number): Error {
    const enhancedError = new Error(
      `Operation failed in ${context.service}.${context.operation}: ${error.message || error}`
    );

    enhancedError.name = error.name || 'OperationError';
    (enhancedError as any).context = context;
    (enhancedError as any).originalError = error;
    (enhancedError as any).duration = duration;
    (enhancedError as any).timestamp = new Date();

    return enhancedError;
  }

  private updateMetrics(context: ErrorContext, error: any, duration: number): void {
    if (!this.recoveryMetrics.has(context.service)) {
      this.recoveryMetrics.set(context.service, {
        totalOperations: 0,
        failedOperations: 0,
        totalDuration: 0,
        lastError: null,
        lastFailure: null,
      });
    }

    const metrics = this.recoveryMetrics.get(context.service)!;
    metrics.totalOperations++;
    metrics.totalDuration += duration;

    if (error) {
      metrics.failedOperations++;
      metrics.lastError = error;
      metrics.lastFailure = new Date();
    }
  }

  private initializeDefaultStrategies(): void {
    // AI Provider recovery strategies
    this.addRecoveryStrategy('ai-provider', {
      name: 'switch-to-backup-provider',
      priority: 100,
      canHandle: (error: any) => {
        return error.message?.includes('rate limit') ||
               error.message?.includes('quota exceeded') ||
               error.code === 429;
      },
      execute: async (error: any, context: any) => {
        // This would be implemented by the AI service to switch providers
        throw new Error('Provider switching not implemented in recovery service');
      },
    });

    this.addRecoveryStrategy('ai-provider', {
      name: 'use-cached-response',
      priority: 80,
      canHandle: (error: any) => {
        return error.message?.includes('timeout') ||
               error.message?.includes('network');
      },
      execute: async (error: any, context: any) => {
        // This would be implemented by the AI service to use cached responses
        throw new Error('Cache fallback not implemented in recovery service');
      },
    });

    // Exchange service recovery strategies
    this.addRecoveryStrategy('exchange', {
      name: 'switch-to-polling',
      priority: 90,
      canHandle: (error: any) => {
        return error.message?.includes('websocket') ||
               error.message?.includes('connection');
      },
      execute: async (error: any, context: any) => {
        // This would be implemented by the exchange service
        throw new Error('Polling fallback not implemented in recovery service');
      },
    });

    this.addRecoveryStrategy('exchange', {
      name: 'reduce-request-frequency',
      priority: 70,
      canHandle: (error: any) => {
        return error.code === -1003 || // Too much request weight
               error.code === 429;     // Rate limit
      },
      execute: async (error: any, context: any) => {
        // This would be implemented by the exchange service
        throw new Error('Frequency reduction not implemented in recovery service');
      },
    });

    // Decision service recovery strategies
    this.addRecoveryStrategy('decision', {
      name: 'conservative-hold',
      priority: 100,
      canHandle: (error: any) => true, // Always applicable
      execute: async (error: any, context: any) => {
        // Return a conservative HOLD decision
        return {
          decision: 'HOLD',
          confidence: 0.1,
          reason: 'Error recovery: conservative hold due to error',
          timestamp: new Date(),
          metadata: {
            originalError: error.message || error,
            recoveryStrategy: 'conservative-hold',
          },
        };
      },
    });

    // Trading service recovery strategies
    this.addRecoveryStrategy('trading', {
      name: 'emergency-stop',
      priority: 100,
      canHandle: (error: any) => {
        return error.message?.includes('insufficient balance') ||
               error.message?.includes('trading disabled') ||
               error.code === -1013; // Invalid quantity
      },
      execute: async (error: any, context: any) => {
        // This would implement emergency trading stop
        throw new Error('Emergency stop not implemented in recovery service');
      },
    });
  }
}

/**
 * Convenience function to execute operations with recovery
 */
export async function executeWithRecovery<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  options?: {
    circuitBreaker?: string;
    retry?: RetryOptions;
    fallback?: () => Promise<T>;
    timeout?: number;
  }
): Promise<T> {
  const recoveryService = ErrorRecoveryService.getInstance();
  return recoveryService.executeWithRecovery(operation, context, options);
}

/**
 * Decorator for adding automatic error recovery to methods
 */
export function withErrorRecovery(
  service: string,
  operation: string,
  options: {
    circuitBreaker?: string;
    retry?: RetryOptions;
    fallback?: () => Promise<any>;
    timeout?: number;
  } = {}
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const context: ErrorContext = {
        service,
        operation: operation || propertyKey,
        timestamp: new Date(),
        metadata: { args: args.length > 0 ? args[0] : undefined },
      };

      const recoveryService = ErrorRecoveryService.getInstance();
      return recoveryService.executeWithRecovery(
        () => originalMethod.apply(this, args),
        context,
        options
      );
    };

    return descriptor;
  };
}