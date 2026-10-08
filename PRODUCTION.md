# Production Environment Guide

**Release Version:** v22.19  
**Created:** 2026-10-08  
**Maintainer:** DevOps & Platform Engineering  
**Last Updated:** 2026-10-08

---

## Table of Contents

1. [Environment Setup](#1-environment-setup)
2. [Scaling Guidelines](#2-scaling-guidelines)
3. [Performance Tuning](#3-performance-tuning)
4. [Monitoring & Observability](#4-monitoring--observability)
5. [Alert Configuration](#5-alert-configuration)
6. [Troubleshooting Guide](#6-troubleshooting-guide)
7. [Disaster Recovery](#7-disaster-recovery)
8. [Runbooks](#8-runbooks)

---

## 1. Environment Setup

### 1.1 Infrastructure Architecture

**Production Environment Overview:**

```
Internet
   ↓
CloudFlare (DDoS protection, CDN)
   ↓
AWS ALB (Application Load Balancer)
   ↓
Kubernetes Cluster (EKS)
├── App Pods (3-10 replicas, auto-scaling)
├── Database Pod (Primary)
└── Redis Pod (Caching)
   ↓
Managed Services:
├── RDS PostgreSQL (Multi-AZ)
├── ElastiCache Redis (Multi-AZ)
├── S3 (Static assets)
└── CloudWatch (Monitoring)
```

### 1.2 Server Specifications

**Production Cluster Nodes:**

```yaml
Node Type: EC2 t3.xlarge
CPU: 4 vCPU
Memory: 16 GB
Storage: 100 GB SSD (gp3)
Network: Enhanced (10 Gbps)
Availability Zones: 3 (us-east-1a, us-east-1b, us-east-1c)
```

**Kubernetes Configuration:**

```yaml
API Version: v1.27
Container Runtime: containerd
Pod Memory Request: 512 MB
Pod Memory Limit: 1024 MB
Pod CPU Request: 500m
Pod CPU Limit: 1000m
```

### 1.3 Database Configuration

**PostgreSQL Production Setup:**

```yaml
Engine: PostgreSQL 15.1
Instance Type: db.r6i.2xlarge (Multi-AZ)
Storage: 500 GB (gp3, auto-scaling to 1TB)
IOPS: 5000 (provisioned)
Backup Retention: 30 days
Multi-AZ: Enabled
Failover: Automatic
Encryption: AES-256 at-rest
```

**Connection Pool Configuration:**

```yaml
Min Connections: 5
Max Connections: 20
Connection Timeout: 30 seconds
Idle Timeout: 5 minutes
Connection Reuse: Enabled
SSL: Required (TLS 1.2+)
```

### 1.4 Redis Configuration

**ElastiCache Redis Setup:**

```yaml
Engine: Redis 7.0
Node Type: cache.r6g.xlarge
Number of Nodes: 3 (Cluster mode enabled)
Automatic Failover: Enabled
Snapshot Retention: 7 days
Encryption: At-rest (AES-256)
Transit Encryption: TLS
Parameter Group: custom-production
```

**Memory Configuration:**

```yaml
Maxmemory Policy: allkeys-lru
Memory Threshold: 90% triggers eviction
TTL Strategy: exponential backoff
```

### 1.5 Environment Variables

**Production Configuration (.env.production):**

```bash
# Application
NODE_ENV=production
LOG_LEVEL=info
DEBUG=false
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@prod-db.c9akciq32.us-east-1.rds.amazonaws.com:5432/lucide_prod
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_STATEMENT_CACHE_SIZE=25

# Redis
REDIS_URL=rediss://prod-redis.abc123.ng.0001.use1.cache.amazonaws.com:6379
REDIS_TLS=true
REDIS_KEY_PREFIX=prod:

# Authentication
JWT_SECRET=[VAULT-MANAGED]
JWT_EXPIRATION=15m
REFRESH_TOKEN_SECRET=[VAULT-MANAGED]
REFRESH_TOKEN_EXPIRATION=7d

# Encryption
ENCRYPTION_KEY=[VAULT-MANAGED]
ENCRYPTION_ALGORITHM=aes-256-gcm

# API Keys
STRIPE_API_KEY=[VAULT-MANAGED]
SENDGRID_API_KEY=[VAULT-MANAGED]
TWILIO_API_KEY=[VAULT-MANAGED]

# Monitoring
DATADOG_API_KEY=[VAULT-MANAGED]
SENTRY_DSN=[VAULT-MANAGED]
NEW_RELIC_LICENSE_KEY=[VAULT-MANAGED]

# AWS
AWS_REGION=us-east-1
AWS_S3_BUCKET=prod-lucide-assets
AWS_KMS_KEY_ID=[VAULT-MANAGED]

# Feature Flags
FEATURE_FLAG_VOICE_COMMANDS=false
FEATURE_FLAG_SOCIAL_SHARING=false
FEATURE_FLAG_CRYPTO_SUPPORT=false
```

### 1.6 Security Configuration

**TLS/SSL Setup:**

```bash
# Certificate
Certificate Path: /etc/letsencrypt/live/api.example.com/
Key Path: /etc/letsencrypt/live/api.example.com/privkey.pem
Certificate Chain: /etc/letsencrypt/live/api.example.com/fullchain.pem
Auto-renewal: Enabled (cert-manager)
Renewal Check: Every 12 hours
Renewal Trigger: 30 days before expiration
```

**Security Headers Configuration:**

```nginx
# Nginx Configuration
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

---

## 2. Scaling Guidelines

### 2.1 Horizontal Scaling (Number of Instances)

**Auto-Scaling Policy:**

```yaml
Minimum Replicas: 3
Maximum Replicas: 10
Target CPU Utilization: 70%
Target Memory Utilization: 80%
Scale-Up Cooldown: 60 seconds
Scale-Down Cooldown: 300 seconds

Metrics:
  - CPU: threshold 70%, add 1 pod
  - Memory: threshold 80%, add 1 pod
  - Requests Per Second: threshold 1000, add 1 pod
  - P95 Response Time: threshold 1000ms, add 1 pod
```

**Scaling Actions:**

```bash
# Manual scaling (if needed)
kubectl scale deployment lucide-app --replicas=8 -n production

# Check current replicas
kubectl get deployment lucide-app -n production

# Monitor scaling events
kubectl describe hpa lucide-app -n production
```

### 2.2 Vertical Scaling (Resource Allocation)

**Memory Scaling Strategy:**

```yaml
Current:
  Request: 512 MB
  Limit: 1024 MB
  
Scaling Thresholds:
  - Memory usage > 800MB: allocate 2GB limit
  - Memory usage > 1.5GB: allocate 3GB limit
  - Memory usage > 2GB: investigate memory leak
```

**CPU Scaling Strategy:**

```yaml
Current:
  Request: 500m
  Limit: 1000m
  
Scaling Thresholds:
  - CPU > 80%: allocate 2000m limit
  - CPU > 90%: investigate CPU hotspot
```

### 2.3 Database Scaling

**PostgreSQL Vertical Scaling:**

```yaml
Current: db.r6i.2xlarge

Scale-Up Trigger:
  - CPU > 80% sustained (10 minutes)
  - Memory > 85%
  - Read latency > 100ms
  - Write latency > 50ms

Next Tier: db.r6i.4xlarge (double CPU/memory)

Downtime: 1-2 minutes (Multi-AZ failover)
```

**PostgreSQL Connection Scaling:**

```yaml
Current: 20 max connections per app instance × 3 instances = 60 total

Scale-Up Trigger:
  - Active connections > 80% of max
  - Connection wait time increasing
  - Slow query log filling up

Actions:
  - Add read replicas for read-heavy workloads
  - Implement query result caching (Redis)
  - Optimize query performance
```

### 2.4 Redis Scaling

**Cache Scaling Strategy:**

```yaml
Current: 3-node cluster (18 GB total memory)

Monitoring:
  - Used memory > 80%: add node
  - Eviction rate > 100/sec: add node
  - Latency > 10ms: investigate
  - Hit rate < 80%: investigate

Scaling Actions:
  - Cluster resharding (add new nodes)
  - Automatic failover: enabled
```

---

## 3. Performance Tuning

### 3.1 Application-Level Tuning

**Node.js Configuration:**

```javascript
// server.js
process.env.NODE_ENV = 'production';

// Enable clustering
const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
  const numCPUs = os.cpus().length;
  
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  const app = require('./app');
  const port = process.env.PORT || 3000;
  
  app.listen(port, () => {
    console.log(`Worker ${process.pid} listening on port ${port}`);
  });
}
```

**Express Middleware Optimization:**

```javascript
// Use compression
const compression = require('compression');
app.use(compression({
  level: 6,
  threshold: 10 * 1000, // 10KB
}));

// Use helmet for security
const helmet = require('helmet');
app.use(helmet());

// Request logging (only in production)
const morgan = require('morgan');
app.use(morgan('combined', {
  skip: (req) => req.path.startsWith('/health'),
}));

// Connection pooling
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 3.2 Database Optimization

**Query Optimization:**

```sql
-- Enable query analysis
EXPLAIN ANALYZE SELECT * FROM transactions 
WHERE user_id = 123 AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 100;

-- Create indexes for common queries
CREATE INDEX idx_transactions_user_created 
ON transactions(user_id, created_at DESC);

CREATE INDEX idx_transactions_user_category 
ON transactions(user_id, category);

-- Vacuum and analyze (auto-vacuum disabled in production)
VACUUM ANALYZE;

-- Monitor slow queries
log_min_duration_statement = 500; -- Log queries > 500ms
```

**Connection Pooling Optimization:**

```yaml
PgBouncer Configuration:
  Pool Mode: transaction (most efficient)
  Min Pool Size: 10
  Default Pool Size: 25
  Reserve Pool Size: 5
  Reserve Pool Timeout: 3 seconds
  Max Client Conn: 100
  Max Db Connections: 100
  Max Idle Time: 300
```

### 3.3 Caching Strategy

**Redis Cache Tiers:**

```javascript
// Tier 1: In-memory cache (Node.js process)
const cache = new Map();
const cacheTTL = 5 * 60 * 1000; // 5 minutes

// Tier 2: Redis cache (shared across instances)
const redis = require('redis');
const client = redis.createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
  },
});

// Cache retrieval pattern
async function getCachedData(key) {
  // Check in-memory cache first
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  // Check Redis
  const cached = await client.get(key);
  if (cached) {
    cache.set(key, cached);
    return cached;
  }
  
  // Fetch from database
  const data = await db.query(key);
  await client.setEx(key, 3600, JSON.stringify(data)); // 1 hour TTL
  cache.set(key, data);
  return data;
}
```

**Cache Invalidation Strategy:**

```javascript
// Invalidate cache on data change
async function updateTransaction(id, data) {
  // Update database
  await db.query('UPDATE transactions SET ... WHERE id = ?', [id]);
  
  // Invalidate related caches
  await client.del(`transaction:${id}`);
  await client.del(`user:${data.user_id}:summary`);
  await client.del(`category:${data.category}:stats`);
}
```

---

## 4. Monitoring & Observability

### 4.1 Metrics Collection

**Prometheus Metrics Configuration:**

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  scrape_timeout: 10s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'lucide-app'
    static_configs:
      - targets: ['localhost:9090']
  
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:5432']
  
  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:6379']
```

**Custom Application Metrics:**

```javascript
const prometheus = require('prom-client');

// Request duration histogram
const httpDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5],
});

// Request counter
const httpRequests = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

// Custom application metrics
const activeUsers = new prometheus.Gauge({
  name: 'active_users',
  help: 'Number of active users',
});

const queueSize = new prometheus.Gauge({
  name: 'job_queue_size',
  help: 'Size of job queue',
  labelNames: ['queue_name'],
});
```

### 4.2 Logging Configuration

**Centralized Logging (ELK Stack):**

```yaml
# logstash.conf
input {
  tcp {
    port => 5000
    codec => json
  }
}

filter {
  mutate {
    add_field => { "[@metadata][index_name]" => "lucide-%{+YYYY.MM.dd}" }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "%{[@metadata][index_name]}"
  }
}
```

**Application Logging (Winston):**

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});
```

### 4.3 Distributed Tracing

**OpenTelemetry Configuration:**

```javascript
const opentelemetry = require('@opentelemetry/api');
const { BasicTracerProvider } = require('@opentelemetry/tracing');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { registerInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const jaegerExporter = new JaegerExporter({
  serviceName: 'lucide-app',
  host: process.env.JAEGER_HOST || 'localhost',
  port: process.env.JAEGER_PORT || 6832,
});

const tracerProvider = new BasicTracerProvider();
tracerProvider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));
opentelemetry.trace.setGlobalTracerProvider(tracerProvider);

registerInstrumentations({
  tracerProvider,
});
```

---

## 5. Alert Configuration

### 5.1 Critical Alerts

**Alert Rules (Prometheus):**

```yaml
groups:
  - name: lucide_critical
    interval: 30s
    rules:
      # API Error Rate Alert
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 5m
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }}"
          action: "Page on-call engineer immediately"
      
      # Response Time Alert
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, http_request_duration_seconds) > 1
        for: 5m
        annotations:
          summary: "High response time"
          description: "P95 response time: {{ $value }}s"
          action: "Check application performance"
      
      # Database Connection Alert
      - alert: HighDatabaseConnections
        expr: pg_stat_activity_count > 80
        for: 5m
        annotations:
          summary: "High database connections"
          description: "Active connections: {{ $value }}"
          action: "Review slow queries, consider scaling"
      
      # Out of Memory Alert
      - alert: OutOfMemory
        expr: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.95
        for: 1m
        annotations:
          summary: "Container running out of memory"
          description: "Memory usage: {{ $value | humanizePercentage }}"
          action: "Increase memory allocation or investigate leak"
      
      # Pod Restart Alert
      - alert: PodRestartingTooOften
        expr: rate(kube_pod_container_status_restarts_total[15m]) > 0.5
        for: 5m
        annotations:
          summary: "Pod restarting frequently"
          description: "Pod restart rate: {{ $value | humanize }}"
          action: "Check logs for errors"
      
      # Database Replication Lag
      - alert: ReplicationLagTooHigh
        expr: pg_replication_lag > 30
        for: 5m
        annotations:
          summary: "High database replication lag"
          description: "Lag: {{ $value }}s"
          action: "Investigate replication status"
```

### 5.2 Alert Routing (PagerDuty)

**Escalation Policy:**

```yaml
Critical (5 minute escalation):
  Level 1: On-call Engineer (primary)
  Level 2: On-call Engineer (backup)
  Level 3: DevOps Team Lead
  Level 4: VP Engineering

High (15 minute escalation):
  Level 1: On-call Engineer
  Level 2: DevOps Team
  
Medium (30 minute escalation):
  Level 1: Support Team (ticket creation)
  Level 2: DevOps Team (if not resolved)
  
Low (no escalation):
  - Logged for daily review
  - Trend analysis for optimization
```

---

## 6. Troubleshooting Guide

### 6.1 High CPU Usage

**Diagnosis:**

```bash
# Check container CPU
kubectl top pods -n production

# Check node CPU
kubectl top nodes

# Identify hot container
kubectl logs <pod-name> -n production | grep CPU

# Get CPU profile
kubectl exec -it <pod-name> -n production -- node --prof
```

**Root Causes & Solutions:**

| Symptom | Cause | Solution |
|---------|-------|----------|
| Sustained > 80% CPU | Slow query | Optimize query; add index |
| CPU spike on schedule | Background job | Reduce job frequency; parallelize |
| CPU after code deploy | New code regression | Rollback; investigate changes |
| CPU > 95% | Insufficient capacity | Scale horizontally; add resources |

### 6.2 High Memory Usage

**Diagnosis:**

```bash
# Check memory
kubectl top pods -n production --sort-by memory

# Memory profiling
kubectl exec -it <pod-name> -n production -- node --heap-prof
node --prof-process isolate-*.log > memory-profile.txt

# Check for memory leaks
npm ls | grep duplicate
```

**Root Causes & Solutions:**

| Symptom | Cause | Solution |
|---------|-------|----------|
| Memory growth over time | Memory leak | Fix leak; restart container |
| Sudden memory spike | Large query result | Paginate results; optimize |
| Memory > 95% | Insufficient allocation | Increase pod limit |
| OOMKilled pods | Consistently over limit | Review memory requirements |

### 6.3 High Latency

**Diagnosis:**

```bash
# Check API response times
kubectl logs <pod-name> -n production | grep "response_time"

# Check database query times
SELECT query, mean_time FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;

# Network latency check
kubectl exec <pod-name> -n production -- ping database-host

# Check Redis latency
redis-cli --latency -h <redis-host>
```

**Root Causes & Solutions:**

| Symptom | Cause | Solution |
|---------|-------|----------|
| API latency > 500ms | Slow database query | Optimize query; add index |
| Latency spikes at times | Background jobs | Schedule off-peak |
| Database latency | High load | Scale database; optimize |
| Cache miss storm | Large data change | Implement cache warming |

### 6.4 Database Issues

**Connection Problems:**

```bash
# Check connections
SELECT datname, usename, state, count(*) 
FROM pg_stat_activity 
GROUP BY datname, usename, state;

# Kill idle connections
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'idle' 
AND query_start < NOW() - INTERVAL '1 hour';

# Check connection pool
SHOW max_connections;
SHOW max_prepared_transactions;
```

**Replication Lag:**

```bash
# Check replica lag
SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp()));

# Monitor write rate
SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0');

# Restart replication if needed
SELECT pg_wal_replay_resume();
```

### 6.5 Network Issues

**Connectivity Issues:**

```bash
# Test DNS resolution
kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- nslookup database-host

# Test connectivity
kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- nc -zv database-host 5432

# Check service endpoints
kubectl get endpoints -n production
kubectl describe service lucide-app -n production
```

---

## 7. Disaster Recovery

### 7.1 Backup & Restoration

**Automated Backups:**

```yaml
Database Backups:
  - Frequency: Daily at 2 AM UTC
  - Full backup: Weekly (Sunday)
  - Incremental: Daily (Mon-Sat)
  - Retention: 30 days (hot), 1 year (archive)
  - Location: S3 with cross-region replication

File Backups:
  - S3 versioning: enabled
  - Lifecycle: 90 days (hot), archive after 1 year
  - Replication: cross-region
```

**Point-in-Time Recovery:**

```bash
# Restore to specific point in time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier prod-db \
  --target-db-instance-identifier prod-db-restore \
  --restore-time 2026-10-08T15:30:00Z

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier prod-db-restore \
  --db-snapshot-identifier prod-db-snapshot-20261008
```

### 7.2 Failover Procedures

**Automatic Failover:**

```yaml
Database Failover:
  - Multi-AZ: enabled
  - Failover time: 1-2 minutes
  - Health check interval: 30 seconds
  - Failover trigger: replica lag > 30s or primary unhealthy
  
Application Failover:
  - Load balancer: health checks every 30s
  - Unhealthy pod removed: < 30s
  - Auto-scaling: triggered on capacity loss
  - Pod restart: automatic via Kubernetes
```

**Manual Failover (if needed):**

```bash
# Promote read replica
aws rds promote-read-replica \
  --db-instance-identifier prod-db-replica

# Update connection strings
kubectl set env deployment/lucide-app \
  DATABASE_URL=postgresql://user:pass@new-primary:5432/lucide_prod \
  -n production

# Verify replication
SELECT datname, usename, client_addr FROM pg_stat_replication;
```

---

## 8. Runbooks

### 8.1 Incident Response Runbook

**When Page Received (Do Immediately):**

1. Acknowledge alert in PagerDuty (60 seconds)
2. Join war room Zoom/Slack
3. Check incident dashboard (Datadog/New Relic)
4. Determine impact: users affected, services down, etc.

**First 5 Minutes:**

1. Check status page (is issue external?)
2. Check recent deployments (deployed in last hour?)
3. Check alerts history (similar issues before?)
4. Run diagnostic dashboard
5. Start incident timeline

**If Service Down:**

1. Check application logs for errors
2. Check database connectivity
3. Check external dependencies (payment, SMS, email)
4. Attempt quick fix OR rollback

**If Rollback Needed:**

```bash
# Get previous stable version
kubectl rollout history deployment/lucide-app -n production

# Rollback
kubectl rollout undo deployment/lucide-app -n production

# Verify rollback
kubectl get pods -n production
kubectl logs -l app=lucide-app -n production
```

### 8.2 Scaling Runbook

**Scale Up (When Load High):**

```bash
# Manual horizontal scaling
kubectl scale deployment lucide-app --replicas=8 -n production

# Verify scaling
kubectl get deployment lucide-app -n production -w

# Monitor new pods
kubectl describe pods -l app=lucide-app -n production
```

**Scale Down (When Load Low):**

```bash
# HPA will handle automatically
# Manual scaling if needed
kubectl scale deployment lucide-app --replicas=3 -n production

# Drain connections gracefully
kubectl set env deployment/lucide-app \
  GRACEFUL_SHUTDOWN_TIMEOUT=30s -n production
```

### 8.3 Database Maintenance Runbook

**Slow Query Investigation:**

```sql
-- Find slow queries
SELECT query, calls, mean_time, max_time 
FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC;

-- Get query plan
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM transactions 
WHERE user_id = 123 
AND created_at > NOW() - INTERVAL '30 days';

-- Create index if needed
CREATE INDEX idx_transactions_user_date 
ON transactions(user_id, created_at DESC);

-- Verify index usage
SELECT * FROM pg_stat_user_indexes 
WHERE relname = 'transactions';
```

**Vacuum & Analyze:**

```bash
# This should run automatically, but can be manual
# Do NOT run during business hours
VACUUM ANALYZE;

# Monitor progress
SELECT datname, usename, query, query_start 
FROM pg_stat_activity 
WHERE query ILIKE '%vacuum%';
```

### 8.4 Certificate Renewal Runbook

**Manual Certificate Renewal (if auto-renewal fails):**

```bash
# Check certificate expiration
openssl x509 -in /etc/letsencrypt/live/api.example.com/cert.pem -text -noout | grep -A2 "Not Before\|Not After"

# Renew if expiring soon
certbot renew --force-renewal --cert-name api.example.com

# Reload nginx
kubectl rollout restart deployment/nginx-ingress-controller -n ingress-nginx

# Verify
openssl s_client -connect api.example.com:443 | grep -A2 "Issuer\|Not Before\|Not After"
```

---

## Quick Reference

### Health Checks

```bash
# Application health
curl https://api.example.com/health
curl https://api.example.com/health/ready

# Database health
kubectl exec -it <pod> -n production -- psql -U postgres -c "SELECT 1"

# Redis health
kubectl exec -it <redis-pod> -n production -- redis-cli ping

# Kubernetes cluster
kubectl get nodes
kubectl get pods -n production
kubectl get pvc -n production
```

### Emergency Contacts

| Role | Contact | Phone |
|------|---------|-------|
| On-Call Engineer | [TO BE FILLED] | [TO BE FILLED] |
| Incident Commander | [TO BE FILLED] | [TO BE FILLED] |
| DevOps Team Lead | [TO BE FILLED] | [TO BE FILLED] |
| VP Engineering | [TO BE FILLED] | [TO BE FILLED] |

### Important URLs

- Status Page: https://status.example.com
- Monitoring Dashboard: https://datadog.example.com
- Log Aggregation: https://logs.example.com/kibana
- Distributed Tracing: https://jaeger.example.com
- PagerDuty: https://pagerduty.example.com

---

**Document Version:** 1.0  
**Last Updated:** 2026-10-08  
**Next Review Date:** 2026-11-08  
**Owner:** DevOps Team
