# 🆘 Incident Response & Crisis Management

Procedimentos de resposta para incidentes de produção - Sistema de Gerenciamento de Aluguéis

---

## 📋 Sumário

1. [Classificação de Incidentes](#classificação-de-incidentes)
2. [Procedimento de Resposta](#procedimento-de-resposta)
3. [Escalação](#escalação)
4. [Investigação & Debugging](#investigação--debugging)
5. [Comunicação](#comunicação)
6. [Pós-Incidente](#pós-incidente)

---

## 🔴 Classificação de Incidentes

### Severidade P1 - CRÍTICO (Responder em < 5 min)

**Impacto**: Serviço completamente indisponível ou com perda de dados

**Exemplos**:
- ❌ API não responde (HTTP 503)
- ❌ Database offline
- ❌ Perda de dados de usuários
- ❌ Security breach detectado
- ❌ Revenue afetado (payments não funcionam)

**Ação**:
1. Declarar P1 (Slack #incidents)
2. Page on-call engineer
3. Executar runbook específico
4. Iniciar investigation imediatamente
5. Comunicar executivos a cada 15 min

**Exemplo Runbook**:
```bash
# P1: API Down
1. Check service status
   curl https://api.example.com/api/health

2. If down, check logs
   aws logs tail /aws/ecs/rental-sync-prod --follow

3. Check database
   psql -h $DB_HOST -c "SELECT 1;"

4. Restart service if needed
   kubectl rollout restart deployment/api -n production

5. If still down, rollback
   git checkout v1.2.3
   npm run deploy:production
```

---

### Severidade P2 - ALTO (Responder em < 15 min)

**Impacto**: Serviço degradado ou alguns usuários afetados

**Exemplos**:
- ⚠️ Latência > 1 segundo
- ⚠️ Error rate > 5%
- ⚠️ Feature X não funciona
- ⚠️ Database lento
- ⚠️ External API intermitente

**Ação**:
1. Notificar team no Slack
2. Criar incident ticket
3. Investigar root cause
4. Comunicar usuários afetados
5. Deploy fix ou workaround

---

### Severidade P3 - MÉDIO (Responder em < 1 hora)

**Impacto**: Impacto limitado, usuários conseguem contornar

**Exemplos**:
- 🟡 Bug em feature secundária
- 🟡 Performance subótima
- 🟡 UI issue
- 🟡 Relatório incorreto

**Ação**:
1. Criar bug ticket
2. Triagar para próxima sprint
3. Comunicar ao user se aplicável

---

### Severidade P4 - BAIXO (Responder em < 1 dia)

**Impacto**: Nenhum impacto imediato

**Exemplos**:
- 💬 Typo na documentação
- 💬 Feature request
- 💬 Enhancement

---

## 🚨 Procedimento de Resposta

### Timeline de Resposta

```
T+0min    Alerta dispara → Investigação começa
T+5min    (P1) On-call page / Team notification
T+10min   Root cause hipótese identificada
T+15min   Fix iniciado ou workaround ativado
T+30min   Fix deployed em staging
T+45min   Fix validado e deployd em produção
T+60min   Monitoramento pós-deploy
T+24h     Post-mortem agendado
```

### Resposta Passo a Passo

#### Passo 1: Confirmação & Categorização (1 min)

```bash
# 1. Confirmar o incidente
curl -s https://api.example.com/api/health | jq .

# 2. Verificar alertas
# Abrir: http://alertmanager:9093

# 3. Categorizar
# P1? P2? P3?

# 4. Notificar
# Slack #incidents: "P1: API latency spike"
```

#### Passo 2: Triage & On-Call (2 min)

```bash
# 1. Page on-call engineer (se P1)
pagerduty trigger --service=rental-sync \
  --title="P1: High latency" \
  --severity=critical

# 2. Criar incident ticket
jira create \
  --project=INCIDENT \
  --summary="P1: API latency > 2s" \
  --priority=Blocker

# 3. Designar investigador
# Slack: @on-call, you have incident #INC-123

# 4. Reunião de stand-up (se P1)
# Video conference link: zoom.example.com/incidents
```

#### Passo 3: Investigação (5-10 min)

```bash
#!/bin/bash
# Script: scripts/incident-investigation.sh

echo "📊 Gathering diagnostic data..."

# 1. Health status
echo "=== Health Status ===="
curl -s https://api.example.com/api/health/detailed | jq .

# 2. Recent logs (últimas 5 min)
echo "=== Recent Errors (last 5 min) ===="
aws logs tail /aws/ecs/rental-sync-prod \
  --filter-pattern="ERROR" \
  --since=5m

# 3. Performance metrics
echo "=== Performance Metrics ===="
curl -s http://prometheus:9090/api/v1/query \
  -G -d 'query=rate(http_requests_total[5m])' | jq .

# 4. Database status
echo "=== Database Status ===="
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT * FROM pg_stat_activity WHERE state != 'idle';"

# 5. Redis status
echo "=== Redis Status ===="
redis-cli INFO stats

# 6. Recent changes (git log)
echo "=== Recent Deployments ===="
git log --oneline -n 10

# 7. Error tracking (Sentry/DataDog)
echo "=== Recent Errors (Sentry) ===="
curl -s "https://sentry.io/api/0/projects/$ORG/rental-sync/issues/?query=is:unresolved" | jq .
```

#### Passo 4: Hipótese & Ação (5-10 min)

```
Diagrama de Decisão:
┌─ API responds? ─ Sim → Latência ou erro específico?
│                  Não → Serviço down, restart ou rollback
│
├─ Database responsive? ─ Não → Investigate DB
│                         Sim → Check Redis, external APIs
│
├─ Memory leak? ─ Sim → Restart pods
│                Não → Check slow queries
│
└─ Recent deployment? ─ Sim → Rollback
                       Não → Investigate infrastructure
```

**Ações Possíveis**:

```bash
# Ação 1: Restart API pods
kubectl rollout restart deployment/api -n production

# Ação 2: Scale up replicas
kubectl scale deployment api --replicas=5 -n production

# Ação 3: Clear cache
redis-cli FLUSHDB

# Ação 4: Kill long-running queries
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT pg_terminate_backend(pid) \
      FROM pg_stat_activity \
      WHERE query_start < NOW() - interval '5 minutes';"

# Ação 5: Rollback deployment
git checkout v1.2.3
npm run deploy:production

# Ação 6: Enable rate limiter
kubectl set env deployment/api \
  RATE_LIMIT_ENABLED=true \
  -n production

# Ação 7: Switch to read replica
# Atualizar connection string para read replica

# Ação 8: Failover database
aws rds promote-read-replica \
  --db-instance-identifier rental-sync-replica
```

#### Passo 5: Validação (5 min)

```bash
# 1. Health checks
./scripts/deep-health-check.sh

# 2. Smoke tests
npm run test:smoke -- --env=production

# 3. Metrics validation
./scripts/check-metrics.sh \
  --error-rate-threshold=0.01 \
  --latency-threshold=500

# 4. User testing
# Enviar teste manual para time

# 5. Monitor por 15+ min
watch 'curl -s https://api.example.com/api/health | jq .'
```

#### Passo 6: Comunicação (Contínuo)

Comunicar a cada 15 minutos (P1) ou 30 min (P2):

```
[15:30] 🚨 P1: API latency spike detected
        Investigating root cause
        ETA: 15 min

[15:45] 🔍 Root cause: Database slow queries
        Implementing fix
        ETA: 15 min

[16:00] ✅ Fix deployed to production
        Monitoring for stability
        Next update in 15 min

[16:15] ✅ Incident resolved
        Error rate back to normal
        Post-mortem scheduled for tomorrow
```

---

## 📞 Escalação

### Escalation Path

```
Nível 1: On-Call Engineer
  - Investigação inicial
  - Ações imediatas
  - Comunicação inicial

       ↓ (Se não resolvido em 10 min)

Nível 2: Engineering Manager
  - Coordenar múltiplos times
  - Decisões de negócio
  - Comunicação executiva

       ↓ (Se não resolvido em 30 min)

Nível 3: VP Engineering / CTO
  - Decisões críticas
  - Status para C-level
  - Comunicação ao cliente
```

### PagerDuty Escalation

```
Primary: @eng-on-call
  (30 min timeout)
  ↓
Secondary: @eng-manager
  (30 min timeout)
  ↓
Tertiary: @vp-engineering
```

### Contacts

```yaml
On-Call Engineer:
  Slack: #on-call
  Phone: +55 (48) XXXX-XXXX

Engineering Manager:
  Email: eng-manager@example.com
  Slack: @eng-manager

VP Engineering:
  Email: vp-eng@example.com
  Phone: +55 (48) YYYY-YYYY
```

---

## 🔍 Investigação & Debugging

### Checklist de Investigação

```
□ Verificar status do serviço
□ Verificar logs recentes
□ Verificar métricas de performance
□ Verificar status do database
□ Verificar status do cache
□ Verificar conectividade de APIs externas
□ Verificar recentes mudanças (git log, deployments)
□ Verificar alerts disparados
□ Correlacionar com eventos de negócio
□ Testar localmente (se P2/P3)
```

### Ferramentas de Debug

```bash
# Logs estruturados
aws logs filter-log-events \
  --log-group-name=/aws/ecs/rental-sync-prod \
  --filter-pattern='{ $.level = "ERROR" }' \
  --start-time=$(date -d '5 minutes ago' +%s)000

# Distributed tracing
jaeger query --service rental-sync \
  --start-time=-5m \
  --search

# Profiling
# Node.js heap snapshot
kill -USR2 $PID
# Chrome: chrome://inspect

# Database query profiling
EXPLAIN ANALYZE SELECT ...;

# Trace system calls
strace -p $PID -f -e trace=network,openat,read,write
```

### Debugging Scenarios

#### Scenario: High Latency

```sql
-- 1. Verificar queries lentas
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 2. Verificar índices faltando
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY tablename;

-- 3. Verificar table bloat
SELECT schemaname, tablename,
  round(100 * (fsm_relation_forks + heap_blks_read) / 
  NULLIF(heap_blks_total, 0), 2) as table_bloat_pct
FROM pg_stat_user_tables;
```

#### Scenario: High Error Rate

```bash
# 1. Encontrar erros comuns
aws logs filter-log-events \
  --log-group-name=/aws/ecs/rental-sync-prod \
  --filter-pattern='{ $.statusCode >= 500 }' \
  --query='events[*].message' \
  | jq -r '.[]' | sort | uniq -c | sort -rn

# 2. Verificar stack traces
aws logs filter-log-events \
  --log-group-name=/aws/ecs/rental-sync-prod \
  --filter-pattern='ERROR stack trace' \
  | jq '.events[0].message'

# 3. Verificar se erro é novo (comparar com baseline)
git log --oneline -n 20 | grep -i "fix\|error"
```

#### Scenario: Memory Leak

```bash
# 1. Monitorar memória
kubectl top pod -n production | grep api

# 2. Gerar heap dump
node --inspect:0.0.0.0:9229 app.js

# 3. Abrir Chrome DevTools e analisar retained objects

# 4. Verificar event listeners não removidos
grep -r "\.on\(" src/ | grep -v "\.off\("
```

---

## 💬 Comunicação

### Templates de Comunicação

#### Template 1: Notificação Inicial (Incidente Iniciado)

```
🚨 INCIDENT: {{severity}} {{title}}

Status: 🔴 INVESTIGATING
Duration: {{duration}}

Impact:
- {{impact_1}}
- {{impact_2}}

Teams Assigned:
- @on-call: Investigation
- @ops: Monitoring

Next update in 15 minutes
```

#### Template 2: Atualização (Progresso)

```
📊 INCIDENT UPDATE: {{title}}

Status: 🔍 ROOT CAUSE IDENTIFIED

Root Cause:
{{root_cause}}

Fix:
{{fix_description}}

ETA Resolution: {{eta}}

Next update in 10 minutes
```

#### Template 3: Resolução (Incidente Fechado)

```
✅ INCIDENT RESOLVED: {{title}}

Timeline:
- 15:30: Incidente detectado
- 15:45: Root cause identificada
- 16:00: Fix deployed
- 16:15: Validated & stable

Impact:
- Duration: 45 minutes
- Affected users: ~{{affected_users}}
- Data loss: None

Post-mortem: Agendado para {{date}}

Slack thread: {{thread_url}}
```

#### Template 4: Post-Mortem (24h depois)

```
📝 POST-MORTEM: {{title}}

Timeline:
1. [HH:MM] Event occurred
2. [HH:MM] Detection
3. [HH:MM] Root cause
4. [HH:MM] Resolution

Root Cause Analysis:
{{analysis}}

Action Items:
- [ ] Implement {{action_1}}
- [ ] Improve {{action_2}}
- [ ] Monitor {{action_3}}

Owner: @eng-manager
Deadline: {{date}}
```

### Communication Channels

```
Slack:
- #incidents - Público
- #incident-postmortems - Público
- #eng-on-call - Privado (team só)

Email:
- leadership@example.com (P1 only)
- customers@example.com (P1 only)

Status Page:
- status.example.com
- Atualizado automaticamente via AlertManager
```

---

## 🔄 Pós-Incidente

### Immediate (< 1 hora)

```
□ Declarar incidente como RESOLVED
□ Parar de pagar por extra resources
□ Notificar stakeholders que está OK
□ Começar a coletar dados para post-mortem
□ Desabilitar alertas temporários (se houver)
```

### Short-Term (24 horas)

```
□ Realizar post-mortem
□ Documentar root cause
□ Criar action items
□ Atribuir owners
□ Estimar timeline de fixes
```

### Medium-Term (1-2 semanas)

```
□ Implementar corrective actions
□ Adicionar monitoramento/alertas
□ Melhorar documentação/runbooks
□ Implementar automated tests
□ Validar que root cause foi eliminada
```

### Post-Mortem Meeting (Template)

**Duração**: 60 minutos

**Participantes**: On-call, Engineers, Manager, Customer Success

**Agenda**:

1. **Timeline** (10 min)
   - Quando começou?
   - Quando foi detectado?
   - Quando foi resolvido?
   - Duração total?

2. **Impact** (5 min)
   - Quantos usuários afetados?
   - Quanta data foi perdida?
   - Quanta receita impactada?

3. **Root Cause** (15 min)
   - O que aconteceu?
   - Por que aconteceu?
   - Por que não foi detectado antes?

4. **What Went Well** (5 min)
   - O que fizemos bem?
   - Quem respondeu rapidamente?
   - Qual ação foi mais efetiva?

5. **What We Can Improve** (10 min)
   - O que poderia ser melhor?
   - Qual monitoramento faltava?
   - Qual alerta deveria ter disparado?

6. **Action Items** (10 min)
   - O que vamos fazer?
   - Quem é responsável?
   - Qual o deadline?
   - Como vamos validar?

7. **Retrospective** (5 min)
   - Feedback sobre processo
   - Melhorias em runbooks
   - Treinamento necessário

### Action Item Tracking

```yaml
ACTION-001:
  Title: "Adicionar slow query alert"
  Root Cause: "Query de properties estava lenta, não havia alert"
  Owner: @database-team
  Deadline: 2024-02-05
  Status: In Progress
  Link: JIRA-1234

ACTION-002:
  Title: "Implementar query caching"
  Root Cause: "Dashboard query estava sendo executada sempre"
  Owner: @backend-team
  Deadline: 2024-02-12
  Status: To Do
  Link: JIRA-1235
```

### Incident Statistics

Rastrear para identificar padrões:

```
Métrica Alvo P1: < 1 por mês
Métrica Alvo P2: < 5 por mês
MTTR (Mean Time To Resolve): < 30 min
MTBF (Mean Time Between Failures): > 2 semanas
Prevenibilidade: > 70% dos incidentes são preveníveis
```

---

## 📋 Checklist Rápido

### P1 Incident Response

```
[ ] 00:00 Alert recebido
[ ] 00:01 Verificar saúde do serviço
[ ] 00:02 Categorizar como P1
[ ] 00:03 Page on-call
[ ] 00:05 Investigação começa
[ ] 00:10 Root cause identificada
[ ] 00:15 Fix iniciado
[ ] 00:30 Fix em staging
[ ] 00:45 Fix em produção
[ ] 01:00 Monitorando estabilidade
[ ] 24:00 Post-mortem agendado
```

---

**Última Atualização**: 2024-01-15  
**Status**: ✅ Pronto para Produção
