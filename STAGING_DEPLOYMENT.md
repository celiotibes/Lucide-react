# 🚀 Staging Deployment Guide - BI Module & Core Features

Complete guide for deploying the Lucide-react application to a staging environment with the Business Intelligence module and all integrations.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Database Migration](#database-migration)
4. [Backend Services](#backend-services)
5. [Frontend Application](#frontend-application)
6. [Worker Queue Setup](#worker-queue-setup)
7. [Verification & Testing](#verification--testing)
8. [Monitoring & Logs](#monitoring--logs)
9. [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests passing: `npm test`
- [ ] No TypeScript errors: `npm run type-check`
- [ ] Code linting clean: `npm run lint`
- [ ] No security vulnerabilities: `npm audit`

### Configuration
- [ ] `.env.staging` file populated with all required variables
- [ ] Database credentials verified
- [ ] Redis connection confirmed
- [ ] API keys for external platforms (Booking, Hospeda, TripAdvisor) obtained
- [ ] JWT secrets configured and secured
- [ ] SMTP credentials available if using alerts

### Git Status
- [ ] All changes committed to feature branch
- [ ] Branch up-to-date with main/develop
- [ ] Pull request created and reviewed

---

## Environment Setup

### 1. Create Staging Environment Variables

Copy and customize the example configuration:

```bash
cp .env.example .env.staging
```

Edit `.env.staging` with staging-specific values:

```env
# Server configuration
NODE_ENV=staging
PORT=3000
LOG_LEVEL=INFO
LOG_FORMAT=json

# Database - Staging instance
DB_HOST=staging-db.example.com
DB_PORT=5432
DB_NAME=lucide_bi_staging
DB_USER=staging_user
DB_PASSWORD=your-secure-password

# Redis - Staging instance
REDIS_HOST=staging-redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password

# Frontend API URL
REACT_APP_API_URL=https://staging-api.example.com/api

# JWT Configuration
JWT_SECRET=staging-secret-key-min-32-chars-long-secure
JWT_EXPIRY=7d

# External API Keys
BOOKING_API_KEY=your-staging-booking-api-key
BOOKING_ACCOUNT_ID=your-staging-account-id
HOSPEDA_API_KEY=your-staging-hospeda-key
HOSPEDA_WEBHOOK_SECRET=your-staging-webhook-secret
TRIPADVISOR_API_KEY=your-staging-tripadvisor-key

# Feature Flags
ENABLE_HOSPEDA_SYNC=true
ENABLE_BOOKING_APARTMENTS_SYNC=true
ENABLE_TRIPADVISOR_RATINGS_SYNC=true

# BI Module
CACHE_KPI_TTL=3600
CACHE_MOVEMENTS_TTL=1800
CACHE_REPORTS_TTL=7200

# Worker Configuration
WORKER_CONCURRENCY=5
WORKER_MAX_ATTEMPTS=3
WORKER_BACKOFF_DELAY=2000

# Logging
ALERT_EMAIL_TO=staging-alerts@example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### 2. Install Dependencies

```bash
cd /home/user/Lucide-react

# Install all dependencies
npm install

# Backend specific
cd backend
npm install
cd ..

# Frontend specific
cd frontend
npm install
cd ..
```

---

## Database Migration

### 1. Connect to Staging Database

```bash
# Test connection
psql -h staging-db.example.com -U staging_user -d lucide_bi_staging

# Should return: staging=#
```

### 2. Run Migrations

Execute all database migrations in order:

```bash
cd backend

# Run all pending migrations
npm run migrate

# Or run specific migration
npm run migrate:run -- migrations/03_add_bi_star_schema.ts
```

### 3. Verify Schema

```bash
npm run db:verify

# Check tables created
psql -h staging-db.example.com -U staging_user -d lucide_bi_staging -c "\dt"
```

Expected tables:
- `dim_calendar` - Date dimension
- `dim_accounts` - Chart of accounts
- `dim_cost_centers` - Cost center dimension
- `fact_financial_movements` - Transaction fact table
- `agg_daily_kpis` - Daily KPI aggregation
- `agg_monthly_kpis` - Monthly KPI aggregation

### 4. Seed Initial Data (Optional)

```bash
npm run db:seed

# Verify data loaded
psql -h staging-db.example.com -U staging_user -d lucide_bi_staging \
  -c "SELECT COUNT(*) FROM dim_calendar;"
```

---

## Backend Services

### 1. Build Backend

```bash
cd backend

# Clean previous build
rm -rf dist

# Compile TypeScript
npm run build

# Verify build
ls -la dist/
```

### 2. Start Backend Server

**Option A: Systemd Service (Production-like)**

Create `/etc/systemd/system/lucide-backend.service`:

```ini
[Unit]
Description=Lucide Backend API Server
After=network.target postgres.service redis.service

[Service]
Type=simple
User=app_user
WorkingDirectory=/home/user/Lucide-react/backend
EnvironmentFile=/home/user/Lucide-react/.env.staging
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Start the service:

```bash
sudo systemctl enable lucide-backend
sudo systemctl start lucide-backend
sudo systemctl status lucide-backend

# View logs
sudo journalctl -u lucide-backend -f
```

**Option B: PM2 (Development-like)**

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/server.js --name "lucide-backend" --env staging

# Monitor
pm2 monit

# Save configuration
pm2 save
pm2 startup
```

### 3. Verify Backend Health

```bash
# Health check endpoint
curl -X GET \
  http://localhost:3000/api/bi/health \
  -H "Authorization: Bearer your-test-token"

# Expected response:
{
  "status": "healthy",
  "services": {
    "database": "ok",
    "cache": "ok"
  },
  "timestamp": "2024-07-17T10:30:00Z"
}
```

---

## Frontend Application

### 1. Build Frontend

```bash
cd frontend

# Clean previous build
rm -rf build

# Build optimized bundle
npm run build

# Verify build
ls -la build/
```

### 2. Serve Frontend

**Option A: Nginx (Production-recommended)**

Create `/etc/nginx/sites-available/lucide-staging`:

```nginx
server {
    listen 80;
    server_name staging.example.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name staging.example.com;
    
    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/staging.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.example.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # React app root
    root /home/user/Lucide-react/frontend/build;
    index index.html;
    
    # API proxy
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
    
    # React Router fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Static assets cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/lucide-staging /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**Option B: Serve React Build Directory**

```bash
# Using serve package
npm install -g serve

serve -s build -l 3001

# Or using npx
npx serve -s build -l 3001
```

### 3. Verify Frontend

```bash
# Test frontend endpoint
curl -I https://staging.example.com

# Should return 200 OK
```

---

## Worker Queue Setup

### 1. Start Redis Server

```bash
# If using Redis Docker
docker run -d \
  --name redis-staging \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:7-alpine

# Or connect to existing Redis
redis-cli -h staging-redis.example.com ping
# Expected: PONG
```

### 2. Start BullMQ Workers

Create `/etc/systemd/system/lucide-workers.service`:

```ini
[Unit]
Description=Lucide Workers - Job Queue Processing
After=network.target redis.service postgres.service

[Service]
Type=simple
User=app_user
WorkingDirectory=/home/user/Lucide-react/backend
EnvironmentFile=/home/user/Lucide-react/.env.staging
ExecStart=/usr/bin/node dist/workers/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Start workers:

```bash
sudo systemctl enable lucide-workers
sudo systemctl start lucide-workers
sudo systemctl status lucide-workers

# View logs
sudo journalctl -u lucide-workers -f
```

### 3. Workers Deployed

The following workers will start automatically:

- **sync-financial-reporting** - BI data ETL pipeline
- **sync-listings** - Property listing synchronization
- **sync-booking-apartments** - Booking.com apartment sync
- **sync-tripadvisor-ratings** - TripAdvisor ratings sync
- **sync-hospeda-listings** - Hospeda.com sync
- **lead-management** - Lead follow-up automation
- **update-pricing** - Dynamic pricing updates

### 4. Monitor Queue Status

```bash
# Check queue health
npm run queue:health

# View pending jobs
npm run queue:status

# Expected output:
# sync-financial-reporting: 0 pending, 0 active, 2 completed
# sync-listings: 5 pending, 1 active, 45 completed
```

---

## Verification & Testing

### 1. API Endpoint Testing

```bash
# Get auth token (replace with real token)
export TOKEN="your-jwt-token"

# Test KPI endpoint
curl -X POST http://localhost:3000/api/bi/kpis \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-06-01",
    "endDate": "2024-06-30",
    "propertyIds": ["prop-123"]
  }'

# Test movements endpoint
curl -X GET "http://localhost:3000/api/bi/movements?startDate=2024-06-01&endDate=2024-06-30&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Test health endpoint
curl -X GET http://localhost:3000/api/bi/health
```

### 2. Database Queries

```bash
# Connect to staging database
psql -h staging-db.example.com -U staging_user -d lucide_bi_staging

# Verify star schema tables
SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' 
  ORDER BY table_name;

# Check dimensions loaded
SELECT COUNT(*) as calendar_days FROM dim_calendar;
SELECT COUNT(*) as accounts FROM dim_accounts;

# Check fact data (if seeded)
SELECT COUNT(*) as movements FROM fact_financial_movements;
```

### 3. Frontend Tests

```bash
# Run all test suites
cd frontend
npm test

# Run specific test
npm test -- KPICard.test.tsx

# Generate coverage report
npm test -- --coverage
```

### 4. Load Testing

```bash
# Install Artillery for load testing
npm install -g artillery

# Create load test configuration
cat > load-test.yml << 'YAML'
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10

scenarios:
  - name: "BI API Load Test"
    flow:
      - post:
          url: "/api/bi/kpis"
          headers:
            Authorization: "Bearer test-token"
          json:
            startDate: "2024-06-01"
            endDate: "2024-06-30"
            propertyIds: ["prop-123"]
YAML

# Run load test
artillery run load-test.yml
```

---

## Monitoring & Logs

### 1. Structured Logging

All services log to stdout/stderr in JSON format for staging. View aggregated logs:

```bash
# Backend logs
sudo journalctl -u lucide-backend -f --output=json | jq '.'

# Workers logs
sudo journalctl -u lucide-workers -f --output=json | jq '.'

# Filter by log level
sudo journalctl -u lucide-backend PRIORITY=3 -f  # Errors only
```

### 2. Database Query Monitoring

```bash
# Enable query logging in PostgreSQL
psql -h staging-db.example.com -U postgres << 'PSQL'
ALTER SYSTEM SET log_min_duration_statement = 1000;
ALTER SYSTEM SET log_statement = 'all';
SELECT pg_reload_conf();
PSQL

# View slow queries
tail -f /var/log/postgresql/postgresql.log | grep "duration:"
```

### 3. Redis Monitoring

```bash
# Connect to Redis CLI
redis-cli -h staging-redis.example.com

# Monitor real-time commands
> MONITOR

# Check memory usage
> INFO memory

# View keys
> KEYS bi:*
```

---

## Rollback Procedures

### 1. Database Rollback

If migration fails:

```bash
cd backend

# List migrations
npm run migrate:list

# Revert last migration
npm run migrate:revert

# Or revert specific migration
npm run migrate:revert -- migrations/03_add_bi_star_schema.ts
```

### 2. Application Rollback

Using Systemd:

```bash
# Stop services
sudo systemctl stop lucide-backend lucide-workers

# Restore previous build
rm -rf backend/dist
git checkout HEAD~1 -- backend/src
npm run build

# Restart services
sudo systemctl start lucide-backend lucide-workers
```

---

**Last Updated**: 2026-07-17  
**Version**: 1.0.0  
**Maintained by**: Development Team
