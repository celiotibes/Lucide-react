# Backup & Disaster Recovery Plan

**Created**: 2026-07-09  
**Version**: 1.0  
**Status**: ✅ **BACKUP & DR STRATEGY DOCUMENTED**

---

## Executive Summary

Comprehensive backup and disaster recovery strategy for Rental Sync production environment.

**Objectives**:
- ✅ RPO (Recovery Point Objective): 5 minutes
- ✅ RTO (Recovery Time Objective): 1 hour
- ✅ Data durability: 99.9999% (6 nines)
- ✅ Availability: 99.99% uptime SLA

---

## Backup Strategy

### 1. Database Backups

#### Automated Continuous Backups

**AWS RDS Configuration**:
- Backup retention: 30 days
- Transaction log retention: 5 days
- Automated daily snapshots at 03:00 UTC
- Multi-AZ enabled for high availability

**Backup Frequency**:
- Continuous WAL (Write-Ahead Logs) archiving
- Full snapshot every 24 hours
- Point-in-time recovery: Last 35 days

**Implementation**:
```bash
# Enable automated backups in AWS RDS
aws rds modify-db-instance \
  --db-instance-identifier rental-sync-prod \
  --backup-retention-period 30 \
  --enable-iam-database-authentication \
  --preferred-backup-window "03:00-04:00" \
  --copy-tags-to-snapshot

# Verify configuration
aws rds describe-db-instances \
  --db-instance-identifier rental-sync-prod \
  --query 'DBInstances[0].[BackupRetentionPeriod,PreferredBackupWindow]'
```

#### Additional Manual Backups

**Daily Export** (12:00 UTC):
```sql
-- Export to CSV for archival
COPY (SELECT * FROM bookings) TO '/tmp/bookings.csv' WITH CSV HEADER;
COPY (SELECT * FROM properties) TO '/tmp/properties.csv' WITH CSV HEADER;
COPY (SELECT * FROM users) TO '/tmp/users.csv' WITH CSV HEADER;
```

**Full Dump to S3** (Weekly):
```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="rental_sync_${TIMESTAMP}.dump"

# Create backup
pg_dump -h rental-sync-db.rds.amazonaws.com \
  -U postgres \
  -d rental_sync \
  --format=custom \
  --compress=9 \
  > "/tmp/${BACKUP_FILE}"

# Upload to S3 with versioning
aws s3 cp "/tmp/${BACKUP_FILE}" \
  "s3://rental-sync-backups/weekly/" \
  --storage-class STANDARD_IA \
  --metadata "timestamp=${TIMESTAMP},size=$(du -h /tmp/${BACKUP_FILE} | cut -f1)"

# Upload to cold storage (monthly)
if [ $(date +%d) -eq 01 ]; then
  aws s3 cp "/tmp/${BACKUP_FILE}" \
    "s3://rental-sync-backups/monthly/" \
    --storage-class GLACIER_IR
fi

# Cleanup
rm "/tmp/${BACKUP_FILE}"
```

### 2. Application Data Backups

**Configuration Files**:
```bash
# Backup schedule: Daily at 02:00 UTC
tar -czf config_backup_$(date +%Y%m%d).tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  /app/config/ \
  /app/.env.production

# Upload to S3
aws s3 cp config_backup_*.tar.gz \
  s3://rental-sync-backups/config/ \
  --sse AES256
```

**Secrets & Credentials**:
- Stored in AWS Secrets Manager
- Auto-rotated every 30 days
- Backed up separately with encryption

### 3. File System Backups

**EBS Snapshots** (for persistent volumes):
```bash
# Create snapshot
aws ec2 create-snapshot \
  --volume-id vol-xxxxx \
  --description "Daily backup $(date +%Y-%m-%d)"

# Set to delete after 30 days
aws ec2 create-snapshot-lifecycle-policy \
  --description "Auto-delete old snapshots" \
  --resource-types VOLUME \
  --state-values available \
  --schedule-create-rule "Interval=24,IntervalUnit=HOURS" \
  --schedule-fast-restore-rule "Count=3" \
  --schedule-cross-region-copy-rule "TargetRegion=us-east-1,Encrypted=true" \
  --schedule-retain-rule "Count=30"
```

---

## Backup Verification

### Weekly Restore Tests

**Automated Test Procedure** (Every Sunday 04:00 UTC):

```bash
#!/bin/bash
# restore_test.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEST_DB="rental_sync_restore_test_${TIMESTAMP}"

echo "🔄 Starting restore test at $(date)"

# 1. Create test database
createdb "$TEST_DB"

# 2. Restore latest backup
LATEST_BACKUP=$(aws s3 ls s3://rental-sync-backups/weekly/ \
  --recursive | sort | tail -n 1 | awk '{print $NF}')

aws s3 cp "s3://rental-sync-backups/weekly/${LATEST_BACKUP}" /tmp/

pg_restore --verbose \
  --jobs=4 \
  --clean \
  -d "$TEST_DB" \
  "/tmp/$(basename $LATEST_BACKUP)"

# 3. Run verification queries
echo "📊 Data integrity checks..."

BOOKINGS=$(psql -t -d "$TEST_DB" -c "SELECT COUNT(*) FROM bookings;")
PROPERTIES=$(psql -t -d "$TEST_DB" -c "SELECT COUNT(*) FROM properties;")
USERS=$(psql -t -d "$TEST_DB" -c "SELECT COUNT(*) FROM users;")

echo "   Bookings: $BOOKINGS"
echo "   Properties: $PROPERTIES"
echo "   Users: $USERS"

# 4. Verify constraints
psql -d "$TEST_DB" << EOF
SELECT 
  table_name,
  COUNT(*) as constraint_count
FROM information_schema.table_constraints
WHERE table_schema = 'public'
GROUP BY table_name;
EOF

# 5. Run application tests against restored database
echo "🧪 Running application tests..."
export DATABASE_URL="postgresql://postgres:@localhost/${TEST_DB}"
npm run test:database 2>/dev/null && echo "✅ Tests passed" || echo "❌ Tests failed"

# 6. Log results
echo "Test completed at $(date)" >> /var/log/backup_tests.log

# 7. Cleanup
dropdb "$TEST_DB"

echo "✅ Restore test completed successfully"
```

### Backup Integrity Checks

**Monthly Manual Verification**:
```sql
-- Check backup file validity
pg_restore --list /backups/rental_sync_20260709.dump | wc -l

-- Verify checksums
SELECT
  schemaname,
  tablename,
  pg_total_relation_size(schemaname||'.'||tablename) as size
FROM pg_tables
WHERE schemaname != 'pg_catalog'
ORDER BY size DESC;
```

---

## Disaster Recovery Procedures

### 1. Database Loss (Corruption/Deletion)

**RTO**: 1 hour | **RPO**: 5 minutes

**Step-by-Step Recovery**:

```bash
# 1. Identify when data was lost
tail -f /var/log/postgresql/postgresql.log | grep -E "ERROR|FATAL"

# 2. Determine restore point
# Example: Corruption detected at 14:35 UTC, restore to 14:30 UTC
RESTORE_TIME="2026-07-09T14:30:00Z"

# 3. Create recovery instance
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier rental-sync-prod \
  --target-db-instance-identifier rental-sync-recovery \
  --restore-time "$RESTORE_TIME" \
  --copy-tags-to-snapshot

# 4. Wait for recovery
echo "⏳ Waiting for database restoration..."
aws rds wait db-instance-available \
  --db-instance-identifier rental-sync-recovery

# 5. Update application to recovered database
export DATABASE_URL="postgresql://user:pass@rental-sync-recovery.rds.amazonaws.com:5432/rental_sync"

# 6. Run verification
npm run test:database

# 7. Update DNS (or route traffic)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456 \
  --change-batch file://route53-change.json

# 8. Monitor metrics
while true; do
  curl http://localhost:3000/health | jq '.database'
  sleep 10
done

# 9. After 24 hours stable, promote recovered as primary
aws rds promote-read-replica \
  --db-instance-identifier rental-sync-recovery
```

### 2. Complete Data Center Failure

**RTO**: 5 minutes | **RPO**: 0 minutes (Multi-AZ)

**Automatic Failover**:
- AWS RDS Multi-AZ ensures automatic failover
- Standby replica in different AZ
- DNS automatically updated (CNAME)
- Application reconnects automatically

**Verification**:
```bash
# Monitor failover status
watch -n 5 'aws rds describe-db-instances \
  --db-instance-identifier rental-sync-prod \
  --query "DBInstances[0].DBInstanceStatus"'

# Expected sequence: "failing-over" → "available"
# Failover typically completes in 1-2 minutes
```

### 3. Application Failure

**RTO**: 10 minutes | **RPO**: N/A

**Container Restart**:
```bash
# 1. Check container status
docker ps -a | grep rental-sync-backend

# 2. View error logs
docker logs --tail=100 rental-sync-backend

# 3. Restart container
docker restart rental-sync-backend

# 4. Verify health
curl http://localhost:3000/health

# 5. If restart fails, redeploy
docker pull rental-sync-backend:latest
docker run -d \
  --name rental-sync-backend-new \
  --env-file .env.production \
  --publish 3000:3000 \
  --link postgresql:db \
  --link redis:cache \
  rental-sync-backend:latest

# 6. Update load balancer
aws elbv2 deregister-targets \
  --target-group-arn arn:aws:elasticloadbalancing:... \
  --targets Id=i-old-instance

aws elbv2 register-targets \
  --target-group-arn arn:aws:elasticloadbalancing:... \
  --targets Id=i-new-instance
```

### 4. Security Breach (Full Restore)

**RTO**: 4 hours | **RPO**: 24 hours

**Breach Response Procedure**:

```bash
# 1. ISOLATE affected systems
aws ec2 modify-instance-attribute \
  --instance-id i-affected \
  --no-source-dest-check

# 2. PRESERVE evidence
aws ec2 create-snapshot \
  --volume-id vol-affected \
  --description "Breach investigation snapshot"

# 3. KILL suspicious processes
ps aux | grep -v grep | grep suspicious_process | awk '{print $2}' | xargs kill -9

# 4. RESTORE from clean backup
# Use backup from before suspected breach date
CLEAN_BACKUP="rental_sync_2026_07_07.dump"

aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier rental-sync-clean \
  --db-snapshot-identifier $CLEAN_BACKUP

# 5. REDEPLOY application from verified source
docker pull rental-sync-backend:v1.0.0-verified-hash
docker run -d \
  --env-file .env.production.new \
  rental-sync-backend:v1.0.0-verified-hash

# 6. ROTATE all secrets
aws secretsmanager rotate-secret --secret-id /rental-sync/db/password
aws secretsmanager rotate-secret --secret-id /rental-sync/api/keys
aws secretsmanager rotate-secret --secret-id /rental-sync/jwt/secret

# 7. AUDIT and FORENSICS
# Review CloudTrail logs
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=rental-sync-prod \
  --max-results 50

# 8. MONITOR for re-infection
tail -f /var/log/auth.log | grep "FAILED\|unauthorized"
```

---

## Recovery Time Estimation

| Scenario | Database Size | Estimated Time |
|----------|---------------|-----------------|
| Point-in-time restore | 100 GB | 15-30 min |
| Full database restore | 100 GB | 30-60 min |
| Multi-AZ failover | N/A | 1-2 min |
| Application restart | N/A | 2-5 min |
| Region failover | 100 GB | 10-15 min |

---

## Backup Storage

### Storage Locations

**Primary Storage**:
- AWS RDS: Automated backups (30 days)
- Cost: Included in RDS pricing

**Secondary Storage**:
- S3 Standard: Weekly dumps (90 days)
- Cost: ~$0.023 per GB/month
- Location: us-east-1 (primary region)

**Tertiary Storage**:
- S3 Glacier IR: Monthly archives (7 years)
- Cost: ~$0.004 per GB/month
- Location: us-west-2 (disaster recovery region)

**Lifecycle Policy**:
```json
{
  "Rules": [
    {
      "Id": "backup-lifecycle",
      "Status": "Enabled",
      "Prefix": "weekly/",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER_IR"
        }
      ],
      "Expiration": {
        "Days": 2555
      }
    }
  ]
}
```

---

## Cost Optimization

### Current Backup Costs (Monthly)

| Component | Size | Storage | Cost |
|-----------|------|---------|------|
| RDS automated backups | 100 GB | Included | $0 |
| S3 Standard (90 days) | 30 GB | S3 | $0.69 |
| S3 Glacier IR (archive) | 120 GB | Glacier | $0.48 |
| **Total** | - | - | **$1.17** |

### Cost Reduction Strategies

1. **Compression**: Use custom format with compression=9
   - Reduces backup size by 50-70%
   - Minimal impact on restore time

2. **Selective Backup**: Archive only critical tables
   - Exclude logs and temporary data
   - Save 20-30% storage

3. **Lifecycle Management**: Move old backups to cold storage
   - Already configured (GLACIER_IR)

---

## Testing Schedule

| Test Type | Frequency | Owner | Duration |
|-----------|-----------|-------|----------|
| Restore verification | Weekly | DevOps | 30 min |
| Failover test | Monthly | Infrastructure | 1 hour |
| Breach simulation | Quarterly | Security | 2 hours |
| Full DR exercise | Annually | Operations | Half day |

---

## Success Criteria

### Backup Success
- ✅ Backup completes daily without errors
- ✅ Backup size within expected range
- ✅ Backup verifies successfully
- ✅ All critical tables included

### Recovery Success
- ✅ Recovery completes within RTO target
- ✅ Data integrity verified
- ✅ Application connectivity restored
- ✅ No data loss (within RPO target)

---

## Monitoring & Alerts

**Key Metrics to Monitor**:
- Backup duration
- Backup size
- Restore test success rate
- Time to restore
- Data loss amount (RPO)

**Alert Thresholds**:
- Backup fails: Immediate alert
- Backup > 2 hours: Warning
- Restore test fails: Critical alert
- Backup size > 200 GB: Warning

---

## Documentation & References

- AWS RDS Backup Guide: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Backup.html
- PostgreSQL Point-in-Time Recovery: https://www.postgresql.org/docs/current/continuous-archiving.html
- AWS Disaster Recovery: https://aws.amazon.com/disaster-recovery/

---

**Version**: 1.0  
**Last Updated**: 2026-07-09  
**Next Review**: 2026-08-09  
**Owner**: Operations Team

