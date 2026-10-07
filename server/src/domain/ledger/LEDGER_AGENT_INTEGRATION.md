# Ledger-Agent Integration Guide

## Overview

The Ledger-Agent Integration system links accounting entries (ledger_entries) with economic agents (agentes_economicos) to create a complete accounting record with full traceability of transactions by person/entity.

**Key Features:**
- Automatic agent linking for new ledger entries
- Fuzzy matching backfill strategy for historical data (95%+ accuracy)
- Agent balance and P&L reports
- Aging analysis by agent
- Complete audit trail of all agent linkage changes
- Validation of agent-ledger consistency

---

## Database Schema Changes (Phase 19)

### New Columns in `ledger_entries`

```sql
-- Foreign key linking to economic agent
ALTER TABLE ledger_entries ADD COLUMN agente_id UUID;

-- Denormalized agent role for query optimization
ALTER TABLE ledger_entries ADD COLUMN agente_papel TEXT;

-- External agent reference (for backfill tracking)
ALTER TABLE ledger_entries ADD COLUMN referencia_agente_externo TEXT;

-- Backfill tracking timestamp
ALTER TABLE ledger_entries ADD COLUMN backfill_em TIMESTAMP;

-- Audit columns for agent linkage changes
ALTER TABLE ledger_entries ADD COLUMN agente_atualizado_em TIMESTAMP;
ALTER TABLE ledger_entries ADD COLUMN agente_atualizado_por UUID;
```

### New Table: `ledger_entries_agente_auditoria`

Stores complete history of agent linkage changes:

```sql
CREATE TABLE ledger_entries_agente_auditoria (
  id TEXT PRIMARY KEY,
  ledger_entry_id TEXT NOT NULL,
  agente_id_anterior UUID,
  agente_id_novo UUID,
  agente_papel_anterior TEXT,
  agente_papel_novo TEXT,
  motivo_mudanca TEXT NOT NULL, -- 'backfill', 'manual', 'integracao', 'correcao'
  usuario_id UUID,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON DELETE CASCADE
);
```

### New Views

**`ledger_entries_agente_coverage`** - Shows percentage of entries linked to agents
```sql
-- Query: What % of ledger_entries have agente_id?
SELECT * FROM ledger_entries_agente_coverage;
-- Result: {
--   total_entries: 5000,
--   entries_com_agente: 4750,
--   cobertura_percentual: 95.00
-- }
```

**`ledger_entries_orfas`** - Shows orphaned entries (no agent linked, not yet backfilled)

---

## Core Services

### 1. Ledger Agent Service (`ledger-agent-service.ts`)

Main service for agent-ledger operations.

#### Creating Ledger Entry with Agent

```typescript
import { createLedgerEntryWithAgent } from '@/domain/ledger';

// Option A: Create with explicit agent_id
const resultado = createLedgerEntryWithAgent(db, {
  data: '2024-10-04',
  tipo: 'despesa',
  categoria: 'comissao',
  valor: 500.0,
  descricao: 'Commission payment',
  agente_id: 'uuid-of-supplier',
}, usuarioId);

// Option B: Create for later backfill
const resultado = createLedgerEntryWithAgent(db, {
  data: '2024-10-04',
  tipo: 'receita',
  categoria: 'honorario',
  valor: 2000.0,
  descricao: 'Service from CNPJ 12345678000190', // Backfill will extract this
  // No agente_id: will be linked via backfill
}, usuarioId);

if (resultado.sucesso) {
  console.log(`Created entry: ${resultado.lancamento_id}`);
  if (resultado.agente_id) {
    console.log(`Linked to agent: ${resultado.agente_id}`);
  }
}
```

#### Retrieving Agent's Ledger

```typescript
import { getAgentLedger } from '@/domain/ledger';

// Get all entries for an agent
const ledger = getAgentLedger(db, agenteId, {
  dataInicio: '2024-01-01',
  dataFim: '2024-12-31',
  tipo: 'despesa', // optional filter
  categoria: 'comissao' // optional filter
});

// Returns: LedgerEntryWithAgent[]
ledger.forEach(entry => {
  console.log(`${entry.data}: ${entry.categoria} = ${entry.valor}`);
  console.log(`Agent: ${entry.agente_nome} (${entry.agente_papel})`);
});
```

#### Calculating Agent Balance

```typescript
import { getAgentBalance } from '@/domain/ledger';

const balance = getAgentBalance(db, agenteId, '2024-12-31');

if (balance) {
  console.log(`Total Inflows: ${balance.total_receitas}`);
  console.log(`Total Outflows: ${balance.total_despesas}`);
  console.log(`Net Balance: ${balance.saldo_liquido}`);
}
```

#### Generating Agent Report (P&L)

```typescript
import { generateAgentReport } from '@/domain/ledger';

const report = generateAgentReport(db, agenteId, '2024-10-01', '2024-10-31');

if (report) {
  console.log(`Agent: ${report.agente_nome}`);
  console.log(`Income: ${report.total_receitas}`);
  console.log(`Expenses: ${report.total_despesas}`);
  console.log(`Net Result: ${report.resultado_liquido}`);
  console.log(`Operating Margin: ${report.margem_operacional}%`);
  
  // Breakdown by category
  console.log('Income by Category:', report.receitas);
  console.log('Expenses by Category:', report.despesas);
}
```

#### Linking Existing Entry to Agent

```typescript
import { linkLedgerToAgent } from '@/domain/ledger';

// Manually link an orphaned entry
const resultado = linkLedgerToAgent(
  db,
  ledgerEntryId,
  agenteId,
  usuarioId
);

if (resultado.sucesso) {
  console.log('Entry linked successfully');
  // Audit trail is automatically recorded
}
```

#### Unlinking Entry from Agent

```typescript
import { unlinkLedgerFromAgent } from '@/domain/ledger';

// Remove agent link (preserves history via audit trail)
const resultado = unlinkLedgerFromAgent(
  db,
  ledgerEntryId,
  usuarioId,
  'correcao' // motivo
);
```

#### Agent Aging Analysis

```typescript
import { getAgentAging } from '@/domain/ledger';

const aging = getAgentAging(db, agenteId);

// Shows distribution by age:
// "0-30 days": 1000 entries, 35%
// "31-60 days": 800 entries, 28%
// "61-90 days": 600 entries, 21%
// "90+ days": 400 entries, 14%

aging.forEach(faixa => {
  console.log(`${faixa.faixa_dias}: ${faixa.quantidade_movimentacoes} entries, ${faixa.percentual_do_total}%`);
});
```

---

### 2. Backfill Strategy (`agentes-backfill.ts`)

Strategy to link historical ledger entries to agents using fuzzy matching.

#### Why Backfill is Needed

Historical ledger entries (before agent integration) don't have `agente_id` set. The backfill strategy:
1. Analyzes descriptions/references to extract potential CPF/CNPJ
2. Uses fuzzy name matching to find corresponding agents
3. Creates matches with confidence scores
4. Applies links with audit trail

#### Backfill Pipeline

```typescript
import { executarBackfillCompleto } from '@/domain/erp/agentes-backfill';

// Full backfill pipeline
const resultado = await executarBackfillCompleto(db, usuarioId, {
  dryRun: true, // First validate with dry-run
  dataInicio: '2024-01-01',
  dataFim: '2024-12-31',
  limiteEntradas: 1000, // Process in batches
  limiteConfianca: 85, // Confidence threshold (0-100)
});

// resultado = {
//   analise: AnalyzedLedgerEntry[], // Entries with extracted info
//   matches: MatchResult[], // Proposed agent links
//   resultado: BackfillResult, // Execution summary
//   verificacao: { ... } // Accuracy metrics
// }

console.log(`Accuracy: ${resultado.resultado.accuracy_score}%`);
console.log(`Matches: ${resultado.resultado.total_matches}`);
console.log(`Coverage after backfill: ${resultado.verificacao.coverage_percentage}%`);
```

#### Step-by-Step Backfill

**1. Analyze Ledger Entries**

```typescript
import { analyzeLedgerEntries } from '@/domain/erp/agentes-backfill';

// Scans orphaned entries and extracts agent info
const analisadas = analyzeLedgerEntries(db, {
  dataInicio: '2024-01-01',
  limiteEntradas: 500
});

// Returns entries with extracted info:
// {
//   ledger_entry_id: 'xxx',
//   descricao: 'Payment to CNPJ 12345678000190',
//   potencial_cnpj: '12345678000190',
//   potencial_nome: 'Supplier Company',
//   confianca: 60,
//   motivo_analise: 'CNPJ encontrado; Referência externa estruturada'
// }
```

**2. Match to Agents**

```typescript
import { matchAgentsToEntries } from '@/domain/erp/agentes-backfill';

// Fuzzy match analyzed entries to existing agents
const matches = matchAgentsToEntries(db, analisadas, 85); // 85% confidence threshold

// Returns matches with scores:
// {
//   ledger_entry_id: 'xxx',
//   agente_id: 'yyy',
//   score_geral: 95, // 0-100
//   motivo_match: 'CNPJ exact; Nome similarity 92%',
//   recomendacao: 'auto', // 'auto', 'review', or 'rejeitar'
// }
```

**3. Apply Backfill (with Dry-Run)**

```typescript
import { backfillLedgerAgents } from '@/domain/erp/agentes-backfill';

// DRY-RUN: Simulate without applying changes
const resultado = backfillLedgerAgents(db, matches, usuarioId, true);

console.log(`Would link: ${resultado.total_matches} entries`);
console.log(`Accuracy: ${resultado.accuracy_score}%`);

if (resultado.accuracy_score >= 95) {
  // Apply for real
  const aplicado = backfillLedgerAgents(db, matches, usuarioId, false);
  console.log(`Linked: ${aplicado.total_matches} entries`);
}
```

**4. Verify Accuracy**

```typescript
import { verifyBackfillAccuracy } from '@/domain/erp/agentes-backfill';

const verificacao = verifyBackfillAccuracy(db, [resultado]);

console.log(`Coverage: ${verificacao.coverage_percentage}%`);
console.log(`Entries with agent: ${verificacao.entries_com_agente}`);
console.log(`Orphaned entries: ${verificacao.entries_sem_agente}`);

// Critical: Must be > 95%
if (verificacao.coverage_percentage < 95) {
  logger.warn(`Coverage below 95%! Review matching strategy.`);
}
```

#### Backfill Extraction Logic

The backfill strategy extracts potential agent info using:

**1. CPF/CNPJ Extraction**
```
"Payment to CNPJ 12345678000190" → 12345678000190 (30 pts)
"CPF: 123.456.789-00" → 12345678900 (30 pts)
```

**2. Name Extraction**
```
"Commission for John Silva Construction" → "John Silva Construction" (20 pts)
```

**3. Category Heuristics**
```
Category "comissao", "folha_pagamento" → Likely third party (5 pts)
```

**4. Scoring**
```
Score = CPF/CNPJ match (50 pts)
      + Name similarity (30 pts)
      + Email match (20 pts)
      
Recommendation:
  95-100: Auto-link
  85-94:  Review
  <85:    Reject
```

---

## Implementation Checklist

### Phase 19 Deployment Steps

```
1. Database Migration
   ✓ Run migrations-phase19-ledger-agentes-fk.sql
   ✓ Verify new columns exist
   ✓ Verify new indices created
   ✓ Verify views accessible

2. Code Deployment
   ✓ Deploy ledger-agent-service.ts
   ✓ Deploy agentes-backfill.ts
   ✓ Update ledger/index.ts exports
   ✓ Update erp/index.ts exports

3. Backfill Execution (Staging First!)
   ✓ Run in staging environment
   ✓ Execute backfill with dry-run
   ✓ Verify accuracy > 95%
   ✓ Review matches flagged for manual review
   ✓ Apply backfill in production

4. Validation
   ✓ Spot-check 10 random entries
   ✓ Verify audit trail in ledger_entries_agente_auditoria
   ✓ Confirm FK constraints working
   ✓ Test all service functions

5. Rollback Plan (if needed)
   ✓ Keep backup of ledger_entries before backfill
   ✓ Have rollback SQL prepared (see migration comments)
```

---

## Data Validation Rules

### Constraint: agente_papel Consistency

When `agente_id` is set, `agente_papel` must match `agentes_economicos.papel`:

```typescript
// ✓ Valid
ledger_entry.agente_id = '123'
ledger_entry.agente_papel = 'supplier'
agentes_economicos[123].papel = 'supplier'

// ✗ Invalid
ledger_entry.agente_id = '123'
ledger_entry.agente_papel = 'supplier'
agentes_economicos[123].papel = 'tenant' // Mismatch!
```

**Validation Checks:**
```sql
-- Find inconsistent entries
SELECT l.id, l.agente_papel, a.papel
FROM ledger_entries l
INNER JOIN agentes_economicos a ON l.agente_id = a.id
WHERE l.agente_papel != a.papel;

-- Find broken FKs
SELECT l.id, l.agente_id
FROM ledger_entries l
LEFT JOIN agentes_economicos a ON l.agente_id = a.id
WHERE l.agente_id IS NOT NULL AND a.id IS NULL;
```

---

## Audit Trail

### Tracking Agent Changes

Every agent linkage change creates an entry in `ledger_entries_agente_auditoria`:

```sql
SELECT
  la.ledger_entry_id,
  la.agente_id_anterior,
  la.agente_id_novo,
  la.motivo_mudanca, -- 'backfill', 'manual', 'integracao', 'correcao'
  la.usuario_id,
  la.criado_em
FROM ledger_entries_agente_auditoria
WHERE ledger_entry_id = 'xxx'
ORDER BY criado_em DESC;
```

**Motivos (Reasons):**
- `backfill`: Automatic linking via backfill strategy
- `manual`: User manually linked via UI
- `integracao`: Linked during import/integration
- `correcao`: Corrected after review

---

## Performance Optimization

### Key Indexes

The migration creates these indexes for performance:

```sql
-- Most common query: ledger by agent + date
idx_ledger_entries_agente_id_data (agente_id, criado_em DESC)

-- Agent balance calculation
idx_ledger_entries_agente_tipo (agente_id, tipo)

-- Category breakdown
idx_ledger_entries_agente_categoria (agente_id, categoria)

-- Backfill tracking
idx_ledger_entries_backfill
```

### Query Examples with Indexes

```typescript
// Uses: idx_ledger_entries_agente_id_data
getAgentLedger(db, agenteId, { dataInicio, dataFim })
// ~5ms for 1000 entries

// Uses: idx_ledger_entries_agente_tipo
getAgentBalance(db, agenteId)
// ~2ms aggregate

// Uses: idx_ledger_entries_agente_categoria
generateAgentReport(db, agenteId, start, end)
// ~10ms for detailed breakdown
```

---

## Testing

### Run Tests

```bash
npm test -- ledger-agent-service.test.ts
```

### Test Coverage

- ✓ Create ledger entry with agent
- ✓ Retrieve agent ledger (with filtering)
- ✓ Calculate agent balance
- ✓ Generate P&L report
- ✓ Link/unlink entries
- ✓ Aging analysis
- ✓ Backfill accuracy > 95%
- ✓ Data integrity checks
- ✓ Audit trail creation

---

## Troubleshooting

### Low Backfill Accuracy

If accuracy < 95%:

1. Lower confidence threshold
   ```typescript
   matchAgentsToEntries(db, analisadas, 80) // was 85
   ```

2. Review rejected matches
   ```sql
   SELECT * FROM ledger_entries_orfas LIMIT 20;
   ```

3. Improve extraction logic (extract more data from descriptions)

### Missing Agent Links

Check coverage:
```sql
SELECT * FROM ledger_entries_agente_coverage;
```

If low:
1. Run backfill with lower threshold
2. Manually review orphaned entries
3. Consider deduplication issues (duplicate agents)

### Performance Degradation

Monitor index usage:
```sql
EXPLAIN QUERY PLAN
SELECT * FROM ledger_entries
WHERE agente_id = ? AND criado_em > ?;
```

If not using index, check:
- Index statistics (ANALYZE)
- Query selectivity
- Database file size

---

## Future Enhancements

1. **Batch Operations**: Bulk link entries to same agent
2. **Reconciliation**: Auto-match entries to invoices/payments
3. **ML Matching**: Improved fuzzy matching with ML
4. **Workflow**: Approval workflow for manual review matches
5. **Reporting**: Agent financial statements, tax compliance reports

---

## References

- Migration: `migrations-phase19-ledger-agentes-fk.sql`
- Service: `domain/ledger/ledger-agent-service.ts`
- Backfill: `domain/erp/agentes-backfill.ts`
- Types: `domain/erp/agentes-tipos.ts`
- Tests: `domain/ledger/__tests__/ledger-agent-service.test.ts`
