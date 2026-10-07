# Phase 19: Ledger-Agent Integration - Deployment Guide

## Executive Summary

Phase 19 integrates economic agents with ledger entries to create complete accounting records with full traceability. This document guides deployment, validation, and rollback procedures.

**Risk Level:** MEDIUM
**Data Risk:** BACKFILL - Requires >95% accuracy validation
**Downtime Required:** NONE (zero-downtime deployment possible)
**Estimated Time:** 2-4 hours (including validation)

---

## Deployment Checklist

### Pre-Deployment (Preparation)

- [ ] **Backup Database**: Full production backup before any changes
- [ ] **Review Migration**: Verify `migrations-phase19-ledger-agentes-fk.sql`
- [ ] **Code Review**: All new TypeScript files reviewed
- [ ] **Staging Test**: Full end-to-end test in staging
- [ ] **Load Test**: Backfill performance with production-scale data
- [ ] **Communication**: Notify stakeholders of deployment window

### Phase 1: Database Migration (15 mins)

```bash
# 1. Apply migration to staging first
sqlite3 staging-db.sqlite < server/src/migrations-phase19-ledger-agentes-fk.sql

# 2. Verify columns added
sqlite3 staging-db.sqlite "PRAGMA table_info(ledger_entries);"
# Should show: agente_id, agente_papel, backfill_em, etc.

# 3. Verify indices created
sqlite3 staging-db.sqlite ".indices ledger_entries"
# Should show: idx_ledger_entries_agente_id_data, etc.

# 4. Verify views accessible
sqlite3 staging-db.sqlite "SELECT * FROM ledger_entries_agente_coverage LIMIT 1;"

# 5. Apply to production
sqlite3 production-db.sqlite < server/src/migrations-phase19-ledger-agentes-fk.sql
```

### Phase 2: Code Deployment (10 mins)

```bash
# 1. Deploy new files
cp server/src/domain/ledger/ledger-agent-service.ts /production/domain/ledger/
cp server/src/domain/erp/agentes-backfill.ts /production/domain/erp/
cp server/src/domain/ledger/__tests__/ledger-agent-service.test.ts /production/domain/ledger/__tests__/
cp server/src/domain/ledger/LEDGER_AGENT_INTEGRATION.md /production/domain/ledger/

# 2. Update index exports
cp server/src/domain/ledger/index.ts /production/domain/ledger/
cp server/src/domain/erp/index.ts /production/domain/erp/

# 3. Build & verify
npm run build

# 4. Run test suite
npm test -- ledger-agent-service.test.ts
# All tests should pass
```

### Phase 3: Validation (30 mins)

**3A. Functional Validation**

```typescript
// Test in staging environment first
import { createLedgerEntryWithAgent, getAgentLedger } from '@/domain/ledger';

// 1. Test entry creation with agent
const resultado = createLedgerEntryWithAgent(db, {
  data: '2024-10-10',
  tipo: 'despesa',
  categoria: 'comissao',
  valor: 500.0,
  agente_id: knownAgentId,
});
assert(resultado.sucesso === true);
assert(resultado.lancamento_id !== undefined);

// 2. Test retrieval
const ledger = getAgentLedger(db, knownAgentId);
assert(ledger.length > 0);
assert(ledger.some(e => e.id === resultado.lancamento_id));

// 3. Test balance calculation
const balance = getAgentBalance(db, knownAgentId);
assert(balance !== null);
assert(balance.saldo_liquido === balance.total_receitas - balance.total_despesas);

console.log('✓ Functional tests passed');
```

**3B. Data Integrity Validation**

```sql
-- Check 1: No broken foreign keys
SELECT COUNT(*) as broken_fks
FROM ledger_entries l
LEFT JOIN agentes_economicos a ON l.agente_id = a.id
WHERE l.agente_id IS NOT NULL AND a.id IS NULL;
-- Expected: 0

-- Check 2: No inconsistent papel
SELECT COUNT(*) as inconsistencies
FROM ledger_entries l
INNER JOIN agentes_economicos a ON l.agente_id = a.id
WHERE l.agente_papel != a.papel;
-- Expected: 0

-- Check 3: Coverage baseline (before backfill)
SELECT * FROM ledger_entries_agente_coverage;
-- Note coverage% for later comparison
```

**3C. Performance Validation**

```typescript
// Test index performance
const start = Date.now();
const ledger = getAgentLedger(db, knownAgentId, {
  dataInicio: '2024-01-01',
  dataFim: '2024-12-31'
});
const elapsed = Date.now() - start;

assert(elapsed < 100, `Query took ${elapsed}ms, expected <100ms`);
console.log(`✓ Query performance OK: ${elapsed}ms`);
```

---

## Backfill Strategy Deployment

### Pre-Backfill Validation

```bash
# 1. Count orphaned entries
sqlite3 db.sqlite "SELECT COUNT(*) FROM ledger_entries WHERE agente_id IS NULL AND backfill_em IS NULL;"

# 2. Count active agents
sqlite3 db.sqlite "SELECT COUNT(*) FROM agentes_economicos WHERE ativo = true;"

# 3. Check for duplicates that might affect matching
sqlite3 db.sqlite "SELECT cpf_cnpj, COUNT(*) as cnt FROM agentes_economicos GROUP BY cpf_cnpj HAVING cnt > 1;"
# Should be empty or known duplicates
```

### Backfill Execution Steps

#### Step 1: Dry-Run Backfill

```typescript
import { executarBackfillCompleto } from '@/domain/erp/agentes-backfill';

// Execute in DRY-RUN mode first (no database changes)
const resultado = await executarBackfillCompleto(db, sistemausuarioId, {
  dryRun: true,
  limiteEntradas: 500, // Start with subset
  limiteConfianca: 85,
  dataInicio: '2024-01-01',
  dataFim: '2024-12-31',
});

console.log(`Total analyzed: ${resultado.analise.length}`);
console.log(`Matches found: ${resultado.matches.length}`);
console.log(`Accuracy: ${resultado.resultado.accuracy_score}%`);
console.log(`Coverage after: ${resultado.verificacao.coverage_percentage}%`);

// CRITICAL: Check accuracy
if (resultado.resultado.accuracy_score < 95) {
  logger.error(`Accuracy ${resultado.resultado.accuracy_score}% < 95% threshold!`);
  logger.error(`Review matching strategy before applying.`);
  process.exit(1);
}

console.log('✓ Dry-run validation passed');
```

#### Step 2: Review Flagged Entries

```typescript
import { analyzeLedgerEntries, matchAgentsToEntries } from '@/domain/erp/agentes-backfill';

// Get matches flagged for review (not auto)
const analisadas = analyzeLedgerEntries(db);
const matches = matchAgentsToEntries(db, analisadas, 85);
const flaggedForReview = matches.filter(m => m.recomendacao === 'review');

console.log(`${flaggedForReview.length} entries flagged for manual review:`);

// Export for manual review
const reviewList = flaggedForReview.map(m => ({
  ledger_entry_id: m.ledger_entry_id,
  suggested_agent: m.agente_id,
  score: m.score_geral,
  reason: m.motivo_match,
}));

// Save to CSV for audit/review
fs.writeFileSync('backfill-review.csv', JSON.stringify(reviewList, null, 2));

if (flaggedForReview.length > 0) {
  console.log('⚠️  Manual review required for flagged entries');
  console.log('Export: backfill-review.csv');
}
```

#### Step 3: Apply Backfill

```typescript
// NOW apply for real (after dry-run validation passed)
const aplicado = await executarBackfillCompleto(db, sistemausuarioId, {
  dryRun: false, // APPLY CHANGES
  limiteEntradas: 1000, // Can increase batch size
  limiteConfianca: 85,
  dataInicio: '2024-01-01',
  dataFim: '2024-12-31',
});

console.log(`Applied: ${aplicado.resultado.total_matches} linkages`);
console.log(`Final coverage: ${aplicado.verificacao.coverage_percentage}%`);

if (aplicado.verificacao.coverage_percentage >= 95) {
  console.log('✓ Backfill successful - coverage target met');
} else {
  console.warn('⚠️  Coverage below 95% - may need additional review');
}
```

#### Step 4: Spot-Check Results

```sql
-- Randomly sample 10 entries and verify correctness
SELECT
  l.id,
  l.descricao,
  l.valor,
  a.nome as agente_nome,
  a.cpf_cnpj,
  a.papel,
  la.motivo_mudanca
FROM ledger_entries l
INNER JOIN agentes_economicos a ON l.agente_id = a.id
INNER JOIN ledger_entries_agente_auditoria la ON l.id = la.ledger_entry_id
WHERE la.motivo_mudanca = 'backfill'
ORDER BY RANDOM()
LIMIT 10;

-- Manual verification: Does each match make sense?
-- - Agent papel matches entry category?
-- - Name/CPF extraction accurate?
-- - Any obvious mistakes?
```

### Post-Backfill Validation

```sql
-- Check 1: Coverage achieved
SELECT * FROM ledger_entries_agente_coverage;
-- Should show: cobertura_percentual >= 95

-- Check 2: Audit trail complete
SELECT COUNT(*) as backfill_count
FROM ledger_entries_agente_auditoria
WHERE motivo_mudanca = 'backfill';
-- Should match number of linked entries

-- Check 3: No orphaned entries with backfill_em set but no agent
SELECT COUNT(*) as orphaned
FROM ledger_entries
WHERE backfill_em IS NOT NULL AND agente_id IS NULL;
-- Expected: 0

-- Check 4: Papéis synchronized
SELECT COUNT(*) as inconsistent
FROM ledger_entries l
INNER JOIN agentes_economicos a ON l.agente_id = a.id
WHERE l.agente_papel != a.papel;
-- Expected: 0
```

---

## Production Deployment

### Deployment Steps

1. **Schedule Window**: Early morning, low-traffic time
2. **Notify Users**: "System maintenance: 2-4 hours"
3. **Execute Phase 1**: Database migration
4. **Execute Phase 2**: Code deployment & build
5. **Execute Phase 3**: Validation tests
6. **Execute Phase 3B**: Backfill (if proceeding)
7. **Monitor**: Watch for errors, performance issues
8. **Communicate**: "System ready" notification

### Monitoring Checklist

```bash
# After deployment, monitor:

# 1. Database locks
SELECT * FROM pragma_database_list;
# Should show database as clean

# 2. Query performance
EXPLAIN QUERY PLAN SELECT * FROM ledger_entries WHERE agente_id = ?;
# Should use idx_ledger_entries_agente_id_data

# 3. Application logs
tail -100 /var/log/application.log
# Should show no errors related to new features

# 4. Coverage metric
SELECT cobertura_percentual FROM ledger_entries_agente_coverage;
# Should be >= 95%
```

---

## Rollback Procedure

### If Issues Occur

**Option A: Rollback to Pre-Migration State**

```bash
# 1. Stop application
systemctl stop app

# 2. Restore from backup
sqlite3 production-db.sqlite < backup-pre-phase19.sql

# 3. Revert code
git checkout HEAD~1 -- server/src/domain/ledger/ server/src/domain/erp/

# 4. Rebuild and restart
npm run build
systemctl start app
```

**Option B: Rollback Migration Only (Keep Code)**

```sql
-- Drop new indices
DROP INDEX idx_ledger_entries_agente_id_data;
DROP INDEX idx_ledger_entries_agente_tipo;
DROP INDEX idx_ledger_entries_agente_categoria;
DROP INDEX idx_ledger_entries_referencia_agente_externo;
DROP INDEX idx_ledger_entries_backfill;
DROP INDEX idx_ledger_entries_agente_papel;

-- Drop new views
DROP VIEW ledger_entries_agente_coverage;
DROP VIEW ledger_entries_orfas;

-- Drop new table
DROP TABLE ledger_entries_agente_auditoria;

-- Drop columns (if your SQLite supports it - requires 3.35.0+)
-- ALTER TABLE ledger_entries DROP COLUMN agente_id;
-- ALTER TABLE ledger_entries DROP COLUMN agente_papel;
-- etc.

-- OR if SQLite doesn't support DROP COLUMN:
-- Recreate table without new columns (more complex)
```

### Recovery Validation

```sql
-- Verify rollback was complete
SELECT COUNT(*) FROM ledger_entries WHERE agente_id IS NOT NULL;
-- Expected: 0 (all cleaned)

PRAGMA table_info(ledger_entries);
-- Should NOT show: agente_id, agente_papel, backfill_em, etc.

-- Verify data integrity
SELECT COUNT(*) FROM ledger_entries;
-- Should match pre-rollback count
```

---

## Incident Response

### Common Issues & Solutions

**Issue: Accuracy < 95%**
```
Cause: Matching threshold too high or data too varied
Solution:
  1. Lower limiteConfianca (e.g., 80 instead of 85)
  2. Run dry-run again to verify
  3. Proceed with lower threshold
```

**Issue: Backfill takes too long**
```
Cause: Processing entire dataset at once
Solution:
  1. Reduce limiteEntradas (e.g., 500 vs 1000)
  2. Run in batches: startDate in chunks of 30 days
  3. Schedule during off-peak hours
```

**Issue: FK Constraint Violations**
```
Cause: Orphaned agents (deleted but referenced)
Solution:
  1. Query: SELECT l.agente_id FROM ledger_entries WHERE agente_id IS NOT NULL
  2. Cross-check with: SELECT id FROM agentes_economicos
  3. Fix: DELETE entries with missing agents OR restore agents
  4. Retry backfill
```

**Issue: Performance Degradation**
```
Cause: Large backfill queries performing poorly
Solution:
  1. Check index stats: ANALYZE;
  2. Profile slow queries: EXPLAIN QUERY PLAN
  3. Ensure indices were created properly
  4. Scale back dataset size, retry
```

---

## Sign-Off

### Deployment Approval Checklist

- [ ] **Data Backup Confirmed**: Full backup taken pre-deployment
- [ ] **Migration Applied**: All new columns, indices, views created
- [ ] **Code Deployed**: New services in place, exports updated
- [ ] **Tests Pass**: 100% of test suite passes
- [ ] **Functional Tests Pass**: Manual validation successful
- [ ] **Data Integrity Verified**: No FK violations, no inconsistencies
- [ ] **Performance OK**: Queries < 100ms
- [ ] **Backfill Accuracy >= 95%**: Validated in dry-run
- [ ] **Stakeholder Approval**: Signed off by product/ops
- [ ] **Documentation Updated**: LEDGER_AGENT_INTEGRATION.md reviewed
- [ ] **Rollback Tested**: Rollback procedure validated
- [ ] **Monitoring Ready**: Alerts configured for issues

### Post-Deployment Sign-Off

- [ ] **Production Validation**: Spot-checked 10 random entries
- [ ] **Coverage Metrics**: Confirmed >= 95%
- [ ] **User Feedback**: No issues reported in first 24h
- [ ] **Monitoring Clean**: No alerts, no errors
- [ ] **Documentation Complete**: Deployment logged

---

## Reference Documents

- **Migration SQL**: `server/src/migrations-phase19-ledger-agentes-fk.sql`
- **Core Service**: `server/src/domain/ledger/ledger-agent-service.ts`
- **Backfill Service**: `server/src/domain/erp/agentes-backfill.ts`
- **User Guide**: `server/src/domain/ledger/LEDGER_AGENT_INTEGRATION.md`
- **Test Suite**: `server/src/domain/ledger/__tests__/ledger-agent-service.test.ts`

---

## Support Contact

For issues during deployment:
- Database: @dba-team
- Application: @backend-team  
- Data Quality: @data-engineering-team
- On-Call: See PagerDuty rotation

---

**Deployment Date:** _________________
**Deployed By:** _________________
**Approved By:** _________________
**Validation Complete:** ✓ _________________
