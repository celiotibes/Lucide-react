# 🚀 Production Deployment Guide - Sistema de Gerenciamento de Aluguéis

Guia completo e detalhado para deploy seguro em produção.

---

## 📋 Sumário

1. [Pré-requisitos](#pré-requisitos)
2. [Ambiente de Produção](#ambiente-de-produção)
3. [Estratégias de Deployment](#estratégias-de-deployment)
4. [Procedimento de Deploy](#procedimento-de-deploy)
5. [Health Checks & Validação](#health-checks--validação)
6. [Monitoramento Pós-Deploy](#monitoramento-pós-deploy)
7. [Troubleshooting](#troubleshooting)
8. [Disaster Recovery](#disaster-recovery)

---

## ✅ Pré-requisitos

### Infraestrutura
- [ ] Servidores de produção configurados (Linux 20.04+)
- [ ] PostgreSQL 14+ instalado e configurado
- [ ] Redis 6+ instalado e configurado
- [ ] Docker 20+ e docker-compose
- [ ] Nginx configurado como reverse proxy
- [ ] SSL/TLS certificados válidos
- [ ] Backups automáticos configurados

### Acesso & Permissões
- [ ] SSH keys configuradas para todos os servidores
- [ ] Acesso ao container registry (Docker)
- [ ] Acesso a secrets management (AWS Secrets Manager, Vault)
- [ ] Permissões de database (criar users, tables)
- [ ] Acesso a logs centralizados (CloudWatch, ELK)
- [ ] Acesso a monitoring (Prometheus, Grafana)

### Configurações
- [ ] `.env.production` com todas as variáveis
- [ ] Database credentials em secrets
- [ ] API keys para integrações externas
- [ ] TLS certificates e keys
- [ ] SSH keys para internal services
- [ ] Alerting configurado (PagerDuty, Slack)

### Validações Pré-Deployment
- [ ] Performance tests passed (baseline met)
- [ ] Security scan clean (SAST, dependency audit)
- [ ] All integration tests passed
- [ ] Database migrations tested
- [ ] Staging deploy successful
- [ ] Rollback plan documented

---

## 🏢 Ambiente de Produção

### Arquitetura Recomendada

```
┌─────────────────────────────────────────────────┐
│         CloudFront / Global CDN                 │
└────────────────┬────────────────────────────────┘
                 │
┌─────────────────────────────────────────────────┐
│         Application Load Balancer               │
│  (Traffic distribution, SSL termination)        │
└────────────────┬────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼────────┐  ┌────▼───────────┐
│  API Pod 1     │  │  API Pod 2     │  (Kubernetes or Docker Swarm)
│  (Node.js)     │  │  (Node.js)     │  (Min 2 replicas)
│  :3000         │  │  :3000         │
└───────┬────────┘  └────┬───────────┘
        │                │
        └────────┬───────┘
                 │
    ┌────────────┴─────────────────────────────┐
    │                                          │
    │  PostgreSQL Primary + Replica            │
    │  (High Availability, backups)            │
    │                                          │
    │  Redis Cluster                           │
    │  (Session, Cache, Job Queue)             │
    │                                          │
    └──────────────────────────────────────────┘
```

### Especificações Mínimas de Servidor

**API Server** (2+ instances)
- CPU: 4 cores (2 para app + 2 overhead)
- RAM: 8GB (Node.js: 4GB heap + system)
- Storage: 50GB SSD (logs, temp)
- Network: Gigabit connection

**Database Server** (1 primary + 1 replica)
- CPU: 8 cores (high performance I/O)
- RAM: 32GB+ (shared_buffers: 8GB, cache: 24GB)
- Storage: 500GB+ SSD (fast queries)
- Network: Dedicated network for replication

**Redis Server**
- CPU: 2 cores
- RAM: 8GB+ (for caching + queue)
- Storage: 20GB SSD
- Network: Dedicated connection to API servers

**Backup Server**
- Automático diário via AWS S3 / GCS
- Retenção: 30 dias

---

## 📦 Estratégias de Deployment

### 1. Blue-Green Deployment (Recomendado)

```
            ┌──────────────────┐
            │  Load Balancer   │
            └────────┬─────────┘
                     │
                     ├─ 100% → BLUE (v1.2.3)
                     │
                     └─ 0% → GREEN (v1.3.0) [waiting]

Após validação → Flip traffic:
                     │
                     ├─ 0% → BLUE (v1.2.3) [rollback ready]
                     │
                     └─ 100% → GREEN (v1.3.0) [live]
```

**Vantagens**:
- ✅ Zero downtime
- ✅ Instant rollback
- ✅ Full environment testing

**Requisitos**:
- Dupla de servidores (caro)
- Sincronização de estado
- Database migrations compatíveis

### 2. Canary Deployment (Mais seguro)

```
Fase 1 (5 min):  5% traffic → v1.3.0  |  95% traffic → v1.2.3
Fase 2 (10 min): 25% traffic → v1.3.0 |  75% traffic → v1.2.3
Fase 3 (10 min): 50% traffic → v1.3.0 |  50% traffic → v1.2.3
Fase 4 (10 min): 100% traffic → v1.3.0

Se error rate > 2% em qualquer fase → Automatic rollback
```

**Vantagens**:
- ✅ Risks são gradualmente expostos
- ✅ Pode monitorar em paralelo
- ✅ Rollback automático

**Requisitos**:
- Load balancer com canary support
- Automated health checks
- Alerting sensitive

### 3. Rolling Deployment (Simples)

```
Pod 1: v1.2.3 → v1.3.0 (restart, 2-3 min downtime)
       Wait for health check
Pod 2: v1.2.3 → v1.3.0
       Wait for health check
Pod 3: v1.2.3 → v1.3.0
```

**Vantagens**:
- ✅ Simples de implementar
- ✅ Economia de recursos

**Desvantagens**:
- ❌ Alguns usuários afetados
- ❌ Rollback complexo

---

## 🔄 Procedimento de Deploy

### Fase 1: Preparação (2 horas antes)

```bash
# 1. Notificar stakeholders
# Slack: @channel Deploy iniciando em 2 horas para v1.3.0

# 2. Verificar sistemas
./scripts/pre-deploy-check.sh

# 3. Criar backups
aws rds create-db-snapshot \
  --db-instance-identifier rental-sync-prod \
  --db-snapshot-identifier rental-sync-prod-v1.3.0-backup

# 4. Preparar environment
export DEPLOYMENT_VERSION="v1.3.0"
export DEPLOYMENT_STRATEGY="canary"
export DEPLOYMENT_MAX_UNAVAILABLE="10%"
export HEALTH_CHECK_TIMEOUT="300s"
```

### Fase 2: Deploy Staging (1 hora antes)

```bash
# 1. Pull latest code
git checkout v1.3.0
git verify-commit v1.3.0  # Verify GPG signature

# 2. Build Docker image
docker build -t rental-sync:v1.3.0 .
docker tag rental-sync:v1.3.0 \
  gcr.io/my-project/rental-sync:v1.3.0

# 3. Push to registry
docker push gcr.io/my-project/rental-sync:v1.3.0

# 4. Deploy to staging first
helm upgrade rental-sync-staging \
  ./helm \
  --values helm/values-staging.yaml \
  --set image.tag=v1.3.0 \
  --namespace staging

# 5. Run smoke tests on staging
npm run test:smoke -- --env=staging
```

### Fase 3: Deploy Production - Canary

```bash
# 1. Deploy with 5% traffic to new version
helm upgrade rental-sync-prod \
  ./helm \
  --values helm/values-prod.yaml \
  --set image.tag=v1.3.0 \
  --set canarySteps="5,25,50,100" \
  --set canaryInterval="5m" \
  --namespace production

# 2. Monitor canary (Phase 1)
watch 'kubectl get pods -n production -l app=rental-sync'

# Métricas para monitorar:
# - Error rate (target: < 2%)
# - Latência P95 (target: < 500ms)
# - CPU/Memory (target: stable)
```

### Fase 4: Validação Contínua

```bash
# 1. Phase 1 (5% traffic) - 5 min
echo "Canary Phase 1: 5% traffic"
sleep 300
./scripts/check-metrics.sh \
  --error-rate-threshold=0.02 \
  --latency-threshold=500

# 2. Phase 2 (25% traffic) - 10 min
echo "Canary Phase 2: 25% traffic"
sleep 600
./scripts/check-metrics.sh

# 3. Phase 3 (50% traffic) - 10 min
echo "Canary Phase 3: 50% traffic"
sleep 600
./scripts/check-metrics.sh

# 4. Phase 4 (100% traffic) - Final
echo "Canary Phase 4: 100% traffic"
./scripts/check-metrics.sh
```

### Fase 5: Pós-Deploy (1 hora depois)

```bash
# 1. Health checks
curl -s https://api.example.com/api/health | jq .

# 2. Database connectivity
curl -s https://api.example.com/api/properties?limit=1 \
  -H "Authorization: Bearer $TOKEN" | jq .

# 3. External integrations
curl -s https://api.example.com/api/status/integrations | jq .

# 4. Performance baseline
npm run test:perf:load -- --vus=10 --duration=1m

# 5. Error tracking
# ✅ No critical errors in Sentry/DataDog
# ✅ Error rate < 0.5%
# ✅ No new error patterns

# 6. Notify success
./scripts/notify-slack.sh "✅ Deployment v1.3.0 successful"
```

---

## 🏥 Health Checks & Validação

### Liveness Check

```bash
# GET /api/health
# Retorna 200 se serviço está UP

curl -s https://api.example.com/api/health
# {
#   "status": "ok",
#   "uptime": 3600,
#   "timestamp": "2024-01-20T15:30:00Z"
# }
```

### Readiness Check

```bash
# GET /api/health/ready
# Retorna 200 se serviço está PRONTO para tráfego

curl -s https://api.example.com/api/health/ready
# {
#   "ready": true,
#   "database": "connected",
#   "redis": "connected",
#   "message_queue": "ready"
# }
```

### Deep Health Check

```bash
# Script: scripts/deep-health-check.sh

check_api() {
  curl -s -o /dev/null -w "%{http_code}" https://api.example.com/api/health
}

check_database() {
  psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1
  return $?
}

check_redis() {
  redis-cli -h $REDIS_HOST -p $REDIS_PORT PING | grep -q PONG
  return $?
}

check_external_apis() {
  # Airbnb API
  curl -s -I $AIRBNB_HEALTH_ENDPOINT | grep -q "200\|302"
  # Booking API
  curl -s -I $BOOKING_HEALTH_ENDPOINT | grep -q "200\|302"
}

# Execute all checks
check_api && echo "✅ API OK" || echo "❌ API FAILED"
check_database && echo "✅ Database OK" || echo "❌ Database FAILED"
check_redis && echo "✅ Redis OK" || echo "❌ Redis FAILED"
check_external_apis && echo "✅ External APIs OK" || echo "❌ APIs FAILED"
```

### Smoke Tests

```typescript
// test/smoke.test.ts

describe('Smoke Tests - Production', () => {
  it('should list properties', async () => {
    const res = await fetch(`${API_URL}/properties`);
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('properties');
  });

  it('should get property detail', async () => {
    const res = await fetch(`${API_URL}/properties/test-property-id`);
    expect(res.status).toBe(200);
  });

  it('should authenticate user', async () => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('token');
  });

  it('should sync listings', async () => {
    const res = await fetch(`${API_URL}/listings/sync`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect([200, 202]).toContain(res.status);
  });
});
```

---

## 📊 Monitoramento Pós-Deploy

### Métricas Críticas (primeiro 1 hora)

```
✅ Error Rate: < 0.5%
✅ P95 Latência: < 500ms
✅ P99 Latência: < 1000ms
✅ Throughput: > 100 req/s
✅ CPU: < 70%
✅ Memory: Stable
✅ Database Connections: < 80% utilized
✅ Redis Memory: < 80% utilized
```

### Dashboard para Monitorar

```
1. Overview Dashboard
   - Service status (green/red)
   - Error rate graph
   - Request latency graph
   - Throughput graph

2. Database Dashboard
   - Active connections
   - Slow queries
   - Replication lag
   - Disk usage

3. Application Dashboard
   - Top errors
   - Slow endpoints
   - Memory usage
   - GC pauses

4. Business Metrics
   - Active users
   - Successful listings
   - Sync operations
   - Leads created
```

### Alertas Ativados

Todos os alertas do `alerts.yaml` devem estar ativos e enviando para Slack/PagerDuty.

```bash
# Verificar alertas ativos
curl -s http://prometheus:9090/api/v1/rules | jq '.data.groups[] | .rules[] | select(.state=="firing")'

# Visualizar em AlertManager
http://alertmanager:9093
```

### Log Aggregation

```bash
# CloudWatch (AWS)
aws logs tail /aws/ecs/rental-sync-prod --follow

# ELK Stack
curl -s "http://elasticsearch:9200/logs-*/_search?q=severity:error" | jq '.hits.hits[]._source'

# Datadog
# Dashboard: https://app.datadoghq.com/deployment/rental-sync/v1.3.0
```

---

## 🔧 Troubleshooting

### Problema: High Error Rate (> 5%)

```bash
# 1. Verificar logs
tail -f logs/app.log | grep ERROR

# 2. Verificar database
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT * FROM pg_stat_activity WHERE state != 'idle';"

# 3. Verificar Redis
redis-cli INFO stats | grep -E "connections|commands"

# 4. Verificar recursos
top -b -n 1 | head -20  # CPU/Memory
df -h | grep -E "^/dev"  # Disk

# 5. Rollback se crítico
git checkout v1.2.3
npm run deploy:production
```

### Problema: High Latency (P95 > 1000ms)

```bash
# 1. Verificar queries lentas
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT query, mean_exec_time FROM pg_stat_statements \
      WHERE mean_exec_time > 100 \
      ORDER BY mean_exec_time DESC LIMIT 10;"

# 2. Verificar índices
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT * FROM pg_indexes WHERE tablename IN ('properties', 'listings');"

# 3. Aplicar índices
npm run migrate:v1.3.0 -- --tag=performance-indexes

# 4. Reiniciar conexões
npm run restart:api-pods

# 5. Monitor improvement
./scripts/check-metrics.sh --latency-threshold=500
```

### Problema: Database Connection Pool Exhausted

```bash
# 1. Verificar conexões
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# 2. Aumentar pool size
# .env.production: DATABASE_POOL_SIZE=50

# 3. Reiniciar pods
kubectl rollout restart deployment/rental-sync -n production

# 4. Monitorar
watch 'psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT count(*) FROM pg_stat_activity;"'
```

### Problema: Memory Leak (Crescimento contínuo)

```bash
# 1. Verificar heap
node --inspect:0.0.0.0:9229 index.js

# 2. Chrome DevTools
chrome://inspect

# 3. Gerar heap dump
kill -USR2 $PID
# Heap dump salvo em heap-*.heapsnapshot

# 4. Analisar
# Usar Chrome DevTools para analisar retained objects

# 5. Rollback se necessário
git checkout v1.2.3
npm run deploy:production
```

---

## 🆘 Disaster Recovery

### Backup Strategy

```bash
# Database backup - diário
0 2 * * * /scripts/backup-database.sh

# Configuration backup - toda mudança
git add .env.production
git commit -m "backup: prod config"

# Retenção
- Daily backups: 7 dias
- Weekly backups: 4 semanas
- Monthly backups: 12 meses
```

### Recovery Procedures

#### Database Recovery

```bash
# 1. Listar backups
aws rds describe-db-snapshots \
  --db-instance-identifier rental-sync-prod

# 2. Restaurar snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier rental-sync-prod-restore \
  --db-snapshot-identifier rental-sync-prod-v1.3.0-backup

# 3. Validar conexão
psql -h rental-sync-prod-restore.cxxxxxx.us-east-1.rds.amazonaws.com \
  -U $DB_USER -d $DB_NAME -c "SELECT COUNT(*) FROM properties;"

# 4. Failover
# Alterar DNS para novo host

# 5. Verificar integridade
npm run test:database:integrity
```

#### Application Recovery

```bash
# 1. Rollback automático
git checkout v1.2.3
npm run deploy:production

# 2. Verificar saúde
./scripts/deep-health-check.sh

# 3. Monitorar
./scripts/check-metrics.sh --all

# 4. Se ainda com problemas, isolate afected region
# Load balancer remove instance da pool
# Investigate offline
# Reintroduz após fix
```

#### Data Recovery

```bash
# 1. Verificar logs de audit
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT * FROM audit_log WHERE created_at > NOW() - interval '1 day' \
      ORDER BY created_at DESC LIMIT 100;"

# 2. Restaurar tabela específica
pg_restore --data-only --table=properties \
  -U $DB_USER -d $DB_NAME backup.sql

# 3. Validar integridade
npm run test:database:integrity -- --tables=properties,listings
```

---

## 📝 Deployment Report Template

```markdown
# Deployment Report - v1.3.0

**Date**: 2024-01-20  
**Time**: 15:00 - 15:45 UTC  
**Deployed By**: @devops-team  
**Status**: ✅ SUCCESSFUL

## Summary
- Deployment method: Canary (5% → 25% → 50% → 100%)
- Duration: 45 minutes
- Downtime: 0 minutes
- Issues: None

## Pre-Deployment
- ✅ Performance baseline met
- ✅ Security scan clean
- ✅ Staging validation passed
- ✅ Database migrations tested

## Deployment
- ✅ Docker build successful
- ✅ Canary Phase 1: OK
- ✅ Canary Phase 2: OK
- ✅ Canary Phase 3: OK
- ✅ Canary Phase 4: OK

## Post-Deployment
- ✅ Error rate: 0.1% (target: < 0.5%)
- ✅ P95 latency: 240ms (target: < 500ms)
- ✅ P99 latency: 420ms (target: < 1000ms)
- ✅ Throughput: 250 req/s (target: > 100 req/s)
- ✅ Health checks: All passing
- ✅ Database: Healthy
- ✅ Redis: Healthy

## Issues & Resolutions
- None

## Follow-up Actions
- [ ] Monitor for 24 hours
- [ ] Collect user feedback
- [ ] Update documentation
- [ ] Archive logs
```

---

**Última Atualização**: 2024-01-15  
**Status**: ✅ Pronto para Produção
