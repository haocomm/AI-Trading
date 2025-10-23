/**
 * Retry Mechanism Implementation
 *
 * Provides configurable retry logic with exponential backoff
 * for handling transient failures in API calls and operations.
 */

export interface RetryOptions {
  // Maximum number of retry attempts
  maxAttempts?: number;
  // Initial delay in milliseconds
  initialDelay?: number;
  // Maximum delay in milliseconds
  maxDelay?: number;
  // Backoff multiplier (default: 2 for exponential backoff)
  backoffMultiplier?: number;
  // Jitter factor to add randomness (0-1)
  jitterFactor?: number;
  // Function to determine if error is retryable
  retryablePredicate?: (error: any) => boolean;
  // Function to call on each retry attempt
  onRetry?: (attempt: number, error: any, delay: number) => void;
  // Enable detailed logging
  enableLogging?: boolean;
}

export interface RetryAttempt {
  attempt: number;
  delay: number;
  error?: any;
  timestamp: Date;
}

export interface RetryResult<T> {
  result?: T;
  error?: any;
  attempts: RetryAttempt[];
  totalDuration: number;
  succeeded: boolean;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: RetryAttempt[],
    public readonly originalError: any
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Default retryable error predicate
 */
export function isRetryableError(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNRESET' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND') {
    return true;
  }

  // HTTP status codes that are typically retryable
  if (error.response?.status) {
    const status = error.response.status;
    return status === 408 || // Request Timeout
           status === 429 || // Too Many Requests (Rate Limited)
           (status >= 500 && status < 600); // Server errors
  }

  // Specific API error types
  if (error.name === 'RateLimitError' ||
      error.name === 'TimeoutError' ||
      error.name === 'NetworkError') {
    return true;
  }

  // AI provider specific errors
  if (error.message?.includes('rate limit') ||
      error.message?.includes('quota exceeded') ||
      error.message?.includes('temporary failure') ||
      error.message?.includes('service unavailable')) {
    return true;
  }

  // Exchange API specific errors
  if (error.code === -1021 || // Timestamp for this request is outside of the recvWindow
      error.code === -1003 || // Too much request weight used
      error.code === -1016 || // This service is no longer available
      error.code === -2013 || // No exists
      error.code === -2014 || // API-key format invalid
      error.code === -1021) { // Timestamp for this request
    return true;
  }

  return false;
}

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number,
  jitterFactor: number
): number {
  // Calculate exponential backoff
  const exponentialDelay = initialDelay * Math.pow(multiplier, attempt - 1);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter to prevent thundering herd
  const jitter = jitterFactor > 0 ?
    Math.random() * cappedDelay * jitterFactor : 0;

  return Math.floor(cappedDelay + jitter);
}

/**
 * Retry function with configurable options
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts: Required<RetryOptions> = {
    maxAttempts: options.maxAttempts || 3,
    initialDelay: options.initialDelay || 1000,
    maxDelay: options.maxDelay || 30000,
    backoffMultiplier: options.backoffMultiplier || 2,
    jitterFactor: options.jitterFactor || 0.1,
    retryablePredicate: options.retryablePredicate || isRetryableError,
    onRetry: options.onRetry || (() => {}),
    enableLogging: options.enableLogging ?? true,
  };

  const attempts: RetryAttempt[] = [];
  const startTime = Date.now();
  let lastError: any;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const attemptStart = Date.now();

    try {
      if (opts.enableLogging && attempt > 1) {
        console.log(`🔄 Retry attempt ${attempt}/${opts.maxAttempts}`);
      }

      const result = await fn();
      const duration = Date.now() - attemptStart;

      attempts.push({
        attempt,
        delay: 0,
        timestamp: new Date(),
      });

      if (opts.enableLogging && attempt > 1) {
        console.log(`✅ Retry succeeded on attempt ${attempt} after ${duration}ms`);
      }

      return result;

    } catch (error) {
      const duration = Date.now() - attemptStart;
      lastError = error;

      attempts.push({
        attempt,
        delay: 0,
        error,
        timestamp: new Date(),
      });

      // Check if this is the last attempt or if error is not retryable
      if (attempt === opts.maxAttempts || !opts.retryablePredicate(error)) {
        if (opts.enableLogging) {
          console.error(`❌ Retry failed after ${attempt} attempts. Last error:`, (error as Error).message || error);
        }
        throw new RetryError(
          `Retry failed after ${attempt} attempts`,
          attempts,
          error
        );
      }

      // Calculate delay for next attempt
      const delay = calculateBackoffDelay(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffMultiplier,
        opts.jitterFactor
      );

      // Update the attempt record with delay
      attempts[attempts.length - 1].delay = delay;

      // Call onRetry callback
      opts.onRetry(attempt, error, delay);

      if (opts.enableLogging) {
        console.warn(`⏳ Retry attempt ${attempt} failed, retrying in ${delay}ms. Error: ${(error as Error).message || error}`);
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Retry with detailed result information
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();

  try {
    const result = await retry(fn, options);
    const totalDuration = Date.now() - startTime;

    return {
      result,
      totalDuration,
      attempts: [], // Will be populated by retry function
      succeeded: true,
    };
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    if (error instanceof RetryError) {
      return {
        error: error.originalError,
        totalDuration,
        attempts: error.attempts,
        succeeded: false,
      };
    }

    return {
      error,
      totalDuration,
      attempts: [],
      succeeded: false,
    };
  }
}

/**
 * Decorator for adding retry functionality to methods
 */
export function withRetry(options: RetryOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return retry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Retry configuration presets for different scenarios
 */
export const RetryPresets = {
  // For network calls that might have temporary issues
  NETWORK: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  },

  // For AI provider calls with rate limits
  AI_PROVIDER: {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
  },

  // For exchange API calls with strict rate limits
  EXCHANGE_API: {
    maxAttempts: 2,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  },

  // For database operations
  DATABASE: {
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.05,
  },

  // For WebSocket reconnections
  WEBSOCKET: {
    maxAttempts: 10,
    initialDelay: 1000,
    maxDelay: 60000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.3,
  },

  // For critical operations that need more resilience
  CRITICAL: {
    maxAttempts: 7,
    initialDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 2,
    jitterFactor: 0.15,
  },
};

/**
 * Utility function to create retry options for specific error types
 */
export function createRetryOptionsForErrorType(
  errorType: 'network' | 'rate_limit' | 'timeout' | 'server_error',
  baseOptions: RetryOptions = {}
): RetryOptions {
  const presets = {
    network: RetryPresets.NETWORK,
    rate_limit: RetryPresets.AI_PROVIDER,
    timeout: RetryPresets.NETWORK,
    server_error: RetryPresets.EXCHANGE_API,
  };

  return { ...presets[errorType], ...baseOptions };
}