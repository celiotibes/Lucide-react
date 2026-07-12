# Baseline de Performance - Documentação Completa

## 🎯 Objetivo

Estabelecer métricas de performance esperadas para o sistema de gerenciamento de aluguéis, identificar gargalos e otimizar operações críticas.

---

## 📊 Métricas de Performance Esperadas

### Latência por Tipo de Operação

#### Properties (Propriedades)
| Operação | P50 | P95 | P99 | Objetivo |
|----------|-----|-----|-----|----------|
| List (listar) | 100ms | 500ms | 800ms | ✅ |
| Get Detail | 80ms | 300ms | 500ms | ✅ |
| Get Dashboard | 400ms | 1000ms | 1500ms | ⚠️ |
| Update | 120ms | 400ms | 700ms | ✅ |
| Create | 150ms | 500ms | 800ms | ✅ |

#### Listings (Anúncios)
| Operação | P50 | P95 | P99 | Objetivo |
|----------|-----|-----|-----|----------|
| List | 110ms | 500ms | 800ms | ✅ |
| Get Detail | 85ms | 300ms | 500ms | ✅ |
| Get Performance | 90ms | 300ms | 500ms | ✅ |
| Update Content | 120ms | 500ms | 800ms | ✅ |
| Update Price | 110ms | 400ms | 700ms | ✅ |
| Publish | 100ms | 400ms | 650ms | ✅ |

#### Pricing (Preços)
| Operação | P50 | P95 | P99 | Objetivo |
|----------|-----|-----|-----|----------|
| Analyze | 500ms | 1000ms | 1500ms | ⚠️ |
| Competitive | 750ms | 1500ms | 2000ms | ⚠️ |
| Calculate | 200ms | 600ms | 1000ms | ✅ |
| Update | 110ms | 500ms | 800ms | ✅ |

#### Leads (Leads)
| Operação | P50 | P95 | P99 | Objetivo |
|----------|-----|-----|-----|----------|
| List | 120ms | 500ms | 800ms | ✅ |
| Funnel Stats | 150ms | 500ms | 800ms | ✅ |
| Update Stage | 110ms | 400ms | 700ms | ✅ |
| Create | 140ms | 500ms | 800ms | ✅ |

#### Sync
| Operação | P50 | P95 | P99 | Objetivo |
|----------|-----|-----|-----|----------|
| Get Status | 70ms | 300ms | 500ms | ✅ |
| Trigger Sync | 200ms | 600ms | 1000ms | ✅ |

---

## 🧪 Tipos de Testes

### 1. Load Test
**Objetivo**: Validar performance sob carga normal

```bash
npm run test:perf:load
```

**Configuração**:
- Ramp-up: 2 minutos até 10 usuários
- Escalada: 5 minutos a cada nível (50, 100)
- Pico: 100 usuários simultâneos por 5 minutos
- Ramp-down: 2 minutos até 0
- **Total**: ~19 minutos

**Métricas Esperadas**:
- ✅ Taxa de erro: < 1%
- ✅ P95 latência: < 500ms
- ✅ P99 latência: < 1000ms
- ✅ Throughput: > 100 req/s

**Interpretação**:
```
Taxa de erro > 1% → Problema de timeout ou resource exhaustion
P95 > 500ms → Otimização de queries necessária
P99 > 1000ms → Picos ocasionais aceitáveis mas investigar
```

### 2. Soak Test
**Objetivo**: Validar estabilidade sob carga contínua

```bash
npm run test:perf:soak
```

**Configuração**:
- Aquecimento: 5 minutos até 10 usuários
- Soak: 30 minutos a 20 usuários
- Cool-down: 5 minutos até 0
- **Total**: ~40 minutos

**Métricas Esperadas**:
- ✅ Taxa de erro: < 1% consistente
- ✅ Memória estável (sem crescimento contínuo)
- ✅ CPU < 70%
- ✅ Sem memory leaks

**Interpretação**:
```
Erro crescente com o tempo → Memory leak
Memória crescente → Connection leak (não fechar conexões)
CPU crescente → Background job acumulo
Latência crescente → Database performance degradation
```

### 3. Stress Test
**Objetivo**: Encontrar o ponto de quebra do sistema

```bash
npm run test:perf:stress
```

**Configuração**:
- Escalada agressiva: 50 → 100 → 200 → 300 → 500 usuários
- 2 minutos em cada nível
- **Total**: ~12 minutos

**Métricas Esperadas**:
- ✅ Breaking point: 300-400 usuários
- ⚠️ Taxa de erro aumenta acima do breaking point
- ⚠️ Latência sobe dramaticamente

**Interpretação**:
```
Breaking point < 300 usuários → Aumentar resources (DB pool, workers)
Error rate > 50% → Circuit breaker ou rate limiter ativo
Latência > 3000ms → Sistema pode estar em deadlock
Response timeout → Aumentar timeouts ou otimizar queries
```

### 4. Spike Test
**Objetivo**: Validar resiliência a picos súbitos

```bash
npm run test:perf:spike
```

**Configuração**:
- Jump para 500 usuários em 0 segundos
- Manter por 5 minutos
- Drop para 0
- **Total**: ~7 minutos

**Métricas Esperadas**:
- ✅ Sistema recupera em < 30s
- ✅ Taxa de erro < 5% durante spike
- ✅ Sem perde de dados

---

## 📈 Interpretação dos Resultados

### Taxa de Erro (Error Rate)
```
< 0.1% (0.1%)    → ✅ Excelente
0.1% - 1%        → ✅ Aceitável
1% - 5%          → ⚠️ Investigate
> 5%             → ❌ Crítico - investigar imediatamente
```

### Latência P95 (95º percentil)
```
< 300ms  → ✅ Excelente
300-500ms → ✅ Bom
500-1000ms → ⚠️ Aceitável
> 1000ms → ❌ Otimizar
```

### Latência P99 (99º percentil)
```
< 500ms  → ✅ Excelente
500-1000ms → ✅ Bom
1000-2000ms → ⚠️ Aceitável
> 2000ms → ❌ Otimizar
```

### Throughput
```
> 200 req/s  → ✅ Excelente
100-200 req/s → ✅ Bom
50-100 req/s → ⚠️ Aceitável
< 50 req/s  → ❌ Otimizar
```

---

## 🔍 Análise de Gargalos

### Cenário 1: Latência Alta em Read Operations
**Indicadores**:
- P95/P99 latência elevada em GET requests
- Write operations rápidas
- CPU/Memória normais

**Causas Prováveis**:
1. **Database Query Lenta**
   - Índices faltando
   - N+1 queries
   - JOIN ineficiente
   - Scan de tabela grande

2. **Falta de Cache**
   - Cache TTL muito baixo
   - Cache hit rate baixo

3. **Database Overload**
   - Pool size insuficiente
   - Connection timeout
   - Lock contention

**Soluções**:
```sql
-- Verificar queries lentas
SELECT query, calls, mean_exec_time 
FROM pg_stat_statements 
WHERE mean_exec_time > 100 
ORDER BY mean_exec_time DESC;

-- Analisar plano de execução
EXPLAIN ANALYZE SELECT ... FROM properties WHERE ...;

-- Adicionar índices
CREATE INDEX idx_properties_city ON properties(city);
CREATE INDEX idx_listings_platform ON listings(platform);
```

### Cenário 2: Latência Alta em Write Operations
**Indicadores**:
- P95/P99 latência elevada em PUT/POST
- Read operations rápidas
- CPU/Memória normais

**Causas Prováveis**:
1. **Locks de Database**
   - Transações longas
   - Deadlocks
   - Foreign key constraints

2. **Validações Custosas**
   - Verificação de duplicatas
   - Validação externa

3. **Background Jobs**
   - Worker queue overloaded
   - Sync operations

**Soluções**:
```typescript
// Otimizar transações
await pool.query('BEGIN');
try {
  // Fazer operações rápidas
  await pool.query('UPDATE ...');
  await pool.query('COMMIT');
} catch (e) {
  await pool.query('ROLLBACK');
}

// Usar batch inserts
const values = properties.map((p, i) => 
  `($${i*5+1}, $${i*5+2}, ...)`
).join(',');
```

### Cenário 3: Taxa de Erro Alta
**Indicadores**:
- Error rate > 1%
- Status codes 5xx
- Timeout errors

**Causas Prováveis**:
1. **Resource Exhaustion**
   - Connection pool esgotado
   - Memory limit atingido
   - Database connections máximas

2. **Timeouts**
   - Query timeout
   - External API timeout
   - Worker timeout

3. **Rate Limiting**
   - Rate limiter muito restritivo
   - DDoS protection ativo

**Soluções**:
```env
# Aumentar pool
DATABASE_POOL_SIZE=30
REDIS_POOL_SIZE=20

# Aumentar timeouts
QUERY_TIMEOUT_MS=45000
WORKER_TIMEOUT_MS=60000

# Configurar retry
WORKER_MAX_ATTEMPTS=3
WORKER_BACKOFF_DELAY_MS=2000
```

### Cenário 4: Memory Leak
**Indicadores**:
- Memória cresce continuamente
- Garbage collection ineficaz
- Processos ficam mais lentos

**Causas Prováveis**:
1. **Connection Leak**
   - Conexões não fechadas
   - Pool esgotado

2. **Event Listeners Não Removidos**
   - .on() sem .off()
   - Memory growing

3. **Global References**
   - Variáveis globais acumulando
   - Cache sem límite

**Soluções**:
```typescript
// Verificar connection leaks
pool.on('error', (err) => console.error('Pool error', err));

// Limpar listeners
emitter.removeListener('event', handler);

// Limitar cache
const cache = new Map();
const MAX_CACHE = 1000;
if (cache.size > MAX_CACHE) {
  cache.delete(cache.keys().next().value);
}
```

---

## 🚀 Otimizações Recomendadas

### Priority 1: High Impact / Easy Implementation
- [ ] Adicionar índices faltantes em properties, listings
- [ ] Aumentar DATABASE_POOL_SIZE para 30
- [ ] Implementar cache com TTL de 5 minutos
- [ ] Adicionar query timeouts

### Priority 2: Medium Impact / Medium Effort
- [ ] Otimizar dashboard query (N+1)
- [ ] Implementar connection pooling
- [ ] Adicionar rate limiting
- [ ] Implementar circuit breaker

### Priority 3: High Impact / High Effort
- [ ] Migrar para read replicas para read-heavy queries
- [ ] Implementar sharding por property
- [ ] Adicionar message queue para async operations
- [ ] Implementar caching distribuído (Redis)

---

## 📊 Monitoramento Contínuo

### Métricas para Monitorar
1. **Latência P95/P99** por endpoint
2. **Taxa de erro** em tempo real
3. **Throughput** (req/s)
4. **Database**: CPU, connections, slow queries
5. **Application**: Memory usage, GC pauses
6. **Workers**: Job count, processing time
7. **Cache**: Hit rate, evictions

### Alertas Recomendados
```
P95 latência > 500ms → Alerta Amarelo
P95 latência > 1000ms → Alerta Vermelho
Taxa de erro > 1% → Alerta Vermelho
CPU > 80% por 5 min → Alerta Amarelo
Memory > 85% → Alerta Amarelo
Database connections > 90% → Alerta Vermelho
```

---

## 🧬 Reproducibilidade

### Setup
```bash
# Instalar k6
brew install k6  # macOS
choco install k6 # Windows

# Instalar dependências
npm install

# Setup database
npm run migrate:test
```

### Executar Baseline Completo
```bash
# Terminal 1: Iniciar servidor
npm start

# Terminal 2: Executar testes
npm run test:perf:baseline

# Analisar resultados
npm run perf:analyze
```

### Resultado Esperado
```
✅ Load Test: 45,000+ requests, < 1% error
✅ Soak Test: 12,500+ requests, stable memory
✅ Stress Test: Breaking point ~350 users
✅ Spike Test: Recovery < 30s
```

---

## 📝 Versioning de Performance

Manter histórico de performance para rastrear melhorias:

```
performance-report-20240115-100000.json
performance-report-20240115-110000.json
performance-report-20240115-120000.json
```

Comparar entre releases:
```bash
node performance/compare-reports.js \
  report-v1.0.0.json \
  report-v1.0.1.json
```

---

## 🎯 Metas de Performance para Produção

| Métrica | Target | Crítico |
|---------|--------|---------|
| P95 Latência | < 300ms | > 1000ms |
| P99 Latência | < 500ms | > 2000ms |
| Error Rate | < 0.5% | > 5% |
| CPU | < 60% | > 85% |
| Memory | < 70% | > 90% |
| Capacity | 500+ users | < 300 users |

---

## ✅ Checklist de Validação

- [ ] Baseline de performance estabelecido
- [ ] Métricas esperadas documentadas
- [ ] Load test executado com sucesso
- [ ] Soak test executado por 30+ minutos
- [ ] Stress test identificou breaking point
- [ ] Spike test validou resiliência
- [ ] Gargalos identificados
- [ ] Plano de otimização criado
- [ ] Monitoramento configurado
- [ ] Alertas implementados
- [ ] Documentação atualizada

---

**Última atualização**: 2024-01-15  
**Próxima revisão**: Após cada deploy em produção  
**Owner**: DevOps Team  
**Status**: ✅ Pronto para Execução
