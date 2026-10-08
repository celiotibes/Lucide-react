# CRMT (Lucide React) - Deployment Guide

## Overview

CRMT provides three parallel deployment options: **macOS (DMG)**, **Windows (EXE)**, and **Docker Compose**. All share the same **Setup Wizard** foundation for configuration and credential management.

- **Phase 21 Backend**: Setup Wizard API, credential encryption, backup scheduling
- **Frontend**: React Setup Wizard component with 7 configuration steps
- **Platform-Specific**: First-boot detection, automatic backup scheduling

## Architecture

### Setup Wizard (7 Steps)

1. **Welcome** - App name, port configuration
2. **AI Provider** - Select Claude, OpenAI, Gemini, or Local LLM
3. **Backup Settings** - Frequency (hourly/daily/weekly/monthly) and retention
4. **Backup Destinations** - Local, AWS S3, Google Drive
5. **Platform Selection** - Choose deployment platform
6. **Privacy & Consent** - GDPR and analytics opt-in
7. **Review Configuration** - Verify all settings before completing

### Data Persistence Strategy

Each platform stores data in OS-specific locations to ensure persistence on crash/shutdown:

#### macOS
```
~/.lucide-react/
├── config/           # Setup configuration (permissions: 0o700)
├── data/            # Application database (permissions: 0o700)
├── backups/         # Daily backups (permissions: 0o700)
└── logs/            # Application logs
```

**Backup**: Daily cron jobs (configurable time) with 30-day retention
**Recovery**: If app crashes, restart to sync from latest backup

#### Windows
```
%APPDATA%\CRMT\
├── config\          # Setup configuration
├── data\           # Application database
├── backups\        # Daily backups
└── logs\           # Application logs
```

**Backup**: Windows Scheduled Tasks at 02:00 AM (customizable)
**Recovery**: Same-day recovery via local backup, or restore from previous day if needed

#### Docker
```
lucide-data/         # Named volume (persistent)
lucide-backups/      # Named volume for backups
lucide-logs/         # Named volume for logs
```

**Backup**: Backup service container running daily
**Recovery**: Restore from backup volume on container restart

## Installation & First Boot

### 1. macOS Installation (DMG)

#### Prerequisites
- macOS 10.14+
- Node.js 18+ (included in DMG)
- 500 MB free disk space

#### Installation Steps
1. Download `CRMT-Setup.dmg`
2. Double-click to mount
3. Drag "CRMT" to Applications folder
4. Launch from Applications
5. **Setup Wizard** opens automatically on first run
6. Complete all 7 steps
7. App starts after completion

#### Backup Configuration
- **Default**: Daily backups at 02:00 AM (configurable in step 3)
- **Automatic**: launchd agent installed for persistent scheduling
- **Location**: ~/.lucide-react/backups
- **Retention**: 30 days (adjustable in step 3)

### 2. Windows Installation (EXE)

#### Prerequisites
- Windows 10/11 (64-bit)
- 500 MB free disk space
- Administrator privileges (for Task Scheduler setup)

#### Installation Steps
1. Download `CRMT-Setup.exe`
2. Run as Administrator
3. Follow installer wizard (choose installation directory)
4. Click "Finish" to launch app
5. **Setup Wizard** opens automatically on first run
6. Complete all 7 steps
7. App starts after completion

#### Backup Configuration
- **Default**: Daily backups at 02:00 AM (configurable in step 3)
- **Automatic**: Windows Scheduled Task created during installation
- **Location**: %APPDATA%\CRMT\backups
- **Retention**: 30 days (adjustable in step 3)

#### Uninstallation
- Go to Control Panel > Programs and Features
- Select "CRMT" and click Uninstall
- Data in %APPDATA%\CRMT is preserved for safety

### 3. Docker Installation

#### Prerequisites
- Docker Desktop 4.0+
- 1 GB free disk space
- Docker Compose 2.0+

#### Installation Steps

```bash
# Clone repository
git clone https://github.com/celiotibes/lucide-react.git
cd lucide-react

# Create .env file with configuration
cp .env.docker.example .env

# Start containers
docker-compose up -d

# Access Setup Wizard
# Open http://localhost:3000 in browser
# Setup Wizard opens automatically on first run
```

#### Docker Compose Services

```yaml
services:
  app:
    image: lucide-react:latest
    ports: [3000:3000]
    volumes: [lucide-data:/app/data]
    
  backup:
    image: lucide-react:backup-service
    volumes:
      - lucide-data:/app/data:ro
      - lucide-backups:/backups
    environment:
      BACKUP_SCHEDULE: "0 2 * * *"  # Daily at 02:00
      
volumes:
  lucide-data:
  lucide-backups:
  lucide-logs:
```

#### Backup Configuration
- **Default**: Daily backups at 02:00 AM (configurable via BACKUP_SCHEDULE)
- **Automatic**: Backup service container runs continuously
- **Location**: lucide-backups volume
- **Retention**: 30 days (adjustable)

## Cloud Database Configuration (Phase 21)

CRMT supports both **SQLite** (development/small deployments) and **PostgreSQL** (production/cloud).

### When to Use PostgreSQL

- **Production deployments** with 100+ transactions/day
- **High availability** requirements (multi-region, failover)
- **Team collaboration** (multiple concurrent users)
- **Scaling requirements** (automatic storage scaling)
- **Compliance** (encryption, audit logs, backups)

### Quick Start: PostgreSQL on Cloud

#### 1. Choose Your Provider

| Provider | Recommended For | Setup Time | Cost |
|----------|----------------|-----------|------|
| **AWS RDS Aurora** | Highest availability, auto-scaling | 10 min | $15-100/month |
| **Azure Database** | Enterprise Azure deployments | 8 min | $20-150/month |
| **Google Cloud SQL** | GCP infrastructure | 8 min | $10-80/month |
| **Managed PostgreSQL** (Any cloud) | Standard PostgreSQL | 10 min | Varies |

#### 2. Create Database

**AWS RDS Aurora (Recommended)**:
```bash
# AWS Console → RDS → Create Database → Aurora PostgreSQL
# Configuration:
# - Engine: PostgreSQL 15+
# - Instance: db.t3.small (dev) or db.r5.large (prod)
# - Multi-AZ: Yes (production)
# - Backup: 30 days retention
```

**Azure Database**:
```bash
# Azure Portal → Create Resource → Azure Database for PostgreSQL
# Configuration:
# - Compute: Standard_B2s (dev) or Standard_D2s_v3 (prod)
# - Storage: 32 GB minimum
# - High Availability: Enable for production
```

**Google Cloud SQL**:
```bash
# Google Cloud Console → SQL → Create Instance → PostgreSQL 15+
# Configuration:
# - Machine Type: db-f1-micro (dev) or db-n1-standard-2 (prod)
# - HA: Enable for production
# - Private IP: Enable for security
```

#### 3. Configure Connection

**Update .env**:
```bash
# SQLite → PostgreSQL migration
DATABASE_URL=postgresql://user:password@host:5432/database_name

# Connection pooling (recommended)
DATABASE_POOL_SIZE=20
DATABASE_POOL_IDLE_TIMEOUT=30000

# SSL (required for cloud)
DATABASE_SSL=require
DATABASE_SSL_REJECT_UNAUTHORIZED=true
```

#### 4. Run Migrations

```bash
# Test connection
npm run db:check

# Apply schema
npm run migrate:up

# Verify data
npm run db:verify
```

For complete setup instructions, see **[CLOUD-DATABASE.md](./CLOUD-DATABASE.md)**.

## Setup Wizard API Reference

### Endpoints

```
POST /api/setup-wizard/initialize
- Body: { "platform": "macos" | "windows" | "docker" }
- Returns: { "configId", "totalSteps", "message" }

GET /api/setup-wizard/step/:stepId
- Returns: Step configuration with fields and navigation

POST /api/setup-wizard/:configId/step/:stepId
- Body: Form field values for the step
- Returns: { "valid": boolean, "errors"?, "nextStep"? }
- Validates: AI credentials, S3 credentials, database connection

POST /api/setup-wizard/:configId/complete
- Marks setup as complete
- Returns: { "message", "configId" }

GET /api/setup-wizard/status/:platform
- Returns: { "setupComplete", "configId", "completedAt" }

GET /api/setup-wizard/:configId/config
- Returns: Complete configuration (credentials masked as ***)

GET /api/setup-wizard/:configId/audit
- Returns: Audit log of all setup changes
```

### Credential Encryption

All sensitive fields are encrypted using **AES-256-GCM**:
- API keys (Anthropic, OpenAI, Gemini)
- Database passwords
- AWS/Google Cloud credentials

**Master Secret**: 
- Environment variable: `ENCRYPTION_MASTER_SECRET`
- Fallback: `API_KEY` (not recommended for production)

## AI Provider Selection

### 1. Anthropic Claude (Recommended)

**Models:**
- Claude 3.5 Sonnet (Recommended - best balance)
- Claude 3 Opus (Most capable, slowest)
- Claude 3 Haiku (Fastest, less capable)

**Use Case**: Document classification, tenant/provider communication

**Setup**: Paste API key from https://console.anthropic.com

### 2. OpenAI GPT

**Models:**
- GPT-4 Turbo (Recommended)
- GPT-4 (More expensive)
- GPT-3.5 Turbo (Fastest, older)

**Setup**: Paste API key from https://platform.openai.com

### 3. Google Gemini (NEW)

**Models:**
- Gemini 2.0 Flash (NEW, fastest)
- Gemini 1.5 Pro (Most capable)
- Gemini 1.5 Flash (Free tier available)

**Setup**: Paste API key from https://makersuite.google.com/app/apikey

### 4. Local LLM

**Options**: Ollama, LLaMA.cpp, Mistral, etc.

**Setup**: 
- Endpoint: `http://localhost:11434` (Ollama default)
- Model: Model name on your server

## Backup Destination Configuration

### 1. Local Storage

**Default**: Always enabled
**Location**: OS-specific directory (see above)
**No configuration needed**

### 2. AWS S3 (Cloud)

**Requirements**:
- AWS Account with S3 bucket created
- IAM user with S3 permissions

**Bucket Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-crmt-backups",
        "arn:aws:s3:::my-crmt-backups/*"
      ]
    }
  ]
}
```

**Setup Steps**:
1. Enter S3 bucket name
2. Select AWS region
3. Enter AWS Access Key ID
4. Enter AWS Secret Access Key

### 3. Google Drive

**Requirements**:
- Google Cloud project with Drive API enabled
- Service account with Drive access

**Setup Steps**:
1. Create folder in Google Drive
2. Copy folder ID from URL
3. Create service account in Google Cloud Console
4. Paste service account JSON

## Data Recovery

### If Application Crashes

**All Platforms**: Restart the application
- Automatic recovery from latest local backup (same or previous day)
- No manual intervention needed

### If Data is Corrupted

**macOS/Windows**:
```bash
# Restore from specific backup
cp ~/.lucide-react/backups/app-backup-2024-01-15T02-00-00-000Z.db \
   ~/.lucide-react/data/app.db
```

**Docker**:
```bash
# Restore from backup volume
docker cp backup:/backups/app-backup-2024-01-15T02-00-00-000Z.db \
  $(docker ps -aq -f "name=app"):/app/data/app.db
```

### If Cloud Backup Needed

**AWS S3**:
```bash
# List backups
aws s3 ls s3://my-crmt-backups/backups/

# Download backup
aws s3 cp s3://my-crmt-backups/backups/app-backup-2024-01-15T02-00-00-000Z.db \
  ./restore.db
```

## Troubleshooting

### Setup Wizard Won't Start

**macOS/Windows**:
```bash
# Reset setup status (platform-specific)
rm ~/.lucide-react/config/setup-config.json  # macOS
del %APPDATA%\CRMT\config\setup-config.json  # Windows
# Restart app - Setup Wizard will reappear
```

**Docker**:
```bash
docker exec app rm /app/data/config/setup-config.json
docker restart app
```

### AI Provider Validation Failed

1. Verify API key is correct (copy-paste to check)
2. Verify internet connection
3. Check API provider status page
4. Ensure API has required permissions

### Backup Not Running

**macOS**: Check LaunchAgent status
```bash
launchctl list | grep crmt
launchctl stop com.lucidereact.crmt.backup
launchctl start com.lucidereact.crmt.backup
```

**Windows**: Check Scheduled Task
```bash
schtasks /query /tn "CRMT-AutoBackup"
schtasks /run /tn "CRMT-AutoBackup"
```

**Docker**: Check backup service logs
```bash
docker-compose logs backup
```

### Out of Disk Space

**All Platforms**: Backups stop automatically to prevent data loss
- Check backup retention settings in Setup Wizard
- Manually delete old backups if needed
- Reconfigure lower retention period

## Production Deployment Checklist

### Pre-Deployment

Database:
- [ ] Cloud PostgreSQL database created (AWS RDS Aurora, Azure, or Google Cloud SQL)
- [ ] Multi-AZ enabled for high availability
- [ ] Automated backups configured (30+ day retention)
- [ ] Read replicas created for load distribution (optional)
- [ ] Connection pooling configured (PgBouncer or node-postgres)
- [ ] SSL/TLS certificates verified
- [ ] Database credentials stored in secrets manager (AWS Secrets Manager, Azure Key Vault, etc.)
- [ ] Application user created with least-privilege grants

Credentials & Secrets:
- [ ] All API keys encrypted with ENCRYPTION_MASTER_SECRET
- [ ] AWS/Azure/GCP credentials in secrets manager (not in .env)
- [ ] Database password changed from default
- [ ] Backup encryption keys securely stored
- [ ] API_KEY and SESSION_SECRET regenerated for production

Backups:
- [ ] Local backup directory configured with adequate disk space
- [ ] Cloud backup location verified (AWS S3, Azure Blob, Google Cloud Storage)
- [ ] Backup retention policy set (30+ days recommended)
- [ ] Backup restoration tested successfully
- [ ] Backup monitoring alerts configured

Monitoring:
- [ ] CloudWatch/Azure Monitor/Google Cloud Monitoring configured
- [ ] Database connection pool monitoring enabled
- [ ] Slow query logging enabled
- [ ] Error tracking (Sentry) configured
- [ ] Performance baselines established

Security:
- [ ] Firewall rules restrict database access to app servers only
- [ ] SSL/TLS enabled on all connections
- [ ] Private endpoint used for cloud databases (VPC peering/Private Link)
- [ ] Database audit logging enabled
- [ ] CORS configuration verified
- [ ] Security headers configured (HSTS, CSP, etc.)

### Deployment Steps

1. **Test Database Connection**
   ```bash
   # Verify PostgreSQL connection from app server
   psql $DATABASE_URL -c "SELECT VERSION();"
   
   # Check connection pool
   curl http://localhost:3000/api/health
   ```

2. **Run Migrations**
   ```bash
   # Apply schema and seed data
   npm run migrate:up
   npm run seed:production
   ```

3. **Verify Data Integrity**
   ```bash
   # Count tables and rows
   npm run db:verify
   
   # Check query performance
   npm run db:analyze
   ```

4. **Test Backups**
   ```bash
   # Create manual backup
   npm run backup:create
   
   # Verify backup
   npm run backup:verify
   
   # Test restoration
   npm run backup:test-restore
   ```

5. **Monitor Initial Traffic**
   ```bash
   # Watch database metrics during first 1-2 hours
   # Check:
   # - Connection count
   # - Query latency (p50, p95, p99)
   # - Error rates
   # - CPU/memory utilization
   ```

6. **Gradual Rollout** (Recommended)
   ```bash
   # Route 10% traffic to new PostgreSQL instance
   # Monitor for 1 hour
   # Route 50% traffic
   # Monitor for 2 hours
   # Route 100% traffic
   ```

### Post-Deployment Monitoring

**First 24 hours**:
- Database connection health
- Query performance (latency, throughput)
- Backup status
- Error rates and types
- Storage growth rate

**Ongoing**:
- Weekly: Review slow queries and add indexes
- Monthly: Analyze storage growth and adjust retention
- Quarterly: Load test and capacity planning
- Annually: Disaster recovery drill

### Performance Targets

| Metric | Target | Action if Exceeded |
|--------|--------|------------------|
| P99 Query Latency | < 100ms | Add indexes, check slow queries |
| Connection Pool | < 90% utilized | Increase pool size or use PgBouncer |
| Cache Hit Ratio | > 99% | Increase memory or optimize queries |
| Disk Usage | < 80% | Implement retention policy |
| Backup Duration | < 1 hour | Use pg_dump in parallel mode |

### Database Migration from SQLite to PostgreSQL

If migrating existing data:

1. **Backup SQLite**
   ```bash
   cp data/app.db data/app.db.backup.$(date +%Y%m%d)
   ```

2. **Export and Import**
   ```bash
   # Option A: Use pgloader (automated)
   npx pgloader sqlite:///data/app.db postgresql://user:pass@host/crmt_prod
   
   # Option B: Manual export/import
   sqlite3 data/app.db .schema > schema.sql
   psql $DATABASE_URL < schema.sql
   sqlite3 -header -csv data/app.db "SELECT * FROM users;" > users.csv
   psql $DATABASE_URL -c "COPY users FROM STDIN CSV HEADER;" < users.csv
   ```

3. **Verify Migration**
   ```bash
   # Compare row counts
   sqlite3 data/app.db "SELECT COUNT(*) FROM users;"
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
   ```

4. **Switch Connection**
   ```bash
   # Update .env
   sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://....|' .env
   
   # Restart app
   npm run dev
   ```

5. **Monitor Migration**
   - Check for data anomalies
   - Monitor query performance
   - Verify all features work as expected
   - Keep SQLite backup for 30+ days

### Rollback Procedure

If critical issues after PostgreSQL migration:

1. **Stop Application**
   ```bash
   docker-compose down  # or equivalent
   ```

2. **Restore SQLite Backup**
   ```bash
   cp data/app.db.backup data/app.db
   ```

3. **Revert Connection String**
   ```bash
   # .env
   DATABASE_URL=file:./data/app.db
   ```

4. **Restart Application**
   ```bash
   docker-compose up -d  # or equivalent
   ```

5. **Post-Mortem**
   - Analyze logs for root cause
   - Fix issues in isolated environment
   - Re-test migrations with larger dataset
   - Document lessons learned

## Next Steps

### Phase 22: Android App
- React Native with Expo
- Offline-first with WatermelonDB
- Document capture with OCR
- Tenant/Provider dashboards

### Phase 23: Web Portal
- Public tenant portal
- Responsive design
- Document upload/download
- Payment tracking

### Phase 24: API Documentation
- OpenAPI 3.0 specification
- SDK generation (TypeScript, Python)
- Webhook support
- Rate limiting

## Support & Documentation

- **GitHub Issues**: Report bugs and request features
- **Documentation**: /docs directory in repository
- **Setup Logs**: Check application logs for debugging
  - macOS: ~/.lucide-react/logs
  - Windows: %APPDATA%\CRMT\logs
  - Docker: `docker-compose logs`

---

**Last Updated**: October 2026
**Version**: 1.0.0
**Status**: Production Ready
