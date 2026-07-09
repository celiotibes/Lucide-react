# Operations Runbook - Rental Sync Production

**Created**: 2026-07-09  
**Version**: 1.0  
**Status**: 🟡 **OPERATIONAL PROCEDURES DOCUMENTED**

---

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Monitoring & Alerting](#monitoring--alerting)
3. [Backup Procedures](#backup-procedures)
4. [Disaster Recovery](#disaster-recovery)
5. [Incident Response](#incident-response)
6. [Performance Optimization](#performance-optimization)
7. [Security Procedures](#security-procedures)
8. [On-Call Guide](#on-call-guide)

---

## Daily Operations

### Service Health Checks

**Frequency**: Every 4 hours (automated)  
**Manual Check**: Daily morning routine

```bash
# Backend Health
curl http://production:3000/health

# Database Connectivity
curl http://production:3000/health/database

# Redis Connectivity
curl http://production:3000/health/redis

# Frontend Health
curl https://app.rentalsync.com
```

**Expected Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-07-09T10:30:00Z",
  "uptime": 86400,
  "database": "connected",
  "redis": "connected"
}
```

### Log Monitoring

**Log Location**: CloudWatch / Application logs  
**Check Frequency**: Hourly (during business hours)

```bash
# View backend logs
aws logs tail /aws/ecs/rental-sync-backend --follow

# View API errors
aws logs filter-log-events \
  --log-group /aws/ecs/rental-sync-backend \
  --filter-pattern "ERROR"

# View performance warnings
aws logs filter-log-events \
  --log-group /aws/ecs/rental-sync-backend \
  --filter-pattern "P99 latency"
```

### Database Maintenance

**Daily**:
- Check database connection pool usage
- Monitor query performance
- Review slow query logs

**Weekly**:
- Analyze index usage
- Update table statistics
- Review autovacuum logs

**Monthly**:
- Full database analysis
- Archive old log records
- Plan capacity upgrades

---

## Monitoring & Alerting

### Key Metrics to Monitor

#### Backend Metrics

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| CPU Usage | > 80% | Page on-call engineer |
| Memory Usage | > 85% | Investigate memory leak |
| API Response Time (P95) | > 500ms | Investigate slow queries |
| Error Rate | > 1% | Page on-call engineer |
| Database Connections | > 90% of pool | Increase pool size |
| Redis Memory | > 90% | Clear cache/increase memory |

#### Frontend Metrics

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| Page Load Time | > 3s | Investigate performance |
| JavaScript Errors | > 5/min | Check error logs |
| Availability | < 99.9% | Start incident |
| Build Success Rate | < 99% | Review CI logs |

### Setting Up Alerts

**CloudWatch Configuration**:
```bash
# CPU Usage Alert
aws cloudwatch put-metric-alarm \
  --alarm-name rental-sync-cpu-high \
  --alarm-description "Alert when CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:region:account:topic

# Error Rate Alert
aws cloudwatch put-metric-alarm \
  --alarm-name rental-sync-error-rate-high \
  --alarm-description "Alert when error rate > 1%" \
  --metric-name ErrorRate \
  --namespace RentalSync \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold
```

### Dashboard Setup

Create CloudWatch dashboard with:
- API response times (P95, P99)
- Error rates by endpoint
- Database connection pool usage
- Redis memory usage
- Frontend bundle size
- Deployment status

---

## Backup Procedures

### Database Backup Strategy

#### Automated Backups (Recommended)

**AWS RDS Configuration**:
```bash
# Enable automated backups
aws rds modify-db-instance \
  --db-instance-identifier rental-sync-prod \
  --backup-retention-period 30 \
  --preferred-backup-window "03:00-04:00" \
  --preferred-maintenance-window "sun:04:00-sun:05:00"

# Enable Multi-AZ for high availability
aws rds modify-db-instance \
  --db-instance-identifier rental-sync-prod \
  --multi-az
```

**Backup Schedule**:
- Automated daily backups (30-day retention)
- Transaction log backups (every 5 minutes)
- Weekly full backup archive
- Monthly backup to cold storage

#### Manual Backup

**Daily Manual Backup** (in addition to automated):
```bash
# PostgreSQL backup
pg_dump -h production-db.rds.amazonaws.com \
  -U postgres \
  -d rental_sync \
  --format=custom \
  > /backups/rental_sync_$(date +%Y%m%d).dump

# Verify backup
pg_restore -d rental_sync_test --list /backups/rental_sync_*.dump
```

**S3 Storage**:
```bash
# Upload to S3
aws s3 cp /backups/rental_sync_*.dump \
  s3://rental-sync-backups/daily/ \
  --storage-class GLACIER_IR

# Verify upload
aws s3 ls s3://rental-sync-backups/daily/ --recursive
```

### Application Data Backup

**Important Files to Backup**:
- Configuration files (.env.production)
- SSL certificates
- API keys (encrypted)
- Custom scripts

```bash
# Backup configuration
tar -czf config_backup_$(date +%Y%m%d).tar.gz \
  /app/config/ \
  /app/.env.production \
  /etc/nginx/

# Store in S3
aws s3 cp config_backup_*.tar.gz \
  s3://rental-sync-backups/config/
```

### Backup Testing

**Monthly Restore Test**:
```bash
# 1. Create test database
createdb rental_sync_restore_test

# 2. Restore from backup
pg_restore -d rental_sync_restore_test \
  /backups/rental_sync_20260709.dump

# 3. Verify data integrity
psql -d rental_sync_restore_test -c \
  "SELECT COUNT(*) FROM bookings;"

# 4. Check application functionality
curl http://test-instance:3000/health

# 5. Document results
echo "Restore test passed on $(date)" >> /var/log/backup_tests.log

# 6. Clean up
dropdb rental_sync_restore_test
```

---

## Disaster Recovery

### RTO & RPO Targets

| Scenario | RTO | RPO | Recovery Method |
|----------|-----|-----|-----------------|
| Database Corruption | 1 hour | 5 min | Point-in-time restore |
| Full Data Center Loss | 2 hours | 5 min | Multi-AZ failover |
| Complete Application Failure | 30 min | N/A | Container restart |
| Security Breach | 4 hours | 1 hour | Restore from backup |

### Recovery Procedures

#### Database Corruption (Point-in-Time Restore)

```bash
# 1. Identify corruption time
tail -f /var/log/postgres.log | grep ERROR

# 2. Restore to specific time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier rental-sync-prod \
  --target-db-instance-identifier rental-sync-recovery \
  --restore-time 2026-07-09T10:30:00Z \
  --copy-tags-to-snapshot

# 3. Wait for restoration
aws rds wait db-instance-available \
  --db-instance-identifier rental-sync-recovery

# 4. Update application to point to recovered database
export DATABASE_URL=postgresql://user:pass@rental-sync-recovery.rds.amazonaws.com:5432/rental_sync

# 5. Run verification tests
npm run test:database

# 6. Promote recovered database as primary
# (After verification)
aws rds promote-read-replica \
  --db-instance-identifier rental-sync-recovery
```

#### Full Data Center Failure (Multi-AZ Failover)

```bash
# RDS automatically fails over to standby in different AZ
# Monitor failover status
aws rds describe-db-instances \
  --db-instance-identifier rental-sync-prod \
  --query 'DBInstances[0].DBInstanceStatus'

# Expected: "available" after failover completes
# Typical failover time: 1-2 minutes

# Verify application connectivity
curl http://production:3000/health
```

#### Application Container Failure

```bash
# 1. Check container status
docker ps --filter name=rental-sync-backend

# 2. View logs
docker logs rental-sync-backend

# 3. Restart container
docker restart rental-sync-backend

# 4. Or redeploy from latest image
docker pull rental-sync-backend:latest
docker run -d \
  --name rental-sync-backend \
  --env-file .env.production \
  --publish 3000:3000 \
  rental-sync-backend:latest

# 5. Verify health
curl http://localhost:3000/health
```

#### Security Breach (Full Restore)

```bash
# 1. Isolate affected systems
aws ec2 modify-instance-attribute \
  --instance-id i-xxxxx \
  --no-source-dest-check

# 2. Restore database from clean backup
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier rental-sync-recovery \
  --db-snapshot-identifier rental_sync_2026_07_08

# 3. Deploy known-good application version
docker pull rental-sync-backend:v1.0.0-prod
docker run -d \
  --env-file .env.production.clean \
  rental-sync-backend:v1.0.0-prod

# 4. Rotate all secrets
aws secretsmanager rotate-secret \
  --secret-id rental-sync-api-keys

# 5. Run security tests
npm run test:security

# 6. Monitor for anomalies
tail -f /var/log/auth.log
```

---

## Incident Response

### Incident Severity Levels

| Level | Response Time | Impact | Example |
|-------|---------------|--------|---------|
| P1 - Critical | Immediate | Complete service outage | Database unavailable |
| P2 - High | 15 minutes | Significant degradation | Error rate > 5% |
| P3 - Medium | 1 hour | Partial functionality | Single feature broken |
| P4 - Low | 4 hours | Minor issue | Cosmetic bug |

### Incident Response Flow

```
1. DETECT
   └─> Automated alert OR user report
   └─> Page on-call engineer

2. ASSESS
   └─> Severity level determination
   └─> Customer impact assessment
   └─> Root cause initial evaluation

3. COMMUNICATE
   └─> Update status page
   └─> Notify customers
   └─> Log incident ticket

4. MITIGATE
   └─> Immediate temporary fix (if available)
   └─> Scale resources if needed
   └─> Route traffic if possible

5. RESOLVE
   └─> Implement permanent fix
   └─> Deploy and verify
   └─> Monitor for regression

6. REVIEW
   └─> Post-incident review within 24 hours
   └─> Document root cause
   └─> Plan preventive measures
```

### Common Incidents & Resolution

#### High CPU Usage

```bash
# Identify cause
top -b -n 1 | head -20

# Check application processes
ps aux | grep node

# Get process details
ps -p PID -o %cpu,%mem,comm,cmd

# If memory leak
docker restart rental-sync-backend

# If sustained high CPU
# Scale horizontally
kubectl scale deployment rental-sync-backend --replicas=3
```

#### Database Connection Pool Exhaustion

```bash
# Check connections
psql -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# Increase pool size in .env.production
export DATABASE_POOL_SIZE=40

# Restart application
docker restart rental-sync-backend

# Monitor pool usage
watch -n 5 'psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='"'"'rental_sync'"'"';"'
```

#### High Memory Usage

```bash
# Check memory
free -h

# Container memory usage
docker stats rental-sync-backend

# Node.js heap dump
node --inspect=0.0.0.0:9229 /app/index.js

# Kill zombie processes
ps aux | grep Z
kill -9 PID
```

#### API Response Degradation

```bash
# Check logs
tail -f /var/log/rental-sync/api.log | grep "duration\|latency"

# Database query analysis
psql -c "SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check slow queries
psql -c "SELECT * FROM pg_stat_statements WHERE mean_time > 100;"

# Restart database if locked
systemctl restart postgresql
```

---

## Performance Optimization

### Regular Performance Tuning

**Daily**:
- Monitor P95/P99 latencies
- Check error rates
- Review slow query logs

**Weekly**:
- Analyze database query performance
- Review cache hit rates
- Profile application hot paths

**Monthly**:
- Full performance analysis
- Database index review
- Application profiling

### Database Optimization

```bash
# Analyze tables
ANALYZE;

# Vacuum (cleanup dead rows)
VACUUM ANALYZE;

# Rebuild indexes
REINDEX TABLE bookings;

# Check index usage
SELECT * FROM pg_stat_user_indexes ORDER BY idx_scan;

# Create missing indexes
CREATE INDEX idx_bookings_status ON bookings(status) WHERE status != 'completed';
```

### Application Caching

**Redis Setup**:
```bash
# Monitor Redis
redis-cli INFO stats

# Clear cache if needed (careful!)
redis-cli FLUSHDB

# Set cache TTL policies
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

**Frontend Optimization**:
```bash
# Bundle analysis
npm run build
# Check bundle size < 200KB gzip

# Asset optimization
gzip -9 dist/index.js

# CDN configuration
# Serve static assets from CloudFront
```

---

## Security Procedures

### Daily Security Checks

```bash
# Check for unauthorized access
grep "Failed password\|unauthorized" /var/log/auth.log

# Monitor system changes
aide --check

# Check file permissions
find /app -type f -perm 0777 -exec chmod 755 {} \;

# SSL certificate expiration
openssl x509 -enddate -noout -in /etc/ssl/certs/rental-sync.crt
```

### Weekly Security Tasks

```bash
# Scan for vulnerabilities
npm audit

# Check container images
trivy image rental-sync-backend:latest

# Review access logs
aws s3api get-bucket-logging --bucket rental-sync-backups

# Update security groups
aws ec2 describe-security-groups \
  --group-ids sg-xxxxx
```

### Monthly Security Audit

- Rotate API keys
- Review IAM permissions
- Audit database access logs
- Update security patches
- Run penetration testing

---

## On-Call Guide

### On-Call Responsibilities

**Primary On-Call**:
- Respond to P1 incidents within 15 minutes
- Monitor dashboard during business hours
- Be reachable 24/7 during on-call week

**Secondary On-Call**:
- Escalation point for complex issues
- Support primary on-call

### On-Call Tools

**Essential Access**:
- AWS Console (admin role)
- CloudWatch dashboards
- SSH access to servers
- Database admin access
- Slack/PagerDuty notifications

**Useful Commands**:
```bash
# Quick status check
./check_system_health.sh

# Get application logs
docker logs -f --tail=100 rental-sync-backend

# Database status
psql -d rental_sync -c "SELECT version();"

# Restart services
docker compose restart
```

### Escalation Path

```
1. Try auto-remediation (restart, scale)
   ↓
2. Contact platform team if infrastructure issue
   ↓
3. Contact on-call manager if can't resolve in 1 hour
   ↓
4. Declare SEV-1 incident if customer-facing
```

### Handoff Checklist

When handing off to next on-call:
- [ ] Review recent incidents
- [ ] Check dashboard for warnings
- [ ] Verify all health checks passing
- [ ] Confirm escalation contacts
- [ ] Test pager functionality

---

## Communication Templates

### Status Page Update

```
🔴 INCIDENT: API Response Degradation
START TIME: 2026-07-09 14:30 UTC
IMPACT: Booking creation latency +300%

AFFECTED: Booking form submission
STATUS: Investigating

Next update: 14:45 UTC
```

### Incident Post-Mortem

```
INCIDENT: Database Connection Pool Exhaustion
DATE: 2026-07-09
SEVERITY: P2

ROOT CAUSE: Slow query causing connections to hold for 30+ seconds

IMPACT: 5% of API requests failed for 45 minutes

ACTION ITEMS:
1. Optimize slow query (deadline: 2026-07-10)
2. Increase connection pool size (deployed)
3. Add query timeout limits (deadline: 2026-07-11)
4. Add alerting for pool saturation (done)

TIMELINE:
14:15 - Alert triggered
14:20 - On-call notified
14:25 - Root cause identified
14:35 - Temporary mitigation (restart)
15:00 - Connection pool increased
```

---

## Useful Scripts

### Health Check Script

```bash
#!/bin/bash
# check_system_health.sh

echo "🔍 Checking system health..."

# Backend health
if curl -s http://localhost:3000/health | grep -q "healthy"; then
  echo "✅ Backend: Healthy"
else
  echo "❌ Backend: Down"
fi

# Database health
if psql -d rental_sync -c "SELECT 1;" 2>/dev/null; then
  echo "✅ Database: Connected"
else
  echo "❌ Database: Disconnected"
fi

# Redis health
if redis-cli ping | grep -q "PONG"; then
  echo "✅ Redis: Connected"
else
  echo "❌ Redis: Disconnected"
fi

# Container status
echo "📊 Container status:"
docker ps | grep rental-sync
```

### Backup Script

```bash
#!/bin/bash
# backup_database.sh

BACKUP_DIR="/backups/daily"
BACKUP_FILE="$BACKUP_DIR/rental_sync_$(date +%Y%m%d_%H%M%S).dump"

echo "💾 Starting database backup..."
pg_dump -h rental-sync-db.rds.amazonaws.com \
  -U postgres \
  -d rental_sync \
  --format=custom \
  > "$BACKUP_FILE"

echo "✅ Backup created: $BACKUP_FILE"

# Upload to S3
aws s3 cp "$BACKUP_FILE" s3://rental-sync-backups/daily/
echo "☁️ Uploaded to S3"
```

---

## References

- [AWS RDS Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html)
- [PostgreSQL Backup & Restore](https://www.postgresql.org/docs/current/backup.html)
- [CloudWatch Alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/userguide/AlarmThatSendsEmail.html)
- [Incident Response Guide](https://www.atlassian.com/incident-management)

---

**Version**: 1.0  
**Last Updated**: 2026-07-09  
**Next Review**: 2026-08-09

