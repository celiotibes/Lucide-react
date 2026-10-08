# Phase 22.22 - Advanced Monitoring & Observability Setup Guide

## Overview

This document provides comprehensive guidance for setting up and using the monitoring, alerting, and observability stack for Lucide React CRMT.

**Version:** Phase 22.22  
**Last Updated:** October 2026  
**Status:** Complete & Production-Ready

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Components](#components)
3. [Quick Start](#quick-start)
4. [Configuration](#configuration)
5. [Dashboards](#dashboards)
6. [Alerting](#alerting)
7. [Distributed Tracing](#distributed-tracing)
8. [Custom Metrics](#custom-metrics)
9. [SLA Targets](#sla-targets)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

The monitoring stack consists of four main layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  (Prometheus Client, OpenTelemetry Instrumentation)         │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────────┐
│              Data Collection Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │Prometheus│  │  Jaeger  │  │  Node Ex.│  │  cAdvisor   │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘ │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────────┐
│           Alert & Processing Layer                          │
│  ┌──────────────┐  ┌──────────────────────────────────────┐ │
│  │ AlertManager │  │   Recording Rules & Aggregation     │ │
│  └──────────────┘  └──────────────────────────────────────┘ │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────────┐
│          Visualization & Notification Layer                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │    Grafana   │  │ AlertManager │  │ Slack/Email/PD  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Prometheus (9090)

**Purpose:** Time-series database for metrics collection and storage

**Key Features:**
- 30-day data retention
- Recording rules for query optimization
- Alert rules configuration
- Multi-job scraping

**Configuration Files:**
- `monitoring/prometheus/prometheus.yml` - Main configuration
- `monitoring/prometheus/alert_rules.yml` - Alert definitions
- `monitoring/prometheus/recording_rules.yml` - Pre-computed queries

**Scrape Jobs:**
- Application metrics (port 9091)
- Node exporter (infrastructure)
- PostgreSQL exporter (if using)
- Redis exporter (if using)
- Docker cAdvisor
- Blackbox exporter (endpoint monitoring)

### 2. Grafana (3000)

**Purpose:** Visualization, dashboarding, and alerting

**Default Credentials:**
- Username: `admin`
- Password: Set via `GRAFANA_ADMIN_PASSWORD` env var

**Included Dashboards:**
- System Overview
- Application Metrics
- Business Metrics
- Database Performance

**Data Sources:**
- Prometheus (metrics)
- Loki (logs)
- Jaeger (traces)
- PostgreSQL (database queries)

### 3. AlertManager (9093)

**Purpose:** Alert routing, grouping, and notification

**Notification Channels:**
- Email (SMTP)
- Slack
- PagerDuty
- Custom webhooks

**Alert Routing:**
- Severity-based routing (critical/warning)
- Category-based routing (infrastructure/application/business)
- Team-specific channels
- Escalation policies

### 4. Jaeger (16686)

**Purpose:** Distributed tracing for request flow visualization

**Components:**
- Query UI (port 16686)
- Collector (port 14250 gRPC, 14268 HTTP)
- Agent (port 6831 UDP)

**Sampling Strategies:**
- 10% default sampling
- 50% for application (lucide-app)
- 80% for transaction services

### 5. Node Exporter (9100)

**Purpose:** Infrastructure metrics collection

**Metrics:**
- CPU usage
- Memory usage
- Disk usage
- Network I/O
- Load average
- System uptime

### 6. cAdvisor (8080)

**Purpose:** Container resource metrics

**Metrics:**
- Container CPU usage
- Container memory usage
- Container network stats
- Disk I/O

---

## Quick Start

### Prerequisites

```bash
# Required environment variables
export GRAFANA_ADMIN_PASSWORD=your-secure-password
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
export ALERTS_EMAIL_TO=team@example.com
export ALERTS_EMAIL_FROM=alerts@example.com
export PAGERDUTY_SERVICE_KEY=your-service-key
```

### Starting the Monitoring Stack

```bash
# 1. Create data directories
mkdir -p monitoring/{prometheus,grafana,alertmanager}/{data,logs}

# 2. Start all monitoring services
docker-compose up -d prometheus grafana alertmanager jaeger node-exporter cadvisor

# 3. Verify services are running
docker-compose ps

# 4. Access the dashboards
# Grafana:     http://localhost:3000
# Prometheus:  http://localhost:9090
# AlertManager: http://localhost:9093
# Jaeger:      http://localhost:16686
```

### Verifying Installation

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check Grafana health
curl http://localhost:3000/api/health

# Check AlertManager
curl http://localhost:9093/api/v1/alerts

# Check Jaeger
curl http://localhost:16686/api/v1/services
```

---

## Configuration

### Environment Variables

```bash
# Prometheus
PROMETHEUS_PORT=9090
PROMETHEUS_CPUS_LIMIT=2
PROMETHEUS_MEMORY_LIMIT=1024M

# Grafana
GRAFANA_PORT=3000
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=your-password
GRAFANA_CPUS_LIMIT=1
GRAFANA_MEMORY_LIMIT=512M

# AlertManager
ALERTMANAGER_PORT=9093

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
ALERTS_EMAIL_TO=team@example.com
ALERTS_EMAIL_FROM=alerts@example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
PAGERDUTY_SERVICE_KEY=your-key

# Jaeger
JAEGER_QUERY_PORT=16686
JAEGER_COLLECTOR_PORT=14250
JAEGER_AGENT_PORT=6831
```

### Modifying Alert Rules

```bash
# Edit alert rules
vim monitoring/prometheus/alert_rules.yml

# Reload Prometheus to apply changes
docker-compose restart prometheus

# Verify rules loaded
curl http://localhost:9090/api/v1/rules
```

### Modifying Recording Rules

```bash
# Edit recording rules for query optimization
vim monitoring/prometheus/recording_rules.yml

# Changes apply on next Prometheus restart
docker-compose restart prometheus

# List recording rules
curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name | contains("recording"))'
```

### Configuring AlertManager Routing

```bash
# Edit routing rules
vim monitoring/alertmanager/alertmanager.yml

# Reload AlertManager
docker-compose restart alertmanager

# Test alert routing
curl -X POST http://localhost:9093/api/v1/alerts \
  -H 'Content-Type: application/json' \
  -d '{
    "alerts": [{
      "status": "firing",
      "labels": {
        "alertname": "TestAlert",
        "severity": "critical"
      }
    }]
  }'
```

---

## Dashboards

### System Overview

**URL:** `http://localhost:3000/d/system-overview`

**Key Metrics:**
- CPU Usage (gauge)
- Memory Usage (gauge)
- Disk Usage (gauge)
- Request Rate (time series)
- Error Rate (time series)

**Usage:**
- Monitor overall system health
- Identify resource bottlenecks
- Spot traffic anomalies

### Application Metrics

**URL:** `http://localhost:3000/d/app-metrics`

**Key Metrics:**
- Error Rate Percentage
- Response Latency (p50, p95, p99)
- Request Rate by Handler
- Error Rate by Status Code

**Usage:**
- Monitor API performance
- Track error trends
- Identify slow endpoints

### Business Metrics

**URL:** `http://localhost:3000/d/business-metrics`

**Key Metrics:**
- Transaction Processing Rate
- Transaction Success Rate
- Transaction Latency
- Report Generation Rate

**Usage:**
- Monitor transaction pipeline
- Track business KPIs
- Identify processing bottlenecks

### Database Performance

**URL:** `http://localhost:3000/d/database-performance`

**Key Metrics:**
- Connection Pool Usage
- Query Rate
- Query Latency (p50, p95, p99)
- Slow Queries Count

**Usage:**
- Monitor database health
- Identify slow queries
- Track connection pool utilization

### Creating Custom Dashboards

```bash
# 1. Navigate to Grafana
# http://localhost:3000

# 2. Click "+" > "Dashboard"

# 3. Add panels with PromQL queries
# Example queries:
# - up{job="lucide-app"}                    # App availability
# - rate(http_requests_total[5m])          # Request rate
# - histogram_quantile(0.95, http_request_duration_seconds_bucket)  # p95 latency
# - job:http_error_rate:percentage         # Error rate %
```

---

## Alerting

### Alert Severity Levels

| Severity | Response Time | Notification | Escalation |
|----------|--------------|--------------|-----------|
| Critical | Immediate    | PagerDuty    | 15 minutes |
| Warning  | 30 minutes   | Slack/Email  | 6 hours    |
| Info     | Business hrs | Email        | 24 hours   |

### Predefined Alerts

#### Infrastructure Alerts

**CPU Alerts:**
- `HighCPUUsage` - CPU > 80% for 5m (warning)
- `CriticalCPUUsage` - CPU > 95% for 2m (critical)

**Memory Alerts:**
- `HighMemoryUsage` - Memory > 80% for 5m (warning)
- `CriticalMemoryUsage` - Memory > 95% for 2m (critical)

**Disk Alerts:**
- `HighDiskUsage` - Disk > 80% full (warning)
- `CriticalDiskUsage` - Disk > 95% full (critical)

#### Application Alerts

**Availability:**
- `ApplicationDown` - App not responding for 1m (critical)

**Performance:**
- `HighErrorRate` - Error rate > 5% for 5m (warning)
- `CriticalErrorRate` - Error rate > 10% for 2m (critical)
- `HighLatency` - p95 latency > 1s for 5m (warning)
- `CriticalLatency` - p95 latency > 5s for 2m (critical)

**Anomalies:**
- `RequestRateSurge` - Request rate doubles for 5m (warning)

#### Business Alerts

**Transactions:**
- `HighTransactionLatency` - p95 > 2s (warning)
- `HighTransactionFailureRate` - Failure > 5% (critical)
- `TransactionQueueBuildup` - Queue > 1000 items (warning)

**Reports:**
- `ReportGenerationTimeout` - p95 > 30s (warning)
- `ReportGenerationFailure` - Failure rate > 1% (warning)

#### Database Alerts

**Performance:**
- `HighDatabaseConnections` - Pool > 80% (warning)
- `HighDatabaseQueryLatency` - p95 > 1s (warning)
- `DatabaseReplicationLag` - Lag > 10s (critical)

### Managing Alerts

```bash
# View active alerts
curl http://localhost:9093/api/v1/alerts | jq

# Silence an alert (30 minutes)
curl -X POST http://localhost:9093/api/v1/alerts/grouped_silences \
  -H 'Content-Type: application/json' \
  -d '{
    "matcher": [{"name": "alertname", "value": "HighCPUUsage"}],
    "duration": "30m"
  }'

# Get silences
curl http://localhost:9093/api/v1/silences | jq

# Delete silence
curl -X DELETE http://localhost:9093/api/v1/silence/{id}
```

### Testing Alerts

```bash
# Trigger test alert for Slack
curl -X POST http://localhost:9093/api/v1/alerts \
  -H 'Content-Type: application/json' \
  -d '{
    "alerts": [{
      "status": "firing",
      "labels": {
        "alertname": "TestAlert",
        "severity": "warning",
        "category": "test"
      },
      "annotations": {
        "summary": "Test alert from Prometheus",
        "description": "This is a test notification"
      }
    }]
  }'
```

---

## Distributed Tracing

### Accessing Jaeger UI

```
http://localhost:16686
```

### Viewing Traces

1. **Select Service:** Choose `lucide-app` or other services
2. **Filter Traces:** By operation, latency, error status
3. **Analyze Span Details:** View timing, logs, and tags for each span

### Trace Sampling

Default sampling rates are configured in `monitoring/jaeger/sampling-strategies.json`:

```json
{
  "default_strategy": {
    "type": "probabilistic",
    "param": 0.1  // 10% sampling by default
  },
  "service_strategies": [
    {
      "service": "transactions",
      "type": "probabilistic",
      "param": 0.8  // 80% for transaction service
    }
  ]
}
```

### Enabling Application Tracing

```typescript
import { initializeTracer, startAsyncSpan } from './services/monitoring/tracing';

// Initialize tracer at startup
initializeTracer('lucide-app');

// Wrap async operations
async function processTransaction(id: string) {
  return startAsyncSpan('processTransaction', async (span) => {
    span.setAttributes({
      'transaction.id': id,
      'transaction.type': 'payment'
    });
    // ... your code
  });
}
```

### Viewing Service Dependencies

1. Navigate to Jaeger UI
2. Click "Dependencies" tab
3. View service call relationships

---

## Custom Metrics

### Application-Level Metrics

The application exposes metrics on `/metrics` endpoint:

```bash
# Get all metrics
curl http://localhost:8787/metrics

# Filter specific metrics
curl http://localhost:8787/metrics | grep transaction_processing
```

### Recording Transaction Metrics

```typescript
import { recordTransaction } from './services/monitoring/metrics';

// Record successful transaction
recordTransaction('payment', 1.234, 'success');

// Record failed transaction
recordTransaction('refund', 2.345, 'failure', 'insufficient_balance');
```

### Recording Report Generation

```typescript
import { recordReport } from './services/monitoring/metrics';

// Record report generation
recordReport('financial-statement', 5.678, 'success');
```

### Recording Database Operations

```typescript
import { recordDatabaseQuery } from './services/monitoring/metrics';

const start = Date.now();
// ... database operation
recordDatabaseQuery('SELECT', 'transactions', (Date.now() - start) / 1000);
```

### Recording Cache Operations

```typescript
import { recordCacheHit, recordCacheMiss } from './services/monitoring/metrics';

if (cached) {
  recordCacheHit('dre-cache', 'dre-list');
} else {
  recordCacheMiss('dre-cache', 'dre-list');
}
```

### Custom Metric Queries

```promql
# Transaction success rate
(
  sum(transaction_processing_total{status="success"}) /
  sum(transaction_processing_total)
) * 100

# P95 transaction latency
histogram_quantile(
  0.95,
  sum(rate(transaction_processing_duration_seconds_bucket[5m])) by (le)
)

# Cache hit ratio
sum(cache_hits_total) / (sum(cache_hits_total) + sum(cache_misses_total))

# Database connection pool utilization
db_pool_connections_active / db_pool_connections_max * 100
```

---

## SLA Targets

### System Availability

| Target | Threshold |
|--------|-----------|
| Uptime | 99.9% monthly |
| MTTR (Mean Time To Recover) | < 15 minutes |

### API Performance

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| p95 Latency | < 500ms | > 1000ms |
| p99 Latency | < 1s | > 5s |
| Error Rate | < 0.1% | > 5% |
| Availability | 99.9% | < 99% |

### Transaction Processing

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| p95 Latency | < 2s | > 2s |
| Success Rate | > 99.5% | < 95% |
| Queue Size | < 100 | > 1000 |

### Report Generation

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| p95 Latency | < 30s | > 30s |
| Success Rate | > 99% | < 99% |
| Queue Size | < 50 | > 500 |

### Database Performance

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Query Latency (p95) | < 100ms | > 1000ms |
| Connection Pool Usage | < 70% | > 80% |
| Replication Lag | < 1s | > 10s |

### Cache Performance

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Hit Ratio | > 80% | < 50% |
| Eviction Rate | < 10/s | > 100/s |

---

## Troubleshooting

### Common Issues

#### Prometheus not scraping metrics

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check Prometheus logs
docker-compose logs prometheus | tail -20

# Verify application metrics endpoint
curl http://localhost:8787/metrics | head -20

# Check network connectivity between containers
docker-compose exec prometheus curl http://app:8787/metrics
```

#### Grafana dashboards not showing data

```bash
# Verify Prometheus data source
# 1. Go to http://localhost:3000/datasources
# 2. Click Prometheus
# 3. Click "Save & Test"

# Check if metrics exist
curl http://localhost:9090/api/v1/query?query=up

# Verify dashboard JSON
# Dashboards are in monitoring/grafana/dashboards/

# Reload dashboards
docker-compose restart grafana
```

#### Alerts not firing

```bash
# Verify alert rules loaded
curl http://localhost:9090/api/v1/rules | jq '.data.groups'

# Test alert expression manually
curl 'http://localhost:9090/api/v1/query?query=instance:node_cpu_usage:rate5m'

# Check AlertManager logs
docker-compose logs alertmanager | tail -20

# Verify notification channels configured
vim monitoring/alertmanager/alertmanager.yml

# Test notification delivery
docker-compose exec alertmanager amtool alert --alertmanager.url=http://localhost:9093
```

#### Jaeger not receiving traces

```bash
# Check Jaeger collector
curl http://localhost:14250

# Verify application initialization
# In your code: initializeTracer('lucide-app')

# Check Jaeger logs
docker-compose logs jaeger | tail -20

# Test span submission
curl -X POST http://localhost:14268/api/traces \
  -H 'Content-Type: application/json' \
  -d '{}'
```

#### High memory usage in Prometheus

```bash
# Reduce retention period
docker-compose down prometheus
# Edit monitoring/prometheus/prometheus.yml
# Change: --storage.tsdb.retention.time=7d (instead of 30d)
docker-compose up -d prometheus

# Or disable certain metrics in prometheus.yml
# metric_relabel_configs with drop action
```

---

## Performance Optimization

### Retention Policies

```yaml
# prometheus.yml
--storage.tsdb.retention.time=30d    # Keep 30 days of data
--storage.tsdb.retention.size=10GB   # Or limit by size
```

### Recording Rules

Pre-computed queries reduce on-the-fly computation:

```bash
# List recording rules
curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name | contains("recording"))'

# Recording rules are in monitoring/prometheus/recording_rules.yml
```

### Alert Suppression

Inhibit rules prevent duplicate/redundant alerts:

```yaml
# alertmanager.yml inhibit_rules:
- source_match:
    severity: 'critical'
    alertname: 'CriticalCPUUsage'
  target_match:
    severity: 'warning'
    alertname: 'HighCPUUsage'
  equal: ['instance']
```

---

## Disaster Recovery

### Backing up Prometheus Data

```bash
# Create backup
docker-compose exec prometheus tar czf - /prometheus | \
  gzip > prometheus_backup_$(date +%Y%m%d).tar.gz

# Restore from backup
tar xzf prometheus_backup_*.tar.gz -C monitoring/prometheus/data
docker-compose restart prometheus
```

### Backing up Grafana Configuration

```bash
# Export all dashboards
curl http://localhost:3000/api/search \
  -H "Authorization: Bearer YOUR_API_TOKEN" | \
  jq '.[] | .id' | \
  while read id; do
    curl http://localhost:3000/api/dashboards/uid/$id \
      -H "Authorization: Bearer YOUR_API_TOKEN" > dashboard_$id.json
  done

# Export data sources
curl http://localhost:3000/api/datasources \
  -H "Authorization: Bearer YOUR_API_TOKEN" > datasources.json
```

---

## Production Checklist

- [ ] Set secure Grafana admin password
- [ ] Configure email/Slack/PagerDuty notifications
- [ ] Review and customize alert rules
- [ ] Verify dashboard accuracy
- [ ] Test alert notifications
- [ ] Configure backup strategy
- [ ] Set up log aggregation
- [ ] Document runbooks for alerts
- [ ] Schedule on-call rotation
- [ ] Monitor monitoring stack itself

---

## Support & Documentation

- **Prometheus Docs:** https://prometheus.io/docs/
- **Grafana Docs:** https://grafana.com/docs/
- **AlertManager Docs:** https://prometheus.io/docs/alerting/latest/configuration/
- **Jaeger Docs:** https://www.jaegertracing.io/docs/
- **Lucide CRMT Docs:** See PROJECT_ROOT/docs/

---

## Version History

| Phase | Date | Changes |
|-------|------|---------|
| 22.22 | Oct 2026 | Initial implementation - Prometheus, Grafana, AlertManager, Jaeger |

---

**End of Monitoring Setup Guide**
