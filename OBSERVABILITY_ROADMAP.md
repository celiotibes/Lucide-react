# Observability Roadmap - Rental Listing Sync

**Status**: 📋 Roadmap Definido  
**Data**: 2026-07-06  
**Objetivo**: Implementar observabilidade completa (logs, metrics, traces)  
**Fases**: 3 (curto, médio, longo prazo)

---

## 1. Visão Geral

Observabilidade permite entender o comportamento do sistema através de:
- **Logs**: Eventos discretos (autenticação, erros)
- **Metrics**: Medições contínuas (latência, throughput)
- **Traces**: Requisições completas (end-to-end)

---

## 2. Estado Atual vs. Esperado

### Atual (MVP)
```
✓ Console.log para eventos principais
✓ Health check endpoint (/health)
✓ Docker logging (stdout)
✓ Error handling básico
✗ Logs centralizados
✗ Métricas de performance
✗ Distributed tracing
✗ Alertas automáticos
✗ Dashboards
```

### Esperado (Production)
```
✓ Logs estruturados + centralizados
✓ Métricas em tempo real
✓ Distributed tracing end-to-end
✓ Alertas proativos
✓ Dashboards executivos
✓ SLO/SLI tracking
✓ Error tracking
✓ Performance monitoring
```

---

## 3. Fase 1: Logs Estruturados (Semana 1-2)

### Objetivo
Implementar logging estruturado e centralizado

### Implementação

#### 1.1 Logger Module (Já Criado)
```typescript
// backend/src/logger.ts
- INFO, WARN, ERROR, DEBUG levels
- Structured JSON output
- Context-aware logging
- Development vs Production modes
```

#### 1.2 Integração com Pino/Winston
```typescript
// Option A: Pino (recomendado para performance)
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    }
  }
});

// Usage
logger.info({ userId: '123', action: 'login' }, 'User logged in');

// Option B: Winston
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

#### 1.3 Log Destinations

**Development**
```
Console output (pretty printed)
Files: logs/debug.log, logs/error.log
```

**Production**
```
CloudWatch Logs (AWS)
  - Log Group: /rental-sync/backend
  - Log Streams: prod, staging
  
Datadog Logs
  - Integration via API
  - Tags: environment, service, version
  
Splunk Enterprise
  - Log forwarding via syslog
  - Custom index: rental_sync
```

#### 1.4 Fields a Logar

```typescript
// Sempre incluir
{
  timestamp: '2026-07-06T14:45:00Z',
  level: 'INFO',
  service: 'rental-sync-backend',
  version: '1.0.0',
  environment: 'production',
  region: 'us-east-1',
  
  // Contexto da requisição
  requestId: 'uuid-v4',
  method: 'POST',
  path: '/api/bookings',
  statusCode: 201,
  duration: 145,  // ms
  
  // Contexto do usuário
  userId: 'user-uuid',
  userEmail: 'user@example.com',
  
  // Detalhes específicos
  action: 'booking_created',
  bookingId: 'booking-uuid',
  propertyId: 'property-uuid',
  
  // Para erros
  error: {
    message: 'Database constraint violation',
    code: 'UNIQUE_CONSTRAINT',
    stack: '...'
  }
}
```

#### 1.5 Request Logging Middleware
```typescript
// backend/src/middleware/request-logger.ts
app.use((req, res, next) => {
  const requestId = req.get('X-Request-ID') || generateUUID();
  const start = Date.now();
  
  // Store in request context
  req.id = requestId;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userId: req.userId,
    }, `${req.method} ${req.path} ${res.statusCode}`);
  });
  
  next();
});
```

### Timeline: Semana 1-2
- [ ] Day 1: Evaluar Pino vs Winston
- [ ] Day 2: Implementar logger module
- [ ] Day 3: Integrar em index.ts
- [ ] Day 4: Integrar em workers
- [ ] Day 5: Setup CloudWatch integration
- [ ] Day 6-7: Testar log output
- [ ] Day 8-10: Deploy para staging
- [ ] Day 11-14: Monitor e ajustar

### Tools
```
- Pino ou Winston (logger)
- aws-sdk (CloudWatch)
- datadog-api-client (Datadog optional)
```

---

## 4. Fase 2: Métricas & Dashboards (Semana 3-4)

### Objetivo
Coletar métricas de performance e criar dashboards

### Métricas Críticas

#### 4.1 Application Metrics
```
Request Metrics:
- request_duration_ms (histogram)
- request_count (counter)
- request_errors (counter)

Business Metrics:
- bookings_created_total (counter)
- bookings_cancelled_total (counter)
- revenue_total (gauge)
- occupancy_rate (gauge)

API Metrics:
- api_errors_by_endpoint (counter)
- api_latency_p50/p95/p99 (histogram)
```

#### 4.2 Infrastructure Metrics
```
Database:
- db_connection_pool_usage (gauge)
- db_query_duration_ms (histogram)
- db_transaction_duration_ms (histogram)

Cache:
- redis_hit_rate (gauge)
- redis_memory_used_bytes (gauge)
- redis_operations_per_second (gauge)

Queue:
- bull_queue_size (gauge)
- bull_job_duration_ms (histogram)
- bull_failed_jobs (counter)
```

#### 4.3 System Metrics
```
Process:
- process_memory_usage_bytes (gauge)
- process_cpu_usage_percent (gauge)
- uptime_seconds (counter)

Node:
- nodejs_event_loop_lag (histogram)
- nodejs_garbage_collection_duration (histogram)
```

### Implementação

#### 4.4 Prometheus (Recomendado)
```typescript
// backend/src/metrics.ts
import promClient from 'prom-client';

// Request duration histogram
const httpRequestDurationMs = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status_code']
});

// Request counter
const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code']
});

// Bookings gauge
const bookingCount = new promClient.Gauge({
  name: 'bookings_created_total',
  help: 'Total bookings created',
});

// Endpoint para Prometheus scrape
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

#### 4.5 Grafana Dashboards
```
Dashboard 1: System Health
- CPU usage
- Memory usage
- Uptime
- Error rate

Dashboard 2: API Performance
- Request latency (P50, P95, P99)
- Request count
- Error rate by endpoint
- Throughput (req/sec)

Dashboard 3: Business Metrics
- Bookings created (time series)
- Revenue (time series)
- Occupancy rate
- Top properties

Dashboard 4: OTA Integration
- Sync job duration
- Sync success rate
- Webhook processing delay
- Queue size
```

### Timeline: Semana 3-4
- [ ] Day 1-2: Implementar Prometheus
- [ ] Day 3-4: Expor métricas de aplicação
- [ ] Day 5-6: Setup Grafana
- [ ] Day 7-10: Criar dashboards
- [ ] Day 11-14: Deploy e validar

### Tools
```
- Prometheus (metrics collection)
- Grafana (visualization)
- alertmanager (alerting)
```

---

## 5. Fase 3: Distributed Tracing (Semana 5-6)

### Objetivo
Rastrear requisições completas entre serviços

### Implementação

#### 5.1 OpenTelemetry (Standard CNCF)
```typescript
// backend/src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

const sdk = new NodeSDK({
  traceExporter: new JaegerExporter({
    endpoint: 'http://jaeger:14268/api/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

#### 5.2 Span Attributes
```typescript
// Cada operação importante cria span
const span = tracer.startSpan('database.query', {
  attributes: {
    'db.system': 'postgresql',
    'db.name': 'rental_sync',
    'db.statement': 'SELECT * FROM bookings WHERE...',
    'db.operation': 'SELECT'
  }
});

// Exemplo: Booking creation trace
const trace = {
  spanName: 'booking.create',
  attributes: {
    userId: '123',
    propertyId: '456',
    checkIn: '2026-07-10',
    checkOut: '2026-07-15'
  },
  events: [
    { name: 'booking_validated', timestamp: 't1' },
    { name: 'payment_processed', timestamp: 't2' },
    { name: 'database_updated', timestamp: 't3' },
    { name: 'ota_synced', timestamp: 't4' }
  ]
}
```

#### 5.3 Trace Destinations

**Development**
```
Jaeger UI: http://localhost:16686
```

**Production**
```
AWS X-Ray
Datadog APM
New Relic
Honeycomb
```

### Timeline: Semana 5-6
- [ ] Day 1-2: Setup OpenTelemetry
- [ ] Day 3-4: Instrumentar aplicação
- [ ] Day 5-6: Setup Jaeger/Datadog
- [ ] Day 7-10: Testes e validação
- [ ] Day 11-12: Deploy

### Tools
```
- OpenTelemetry (instrumentation)
- Jaeger (trace storage/visualization)
- Datadog APM (optional)
```

---

## 6. Fase 4: Alertas & SLO (Semana 7-8)

### Objetivo
Implementar alertas proativos e SLO tracking

### Alertas Críticos
```yaml
Alerts:
  - Error Rate > 1%
    Action: PagerDuty notification
  
  - P95 Latency > 1000ms
    Action: Page on-call engineer
  
  - Database Connection Pool > 90%
    Action: Alert DevOps
  
  - Queue Size > 10000
    Action: Alert engineers
  
  - Disk Usage > 90%
    Action: Auto-scale or alert
  
  - High Failed OTA Syncs
    Action: Alert integrations team
```

### SLO Definition
```
Service Level Objectives:
- Availability: 99.5% uptime
- Latency: P95 < 200ms
- Error Rate: < 0.1%
- Booking Success Rate: > 99%

Service Level Indicators (SLI):
- uptime_percentage = (total_time - downtime) / total_time
- latency_p95 = percentile(requests, 95)
- error_rate = failed_requests / total_requests
```

### Implementation
```typescript
// Datadog/CloudWatch alert rule
{
  name: "High Error Rate",
  query: "avg:trace.web.request.errors{service:rental-sync}",
  condition: "avg last 5m > 0.01",
  notification: "pagerduty",
  severity: "critical"
}
```

### Timeline: Semana 7-8
- [ ] Day 1-2: Definir SLO/SLI
- [ ] Day 3-4: Setup Datadog/CloudWatch alerts
- [ ] Day 5-6: Configure PagerDuty integration
- [ ] Day 7-8: Test alerting workflows

---

## 7. Fase 5: Error Tracking (Semana 9-10)

### Objetivo
Rastrear e priorizar erros em produção

### Tools
```
- Sentry (error tracking)
- Rollbar
- Bugsnag
- Datadog Error Tracking
```

### Implementation
```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1
});

// Capture exceptions
try {
  // code
} catch (error) {
  Sentry.captureException(error);
}

// Release tracking
Sentry.captureMessage("Release v1.0.0 deployed");
```

---

## 8. Stack Recomendado

### Production
```
Logs:
- CloudWatch Logs (AWS) ou
- Datadog Logs

Metrics:
- Prometheus + Grafana ou
- Datadog Metrics

Traces:
- AWS X-Ray ou
- Jaeger ou
- Datadog APM

Errors:
- Sentry ou
- Datadog Error Tracking

Alerts:
- Datadog Monitors ou
- CloudWatch Alarms
- Integração: PagerDuty, Slack
```

### Alternative Stack (Datadog All-in-One)
```
- Datadog Logs
- Datadog Metrics
- Datadog APM (Traces)
- Datadog Error Tracking
- Datadog Monitors
```

---

## 9. Estimated Costs

### AWS Stack
```
CloudWatch Logs:      ~$50/month
Prometheus + Grafana: ~$100/month (EC2 t3.small)
X-Ray:                ~$30/month
Total:                ~$180/month
```

### Datadog Stack
```
Datadog APM Standard: ~$0.10 per trace
Estimated 1M traces: $100/month
Datadog Logs:        ~$0.70 per GB (7-day retention)
Estimated 5GB:       ~$150/month
Total:               ~$250/month
```

### Cost Optimization
```
- Sample traces (10% in prod)
- Log retention policies (7 days logs, 30 days archived)
- Discard verbose debug logs in production
- Use metric aggregation
```

---

## 10. Implementation Checklist

### Fase 1: Logs
- [ ] Evaluate Pino vs Winston
- [ ] Implement logger module
- [ ] Add request logging middleware
- [ ] Setup log aggregation (CloudWatch)
- [ ] Test log collection
- [ ] Monitor log volume

### Fase 2: Metrics
- [ ] Setup Prometheus
- [ ] Expose /metrics endpoint
- [ ] Create application metrics
- [ ] Setup Grafana
- [ ] Create 4 dashboards
- [ ] Test metric collection

### Fase 3: Traces
- [ ] Setup OpenTelemetry
- [ ] Instrument main flows
- [ ] Deploy Jaeger/X-Ray
- [ ] Create trace dashboards
- [ ] Test end-to-end traces

### Fase 4: Alerts & SLO
- [ ] Define SLO/SLI
- [ ] Create alert rules
- [ ] Setup PagerDuty
- [ ] Test alert workflow
- [ ] Document runbooks

### Fase 5: Error Tracking
- [ ] Setup Sentry
- [ ] Capture exceptions
- [ ] Configure releases
- [ ] Create triage workflow

---

## 11. Success Metrics

### Observability Goals
- ✅ 100% of errors tracked
- ✅ <5min Mean Time to Detect (MTTD)
- ✅ <15min Mean Time to Resolve (MTTR)
- ✅ 99% trace completion rate
- ✅ All critical metrics tracked
- ✅ Dashboards updated daily
- ✅ SLO compliance > 99.9%

---

## 12. Roadmap Timeline

```
Week 1-2:   Phase 1 (Logs)
Week 3-4:   Phase 2 (Metrics)
Week 5-6:   Phase 3 (Traces)
Week 7-8:   Phase 4 (Alerts)
Week 9-10:  Phase 5 (Error Tracking)

Total: 10 weeks (2.5 months)
```

---

**Owner**: DevOps/SRE Team  
**Priority**: HIGH (Critical for production reliability)  
**Next Step**: Week 1 - Phase 1 Planning
