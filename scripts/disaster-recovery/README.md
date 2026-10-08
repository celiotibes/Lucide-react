# Disaster Recovery Scripts

**Phase 22.23 - Automated Backup, Failover & Recovery**

This directory contains all scripts and utilities for automated disaster recovery, backup management, and failover procedures.

## Files Overview

### 1. `backup-scheduler.ts`

Automated backup orchestration service with multi-cloud support.

**Features:**
- Hourly incremental + daily full backups
- AES-256-GCM encryption
- Cloud upload (AWS S3, GCP GCS, Azure Blob)
- Backup integrity verification
- Retention policy enforcement
- Automated notifications

**Usage:**
```bash
# Run as service (in Docker)
docker exec lucide-backup node scripts/disaster-recovery/backup-scheduler.ts

# Configuration via environment variables
BACKUP_SCHEDULE="0 * * * *"                    # Hourly
BACKUP_CLOUD_ENABLED=true
BACKUP_CLOUD_PROVIDER=aws
BACKUP_ENCRYPTION_ENABLED=true
BACKUP_LOCAL_RETENTION_DAYS=7
BACKUP_DAILY_RETENTION_DAYS=30
BACKUP_MONTHLY_RETENTION_DAYS=90
```

### 2. `recovery-manager.ts`

Automated failover, health monitoring, and point-in-time recovery.

**Features:**
- Health check monitoring (30s interval)
- Automated failover (< 5 minutes)
- Point-in-time recovery (PITR)
- Database integrity validation
- Recovery status reporting
- Slack/email notifications

**Usage:**
```bash
# Check current status
node scripts/disaster-recovery/recovery-manager.ts status

# Perform failover
node scripts/disaster-recovery/recovery-manager.ts failover

# Restore from specific backup
node scripts/disaster-recovery/recovery-manager.ts restore /backups/backup-full-1696876000.db

# Point-in-time recovery
node scripts/disaster-recovery/recovery-manager.ts pitr "2026-10-08T14:30:00Z"

# Start continuous monitoring
node scripts/disaster-recovery/recovery-manager.ts monitor
```

**Status Output:**
```json
{
  "timestamp": "2026-10-08T15:30:00Z",
  "primaryDbExists": true,
  "standbyDbExists": true,
  "latestBackup": {
    "file": "/app/backups/backup-full-1696862400.db",
    "time": "2026-10-08T02:00:00Z"
  },
  "healthCheckFailures": 0,
  "replicationEnabled": true
}
```

### 3. `dr-drill.sh`

Automated monthly disaster recovery drill with comprehensive testing.

**Tests Performed:**
1. Backup Integrity Verification
2. Recovery Time Objective (RTO) Measurement
3. Recovery Point Objective (RPO) Validation
4. Application Readiness Check
5. Data Consistency Verification
6. Backup Chain Validation

**Usage:**
```bash
# Make executable
chmod +x scripts/disaster-recovery/dr-drill.sh

# Run drill
./scripts/disaster-recovery/dr-drill.sh

# Results stored in:
# - logs/dr-drills/drill-YYYYMMDD-HHMMSS.log
# - logs/dr-drills/drill-YYYYMMDD-HHMMSS-report.json
```

**Example Report:**
```json
{
  "drillId": "drill-20261008-020000",
  "startTime": "2026-10-08T02:00:00Z",
  "duration": 2145,
  "tests": [
    { "name": "Backup Integrity", "status": "PASSED" },
    { "name": "Recovery Time Objective", "status": "PASSED" },
    { "name": "Recovery Point Objective", "status": "PASSED" },
    { "name": "Application Readiness", "status": "PASSED" },
    { "name": "Data Consistency", "status": "PASSED" },
    { "name": "Backup Chain", "status": "PASSED" }
  ],
  "summary": {
    "total": 6,
    "passed": 6,
    "failed": 0,
    "successRate": 100
  }
}
```

## Deployment

### Docker Compose Setup

The following services are configured in `docker-compose.yml`:

```yaml
backup:
  image: lucide-crmt:runtime
  command: node /app/server/dist/services/backup-scheduler.js
  volumes:
    - lucide-data:/app/data:ro
    - lucide-backups:/app/backups
  environment:
    BACKUP_SCHEDULE: "0 * * * *"
    BACKUP_RETENTION_DAYS: 30
```

**Start backup service:**
```bash
docker-compose up -d backup
docker logs -f lucide-backup
```

### Manual Deployment

```bash
# 1. Install dependencies
npm install

# 2. Build TypeScript
npm run build

# 3. Run backup scheduler
node dist/scripts/disaster-recovery/backup-scheduler.js

# 4. Run recovery manager
node dist/scripts/disaster-recovery/recovery-manager.js monitor
```

## Configuration

### Environment Variables

**Backup Scheduler:**
```bash
# Schedule (cron format)
INCREMENTAL_BACKUP_SCHEDULE="0 * * * *"     # Every hour
FULL_BACKUP_SCHEDULE="0 2 * * *"            # Daily at 2 AM

# Retention
BACKUP_LOCAL_RETENTION_DAYS=7
BACKUP_DAILY_RETENTION_DAYS=30
BACKUP_MONTHLY_RETENTION_DAYS=90

# Cloud storage
BACKUP_CLOUD_ENABLED=true
BACKUP_CLOUD_PROVIDER=aws|gcp|azure
BACKUP_CLOUD_BUCKET=lucide-crmt-backups
BACKUP_CLOUD_REGION=us-east-1

# Encryption
BACKUP_ENCRYPTION_ENABLED=true
BACKUP_ENCRYPTION_KEY=${ENCRYPTION_MASTER_SECRET}

# Notifications
BACKUP_NOTIFICATION_ENABLED=true
BACKUP_NOTIFICATION_PROVIDER=slack|email|webhook
BACKUP_NOTIFICATION_ENDPOINT=https://hooks.slack.com/...
```

**Recovery Manager:**
```bash
# Health monitoring
HEALTH_CHECK_URL=http://localhost:8787/api/health
HEALTH_CHECK_INTERVAL=30000                  # milliseconds
HEALTH_CHECK_TIMEOUT=5000

# Failover
AUTO_FAILOVER_ENABLED=true
FAILOVER_THRESHOLD=3                         # consecutive failures
FAILOVER_WAIT_TIME=60000                     # milliseconds

# Notifications
ALERT_EMAIL=admin@example.com
ALERT_SLACK=https://hooks.slack.com/...
```

## Monitoring

### Health Check Endpoint

```bash
curl http://localhost:8787/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-10-08T15:30:00Z",
  "database": "connected",
  "uptime": 86400,
  "version": "22.23"
}
```

### Recovery Manager Status Server

```bash
# Enable status server
STATUS_SERVER_ENABLED=true
STATUS_SERVER_PORT=9090

# Query status
curl http://localhost:9090/status
```

### Logs

**Backup logs:**
```bash
tail -f logs/backup-*.log
tail -f logs/backup-2026-10-08.log
```

**Recovery logs:**
```bash
tail -f logs/recovery-*.log
tail -f logs/recovery-2026-10-08.log
```

**DR drill logs:**
```bash
tail -f logs/dr-drills/drill-*.log
```

## Troubleshooting

### Backup Not Running

```bash
# Check if backup service is running
docker ps | grep lucide-backup

# Check logs for errors
docker logs lucide-backup

# Verify directory permissions
ls -la /app/backups/

# Check disk space
df -h /app/backups/

# Verify database
sqlite3 /app/data/app.db "PRAGMA integrity_check;"
```

### Failover Not Triggering

```bash
# Check health endpoint
curl -v http://localhost:8787/api/health

# Verify recovery manager is running
ps aux | grep recovery-manager

# Check failure count
node recovery-manager.ts status | jq '.healthCheckFailures'

# Manually trigger failover
node recovery-manager.ts failover
```

### High Replication Lag

```bash
# Check replication status
aws s3api get-bucket-replication --bucket lucide-crmt-backups-us-east-1

# Monitor S3 replication metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/S3 \
  --metric-name ReplicationLatency \
  --start-time 2026-10-08T10:00:00Z \
  --end-time 2026-10-08T11:00:00Z \
  --period 300 \
  --statistics Average
```

## Performance Tuning

### Backup Performance

**Optimize Backup Speed:**
```bash
# Use faster disk for temporary files
export TMPDIR=/mnt/fast-ssd/tmp

# Increase backup parallelism
BACKUP_PARALLEL_THREADS=4

# Use compression (if database supports)
BACKUP_COMPRESSION=true
```

**Monitor Backup Duration:**
```bash
# Check backup times
grep "duration" logs/backup-*.log | awk '{print $NF}' | sort -n
```

### Recovery Performance

**Optimize Recovery Speed:**
```bash
# Pre-allocate disk space
fallocate -l 10G /app/data/app.db.restore

# Use faster restore method
RESTORE_METHOD=direct  # vs streaming

# Parallel restore (if supported)
RESTORE_PARALLEL_THREADS=4
```

## Best Practices

1. **Regular Backups:** Run hourly incremental + daily full backups
2. **Test Restores:** Monthly DR drills validate recovery procedures
3. **Monitor Lag:** Keep replication lag < 15 minutes
4. **Verify Integrity:** Weekly integrity checks on backups
5. **Document Runbooks:** Keep incident response procedures updated
6. **Practice Failover:** Test failover procedures quarterly
7. **Encrypt Backups:** Always use encryption for sensitive data
8. **Retention Policy:** Balance retention duration with cost
9. **Alert Monitoring:** Configure email/Slack alerts for failures
10. **Post-Incident Review:** Document lessons learned from incidents

## Common Tasks

### Create Manual Backup

```bash
# Full backup
sqlite3 /app/data/app.db ".backup /app/backups/manual-$(date +%s).db"

# Verify backup
sqlite3 /app/backups/manual-*.db "PRAGMA integrity_check;"
```

### Point-in-Time Recovery

```bash
# Recover to 2 hours ago
TARGET_TIME=$(date -d "2 hours ago" -u +%Y-%m-%dT%H:%M:%SZ)
node recovery-manager.ts pitr "$TARGET_TIME"

# Or specify exact time
node recovery-manager.ts pitr "2026-10-08T14:30:00Z"
```

### View Backup Metadata

```bash
# List backup metadata files
ls -la /app/backups/*.meta.json

# View specific backup metadata
jq . /app/backups/backup-full-1696862400.db.meta.json
```

### Calculate Data Loss Window

```bash
# Find latest backup
LATEST_BACKUP=$(ls -t /app/backups/backup-* | head -1)
BACKUP_TIME=$(stat -c%Y "$LATEST_BACKUP")
CURRENT_TIME=$(date +%s)
DATA_LOSS=$((CURRENT_TIME - BACKUP_TIME))

echo "Data loss window: ${DATA_LOSS} seconds"
echo "RPO compliance: $([ $DATA_LOSS -lt 3600 ] && echo 'PASS' || echo 'FAIL')"
```

## Related Documentation

- [Disaster Recovery Guide](../../docs/PHASE_22_23_DISASTER_RECOVERY.md)
- [Backup Strategy](../../backup-strategy.md)
- [Terraform Configuration](../terraform/)
- [Security Hardening](../../docs/SECURITY.md)
- [Deployment Guide](../../docs/DEPLOYMENT_GUIDE.md)

## Support

For issues or questions:
1. Check logs in `logs/` directory
2. Review disaster recovery guide
3. Run `dr-drill.sh` to validate setup
4. Contact DevOps team for assistance

---

**Last Updated:** October 8, 2026  
**Version:** 22.23.0  
**Owner:** DevOps & Infrastructure Team
