# Phase 22.22 - Advanced Monitoring Integration Guide

## Overview

This document describes how to integrate the monitoring components into the Lucide React CRMT application.

**Status:** Complete  
**Date:** October 2026  

---

## Server-Side Integration

### 1. Initialize Monitoring in Express App

```typescript
// server/src/index.ts
import express from 'express';
import {
  initializeMonitoring,
  metricsMiddleware,
  getMetrics,
  getMetricsJson,
} from './services/monitoring/metrics';
import {
  initializeTracer,
  tracingMiddleware,
  shutdownTracer,
} from './services/monitoring/tracing';
import {
  performHealthCheck,
  livenessProbe,
  readinessProbe,
  startupProbe,
  initializeHealthChecks,
} from './services/monitoring/health-checks';

const app = express();

// Initialize monitoring (do this early)
initializeMonitoring();
initializeTracer('lucide-app');
initializeHealthChecks();

// Middleware for metrics
app.use(metricsMiddleware);
app.use(tracingMiddleware());

// Metrics endpoint (Prometheus scrapes this)
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(await getMetrics());
});

// Business metrics endpoint
app.get('/business-metrics', async (req, res) => {
  res.set('Content-Type', 'application/json');
  const metrics = await getMetricsJson();
  res.json(metrics);
});

// Health check endpoints (Kubernetes probes)
app.get('/health', async (req, res) => {
  const health = await performHealthCheck();
  const status = health.status === 'healthy' ? 200 : 503;
  res.status(status).json(health);
});

app.get('/health/live', async (req, res) => {
  const probe = await livenessProbe();
  res.json(probe);
});

app.get('/health/ready', async (req, res) => {
  const probe = await readinessProbe();
  const status = probe.ready ? 200 : 503;
  res.status(status).json(probe);
});

app.get('/health/startup', async (req, res) => {
  const probe = await startupProbe();
  const status = probe.started ? 200 : 503;
  res.status(status).json(probe);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await shutdownTracer();
  process.exit(0);
});
```

### 2. Instrument Database Operations

```typescript
// server/src/services/database/queries.ts
import { recordDatabaseQuery, recordCacheHit, recordCacheMiss } from '../monitoring/metrics';
import { traceDbOperation } from '../monitoring/tracing';

export async function getTransactions(userId: string) {
  const cacheKey = `transactions:${userId}`;
  
  // Try cache first
  const cached = await cache.get(cacheKey);
  if (cached) {
    recordCacheHit('transaction-cache', 'transactions');
    return cached;
  }
  recordCacheMiss('transaction-cache', 'transactions');

  // Database query with tracing
  const start = Date.now();
  const data = await traceDbOperation(
    'SELECT',
    'SELECT * FROM transactions WHERE user_id = ?',
    async () => {
      const db = require('better-sqlite3')(':memory:');
      return db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(userId);
    }
  );
  
  const duration = (Date.now() - start) / 1000;
  recordDatabaseQuery('SELECT', 'transactions', duration, duration > 1);
  
  // Cache result
  await cache.set(cacheKey, data, 3600);
  
  return data;
}
```

### 3. Instrument Transaction Processing

```typescript
// server/src/services/transactions/processor.ts
import { recordTransaction } from '../monitoring/metrics';
import { traceBusinessOperation } from '../monitoring/tracing';

export async function processTransaction(transaction: Transaction) {
  const start = Date.now();
  
  try {
    const result = await traceBusinessOperation(
      'transaction',
      'process_payment',
      async (span) => {
        span.setAttributes({
          'transaction.id': transaction.id,
          'transaction.amount': transaction.amount,
          'transaction.type': transaction.type,
        });
        
        // Process transaction logic
        return await callPaymentGateway(transaction);
      }
    );
    
    const duration = (Date.now() - start) / 1000;
    recordTransaction(transaction.type, duration, 'success');
    
    return result;
  } catch (error) {
    const duration = (Date.now() - start) / 1000;
    recordTransaction(
      transaction.type,
      duration,
      'failure',
      error instanceof Error ? error.message : 'unknown'
    );
    throw error;
  }
}
```

### 4. Instrument Report Generation

```typescript
// server/src/services/reports/generator.ts
import { recordReport } from '../monitoring/metrics';
import { traceBusinessOperation } from '../monitoring/tracing';

export async function generateFinancialReport(params: ReportParams) {
  const start = Date.now();
  
  try {
    const report = await traceBusinessOperation(
      'report',
      'financial_statement',
      async (span) => {
        span.setAttributes({
          'report.type': 'financial_statement',
          'report.period': params.period,
          'report.company_id': params.companyId,
        });
        
        // Generate report logic
        return await buildFinancialStatement(params);
      }
    );
    
    const duration = (Date.now() - start) / 1000;
    recordReport('financial_statement', duration, 'success');
    
    return report;
  } catch (error) {
    const duration = (Date.now() - start) / 1000;
    recordReport(
      'financial_statement',
      duration,
      'failure',
      error instanceof Error ? error.message : 'unknown'
    );
    throw error;
  }
}
```

### 5. Instrument External API Calls

```typescript
// server/src/services/integrations/asaas.ts
import { recordApiCall } from '../monitoring/metrics';
import { traceApiCall } from '../monitoring/tracing';

export async function getPayments(subscriptionId: string) {
  const start = Date.now();
  const apiName = 'asaas';
  const endpoint = '/payments';
  
  try {
    const response = await traceApiCall(
      apiName,
      'GET',
      'https://api.asaas.com/payments',
      async () => {
        return fetch(`https://api.asaas.com/v3/payments?subscriptionId=${subscriptionId}`, {
          headers: {
            'access_token': process.env.ASAAS_API_KEY!,
          },
        });
      }
    );
    
    const duration = (Date.now() - start) / 1000;
    recordApiCall(apiName, endpoint, response.status, duration);
    
    return response.json();
  } catch (error) {
    const duration = (Date.now() - start) / 1000;
    recordApiCall(apiName, endpoint, 500, duration);
    throw error;
  }
}
```

---

## Environment Variables

Add to `.env.docker`:

```bash
# Monitoring Configuration
PROMETHEUS_PORT=9090
PROMETHEUS_CPUS_LIMIT=2
PROMETHEUS_MEMORY_LIMIT=1024M

GRAFANA_PORT=3000
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=secure-password-here
GRAFANA_CPUS_LIMIT=1
GRAFANA_MEMORY_LIMIT=512M

ALERTMANAGER_PORT=9093

# Tracing
JAEGER_AGENT_HOST=jaeger:6831
JAEGER_QUERY_PORT=16686

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
ALERTS_EMAIL_TO=team@example.com
ALERTS_EMAIL_FROM=alerts@example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password

PAGERDUTY_SERVICE_KEY=your-pagerduty-key
```

---

## Package Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "prom-client": "^15.1.0",
    "@opentelemetry/api": "^1.9.2",
    "@opentelemetry/sdk-trace-node": "^0.51.1",
    "@opentelemetry/exporter-jaeger-basic": "^1.24.0",
    "@opentelemetry/auto-instrumentations-node": "^0.47.0",
    "@opentelemetry/instrumentation-http": "^0.51.0",
    "@opentelemetry/instrumentation-express": "^0.39.0",
    "@opentelemetry/instrumentation-pg": "^0.39.0",
    "@opentelemetry/instrumentation-redis-4": "^0.37.0",
    "@opentelemetry/instrumentation-mongodb": "^0.43.0",
    "@opentelemetry/core": "^1.24.0"
  }
}
```

Installation:

```bash
npm install prom-client @opentelemetry/api @opentelemetry/sdk-trace-node \
  @opentelemetry/exporter-jaeger-basic @opentelemetry/auto-instrumentations-node \
  @opentelemetry/instrumentation-http @opentelemetry/instrumentation-express \
  @opentelemetry/instrumentation-pg @opentelemetry/instrumentation-redis-4 \
  @opentelemetry/instrumentation-mongodb @opentelemetry/core
```

---

## Docker Compose Updates

The docker-compose.yml has been updated with:

1. **Prometheus Service** - Metrics collection
2. **Grafana Service** - Dashboard visualization
3. **AlertManager Service** - Alert routing
4. **Jaeger Service** - Distributed tracing
5. **Node Exporter** - Infrastructure metrics
6. **cAdvisor** - Container metrics

All services are configured with:
- Resource limits
- Health checks
- Proper networking
- Volume persistence
- Logging configuration

---

## Testing the Monitoring Stack

### 1. Start Services

```bash
docker-compose up -d prometheus grafana alertmanager jaeger node-exporter cadvisor
```

### 2. Verify Prometheus Scraping

```bash
# Check targets
curl http://localhost:9090/api/v1/targets

# Expected output should include app, node-exporter, cadvisor, etc.
```

### 3. Access Grafana

```bash
# URL: http://localhost:3000
# Default credentials: admin / (your GRAFANA_ADMIN_PASSWORD)
```

### 4. Create Test Alert

```bash
# Trigger a test alert
curl -X POST http://localhost:9093/api/v1/alerts \
  -H 'Content-Type: application/json' \
  -d '{
    "alerts": [{
      "status": "firing",
      "labels": {
        "alertname": "TestAlert",
        "severity": "warning"
      },
      "annotations": {
        "summary": "Test alert",
        "description": "This is a test notification"
      }
    }]
  }'
```

### 5. View Traces in Jaeger

```
http://localhost:16686
# Select service: lucide-app
# View recent traces
```

---

## Monitoring Queries

### Common PromQL Queries

```promql
# Application uptime
up{job="lucide-app"}

# Request rate (requests per second)
rate(http_requests_total[5m])

# Error rate percentage
(sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))) * 100

# p95 latency (milliseconds)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) * 1000

# Transaction success rate
(sum(transaction_processing_total{status="success"}) / sum(transaction_processing_total)) * 100

# Database query latency (p95)
histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))

# Cache hit ratio
sum(cache_hits_total) / (sum(cache_hits_total) + sum(cache_misses_total))

# Memory usage (percent)
(process_resident_memory_bytes / 1024 / 1024) as MB

# CPU usage (percent)
rate(process_cpu_seconds_total[5m]) * 100
```

---

## Alert Testing

### Test Email Notifications

```bash
# Configure SMTP in alertmanager.yml
# Then trigger alert with email receiver
```

### Test Slack Notifications

```bash
# Set SLACK_WEBHOOK_URL environment variable
# Alerts with Slack receivers will be sent
```

### Test PagerDuty Notifications

```bash
# Set PAGERDUTY_SERVICE_KEY environment variable
# Critical alerts will create PagerDuty incidents
```

---

## Troubleshooting

### Application Metrics Not Appearing

1. Verify `/metrics` endpoint is accessible:
   ```bash
   curl http://localhost:8787/metrics
   ```

2. Check Prometheus configuration:
   ```bash
   curl http://localhost:9090/api/v1/targets
   ```

3. Check logs:
   ```bash
   docker-compose logs prometheus | tail -20
   ```

### Dashboards Empty

1. Verify data source in Grafana:
   - Go to http://localhost:3000/datasources
   - Click Prometheus
   - Click "Test"

2. Check if metrics exist:
   ```bash
   curl 'http://localhost:9090/api/v1/query?query=up'
   ```

3. Restart Grafana:
   ```bash
   docker-compose restart grafana
   ```

### Alerts Not Firing

1. Verify alert rules loaded:
   ```bash
   curl http://localhost:9090/api/v1/rules
   ```

2. Test alert condition:
   ```bash
   curl 'http://localhost:9090/api/v1/query?query=HIGH_CPU_CONDITION'
   ```

3. Check AlertManager:
   ```bash
   docker-compose logs alertmanager
   ```

---

## Performance Considerations

- **Prometheus**: Allocate 2+ GB RAM for production
- **Grafana**: 512MB RAM minimum, 1GB recommended
- **Jaeger**: 1GB RAM for moderate traffic
- **Retention**: 30 days Prometheus retention = ~10GB storage

---

## Security

1. **Grafana**: Change default admin password
2. **Prometheus**: Protect `/metrics` endpoint with authentication
3. **AlertManager**: Use secure webhook URLs
4. **Jaeger**: Restrict UI access in production
5. **Credentials**: Use environment variables, not config files

---

## Next Steps

1. Deploy to production environment
2. Configure external notification channels (Slack, PagerDuty)
3. Create custom dashboards for your use case
4. Set up on-call rotation based on alerts
5. Document runbooks for common alerts
6. Schedule regular monitoring reviews

---

**End of Integration Guide**
