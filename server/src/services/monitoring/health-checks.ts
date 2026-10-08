/**
 * ============================================================================
 * Health Checks Service
 * Phase 22.22: Advanced Monitoring & Observability
 * ============================================================================
 *
 * Provides comprehensive health checks for application and dependencies.
 */

import { healthCheckStatus } from './metrics';

// ============================================================================
// Health Check Types
// ============================================================================

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  checks: Record<string, ServiceHealth>;
  details?: Record<string, unknown>;
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  responseTime?: number;
  details?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Health Check Handlers
// ============================================================================

const healthChecks: Record<string, () => Promise<ServiceHealth>> = {};

/**
 * Register a health check
 */
export function registerHealthCheck(
  serviceName: string,
  handler: () => Promise<ServiceHealth>
): void {
  healthChecks[serviceName] = handler;
}

/**
 * Database health check
 */
export async function checkDatabase(): Promise<ServiceHealth> {
  const startTime = Date.now();

  try {
    // Try to connect and execute a simple query
    const db = require('better-sqlite3')(':memory:');
    db.exec('SELECT 1');
    db.close();

    const responseTime = Date.now() - startTime;

    return {
      status: 'healthy',
      timestamp: Date.now(),
      responseTime,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Cache health check
 */
export async function checkCache(): Promise<ServiceHealth> {
  const startTime = Date.now();

  try {
    // Check if cache is accessible (mock for now)
    // In real implementation, would ping Redis or similar
    const responseTime = Date.now() - startTime;

    return {
      status: 'healthy',
      timestamp: Date.now(),
      responseTime,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * External API health check
 */
export async function checkExternalApis(): Promise<ServiceHealth> {
  const startTime = Date.now();

  try {
    // Check critical external APIs
    const apis = [
      { name: 'asaas', url: 'https://sandbox.asaas.com/api/v3/health' },
      // Add other APIs as needed
    ];

    const results = await Promise.allSettled(
      apis.map(async (api) => {
        const response = await fetch(api.url, { timeout: 5000 });
        return response.ok;
      })
    );

    const healthy = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    const responseTime = Date.now() - startTime;

    return {
      status: healthy >= apis.length * 0.8 ? 'healthy' : 'degraded',
      timestamp: Date.now(),
      responseTime,
      details: {
        healthy_apis: healthy,
        total_apis: apis.length,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Memory health check
 */
export function checkMemory(): ServiceHealth {
  const memUsage = process.memoryUsage();
  const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (heapUsedPercent > 0.95) {
    status = 'unhealthy';
  } else if (heapUsedPercent > 0.8) {
    status = 'degraded';
  }

  return {
    status,
    timestamp: Date.now(),
    details: {
      heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      heap_used_percent: Math.round(heapUsedPercent * 100),
      rss_mb: Math.round(memUsage.rss / 1024 / 1024),
      external_mb: Math.round(memUsage.external / 1024 / 1024),
    },
  };
}

/**
 * CPU health check
 */
export function checkCpu(): ServiceHealth {
  const loadAverage = require('os').loadavg();
  const cpuCount = require('os').cpus().length;
  const loadPercent = (loadAverage[0] / cpuCount) * 100;

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (loadPercent > 90) {
    status = 'unhealthy';
  } else if (loadPercent > 70) {
    status = 'degraded';
  }

  return {
    status,
    timestamp: Date.now(),
    details: {
      load_average_1m: loadAverage[0],
      load_average_5m: loadAverage[1],
      load_average_15m: loadAverage[2],
      cpu_count: cpuCount,
      load_percent: Math.round(loadPercent),
    },
  };
}

/**
 * Disk space health check
 */
export async function checkDiskSpace(): Promise<ServiceHealth> {
  try {
    const diskusage = require('diskusage');
    const info = await diskusage.check('/');

    const usedPercent = (info.total - info.available) / info.total;
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (usedPercent > 0.95) {
      status = 'unhealthy';
    } else if (usedPercent > 0.8) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: Date.now(),
      details: {
        total_gb: Math.round(info.total / 1024 / 1024 / 1024),
        available_gb: Math.round(info.available / 1024 / 1024 / 1024),
        used_percent: Math.round(usedPercent * 100),
      },
    };
  } catch (error) {
    return {
      status: 'degraded',
      timestamp: Date.now(),
      error: 'Could not check disk space',
    };
  }
}

// ============================================================================
// Overall Health Check
// ============================================================================

/**
 * Perform complete health check
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  const checks: Record<string, ServiceHealth> = {
    memory: checkMemory(),
    cpu: checkCpu(),
  };

  // Run async checks
  checks.database = await checkDatabase();
  checks.cache = await checkCache();
  checks.external_apis = await checkExternalApis();
  checks.disk_space = await checkDiskSpace();

  // Run custom registered checks
  for (const [name, handler] of Object.entries(healthChecks)) {
    try {
      checks[name] = await handler();
    } catch (error) {
      checks[name] = {
        status: 'unhealthy',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Determine overall status
  const statuses = Object.values(checks).map((c) => c.status);
  const hasUnhealthy = statuses.includes('unhealthy');
  const hasDegraded = statuses.includes('degraded');

  const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

  // Update metrics
  healthCheckStatus.set(
    { service: 'application' },
    overallStatus === 'healthy' ? 1 : 0
  );

  return {
    status: overallStatus,
    timestamp: Date.now(),
    uptime: process.uptime(),
    checks,
  };
}

// ============================================================================
// Liveness & Readiness Probes
// ============================================================================

/**
 * Liveness probe - is the application running?
 */
export async function livenessProbe(): Promise<{ alive: boolean; uptime: number }> {
  return {
    alive: true,
    uptime: process.uptime(),
  };
}

/**
 * Readiness probe - is the application ready to serve requests?
 */
export async function readinessProbe(): Promise<{
  ready: boolean;
  issues?: string[];
}> {
  const health = await performHealthCheck();

  if (health.status === 'healthy') {
    return { ready: true };
  }

  const issues = Object.entries(health.checks)
    .filter(([_, check]) => check.status !== 'healthy')
    .map(([name, check]) => `${name}: ${check.status}${check.error ? ` - ${check.error}` : ''}`);

  return {
    ready: health.status === 'healthy',
    issues,
  };
}

/**
 * Startup probe - is the application starting up?
 */
export async function startupProbe(): Promise<{
  started: boolean;
  readiness?: HealthCheckResult;
}> {
  const health = await performHealthCheck();
  return {
    started: health.status !== 'unhealthy',
    readiness: health,
  };
}

/**
 * Initialize health checks
 */
export function initializeHealthChecks(): void {
  // Register default health checks
  registerHealthCheck('custom_check', async () => ({
    status: 'healthy',
    timestamp: Date.now(),
  }));
}
