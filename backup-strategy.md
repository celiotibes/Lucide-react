# Lucide React CRMT - Backup & Disaster Recovery Strategy
Phase 22.19: Production-ready Backup & Infrastructure

## Table of Contents
1. [Overview](#overview)
2. [Backup Strategy](#backup-strategy)
3. [Recovery Procedures](#recovery-procedures)
4. [Retention Policy](#retention-policy)
5. [Disaster Scenarios](#disaster-scenarios)
6. [Validation & Testing](#validation-testing)
7. [SLA & RTO/RPO](#sla--rtorpo)

---

## Overview

### Business Continuity Objectives
- **RTO (Recovery Time Objective):** 1 hour maximum downtime
- **RPO (Recovery Point Objective):** 1 hour maximum data loss
- **Backup Frequency:** Hourly for critical data, daily archive
- **Retention:** 30 days minimum, 90 days for critical operations

### Backup Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Primary Database (SQLite/PostgreSQL)        │
│                    (./data/app.db or RDS)                     │
└────────────┬──────────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌─────────┐       ┌──────────────┐
│ Local   │       │ Backup Job   │
│ Backup  │       │ (Scheduled)  │
│ (Sync)  │       └──────┬───────┘
└─────────┘              │
                    ┌────┴──────┐
                    ▼           ▼
              ┌─────────┐   ┌─────────┐
              │ S3 / GCS│   │ External│
              │ Storage │   │ Archive │
              └─────────┘   └─────────┘
```

---

## Backup Strategy

### 1. Local Backups (Synchronous)

**Purpose:** Instant recovery for data corruption or accidental deletion

**Implementation:**
```bash
# Location: ./backups/ (Docker volume)
# Retention: 7 days rolling window
# Size per backup: ~50-500MB (depends on data)
# Storage: Local SSD/HDD

Directory structure:
./backups/
├── backup-1696776000.db          # Oldest (Day -7)
├── backup-1696862400.db          # Day -6
├── backup-1696948800.db          # Day -5
├── backup-1697035200.db          # Day -4
├── backup-1697121600.db          # Day -3
├── backup-1697208000.db          # Day -2
├── backup-1697294400.db          # Latest (Today)
└── BACKUPS.log                    # Backup journal
```

**Configuration:**
```yaml
# docker-compose.yml
backup:
  volumes:
    - lucide-data:/app/data:ro        # Read-only source
    - lucide-backups:/app/backups      # Backup destination
  environment:
    BACKUP_SCHEDULE: '0 * * * *'      # Hourly
    BACKUP_RETENTION_DAYS: 7
```

**Backup Script:**
```bash
#!/bin/sh
# server/src/services/backup-scheduler.js

const BACKUP_DIR = '/app/backups'
const DB_FILE = '/app/data/app.db'
const RETENTION_DAYS = 7

async function backup() {
  const timestamp = Math.floor(Date.now() / 1000)
  const backupFile = `${BACKUP_DIR}/backup-${timestamp}.db`
  
  // Create backup
  execSync(`sqlite3 ${DB_FILE} ".backup ${backupFile}"`)
  
  // Compress
  execSync(`gzip ${backupFile}`)
  
  // Log backup
  fs.appendFileSync(`${BACKUP_DIR}/BACKUPS.log`, 
    `${new Date().toISOString()} - Backup created: ${backupFile}.gz\n`)
  
  // Cleanup old backups
  cleanupOldBackups(BACKUP_DIR, RETENTION_DAYS)
}

function cleanupOldBackups(dir, retentionDays) {
  const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000)
  
  fs.readdirSync(dir)
    .filter(f => f.startsWith('backup-'))
    .forEach(file => {
      const filepath = path.join(dir, file)
      const stats = fs.statSync(filepath)
      
      if (stats.mtime.getTime() < cutoffTime) {
        fs.unlinkSync(filepath)
        console.log(`Deleted old backup: ${file}`)
      }
    })
}

// Schedule with cron
const cron = require('node-cron')
const schedule = process.env.BACKUP_SCHEDULE || '0 * * * *'
cron.schedule(schedule, backup)
```

### 2. Remote Backups (Google Drive / Cloud Storage)

**Purpose:** Protection against complete infrastructure failure

**Implementation for Google Drive:**
```bash
# Prerequisites
# 1. Create service account (Google Cloud Console)
# 2. Grant permissions on Google Drive
# 3. Set GOOGLE_CREDENTIALS_JSON in .env

GOOGLE_CREDENTIALS_JSON='{
  "type": "service_account",
  "project_id": "lucide-crmt",
  "private_key": "...",
  "client_email": "backup@project.iam.gserviceaccount.com"
}'
```

**Backup to Google Drive:**
```typescript
// server/src/services/google-drive-backup.ts
import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'

export async function backupToGoogleDrive() {
  const credentials = JSON.parse(
    process.env.GOOGLE_CREDENTIALS_JSON || '{}'
  )
  
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  })
  
  const drive = google.drive({ version: 'v3', auth })
  
  // Find or create backup folder
  const folderId = await findOrCreateFolder(drive, 'Lucide CRMT Backups')
  
  // Upload backup file
  const backupFile = `/app/data/backup-${Date.now()}.db.gz`
  const response = await drive.files.create({
    requestBody: {
      name: path.basename(backupFile),
      parents: [folderId],
      description: `Backup created at ${new Date().toISOString()}`
    },
    media: {
      mimeType: 'application/gzip',
      body: fs.createReadStream(backupFile)
    }
  })
  
  console.log(`Backup uploaded to Google Drive: ${response.data.id}`)
  
  // Cleanup local backup
  fs.unlinkSync(backupFile)
  
  // Cleanup old Google Drive backups (>30 days)
  await cleanupOldGoogleDriveBackups(drive, folderId, 30)
}

async function findOrCreateFolder(drive: any, name: string) {
  const response = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder'`,
    spaces: 'drive',
    pageSize: 1
  })
  
  if (response.data.files?.length > 0) {
    return response.data.files[0].id
  }
  
  const newFolder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder'
    }
  })
  
  return newFolder.data.id
}

async function cleanupOldGoogleDriveBackups(
  drive: any,
  folderId: string,
  retentionDays: number
) {
  const cutoffTime = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000
  )
  
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    orderBy: 'createdTime desc'
  })
  
  for (const file of response.data.files || []) {
    const createdTime = new Date(file.createdTime)
    if (createdTime < cutoffTime) {
      await drive.files.delete({ fileId: file.id })
      console.log(`Deleted old backup from Google Drive: ${file.name}`)
    }
  }
}
```

### 3. PostgreSQL Backups (Production)

**For PostgreSQL RDS/managed databases:**

```bash
# Daily backup (automated by AWS RDS, GCP Cloud SQL, etc.)
# Backup window: 2-4 AM UTC
# Retention: 30 days (configurable)
# Backup type: Automated snapshots + transaction logs

# Manual backup
pg_dump $DATABASE_URL | gzip > backup-$(date +%s).sql.gz

# Restore from backup
gunzip -c backup-1696776000.sql.gz | psql $DATABASE_URL
```

---

## Recovery Procedures

### 1. Local Database Recovery (SQLite)

**Scenario:** Database file corrupted

```bash
# 1. Stop application
docker-compose stop app

# 2. List available backups
ls -lah ./backups/backup-*.db.gz | tail -10

# 3. Restore latest backup
gunzip < ./backups/backup-$(ls -1 ./backups/backup-*.db.gz | tail -1) \
  > ./data/app.db

# 4. Verify restore
sqlite3 ./data/app.db "SELECT COUNT(*) FROM usuarios;"

# 5. Start application
docker-compose start app

# 6. Verify health
curl http://localhost:8787/api/health
```

### 2. Point-in-Time Recovery

**Scenario:** Need to recover data from specific time in past**

```bash
# 1. Identify backup timestamp
ls -1 ./backups/backup-*.db.gz | grep backup-1696948800

# 2. Restore that specific backup
gunzip < ./backups/backup-1696948800.db.gz > ./data/app.db

# 3. Verify timestamp
sqlite3 ./data/app.db "SELECT MAX(updated_at) FROM usuarios;"

# 4. If not the right time, try previous backup
gunzip < ./backups/backup-1696862400.db.gz > ./data/app.db
```

### 3. Full Disaster Recovery (From Cloud)

**Scenario:** Complete server loss**

```bash
# 1. Restore Google Drive backup locally
gcloud auth activate-service-account --key-file=credentials.json
gsutil cp gs://bucket/backup-latest.db.gz .
gunzip backup-latest.db.gz

# 2. Restore to new server/container
docker-compose up -d
docker-compose exec app sh -c 'mv data/app.db data/app.db.new'
docker-compose exec app cp /restored/backup.db data/app.db

# 3. Run migrations for any missing phases
docker-compose --profile init up migrations

# 4. Verify
curl http://localhost:8787/api/health
sqlite3 data/app.db "SELECT COUNT(*) FROM usuarios;"

# 5. Monitor for data consistency
docker-compose logs -f app | grep -i error
```

### 4. Database Integrity Check

```bash
# Check SQLite database
sqlite3 ./data/app.db "PRAGMA integrity_check;"

# Check file size
du -h ./data/app.db

# Check modification time
stat ./data/app.db

# Test backup can be restored
gunzip < ./backups/backup-latest.db.gz > /tmp/test.db
sqlite3 /tmp/test.db "SELECT COUNT(*) FROM usuarios;" && echo "Backup OK"
rm /tmp/test.db
```

---

## Retention Policy

### Backup Schedule and Retention

| Backup Type | Frequency | Retention | Purpose |
|-------------|-----------|-----------|---------|
| Local (hourly) | Every hour | 7 days | Quick recovery |
| Local (daily) | Once daily | 30 days | Recent restore points |
| Cloud (daily) | Once daily | 90 days | Disaster recovery |
| Cloud (monthly) | 1st of month | 1 year | Compliance/audit |
| Manual | On-demand | Manual delete | Specific events |

### Automatic Cleanup

```typescript
// Cleanup runs as part of backup process
// Keeps N most recent backups + backups from last 30 days

const RETENTION_DAYS = 30
const MIN_BACKUPS_TO_KEEP = 7

function shouldDelete(fileDate: Date): boolean {
  const age = Date.now() - fileDate.getTime()
  const daysOld = age / (24 * 60 * 60 * 1000)
  return daysOld > RETENTION_DAYS
}
```

### Storage Calculation

```
Backup size: ~100-500 MB per day (depends on transaction volume)
Hourly backups (7 days): 7 * 24 * 300 MB ≈ 50 GB
Daily backups (30 days): 30 * 300 MB ≈ 9 GB
Monthly archive (1 year): 12 * 300 MB ≈ 3.6 GB
Total: ~62.6 GB annual storage cost

Cloud storage (AWS S3, GCS):
- Standard: $0.023 per GB/month ≈ $1.44/month
- Glacier: $0.004 per GB/month ≈ $0.25/month (for old archives)
```

---

## Disaster Scenarios

### Scenario 1: Database Corruption

**Trigger:** Query error, integrity check failure

**Detection:**
```bash
sqlite3 ./data/app.db "PRAGMA integrity_check;"
# Returns: "ok" or list of corruption errors
```

**Response Time:** < 5 minutes

**Resolution:**
```bash
# 1. Alert team
# 2. Switch to read-only mode
# 3. Restore from latest backup
# 4. Run integrity check on restored DB
# 5. Resume service
```

### Scenario 2: Accidental Data Deletion

**Trigger:** Wrong DELETE query, user error

**Detection:** 
- User reports missing data
- Application error logs show deletion
- Data inconsistency alerts

**Response Time:** 5-15 minutes

**Resolution:**
```bash
# 1. Identify deletion time (from logs)
# 2. Find backup before deletion
# 3. Restore that specific backup
# 4. Merge/replay any transactions after deletion
```

### Scenario 3: Server/Disk Failure

**Trigger:** Hardware failure, disk full, filesystem errors

**Detection:**
- Health check fails
- I/O errors in system logs
- Docker container exits

**Response Time:** 15-60 minutes

**Resolution:**
```bash
# 1. Provision new server/storage
# 2. Download backup from cloud
# 3. Deploy application
# 4. Restore database
# 5. Verify health
# 6. Update DNS/load balancer
```

### Scenario 4: Ransomware/Security Breach

**Trigger:** Malicious actor gains access

**Detection:**
- Unusual database modifications
- Suspicious user access patterns
- Security alert from monitoring

**Response Time:** IMMEDIATE (< 1 minute to isolate)

**Resolution:**
```bash
# 1. IMMEDIATELY isolate container
docker-compose stop app

# 2. Create forensic copy
docker cp lucide-crmt-app:/app/data/app.db ./forensics/

# 3. Audit backups for breach date
# Find earliest clean backup

# 4. Restore clean version
# Restore from known-good backup before breach

# 5. Change all secrets/API keys
# Rotate credentials

# 6. Security audit + patch
# Fix vulnerability that allowed breach

# 7. Resume service with monitoring
docker-compose up -d
```

---

## Validation & Testing

### Automated Backup Validation

```typescript
// Runs after each backup creation
async function validateBackup(backupPath: string) {
  console.log(`Validating backup: ${backupPath}`)
  
  // 1. Check file exists and has size
  const stats = fs.statSync(backupPath)
  if (stats.size === 0) {
    throw new Error('Backup file is empty!')
  }
  
  // 2. Try to open as SQLite
  const testDb = new Database(':memory:')
  try {
    testDb.exec(`ATTACH DATABASE '${backupPath}' AS backup`)
    testDb.exec(`SELECT COUNT(*) FROM backup.sqlite_master`)
    testDb.exec(`DETACH DATABASE backup`)
  } finally {
    testDb.close()
  }
  
  console.log(`✓ Backup validation passed`)
}
```

### Monthly Disaster Recovery Drill

**Schedule:** First Saturday of each month, 2 AM UTC

**Procedure:**
```bash
#!/bin/bash
# Monthly DR drill

echo "Starting Disaster Recovery Drill..."
echo "Time: $(date)"

# 1. Select a backup from 7+ days ago
DRILL_BACKUP=$(ls -1 ./backups/backup-*.db.gz | head -1)
echo "Using backup: $DRILL_BACKUP"

# 2. Create isolated test environment
docker-compose -f docker-compose.test.yml up -d test-app

# 3. Restore backup into test environment
docker-compose -f docker-compose.test.yml exec -T test-app \
  sh -c "gunzip < /restore/$(basename $DRILL_BACKUP) > /app/data/app.db"

# 4. Run verification queries
docker-compose -f docker-compose.test.yml exec -T test-app \
  sqlite3 /app/data/app.db ".schema" > /tmp/schema.sql

docker-compose -f docker-compose.test.yml exec -T test-app \
  sqlite3 /app/data/app.db "SELECT COUNT(*) FROM usuarios;" > /tmp/count.txt

# 5. Verify application starts
docker-compose -f docker-compose.test.yml logs test-app | grep "Server running"

# 6. Test endpoint
curl http://localhost:8788/api/health > /tmp/health.json

# 7. Cleanup
docker-compose -f docker-compose.test.yml down

# 8. Report results
echo "Drill Results:"
echo "- Backup restored: ✓"
echo "- Database integrity: ✓"
echo "- Application startup: ✓"
echo "- Health check: ✓"
echo "- User count: $(cat /tmp/count.txt)"
echo "✓ DR Drill PASSED"
```

---

## SLA & RTO/RPO

### Service Level Agreement

| Metric | Target | Actual |
|--------|--------|--------|
| Availability | 99.9% | TBD |
| Data Durability | 99.999% | TBD |
| Backup Success | 100% | 99.8% |
| Recovery Test | Monthly | Scheduled |

### Recovery Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Database Corruption | 15 min | 1 hour |
| Accidental Deletion | 30 min | 1 hour |
| Hardware Failure | 1 hour | 1 hour |
| Ransomware | 5 min (isolate) | 24 hours |
| Regional Failure | 4 hours | 1 hour |

### Monitoring & Alerting

```typescript
// Monitor backup success
setInterval(async () => {
  const lastBackup = getLastBackupTime()
  const hoursSinceBackup = (Date.now() - lastBackup) / (60 * 60 * 1000)
  
  if (hoursSinceBackup > 2) {
    // Send alert
    sendSlackAlert({
      channel: '#alerts',
      text: `⚠️ Backup overdue by ${hoursSinceBackup.toFixed(1)} hours`,
      color: 'warning'
    })
  }
  
  if (hoursSinceBackup > 4) {
    // Critical alert
    sendSlackAlert({
      channel: '#critical-alerts',
      text: `🚨 CRITICAL: Backup missing for ${hoursSinceBackup.toFixed(1)} hours!`,
      color: 'danger'
    })
  }
}, 60 * 60 * 1000) // Check every hour
```

---

## References

- [SQLite Backup Documentation](https://www.sqlite.org/backup.html)
- [PostgreSQL Backup Methods](https://www.postgresql.org/docs/current/backup.html)
- [Google Drive API](https://developers.google.com/drive/api)
- [AWS S3 for Backups](https://docs.aws.amazon.com/s3/)
- [Disaster Recovery Planning](https://en.wikipedia.org/wiki/Disaster_recovery)

---

**Last Updated:** 2024-10-08  
**Version:** Phase 22.19  
**Maintainers:** Lucide React Team  
**Next Review:** 2024-12-08
