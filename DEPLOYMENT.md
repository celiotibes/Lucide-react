# Deployment Guide - Rental Listing Sync

Complete guide for deploying the Rental Listing Sync platform to production.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Local Development](#local-development)
4. [Staging Deployment](#staging-deployment)
5. [Production Deployment](#production-deployment)
6. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Prerequisites

### Required Services
- **PostgreSQL 15+** - Database (managed: Neon, AWS RDS)
- **Redis 7+** - Cache & Queue (managed: Upstash, AWS ElastiCache)
- **Node.js 20 LTS** - Runtime
- **Git** - Version control
- **Docker** - Containerization (optional but recommended)

### Required Accounts
- GitHub (for CI/CD)
- Render.com or similar (backend hosting)
- Vercel or similar (frontend hosting)
- Neon or AWS (database)
- Upstash or AWS (Redis)
- Stripe (payments)
- SendGrid or Mailgun (email)
- Twilio (SMS)
- Gemini API (AI features)

### Tools
```bash
# Install Docker (if using containers)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Node.js 20
curl -sL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## Environment Setup

### 1. Create Environment Files

**Backend (.env)**
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/rental_sync
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://host:6379

# OTA APIs
BOOKING_ACCOUNT_ID=your_id
BOOKING_API_KEY=your_key
VRBO_API_KEY=your_key

# Payments
STRIPE_API_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Security
JWT_SECRET=your_random_secret_key_here
JWT_EXPIRATION=7d

# AI
GEMINI_API_KEY=your_key

# Server
PORT=3000
NODE_ENV=production
```

**Frontend (.env)**
```bash
VITE_API_URL=https://api.yourdomain.com
```

### 2. Database Setup

#### Option A: Neon.tech (Recommended for MVP)
```bash
# Create project on neon.tech
# Get connection string from dashboard
# PostgreSQL 15+

# Run migrations
npm run migrate

# Seed initial data (optional)
# psql $DATABASE_URL < seed.sql
```

#### Option B: AWS RDS
```bash
# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier rental-sync-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username admin \
  --master-user-password $DB_PASSWORD

# Wait for instance to be available
aws rds wait db-instance-available --db-instance-identifier rental-sync-db

# Run migrations
npm run migrate
```

### 3. Redis Setup

#### Option A: Upstash.com (Recommended for MVP)
```bash
# Create database on upstash.com
# Copy Redis URL from dashboard
# No additional setup needed
```

#### Option B: AWS ElastiCache
```bash
# Create Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id rental-sync-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1

# Get endpoint
aws elasticache describe-cache-clusters \
  --cache-cluster-id rental-sync-redis \
  --show-cache-node-info
```

---

## Local Development

### Using Docker Compose (Recommended)

```bash
# Clone repository
git clone https://github.com/celiotibes/Lucide-react.git
cd Lucide-react

# Create .env file in root
cat > .env << EOF
BOOKING_ACCOUNT_ID=test_id
BOOKING_API_KEY=test_key
VRBO_API_KEY=test_key
STRIPE_API_KEY=pk_test_...
GEMINI_API_KEY=test_key
EOF

# Start all services
docker-compose up -d

# Run migrations (one-time)
docker-compose exec backend npm run migrate

# Access services
# Backend: http://localhost:3000
# Frontend: http://localhost:5173
# PostgreSQL: localhost:5432
# Redis: localhost:6379

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop services
docker-compose down
```

### Without Docker

```bash
# Backend setup
cd backend
npm install
npm run migrate
npm run dev

# Frontend setup (in new terminal)
cd frontend
npm install
npm run dev

# Access
# Backend: http://localhost:3000
# Frontend: http://localhost:5173
```

---

## Staging Deployment

### Using Render.com & Vercel

#### 1. Backend on Render

```bash
# Install Render CLI
curl https://render.com/api/v1/cli | bash

# Login
render login

# Create backend service
render create --name rental-sync-backend \
  --type web \
  --runtime node \
  --buildCommand "npm install && npm run build" \
  --startCommand "node dist/index.js"

# Set environment variables
render env set DATABASE_URL=postgresql://...
render env set REDIS_URL=redis://...
render env set JWT_SECRET=...
# ... other vars
```

#### 2. Frontend on Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel

# Follow prompts to connect GitHub

# Set environment variables in Vercel dashboard
VITE_API_URL=https://rental-sync-backend-staging.onrender.com
```

#### 3. Custom Domain (Optional)

```bash
# Add custom domain in Render dashboard
# Add custom domain in Vercel dashboard
# Update DNS records to point to services

# Example DNS:
# backend.yourdomain.com CNAME rental-sync-backend.onrender.com
# app.yourdomain.com CNAME rental-sync-frontend.vercel.app
```

---

## Production Deployment

### Automated via GitHub Actions

1. **Setup Secrets in GitHub**
   ```
   Go to: Settings → Secrets and variables → Actions
   
   Add:
   - RENDER_API_KEY
   - RENDER_SERVICE_ID_PROD
   - VERCEL_TOKEN
   - DATABASE_URL
   - REDIS_URL
   - JWT_SECRET
   - STRIPE_API_KEY
   - SLACK_WEBHOOK (for notifications)
   ```

2. **Configure Continuous Deployment**
   ```bash
   # CI/CD pipeline runs on:
   # - All PRs (runs tests)
   # - Push to develop (deploys to staging)
   # - Push to main (deploys to production)
   
   git checkout -b production
   # Make final changes
   git push origin production
   ```

3. **Monitor Deployment**
   ```bash
   # View GitHub Actions logs
   # Go to: Actions tab → Latest workflow
   
   # Slack notifications sent on completion
   ```

### Manual Deployment

If you prefer not to use GitHub Actions:

```bash
# Backend
cd backend
npm run build
docker build -t rental-sync-backend:latest .
docker push your-registry/rental-sync-backend:latest

# On production server
docker pull your-registry/rental-sync-backend:latest
docker run -d \
  --name rental-sync-backend \
  -p 3000:3000 \
  -e DATABASE_URL=$DATABASE_URL \
  -e REDIS_URL=$REDIS_URL \
  your-registry/rental-sync-backend:latest

# Frontend
cd frontend
npm run build
# Deploy dist/ folder to CDN or static hosting
```

---

## Monitoring & Maintenance

### Health Checks

```bash
# Backend health check
curl https://api.yourdomain.com/health

# Expected response:
# {"status":"ok","timestamp":"2026-07-06T..."}
```

### Logging

```bash
# Render.com
render logs --service rental-sync-backend --follow

# Vercel
vercel logs

# Access logs via dashboards:
# - Render: https://dashboard.render.com
# - Vercel: https://vercel.com/dashboard
```

### Database Backups

```bash
# Neon.com - automated daily backups (included)

# AWS RDS - enable automated backups
aws rds modify-db-instance \
  --db-instance-identifier rental-sync-db \
  --backup-retention-period 30 \
  --preferred-backup-window "03:00-04:00"
```

### Performance Monitoring

```bash
# Access metrics:
# Render.com Dashboard → Metrics
# Vercel Dashboard → Analytics
# 
# Key metrics to monitor:
# - API response time (target: <100ms)
# - Database query time (target: <50ms)
# - Error rate (target: <0.1%)
# - Uptime (target: 99.5%+)
# - CPU usage (target: <70%)
# - Memory usage (target: <80%)
```

### Security

```bash
# SSL/TLS Certificate
# Automatically provisioned by:
# - Render.com (free Let's Encrypt)
# - Vercel (free Let's Encrypt)

# Update JWT secret
# 1. Generate new secret: openssl rand -base64 32
# 2. Update in environment variables
# 3. Existing tokens remain valid until expiry (7d)

# Rotate database password
# 1. Create new password
# 2. Update DATABASE_URL
# 3. Restart services
```

### Common Issues

**502 Bad Gateway**
```bash
# Check backend logs
render logs --service rental-sync-backend

# Likely causes:
# - Database connection failure
# - Redis connection failure
# - Unhandled exception in code
```

**Database Connection Timeout**
```bash
# Check DATABASE_URL is correct
# Verify firewall allows connection
# Check Neon/RDS status dashboard
# Restart backend service
```

**Out of Memory**
```bash
# Check memory usage
render logs --service rental-sync-backend

# Increase instance size if needed
# - Render: Settings → Instance Type
# - AWS: Modify DB instance class

# Check for memory leaks in application
npm run build && npm test
```

---

## Scaling Strategy

### Phase 1: MVP (Current)
- Render: Starter ($12/month)
- Neon: Free tier + $2/month
- Upstash: Free tier
- Estimated MRR: $14

### Phase 2: 50+ Properties
- Render: Standard ($30/month)
- Neon: Pro ($50/month)
- Upstash: Basic ($25/month)
- Estimated MRR: $105

### Phase 3: 200+ Properties
- Render: Multi-instance ($300+/month)
- Neon: Business ($500+/month)
- Upstash: Business ($300+/month)
- Estimated MRR: $1,100+

---

## Rollback Procedure

```bash
# If deployment fails or has critical bugs:

# Render.com
# 1. Go to Dashboard → rental-sync-backend
# 2. Click "Deployments" tab
# 3. Select previous working deployment
# 4. Click "Deploy"

# Vercel
# 1. Go to Project → Deployments
# 2. Click "..." on previous working deployment
# 3. Click "Promote to Production"

# Manual rollback (if needed)
git revert <problematic-commit-hash>
git push origin main
# CI/CD will automatically redeploy
```

---

## Post-Deployment Checklist

- [ ] Health check endpoint responds with 200
- [ ] Frontend loads without errors
- [ ] User can login/signup
- [ ] Calendar loads availability
- [ ] Booking form submits successfully
- [ ] Database migrations completed
- [ ] All environment variables set correctly
- [ ] SSL certificate valid
- [ ] Monitoring alerts configured
- [ ] Backup strategy in place
- [ ] Slack notifications working
- [ ] Custom domain resolves correctly

---

## Support

For deployment issues:
1. Check GitHub Actions logs
2. Review service dashboards (Render, Vercel, Neon, Upstash)
3. Check application logs
4. Review error messages carefully
5. Create GitHub issue with detailed information

---

**Last Updated:** July 2026  
**Status:** Production Ready  
**Estimated Deploy Time:** 10-15 minutes
