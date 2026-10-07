# Phase 19 Quick Reference Guide

## TL;DR

Phase 19 links ledger entries to economic agents. New functions allow querying/reporting per agent. Historical entries can be auto-linked via backfill with >95% accuracy.

---

## Installation

1. **Run migration:**
   ```bash
   sqlite3 db.sqlite < server/src/migrations-phase19-ledger-agentes-fk.sql
   ```

2. **Deploy code:**
   ```bash
   npm run build && npm test
   ```

3. **Run backfill** (optional, for historical data):
   ```typescript
   import { executarBackfillCompleto } from '@/domain/erp';
   
   const resultado = await executarBackfillCompleto(db, userId, {
     dryRun: true,
     limiteConfianca: 85,
   });
   ```

---

## Core Functions Cheat Sheet

### Creating Entries

```typescript
import { createLedgerEntryWithAgent } from '@/domain/ledger';

createLedgerEntryWithAgent(db, {
  data: '2024-10-04',
  tipo: 'despesa',
  categoria: 'comissao',
  valor: 500.0,
  agente_id: 'agent-uuid', // LINK TO AGENT
}, userId);
```

### Querying Entries

```typescript
import { 
  getAgentLedger, 
  getAgentBalance, 
  generateAgentReport 
} from '@/domain/ledger';

// All entries for agent
getAgentLedger(db, agentId, { dataInicio, dataFim, tipo, categoria });

// Income - Expenses
getAgentBalance(db, agentId);

// P&L Report
generateAgentReport(db, agentId, '2024-10-01', '2024-10-31');
```

### Linking/Unlinking

```typescript
import { 
  linkLedgerToAgent, 
  unlinkLedgerFromAgent 
} from '@/domain/ledger';

// Manual link
linkLedgerToAgent(db, ledgerId, agentId, userId);

// Unlink (keeps audit trail)
unlinkLedgerFromAgent(db, ledgerId, userId);
```

### Backfill

```typescript
import { executarBackfillCompleto } from '@/domain/erp';

// Auto-link historical entries
const resultado = await executarBackfillCompleto(db, userId, {
  dryRun: true, // Preview first
  limiteConfianca: 85, // 85-100 scale
});

// Check: resultado.resultado.accuracy_score >= 95?
if (resultado.resultado.accuracy_score >= 95) {
  // Apply for real
  await executarBackfillCompleto(db, userId, { dryRun: false });
}
```

---

## Database Queries

### Check Coverage
```sql
SELECT * FROM ledger_entries_agente_coverage;
-- Expected: cobertura_percentual >= 95
```

### Find Orphaned Entries
```sql
SELECT * FROM ledger_entries_orfas LIMIT 20;
-- Entries without agente_id that haven't been backfilled
```

### View Audit Trail
```sql
SELECT * FROM ledger_entries_agente_auditoria
WHERE ledger_entry_id = 'xxx'
ORDER BY criado_em DESC;
```

### Data Integrity Check
```sql
-- Broken FKs?
SELECT COUNT(*) FROM ledger_entries l
LEFT JOIN agentes_economicos a ON l.agente_id = a.id
WHERE l.agente_id IS NOT NULL AND a.id IS NULL;

-- papel mismatch?
SELECT COUNT(*) FROM ledger_entries l
INNER JOIN agentes_economicos a ON l.agente_id = a.id
WHERE l.agente_papel != a.papel;
```

---

## Common Tasks

### Task 1: Generate Monthly Report for Agent

```typescript
import { generateAgentReport } from '@/domain/ledger';

const report = generateAgentReport(db, agentId, 
  '2024-10-01', 
  '2024-10-31'
);

console.log(`${report.agente_nome}:`);
console.log(`  Income: R$ ${report.total_receitas}`);
console.log(`  Expenses: R$ ${report.total_despesas}`);
console.log(`  Profit: R$ ${report.resultado_liquido}`);
console.log(`  Margin: ${report.margem_operacional}%`);
```

### Task 2: Link Orphaned Entry Manually

```typescript
import { linkLedgerToAgent } from '@/domain/ledger';

const resultado = linkLedgerToAgent(
  db, 
  'entry-id-123', 
  'agent-id-456', 
  'user-id-789'
);

if (resultado.sucesso) {
  console.log('Linked!');
  // Audit trail automatically created
}
```

### Task 3: Run Weekly Backfill

```typescript
import { executarBackfillCompleto } from '@/domain/erp';

// Schedule this to run weekly
const resultado = await executarBackfillCompleto(db, systemUserId, {
  dryRun: false,
  limiteEntradas: 100, // Process in batches
  limiteConfianca: 85,
});

if (resultado.resultado.accuracy_score >= 95) {
  console.log(`✓ Linked ${resultado.resultado.total_matches} entries`);
}
```

### Task 4: Check Agent Balance Over Time

```typescript
import { getAgentLedger, getAgentBalance } from '@/domain/ledger';

// Get balance as of date X
const balance = getAgentBalance(db, agentId, '2024-10-31');

console.log(`Balance as of 2024-10-31: R$ ${balance.saldo_liquido}`);

// Get all entries to trace changes
const ledger = getAgentLedger(db, agentId, {
  dataInicio: '2024-10-01',
  dataFim: '2024-10-31'
});

let saldo = 0;
ledger.forEach(entry => {
  const delta = entry.tipo === 'receita' ? entry.valor : -entry.valor;
  saldo += delta;
  console.log(`${entry.data}: ${entry.descricao} (${delta}) → Saldo: ${saldo}`);
});
```

---

## Troubleshooting

### "Accuracy < 95%"
Lower the confidence threshold:
```typescript
const matches = matchAgentsToEntries(db, analisadas, 80); // was 85
```

### "No entries found"
Check if entries have `agente_id`:
```sql
SELECT COUNT(*) FROM ledger_entries WHERE agente_id IS NOT NULL;
```

### "Query takes >100ms"
Verify indices exist:
```sql
.indices ledger_entries
-- Should show: idx_ledger_entries_agente_id_data, etc.
```

---

## Performance Tips

- **Use periods:** `dataInicio` & `dataFim` always when available
- **Batch backfill:** Process large datasets in 500-1000 entry chunks
- **Check coverage first:** `SELECT * FROM ledger_entries_agente_coverage`
- **Index stats:** `ANALYZE;` after large backfill operations

---

## File Locations

| What | Where |
|------|-------|
| Migration | `server/src/migrations-phase19-ledger-agentes-fk.sql` |
| Service | `server/src/domain/ledger/ledger-agent-service.ts` |
| Backfill | `server/src/domain/erp/agentes-backfill.ts` |
| Types | `server/src/domain/erp/agentes-tipos.ts` |
| Tests | `server/src/domain/ledger/__tests__/ledger-agent-service.test.ts` |
| User Docs | `server/src/domain/ledger/LEDGER_AGENT_INTEGRATION.md` |
| Deploy Docs | `server/src/PHASE19_DEPLOYMENT_GUIDE.md` |

---

## Key Metrics

```typescript
// Target accuracy
const targetAccuracy = 95; // percent

// Confidence threshold for backfill
const confidenceThreshold = 85; // 0-100

// Max query time
const maxQueryTime = 100; // milliseconds

// Coverage target
const targetCoverage = 95; // percent (entries with agente_id)
```

---

## Audit Trail Motivos

When entries are linked, the `motivo_mudanca` field tracks why:

- `backfill` - Automatic fuzzy matching
- `manual` - User manual linking
- `integracao` - External system integration
- `correcao` - Error correction

---

## Schema Summary

**New Columns:**
```
ledger_entries.agente_id              UUID
ledger_entries.agente_papel           TEXT
ledger_entries.referencia_agente_externo TEXT
ledger_entries.backfill_em            TIMESTAMP
ledger_entries.agente_atualizado_em   TIMESTAMP
ledger_entries.agente_atualizado_por  UUID
```

**New Table:**
```
ledger_entries_agente_auditoria {
  id, ledger_entry_id, agente_id_anterior, agente_id_novo,
  agente_papel_anterior, agente_papel_novo, motivo_mudanca,
  usuario_id, criado_em
}
```

**New Indices:**
```
idx_ledger_entries_agente_id_data
idx_ledger_entries_agente_tipo
idx_ledger_entries_agente_categoria
idx_ledger_entries_referencia_agente_externo
idx_ledger_entries_backfill
idx_ledger_entries_agente_papel
```

**New Views:**
```
ledger_entries_agente_coverage    -- % coverage metric
ledger_entries_orfas              -- Orphaned entries
```

---

## Testing

```bash
# Run tests
npm test -- ledger-agent-service.test.ts

# Run with coverage
npm test -- ledger-agent-service.test.ts --coverage

# Run specific test
npm test -- ledger-agent-service.test.ts -t "createLedgerEntryWithAgent"
```

---

## Support

For issues:
1. Check coverage: `SELECT * FROM ledger_entries_agente_coverage`
2. Check audit trail: `SELECT * FROM ledger_entries_agente_auditoria`
3. Review orphaned entries: `SELECT * FROM ledger_entries_orfas`
4. Run data integrity check (see "Database Queries" above)

---

**Quick Links:**
- Full User Guide: `LEDGER_AGENT_INTEGRATION.md`
- Deployment Guide: `PHASE19_DEPLOYMENT_GUIDE.md`
- Architecture: `PHASE19_INTEGRATION_SUMMARY.md`
- Source Code: `domain/ledger/ledger-agent-service.ts`

**Version:** 1.0
**Last Updated:** 2024-10-07
