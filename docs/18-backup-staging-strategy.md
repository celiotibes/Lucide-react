# Backup & Staging Environment Strategy

**Status:** Phase 0 Blocker #4 — Crítico para validação segura de Asaas + payment pipeline

## Objetivo

- **Backup:** Point-in-time recovery de PostgreSQL via Supabase Pro ($25/mês)
- **Staging:** Duplicar database de produção para testar cobrança/webhook sem afetar inquilinos
- **Restore:** Scripts idempotentes para restore de backup em staging

---

## 1. Supabase Pro Upgrade

### O que muda (vs Free tier)
- Point-in-time recovery (últimas 7 dias)
- Backup automático diário + manual on-demand
- Staging database duplication
- 100 GB storage (vs 500 MB free)

### Setup
```bash
# 1. Login no Supabase Dashboard
# https://app.supabase.com/projects

# 2. Na coluna "Billing" do projeto CRMT → Upgrade to Pro
#    - Cartão de crédito obrigatório
#    - Cobrança automática: $25/mês

# 3. Aguardar upgrade completar (2-3 min)

# 4. Verificar no Project Settings → Backups
#    - "Automated Backups" deve estar ON
#    - Retenção: 7 dias (padrão)
```

### Verificar Backup Status
```bash
# No dashboard Supabase:
# Settings → Backups → "View backup logs"
# Primeiro backup automático sai dentro de 24h
```

---

## 2. Staging Database

### Estratégia: Duplicate Production → Staging

**Quando:** Antes de testar payment flows (webhook, juros/multa, estorno)

**Como:** Supabase UI (não há CLI para isso ainda)

```
Dashboard → Settings → Backups
  → "Backups" tab
    → Selecionar backup recente
      → "Restore to new database"
      → Name: "crmt-staging"
      → Region: mesma de produção
      → Confirmação de custo ($25 + storage)
```

Após 5-10 min, a staging database estará pronta.

### Environment Vars para Staging

Criar `.env.staging` (NÃO commitar):
```
# Staging — cópia funcional de prod
NEXT_PUBLIC_SUPABASE_URL="https://[STAGING-PROJECT-ID].supabase.co"
SUPABASE_SERVICE_ROLE_KEY="[staging-key-aqui]"
DATABASE_URL="postgresql://[user]:[pass]@[staging-host]/postgres"

# Webhook Asaas aponta pra staging (ASAAS_WEBHOOK_URL com hostname staging)
ASAAS_WEBHOOK_URL="https://staging-crmt.seudomain.com/api/webhooks/asaas"

# Sandbox Asaas (use credenciais de sandbox)
ASAAS_API_KEY="[sandbox-api-key]"
ASAAS_BASE_URL="https://sandbox.asaas.com/api/v3"
```

---

## 3. Workflow: Teste de Payment Pipeline em Staging

### Setup Inicial
```bash
# 1. Duplicar prod → staging (via Supabase UI, vide acima)

# 2. Criar contrato de teste em staging
#    - Inquilino: "Teste Staging" (CPF: 000.000.000-00)
#    - Imóvel: "Apt Teste" 
#    - Dia vencimento: 5
#    - Valor aluguel: R$ 100,00 (fake amount)

# 3. Executar crons em staging:
curl -X POST https://staging-crmt.seudomain.com/api/cron/gerar-fatura-mensal \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"

# 4. Executar emitir-cobrancas
curl -X POST https://staging-crmt.seudomain.com/api/cron/emitir-cobrancas \
  -H "Authorization: Bearer $CRON_SECRET"

# Output: deve listar 1 cobranca emitida para o contrato teste
```

### Teste de Webhook
```bash
# Simular webhook de pagamento confirmado (Asaas Sandbox)
# No Asaas Sandbox Dashboard → Webhooks → Test Event
#   Payload: { "event": "PAYMENT_CONFIRMED", "payment": { "id": "...", "status": "CONFIRMED" } }

# Ou via curl:
curl -X POST https://staging-crmt.seudomain.com/api/webhooks/asaas \
  -H "asaas-access-token: $ASAAS_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "PAYMENT_CONFIRMED",
    "payment": { 
      "id": "pay_xxxxx", 
      "status": "CONFIRMED",
      "value": 100.00 
    }
  }'

# Verificar em staging:
# SELECT * FROM cobrancas_asaas WHERE status = 'pago';
# -- deve ter 1 registro com status='pago'
```

### Teste de Juros/Multa
```bash
# 1. Avançar data de vencimento em staging (hack temporário)
UPDATE faturas SET vencimento = now() - interval '10 days' 
WHERE tipo = 'aluguel' AND contrato_id = '[test-contract]';

# 2. Executar régua de cobrança
curl -X POST https://staging-crmt.seudomain.com/api/cron/regua-cobranca \
  -H "Authorization: Bearer $CRON_SECRET"

# 3. Executar gerador de multa_juros
curl -X POST https://staging-crmt.seudomain.com/api/cron/gerar-multa-juros \
  -H "Authorization: Bearer $CRON_SECRET"

# 4. Verificar resultados
SELECT f.id, f.tipo, f.valor_bruto, f.valor_liquido, f.status 
FROM faturas f 
WHERE f.contrato_id = '[test-contract]'
ORDER BY f.criado_em DESC;

# Output esperado:
# - 1 fatura tipo='aluguel', valor_liquido > valor_bruto (juros adicionados)
# - 1 fatura tipo='multa_juros', status='aberta' (pronta para cobrança)
```

---

## 4. Backup Manual (On-Demand)

Quando precisa fazer backup manual antes de mudança crítica:

```bash
# Via Supabase UI
# Settings → Backups → "Create a manual backup"
# → Label: "pre-payment-pipeline-3.7"
# → Confirmar

# Via CLI (se disponível)
supabase db push --db-url "postgresql://..." # não suportado ainda
```

---

## 5. Restore de Backup (Disaster Recovery)

### Cenário: Dados corrompidos em produção

```bash
# 1. No Supabase Dashboard:
#    Settings → Backups → Selecionar backup pre-corrupção
#    → "Restore to original database"
#    → CONFIRM (isso vai sobrescrever TUDO)
#    → Aguardar 10-15 min

# 2. Verificar integridade pós-restore
curl https://[prod-url]/api/health
# Deve retornar 200 e status OK

# 3. Notificar stakeholders
```

**⚠️ CUIDADO:** Restore é destrutivo. Sempre testar em staging primeiro.

---

## 6. CI/CD Checklist para Staging

Antes de deployar payment features em produção:

- [ ] Feature testada em staging
- [ ] Webhook de Asaas validado (confirmado, estornado)
- [ ] Juros/multa calculados corretamente
- [ ] ledger entries criadas (split_pagamento, investidor_ledger)
- [ ] Portal inquilino mostra valores atualizados
- [ ] Backup manual tirado pré-deploy
- [ ] Rollback plan documentado
- [ ] Logs de erro limpos (nenhum 500 em staging)

---

## 7. Monitoramento (Pós-Deploy)

```bash
# Monitorar cobrancas_asaas em produção
SELECT 
  COUNT(*) total_cobrancas,
  COUNT(CASE WHEN status = 'pago' THEN 1 END) pagas,
  COUNT(CASE WHEN status = 'pendente' THEN 1 END) pendentes,
  COUNT(CASE WHEN status = 'atrasado' THEN 1 END) atrasadas,
  COUNT(CASE WHEN status = 'cancelado' THEN 1 END) canceladas
FROM cobrancas_asaas
WHERE criado_em >= now() - interval '24 hours';

# Monitorar ledger (distribuição de recebimentos)
SELECT 
  COUNT(*) total_distribuicoes,
  SUM(valor) valor_total
FROM investidor_ledger
WHERE criado_em >= now() - interval '24 hours'
  AND tipo = 'credito_repasse';

# Alertar se houver muitas falhas
SELECT COUNT(*) falhas
FROM regua_cobranca_eventos
WHERE criado_em >= now() - interval '24 hours'
-- Se > 5% das faturas tiverem D30 sem sucesso de emissão, escalar
```

---

## Custos Mensais (com Staging)

| Item | Custo | Notas |
|------|-------|-------|
| Supabase Pro | $25 | Backup + 100 GB |
| Staging DB (duplicada) | ~$12 | Mesma infra replicada |
| **Total** | **~$37** | Vs $0 free tier |

→ Investimento mínimo para evitar perda de dados de inquilino.

---

## Próximos Passos

1. ✅ Upgrade Supabase para Pro (15 min setup)
2. ✅ Criar staging database (via UI, 5-10 min)
3. ✅ Validar payment pipeline em staging (antes de prod deploy)
4. ✅ Testar restore (disaster recovery drill mensal)

**Phase 0 Exit Criterion:** "O sistema de cobrança automática com Asaas foi testado de ponta a ponta em staging sem afetar dados de produção."
