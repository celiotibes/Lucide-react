# Staging Deployment Guide - Rental Listing Sync

**Last Updated**: 2026-07-06  
**Status**: 📋 Staging Deployment Ready  
**Phase**: Phase 2 Logger Integration + Deployment Configuration

---

## Overview

This guide documents the process for deploying the Rental Listing Sync application to a staging environment. The application includes:

- Node.js/Express backend with PostgreSQL database
- React frontend with TypeScript
- Real-time calendar synchronization (Booking.com, VRBO)
- AI-powered inquiry categorization and damage analysis
- Dynamic pricing engine
- Structured logging with Logger integration

---

## Pre-Deployment Checklist

### 1. Environment Preparation

```bash
# Clone the repository
git clone <repository-url>
cd Lucide-react

# Install dependencies
npm install --legacy-peer-deps  # Due to bullmq/redis peer dependency

# Build frontend (if not in dev mode)
cd frontend
npm run build
cd ..

# Build backend (if using TypeScript compilation)
cd backend
npm run build
cd ..
```

### 2. Database Setup

#### Local Staging (SQLite/PostgreSQL)
```bash
# Run migrations (if configured)
npm run db:migrate

# Seed initial data (if applicable)
npm run db:seed
```

#### Cloud Staging (AWS RDS, Google Cloud SQL, etc.)
```bash
# Update DATABASE_URL in .env with cloud database connection
# Example for AWS RDS:
DATABASE_URL=postgresql://username:password@rental-sync-staging.c123abc.us-east-1.rds.amazonaws.com:5432/rental_sync_staging

# Run migrations against cloud database
npm run db:migrate
```

### 3. Environment Configuration

#### Create .env file in backend directory

```bash
cd backend
cp .env.example .env
```

#### Edit .env with staging values

**Critical Variables (MUST be set):**

```env
# Database (required)
DATABASE_URL=postgresql://user:password@staging-db:5432/rental_sync_staging
DATABASE_POOL_SIZE=20

# Redis (required for job queue)
REDIS_URL=redis://staging-redis:6379

# JWT Security (MUST change from example)
JWT_SECRET=<generate-strong-random-string-min-32-chars>
JWT_EXPIRATION=7d

# OTA Webhooks (MUST be set for integrations)
BOOKING_WEBHOOK_SECRET=<get-from-booking-com-console>
VRBO_WEBHOOK_SECRET=<get-from-vrbo-partner-portal>

# API Keys (required for integrations)
BOOKING_ACCOUNT_ID=<your-booking-account-id>
BOOKING_API_KEY=<your-booking-api-key>
VRBO_API_KEY=<your-vrbo-api-key>
GEMINI_API_KEY=<your-gemini-api-key>

# Stripe (if payments enabled)
STRIPE_API_KEY=<your-stripe-test-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
```

**Logging Configuration:**

```env
# Logging (defaults to console in dev, structured in production)
LOG_LEVEL=info
NODE_ENV=staging

# CloudWatch (optional, for centralized logging)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-aws-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret>
CLOUDWATCH_LOG_GROUP=/rental-sync/staging
CLOUDWATCH_LOG_STREAM=staging-backend
```

**Rate Limiting:**

```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### 4. Secrets Management

#### Option A: Environment Variables (Simple)
```bash
# Create secure .env file (not committed to git)
# Ensure .env is in .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

#### Option B: AWS Secrets Manager (Recommended for Cloud)
```bash
# Store secrets in AWS Secrets Manager
aws secretsmanager create-secret \
  --name rental-sync/staging \
  --secret-string '{"DATABASE_URL":"...", "JWT_SECRET":"..."}'

# Update application to load from Secrets Manager
npm install aws-sdk
```

#### Option C: Docker Secrets (for Kubernetes/Docker Swarm)
```bash
# Create secret file
echo "your-secret-value" > jwt_secret.txt

# In docker-compose.yml
secrets:
  jwt_secret:
    file: jwt_secret.txt
```

---

## Deployment Methods

### Method 1: Docker Container (Recommended)

#### Build Docker Image

```bash
# Build backend image
docker build -t rental-sync-backend:staging-v1 ./backend

# Build frontend image
docker build -t rental-sync-frontend:staging-v1 ./frontend

# Tag for registry (e.g., Docker Hub, ECR, GCR)
docker tag rental-sync-backend:staging-v1 your-registry/rental-sync-backend:staging-v1
docker push your-registry/rental-sync-backend:staging-v1
```

#### Deploy with Docker Compose

```bash
# Start all services
docker-compose -f docker-compose.staging.yml up -d

# Verify services are running
docker-compose -f docker-compose.staging.yml ps

# Check logs
docker-compose -f docker-compose.staging.yml logs -f backend
```

#### Sample docker-compose.staging.yml

```yaml
version: '3.8'

services:
  backend:
    image: your-registry/rental-sync-backend:staging-v1
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/rental_sync_staging
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=staging
      - LOG_LEVEL=info
    depends_on:
      - db
      - redis
    networks:
      - rental-sync

  frontend:
    image: your-registry/rental-sync-frontend:staging-v1
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:3000/api
    networks:
      - rental-sync

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=rental_sync
      - POSTGRES_PASSWORD=staging_password_change_me
      - POSTGRES_DB=rental_sync_staging
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - rental-sync

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - rental-sync

volumes:
  postgres_data:

networks:
  rental-sync:
```

### Method 2: Kubernetes Deployment

```bash
# Create namespace
kubectl create namespace rental-sync-staging

# Create secrets from .env
kubectl create secret generic rental-sync-secrets \
  --from-env-file=backend/.env \
  -n rental-sync-staging

# Deploy using manifests (create k8s/ directory with manifests)
kubectl apply -f k8s/backend-deployment.yaml -n rental-sync-staging
kubectl apply -f k8s/frontend-deployment.yaml -n rental-sync-staging
kubectl apply -f k8s/db-statefulset.yaml -n rental-sync-staging
kubectl apply -f k8s/redis-deployment.yaml -n rental-sync-staging

# Check deployment status
kubectl get pods -n rental-sync-staging
kubectl get svc -n rental-sync-staging
```

### Method 3: Manual Server Deployment

```bash
# SSH into staging server
ssh ubuntu@staging-server.example.com

# Navigate to app directory
cd /var/www/rental-sync

# Pull latest code
git pull origin main

# Install/update dependencies
npm install --legacy-peer-deps

# Build frontend
cd frontend && npm run build && cd ..

# Set environment variables
export $(cat backend/.env | grep -v '#' | xargs)

# Start services using PM2
pm2 start backend/src/index.ts --name "rental-sync-backend"
pm2 start worker processes...
pm2 save

# Verify running
pm2 list
pm2 logs rental-sync-backend
```

---

## Post-Deployment Validation

### 1. Health Checks

```bash
# Check backend health
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2026-07-06T...","environment":"staging"}
```

### 2. Database Connection

```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# Should return: 1
```

### 3. Redis Connection

```bash
# Test Redis connection
redis-cli -u $REDIS_URL ping

# Should return: PONG
```

### 4. Frontend Access

```bash
# Open browser
# http://localhost:5173 (dev)
# or http://staging.example.com (production server)

# Verify pages load:
# - Login page
# - Dashboard after login
# - Calendar component
# - Booking form
```

### 5. API Endpoint Tests

```bash
# Test authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test properties endpoint (with auth token)
curl -X GET http://localhost:3000/api/properties \
  -H "Authorization: Bearer <token>"

# Test webhook endpoint
curl -X POST http://localhost:3000/webhooks/booking-com \
  -H "X-Booking-Signature: <signature>" \
  -H "Content-Type: application/json" \
  -d '{...booking webhook payload...}'
```

### 6. Logging Verification

```bash
# Check that logs are being written correctly
tail -f /var/log/rental-sync/backend.log

# Verify structured logging format:
# [2026-07-06T10:30:45.123Z] INFO [HTTP] POST /api/properties {status:200, duration:145ms}

# For CloudWatch:
aws logs tail /rental-sync/staging --follow
```

### 7. Worker Processes

```bash
# Verify workers are running
ps aux | grep "node.*worker"

# Check Redis queue status
redis-cli -u $REDIS_URL LLEN "booking:calendar:sync"

# Monitor job processing
npm run monitor:jobs  # If script exists
```

---

## Configuration for Different Environments

### Staging Configuration

**Characteristics:**
- Smaller dataset for testing
- Less restrictive rate limits
- Detailed logging (INFO level)
- Can test destructive operations

**.env for Staging:**

```env
NODE_ENV=staging
LOG_LEVEL=info
DATABASE_POOL_SIZE=10  # Lower than production
RATE_LIMIT_MAX_REQUESTS=200  # More lenient
```

### Production Configuration

**Characteristics:**
- Full real data
- Strict rate limits
- Error-level logging only
- Webhook verification enabled

**.env for Production:**

```env
NODE_ENV=production
LOG_LEVEL=error
DATABASE_POOL_SIZE=50
RATE_LIMIT_MAX_REQUESTS=100
```

---

## Troubleshooting

### Database Connection Issues

```bash
# Test connection with verbose output
psql -v ON_ERROR_STOP=1 \
  -h $DB_HOST \
  -U $DB_USER \
  -d $DB_NAME \
  -c "SELECT version();"

# If fails, check:
# 1. DATABASE_URL format
# 2. Network connectivity
# 3. Database server running
# 4. Credentials correct
```

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli -u "$REDIS_URL" PING

# If fails, check:
# 1. REDIS_URL format
# 2. Redis server running
# 3. Network connectivity
# 4. No firewall blocking port 6379
```

### Webhook Signature Verification Failures

```bash
# Verify webhook secret is set
echo $BOOKING_WEBHOOK_SECRET

# Check logs for signature validation
grep "signature" /var/log/rental-sync/backend.log

# Common causes:
# 1. BOOKING_WEBHOOK_SECRET not set
# 2. Secret doesn't match Booking.com console
# 3. Webhook payload modified in transit
```

### Logger Not Writing Logs

```bash
# Check log directory exists and is writable
ls -la /var/log/rental-sync/

# Check file permissions
chmod 755 /var/log/rental-sync/
chmod 644 /var/log/rental-sync/*.log

# Restart services
pm2 restart all

# Check for logger errors
pm2 logs rental-sync-backend | grep -i "error"
```

---

## Monitoring & Observability

### Health Dashboard

The application includes health check endpoints:

```bash
# Backend health
GET /health

# Database health
GET /health/database

# Redis health
GET /health/redis

# Full system health
GET /health/system
```

### Structured Logging

All logs are in structured format:

```
[2026-07-06T10:30:45.123Z] INFO [HTTP] POST /api/properties {status:200, duration:145ms}
[2026-07-06T10:30:46.456Z] ERROR [Database] Connection timeout - {retries: 3, error: "..."}
```

### Recommended Monitoring Tools

- **Logs**: CloudWatch, DataDog, Papertrail
- **Metrics**: Prometheus, CloudWatch Metrics
- **Tracing**: Jaeger, AWS X-Ray
- **Alerts**: PagerDuty, Opsgenie
- **Dashboard**: Grafana, AWS CloudWatch

---

## Rollback Procedures

### Docker-based Rollback

```bash
# Switch to previous image version
docker-compose -f docker-compose.staging.yml down
docker pull your-registry/rental-sync-backend:staging-v0
docker-compose -f docker-compose.staging.yml up -d

# Verify running version
curl http://localhost:3000/health
```

### Kubernetes Rollback

```bash
# View rollout history
kubectl rollout history deployment/rental-sync-backend -n rental-sync-staging

# Rollback to previous version
kubectl rollout undo deployment/rental-sync-backend -n rental-sync-staging

# Verify status
kubectl rollout status deployment/rental-sync-backend -n rental-sync-staging
```

### Manual Deployment Rollback

```bash
# Revert to previous commit
git checkout v1.0.0

# Reinstall and restart
npm install --legacy-peer-deps
pm2 restart rental-sync-backend
```

---

## Next Steps

1. ✅ Complete Logger Integration Phase 2 (DONE)
2. ⏳ Deploy to staging environment
3. ⏳ Execute manual testing checklist (FRONTEND_TEST_PLAN.md)
4. ⏳ Run performance baseline tests (k6 performance tests)
5. ⏳ Execute security audit Phase 2 (npm audit, Trivy, OWASP ZAP)
6. ⏳ Monitor logs and fix any issues
7. ⏳ Production deployment

---

## Support & Reference

- **Backend**: Node.js 18+, Express.js
- **Database**: PostgreSQL 13+
- **Queue**: Redis 6+
- **Frontend**: React 18+, TypeScript
- **Container**: Docker 20.10+
- **Orchestration**: Kubernetes 1.24+ (optional)

**Logger Integration**: See `backend/src/logger.ts` and integrated services for structured logging format.

---

**Document Version**: 1.0  
**Last Updated**: 2026-07-06 17:30 UTC  
**Status**: ✅ READY FOR STAGING DEPLOYMENT
