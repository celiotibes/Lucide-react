# Audit Logging for Financial Operations

## Overview

All financial operations (faturas, cobranças, recebimentos, reajustes) must be logged for compliance and troubleshooting.

**Status:** PRECONDITION FOR PRODUCTION  
**Priority:** HIGH

## Which Crons Need Audit Logging

All crons that modify financial data must log their operations:

1. **gerar-fatura-mensal** - Creates new invoices
   - Log: Invoice creation with amount and contract ID
   - Fields: `{ contratoId, valor, dataVencimento, usuarioId: 'system' }`

2. **emitir-cobrancas** - Issues payment requests
   - Log: Charge issuance with reference
   - Fields: `{ faturasIds, valorTotal, dataEmissao }`

3. **distribuir-recebimentos** - Records payments
   - Log: Payment allocation
   - Fields: `{ cobrancaId, valor, dataRecebimento }`

4. **reajuste-anual** - Applies annual increases
   - Log: Rent increase applied
   - Fields: `{ contratoId, percentualReajuste, valorAnterior, valorNovo }`

5. **gerar-multa-juros** - Calculates late fees
   - Log: Penalty/interest calculation
   - Fields: `{ contratoId, tipoCalculo, valor }`

6. **faturar-energia** - Bills energy costs
   - Log: Energy billing
   - Fields: `{ imovelId, kWh, valor }`

7. **regua-cobranca** - Collection strategy
   - Log: Collection rules applied
   - Fields: `{ contratoId, diasAtraso, novoStatus }`

## Implementation Pattern

### Current (Without Audit)
```typescript
const { rows } = await pool.query('INSERT INTO faturas ...');
return NextResponse.json({ sucesso: true });
```

### Required (With Audit)
```typescript
import { logFiscalOperation } from '@/server/integracao/sentry-client';

const { rows } = await pool.query('INSERT INTO faturas ...');

// Log the operation
logFiscalOperation('fatura', rows[0].id, {
  contratoId: contrato.id,
  valor: fatura.valor,
  dataVencimento: fatura.vencimento,
  usuarioId: 'system', // or get from request context
});

return NextResponse.json({ sucesso: true });
```

## Audit Log Storage

Two storage methods:

### Option 1: Sentry (Recommended)
- Real-time error tracking
- Environment: automatic (dev/staging/prod)
- Retention: 90 days (adjustable)
- Searchable by tag (fiscal/operation type)

```typescript
import { logFiscalOperation } from '@/server/integracao/sentry-client';

logFiscalOperation('fatura', faturasId, {
  contratoId,
  valor,
  dataVencimento,
});
```

### Option 2: Database Audit Table
- Permanent storage
- Compliance/tax requirements
- Queryable for reports

```sql
CREATE TABLE IF NOT EXISTS audit_operacoes_fiscais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_operacao VARCHAR(50), -- 'fatura', 'cobranca', 'recebimento', etc
  referencia_id VARCHAR(255), -- ID da fatura/cobrança/etc
  valor_operacao DECIMAL(15, 2),
  usuario_id UUID, -- 'system' for crons
  detalhes JSONB,
  criado_em TIMESTAMPTZ DEFAULT now(),
  
  INDEX idx_tipo_data (tipo_operacao, criado_em),
  INDEX idx_usuario (usuario_id)
);
```

## Required Updates

### 1. package.json
Add Sentry package (if not already present):
```bash
npm install @sentry/node @sentry/tracing
```

### 2. Environment Variables
```bash
# Required for Sentry integration
SENTRY_DSN=https://your-sentry-key@sentry.io/project

# Optional: for local audit database
ENABLE_LOCAL_AUDIT_LOG=true
```

### 3. Cron Files to Update
Each file needs:
- Import audit logger
- Add logFiscalOperation() after financial operations
- Wrap with try-catch for Sentry tracking

**Files:**
- [ ] app/api/cron/gerar-fatura-mensal/route.ts
- [ ] app/api/cron/emitir-cobrancas/route.ts
- [ ] app/api/cron/distribuir-recebimentos/route.ts
- [ ] app/api/cron/reajuste-anual/route.ts
- [ ] app/api/cron/gerar-multa-juros/route.ts
- [ ] app/api/cron/faturar-energia/route.ts
- [ ] app/api/cron/regua-cobranca/route.ts

## Example Implementation

### Before
```typescript
// app/api/cron/gerar-fatura-mensal/route.ts
export async function GET(request: NextRequest) {
  const pool = obterPool();
  
  const { rows: faturas } = await pool.query(
    'INSERT INTO faturas (...) VALUES (...) RETURNING *'
  );
  
  return NextResponse.json({ total: faturas.length });
}
```

### After
```typescript
import { logFiscalOperation, createCronHandler } from '@/server/integracao/sentry-client';

export async function GET(request: NextRequest) {
  const handler = createCronHandler(async () => {
    const pool = obterPool();
    
    const { rows: faturas } = await pool.query(
      'INSERT INTO faturas (...) VALUES (...) RETURNING *'
    );
    
    // Log each fatura
    for (const fatura of faturas) {
      logFiscalOperation('fatura', fatura.id, {
        contratoId: fatura.contrato_id,
        valor: fatura.valor_bruto,
        dataVencimento: fatura.vencimento,
        dataEmissao: new Date().toISOString(),
      });
    }
  }, 'gerar-fatura-mensal');
  
  await handler();
  return NextResponse.json({ total: faturas.length });
}
```

## Compliance Notes

### Brazil Tax Requirements (RFC 9999 Compliance)
- [ ] All financial transactions must be logged
- [ ] Logs must include: who, what, when, why
- [ ] Retention: minimum 5 years
- [ ] Must be immutable (no deletion/modification)

### GDPR (if applicable)
- [ ] Sensitive personal data must be encrypted
- [ ] Access logs must track who viewed financial records
- [ ] Data retention policies must be defined

## Testing

### Manual Testing
```bash
# Trigger a cron job
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/gerar-fatura-mensal

# Check Sentry dashboard for logged operations
```

### Automated Testing
```typescript
// Add to test files
import { logFiscalOperation } from '@/server/integracao/sentry-client';

describe('Audit Logging', () => {
  it('should log fiscal operations', () => {
    // Mock Sentry
    const spy = jest.spyOn(Sentry, 'captureMessage');
    
    logFiscalOperation('fatura', 'test-id', {
      contratoId: 'contract-123',
      valor: 1000,
    });
    
    expect(spy).toHaveBeenCalledWith('Fiscal [fatura] test-id', 'info');
  });
});
```

## Monitoring

### Sentry Dashboard
1. Go to Sentry project
2. Filter: `tags:operation_type:"fiscal"`
3. View all financial operations

### Database Query (Local Audit)
```sql
SELECT * FROM audit_operacoes_fiscais
WHERE tipo_operacao = 'fatura'
  AND criado_em >= NOW() - INTERVAL '1 day'
ORDER BY criado_em DESC;
```

## Next Steps

1. [ ] Review this guide with legal/compliance team
2. [ ] Set up Sentry account and DSN
3. [ ] Create database migration for audit table
4. [ ] Update all financial crons with audit logging
5. [ ] Add tests for audit logging
6. [ ] Document retention policies
7. [ ] Deploy to staging for testing
8. [ ] Deploy to production with monitoring

---

**Last Updated:** 2026-09-13  
**Status:** PRECONDITION - Must complete before production deployment  
**Owner:** DevOps + Compliance
