# 📊 Performance Testing Suite

Suíte completa de testes de performance para validar e otimizar o sistema de gerenciamento de aluguéis.

## 🚀 Quick Start

```bash
# Instalar k6
brew install k6  # macOS
choco install k6 # Windows
apt-get install k6 # Linux

# Setup
npm install

# Executar load test
npm run test:perf:load

# Analisar resultados
npm run perf:analyze
```

## 📁 Estrutura de Arquivos

```
performance/
├── load-test.js                 # Load test (19 min, 100 users)
├── soak-test.js                 # Soak test (40 min, 20 users)
├── stress-test.js               # Stress test (12 min, até 500 users)
├── analyze-results.js           # Análise de resultados
├── database-optimization.sql    # Otimizações de índices
└── README.md                    # Este arquivo
```

## 🧪 Testes Disponíveis

### 1️⃣ Load Test
**Objetivo**: Validar performance sob carga normal

```bash
npm run test:perf:load

# Ou com configuração custom
k6 run --vus=100 --duration=30s performance/load-test.js
```

**O que testa**:
- ✅ List properties (50 propriedades por página)
- ✅ Get property detail
- ✅ Get property dashboard
- ✅ List listings
- ✅ Get listing performance
- ✅ Update listing content
- ✅ Get pricing analysis
- ✅ Get competitive pricing
- ✅ Update listing price
- ✅ List leads
- ✅ Get lead funnel stats
- ✅ Update lead stage
- ✅ Get sync status

**Duração**: ~19 minutos (ramp-up 7 min + peak 5 min + ramp-down 7 min)

**Métricas coletadas**:
- Latência P50/P95/P99 por endpoint
- Taxa de erro global
- Throughput (req/s)
- Taxa de sucesso

**Resultado esperado**:
```
✅ Total requests: 45,000+
✅ Error rate: < 1%
✅ P95 latency: < 500ms
✅ Throughput: > 100 req/s
```

---

### 2️⃣ Soak Test
**Objetivo**: Validar estabilidade sob carga contínua

```bash
npm run test:perf:soak

# Ou com duração custom (padrão 30 min)
k6 run --vus=20 --duration=30m performance/soak-test.js
```

**O que valida**:
- ✅ Ausência de memory leaks
- ✅ Latência consistente (sem degradação)
- ✅ CPU/Memory stable
- ✅ Conexões de database estáveis

**Padrão de uso realista**:
- 40% browsing propriedades
- 20% visualizar detalhes
- 20% checar anúncios
- 20% verificar performance

**Duração**: ~40 minutos

**Métricas coletadas**:
- Memory usage ao longo do tempo
- CPU usage ao longo do tempo
- Taxa de erro consistente
- Latência ao longo do tempo

**Resultado esperado**:
```
✅ Memory: Cresce até ~350MB então estabiliza
✅ Error rate: Consistente < 1%
✅ Latency: Sem crescimento contínuo
✅ Throughput: Consistente
```

---

### 3️⃣ Stress Test
**Objetivo**: Encontrar o ponto de quebra do sistema

```bash
npm run test:perf:stress
```

**O que faz**:
- Escalada agressiva: 50 → 100 → 200 → 300 → 500 usuarios
- 2 minutos em cada nível
- Detecta breaking point automaticamente

**Duração**: ~12 minutos

**Métricas coletadas**:
- Taxa de erro por nível de carga
- Latência por nível de carga
- Ponto de quebra identificado

**Resultado esperado**:
```
✅ Breaking point: 350-400 usuarios
✅ P95 sobe de 400ms → 2000ms+
✅ Error rate: 0% até breaking point, depois 5-50%
```

**Interpretação**:
- `Breaking point < 300` → Aumentar database connections
- `Breaking point > 400` → ✅ Bom
- `Breaking point > 600` → ✅ Excelente

---

### 4️⃣ Spike Test
**Objetivo**: Validar resiliência a picos súbitos

```bash
npm run test:perf:spike
```

**O que faz**:
- Jump para 500 usuarios em 0 segundos
- Manter por 5 minutos
- Observar recuperação

**Duração**: ~7 minutos

**Métricas coletadas**:
- Tempo de recuperação
- Max latency durante spike
- Perda de dados

**Resultado esperado**:
```
✅ Recuperação: < 30 segundos
✅ Error rate durante spike: < 5%
✅ Sem perda de dados
```

---

## 📊 Interpretar Resultados

### Taxa de Erro (Error Rate)

```
< 0.1%    → ✅ Excelente
0.1-1%    → ✅ Aceitável
1-5%      → ⚠️ Investigate
> 5%      → ❌ Crítico
```

### Latência P95

```
< 300ms   → ✅ Excelente
300-500ms → ✅ Bom
500-1000ms → ⚠️ Aceitável
> 1000ms  → ❌ Otimizar
```

### Latência P99

```
< 500ms   → ✅ Excelente
500-1000ms → ✅ Bom
1000-2000ms → ⚠️ Aceitável
> 2000ms  → ❌ Otimizar
```

---

## 🔍 Analisar Resultados Detalhados

### Opção 1: Relatório Automático

```bash
npm run perf:analyze
```

Gera análise completa:
- ✅ Comparação com baseline
- ✅ Recomendações de otimização
- ✅ Relatório JSON detalhado

### Opção 2: Análise Manual com k6

```bash
# Executar com output JSON
k6 run --out json=results.json performance/load-test.js

# Analisar resultados
cat results.json | jq '.metrics'
```

### Opção 3: Integrar com Grafana/CloudWatch

```bash
# Com influxDB
k6 run --out influxdb=http://localhost:8086/k6

# Com CloudWatch
k6 run --out cloudwatch performance/load-test.js
```

---

## 🎯 Baseline de Performance

| Métrica | Target | Crítico |
|---------|--------|---------|
| P95 Latência | < 500ms | > 1000ms |
| P99 Latência | < 1000ms | > 2000ms |
| Error Rate | < 1% | > 5% |
| Throughput | > 100 req/s | < 50 req/s |
| Breaking Point | > 350 users | < 300 users |
| Memory (soak) | Stable | Crescimento contínuo |

---

## 🛠️ Otimizar Performance

### 1. Database Indexes (Recomendado)

```bash
# Aplicar otimizações de índices
psql -U username -d rental_sync -f performance/database-optimization.sql
```

**Impacto esperado**:
- ✅ Queries de lista: -70% latência
- ✅ Dashboard: -60% latência
- ✅ Throughput: +40%

### 2. Application Tuning

```env
# Aumentar pool size
DATABASE_POOL_SIZE=30

# Aumentar cache
CACHE_TTL_PROPERTY_DASHBOARD=600000

# Aumentar timeouts
QUERY_TIMEOUT_MS=45000
```

### 3. Infrastructure Scaling

```bash
# Aumentar recursos
- Upgrade de servidor
- Adicionar read replica
- Implementar connection pooling (PgBouncer)
```

---

## 📈 Comparar Releases

```bash
# Executar teste em v1.0
npm run test:perf:load > results-v1.0.json

# Executar teste em v1.1
npm run test:perf:load > results-v1.1.json

# Comparar
diff results-v1.0.json results-v1.1.json
```

**O que buscar**:
- ✅ P95 latência diminuiu
- ✅ Error rate diminuiu
- ✅ Throughput aumentou
- ✅ Memory usage diminuiu

---

## 🚨 Troubleshooting

### "Connection refused"
```bash
# Verificar se API está rodando
curl http://localhost:3000/api/health

# Se não estiver:
npm start &
sleep 5  # Aguardar startup
npm run test:perf:load
```

### "Too many requests" ou "429"
```env
# Aumentar rate limit
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_WINDOW_MS=60000
```

### "Database connection timeout"
```env
# Aumentar pool
DATABASE_POOL_SIZE=50
DATABASE_POOL_IDLE_TIMEOUT_MS=60000
```

### "Out of memory"
```bash
# Aumentar heap Node.js
NODE_OPTIONS=--max-old-space-size=2048 npm start
```

---

## 📚 Recursos Adicionais

- [k6 Documentation](https://k6.io/docs/)
- [k6 Best Practices](https://k6.io/docs/misc/best-practices/)
- [Performance Baseline Guide](../PERFORMANCE_BASELINE.md)
- [Database Optimization](database-optimization.sql)
- [Staging Deployment Guide](../STAGING_DEPLOYMENT_GUIDE.md)

---

## ✅ Checklist Pré-Deploy

Antes de ir para produção:

- [ ] Load test executado e passou
- [ ] Soak test executado por 30+ min
- [ ] Stress test identificou breaking point > 300 users
- [ ] Spike test validou recovery < 30s
- [ ] Database indexes aplicados
- [ ] Memory leaks verificados (soak test)
- [ ] Error rate < 1%
- [ ] P95 latência < 500ms
- [ ] Alertas configurados
- [ ] Monitoramento ativo

---

## 📞 Suporte

Problemas com testes de performance?

1. Verificar logs: `tail -f /var/log/rental-sync/app.log`
2. Verificar database: `psql -d rental_sync -c "SELECT * FROM pg_stat_activity;"`
3. Verificar recursos: `top`, `free`, `df`
4. Consultar [troubleshooting guide](../PERFORMANCE_BASELINE.md#-troubleshooting)

---

**Última atualização**: 2024-01-15  
**Próxima revisão**: Antes de cada major release  
**Status**: ✅ Pronto para Uso
