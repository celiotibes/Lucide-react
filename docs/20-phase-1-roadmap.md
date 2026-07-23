# Phase 1: Portal & Analytics Enhancement

**Status:** IN PROGRESS

**Phase 0 Exit Criterion Met:** ✅ Automatic charging with Asaas tested end-to-end in staging

---

## Phase 1 Overview

Phase 1 focuses on **tenant experience** and **business intelligence**:
- Enhanced payment portal with payment plans and lease modifications
- Advanced payment analytics (cohort, churn, revenue forecasting)
- Automated NFS-e generation for service providers
- PIX payment method automation
- WhatsApp notifications via Twilio

---

## Phase 1 Blockers

### Blocker #1: Portal Inquilino Enhancements ⏳

**Components:**
1. **Payment Plan Feature** — Allow tenants to request payment installment plans for overdue amounts
2. **Lease Modification Requests** — Tenants can propose rent increases/decreases
3. **Payment Method Management** — Save PIX keys, update card info
4. **Rent Receipt Download** — Download proof of payment for tax purposes

**Files to Create:**
- `app/portal/contratos/[id]/plano-pagamento/page.tsx` — Request payment plan UI
- `app/portal/contratos/[id]/modificacoes/page.tsx` — Lease modification requests
- `app/portal/settings/metodos-pagamento/page.tsx` — Payment method management
- `app/api/portal/planos-pagamento/criar/route.ts` — Create payment plan
- `app/api/portal/modificacoes/criar/route.ts` — Submit lease modification
- `server/integracao/criarPlanoPagamento.ts` — Payment plan logic

**Database Schema Changes:**
```sql
-- Payment plans
CREATE TABLE planos_pagamento (
  id UUID PRIMARY KEY,
  fatura_id UUID REFERENCES faturas,
  locatario_id UUID REFERENCES pessoas,
  valor_total NUMERIC(14,2),
  num_parcelas SMALLINT,
  data_inicio DATE,
  status TEXT ('ativo', 'pago', 'cancelado'),
  criado_em TIMESTAMPTZ
);

-- Lease modification requests
CREATE TABLE modificacoes_contrato (
  id UUID PRIMARY KEY,
  contrato_id UUID REFERENCES contratos,
  tipo TEXT ('aumento_aluguel', 'diminuicao_aluguel', 'alteracao_prazo'),
  valor_anterior NUMERIC(14,2),
  valor_novo NUMERIC(14,2),
  motivo TEXT,
  status TEXT ('pendente', 'aprovado', 'rejeitado'),
  criado_em TIMESTAMPTZ
);

-- Payment method storage
CREATE TABLE metodos_pagamento (
  id UUID PRIMARY KEY,
  locatario_id UUID REFERENCES pessoas,
  tipo TEXT ('pix', 'cartao_credito'),
  pix_chave TEXT, -- encrypted
  cartao_ultimosDigitos TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ
);
```

**API Endpoints:**
- `POST /api/portal/planos-pagamento/criar` — Request payment plan
- `GET /api/portal/planos-pagamento` — List tenant's payment plans
- `POST /api/portal/modificacoes/criar` — Submit lease modification
- `GET /api/portal/modificacoes` — List tenant's requests
- `POST /api/portal/metodos-pagamento/adicionar` — Add payment method
- `GET /api/portal/comprovantes/[id]/download` — Download payment receipt

---

### Blocker #2: Advanced Payment Analytics 🔄

**Components:**
1. **Cohort Analysis** — Track tenant payment behavior by lease start date
2. **Churn Prediction** — Identify high-risk contracts based on payment patterns
3. **Revenue Forecasting** — Predict monthly revenue based on historical patterns
4. **Delinquency Dashboard** — Real-time view of payment arrears by property

**Implementation:**
- `server/analytics/cohortAnalysis.ts` — Calculate cohort metrics
- `server/analytics/churnPrediction.ts` — ML-based risk scoring
- `server/analytics/revenueForecasting.ts` — Time-series forecasting
- `app/admin/analytics/dashboard/page.tsx` — Analytics dashboard UI

**Metrics:**
- Payment rate by cohort (% paying on time)
- Average days late by property
- Predicted churn risk (0-100 score)
- Revenue forecast (30/60/90 days ahead)

---

### Blocker #3: Automated NFS-e Generation 🧾

**Scope:** Service provider invoicing
- Auto-generate NFS-e (Nota Fiscal de Serviços Eletrônica) for maintenance/repairs
- Integration with municipal tax system (varies by city)
- Webhook to notify provider of invoice generation

**Files:**
- `server/integracao/gerarNFSe.ts` — NFS-e generation
- `app/api/webhooks/nfse-confirmacao/route.ts` — Webhook handler
- `app/prestador/nfs-e/[id]/page.tsx` — Provider dashboard

**API Endpoint:**
- `POST /api/cron/gerar-nfse` — Daily cron to generate pending NFS-e

---

### Blocker #4: PIX Payment Automation 💳

**Scope:** Modern payment method support
- Generate dynamic PIX QR codes for each bill
- Real-time PIX settlement notification
- Auto-reconciliation with Asaas

**Implementation:**
- `server/integracao/gerarQrCodePix.ts` — PIX QR code generation
- Enhanced webhook processing for PIX events
- Real-time notification to tenant when payment confirmed

---

### Blocker #5: WhatsApp Notifications 📱

**Scope:** Multi-channel tenant communication
- Send payment reminders via WhatsApp
- Lease modification status updates
- Payment confirmation notifications

**Implementation:**
- Twilio WhatsApp integration
- `server/integracao/notificacoesWhatsApp.ts` — Message sender
- Templates for common notifications
- Opt-in/opt-out management

---

## Implementation Priority

**Week 1-2 (Portal Enhancements):**
1. Payment plan UI & API
2. Lease modification UI & API
3. Payment method management

**Week 3-4 (Analytics & Automation):**
1. Cohort analysis implementation
2. Churn prediction model
3. Revenue forecasting

**Week 5-6 (Payment Methods):**
1. NFS-e generation
2. PIX QR code automation
3. WhatsApp integration

---

## Success Criteria

✅ Tenant can request payment plan (reduce default risk)
✅ Tenant can submit lease modification (improve retention)
✅ Admin has real-time payment analytics dashboard
✅ NFS-e auto-generated for service providers
✅ PIX payments processed in <2 seconds
✅ WhatsApp notifications sent to opted-in tenants

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| PII exposure (PIX keys, card data) | Encrypt with KMS, never log plaintext |
| NFS-e integration complexity | Start with São Paulo (largest market), add cities incrementally |
| WhatsApp cost | Set daily cap, implement opt-in gating |
| Churn model accuracy | Start with rule-based, add ML incrementally |

---

## Post-Phase-1 (Phase 2)

- Mobile app (React Native)
- Offline payment entry
- Advanced OCR for receipts
- Automated debt collection workflow
- Investor payout automation

---

**Next Commit:** Portal Inquilino enhancements (payment plan feature)
