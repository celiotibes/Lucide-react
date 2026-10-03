import { promClient } from 'prom-client';

/**
 * OBS-001: Prometheus Metrics Service
 * Comprehensive metrics collection with:
 * - Histograms for DB query latency (1, 5, 10, 50, 100ms buckets)
 * - Counters for errors by type and requests by route
 * - Gauges for active connections and cache size
 * - Endpoint: GET /metrics (exposed on main server or port 9090)
 */

let register: promClient.Registry;

// Initialize Prometheus registry
function initializeMetrics() {
  try {
    // Use default register
    register = promClient.register;

    // Collect default metrics (CPU, memory, etc)
    promClient.collectDefaultMetrics({ register });

    // ============ HISTOGRAMS ============
    // Database query latency histogram
    new promClient.Histogram({
      name: 'db_query_duration_ms',
      help: 'Database query latency in milliseconds',
      buckets: [1, 5, 10, 50, 100, 200, 500, 1000], // ms
      registers: [register],
      labelNames: ['query_type', 'table'],
    });

    // HTTP request latency histogram
    new promClient.Histogram({
      name: 'http_request_duration_ms',
      help: 'HTTP request latency in milliseconds',
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
      registers: [register],
      labelNames: ['method', 'route', 'status'],
    });

    // Cache operation latency histogram
    new promClient.Histogram({
      name: 'cache_operation_duration_ms',
      help: 'Cache operation latency in milliseconds',
      buckets: [0.1, 0.5, 1, 5, 10, 50],
      registers: [register],
      labelNames: ['operation', 'cache_type'],
    });

    // ============ COUNTERS ============
    // HTTP requests counter
    new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      registers: [register],
      labelNames: ['method', 'route', 'status'],
    });

    // Errors counter by type
    new promClient.Counter({
      name: 'errors_total',
      help: 'Total number of errors by type',
      registers: [register],
      labelNames: ['error_type', 'operation', 'severity'],
    });

    // Database errors counter
    new promClient.Counter({
      name: 'db_errors_total',
      help: 'Total number of database errors',
      registers: [register],
      labelNames: ['query_type', 'error_code'],
    });

    // Cache hits/misses counter
    new promClient.Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      registers: [register],
      labelNames: ['cache_type', 'key_pattern'],
    });

    new promClient.Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      registers: [register],
      labelNames: ['cache_type', 'key_pattern'],
    });

    // Transaction counter
    new promClient.Counter({
      name: 'transactions_processed_total',
      help: 'Total number of transactions processed',
      registers: [register],
      labelNames: ['transaction_type', 'status'],
    });

    // ============ GAUGES ============
    // Active database connections gauge
    new promClient.Gauge({
      name: 'db_active_connections',
      help: 'Number of active database connections',
      registers: [register],
    });

    // Cache size gauge
    new promClient.Gauge({
      name: 'cache_size_bytes',
      help: 'Current cache size in bytes',
      registers: [register],
      labelNames: ['cache_type'],
    });

    // Cache entries count gauge
    new promClient.Gauge({
      name: 'cache_entries_count',
      help: 'Number of entries in cache',
      registers: [register],
      labelNames: ['cache_type'],
    });

    // Queue size gauge
    new promClient.Gauge({
      name: 'queue_size',
      help: 'Current size of processing queue',
      registers: [register],
      labelNames: ['queue_type'],
    });

    // Active requests gauge
    new promClient.Gauge({
      name: 'http_requests_in_progress',
      help: 'Number of HTTP requests currently being processed',
      registers: [register],
      labelNames: ['method', 'route'],
    });

    // Sentry events gauge
    new promClient.Gauge({
      name: 'sentry_events_total',
      help: 'Total Sentry events captured',
      registers: [register],
      labelNames: ['event_type', 'level'],
    });
  } catch (error) {
    console.error('[Metrics] Failed to initialize metrics:', error);
    throw error;
  }
}

// Get metric by name
export function getMetric(name: string): promClient.Metric | undefined {
  try {
    const collectors = register.collectors || [];
    for (const collector of collectors) {
      const metrics = collector.collect?.();
      if (metrics) {
        for (const metric of metrics) {
          if (metric.name === name) {
            return metric;
          }
        }
      }
    }
  } catch (error) {
    console.error(`[Metrics] Failed to get metric ${name}:`, error);
  }
  return undefined;
}

// Record DB query latency
export function recordDbQueryLatency(
  durationMs: number,
  queryType: string = 'unknown',
  table: string = 'unknown'
) {
  try {
    const metric = register.getSingleMetric('db_query_duration_ms') as promClient.Histogram;
    if (metric) {
      metric.labels(queryType, table).observe(durationMs);
    }
  } catch (error) {
    console.error('[Metrics] Failed to record DB query latency:', error);
  }
}

// Record HTTP request latency
export function recordHttpRequestLatency(
  durationMs: number,
  method: string,
  route: string,
  status: number
) {
  try {
    const histogram = register.getSingleMetric('http_request_duration_ms') as promClient.Histogram;
    if (histogram) {
      histogram.labels(method, route, String(status)).observe(durationMs);
    }

    const counter = register.getSingleMetric('http_requests_total') as promClient.Counter;
    if (counter) {
      counter.labels(method, route, String(status)).inc();
    }
  } catch (error) {
    console.error('[Metrics] Failed to record HTTP request latency:', error);
  }
}

// Record error
export function recordError(
  errorType: string,
  operation: string = 'unknown',
  severity: string = 'error'
) {
  try {
    const counter = register.getSingleMetric('errors_total') as promClient.Counter;
    if (counter) {
      counter.labels(errorType, operation, severity).inc();
    }
  } catch (error) {
    console.error('[Metrics] Failed to record error:', error);
  }
}

// Record DB error
export function recordDbError(queryType: string, errorCode: string) {
  try {
    const counter = register.getSingleMetric('db_errors_total') as promClient.Counter;
    if (counter) {
      counter.labels(queryType, errorCode).inc();
    }
  } catch (error) {
    console.error('[Metrics] Failed to record DB error:', error);
  }
}

// Record cache hit
export function recordCacheHit(cacheType: string, keyPattern: string = 'all') {
  try {
    const counter = register.getSingleMetric('cache_hits_total') as promClient.Counter;
    if (counter) {
      counter.labels(cacheType, keyPattern).inc();
    }
  } catch (error) {
    console.error('[Metrics] Failed to record cache hit:', error);
  }
}

// Record cache miss
export function recordCacheMiss(cacheType: string, keyPattern: string = 'all') {
  try {
    const counter = register.getSingleMetric('cache_misses_total') as promClient.Counter;
    if (counter) {
      counter.labels(cacheType, keyPattern).inc();
    }
  } catch (error) {
    console.error('[Metrics] Failed to record cache miss:', error);
  }
}

// Record cache operation latency
export function recordCacheOperationLatency(
  durationMs: number,
  operation: string,
  cacheType: string
) {
  try {
    const histogram = register.getSingleMetric('cache_operation_duration_ms') as promClient.Histogram;
    if (histogram) {
      histogram.labels(operation, cacheType).observe(durationMs);
    }
  } catch (error) {
    console.error('[Metrics] Failed to record cache operation latency:', error);
  }
}

// Set active connections
export function setActiveConnections(count: number) {
  try {
    const gauge = register.getSingleMetric('db_active_connections') as promClient.Gauge;
    if (gauge) {
      gauge.set(count);
    }
  } catch (error) {
    console.error('[Metrics] Failed to set active connections:', error);
  }
}

// Set cache size
export function setCacheSize(sizeBytes: number, cacheType: string = 'memory') {
  try {
    const gauge = register.getSingleMetric('cache_size_bytes') as promClient.Gauge;
    if (gauge) {
      gauge.labels(cacheType).set(sizeBytes);
    }
  } catch (error) {
    console.error('[Metrics] Failed to set cache size:', error);
  }
}

// Set cache entries count
export function setCacheEntriesCount(count: number, cacheType: string = 'memory') {
  try {
    const gauge = register.getSingleMetric('cache_entries_count') as promClient.Gauge;
    if (gauge) {
      gauge.labels(cacheType).set(count);
    }
  } catch (error) {
    console.error('[Metrics] Failed to set cache entries count:', error);
  }
}

// Increment active requests
export function incrementActiveRequests(method: string, route: string) {
  try {
    const gauge = register.getSingleMetric('http_requests_in_progress') as promClient.Gauge;
    if (gauge) {
      gauge.labels(method, route).inc();
    }
  } catch (error) {
    console.error('[Metrics] Failed to increment active requests:', error);
  }
}

// Decrement active requests
export function decrementActiveRequests(method: string, route: string) {
  try {
    const gauge = register.getSingleMetric('http_requests_in_progress') as promClient.Gauge;
    if (gauge) {
      gauge.labels(method, route).dec();
    }
  } catch (error) {
    console.error('[Metrics] Failed to decrement active requests:', error);
  }
}

// Record transaction processed
export function recordTransactionProcessed(transactionType: string, status: string) {
  try {
    const counter = register.getSingleMetric('transactions_processed_total') as promClient.Counter;
    if (counter) {
      counter.labels(transactionType, status).inc();
    }
  } catch (error) {
    console.error('[Metrics] Failed to record transaction:', error);
  }
}

// Get metrics registry for Express middleware
export function getMetricsRegistry() {
  return register;
}

// Export Prometheus client
export { promClient };

// Initialize on module load
initializeMetrics();
