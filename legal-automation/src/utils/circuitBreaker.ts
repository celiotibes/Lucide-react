import { logger } from '@utils/logger';

// ============================================================================
// CIRCUIT BREAKER - Resilience & Fault Tolerance
// ============================================================================

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  name?: string;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private nextAttemptTime: number = Date.now();

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly name: string;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold || 5;
    this.successThreshold = config.successThreshold || 2;
    this.timeout = config.timeout || 60000;
    this.name = config.name || 'CircuitBreaker';
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`${this.name} is OPEN. Circuit breaker timeout remaining.`);
      }

      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info({ name: this.name }, 'Circuit breaker transitioning to HALF_OPEN');
    }

    try {
      const result = await fn();

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        logger.info({ name: this.name }, 'Circuit breaker CLOSED after recovery');
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.timeout;
      logger.warn(
        { name: this.name, retryAt: new Date(this.nextAttemptTime) },
        'Circuit breaker OPEN after failure in HALF_OPEN state',
      );
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.timeout;
      logger.warn(
        { name: this.name, failures: this.failureCount, retryAt: new Date(this.nextAttemptTime) },
        'Circuit breaker OPEN after threshold exceeded',
      );
    }
  }

  /**
   * Get circuit breaker state
   */
  getState(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime?: Date;
    nextAttemptTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = Date.now();
    logger.info({ name: this.name }, 'Circuit breaker reset');
  }
}

/**
 * Create circuit breaker decorator
 */
export function withCircuitBreaker(config?: CircuitBreakerConfig) {
  const breaker = new CircuitBreaker(config);

  return function <T extends any[], R>(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: T): Promise<R> {
      return breaker.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}

// Pre-configured instances for critical services
export const webhookBreaker = new CircuitBreaker({
  name: 'webhooks',
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000,
});

export const databaseBreaker = new CircuitBreaker({
  name: 'database',
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000,
});

export const externalAPIBreaker = new CircuitBreaker({
  name: 'external-api',
  failureThreshold: 4,
  successThreshold: 2,
  timeout: 45000,
});
