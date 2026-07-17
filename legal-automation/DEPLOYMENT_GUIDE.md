# Production Deployment Guide

## Legal Automation Tool - eProc & Projudi Integration

Complete guide for deploying the Legal Automation Tool to production environments.

---

## Table of Contents

1. [Pre-deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Docker Deployment](#docker-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Security Configuration](#security-configuration)
7. [Monitoring & Logging](#monitoring--logging)
8. [Scaling & Performance](#scaling--performance)
9. [Backup & Disaster Recovery](#backup--disaster-recovery)
10. [Troubleshooting](#troubleshooting)

---

## Pre-deployment Checklist

### Code Quality & Testing
- [ ] All tests pass: `npm run test`
- [ ] TypeScript compilation succeeds: `npm run build`
- [ ] No ESLint errors: `npm run lint`
- [ ] Code coverage above 80%
- [ ] No security vulnerabilities: `npm audit`

### Dependencies
- [ ] Node.js 20.x installed
- [ ] PostgreSQL 15+ available
- [ ] Redis 7+ available
- [ ] Elasticsearch 8+ available (optional but recommended)

### Credentials & Secrets
- [ ] All API keys configured in environment
- [ ] Database credentials secured
- [ ] JWT secrets configured
- [ ] TLS certificates prepared
- [ ] Email service credentials ready
- [ ] SMS provider credentials ready (if used)
- [ ] Payment provider credentials ready (if used)

### Infrastructure
- [ ] DNS records updated
- [ ] Load balancer configured
- [ ] SSL/TLS certificates installed
- [ ] Firewalls configured
- [ ] VPN access ready
- [ ] Monitoring dashboards created
- [ ] Alert rules configured

---

## Environment Configuration

### Required Environment Variables

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/legal_automation
DATABASE_POOL_SIZE=20
DATABASE_IDLE_TIMEOUT=10000

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=secure_password
REDIS_DB=0

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=secure_password

# JWT & Security
JWT_SECRET=your_jwt_secret_key_min_32_chars
JWT_EXPIRY=24h
CORS_ORIGIN=https://yourdomain.com

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=noreply@yourdomain.com

# SMS (Twilio)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890

# Payment (Stripe)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLIC_KEY=pk_live_...

# Projudi Integration
PROJUDI_WSDL_URL=https://projudi.tjsc.jus.br/wsdl
PROJUDI_USERNAME=username
PROJUDI_PASSWORD=password

# Backup
BACKUP_DIR=/app/data/backups
BACKUP_RETENTION_DAYS=30
BACKUP_SCHEDULE=0 2 * * *

# File Upload
UPLOAD_DIR=/app/data/uploads
MAX_FILE_SIZE=10485760

# Logging
LOG_DIR=/app/logs
LOG_FORMAT=json
```

### Creating Environment Files

```bash
# Copy and customize for your environment
cp .env.example .env.production

# Edit with production values
vi .env.production

# Secure permissions
chmod 600 .env.production
```

---

## Database Setup

### Initial Setup

```bash
# Create database
createdb legal_automation

# Run migrations
npm run migrate

# Seed initial data (if needed)
npm run seed
```

### Connection String Format

```
postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
```

### Connection Pooling

For production, configure connection pooling:

```javascript
// Environment variables
DATABASE_POOL_SIZE=20
DATABASE_IDLE_TIMEOUT=10000
DATABASE_STATEMENT_TIMEOUT=30000
```

### Backup Strategy

```bash
# Daily automated backups at 2 AM
BACKUP_SCHEDULE="0 2 * * *"

# Full backup every Sunday
BACKUP_RETENTION_DAYS=30

# Backup verification
npm run verify-backups
```

---

## Docker Deployment

### Building Docker Image

```bash
# Build for production
docker build -t legal-automation:latest \
  --build-arg NODE_ENV=production \
  .

# Tag for registry
docker tag legal-automation:latest \
  registry.yourdomain.com/legal-automation:latest

# Push to registry
docker push registry.yourdomain.com/legal-automation:latest
```

### Running Container

```bash
# Basic run
docker run -d \
  --name legal-automation \
  --env-file .env.production \
  -p 3000:3000 \
  -v /data/uploads:/app/data/uploads \
  -v /data/backups:/app/data/backups \
  -v /logs:/app/logs \
  --restart unless-stopped \
  registry.yourdomain.com/legal-automation:latest

# With resource limits
docker run -d \
  --name legal-automation \
  --memory=4g \
  --cpus=2 \
  --env-file .env.production \
  -p 3000:3000 \
  -v /data/uploads:/app/data/uploads \
  -v /data/backups:/app/data/backups \
  -v /logs:/app/logs \
  --restart unless-stopped \
  registry.yourdomain.com/legal-automation:latest

# Health check
curl http://localhost:3000/health
```

### Docker Compose

```bash
# Start all services
docker-compose -f docker-compose.staging.yml up -d

# View logs
docker-compose logs -f legal-automation

# Scale services
docker-compose up -d --scale api=3

# Stop services
docker-compose down
```

---

## Kubernetes Deployment

### Deployment Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: legal-automation
  namespace: production
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: legal-automation
  template:
    metadata:
      labels:
        app: legal-automation
    spec:
      containers:
      - name: legal-automation
        image: registry.yourdomain.com/legal-automation:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: legal-automation-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

### Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace production

# Create secrets
kubectl create secret generic legal-automation-secrets \
  --from-file=.env.production \
  -n production

# Apply deployment
kubectl apply -f k8s/deployment.yaml

# Check status
kubectl get pods -n production

# View logs
kubectl logs -f deployment/legal-automation -n production

# Scale replicas
kubectl scale deployment legal-automation --replicas=5 -n production
```

---

## Security Configuration

### TLS/SSL

```bash
# Install certificate
CERT_DIR=/etc/ssl/certs
sudo cp your_domain.crt $CERT_DIR/
sudo cp your_domain.key $CERT_DIR/
sudo chmod 600 $CERT_DIR/your_domain.key

# Configure in application
TLS_CERT_PATH=/etc/ssl/certs/your_domain.crt
TLS_KEY_PATH=/etc/ssl/certs/your_domain.key
```

### Rate Limiting

```javascript
// Environment configuration
RATE_LIMIT_WINDOW_MS=900000 // 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_ENABLED=true
```

### CORS Policy

```javascript
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
CORS_CREDENTIALS=true
CORS_MAX_AGE=86400
```

### Security Headers

Configured via Helmet middleware:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security: max-age=31536000
- Content-Security-Policy configured

---

## Monitoring & Logging

### Application Logging

```bash
# Log directory
LOG_DIR=/app/logs

# Log levels
LOG_LEVEL=info (production)
LOG_LEVEL=debug (staging)

# Log format
LOG_FORMAT=json (for centralized logging)

# Log rotation (configured via Winston)
- Daily rotation
- Retention: 14 days
- Max size: 100MB
```

### Centralized Logging

```bash
# Send logs to ELK Stack / CloudWatch / DataDog
LOG_TRANSPORT=elasticsearch
ELASTICSEARCH_URL=https://elasticsearch.yourdomain.com

# Or CloudWatch
LOG_TRANSPORT=cloudwatch
AWS_REGION=us-east-1
AWS_LOG_GROUP=/aws/ecs/legal-automation
```

### Metrics & Monitoring

```bash
# Prometheus metrics
METRICS_ENABLED=true
METRICS_PORT=9090

# DataDog APM
DD_TRACE_ENABLED=true
DD_API_KEY=your_api_key
```

### Health Checks

```bash
# Application health endpoint
GET /health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "database": "connected",
  "redis": "connected",
  "services": {
    "elasticsearch": "connected",
    "projudi": "connected"
  }
}
```

---

## Scaling & Performance

### Horizontal Scaling

```bash
# Docker: Scale with load balancer
docker-compose up -d --scale api=3

# Kubernetes: Auto-scaling
kubectl autoscale deployment legal-automation \
  --min=3 --max=10 --cpu-percent=70 -n production
```

### Caching Strategy

- Redis cache for compliance metrics (1 hour TTL)
- In-memory cache for high-frequency queries
- Cache warming during off-peak hours
- Cache invalidation on data mutations

### Database Optimization

```sql
-- Create indexes for common queries
CREATE INDEX idx_case_status ON cases(status);
CREATE INDEX idx_case_tribunal ON cases(tribunal);
CREATE INDEX idx_case_filing_date ON cases(filing_date);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM cases WHERE status = 'active';
```

### API Rate Limiting

```javascript
// Per-user rate limits
RATE_LIMIT_TIER_FREE=10_requests/minute
RATE_LIMIT_TIER_PRO=100_requests/minute
RATE_LIMIT_TIER_ENTERPRISE=unlimited
```

---

## Backup & Disaster Recovery

### Backup Types

```bash
# Full backup (daily at 2 AM)
0 2 * * * /app/scripts/backup-full.sh

# Incremental backup (every 6 hours)
0 */6 * * * /app/scripts/backup-incremental.sh

# Database backup (PostgreSQL)
pg_dump legal_automation | gzip > backup-$(date +%Y%m%d).sql.gz

# Redis backup
redis-cli BGSAVE
```

### Retention Policy

- Daily backups: 7 days
- Weekly backups: 4 weeks
- Monthly backups: 12 months
- Test restore procedure monthly

### Disaster Recovery

```bash
# Restore database
gunzip < backup-20240115.sql.gz | psql legal_automation

# Restore Redis
redis-cli --pipe < dump.rdb

# Restore application data
tar xzf backup-data-20240115.tar.gz -C /app/data/
```

### Recovery Time Objectives (RTO)

- Database: < 15 minutes
- Full system: < 30 minutes
- Data loss: < 1 hour (maximum acceptable loss)

---

## Troubleshooting

### Common Issues

#### Application won't start

```bash
# Check logs
docker logs legal-automation

# Verify environment variables
docker exec legal-automation env | grep DATABASE_URL

# Test database connection
docker exec legal-automation npm run test:db
```

#### High memory usage

```bash
# Check process memory
docker stats legal-automation

# Analyze heap dump
node --inspect=0.0.0.0:9229 dist/index.js

# Clear cache
curl -X POST http://localhost:3000/api/v1/cache/clear
```

#### Database connection issues

```bash
# Test PostgreSQL connection
psql postgresql://user:password@host:5432/dbname

# Check connection pool
SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;

# Increase pool size if needed
DATABASE_POOL_SIZE=30
```

#### Redis connectivity

```bash
# Test Redis connection
redis-cli ping

# Check memory usage
redis-cli INFO memory

# Monitor operations
redis-cli MONITOR
```

#### Performance degradation

```bash
# Profile application
npm run profile

# Check query performance
EXPLAIN ANALYZE SELECT ...

# Monitor system resources
top -p $(pgrep -f 'node dist/index.js')
```

### Support & Documentation

- Documentation: https://docs.yourdomain.com
- Issue Tracker: https://github.com/yourdomain/legal-automation/issues
- Status Page: https://status.yourdomain.com
- Contact: devops@yourdomain.com

---

## Production Checklist

Before going live:

- [ ] All secrets configured
- [ ] Database backups working
- [ ] Monitoring dashboards active
- [ ] Alert rules configured
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] DNS configured
- [ ] SSL certificates installed
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Logging centralized
- [ ] Disaster recovery plan documented
- [ ] Team trained on operations
- [ ] Rollback procedure prepared
- [ ] 24/7 support on call

---

## Maintenance Schedule

### Daily
- Monitor application logs
- Check error rates
- Verify backups completed
- Monitor database size

### Weekly
- Review performance metrics
- Check security logs
- Verify all health checks pass
- Test backup restoration

### Monthly
- Update dependencies
- Security patch review
- Capacity planning review
- Disaster recovery drill

### Quarterly
- Full security audit
- Performance optimization review
- Database maintenance (VACUUM ANALYZE)
- Infrastructure review

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
**Maintained By**: DevOps Team
