# Email Notifications: Contract Expiry Alerts

## Overview

Automated email notification system for contract expiry alerts. Sends HTML-formatted emails to tenants and landlords about upcoming contract termination dates, helping maintain continuity and compliance with notice period requirements.

## Features

- **Scheduled Cron**: Runs daily at 6:30 AM UTC (after billing generation)
- **Dual Notifications**: Sends emails to both tenant and landlord
- **Smart Tracking**: Prevents duplicate notifications via `notificacao_vencimento_enviada_em`
- **Reset on Renewal**: Notification flag resets when contract status changes back to 'ativo'
- **Preview Endpoint**: Test email templates via `/api/notificacoes/preview`
- **Admin Dashboard**: Monitor and manually trigger notifications at `/admin/notificacoes`

## Architecture

### Database Schema

```sql
ALTER TABLE contratos ADD COLUMN notificacao_vencimento_enviada_em timestamptz;

CREATE INDEX idx_contratos_notificacao_vencimento_pendente
  ON contratos(data_fim)
  WHERE status = 'ativo' AND notificacao_vencimento_enviada_em IS NULL;
```

**Fields involved:**
- `contratos.data_fim` — Contract end date (trigger notification 30 days before)
- `contratos.aviso_previo_dias` — Notice period (default 30 days) used in email
- `contratos.status` — Only 'ativo' contracts trigger notifications
- `contratos.notificacao_vencimento_enviada_em` — Timestamp of last sent notification

### Server Functions

**`server/notificacoes/enviarEmailVencimento.ts`**
- Accepts array of contract objects
- Formats professional HTML emails with gradient header
- Sends via Resend API (requires `RESEND_API_KEY`)
- Returns array of results with success/error status

**Signature:**
```typescript
export async function enviarEmailVencimento(
  contratos: ContratoVencimento[],
): Promise<ResultadoNotificacao[]>
```

**Input:**
```typescript
interface ContratoVencimento {
  id: string;
  imovel_identificacao: string;
  locatario_nome: string;
  locatario_email: string;
  locador_nome: string;
  locador_email: string;
  data_fim: string;           // ISO date: YYYY-MM-DD
  aviso_previo_dias: number;
  valor_aluguel: number;
  status: string;
}
```

**Output:**
```typescript
interface ResultadoNotificacao {
  contrato_id: string;
  sucesso: boolean;
  erro?: string;
  email_locatario?: string;
  email_locador?: string;
}
```

### API Endpoints

#### 1. Cron: Daily Notifications
**`GET /api/cron/notificar-vencimentos`**

Scheduled to run daily at 6:30 AM UTC via Vercel Crons.

**Headers Required:**
```
Authorization: Bearer ${CRON_SECRET}
```

**Response (200 OK):**
```json
{
  "mensagem": "Notificações enviadas",
  "total": 5,
  "sucesso": 5,
  "falhas": 0,
  "detalhes": [
    {
      "contrato_id": "uuid",
      "sucesso": true,
      "email_locatario": "inquilino@email.com",
      "email_locador": "locador@email.com"
    }
  ]
}
```

**Logic:**
1. Query contracts expiring within 30 days
2. Filter: `status = 'ativo'` AND `notificacao_vencimento_enviada_em IS NULL`
3. Join with `contrato_partes` to get tenant/landlord emails
4. Call `enviarEmailVencimento()`
5. Update `notificacao_vencimento_enviada_em` timestamp for successful sends

#### 2. Preview Endpoint
**`POST /api/notificacoes/preview`**

Test email template without modifying database.

**Headers:**
```
Content-Type: application/json
X-Preview-Token: ${PREVIEW_TOKEN}  (dev only)
```

**Body:**
```json
{
  "locatario_nome": "João Silva",
  "locatario_email": "joao@email.com",
  "locador_nome": "Maria Santos",
  "locador_email": "maria@email.com",
  "imovel_identificacao": "Apto 301",
  "data_fim": "2026-09-15",
  "valor_aluguel": 1500.00,
  "aviso_previo_dias": 30
}
```

**Response:**
```json
{
  "mensagem": "Email de preview enviado com sucesso",
  "resultados": [
    {
      "contrato_id": "preview-1234567890",
      "sucesso": true,
      "email_locatario": "joao@email.com",
      "email_locador": "maria@email.com"
    }
  ]
}
```

#### 3. Admin Dashboard Data
**`GET /api/admin/contratos-vencimento`**

Fetch contracts expiring in next 30 days (admin/economista only).

**Response:**
```json
[
  {
    "id": "uuid",
    "imovel_identificacao": "Kitnet 14",
    "locatario_nome": "João Silva",
    "data_fim": "2026-09-15",
    "valor_aluguel": 1500.00,
    "diasAteVencimento": 24,
    "notificacao_enviada": true
  }
]
```

## Environment Variables

```env
# Resend API Key (https://resend.com)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Cron Authentication
CRON_SECRET=your-secure-random-token

# Optional: For preview endpoint security
PREVIEW_TOKEN=dev-token-only

# Optional: Email fallback if locador has no email
SUPORTE_EMAIL=suporte@crmt.dev

# Application URL (for email links)
NEXT_PUBLIC_APP_URL=https://app.example.com
```

## UI Components

### Admin Notifications Page
**`/admin/notificacoes`**

- Lists all contracts expiring in next 30 days
- Color-coded urgency badges (red ≤7 days, yellow ≤14 days, green >14 days)
- Status indicator: "Notificado" (sent) / "Pendente" (not yet sent)
- Manual trigger button to execute notifications immediately
- Requires admin/economista role

**Features:**
- Real-time reload after manual execution
- Error/success messaging
- Responsive table with imovel code, tenant name, rent amount

## Email Template

Both emails use responsive HTML with:
- Gradient header (purple/blue)
- Alert box highlighting days until expiry
- Contract details section
- Call-to-action button to portal
- Professional footer

**Tenant Email:**
- Subject: "⏰ Seu contrato vence em X dias"
- Emphasizes renewal/move-out options
- Includes notice period requirement

**Landlord Email:**
- Subject: "📋 Contrato de [IMOVEL] vencendo em X dias"
- Informs of upcoming contract expiry
- Suggests action needed for renewal/termination

## Trigger Conditions

Notification is sent when ALL of these are true:
- Contract status = 'ativo'
- `data_fim <= TODAY + 30 days`
- `notificacao_vencimento_enviada_em IS NULL` (never sent before)

## Reset Behavior

Notification flag is cleared when:
- Contract transitions from 'encerrado'/'extrajudicial'/'em_despejo' → 'ativo'
- This allows re-notification if contract is renewed

Example: Contract X ends 2026-09-15, notification sent 2026-08-16. If contract is terminated (status='encerrado'), then renewed with same date, notification flag resets and will send again on the new 30-day window.

## Cron Schedule

**Vercel crons configuration (vercel.json):**
```json
{
  "path": "/api/cron/notificar-vencimentos",
  "schedule": "30 6 * * *"
}
```

Runs every day at 06:30 UTC (after billing: 06:00, before collection: 07:00).

## Error Handling

- Individual email failures don't block the cron
- Errors are logged to console and returned in response
- Successful sends update database timestamp even if some emails fail
- Failed sends can be retried manually via admin dashboard

## Testing

### Manual Test (Development)
```bash
# Test the cron locally
curl -H "Authorization: Bearer ${CRON_SECRET}" \
  http://localhost:3000/api/cron/notificar-vencimentos

# Test email preview
curl -X POST http://localhost:3000/api/notificacoes/preview \
  -H "Content-Type: application/json" \
  -d '{
    "locatario_nome": "Teste",
    "locatario_email": "seu-email@example.com",
    "locador_nome": "Locador",
    "locador_email": "locador@example.com",
    "imovel_identificacao": "Apto 301",
    "data_fim": "2026-09-15",
    "valor_aluguel": 1500.00
  }'
```

### Database Test
```sql
-- Check pending notifications
SELECT id, data_fim, status, notificacao_vencimento_enviada_em
FROM contratos
WHERE status = 'ativo'
  AND data_fim <= NOW() + INTERVAL '30 days'
  AND data_fim >= NOW()
  AND notificacao_vencimento_enviada_em IS NULL
ORDER BY data_fim ASC;

-- Check sent notifications
SELECT id, data_fim, notificacao_vencimento_enviada_em
FROM contratos
WHERE notificacao_vencimento_enviada_em IS NOT NULL
ORDER BY notificacao_vencimento_enviada_em DESC
LIMIT 10;
```

## Troubleshooting

### Emails not sending

**Problem:** Cron runs but no emails received
- **Check:** `RESEND_API_KEY` is valid and has quota remaining
- **Check:** Contracts have locatarios with email addresses
- **Check:** Contract dates are correctly in the next 30 days
- **Check:** `notificacao_vencimento_enviada_em` is NULL for test contracts

### Duplicate notifications

**Problem:** Same contract notified multiple times
- **Check:** `notificacao_vencimento_enviada_em` timestamp is being set
- **Check:** Trigger `trigger_reset_notificacao_vencimento` is functioning

### Emails show wrong information

**Problem:** Email displays incorrect locatario/locador
- **Check:** `contrato_partes` has correct roles ('locatario_principal', 'fiador')
- **Check:** Linked `pessoas` records have email addresses
- **Check:** `imovel.identificacao` is populated

## Future Enhancements

- [ ] SMS notifications via Twilio for critical alerts (<7 days)
- [ ] WhatsApp messages for additional tenant communication
- [ ] Email template customization via admin dashboard
- [ ] Notification history/audit log for compliance
- [ ] Multi-language support (currently pt-BR only)
- [ ] Calendar integration (iCal for tenant/landlord calendar apps)
- [ ] Renewal suggestion automation (if renewal clause exists)
- [ ] Post-expiry follow-up notifications (7 days after termination)

## Related Documentation

- **Row-Level Security:** `docs/IMPLEMENTACAO-RLS.md`
- **Audit Trail:** `docs/` (audit logging for all contracts)
- **Cron Infrastructure:** `vercel.json` (all scheduled jobs)
- **Email Provider:** https://resend.com/docs
