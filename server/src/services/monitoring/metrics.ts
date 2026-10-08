/**
 * ============================================================================
 * Application Metrics Collection Service
 * Phase 22.22: Advanced Monitoring & Observability
 * ============================================================================
 *
 * This service provides comprehensive metrics collection for the Lucide CRMT
 * application using Prometheus client library.
 *
 * Metrics Categories:
 * - HTTP Request Metrics (rate, duration, status)
 * - Transaction Processing Metrics
 * - Report Generation Metrics
 * - Database Performance Metrics
 * - Cache Performance Metrics
 * - API Integration Metrics
 * - Business KPI Metrics
 */

import client from 'prom-client';
import { Express } from 'express';

// ============================================================================
// Metric Definitions
// ============================================================================

/**
 * HTTP Request Metrics
 */
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

export const httpRequestsInFlight = new client.Gauge({
  name: 'http_requests_in_flight',
  help: 'Number of HTTP requests in flight',
  labelNames: ['method', 'route'],
});

/**
 * Transaction Processing Metrics
 */
export const transactionProcessingDuration = new client.Histogram({
  name: 'transaction_processing_duration_seconds',
  help: 'Duration of transaction processing in seconds',
  labelNames: ['type', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

export const transactionProcessingTotal = new client.Counter({
  name: 'transaction_processing_total',
  help: 'Total number of processed transactions',
  labelNames: ['type', 'status'],
});

export const transactionProcessingFailures = new client.Counter({
  name: 'transaction_processing_failures_total',
  help: 'Total number of transaction processing failures',
  labelNames: ['type', 'error_type'],
});

export const transactionProcessingQueueSize = new client.Gauge({
  name: 'transaction_processing_queue_size',
  help: 'Current size of transaction processing queue',
});

/**
 * Report Generation Metrics
 */
export const reportGenerationDuration = new client.Histogram({
  name: 'report_generation_duration_seconds',
  help: 'Duration of report generation in seconds',
  labelNames: ['report_type', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
});

export const reportGenerationTotal = new client.Counter({
  name: 'report_generation_total',
  help: 'Total number of generated reports',
  labelNames: ['report_type', 'status'],
});

export const reportGenerationFailures = new client.Counter({
  name: 'report_generation_failures_total',
  help: 'Total number of report generation failures',
  labelNames: ['report_type', 'error_type'],
});

export const reportGenerationQueueSize = new client.Gauge({
  name: 'report_generation_queue_size',
  help: 'Current size of report generation queue',
});

/**
 * Database Metrics
 */
export const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

export const dbQueryTotal = new client.Counter({
  name: 'db_query_total',
  help: 'Total number of database queries',
  labelNames: ['query_type', 'table'],
});

export const dbSlowQueries = new client.Counter({
  name: 'db_slow_queries_total',
  help: 'Total number of slow database queries',
  labelNames: ['query_type', 'table'],
});

export const dbPoolConnections = new client.Gauge({
  name: 'db_pool_connections',
  help: 'Number of database pool connections',
  labelNames: ['state'], // 'active', 'idle'
});

export const dbPoolConnectionsMax = new client.Gauge({
  name: 'db_pool_connections_max',
  help: 'Maximum number of database pool connections',
});

export const dbPoolConnectionsActive = new client.Gauge({
  name: 'db_pool_connections_active',
  help: 'Number of active database pool connections',
});

export const dbReplicationLag = new client.Gauge({
  name: 'db_replication_lag_seconds',
  help: 'Database replication lag in seconds',
});

/**
 * Cache Metrics
 */
export const cacheHitsTotal = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type', 'key_pattern'],
});

export const cacheMissesTotal = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type', 'key_pattern'],
});

export const cacheEvictionsTotal = new client.Counter({
  name: 'cache_evictions_total',
  help: 'Total number of cache evictions',
  labelNames: ['cache_type'],
});

export const cacheMemoryUsage = new client.Gauge({
  name: 'cache_memory_usage_bytes',
  help: 'Memory usage of cache in bytes',
  labelNames: ['cache_type'],
});

export const cacheSizeItems = new client.Gauge({
  name: 'cache_size_items',
  help: 'Number of items in cache',
  labelNames: ['cache_type'],
});

/**
 * External API Integration Metrics
 */
export const externalApiCallsTotal = new client.Counter({
  name: 'external_api_calls_total',
  help: 'Total number of external API calls',
  labelNames: ['api_name', 'endpoint', 'status'],
});

export const externalApiErrorsTotal = new client.Counter({
  name: 'external_api_errors_total',
  help: 'Total number of external API errors',
  labelNames: ['api_name', 'endpoint', 'error_type'],
});

export const externalApiDuration = new client.Histogram({
  name: 'external_api_duration_seconds',
  help: 'Duration of external API calls in seconds',
  labelNames: ['api_name', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

/**
 * Business KPI Metrics
 */
export const totalUsersActive = new client.Gauge({
  name: 'total_users_active',
  help: 'Total number of active users',
});

export const apiQuotaUsed = new client.Gauge({
  name: 'api_quota_used',
  help: 'API quota used',
});

export const apiQuotaLimit = new client.Gauge({
  name: 'api_quota_limit',
  help: 'API quota limit',
});

export const backupLastCompletionTimestamp = new client.Gauge({
  name: 'backup_last_completion_timestamp',
  help: 'Unix timestamp of last successful backup',
});

/**
 * Process/Runtime Metrics
 */
export const processUptime = new client.Gauge({
  name: 'process_uptime_seconds',
  help: 'Process uptime in seconds',
});

export const processMemoryUsage = new client.Gauge({
  name: 'process_memory_usage_bytes',
  help: 'Process memory usage in bytes',
  labelNames: ['type'], // 'rss', 'heap_used', 'heap_total'
});

/**
 * Health Check Metrics
 */
export const healthCheckStatus = new client.Gauge({
  name: 'health_check_status',
  help: 'Health check status (1 = healthy, 0 = unhealthy)',
  labelNames: ['service'],
});

// ============================================================================
// Metrics Registration & Setup
// ============================================================================

/**
 * Register all metrics
 */
export function registerMetrics(): void {
  // Metrics are automatically registered when instantiated
  // This function is here for explicit registration if needed
}

/**
 * Initialize default metrics (CPU, memory, gc, etc)
 */
export function initializeDefaultMetrics(): void {
  client.collectDefaultMetrics({
    prefix: 'nodejs_',
    timeout: 10000,
  });
}

/**
 * Get all metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return client.register.metrics();
}

/**
 * Get metrics as JSON
 */
export async function getMetricsJson(): Promise<Record<string, unknown>> {
  return client.register.getMetricsAsJSON();
}

// ============================================================================
// HTTP Middleware
// ============================================================================

/**
 * Middleware to track HTTP request metrics
 */
export function metricsMiddleware(req: Express.Request, res: Express.Response, next: Express.NextFunction): void {
  const startTime = Date.now();
  const route = req.route?.path || req.path;

  // Increment in-flight requests
  httpRequestsInFlight.inc({ method: req.method, route });

  // Hook into response finish
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const status = res.statusCode || 500;

    // Record metrics
    httpRequestDuration.observe({ method: req.method, route, status }, duration);
    httpRequestsTotal.inc({ method: req.method, route, status });
    httpRequestsInFlight.dec({ method: req.method, route });
  });

  next();
}

// ============================================================================
// Transaction Metrics Helpers
// ============================================================================

/**
 * Record transaction processing
 */
export function recordTransaction(
  type: string,
  duration: number,
  status: 'success' | 'failure' = 'success',
  errorType?: string
): void {
  transactionProcessingDuration.observe({ type, status }, duration);
  transactionProcessingTotal.inc({ type, status });

  if (status === 'failure' && errorType) {
    transactionProcessingFailures.inc({ type, error_type: errorType });
  }
}

/**
 * Record report generation
 */
export function recordReport(
  type: string,
  duration: number,
  status: 'success' | 'failure' = 'success',
  errorType?: string
): void {
  reportGenerationDuration.observe({ report_type: type, status }, duration);
  reportGenerationTotal.inc({ report_type: type, status });

  if (status === 'failure' && errorType) {
    reportGenerationFailures.inc({ report_type: type, error_type: errorType });
  }
}

/**
 * Record database query
 */
export function recordDatabaseQuery(
  queryType: string,
  table: string,
  duration: number,
  isSlowQuery = false
): void {
  dbQueryDuration.observe({ query_type: queryType, table }, duration);
  dbQueryTotal.inc({ query_type: queryType, table });

  if (isSlowQuery) {
    dbSlowQueries.inc({ query_type: queryType, table });
  }
}

/**
 * Record cache hit
 */
export function recordCacheHit(cacheType: string, keyPattern = 'generic'): void {
  cacheHitsTotal.inc({ cache_type: cacheType, key_pattern: keyPattern });
}

/**
 * Record cache miss
 */
export function recordCacheMiss(cacheType: string, keyPattern = 'generic'): void {
  cacheMissesTotal.inc({ cache_type: cacheType, key_pattern: keyPattern });
}

/**
 * Record external API call
 */
export function recordApiCall(
  apiName: string,
  endpoint: string,
  status: number,
  duration: number
): void {
  externalApiCallsTotal.inc({ api_name: apiName, endpoint, status });
  externalApiDuration.observe({ api_name: apiName, endpoint }, duration);

  if (status >= 400) {
    externalApiErrorsTotal.inc({
      api_name: apiName,
      endpoint,
      error_type: status >= 500 ? 'server_error' : 'client_error',
    });
  }
}

// ============================================================================
// Periodic Metrics Updates
// ============================================================================

/**
 * Update process metrics periodically
 */
export function startPeriodicMetricsUpdate(intervalMs = 10000): NodeJS.Timeout {
  return setInterval(() => {
    // Update process uptime
    processUptime.set(process.uptime());

    // Update memory usage
    const memUsage = process.memoryUsage();
    processMemoryUsage.set({ type: 'rss' }, memUsage.rss);
    processMemoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
    processMemoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
  }, intervalMs);
}

/**
 * Initialize monitoring system
 */
export function initializeMonitoring(): void {
  registerMetrics();
  initializeDefaultMetrics();
  startPeriodicMetricsUpdate();
}
