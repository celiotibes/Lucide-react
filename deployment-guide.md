# Lucide React CRMT - Deployment Guide
Phase 22.19: Production-ready Deployment & Infrastructure

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Local Development with Docker](#local-development)
4. [Database Migrations](#database-migrations)
5. [Deployment Environments](#deployment-environments)
6. [Docker Container Management](#docker-management)
7. [Monitoring & Health Checks](#monitoring)
8. [Troubleshooting](#troubleshooting)
9. [Backup & Recovery](#backup-recovery)

---

## Overview

This guide covers the complete deployment lifecycle for Lucide React CRMT using Docker, GitHub Actions, and SQLite/PostgreSQL databases.

### Architecture Overview
```
┌─────────────────────────────────────────────────────────┐
│         GitHub Actions CI/CD Pipeline (build.yml)        │
│  - Test (Node 20.x, 22.x) → Security → Docker → Deploy  │
└──────────────┬──────────────────────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
   Staging          Production
   (Docker)         (Kubernetes/VPS)
       │                │
   ┌───┴────┬───────────┴────┬────────────┐
   ▼        ▼                ▼            ▼
  App   Backup        App         Postgres
 (8787)        (8787)              (5432)
   │                  │
   ▼                  ▼
SQLite           PostgreSQL
```

### Key Technologies
- **Runtime:** Node.js 20.x (production) / 22.x (future-ready)
- **Database:** SQLite (dev) / PostgreSQL (prod)
- **Container:** Docker with 4-stage builds
- **CI/CD:** GitHub Actions
- **Monitoring:** Health checks, Sentry, metrics

---

## Prerequisites

### System Requirements
- Docker 24.0+
- Docker Compose 2.20+
- Node.js 20.x or 22.x
- Git
- SQLite3 (for migrations)
- PostgreSQL client tools (for production)

### Required Environment Variables

Create `.env` file in project root:

```bash
# Core
NODE_ENV=production
PORT=8787
LOG_LEVEL=info

# Database
DATABASE_URL=file:./data/app.db  # SQLite for dev/staging
# DATABASE_URL=postgresql://user:pass@host:5432/lucide_crmt  # PostgreSQL for prod

# Security (CHANGE IN PRODUCTION!)
API_KEY=your-secure-api-key-here
SESSION_SECRET=your-session-secret-here
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_MASTER_SECRET=$API_KEY

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:8787

# Integrations (Optional)
ASAAS_API_KEY=
ASAAS_SANDBOX=false
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=

# Backup
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *  # Daily at 2 AM UTC
BACKUP_RETENTION_DAYS=30

# Monitoring
SENTRY_DSN=
SENTRY_ENVIRONMENT=production

# Docker Resources
APP_CPUS_LIMIT=2
APP_MEMORY_LIMIT=1024M
BACKUP_CPUS_LIMIT=0.5
BACKUP_MEMORY_LIMIT=256M
```

---

## Local Development with Docker

### 1. Build the Development Image

```bash
# Build all stages (dependencies, builder, runtime)
docker build -t lucide-crmt:dev .

# Build with specific target (faster for development)
docker build -t lucide-crmt:dev --target runtime .
```

### 2. Run Development Stack

```bash
# Start all services (app + backup)
docker-compose up -d

# View logs
docker-compose logs -f app

# Run with specific profile (includes migrations)
docker-compose --profile init up migrations

# Stop services
docker-compose down

# Remove data volumes (reset database)
docker-compose down -v
```

### 3. Execute Commands in Container

```bash
# Run shell in app container
docker-compose exec app sh

# Run migrations manually
docker-compose exec app sqlite3 data/app.db < server/migrations-phase2-auth.sql

# Check database status
docker-compose exec app sqlite3 data/app.db ".tables"

# Run tests
docker-compose exec app npm test

# View application logs
docker-compose exec app tail -f logs/app.log
```

### 4. Development Workflow

```bash
# 1. Make code changes
# 2. Run tests locally
npm test

# 3. Build Docker image
docker build -t lucide-crmt:dev --target runtime .

# 4. Test in container
docker-compose up -d
curl http://localhost:8787/api/health

# 5. Commit and push
git add .
git commit -m "feat: new feature"
git push origin feature-branch
```

---

## Database Migrations

### Migration Structure

```
server/
├── migrations/
│   ├── README.md
│   ├── migrations-phase2-auth.sql          # Auth tables
│   ├── migrations-phase3-integracoes.sql   # Integration tables
│   ├── migrations-phase4*.sql
│   └── ... (more phase migrations)
└── src/
    └── migrations/
        ├── criar-politica-retencao.ts
        ├── migrar-papeis-usuarios.ts
        └── migrar-tipos-acao-auditoria.ts
```

### Running Migrations

#### Automatic (Docker Compose with profile)
```bash
# Initialize database with all migrations
docker-compose --profile init up migrations

# This runs all migrations in order from server/migrations-phase*.sql
```

#### Manual Execution
```bash
# SQLite
sqlite3 ./data/app.db < server/migrations-phase2-auth.sql

# PostgreSQL (with connection string)
psql $DATABASE_URL < server/migrations-phase2-auth.sql
```

#### Validate Migration Syntax
```bash
# Check each migration file
for f in server/migrations-phase*.sql; do
  echo "Validating: $f"
  head -1 "$f"
done
```

### Migration Naming Convention

Pattern: `migrations-phase{N}-{description}.sql`

- `phaseN`: Sequential phase number (2, 3, 4, etc.)
- `description`: Brief description of changes
- Order: Migrations run alphabetically by filename

### Creating New Migrations

1. Create file: `server/src/migrations-phase{N}-{description}.sql`
2. Add SQL statements with comments:

```sql
/**
 * Phase N: Description
 * Date: YYYY-MM-DD
 * Author: Your Name
 * 
 * Changes:
 * - Change 1
 * - Change 2
 */

-- Enable foreign keys (SQLite specific)
PRAGMA foreign_keys = ON;

-- Your migration SQL here
CREATE TABLE IF NOT EXISTS table_name (
  id TEXT PRIMARY KEY,
  -- columns...
);

-- Add indexes
CREATE INDEX idx_table_name_col ON table_name(col);
```

3. Test locally:
```bash
sqlite3 test.db < server/src/migrations-phase{N}-{description}.sql
```

---

## Deployment Environments

### Environment Configuration

#### Development (local/docker-compose)
- Database: SQLite (./data/app.db)
- Health check: Enabled
- Logging: Verbose (info level)
- Backup: Optional

#### Staging
- Database: SQLite or PostgreSQL
- Health check: Enabled
- Logging: Info level
- Backups: Daily at 2 AM
- Load: Single instance

#### Production
- Database: PostgreSQL (managed)
- Health check: Enabled
- Logging: Warning level (errors only)
- Backups: Hourly + daily archive
- Load: Multi-instance (k8s/load-balancer)
- Monitoring: Full Sentry + metrics

### Deployment Workflow

1. **Trigger**: Push to `main` → Production / `staging` → Staging
2. **Tests**: Run on Node 20.x and 22.x
3. **Security**: Trivy scan (CRITICAL, HIGH severity)
4. **Build**: Docker image with 4-stage optimization
5. **Migrations**: Validate and run
6. **Deploy**: Pull image → Start container → Health check
7. **Notify**: Slack notification with status

### Manual Deployment

```bash
# 1. Build image
docker build -t lucide-crmt:v1.0.0 .

# 2. Tag for registry
docker tag lucide-crmt:v1.0.0 ghcr.io/your-org/lucide-react:v1.0.0

# 3. Push to registry
docker push ghcr.io/your-org/lucide-react:v1.0.0

# 4. Pull and run on server
ssh user@production-server
docker pull ghcr.io/your-org/lucide-react:v1.0.0

# 5. Start service
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 6. Verify deployment
curl https://crmt.example.com/api/health
```

---

## Docker Management

### Image Information

```bash
# View image size (target: < 500MB)
docker images lucide-crmt:latest --format "{{.Size}}"

# Inspect image layers
docker history lucide-crmt:latest

# Show image details
docker inspect lucide-crmt:latest
```

### Container Management

```bash
# Start container
docker-compose up -d app

# Stop container gracefully (30s timeout)
docker-compose stop app

# Remove container
docker-compose rm -f app

# View container resources
docker stats lucide-crmt-app

# Execute command in running container
docker-compose exec app npm test

# View container logs
docker-compose logs -f --tail=50 app
```

### Volume Management

```bash
# List volumes
docker volume ls | grep lucide

# Inspect volume
docker volume inspect lucide_data

# Backup volume
docker run --rm -v lucide_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/lucide_data.tar.gz -C /data .

# Restore volume
docker run --rm -v lucide_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/lucide_data.tar.gz -C /data
```

### Network

```bash
# List networks
docker network ls | grep lucide

# Inspect network
docker network inspect lucide_network

# Connect container to network
docker network connect lucide_network container_name
```

---

## Monitoring & Health Checks

### Health Check Endpoint

**URL:** `GET /api/health`

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2024-10-08T12:00:00Z",
  "version": "22.19",
  "database": "ok",
  "uptime": 3600
}
```

### Docker Health Check

Runs every 30 seconds:
```bash
curl -f http://localhost:8787/api/health
```

### Monitor Application Logs

```bash
# Real-time logs
docker-compose logs -f app

# Last 100 lines
docker-compose logs --tail=100 app

# Logs since 5 minutes ago
docker-compose logs --since 5m app

# Save logs to file
docker-compose logs app > app.log
```

### Performance Monitoring

```bash
# Monitor resource usage
docker stats lucide-crmt-app

# Check process details
docker-compose exec app ps aux

# Memory usage
docker-compose exec app free -h
```

### Sentry Integration

Monitor errors and performance in production:

```bash
# Set SENTRY_DSN in environment
export SENTRY_DSN=https://key@sentry.io/project-id

# Errors appear in Sentry dashboard
# https://sentry.io/organizations/your-org/issues/
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs app

# Verify image built correctly
docker images lucide-crmt:latest

# Rebuild image
docker-compose build --no-cache app

# Run with interactive shell
docker-compose run --rm app sh
```

### Database connection errors

```bash
# Check database file exists
ls -la ./data/app.db

# Verify database is accessible
sqlite3 ./data/app.db ".tables"

# Reset database
rm -f ./data/app.db
docker-compose --profile init up migrations

# Check database permissions
ls -la ./data/
```

### Health check fails

```bash
# Test endpoint manually
curl -v http://localhost:8787/api/health

# Check port is exposed
docker-compose ps

# Verify service is running
docker-compose logs app | tail -50

# Check network connectivity
docker-compose exec app ping localhost
```

### Out of memory

```bash
# Check current limits
docker stats lucide-crmt-app

# Increase memory limit in docker-compose.yml
# deploy.resources.limits.memory: 2048M

# Monitor Node.js heap
docker-compose exec app node -e "console.log(require('os').totalmem())"
```

### Migrations fail

```bash
# Check migration files exist
ls -la server/migrations-phase*.sql

# Validate SQL syntax
sqlite3 :memory: < server/migrations-phase2-auth.sql

# View migration order
ls -1 server/migrations-phase*.sql | sort

# Run migrations manually with error output
sqlite3 ./data/app.db < server/migrations-phase2-auth.sql 2>&1
```

---

## Backup & Recovery

### Automatic Backups

Backups run daily at 2 AM UTC:

```bash
# Configuration
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"
BACKUP_RETENTION_DAYS=30
```

### Manual Backup

```bash
# Create backup
docker-compose exec -T app sqlite3 data/app.db \
  ".backup data/backup-$(date +%s).db"

# View backups
ls -lah ./data/backup-*.db

# Compress backup
tar czf backup.tar.gz ./data/backup-*.db
```

### Restore from Backup

```bash
# 1. Stop application
docker-compose stop app

# 2. Restore file
cp ./data/backup-1696776000.db ./data/app.db

# 3. Restart application
docker-compose start app

# 4. Verify
curl http://localhost:8787/api/health
```

### Backup to External Storage

```bash
# Upload to AWS S3
docker-compose exec app aws s3 cp \
  data/backup.db s3://bucket/backups/backup-$(date +%s).db

# Upload to Google Drive (with credentials)
docker-compose exec app \
  gdrive upload --file data/backup.db

# Upload to Azure Blob Storage
docker-compose exec app az storage blob upload \
  --container-name backups \
  --file data/backup.db
```

---

## Performance & Optimization

### Docker Image Size

Current: < 500MB (target)

Optimization techniques:
- Multi-stage builds (4 stages)
- Minimal base image (alpine)
- Production dependencies only
- Layer caching strategy

```bash
# Check image size
docker images lucide-crmt:latest --format "table {{.Repository}}\t{{.Size}}"

# View layers
docker history lucide-crmt:latest
```

### Build Cache Strategy

Layer order (by cache frequency):
1. System dependencies (rarely changes)
2. Package files (sometimes changes)
3. Config files (sometimes changes)
4. Source code (frequently changes)
5. Build artifacts (frequently changes)

### Resource Optimization

```yaml
# docker-compose.yml limits
app:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 1024M
      reservations:
        cpus: '1'
        memory: 512M
```

---

## Rollback Procedures

### Docker Rollback

```bash
# 1. Identify previous image
docker images lucide-crmt

# 2. Tag as current
docker tag lucide-crmt:v1.0.0 lucide-crmt:latest

# 3. Restart with previous version
docker-compose down
docker-compose up -d

# 4. Verify
curl http://localhost:8787/api/health
```

### Database Rollback

```bash
# 1. Restore backup
cp ./data/backup-1696776000.db ./data/app.db

# 2. Verify state
sqlite3 ./data/app.db ".tables"

# 3. Restart application
docker-compose restart app
```

---

## Support & Documentation

- **Issues:** GitHub Issues
- **Monitoring:** Sentry Dashboard
- **Logs:** Docker logs / Application logs
- **Database:** SQLite / PostgreSQL docs
- **Docker:** Docker documentation

---

**Last Updated:** 2024-10-08  
**Version:** Phase 22.19  
**Maintainers:** Lucide React Team
