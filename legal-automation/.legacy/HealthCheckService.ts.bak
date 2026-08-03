import { logger } from '@utils/logger';
import { CircuitBreaker } from '@utils/circuitBreaker';

// ============================================================================
// HEALTH CHECK SERVICE - System Observability & Monitoring
// ============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  checks: Record<string, CheckResult>;
  metadata: Record<string, any>;
}

export interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
  lastCheck: Date;
  consecutiveFailures: number;
}

export type HealthCheckFn = () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }>;

export class HealthCheckService {
  private checks: Map<string, { fn: HealthCheckFn; breaker: CircuitBreaker }> = new Map();
  private results: Map<string, CheckResult> = new Map();
  private startTime: Date = new Date();

  /**
   * Register a health check
   */
  registerCheck(name: string, fn: HealthCheckFn, timeout: number = 5000): void {
    const breaker = new CircuitBreaker({
      name: `health-check-${name}`,
      failureThreshold: 3,
      timeout: 60000,
    });

    this.checks.set(name, { fn, breaker });
    this.results.set(name, {
      status: 'pass',
      message: 'Not checked yet',
      duration: 0,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    });

    logger.info({ checkName: name }, 'Health check registered');
  }

  /**
   * Run all health checks
   */
  async runChecks(): Promise<HealthStatus> {
    const checkPromises = Array.from(this.checks.entries()).map(async ([name, { fn, breaker }]) => {
      const startTime = Date.now();

      try {
        const result = await breaker.execute(async () => {
          return fn();
        });

        const duration = Date.now() - startTime;

        this.results.set(name, {
          status: result.status,
          message: result.message,
          duration,
          lastCheck: new Date(),
          consecutiveFailures: 0,
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        const previousResult = this.results.get(name);
        const consecutiveFailures = (previousResult?.consecutiveFailures || 0) + 1;

        this.results.set(name, {
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration,
          lastCheck: new Date(),
          consecutiveFailures,
        });

        logger.warn(
          { checkName: name, error, consecutiveFailures },
          'Health check failed',
        );
      }
    });

    await Promise.all(checkPromises);

    return this.getStatus();
  }

  /**
   * Get current health status
   */
  getStatus(): HealthStatus {
    const checks = Object.fromEntries(this.results);
    const failedChecks = Array.from(this.results.values()).filter((r) => r.status === 'fail');
    const warnChecks = Array.from(this.results.values()).filter((r) => r.status === 'warn');

    let status: 'healthy' | 'degraded' | 'unhealthy';

    if (failedChecks.length > 0) {
      status = 'unhealthy';
    } else if (warnChecks.length > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      checks,
      metadata: {
        totalChecks: this.checks.size,
        passingChecks: Array.from(this.results.values()).filter((r) => r.status === 'pass').length,
        failingChecks: failedChecks.length,
        warningChecks: warnChecks.length,
      },
    };
  }

  /**
   * Get specific check result
   */
  getCheckResult(name: string): CheckResult | null {
    return this.results.get(name) || null;
  }

  /**
   * Reset check
   */
  resetCheck(name: string): void {
    this.results.delete(name);
    logger.info({ checkName: name }, 'Health check reset');
  }

  reset(): void {
    this.checks.clear();
    this.results.clear();
    this.startTime = new Date();
    logger.info('HealthCheckService reset');
  }
}

export const healthCheckService = new HealthCheckService();

/**
 * Default health checks
 */
export const setupDefaultChecks = () => {
  healthCheckService.registerCheck('memory', async () => {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (heapUsedPercent > 90) {
      return { status: 'fail', message: `Heap usage critical: ${heapUsedPercent.toFixed(2)}%` };
    }

    if (heapUsedPercent > 75) {
      return { status: 'warn', message: `Heap usage high: ${heapUsedPercent.toFixed(2)}%` };
    }

    return {
      status: 'pass',
      message: `Heap usage OK: ${heapUsedPercent.toFixed(2)}%`,
    };
  });

  healthCheckService.registerCheck('cpu', async () => {
    const usage = process.cpuUsage();
    const userCPU = usage.user / 1000000;

    if (userCPU > 100) {
      return { status: 'warn', message: `CPU usage high: ${userCPU.toFixed(2)}s` };
    }

    return {
      status: 'pass',
      message: `CPU usage OK: ${userCPU.toFixed(2)}s`,
    };
  });

  healthCheckService.registerCheck('uptime', async () => {
    const status = healthCheckService.getStatus();
    const uptimeHours = status.uptime / 3600000;

    return {
      status: 'pass',
      message: `Uptime: ${uptimeHours.toFixed(2)} hours`,
    };
  });

  logger.info('Default health checks setup complete');
};
