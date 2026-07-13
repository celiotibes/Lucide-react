# Arquitetura do Sistema de Gerenciamento de Aluguéis

## 1. Visão Geral

Sistema distribuído para sincronização de listagens de propriedades de aluguel entre múltiplas plataformas (Airbnb, Booking, VRBO) com gestão de preços dinâmicos, leads e análise de desempenho.

## 2. Componentes Principais

### 2.1 Frontend (React)

**Stack:**
- React 18.x
- TypeScript
- TailwindCSS
- Context API / Redux (state management)
- React Query (data fetching)
- Vite (bundler)

**Features:**
- Dashboard com estatísticas em tempo real
- CRUD de propriedades
- Sincronização de listagens
- Gestão de preços
- Visualização de leads
- Relatórios e analytics

**Performance:**
- Code splitting por rota
- Lazy loading de componentes
- Memoization com React.memo
- Virtual scrolling para listas grandes
- Service workers para PWA

### 2.2 API Backend (Node.js/Express)

**Stack:**
- Node.js 18.x
- TypeScript
- Express.js
- PostgreSQL 15
- Redis 7
- BullMQ (job queue)

**Estrutura:**
```
src/
├── routes/          # Definição de rotas e endpoints
├── controllers/     # Lógica de negócio
├── services/        # Serviços (sync, pricing, etc)
├── models/          # Schemas e tipos
├── middleware/      # Auth, validation, error handling
├── db/              # Pool, migrations
├── cache/           # Redis helpers
├── workers/         # BullMQ workers
├── integrations/    # APIs externas (Airbnb, Booking, etc)
├── shared/          # Utilidades comuns
└── health/          # Health checks
```

**Endpoints Principais:**
- GET /api/properties - Listar propriedades
- POST /api/properties - Criar propriedade
- GET /api/listings - Listar listagens sincronizadas
- POST /api/sync/trigger - Trigger de sincronização
- GET /api/leads - Listar leads
- GET /api/health - Health check

### 2.3 Banco de Dados (PostgreSQL)

**Schema Principal:**
```sql
-- Tabelas core
properties              -- Propriedades do usuário
listings                -- Listagens em plataformas
pricing                 -- Histórico de preços
leads                   -- Leads gerados
sync_history            -- Histórico de sincronizações
users                   -- Usuários da aplicação

-- Tabelas de relacionamento
user_integrations       -- Conexões com APIs externas
platform_credentials    -- Credenciais criptografadas
property_features       -- Amenidades da propriedade

-- Materialized Views
lead_funnel_stats       -- Estatísticas do funil
property_performance    -- Performance por propriedade
```

**Índices Estratégicos:**
```sql
CREATE INDEX idx_properties_user_id ON properties(user_id);
CREATE INDEX idx_listings_property_id ON listings(property_id);
CREATE INDEX idx_listings_platform ON listings(platform);
CREATE INDEX idx_listings_sync_status ON listings(sync_status);
CREATE INDEX idx_leads_property_id ON leads(property_id);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_pricing_property_id_date ON pricing(property_id, date);
CREATE INDEX idx_sync_history_user_id ON sync_history(user_id, created_at DESC);
```

**Replicação:**
- PostgreSQL primary + read replica
- Streaming replication
- Failover automático com pg_auto_failover

### 2.4 Cache (Redis)

**Uso:**
- Session storage (2h TTL)
- Cache de listagens (30min TTL)
- Cache de preços (15min TTL)
- Rate limiting buckets
- Real-time updates via pub/sub

**Estrutura de Keys:**
```
session:{session_id}              # Sessions
listings:property:{id}            # Cache de listagens
pricing:property:{id}:date        # Preços
rate:{ip}                         # Rate limiting
sync:queue:{queue_name}           # Job queue
notifications:user:{id}           # Real-time updates
```

### 2.5 Message Queue (BullMQ)

**Queues:**
- `sync-listings` - Sincronização com plataformas
- `update-pricing` - Atualização de preços
- `lead-management` - Processamento de leads
- `analytics` - Cálculo de métricas
- `notifications` - Envio de notificações
- `webhooks` - Entrega de webhooks

**Exemplo Worker:**
```typescript
// Sync listings worker
const syncQueue = new Queue('sync-listings', redisConnection);

syncQueue.process(async (job) => {
  const { propertyId, platform } = job.data;
  
  // Sincronizar listagem
  const result = await syncListingWithPlatform(propertyId, platform);
  
  // Atualizar status
  await updateSyncStatus(propertyId, result.status);
  
  return result;
});
```

## 3. Fluxos de Dados Principais

### 3.1 Sincronização de Listagens

```
1. Usuário clica "Sincronizar" no dashboard
   ↓
2. POST /api/sync/trigger
   ↓
3. Criar job em sync-listings queue
   ↓
4. Worker recebe job
   ├─ Fetch credenciais de user_integrations
   ├─ Chamar API da plataforma (Airbnb, Booking, etc)
   ├─ Parsear resposta
   ├─ Inserir/update em listings table
   ├─ Invalidar cache
   └─ Atualizar sync_history
   ↓
5. WebSocket notifica cliente com status
   ↓
6. Frontend atualiza UI em tempo real
```

### 3.2 Atualização de Preços Dinâmicos

```
1. Agenda dispara daily (1x por dia)
   ↓
2. Criar jobs em update-pricing queue para cada propriedade
   ↓
3. Worker recebe job
   ├─ Calcular preço recomendado
   │  ├─ Analisar demanda (leads últimos 7 dias)
   │  ├─ Comparar competidores (nearby properties)
   │  ├─ Considerar sazonalidade
   │  └─ Aplicar markup configurado
   ├─ Atualizar tabela pricing
   ├─ Sincronizar para plataformas
   └─ Cache + notificação
   ↓
4. Histórico preservado para analytics
```

### 3.3 Processamento de Leads

```
1. Webhook entra em /api/webhooks/leads
   ↓
2. Validar assinatura HMAC
   ↓
3. Criar job em lead-management queue
   ↓
4. Worker processa:
   ├─ Deduplica (mesma pessoa, mesma propriedade)
   ├─ Enriquece dados
   ├─ Classifica lead (A/B/C)
   ├─ Atribui agente (round-robin)
   ├─ Notifica via email/SMS
   └─ Log para analytics
   ↓
5. Dados disponíveis em dashboard/API
```

## 4. Padrões de Comunicação

### 4.1 Síncrono (REST API)

Operações que precisam resposta imediata:
- CRUD de recursos
- Queries de dados
- Health checks
- Autenticação

### 4.2 Assíncrono (Message Queue)

Operações que podem ser processadas depois:
- Sincronização com plataformas (timeout alto)
- Cálculo de preços (demanda computacional)
- Processamento de leads (histórico)
- Envio de notificações (retry automático)

### 4.3 Real-time (WebSocket)

Atualizações em tempo real:
- Status de sincronização
- Novos leads chegando
- Notificações de sistema
- Dashboard updates

## 5. Escalabilidade

### 5.1 Horizontal Scaling (API)

```
Load Balancer (ALB)
    ├─ API Pod 1 (3000)
    ├─ API Pod 2 (3000)
    └─ API Pod 3 (3000)
```

**Auto-scaling:**
- Min replicas: 3
- Max replicas: 10
- Trigger: CPU > 70% or Memory > 80%

### 5.2 Horizontal Scaling (Workers)

```
BullMQ Queue
    ├─ Worker 1 (concurrency: 10)
    ├─ Worker 2 (concurrency: 10)
    └─ Worker 3 (concurrency: 10)
```

**Queue Management:**
- Priority jobs (leads > sync > analytics)
- Retries exponenciais (1s, 2s, 4s, 8s, 16s)
- Dead letter queue para failed jobs
- Monitoring de queue size

### 5.3 Database Scaling

**Read Replicas:**
- Queries de leitura (analytics, reports) → replica
- Writes → primary
- Replication lag < 100ms

**Sharding (Futuro):**
- Shard por user_id para tables grandes
- Consistent hashing para distribuição

## 6. Segurança

### 6.1 Autenticação
- JWT tokens (24h expiry)
- Refresh tokens (7 days)
- MFA opcional

### 6.2 Autorização
- RBAC (admin, property_manager, support_agent, viewer)
- Row-level security (usuários só acessam seus dados)
- Audit logging de acessos

### 6.3 Criptografia
- TLS 1.2+ para transmissão
- AES-256-GCM para dados em repouso (API keys)
- bcrypt para senhas (salt rounds: 10)

### 6.4 API Security
- Rate limiting: 100 req/min por IP
- CORS restritivo
- CSRF protection
- XSS prevention (input sanitization)
- SQL injection protection (parameterized queries)

## 7. Observabilidade

### 7.1 Logging

**Estruturado (JSON):**
```json
{
  "timestamp": "2024-01-15T10:30:45Z",
  "level": "info",
  "service": "api",
  "message": "property_synced",
  "propertyId": "123",
  "platform": "airbnb",
  "duration_ms": 1250,
  "status": "success"
}
```

**Agregação:** ELK Stack ou Grafana Loki

### 7.2 Metrics (Prometheus)

```
# API
http_requests_total{method="GET",endpoint="/api/listings",status="200"}
http_request_duration_seconds{quantile="0.95"}
active_connections{type="database"}

# Database
pg_stat_statements_total{query="SELECT * FROM listings"}
db_query_duration_seconds{quantile="0.99"}

# Cache
redis_keys_total
redis_commands_processed_total
cache_hits_total

# Workers
bullmq_queue_size{queue="sync-listings"}
bullmq_job_duration_seconds{quantile="0.95"}
```

### 7.3 Tracing (Jaeger/Zipkin)

- Trace distribuído entre serviços
- Identify bottlenecks
- Latency analysis

### 7.4 Alertas

**Críticos (página on-call):**
- API downtime (up == 0)
- Error rate > 5%
- Database unreachable
- Redis memory > 85%

**Warnings:**
- Latency P95 > 500ms
- Error rate > 1%
- Queue backlog > 1000 jobs

## 8. Disaster Recovery

### 8.1 RTO/RPO

| Component | RTO | RPO |
|-----------|-----|-----|
| API | 5 min | 0 (stateless) |
| Database | 15 min | 5 min |
| Redis | 10 min | 0 (rebuild) |
| S3/GCS | 1 hour | 1 day |

### 8.2 Backup Strategy

**Database:**
- Diário via pg_basebackup
- Snapshot de volume EBS/GCS
- Armazenado em região diferente
- Restore test mensal

**Application:**
- Code sempre no git
- Docker images no registry
- IaC (Terraform/CloudFormation) versionado

### 8.3 Failover

**Database:**
- Active-passive com pg_auto_failover
- Automatic detection of primary failure
- Replica promoted in < 30s

**API:**
- Stateless design
- Multi-region deployment
- DNS failover
- Load balancer health checks

## 9. Deployment Pipeline

```
commit push
  ↓
GitHub Actions CI
  ├─ Lint + Format
  ├─ Unit tests
  ├─ Integration tests
  ├─ Security scan
  ├─ Performance test
  └─ Build Docker image
  ↓
Push to ECR/Docker Hub
  ↓
Deploy to Staging (automatic)
  ├─ Run smoke tests
  ├─ Performance validation
  └─ Manual approval
  ↓
Deploy to Production (Canary)
  ├─ 5% traffic (5 min)
  ├─ 25% traffic (10 min)
  ├─ 50% traffic (10 min)
  └─ 100% traffic (final)
  ↓
Monitoring (24h)
  ├─ Error rate < 1%
  ├─ Latency P95 < 500ms
  └─ No resource exhaustion
```

## 10. Stack Tecnológico Completo

| Componente | Tecnologia | Versão |
|------------|-----------|---------|
| Runtime | Node.js | 18.x LTS |
| Language | TypeScript | 5.x |
| Framework | Express.js | 4.x |
| Database | PostgreSQL | 15 |
| Cache | Redis | 7 |
| Queue | BullMQ | 3.x |
| Containerization | Docker | 20.x |
| Orchestration | Kubernetes | 1.25+ |
| Monitoring | Prometheus | 2.x |
| Visualization | Grafana | 9.x |
| Logging | Loki/ELK | Latest |
| Ingress | Nginx | 1.x |
| CI/CD | GitHub Actions | Native |
| Infrastructure | AWS/GCP/Azure | Latest |

## Referências

- Node.js Best Practices: https://github.com/goldbergyoni/nodebestpractices
- PostgreSQL Documentation: https://www.postgresql.org/docs/
- Kubernetes Best Practices: https://kubernetes.io/docs/concepts/
- Microservices Patterns: https://microservices.io/patterns/index.html

