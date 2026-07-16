# Deployment Guide - Legal Automation Platform

Comprehensive deployment guide for staging and production environments.

## Prerequisites

- Docker 20.10+, Docker Compose 1.29+
- Node.js 20+
- PostgreSQL 16+, Redis 7+
- API Keys: Claude, DataJud, Projudi credentials
- TSA Provider credentials (Sincronize, Certinf, Certisign)

## Staging Deployment

### 1. Start Staging Environment

```bash
cd legal-automation
cp .env.example .env.staging
docker-compose -f docker-compose.staging.yml --env-file .env.staging up -d
```

### 2. Run Migrations

```bash
docker-compose -f docker-compose.staging.yml exec api npm run db:migrate
```

### 3. Verify Deployment

```bash
curl -X GET http://localhost:3000/health
```

## Load Testing

### Run Load Tests

```bash
# Small load (10 concurrent)
npx ts-node src/scripts/load-test.ts --concurrency 10 --duration 60

# Medium load (50 concurrent)
npx ts-node src/scripts/load-test.ts --concurrency 50 --duration 300

# High load (100+ concurrent)
npx ts-node src/scripts/load-test.ts --concurrency 100 --duration 600
```

### Success Criteria

- Success Rate: >99%
- Avg Response Time: <500ms
- P95 Response Time: <1s
- P99 Response Time: <2s

## TSA Integration Testing

```bash
# Check TSA providers
curl -X GET http://localhost:3000/api/v1/certification/statistics

# Test timestamp (requires certificate)
curl -X POST http://localhost:3000/api/v1/certification/sign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"documentBuffer":"...","certificateId":"..."}'
```

## Production Deployment

### Pre-Deployment

- [ ] All staging tests passed
- [ ] Load tests successful (>99% success)
- [ ] Database backups configured
- [ ] Monitoring and alerting setup
- [ ] Rollback plan documented

### Deploy to Production

```bash
docker-compose -f docker-compose.yml --env-file .env.production up -d
docker-compose exec api npm run db:migrate
curl http://localhost:3000/health
```

## Health Monitoring

```bash
# Application health
curl http://localhost:3000/health

# System metrics
curl http://localhost:3000/api/v1/monitoring/metrics

# Database status
docker-compose exec postgres psql -U legal_user -d legal_automation -c "SELECT 1"

# Redis status
docker-compose exec redis redis-cli ping

# View logs
docker-compose logs -f api --tail=100
```

## Troubleshooting

### Database Issues
```bash
docker-compose ps postgres
docker-compose logs postgres
```

### Redis Issues
```bash
docker-compose ps redis
docker-compose exec redis redis-cli ping
```

### Application Issues
```bash
docker-compose logs -f api
```

### TSA Provider Issues
```bash
docker-compose logs api | grep -i "tsa"
curl -X GET http://localhost:3000/api/v1/certification/statistics
```

## Rollback

```bash
# Stop and restore
docker-compose down
pg_restore -U legal_user -d legal_automation < backups/legal_automation_latest.sql
docker-compose -f docker-compose.yml --env-file .env.production up -d
curl http://localhost:3000/health
```
