# Service Level Agreements (SLAs) & Runbooks

## Overview

This document defines Service Level Objectives (SLOs), Service Level Agreements (SLAs), and runbooks for responding to monitoring alerts.

**Document Version:** 1.0  
**Last Updated:** October 2026  
**Maintained By:** Platform/DevOps Team

---

## Table of Contents

1. [Service Level Objectives (SLOs)](#service-level-objectives)
2. [Service Level Agreements (SLAs)](#service-level-agreements)
3. [Runbooks](#runbooks)
4. [Escalation Procedures](#escalation-procedures)
5. [Incident Response](#incident-response)

---

## Service Level Objectives

### API Availability

| SLO | Target | Measurement Period |
|-----|--------|-------------------|
| Uptime | 99.9% | Monthly |
| Error Budget | 43.2 minutes/month | Rolling 30 days |

**Calculation:**
- 99.9% uptime = 1000 - (minutes of downtime per month)
- Error budget: 100% - 99.9% = 0.1% = ~43.2 minutes/month

### API Performance

| Metric | SLO Target | Alert Threshold |
|--------|-----------|-----------------|
| p50 Latency | < 100ms | - |
| p95 Latency | < 500ms | > 1000ms |
| p99 Latency | < 1s | > 5s |
| Max Latency | < 5s | > 5s |
| Error Rate | < 0.1% | > 5% |

### Transaction Processing

| Metric | SLO Target | Alert Threshold |
|--------|-----------|-----------------|
| Processing Time (p95) | < 2s | > 2s |
| Success Rate | > 99.5% | < 99% |
| Queue Latency (max) | < 5s | > 10s |

### Report Generation

| Metric | SLO Target | Alert Threshold |
|--------|-----------|-----------------|
| Generation Time (p95) | < 30s | > 30s |
| Success Rate | > 99% | < 99% |
| Availability | 99% | < 99% |

### Database Performance

| Metric | SLO Target | Alert Threshold |
|--------|-----------|-----------------|
| Query Latency (p95) | < 100ms | > 1s |
| Connection Pool Available | > 20% | < 20% |
| Replication Lag | < 1s | > 10s |

### Infrastructure

| Metric | SLO Target | Alert Threshold |
|--------|-----------|-----------------|
| CPU Usage | < 70% | > 80% |
| Memory Usage | < 80% | > 80% |
| Disk Usage | < 85% | > 85% |
| Disk I/O Wait | < 10% | > 20% |

---

## Service Level Agreements

### Support Hours & Response Times

| Severity | Support Hours | Initial Response | Resolution Target |
|----------|--------------|-----------------|-------------------|
| Critical (P1) | 24/7 | 15 minutes | 4 hours |
| High (P2) | 24/7 | 1 hour | 8 hours |
| Medium (P3) | Business hours | 4 hours | 24 hours |
| Low (P4) | Business hours | 24 hours | 1 week |

### Severity Definitions

**Critical (P1):**
- Complete service unavailability
- Data loss risk
- Security breach
- All users affected

**High (P2):**
- Service partially unavailable
- Performance degradation > 50%
- Major feature broken
- Many users affected

**Medium (P3):**
- Minor feature not working
- Workaround available
- Some users affected
- Performance degradation < 50%

**Low (P4):**
- Cosmetic issues
- Documentation gaps
- Enhancement requests
- No user impact

---

## Runbooks

### ApplicationDown

**Severity:** Critical (P1)  
**Alert Condition:** Application not responding for 1 minute  
**Error Budget Impact:** High (50+ minutes/month)

#### Symptoms
- Application returns 502 Bad Gateway
- Health check endpoint fails
- Cannot connect on port 8787
- Load balancer marks backend as unhealthy

#### Investigation
```bash
# 1. Check if container is running
docker ps | grep lucide-crmt-app

# 2. Check application logs
docker-compose logs -f app --tail=100

# 3. Check system resources
docker stats lucide-crmt-app

# 4. Test health endpoint
curl -v http://localhost:8787/api/health

# 5. Check database connectivity
docker-compose logs -f app | grep -i "database\|connection"

# 6. Check for crash loops
docker events --filter "container=lucide-crmt-app"
```

#### Resolution Steps
1. **Immediate:** Restart application
   ```bash
   docker-compose restart app
   ```

2. **Monitor:** Watch for recovery
   ```bash
   curl -s http://localhost:8787/api/health | jq
   docker-compose logs -f app
   ```

3. **If restart doesn't help:**
   - Check disk space: `df -h`
   - Check memory: `free -h`
   - Check logs for startup errors
   - If corrupted database, restore from backup

4. **Communication:**
   - Notify stakeholders immediately
   - Post incident status to Slack
   - Update status page

**Escalation:** If not resolved in 15 minutes, escalate to platform team lead

---

### HighErrorRate / CriticalErrorRate

**Severity:** Warning (HighErrorRate) / Critical (CriticalErrorRate)  
**Alert Condition:** Error rate > 5% / > 10% for 5 minutes  
**Error Budget Impact:** Medium

#### Symptoms
- Increased HTTP 5xx responses
- User complaints of failed operations
- Spike in Sentry errors
- Downstream service failures

#### Investigation
```bash
# 1. Check which endpoints are failing
curl 'http://localhost:9090/api/v1/query?query=rate(http_requests_total{status=~"5.."}[5m]) by (handler)'

# 2. Check recent error logs
docker-compose logs app --tail=200 | grep -i error

# 3. Check database status
curl 'http://localhost:9090/api/v1/query?query=db_pool_connections_active'

# 4. Check external API status
curl 'http://localhost:9090/api/v1/query?query=external_api_errors_total'

# 5. Check Sentry dashboard
# Go to https://sentry.io and check recent errors
```

#### Resolution Steps
1. **Identify error type:**
   - Database error → Check database health
   - Timeout error → Check downstream services
   - Validation error → Check request format
   - External API error → Check API status

2. **Common fixes:**
   ```bash
   # Restart application
   docker-compose restart app
   
   # Check database connectivity
   docker-compose exec app sqlite3 /app/data/app.db "SELECT 1;"
   
   # Check cache
   docker-compose logs redis | tail -20
   ```

3. **Roll back if recent deployment:**
   ```bash
   # Revert to previous version
   git revert HEAD
   docker-compose build app
   docker-compose up -d app
   ```

4. **Monitor recovery:**
   ```bash
   # Watch error rate decrease
   curl 'http://localhost:9090/api/v1/query?query=job:http_error_rate:percentage'
   ```

**Escalation:** If error rate stays > 5% for 15 minutes, escalate to engineering team

---

### HighLatency / CriticalLatency

**Severity:** Warning (HighLatency) / Critical (CriticalLatency)  
**Alert Condition:** p95 latency > 1s / > 5s for 5 minutes

#### Symptoms
- Users report slow responses
- Dashboard shows high response times
- Spike in request duration
- Queue buildup at endpoints

#### Investigation
```bash
# 1. Check p95 latency by endpoint
curl 'http://localhost:9090/api/v1/query?query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) by (handler)'

# 2. Check if database is slow
curl 'http://localhost:9090/api/v1/query?query=job:db_query_latency:p95'

# 3. Check if external APIs are slow
curl 'http://localhost:9090/api/v1/query?query=job:api_latency:p95'

# 4. Check CPU/memory usage
docker stats lucide-crmt-app

# 5. Check for slow queries
docker-compose logs app | grep -i "slow\|duration"
```

#### Resolution Steps
1. **Quick wins:**
   ```bash
   # Clear cache
   docker-compose exec redis redis-cli FLUSHALL
   
   # Restart application (may clear memory)
   docker-compose restart app
   ```

2. **Identify bottleneck:**
   - Database slow? → Optimize queries, add indexes
   - Cache misses? → Warm up cache, increase TTL
   - CPU high? → Check for infinite loops, optimize algorithms
   - External API slow? → Use timeout, circuit breaker

3. **Scale horizontally:**
   ```bash
   # If available, add more instances behind load balancer
   docker-compose up -d --scale app=3
   ```

4. **Monitor improvement:**
   ```bash
   watch -n 2 'curl -s "http://localhost:9090/api/v1/query?query=job:http_request_duration_seconds:p95" | jq'
   ```

**Escalation:** If p95 latency stays > 1s for 20 minutes, escalate to engineering

---

### HighTransactionFailureRate

**Severity:** Critical (P1)  
**Alert Condition:** Transaction failure rate > 5% for 5 minutes

#### Symptoms
- Users cannot complete payments/transactions
- Transaction queue growing
- Sentry showing transaction errors
- External payment API errors

#### Investigation
```bash
# 1. Check which transaction types are failing
curl 'http://localhost:9090/api/v1/query?query=rate(transaction_processing_failures_total[5m]) by (type, error_type)'

# 2. Check transaction success rate
curl 'http://localhost:9090/api/v1/query?query=job:transaction_success_rate:percentage'

# 3. Check payment gateway status
curl 'https://status.asaas.com'

# 4. Check our API logs
docker-compose logs app | grep -i "transaction\|payment" | tail -50

# 5. Check error types
curl 'http://localhost:9090/api/v1/query?query=transaction_processing_failures_total by (error_type)'
```

#### Resolution Steps
1. **Identify root cause:**
   ```
   - Network error → Check connectivity, DNS
   - Payment gateway error → Check API status page, API key
   - Database error → Check database health, constraints
   - Validation error → Check input validation logic
   ```

2. **Immediate actions:**
   ```bash
   # Check payment gateway connectivity
   curl -H "access_token: $ASAAS_API_KEY" https://api.asaas.com/v3/customers
   
   # Verify database constraints
   docker-compose exec app sqlite3 /app/data/app.db ".schema transactions"
   
   # Check queue size
   curl 'http://localhost:9090/api/v1/query?query=transaction_processing_queue_size'
   ```

3. **Fix and re-process:**
   - Fix database constraints if needed
   - Restart transaction processor
   - Re-queue failed transactions
   ```bash
   docker-compose restart app
   ```

4. **Notify users:**
   - Post incident notice
   - Advise retry attempts

**Escalation:** Page on-call engineer immediately (this is revenue-impacting)

---

### HighDatabaseConnections

**Severity:** Warning (P2)  
**Alert Condition:** Connection pool > 80% full

#### Symptoms
- "too many connections" errors
- Application hangs
- Transaction timeouts
- Queue buildup

#### Investigation
```bash
# 1. Check active connections
curl 'http://localhost:9090/api/v1/query?query=db_pool_connections_active'

# 2. Check max connections
curl 'http://localhost:9090/api/v1/query?query=db_pool_connections_max'

# 3. Check connection pool usage
curl 'http://localhost:9090/api/v1/query?query=job:db_connection_pool:usage_percentage'

# 4. Check for long-running queries
docker-compose exec app sqlite3 /app/data/app.db "PRAGMA database_list;"

# 5. Check app logs for connection errors
docker-compose logs app | grep -i "connection\|pool"
```

#### Resolution Steps
1. **Immediate:**
   - Increase connection pool size temporarily
   - Restart application to reset connections
   ```bash
   docker-compose restart app
   ```

2. **Identify leaks:**
   - Check if connections are being released
   - Look for missing `close()` calls
   - Check for open transactions not committing

3. **Scale:**
   - Add read replicas if reads are bottleneck
   - Add application instances if connection pool too small

4. **Monitor:**
   ```bash
   watch -n 2 'curl -s "http://localhost:9090/api/v1/query?query=job:db_connection_pool:usage_percentage" | jq'
   ```

**Escalation:** If not resolved in 30 minutes, escalate to database team

---

### HighCPUUsage / CriticalCPUUsage

**Severity:** Warning (HighCPUUsage) / Critical (CriticalCPUUsage)  
**Alert Condition:** CPU > 80% / > 95% for 5 minutes

#### Investigation
```bash
# 1. Check CPU usage
docker stats lucide-crmt-app

# 2. Check processes using CPU
docker-compose exec app ps aux --sort=-%cpu | head

# 3. Check if hot loops
docker-compose logs app | tail -100

# 4. Check request rate (might be legitimate)
curl 'http://localhost:9090/api/v1/query?query=rate(http_requests_total[5m])'

# 5. Check for garbage collection activity
docker-compose logs app | grep -i "gc\|garbage"
```

#### Resolution Steps
1. **Quick wins:**
   - Restart application
   - Kill runaway processes
   ```bash
   docker-compose restart app
   ```

2. **Identify bottleneck:**
   - CPU high due to load → Scale horizontally
   - CPU high due to inefficient code → Optimize
   - CPU high due to GC → Tune heap size

3. **Optimize:**
   ```bash
   # Add more instances
   docker-compose up -d --scale app=2
   
   # Or increase memory to reduce GC pressure
   # Edit docker-compose.yml and adjust APP_MEMORY_LIMIT
   ```

---

### HighMemoryUsage / CriticalMemoryUsage

**Severity:** Warning (HighMemoryUsage) / Critical (CriticalMemoryUsage)  
**Alert Condition:** Memory > 80% / > 95% for 5 minutes

#### Investigation
```bash
# 1. Check memory usage
docker stats lucide-crmt-app

# 2. Check heap usage
docker-compose exec app node -e "console.log(process.memoryUsage())"

# 3. Check for memory leaks
docker-compose logs app | grep -i "leak\|memory"

# 4. Check cache size
curl 'http://localhost:9090/api/v1/query?query=cache_memory_usage_bytes'
```

#### Resolution Steps
1. **Immediate:**
   ```bash
   # Restart to clear memory
   docker-compose restart app
   ```

2. **Identify leak:**
   - Check for unclosed connections
   - Check for uncleared caches
   - Check for event listener leaks

3. **Increase resources:**
   ```bash
   # Edit docker-compose.yml
   # Increase APP_MEMORY_RESERVATION and APP_MEMORY_LIMIT
   docker-compose up -d
   ```

---

## Escalation Procedures

### On-Call Rotation

```
Level 1: Application Support Team
├─ Response time: 15 minutes
├─ Can: Restart services, basic troubleshooting
└─ Escalates to Level 2 if unresolved in 30 minutes

Level 2: Engineering Team Lead
├─ Response time: 15 minutes
├─ Can: Code changes, emergency hotfix, rollback
└─ Escalates to Level 3 if unresolved in 1 hour

Level 3: Platform Team Lead
├─ Response time: 30 minutes
├─ Can: Infrastructure changes, database recovery
└─ Escalates to Level 4 if unresolved in 2 hours

Level 4: CTO/Engineering Manager
├─ Response time: 1 hour
├─ Can: Major incident response, customer communication
└─ Manages escalation to external support
```

### Escalation Criteria

**Automatic escalation after:**
- Critical: 15 minutes without resolution
- High: 1 hour without resolution
- Medium: 4 hours without resolution
- Low: 24 hours without resolution

**Immediate escalation for:**
- Data loss or corruption
- Security breach
- Customer-facing revenue impact
- Multiple system failures

---

## Incident Response

### Incident Declaration

1. **Assess severity:**
   - P1: Declare immediately
   - P2: Declare if > 15 min
   - P3: Declare if > 1 hour
   - P4: Document in ticket

2. **Create incident in tracking system**

3. **Notify stakeholders:**
   - Post #incidents Slack channel
   - Page on-call engineer (P1/P2)
   - Update status page

### During Incident

1. **Establish incident commander**
   - Lead the response
   - Coordinate between teams
   - Make decisions

2. **Parallel investigation & mitigation:**
   - Investigate root cause
   - Implement workarounds
   - Roll back if needed
   - Scale resources if needed

3. **Communication:**
   - Slack updates every 15 minutes
   - Email updates every hour
   - Status page updates
   - Customer notifications

### Post-Incident

1. **Create postmortem within 24 hours**
   - What happened?
   - Why did it happen?
   - What will prevent it next time?
   - Action items with owners and deadlines

2. **Track improvements**
   - Update monitoring rules
   - Add tests
   - Update documentation
   - Fix code issues

3. **Share learnings**
   - Present postmortem to team
   - Update runbooks
   - Conduct training if needed

---

## Error Budget

```
Error Budget = (100% - SLO Target) × Time Period

Examples:
- 99.9% SLO over 30 days = 0.1% × 30 days × 24h × 60m = 43.2 minutes
- 99% SLO over 30 days = 1% × 30 days × 24h × 60m = 432 minutes

When error budget exhausted:
- Enter "code yellow" - reduced feature velocity
- Focus only on bug fixes and reliability
- Pause new feature development
```

---

## Metrics & Dashboards

**Key Dashboard:** `http://localhost:3000/d/system-overview`

**Key Metrics to Watch:**
- Uptime percentage
- Error rate percentage
- p95 latency in milliseconds
- Active transaction count
- Database connection pool usage
- CPU/Memory/Disk usage

---

## References

- Monitoring Setup: `MONITORING_SETUP.md`
- Alert Rules: `monitoring/prometheus/alert_rules.yml`
- Integration Guide: `PHASE_22_22_INTEGRATION.md`
- Status Page: `https://status.lucide-crmt.io`

---

**Document Version:** 1.0  
**Last Updated:** October 2026  
**Next Review:** December 2026
