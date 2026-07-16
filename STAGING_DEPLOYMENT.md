# Staging Deployment Configuration Guide

## Overview

This guide provides comprehensive instructions for deploying the rental property management platform to a staging environment with Logger integration, environment configuration, and monitoring.

## Quick Start

```bash
# 1. Environment Setup
cp .env.example .env.staging
# Edit .env.staging with staging credentials

# 2. Database Setup
createdb lucide_staging
npm run migrate up

# 3. Start Services
npm run workers:start:staging &
npm start
```

## Logger Integration

The platform integrates structured logging into 3 workers and 3 services:

### Workers with Logging:
1. **sync-hospeda-listings** - Property sync with detailed logging
2. **sync-booking-apartments** - Apartment sync with calendar tracking
3. **sync-tripadvisor-ratings** - Rating updates affecting pricing

### Services with Logging:
1. **lead.service** - Lead creation, stage updates, funnel stats
2. **pricing-engine** - Dynamic price calculations with detailed adjustments
3. **property.service** - Property CRUD operations and bulk updates

### Log Configuration

```env
LOG_LEVEL=DEBUG  # DEBUG, INFO, WARN, ERROR (default: INFO)
LOG_FORMAT=text  # text or json format
LOG_RETENTION_DAYS=7
```

### Usage Example

```typescript
// In any worker/service
import { Logger } from '../shared/logger';

const logger = Logger.getLogger('ComponentName');

logger.info('Operation started', { userId, propertyId });
logger.debug('Debug details', { data });
logger.warn('Warning message', error, { context });
logger.error('Error occurred', error, { details });
logger.time('Operation name', duration_ms, { metadata });
```

## Environment Configuration

### Required Variables

```env
# Database & Cache
NODE_ENV=staging
DATABASE_URL=postgresql://staging_user:password@localhost:5432/lucide_staging
REDIS_URL=redis://localhost:6379

# Platform APIs
HOSPEDA_API_KEY=staging_key
HOSPEDA_WEBHOOK_SECRET=staging_secret
HOSPEDA_WEBHOOK_URL=https://staging.yourdomain.com/webhooks/hospeda
BOOKING_API_KEY=staging_key
TRIPADVISOR_API_KEY=staging_key

# Logging
LOG_LEVEL=DEBUG
LOG_FORMAT=text

# Workers
SYNC_HOSPEDA_SCHEDULE=0 */6 * * *
SYNC_BOOKING_APARTMENTS_SCHEDULE=0 */6 * * *
SYNC_TRIPADVISOR_RATINGS_SCHEDULE=0 */24 * * *

# Feature Flags
ENABLE_HOSPEDA_SYNC=true
ENABLE_BOOKING_APARTMENTS_SYNC=true
ENABLE_TRIPADVISOR_RATINGS_SYNC=true
```

## Deployment Steps

### 1. Pre-Deployment Validation
```bash
npm run validate:env:staging
npm run db:test:staging
npm run redis:test:staging
```

### 2. Database Migration
```bash
npm run migrate status
npm run migrate up
```

### 3. Build & Test
```bash
cd backend
npm run build
npm run test
npm run type-check
```

### 4. Start Services
```bash
# Terminal 1: Workers
npm run workers:start:staging

# Terminal 2: Application
npm start
```

### 5. Verify Integrations
```bash
curl -X POST http://localhost:3000/api/test/hospeda
curl -X POST http://localhost:3000/api/test/booking-apartments
curl -X POST http://localhost:3000/api/test/tripadvisor
```

## Health Checks

```bash
# Application health
curl http://localhost:3000/health

# Worker status
curl http://localhost:3000/api/workers/status

# Integration status
curl http://localhost:3000/api/integrations/status
```

## Monitoring

### Database Queries
```bash
# Sync success rate
psql -U staging_user -d lucide_staging -c "
  SELECT platform, status, COUNT(*) 
  FROM sync_history WHERE synced_at > NOW() - INTERVAL '24 hours'
  GROUP BY platform, status;"

# Last sync times
psql -U staging_user -d lucide_staging -c "
  SELECT platform, last_sync_at, last_sync_status 
  FROM user_integrations;"
```

### Log Monitoring
```bash
# Real-time logs
npm run logs:tail:staging

# Errors only
npm run logs:errors:staging

# Specific component
grep "SyncHospedaWorker" logs/application.log
```

## Troubleshooting

### Database Connection Issues
```bash
psql $DATABASE_URL -c "SELECT 1"
pg_isready -h localhost -p 5432
```

### Redis Connection Issues
```bash
redis-cli ping
redis-cli INFO memory
```

### Workers Not Processing
```bash
redis-cli KEYS "bull:*"
npm run workers:debug:staging
npm run workers:stop:staging && npm run workers:start:staging
```

### Webhook Issues
```bash
# Test webhook
curl -X POST http://localhost:3000/webhooks/hospeda \
  -H "X-Hospeda-Signature: test"

# Check registration
npm run webhooks:list:staging
```

## Rollback Procedures

```bash
# Stop services
npm run stop:all

# Revert code
git checkout <previous_commit>

# Rollback database
npm run migrate down

# Restart
npm run workers:start:staging & npm start
```

## Verification Checklist

- [ ] Health endpoint returns healthy status
- [ ] All database tables created
- [ ] Redis connected
- [ ] All 3 workers running (concurrency: 5, 5, 10)
- [ ] Platform connectivity verified
- [ ] Webhooks registered
- [ ] Logs show proper context and metadata
- [ ] No critical errors
- [ ] Migrations applied successfully

## Next Steps

1. Performance baseline testing
2. Load testing (100 concurrent users)
3. Integration testing workflows
4. Security scanning
5. Production readiness review
