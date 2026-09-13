# Compliance & Audit System (LGPD / Fiscal)

## Overview

Comprehensive audit trails, compliance tracking, and regulatory fulfillment for:
- **LGPD** (Lei Geral de Proteção de Dados) - Brazilian data protection law
- **Fiscal Compliance** - NF-e, PIX, financial transaction tracking
- **Access Control** - Authentication, authorization, and permission auditing
- **Data Retention** - Automated retention policies and safe deletion

## Architecture

### Core Audit Tables

#### 1. **auditoria_geral** - Master audit log
- All system actions (create, update, delete, export)
- User, timestamp, endpoint tracking
- Before/after value snapshots
- IP and user agent logging

#### 2. **auditoria_fiscal** - Fiscal compliance trail
- NFS-e emissions and cancellations
- PIX transfers (sent, confirmed, failed)
- Invoice generation and payment
- Document numbers, protocols, XML content

#### 3. **auditoria_acesso** - Access control audit
- Login/logout events
- Failed access attempts
- Permission changes
- Geographic location (if available)

#### 4. **requisicoes_lgpd** - LGPD data requests
- User requests for anonymization, portability, deletion
- Status tracking (pending → analyzed → approved → executed)
- Analysis notes and conclusions
- Execution records with timestamps

#### 5. **auditoria_consentimento** - Consent tracking
- Processing, marketing, cookies, third-party sharing
- Grant/revocation events
- Policy version tracking
- Expiration management

### Retention Policies

```sql
- Fiscal tables (NF-e, PIX, invoices): 2,555 days (7 years)
- Audit logs: 1,095 days (3 years)
- Access logs: 365 days (1 year)
- Deleted records: 90 days soft-delete, then permanent
```

## LGPD Compliance

### Three Core Rights

#### 1. **Right to Anonymization** (Anonimização)

```typescript
// User request
const resultado = await solicitarAnonimizacao(
  pessoa_id,
  "Solicitar remoção de dados pessoais"
);

// Admin approval and execution
await executarAnonimizacao(requisicao_id);
```

**What gets anonymized:**
- Full name → `ANONIMIZADO_XXXXX` (hashed suffix)
- Email → `anonimizado+XXXXX@anonimo.local`
- Phone → NULL (removed)
- Address → NULL (removed)

**Log entry:** `lgpd_anonimizacoes_log` tracks all anonymizations

#### 2. **Right to Data Portability** (Portabilidade)

```typescript
const resultado = await exportarDadosPessoa(pessoa_id);

// Returns JSON with:
// - Personal data
// - Service contracts
// - Timesheets
// - Closings
// - Export timestamp
```

**Format:** JSON (easily imported elsewhere)  
**Timeline:** Provided within 30 days of request

#### 3. **Right to Deletion** (Deletação)

```typescript
// Currently managed via soft-delete with recovery window
// Hard deletion after recovery period expires
// Audit trail preserved for 90 days post-deletion
```

### Request Lifecycle

```
Pending → In Analysis → Approved → Executed
  ↓         ↓              ↓          ↓
solicitado analisado     aprovado   executado
```

**Timelines:**
- Receipt acknowledgment: Immediate
- Response (approval/denial): ≤ 15 days
- Execution: ≤ 30 days from approval

## Fiscal Compliance

### NFS-e Tracking

```typescript
auditLogger.logFiscal({
  tipo: 'nfse_emitida',
  prestador_id: uuid,
  fechamento_id: uuid,
  valor_bruto: 5000.00,
  numero_documento: '12345678901234567890123456789012345678901234',
  protocolo: '2024070112345678',
  status: 'autorizado',
  chave_acesso: '35240717123456789012345678901234567890123456',
  xml_content: '<...>',
});
```

### PIX Pipeline Audit

```
Enviado (sent) → Confirmado (confirmed) or Devolvido (failed)
                    ↓
                  Registrado em auditoria_fiscal
```

**Auto-logged on events:**
- PIX sent: `pix_enviado`
- PIX confirmed: `pix_confirmado` → Closure becomes "pago"
- PIX failed: `pix_devolvido` → Closure returns to "aprovado"

### Fiscal Reconciliation

```typescript
const reconciliacao = await auditLogger.obterReconciliacaoFiscal(
  fechamento_id
);

// Returns:
// {
//   valor_fechamento: 5000.00,
//   valor_auditoria: 5000.00,
//   diferenca: 0,
//   reconciliado: true
// }
```

**Alert:** If `diferenca != 0`, creates compliance alert for manual review

## Access Control Audit

### Login/Logout Tracking

Every authentication event logged:
- User ID
- Event type (login, logout, failed_login)
- IP address
- User agent
- Timestamp

### Failed Access Detection

```typescript
// Automatic alerts on:
// - 3+ failed logins in 1 hour → potential brute force
// - Access to unauthorized resources
// - Elevation of privileges
```

### Permission Change Audit

```typescript
// Tracks whenever user roles/permissions change
// Who changed, when, what changed
// Useful for compliance reviews
```

## Server-Side Audit Logger

### Basic Usage

```typescript
import { auditLogger } from '@/server/compliance/auditLogger';

// General audit
await auditLogger.logAuditoria({
  acao: 'atualizar',
  tabela: 'fechamentos_prestador',
  registro_id: fechamento_id,
  valores_antes: { status: 'rascunho' },
  valores_depois: { status: 'aprovado' },
  endpoint: '/api/fechamentos/aprovar',
});

// Access audit
await auditLogger.logAcesso({
  usuario_id: user.id,
  tipo_evento: 'login',
  ip_address: request.ip,
  resultado: 'sucesso',
});

// Fiscal audit
await auditLogger.logFiscal({
  tipo: 'nfse_emitida',
  prestador_id: uuid,
  valor_bruto: 5000,
  status: 'autorizado',
});
```

### LGPD Operations

```typescript
// Request anonymization
await auditLogger.registrarRequisicaoLgpd(
  pessoa_id,
  'anonimizacao',
  'User requested removal'
);

// Execute anonymization
await auditLogger.anonimizarPessoa(pessoa_id, requisicao_id);

// Check alerts
await auditLogger.verificarAlertas();

// Get record audit trail
await auditLogger.obterAuditoriaRegistro('fechamentos_prestador', id);
```

## Compliance Dashboard

### KPI Metrics

- **LGPD Pending Requests** - Requisições pendentes (should be < 15 days)
- **Fiscal Discrepancies** - Diferenças de valor (should = 0)
- **Failed Access Attempts** - Tentativas negadas (monitor for patterns)
- **NFS-e Failures** - NFS-e com problema (should be 0)

### View: `v_compliance_status`

Real-time dashboard showing:

```sql
select * from v_compliance_status;

-- Results:
-- | Requisições LGPD Pendentes | 3 | pending |
-- | Discrepâncias Fiscais | 0 | ok |
-- | Acessos Negados (7 dias) | 2 | warning |
-- | NFS-e com Falha | 0 | ok |
```

## Data Retention & Deletion

### Soft-Delete Recovery Window

1. Record marked as deleted
2. 90-day recovery window
3. Automatic hard deletion after 90 days
4. Audit trail preserved longer (per table policy)

### Automated Retention Cleanup

```bash
# Check for records past retention date
select tabela, count(*) 
from deletacoes_log 
where recuperavel_ate < now() 
group by tabela;

# Automatic hard delete (runs nightly)
-- Handled by database trigger/job
```

## Alerts & Notifications

### Automatic Alert Types

| Alert | Condition | Severity |
|-------|-----------|----------|
| LGPD Pending | Requisição não processada > 15 dias | critical |
| Fiscal Discrepancy | Valor auditado ≠ fechamento | warning |
| Access Denied | Múltiplas tentativas de acesso negado | warning |
| NFS-e Failed | NFS-e com status "denegado" | critical |

### Compliance Notifications

Alerts sent to:
- Compliance officer (email)
- Financial team (for fiscal alerts)
- Admin (for access alerts)

## API Endpoints

### LGPD Management

```bash
# Request anonymization
POST /api/compliance/lgpd/anonimizar
{ pessoa_id, motivo }

# Export personal data
GET /api/compliance/lgpd/exportar?pessoa_id=UUID

# Revoke consent
POST /api/compliance/lgpd/revogar-consentimento
{ tipo_consentimento }

# List requests (admin)
GET /api/compliance/lgpd/requisicoes?status=pendente
```

### Audit Trail Access

```bash
# Get record audit history
GET /api/compliance/auditoria?tabela=fechamentos_prestador&id=UUID

# Get access logs
GET /api/compliance/acesso?usuario_id=UUID&dias=30

# Get fiscal audit
GET /api/compliance/fiscal?tipo=nfse_emitida&mes=2024-07
```

### Compliance Dashboard

```bash
# Get compliance status
GET /api/compliance/status

# Response:
{
  "lgpd_pendentes": 3,
  "discrepancias_fiscais": 0,
  "acessos_negados_7d": 2,
  "nfse_falhas": 0
}
```

## Security Considerations

### Row-Level Security (RLS)

- Audit tables inherit RLS from source tables
- Users can only see their own access logs
- Admins see all
- Compliance officers see LGPD requests

### Immutable Audit Trail

- Timestamps: `now()` server-side (not client)
- No updates to audit entries
- Deletion only via retention policy
- All deletions logged in `deletacoes_log`

### Data Encryption

```typescript
// Sensitive values in audit trail
values_antes: { cpf: 'xxxxx123', chave_pix: 'xxx' }
// Should be masked before logging to reduce exposure
```

## Compliance Checklists

### Weekly Compliance Review

- [ ] Review LGPD pending requests
- [ ] Check for access anomalies
- [ ] Verify all NFS-e emitted successfully
- [ ] Confirm PIX reconciliation

### Monthly Review

- [ ] Audit all user access patterns
- [ ] Verify fiscal reconciliation (0 discrepancies)
- [ ] Review retention policy adherence
- [ ] Generate compliance report

### Quarterly Review

- [ ] Full audit trail analysis
- [ ] LGPD compliance status
- [ ] Fiscal compliance summary
- [ ] Security incident review

## Troubleshooting

### "Requisição LGPD não encontrada"

- Check status in UI
- Verify person exists
- Confirm not already executed

### Audit trail gaps

- Check if table logging enabled
- Verify trigger exists: `log_auditoria_geral()`
- Monitor audit table growth

### Fiscal discrepancies

- Run reconciliation query
- Check for rounding errors (use numeric 14,2)
- Verify timestamps match

## Future Enhancements

1. **Real-time Compliance Dashboard** - Live alerts
2. **Automated Report Generation** - Monthly compliance reports
3. **Integration with RegTech** - Third-party compliance services
4. **Advanced Analytics** - ML anomaly detection
5. **Blockchain Audit Trail** - Immutable hash chain (optional)
