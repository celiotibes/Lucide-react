# Observability Implementation Guide

## Overview

Lucide-react now includes **complete observability** with:
- **Winston Log Rotation** - Automatic log file rotation and archiving
- **Prometheus Metrics** - Comprehensive metrics exposure for monitoring
- **Sentry Performance Transactions** - Detailed performance tracing and N+1 detection
- **Request Logging Sampling** - Intelligent request sampling to reduce noise

---

## 1. Winston Log Rotation

### Configuration

Logs are automatically rotated based on:
- **Size**: 10MB per file (maxsize)
- **Count**: Maximum 10 files kept (maxFiles)
- **Time**: Daily rotation with timestamp

### Log Locations

```
/logs/
  ├── app.log              # Current app log (all levels)
  ├── app-2026-10-03.log   # Daily rotation (all levels)
  ├── error.log            # Current error log
  ├── error-2026-10-03.log # Daily rotation (errors only)
  ├── archive/             # Archived old logs
  └── .audit.json          # Rotation audit trail
```

### Log Levels

- **Production**: `info` (configured in LOG_LEVEL env var)
- **Development**: `debug`
- **Custom**: Set via `LOG_LEVEL` environment variable

### Usage Example

```typescript
import { logger } from './services/logger-service.js';

// Simple logging
logger.info('User login', { userId: 123 });
logger.error('Payment failed', error);

// Child logger with requestId
const childLogger = logger.child({ requestId: 'abc-123' });
childLogger.info('Processing transaction'); // Includes requestId in output
```

### Rotation Validation

Log files won't grow indefinitely:
- Automatic rollover at 10MB
- Maximum 10 daily rotated files retained
- Audit files track rotation history in `.audit.json`

---

## 2. Prometheus Metrics

### Endpoint

**GET /metrics** - Exposes all Prometheus metrics in text format

Example:
```bash
curl http://localhost:8787/metrics
```

### Metric Categories

#### Histograms (Latency)

1. **Database Query Latency**: `db_query_duration_ms`
   - Buckets: 1, 5, 10, 50, 100, 200, 500, 1000ms
   - Labels: `query_type`, `table`
   
2. **HTTP Request Latency**: `http_request_duration_ms`
   - Buckets: 10, 50, 100, 200, 500, 1000, 2000, 5000ms
   - Labels: `method`, `route`, `status`

3. **Cache Operation Latency**: `cache_operation_duration_ms`
   - Buckets: 0.1, 0.5, 1, 5, 10, 50ms
   - Labels: `operation`, `cache_type`

#### Counters (Totals)

1. **HTTP Requests**: `http_requests_total`
   - Labels: `method`, `route`, `status`

2. **Errors**: `errors_total`
   - Labels: `error_type`, `operation`, `severity`

3. **Database Errors**: `db_errors_total`
   - Labels: `query_type`, `error_code`

4. **Cache Operations**: `cache_hits_total`, `cache_misses_total`
   - Labels: `cache_type`, `key_pattern`

5. **Transactions**: `transactions_processed_total`
   - Labels: `transaction_type`, `status`

#### Gauges (Current Values)

1. **Active Connections**: `db_active_connections`
2. **Cache Size**: `cache_size_bytes` (per cache_type)
3. **Cache Entries**: `cache_entries_count` (per cache_type)
4. **Queue Size**: `queue_size` (per queue_type)
5. **Active Requests**: `http_requests_in_progress` (per method/route)

### Recording Metrics

```typescript
import {
  recordDbQueryLatency,
  recordHttpRequestLatency,
  recordError,
  recordCacheHit,
  recordCacheMiss,
  setActiveConnections,
  setCacheSize,
  recordTransactionProcessed,
} from './services/metrics-service.js';

// Record DB query latency
const start = Date.now();
const results = await db.query('SELECT * FROM users');
recordDbQueryLatency(Date.now() - start, 'SELECT', 'users');

// Record HTTP request latency
recordHttpRequestLatency(250, 'GET', '/api/accounts', 200);

// Record error
recordError('ValidationError', 'save_transaction', 'error');

// Record cache operations
recordCacheHit('memory', 'transaction_*');
recordCacheMiss('memory', 'account_*');

// Record cache metrics
setCacheSize(1024 * 1024, 'memory'); // 1MB
recordTransactionProcessed('reconciliation', 'success');
```

### Prometheus Scrape Configuration

Add to your Prometheus `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'lucide-app'
    static_configs:
      - targets: ['localhost:8787']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

### Dashboard Examples

**Query Examples for Grafana:**

```promql
# Average DB query latency (last hour)
rate(db_query_duration_ms_sum[1h]) / rate(db_query_duration_ms_count[1h])

# Cache hit ratio
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))

# Error rate
rate(errors_total[5m])

# P95 HTTP request latency
histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))

# Active HTTP requests
http_requests_in_progress
```

---

## 3. Sentry Performance Transactions

### Database Operation Tracing

```typescript
import {
  startDbTransaction,
  createDbStatementSpan,
  trackDatabaseTransaction,
  detectN1Queries,
  addSentryBreadcrumb,
} from './services/sentry-service.js';

// Track complex multi-statement operation
async function processReconciliation() {
  const transaction = startDbTransaction('processReconciliation', 'transaction');
  
  try {
    // Create child span for each statement
    const span1 = createDbStatementSpan(
      transaction,
      'SELECT * FROM transactions WHERE status = ?',
      'transactions'
    );
    
    // Execute statement
    const transactions = await db.query('SELECT * FROM transactions WHERE status = ?');
    
    span1?.finish();
    
    // More statements...
    
    transaction?.finish();
  } catch (error) {
    transaction?.setStatus('error');
    transaction?.finish();
    throw error;
  }
}

// OR use helper for simpler cases
await trackDatabaseTransaction('processReconciliation', async () => {
  // Your operation here
  await db.reconcile();
});
```

### Parallel Operation Tracing

```typescript
import { traceParallelOperations } from './services/sentry-service.js';

// Track Promise.all() parallelization
const results = await traceParallelOperations(
  'fetch_all_accounts',
  [
    fetchAccount(1),
    fetchAccount(2),
    fetchAccount(3),
    fetchAccount(4),
    fetchAccount(5),
  ]
);
```

### N+1 Query Detection

```typescript
import { detectN1Queries } from './services/sentry-service.js';

// In a loop where you're making repeated queries
for (const transaction of transactions) {
  const details = await db.query('SELECT * FROM transaction_details WHERE id = ?', [transaction.id]);
}

// Detect the pattern
detectN1Queries('SELECT', 'transaction_details', 50, 3);
// If 50 SELECTs on transaction_details (threshold: 3), warning is sent to Sentry
```

### Breadcrumbs for Audit Trail

```typescript
import { addSentryBreadcrumb } from './services/sentry-service.js';

// Track user actions
addSentryBreadcrumb(
  'User viewed reconciliation report',
  { userId: 123, reportId: 'rec-2026-10' },
  'user_action',
  'info'
);

// Track system events
addSentryBreadcrumb(
  'Reconciliation started',
  { transactionCount: 250 },
  'process',
  'info'
);

// Track issues
addSentryBreadcrumb(
  'Found 5 discrepancies',
  { discrepancies: [...] },
  'validation',
  'warning'
);
```

### Transaction Tags and Context

```typescript
import { Sentry } from './services/sentry-service.js';

// Set user context
Sentry.setUser({
  id: '123',
  email: 'user@example.com'
});

// Tag transaction with business context
const transaction = Sentry.startTransaction({
  name: 'process_payment',
  op: 'payment.processing',
  tags: {
    'payment.method': 'pix',
    'payment.amount': '1000.00',
    'business.area': 'accounting'
  }
});

// Clean up
Sentry.setUser(null);
```

---

## 4. Request Logging Sampling

### Configuration

**Environment Variables:**

```bash
# Production: sample 10% of requests
NODE_ENV=production

# Development: sample 100% of requests
NODE_ENV=development

# Debug sampling behavior
DEBUG_SAMPLING=true
```

### How It Works

1. **Reservoir Sampling**: Probabilistic selection of requests to log
2. **Skip List**: Health checks and metrics never logged
3. **Total Duration**: Tracks request end-to-end time

### Sampled Request Log

```json
{
  "timestamp": "2026-10-03 15:30:45",
  "level": "info",
  "message": "HTTP Request",
  "requestId": "abc-def-123",
  "method": "GET",
  "path": "/api/accounts",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "sampled": true
}
```

### Response Log with Duration

```json
{
  "timestamp": "2026-10-03 15:30:46",
  "level": "info",
  "message": "HTTP Response",
  "requestId": "abc-def-123",
  "method": "GET",
  "path": "/api/accounts",
  "statusCode": 200,
  "contentLength": "2048",
  "durationMs": 1250,
  "sampled": true
}
```

### Debug Mode

When `DEBUG_SAMPLING=true`, skipped requests are logged at debug level:

```json
{
  "timestamp": "2026-10-03 15:30:47",
  "level": "debug",
  "message": "HTTP Request (skipped by sampling)",
  "method": "GET",
  "path": "/api/health",
  "sampleRate": 0.1
}
```

### Getting Sampler Statistics

```typescript
import { getRequestSamplerStats } from './middleware/request-id-middleware.js';

const stats = getRequestSamplerStats();
console.log(stats);
// { requestCount: 1523, sampleRate: 0.1 }
```

---

## Environment Configuration

### .env Setup

```bash
# Logging
LOG_LEVEL=info                    # debug, info, warn, error
NODE_ENV=production               # development, production, test

# Sentry
SENTRY_DSN=https://...@...ingest.sentry.io/...

# Observability Debug
DEBUG_SAMPLING=false              # Set to true to debug sampling

# Metrics
# (exposed on /metrics endpoint, no configuration needed)
```

---

## Monitoring & Alerting

### Recommended Prometheus Alerts

```yaml
groups:
  - name: lucide_alerts
    rules:
      - alert: HighDatabaseLatency
        expr: histogram_quantile(0.95, rate(db_query_duration_ms_bucket[5m])) > 100
        for: 5m
        annotations:
          summary: "DB query latency > 100ms"

      - alert: HighErrorRate
        expr: rate(errors_total[5m]) > 0.01
        for: 5m
        annotations:
          summary: "Error rate > 1%"

      - alert: CacheMissRatio
        expr: rate(cache_misses_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) > 0.5
        for: 10m
        annotations:
          summary: "Cache miss ratio > 50%"

      - alert: N1QueryDetected
        expr: rate(sentry_events_total{event_type="n1_query"}[1h]) > 0
        for: 1m
        annotations:
          summary: "N+1 query pattern detected"
```

---

## Best Practices

### 1. Log Sampling in Production

- **Always** run with 10% sampling in production to reduce noise
- Use `DEBUG_SAMPLING=true` to test sampling behavior locally
- Adjust sample rate if needed via environment variables

### 2. Metric Recording

- Record metrics **immediately** after operations
- Use meaningful labels for filtering/grouping
- Keep operation names consistent for aggregation

### 3. Sentry Transactions

- Use transactions for **critical** operations (>100ms expected)
- Always call `transaction.finish()` or use helper functions
- Add breadcrumbs for important steps within transactions

### 4. Error Context

- Include operation details in error logging
- Tag errors with severity level for filtering
- Use structured extra data for debugging

### 5. Cache Monitoring

- Record cache hits/misses for hit ratio calculation
- Track cache size to detect memory leaks
- Monitor entry count for capacity planning

---

## Troubleshooting

### Metrics Not Appearing

1. Check logs for initialization errors:
   ```bash
   grep "Metrics" logs/app.log
   ```

2. Verify endpoint is accessible:
   ```bash
   curl http://localhost:8787/metrics
   ```

3. Verify Prometheus metrics format:
   ```bash
   curl http://localhost:8787/metrics | head -20
   ```

### Missing Request Logs

1. Check `DEBUG_SAMPLING=true` to see if requests are being sampled
2. Verify request is not in skip list (health checks, metrics)
3. Check log level is not too high (should be debug or info)

### Sentry Events Not Appearing

1. Verify `SENTRY_DSN` is configured:
   ```bash
   grep SENTRY_DSN .env
   ```

2. Check Sentry initialization logs:
   ```bash
   grep "Sentry" logs/app.log
   ```

3. Verify network connectivity to Sentry (check proxy)

### Log Rotation Issues

1. Check log directory permissions:
   ```bash
   ls -la logs/
   ```

2. Verify audit files exist:
   ```bash
   cat logs/.audit.json
   ```

3. Check disk space for rotation:
   ```bash
   du -sh logs/
   ```

---

## Performance Impact

### Estimated Overhead

- **Winston Logging**: < 1ms per request
- **Prometheus Metrics**: < 0.5ms per metric record
- **Sentry Transactions**: < 2ms (sampled events only)
- **Request Sampling**: < 0.1ms

### Memory Usage

- **Log Rotation Audit Files**: ~10KB per rotation
- **Prometheus Registry**: ~5-10MB (depends on metric count)
- **Sentry SDK**: ~20MB (includes integrations)

### Recommendations

- Monitor `/metrics` endpoint performance
- Keep histogram bucket counts reasonable
- Use sampling for high-traffic endpoints
- Archive old logs regularly

---

## Support

For issues or questions:
1. Check logs: `tail -f logs/app.log`
2. Review Prometheus targets: `http://prometheus:9090/targets`
3. Check Sentry dashboard: `https://sentry.io/organizations/*/issues/`
4. Inspect metrics endpoint: `curl http://localhost:8787/metrics | grep <metric_name>`
