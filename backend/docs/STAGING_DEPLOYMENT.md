# Staging Deployment Guide

Complete guide for deploying the Rental Listing Sync backend to staging environment.

## Prerequisites

- Node.js 20 LTS installed locally
- PostgreSQL 15+ (staging database)
- Redis 7+ (staging queue)
- SSH access to staging server (`staging.rentalsync.local`)
- Deploy SSH key configured in `~/.ssh/staging-deploy-key`
- GitHub credentials for code access
- Staging `.env` configuration prepared

## Pre-Deployment Checklist

- [ ] All tests passing: `npm test`
- [ ] TypeScript compilation successful: `npm run build`
- [ ] No uncommitted changes: `git status` clean
- [ ] Staging database backups created
- [ ] Redis backups created
- [ ] Current version tagged in git
- [ ] Staging URLs and credentials confirmed
- [ ] Team notified of deployment window
- [ ] Rollback plan documented and tested

## Environment Configuration

### 1. Prepare Staging Environment File

Create `.env.staging` based on `.env.example`:

```bash
cp backend/.env.example backend/.env.staging
```

Edit `backend/.env.staging` with staging-specific values:

```env
# Core Configuration
NODE_ENV=staging
PORT=3000

# Database (Staging)
DATABASE_URL=postgresql://rental_sync_user:${STAGING_DB_PASSWORD}@staging-db.rentalsync.local:5432/rental_sync_staging
DATABASE_POOL_SIZE=15
DATABASE_POOL_IDLE_TIMEOUT_MS=30000
DATABASE_POOL_MAX_LIFETIME_MS=600000

# Redis (Staging)
REDIS_URL=redis://staging-redis.rentalsync.local:6379
REDIS_PASSWORD=${STAGING_REDIS_PASSWORD}
REDIS_DB=0

# Authentication
JWT_SECRET=${STAGING_JWT_SECRET}
JWT_EXPIRATION=7d

# OTA Integrations (Staging/Test Keys)
BOOKING_API_KEY=${STAGING_BOOKING_API_KEY}
BOOKING_ACCOUNT_ID=${STAGING_BOOKING_ACCOUNT_ID}
BOOKING_WEBHOOK_SECRET=${STAGING_BOOKING_WEBHOOK_SECRET}

VRBO_API_KEY=${STAGING_VRBO_API_KEY}
VRBO_WEBHOOK_SECRET=${STAGING_VRBO_WEBHOOK_SECRET}

AIRBNB_API_KEY=${STAGING_AIRBNB_API_KEY}
AIRBNB_WEBHOOK_SECRET=${STAGING_AIRBNB_WEBHOOK_SECRET}

GEMINI_API_KEY=${STAGING_GEMINI_API_KEY}

# Logging
LOG_LEVEL=INFO
LOG_LEVEL_CONSOLE=INFO
LOG_LEVEL_FILE=DEBUG
LOG_FILE_PATH=/var/log/rental-sync/staging/app.log
LOG_RETENTION_DAYS=7

# Worker Configuration
WORKER_CONCURRENCY_SYNC_LISTINGS=3
WORKER_CONCURRENCY_PRICING=2
WORKER_CONCURRENCY_LEAD_MANAGEMENT=5
WORKER_MAX_ATTEMPTS_SYNC=3
WORKER_MAX_ATTEMPTS_PRICING=2
WORKER_BACKOFF_STRATEGY=exponential
WORKER_BACKOFF_DELAY_MS=2000

# Feature Flags (Staging)
ENABLE_DYNAMIC_PRICING=true
ENABLE_AI_LEAD_SCORING=true
ENABLE_REAL_TIME_SYNC=true
ENABLE_DETAILED_LOGGING=true

# Monitoring
SENTRY_DSN=${STAGING_SENTRY_DSN}

# CORS (Staging)
CORS_ORIGINS=https://staging.rentalsync.local,https://staging-app.rentalsync.local
CORS_CREDENTIALS=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_ENABLED=true
```

### 2. Secure Credentials

Store sensitive values in a secure location (not in git):

```bash
# Create a secrets file for deployment
cat > /tmp/staging-secrets.env << 'EOF'
STAGING_DB_PASSWORD=<your-secure-password>
STAGING_REDIS_PASSWORD=<your-secure-password>
STAGING_JWT_SECRET=<your-jwt-secret>
STAGING_BOOKING_API_KEY=<booking-com-key>
STAGING_BOOKING_ACCOUNT_ID=<booking-account-id>
STAGING_BOOKING_WEBHOOK_SECRET=<booking-secret>
STAGING_VRBO_API_KEY=<vrbo-api-key>
STAGING_VRBO_WEBHOOK_SECRET=<vrbo-webhook-secret>
STAGING_AIRBNB_API_KEY=<airbnb-api-key>
STAGING_AIRBNB_WEBHOOK_SECRET=<airbnb-webhook-secret>
STAGING_GEMINI_API_KEY=<gemini-api-key>
STAGING_SENTRY_DSN=<sentry-dsn>
EOF

# Restrict permissions
chmod 600 /tmp/staging-secrets.env
```

## Build Process

### Step 1: Verify Local Build

```bash
cd backend
npm install --production
npm run build
```

Verify build output:
```bash
# Check compiled files exist
ls -la dist/ | head -20

# Verify TypeScript compilation was successful
test -d dist/src && echo "✓ Build successful" || echo "✗ Build failed"
```

### Step 2: Run Tests

```bash
npm test -- --coverage
```

Expected results:
- All tests passing
- Code coverage > 80%
- No console errors
- No performance degradation

### Step 3: Create Deployment Package

```bash
# Create deployment tarball
tar --exclude='node_modules' --exclude='.git' --exclude='coverage' \
  -czf staging-build-$(date +%Y%m%d-%H%M%S).tar.gz \
  dist/ package.json package-lock.json migrations/ config/

# Verify tarball
ls -lh staging-build-*.tar.gz
tar -tzf staging-build-*.tar.gz | head -20
```

## Deployment to Staging

### Step 1: SSH Access Setup

Test SSH connectivity:

```bash
# Test connection
ssh -i ~/.ssh/staging-deploy-key deploy@staging.rentalsync.local \
  "echo 'SSH connection successful'"

# If connection fails, verify:
ssh-add ~/.ssh/staging-deploy-key
ssh-add -l  # Should show the key
```

### Step 2: Upload Build Package

Using SCP:
```bash
SCP_FILE=$(ls -t staging-build-*.tar.gz | head -1)
scp -i ~/.ssh/staging-deploy-key \
  "$SCP_FILE" \
  deploy@staging.rentalsync.local:/tmp/
```

Or using rsync (faster for large files):
```bash
rsync -avz --delete -e "ssh -i ~/.ssh/staging-deploy-key" \
  dist/ package.json package-lock.json migrations/ \
  deploy@staging.rentalsync.local:/opt/rental-sync/backend/
```

### Step 3: Pre-Deployment Backup

SSH into staging server:

```bash
ssh -i ~/.ssh/staging-deploy-key deploy@staging.rentalsync.local
```

Create backups:

```bash
# Backup database
BACKUP_FILE="rental_sync_staging_$(date +%Y%m%d_%H%M%S).sql"
pg_dump postgresql://rental_sync_user:$STAGING_DB_PASSWORD@staging-db.rentalsync.local/rental_sync_staging \
  | gzip > /backups/databases/$BACKUP_FILE
echo "✓ Database backup: $BACKUP_FILE"

# Backup current deployment
cp -r /opt/rental-sync/backend /opt/rental-sync/backend.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ Deployment backup created"

# Verify backups
ls -lh /backups/databases/ | tail -5
```

### Step 4: Deploy New Version

On staging server:

```bash
cd /opt/rental-sync/backend

# Stop services (graceful shutdown - 30 second timeout)
systemctl stop rental-sync-backend || true
systemctl stop rental-sync-worker-* || true

# Wait for graceful shutdown
sleep 5

# Kill any remaining processes
pkill -f "node dist/" || true
sleep 2

# Extract new version
TARBALL=$(ls -t /tmp/staging-build-*.tar.gz | head -1)
tar -xzf $TARBALL

# Install dependencies
npm install --production --verbose

# Run database migrations
npm run migrate
```

### Step 5: Start Services

Start all services in correct order:

```bash
# Start main backend service
systemctl start rental-sync-backend
sleep 2

# Start workers
systemctl start rental-sync-worker-booking-sync
systemctl start rental-sync-worker-vrbo-sync
systemctl start rental-sync-worker-pricing
systemctl start rental-sync-worker-ai-processor

# Verify all services started
systemctl status rental-sync-backend
systemctl status rental-sync-worker-*
```

### Step 6: Health Checks

Verify deployment success:

```bash
# Wait for service to fully initialize
sleep 10

# Check main service
curl -s http://localhost:3000/health | jq .
# Expected: {"status":"ok","timestamp":"..."}

# Check API response
curl -s http://localhost:3000/api/properties \
  -H "Authorization: Bearer $TEST_JWT_TOKEN" | jq '.[] | .id' | head -5
# Expected: List of property IDs

# Check database connectivity
psql postgresql://rental_sync_user:$STAGING_DB_PASSWORD@staging-db.rentalsync.local/rental_sync_staging \
  -c "SELECT COUNT(*) FROM properties;"
# Expected: Number of properties

# Check Redis connectivity
redis-cli -h staging-redis.rentalsync.local ping
# Expected: PONG

# Check worker queues
redis-cli -h staging-redis.rentalsync.local LLEN "calendar-sync" 
redis-cli -h staging-redis.rentalsync.local LLEN "pricing-engine"
# Expected: Queue depths
```

## Post-Deployment Validation

### API Endpoint Testing

Test critical endpoints:

```bash
# 1. Authentication
curl -X POST http://staging.rentalsync.local:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}' \
  | jq .token

# 2. Property Listing
curl -X GET http://staging.rentalsync.local:3000/api/properties \
  -H "Authorization: Bearer $TOKEN" \
  | jq 'length'

# 3. Webhook Verification
# Test Booking.com webhook endpoint
curl -X POST http://staging.rentalsync.local:3000/webhooks/booking-com \
  -H "Content-Type: application/json" \
  -H "X-Booking-Signature: test-signature" \
  -d '{"event":"test"}' \
  | jq .

# 4. Health endpoint
curl -s http://staging.rentalsync.local:3000/health | jq .
```

### Log Analysis

Review logs for errors:

```bash
# Check application logs
tail -100 /var/log/rental-sync/staging/app.log | grep -i "error\|critical"

# Check worker logs
journalctl -u rental-sync-worker-* -n 50 --no-pager

# Monitor real-time logs
journalctl -u rental-sync-backend -f
```

### Performance Metrics

Verify performance:

```bash
# Database query performance
time psql postgresql://rental_sync_user:$DB_PASS@staging-db.local/rental_sync_staging \
  -c "SELECT COUNT(*) FROM calendar_slots;"

# Redis latency
redis-cli -h staging-redis.rentalsync.local \
  --latency-history -i 1 -c 5

# Check memory usage
ps aux | grep "node dist" | grep -v grep
```

## Smoke Tests

Run automated smoke tests against staging:

```bash
# Export base URL
export TEST_URL="http://staging.rentalsync.local:3000"

# Run smoke test suite
npm run test:smoke

# Or manually test key flows
npm run test -- --testPathPattern="smoke" --maxWorkers=1
```

Expected results:
- All endpoints responding (< 200ms)
- Database connectivity working
- Redis queue functioning
- Worker processes running
- No JavaScript errors in logs

## Monitoring

### System Monitoring

Set up continuous monitoring:

```bash
# CPU and Memory
watch -n 1 'ps aux | grep "[n]ode dist" | awk "{print \$1,\$3,\$4,\$6,\$11}"'

# Disk usage
du -sh /opt/rental-sync/backend /var/log/rental-sync/

# Process status
systemctl list-units --type=service --all | grep rental-sync
```

### Application Monitoring

Monitor application health:

```bash
# Check queue depths (should be processing)
redis-cli -h staging-redis.rentalsync.local INFO stats | grep keys

# Monitor worker performance
grep "processing\|completed\|failed" /var/log/rental-sync/staging/app.log | tail -20

# Error rate (should be < 1%)
grep "ERROR\|error" /var/log/rental-sync/staging/app.log | wc -l
```

## Rollback Procedure

If issues occur, rollback immediately:

```bash
# Stop services
systemctl stop rental-sync-backend rental-sync-worker-*

# Restore from backup
LATEST_BACKUP=$(ls -t /opt/rental-sync/backend.backup.* | head -1)
rm -rf /opt/rental-sync/backend
cp -r $LATEST_BACKUP /opt/rental-sync/backend

# Rollback database if needed
LATEST_DB_BACKUP=$(ls -t /backups/databases/rental_sync_staging_*.sql.gz | head -1)
gunzip -c $LATEST_DB_BACKUP | psql postgresql://rental_sync_user:$DB_PASS@staging-db.local/rental_sync_staging

# Restart services
systemctl start rental-sync-backend
systemctl start rental-sync-worker-*

# Verify rollback
curl -s http://localhost:3000/health | jq .
```

## Configuration Files

### Systemd Service Files

Create `/etc/systemd/system/rental-sync-backend.service`:

```ini
[Unit]
Description=Rental Sync Backend Service
After=network.target postgresql.service redis-server.service
Wants=rental-sync-worker-booking-sync.service rental-sync-worker-vrbo-sync.service

[Service]
Type=simple
User=rental-sync
WorkingDirectory=/opt/rental-sync/backend
EnvironmentFile=/opt/rental-sync/backend/.env.staging
Environment="NODE_ENV=staging"
ExecStart=/usr/bin/node dist/src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rental-sync-backend

# Graceful shutdown
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/rental-sync-worker-booking-sync.service`:

```ini
[Unit]
Description=Rental Sync Worker - Booking.com Calendar Sync
After=network.target redis-server.service

[Service]
Type=simple
User=rental-sync
WorkingDirectory=/opt/rental-sync/backend
EnvironmentFile=/opt/rental-sync/backend/.env.staging
Environment="NODE_ENV=staging"
ExecStart=/usr/bin/node dist/src/workers/booking-calendar-sync.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rental-sync-worker-booking

[Install]
WantedBy=multi-user.target
```

Repeat for other workers:
- `rental-sync-worker-vrbo-sync.service`
- `rental-sync-worker-pricing.service`
- `rental-sync-worker-ai-processor.service`

Enable services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable rental-sync-backend rental-sync-worker-*
sudo systemctl start rental-sync-backend rental-sync-worker-*
```

## Troubleshooting

### Services Won't Start

```bash
# Check logs for errors
journalctl -u rental-sync-backend -n 100 | tail -50

# Verify environment variables
env | grep -i STAGING | head -10

# Check file permissions
ls -la /opt/rental-sync/backend/dist/src/index.js

# Verify Node.js is installed
node --version

# Manual test
cd /opt/rental-sync/backend
node dist/src/index.js 2>&1 | head -50
```

### Database Connection Errors

```bash
# Test connection
psql postgresql://rental_sync_user:$DB_PASS@staging-db.local/rental_sync_staging -c "SELECT 1"

# Check database logs
sudo tail -50 /var/log/postgresql/postgresql.log | grep -i error

# Verify credentials in .env.staging
grep DATABASE_URL /opt/rental-sync/backend/.env.staging

# Test with psql directly
psql -h staging-db.rentalsync.local -U rental_sync_user -d rental_sync_staging -c "\l"
```

### Redis Connection Errors

```bash
# Test Redis connectivity
redis-cli -h staging-redis.rentalsync.local ping

# Check Redis logs
redis-cli -h staging-redis.rentalsync.local INFO stats

# Verify credentials
redis-cli -h staging-redis.rentalsync.local -a $REDIS_PASSWORD ping
```

### High Memory Usage

```bash
# Check memory per process
ps aux | grep "node dist" | grep -v grep | awk '{print $2,$6}'

# Monitor with top
top -p $(pgrep -f "node dist" | tr '\n' ',')

# Check for memory leaks in logs
grep -i "leak\|oom" /var/log/rental-sync/staging/app.log
```

### Queue Processing Delays

```bash
# Check queue depths
redis-cli -h staging-redis.rentalsync.local LLEN "calendar-sync"
redis-cli -h staging-redis.rentalsync.local LLEN "pricing-engine"

# Check failed jobs
redis-cli -h staging-redis.rentalsync.local LLEN "calendar-sync:failed"

# Monitor worker logs
journalctl -u rental-sync-worker-booking-sync -f
```

## Deployment Checklist

```
Pre-Deployment:
  [ ] All tests passing
  [ ] Git commit hash recorded
  [ ] Database backup completed
  [ ] Redis backup completed
  [ ] Team notified
  [ ] Staging .env prepared
  [ ] SSH access verified
  [ ] Build completed successfully

Deployment:
  [ ] Build package uploaded
  [ ] Pre-deployment backup created
  [ ] Services stopped gracefully
  [ ] New version extracted
  [ ] Dependencies installed
  [ ] Migrations executed
  [ ] Services started

Post-Deployment:
  [ ] Health checks passing
  [ ] API endpoints responding
  [ ] Database connectivity verified
  [ ] Redis queue functioning
  [ ] Worker processes running
  [ ] Logs reviewed (no errors)
  [ ] Performance metrics acceptable
  [ ] Smoke tests passing
  [ ] Team verified

Monitoring:
  [ ] Error rate normal
  [ ] Queue processing normal
  [ ] No memory leaks
  [ ] All workers healthy
  [ ] Database performance good
```

## CI/CD Integration

For automated deployments, add to GitHub Actions:

```yaml
name: Deploy to Staging

on:
  push:
    branches: [ staging ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: cd backend && npm install
      
      - name: Build
        run: cd backend && npm run build
      
      - name: Test
        run: cd backend && npm test
      
      - name: Deploy
        env:
          DEPLOY_KEY: ${{ secrets.STAGING_DEPLOY_KEY }}
          STAGING_ENV: ${{ secrets.STAGING_ENV }}
        run: |
          mkdir -p ~/.ssh
          echo "$DEPLOY_KEY" > ~/.ssh/staging-key
          chmod 600 ~/.ssh/staging-key
          ssh -i ~/.ssh/staging-key deploy@staging.rentalsync.local << 'DEPLOY'
            cd /opt/rental-sync/backend
            git pull origin staging
            npm install --production
            npm run build
            npm run migrate
            systemctl restart rental-sync-backend rental-sync-worker-*
          DEPLOY
```

## Contact & Support

For deployment issues:
- **DevOps Team**: devops@rentalsync.io
- **Backend Team**: backend@rentalsync.io
- **On-Call**: Check PagerDuty rotation

## Version History

| Date | Version | Deployed By | Status |
|------|---------|-------------|--------|
| 2024-08-24 | 1.0.0 | - | Created guide |

---

**Last Updated**: 2024-08-24  
**Maintained By**: DevOps Team
