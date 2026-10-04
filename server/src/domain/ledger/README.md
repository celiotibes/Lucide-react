# Ledger System Documentation

## Overview

The Ledger module implements a complete double-entry bookkeeping system for the financial ERP. It records all financial transactions in categorized entries (receitas, despesas) and integrates with existing payment systems (PIX, ASAAS).

## Architecture

### Components

1. **ledger-types.ts**: Type definitions and interfaces
   - `LedgerEntry`: Single financial entry
   - `DoubleEntryLancamento`: Double-entry (debit + credit) transaction
   - `CategoriaLancamento`: Categorized entry types
   - `TipoLancamento`: Receipt (receita) or Expense (despesa)

2. **ledger-service.ts**: Core business logic
   - `registrarLancamento()`: Register single entry
   - `registrarDoubleEntry()`: Register double-entry transaction
   - `obterLancamento()`: Retrieve entry by ID
   - `listarLancamentos()`: List entries with filters
   - `calcularSaldoPorCategoria()`: Calculate category balances
   - `validarIntegridade()`: Validate entry integrity

3. **__tests__/ledger-service.test.ts**: Comprehensive test suite
   - 28 tests covering all functions
   - Validation tests
   - Integration tests

## Database Schema

Uses `ledger_entries` table with:
- `id` (UUID, primary key)
- `data` (date, YYYY-MM-DD format)
- `tipo` ('receita' or 'despesa')
- `categoria` (validated category per type)
- `valor` (amount in decimal, always > 0)
- `descricao` (description)
- `referencia_externa` (external tracking ID)
- `usuario_id` (user who created entry)
- `criado_em`, `atualizado_em` (timestamps)

### Categories

**Receitas (Income):**
- `receita`: General revenue
- `aluguel`: Rental income
- `honorario`: Professional fees
- `extraordinaria`: Extraordinary/one-off income

**Despesas (Expenses):**
- `comissao`: Commissions
- `imposto`: Taxes
- `folha_pagamento`: Payroll
- `condominio`: Condo fees
- `manutencao`: Maintenance
- `juros`: Interest

## Usage Examples

### Register Single Entry

```typescript
import { registrarLancamento } from './ledger-service.js';

const resultado = registrarLancamento(db, {
  id: randomUUID(),
  data: '2024-10-04',
  tipo: 'receita',
  categoria: 'honorario',
  valor: 1500.00,
  descricao: 'Consulting fee - Client ABC',
  usuario_id: 'user-123',
});

if (resultado.sucesso) {
  console.log(`Entry registered: ${resultado.lancamento_id}`);
} else {
  console.log(`Error: ${resultado.erro}`);
}
```

### Register Double-Entry Transaction

```typescript
import { registrarDoubleEntry } from './ledger-service.js';

// PIX reception: debit Cash (1120), credit Revenue (4110)
const resultado = registrarDoubleEntry(db, {
  id: randomUUID(),
  data: '2024-10-04',
  descricao: 'PIX Reception - Client',
  conta_debito: '1120',    // Cash PIX
  conta_credito: '4110',   // Revenue
  valor: 2500.00,
  tipo: 'receita',
  categoria: 'receita',
  usuario_id: 'system',
});
```

### List and Filter Entries

```typescript
const lancamentos = listarLancamentos(db, {
  dataInicio: '2024-10-01',
  dataFim: '2024-10-31',
  tipo: 'receita',
  categoria: 'honorario',
  usuarioId: 'user-123',
});
```

### Calculate Category Balances

```typescript
const saldos = calcularSaldoPorCategoria(db, '2024-10-01', '2024-10-31');

console.log('Honorarios:', saldos['honorario']);        // positive (income)
console.log('Folha de Pagamento:', saldos['folha_pagamento']); // negative (expense)
```

## Integration Points

The ledger system integrates with:

### 1. PIX/OFX Reconciliation
**File**: `server/src/domain/integracoes/conciliacao-pix-ofx.ts`

When PIX transactions are reconciled:
- Registers double-entry: Debit Caixa PIX (1120), Credit Receita (4110)
- References: `CHARGE-{chargeId}`
- User: `sistema-pix-reconciliacao`

### 2. ASAAS Payments
**File**: `server/src/domain/integracoes/asaas-pagamentos-pix.ts`

When PIX payments are completed:
- Registers expense: Category `comissao` (or customizable)
- References: `ASAAS-PAG-{asaasPaymentId}`
- User: `sistema-asaas-pagamentos`

### 3. Manual Journal Entries (Future)
Routes will be added to allow manual ledger entry creation by authorized users.

## Validation Rules

All entries are validated for:

1. **Date Format**: Must be `YYYY-MM-DD`
2. **Amount**: Must be positive number
3. **Type-Category Mapping**: Category must be valid for its type
4. **Required Fields**: date, tipo, categoria, valor
5. **Double-Entry Constraints**:
   - Debit and credit accounts must be different
   - Both accounts must be valid

## Audit Trail

All entries are logged in the `auditoria` table with:
- User ID who created the entry
- Action (create/update/delete)
- Timestamp
- Details (descricao + valor)

## Testing

Run all ledger tests:
```bash
npm test -- server/src/domain/ledger/__tests__/ledger-service.test.ts
```

Test categories:
- Basic entry registration
- Double-entry bookkeeping
- Validation rules
- Filtering and aggregation
- Audit trail
- Integrity checks
- Integration scenarios

## Error Handling

The service uses a consistent result format:

```typescript
interface ResultadoRegistroLancamento {
  sucesso: boolean;
  lancamento_id?: string;  // Only if successful
  erro?: string;           // Only if failed
  mensagem?: string;       // User-friendly message
}
```

All operations are logged:
- Success entries logged at INFO level
- Errors logged at ERROR level
- Warnings for non-critical issues at WARN level

## Performance Considerations

Indexes on:
- `data` (most common query pattern)
- `tipo` and `categoria` (filtering)
- `usuario_id` (audit trail)
- `referencia_externa` (deduplication)
- `data + tipo + categoria` (period-based analytics)

Typical query performance:
- Single entry lookup: < 1ms
- Period queries (90 days): < 50ms
- Category aggregation: < 100ms

## Future Enhancements

1. **Chart of Accounts**: Validate contra codes from dedicated table
2. **Budget Tracking**: Add budget alerts when expenses exceed limits
3. **Multi-currency**: Support for foreign exchange transactions
4. **Reconciliation**: Automated reconciliation with bank statements
5. **Reporting**: DRE (Income Statement), Cash Flow, Trial Balance
6. **Approvals**: Workflow for high-value entries
7. **Reversals**: Support for reversing entries with proper audit trail

## Security

- All operations logged in audit trail
- User ID tracked for all entries
- Referencia_externa prevents duplicate processing
- Validation prevents invalid account combinations
- Database constraints enforce data integrity
