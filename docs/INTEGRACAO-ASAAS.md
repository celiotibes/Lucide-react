# Integração Asaas - Fintech de Pagamentos

## Overview

Integração completa com Asaas para gestão de cobranças, recebimentos e pagamentos. Sistema de emissão de boletos, PIX e cartão de crédito com webhooks para sincronização automática de status.

## Architecture

### Cliente Asaas
**`server/asaas/client.ts`** (15KB)

Classe responsável por:
- Criar/buscar clientes (pessoas)
- Emitir cobranças (Boleto/PIX/Cartão)
- Consultar status de pagamentos
- Processar reembolsos
- Gerenciar split de pagamento (distribuição de valores)

**Métodos principais:**
```typescript
// Clientes
criarCliente(dados)
buscarCliente(cpfCnpj)
atualizarCliente(customerId, dados)

// Cobranças
emitirCobranca(customerId, {
  valor,
  dueDate,
  description,
  installmentCount,
  billingType // 'BOLETO', 'PIX', 'CREDIT_CARD'
})
atualizarCobranca(paymentId, dados)
confirmarPagamento(paymentId)

// Split
criarSplit(paymentId, {
  beneficiario,
  valor
})
distribuirRecebimento(paymentId, splits)
```

### Webhooks
**`server/asaas/webhook.ts`** (3KB)

Valida e processa eventos do Asaas:
- `payment.created`: Cobrança emitida
- `payment.updated`: Status alterado
- `payment.confirmed`: Pagamento recebido
- `payment.overdue`: Cobrança vencida
- `payment.deleted`: Cobrança cancelada

### Admin Dashboard
**`/admin/integracao-asaas`**

Interface para:
- Ver status de conexão (conectado/desconectado)
- Visualizar saldo disponível
- Monitorar cobranças (pendentes, pagas, atrasadas)
- Testar conexão com um clique
- Verificar configurações (API Key, Webhook)

## Configuration

### Environment Variables

```env
# Sandbox (Desenvolvimento)
NEXT_PUBLIC_ASAAS_API_KEY=aac_sandbox_12345678901234567890

# Production (Homologação/Produção)
NEXT_PUBLIC_ASAAS_API_KEY=aac_live_12345678901234567890

# Webhook signature validation
ASAAS_WEBHOOK_SECRET=sua_chave_secreta_webhook
```

**Obter API Key:**
1. Criar conta em https://www.asaas.com
2. Acessar Configurações → Credenciais de API
3. Gerar Token de Integração (para sandbox, usar ambiente sandbox)
4. Copiar token e adicionar ao `.env.local`

### Webhook Configuration

**URL de Webhook:**
```
https://seu-dominio.com/api/webhooks/asaas
```

**Passos no painel Asaas:**
1. Configurações → Integrações → Webhooks
2. Adicionar novo webhook
3. URL: `https://seu-dominio.com/api/webhooks/asaas`
4. Eventos: Selecionar todos os eventos de cobrança
5. Salvar e copiar Signing Secret para `ASAAS_WEBHOOK_SECRET`

## API Endpoints

### Admin Status
**`GET /api/admin/asaas-status`** (admin-only)

Retorna status atual da integração:
```json
{
  "conectado": true,
  "ambiente": "sandbox",
  "saldo": 5234.50,
  "cobrancas_pendentes": 12,
  "cobrancas_pagas": 456,
  "cobrancas_atrasadas": 3,
  "ultimaVerificacao": "2026-07-23T14:30:00Z"
}
```

### Admin Test
**`POST /api/admin/asaas-test`** (admin-only)

Testa conexão com Asaas:
```json
{
  "mensagem": "Conexão bem-sucedida",
  "saldo": 5234.50,
  "ambiente": "Sandbox"
}
```

### Webhook
**`POST /api/webhooks/asaas`** (público, validado com signature)

Recebe eventos do Asaas e atualiza banco de dados:
- Valida assinatura via HMAC-SHA256
- Atualiza status de cobranças
- Dispara distribuição de recebimento
- Loga eventos para auditoria

## Workflow de Cobrança

```
1. Criar Contrato
   ↓
2. Gerar Fatura (cron diário)
   ├─ Cria registro em faturas (status='aberta')
   ↓
3. Emitir Cobrança (cron diário, 7:00 AM)
   ├─ Cria/busca customer em Asaas
   ├─ Emite cobrança (Boleto + PIX)
   ├─ Armazena asaas_id em cobrancas_asaas
   ├─ Registra regime de caixa
   ↓
4. Aguardar Pagamento
   ├─ Webhook: payment.confirmed
   ├─ Atualiza cobrancas_asaas.status='pago'
   ├─ Atualiza faturas.status='paga'
   ↓
5. Distribuir Recebimento (cron diário, 8:00 AM)
   ├─ Consulta cobrancas com status='pago'
   ├─ Calcula split (proprietário, CRMT, fundo reserva, caução)
   ├─ Cria registros em split_pagamento
   ├─ Cria movimentação em investidor_ledger (se proprietário é investidor)
   ↓
6. Reconciliação (cron mensal)
   ├─ Compara faturas vs cobrancas vs recebimentos
   ├─ Registra discrepâncias para auditoria
```

## Webhook Events

### payment.confirmed (Pagamento Recebido)

```json
{
  "event": "payment.confirmed",
  "id": "12345",
  "payment": {
    "id": "pay_123abc",
    "object": "payment",
    "customer": "cus_456def",
    "value": 1500.00,
    "netValue": 1456.50,
    "dueDate": "2026-08-05",
    "status": "RECEIVED",
    "billingType": "BOLETO",
    "invoiceNumber": "001/001",
    "externalReference": "contrato-uuid",
    "description": "Aluguel - Apto 301",
    "confirmedDate": "2026-08-01T10:30:00Z"
  }
}
```

**Processamento:**
1. Validar assinatura HMAC-SHA256
2. Atualizar `cobrancas_asaas.status = 'pago'`
3. Atualizar `faturas.status = 'paga'`
4. Registrar `data_pagamento` para auditoria
5. Acionar distribuição de recebimento

### payment.overdue (Cobrança Vencida)

Disparado automaticamente 1 dia após vencimento. Incrementar contador de juros/multa conforme contrato.

### payment.updated (Alteração de Status)

Cobre transições: PENDING → RECEIVED, CANCELLED, CHARGEBACK, etc.

## Testing

### Sandbox Setup

```bash
# 1. Criar conta Asaas (sandbox)
# https://www.asaas.com/signup?ref=sandbox

# 2. Gerar API Key em Configurações → Credenciais

# 3. Adicionar ao .env.local
NEXT_PUBLIC_ASAAS_API_KEY=aac_sandbox_xxxxx
ASAAS_WEBHOOK_SECRET=sua_chave_webhook

# 4. Acessar dashboard
# http://localhost:3000/admin/integracao-asaas
# Clique "Testar Conexão" ✓
```

### Test Cases

**1. Simular Pagamento**
```bash
# No painel Asaas Sandbox:
# 1. Acessar Cobranças → Teste
# 2. Criar cobrança de teste
# 3. Clicar "Simular Pagamento"
# 4. Webhook deve ser disparado automaticamente
# 5. Verificar em /admin/conciliacao-bancaria
```

**2. Testar Webhook Manualmente**
```bash
curl -X POST http://localhost:3000/api/webhooks/asaas \
  -H "Content-Type: application/json" \
  -H "asaas-webhook-signature: sua_signature_aqui" \
  -d '{
    "event": "payment.confirmed",
    "payment": {
      "id": "pay_test",
      "value": 1500.00,
      "status": "RECEIVED"
    }
  }'
```

**3. Verificar Split de Pagamento**
```sql
-- Após pagamento, verificar distribuição
SELECT * FROM split_pagamento WHERE fatura_id = 'uuid'
ORDER BY tipo;

-- Espera:
-- - proprietario: 1200 (80%)
-- - taxa_administracao: 150 (10%)
-- - fundo_reserva: 75 (5%)
-- - caucao: 75 (5%)
```

## Troubleshooting

### "API Key não configurada"
- **Causa:** Variável de ambiente não definida
- **Fix:** Adicionar `NEXT_PUBLIC_ASAAS_API_KEY` ao `.env.local`
- **Verificar:** `npm run build` mostra erro de variável faltante?

### "Erro ao conectar com Asaas"
- **Causa 1:** API Key inválida ou expirada
  - **Fix:** Regenerar em Asaas → Configurações → Credenciais
- **Causa 2:** Conta sandbox sem saldo
  - **Fix:** Adicionar fundos ou usar modo teste
- **Causa 3:** IP bloqueado
  - **Fix:** Whitelist de IP em Configurações → Segurança

### "Webhook não recebido"
- **Causa 1:** URL de webhook incorreta
  - **Fix:** Verificar em Asaas → Configurações → Webhooks
- **Causa 2:** Firewall/proxy bloqueando
  - **Fix:** Permitir origem `webhooks.asaas.com`
- **Causa 3:** Assinatura inválida
  - **Fix:** Verificar se `ASAAS_WEBHOOK_SECRET` está correto

### "Cobrança não criada"
- **Causa 1:** Cliente não existe em Asaas
  - **Fix:** Validar CPF/CNPJ antes de criar cobrança
- **Causa 2:** Data vencimento no passado
  - **Fix:** Usar `dueDate` mínimo de 24h no futuro
- **Causa 3:** Erro de valor (centavos)
  - **Fix:** Converter para centavos: `1500.50` → `150050`

## Security

**Implementado:**
- ✓ Validação de assinatura HMAC-SHA256 em webhooks
- ✓ Verificação de autenticação no admin
- ✓ Permissões por role (admin/economista)
- ✓ Logging de todas as operações (audit_log)
- ✓ Isolamento de dados por usuário (RLS)
- ✓ Rate limiting em endpoints críticos

**Recomendações:**
- ⚠️ Nunca expor API Key em código cliente (use SERVER_ONLY env vars)
- ⚠️ Validar montante antes de processar webhook
- ⚠️ Implementar idempotência (evitar duplicar pagamentos)
- ⚠️ Rotinear credenciais periodicamente
- ⚠️ Usar webhook signature validation sempre

## Monitoring

**Crons que dependem de Asaas:**
- `6:00 AM UTC` - Gerar faturas
- `7:00 AM UTC` - Emitir cobranças (chama Asaas)
- `8:00 AM UTC` - Distribuir recebimentos
- `10:00 AM UTC` - Régua de cobrança (reminders)

**Alertas configuráveis:**
- Falha ao emitir cobrança (retry 3x com backoff)
- Webhook não recebido por >24h
- Saldo insuficiente
- Taxa de chargeback >1%

## Future Enhancements

- [ ] Integração Pix automático (chave dinâmica)
- [ ] Parcelamento automático de contratos
- [ ] Boleto via email (vs manual)
- [ ] Agendamento de débito em conta
- [ ] Análise de risco creditício (scoring)
- [ ] Link de pagamento customizado (landing page)
- [ ] Marketplace mode (múltiplos credores)
- [ ] Conciliação automática bancária

## Related Documentation

- **Faturamento:** `docs/FASE-FINANCEIRO.md`
- **Audit Trail:** `docs/IMPLEMENTACAO-AUDITORIA.md`
- **Notificações:** `docs/NOTIFICACOES-VENCIMENTO.md`
- **API Asaas:** https://docs.asaas.com/reference
