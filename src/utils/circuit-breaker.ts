/**
 * Circuit Breaker Pattern Implementation
 *
 * Provides fault tolerance by wrapping calls to external services
 * and preventing cascading failures when services are unresponsive.
 */

export interface CircuitBreakerOptions {
  // Number of failures before opening the circuit
  failureThreshold?: number;
  // Time in milliseconds to wait before attempting to close the circuit
  recoveryTimeout?: number;
  // Time in milliseconds for monitoring period
  monitoringPeriod?: number;
  // Expected response time threshold in milliseconds
  expectedResponseTime?: number;
  // Number of successful calls during half-open state to close circuit
  successThreshold?: number;
  // Enable detailed logging
  enableLogging?: boolean;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  totalRequests: number;
  averageResponseTime: number;
  nextAttempt?: Date;
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: CircuitBreakerState,
    public readonly stats: CircuitBreakerStats
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private totalRequests: number = 0;
  private totalResponseTime: number = 0;
  private nextAttempt?: Date;
  private halfOpenSuccesses: number = 0;

  private readonly options: Required<CircuitBreakerOptions>;
  private readonly name: string;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      recoveryTimeout: options.recoveryTimeout || 60000, // 1 minute
      monitoringPeriod: options.monitoringPeriod || 10000, // 10 seconds
      expectedResponseTime: options.expectedResponseTime || 30000, // 30 seconds
      successThreshold: options.successThreshold || 3,
      enableLogging: options.enableLogging ?? true,
    };

    if (this.options.enableLogging) {
      console.log(`🔌 Circuit Breaker "${name}" initialized with options:`, this.options);
    }
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;
    const startTime = Date.now();

    try {
      // Check if circuit is open and we should fail fast
      if (this.state === CircuitBreakerState.OPEN) {
        if (this.shouldAttemptReset()) {
          this.transitionToHalfOpen();
        } else {
          throw new CircuitBreakerError(
            `Circuit breaker "${this.name}" is OPEN`,
            CircuitBreakerState.OPEN,
            this.getStats()
          );
        }
      }

      // Execute the function
      const result = await fn();
      const responseTime = Date.now() - startTime;

      // Record success
      this.recordSuccess(responseTime);

      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Record failure
      this.recordFailure(responseTime);

      // Re-throw the original error
      throw error;
    }
  }

  /**
   * Force open the circuit (useful for maintenance or known issues)
   */
  forceOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttempt = new Date(Date.now() + this.options.recoveryTimeout);

    if (this.options.enableLogging) {
      console.warn(`⚡ Circuit Breaker "${this.name}" forced OPEN`);
    }
  }

  /**
   * Reset the circuit to closed state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.halfOpenSuccesses = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextAttempt = undefined;
    this.totalRequests = 0;
    this.totalResponseTime = 0;

    if (this.options.enableLogging) {
      console.log(`✅ Circuit Breaker "${this.name}" reset to CLOSED`);
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      averageResponseTime: this.totalRequests > 0 ? this.totalResponseTime / this.totalRequests : 0,
      nextAttempt: this.nextAttempt,
    };
  }

  private shouldAttemptReset(): boolean {
    return this.nextAttempt ? Date.now() >= this.nextAttempt.getTime() : false;
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitBreakerState.HALF_OPEN;
    this.halfOpenSuccesses = 0;

    if (this.options.enableLogging) {
      console.log(`🔄 Circuit Breaker "${this.name}" transitioning to HALF_OPEN`);
    }
  }

  private recordSuccess(responseTime: number): void {
    this.successes++;
    this.lastSuccessTime = new Date();
    this.totalResponseTime += responseTime;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenSuccesses++;

      if (this.halfOpenSuccesses >= this.options.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on success in closed state
      this.failures = 0;
    }

    if (this.options.enableLogging && responseTime > this.options.expectedResponseTime) {
      console.warn(`⏱️  Circuit Breaker "${this.name}" slow response: ${responseTime}ms`);
    }
  }

  private recordFailure(responseTime: number): void {
    this.failures++;
    this.lastFailureTime = new Date();
    this.totalResponseTime += responseTime;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.state === CircuitBreakerState.CLOSED) {
      if (this.failures >= this.options.failureThreshold) {
        this.transitionToOpen();
      }
    }

    if (this.options.enableLogging) {
      console.error(`💥 Circuit Breaker "${this.name}" recorded failure (${this.failures}/${this.options.failureThreshold})`);
    }
  }

  private transitionToClosed(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = undefined;

    if (this.options.enableLogging) {
      console.log(`✅ Circuit Breaker "${this.name}" transitioned to CLOSED`);
    }
  }

  private transitionToOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttempt = new Date(Date.now() + this.options.recoveryTimeout);

    if (this.options.enableLogging) {
      console.error(`🚫 Circuit Breaker "${this.name}" transitioned to OPEN until ${this.nextAttempt.toISOString()}`);
    }
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
export class CircuitBreakerManager {
  private static instance: CircuitBreakerManager;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  private constructor() {}

  static getInstance(): CircuitBreakerManager {
    if (!CircuitBreakerManager.instance) {
      CircuitBreakerManager.instance = new CircuitBreakerManager();
    }
    return CircuitBreakerManager.instance;
  }

  /**
   * Get or create a circuit breaker
   */
  getCircuitBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, new CircuitBreaker(name, options));
    }
    return this.circuitBreakers.get(name)!;
  }

  /**
   * Get all circuit breaker statistics
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};

    for (const [name, breaker] of this.circuitBreakers.entries()) {
      stats[name] = breaker.getStats();
    }

    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Force open all circuit breakers (emergency stop)
   */
  forceOpenAll(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.forceOpen();
    }
  }

  /**
   * Get circuit breakers in specific state
   */
  getCircuitBreakersInState(state: CircuitBreakerState): string[] {
    const result: string[] = [];

    for (const [name, breaker] of this.circuitBreakers.entries()) {
      if (breaker.getStats().state === state) {
        result.push(name);
      }
    }

    return result;
  }
}

/**
 * Decorator for adding circuit breaker functionality to methods
 */
export function withCircuitBreaker(
  circuitBreakerName: string,
  options?: CircuitBreakerOptions
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const manager = CircuitBreakerManager.getInstance();
    const circuitBreaker = manager.getCircuitBreaker(circuitBreakerName, options);

    descriptor.value = async function (...args: any[]) {
      return circuitBreaker.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}