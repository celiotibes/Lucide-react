-- Migration: Consolidate ledger_entries and deprecate transacoes_integradas
-- Date: 2026-09-16
-- Description: Unify ledger_entries as the single source of truth for all accounting entries.
--              This migration consolidates data from transacoes_integradas into ledger_entries,
--              implements audit trail, and marks transacoes_integradas as deprecated.
--
-- Rationale:
-- - Two duplicated tables caused confusion about which to use
-- - ledger_entries has superior audit capabilities (auditada, auditado_em, auditado_por, estornado_por_id)
-- - All new code must route through ledger_entries
-- - transacoes_integradas becomes read-only legacy table for backward compatibility

-- Step 1: Create a backup view of transacoes_integradas (if it exists)
-- This is for audit trail reference only
CREATE VIEW IF NOT EXISTS transacoes_integradas_legacy AS
SELECT
  id,
  entidade_id,
  periodo_id,
  centro_custo_id,
  conta_id,
  data as data_lancamento,
  CASE
    WHEN tipo = 'debit' THEN valor
    ELSE NULL
  END as valor_debito,
  CASE
    WHEN tipo = 'credit' THEN valor
    ELSE NULL
  END as valor_credito,
  descricao,
  origem_modulo,
  origem_id,
  referencia_documento,
  criado_em,
  auditada,
  auditado_em,
  NULL as auditado_por,
  NULL as estornado_por_id,
  NULL as motivo_estorno
FROM transacoes_integradas
WHERE id > 0;  -- Dummy clause for compatibility

-- Step 2: Migrate data from transacoes_integradas → ledger_entries
-- Only migrate records that don't already exist (IGNORE duplicates)
INSERT OR IGNORE INTO ledger_entries (
  entidade_id,
  periodo_id,
  centro_custo_id,
  conta_id,
  data_lancamento,
  valor_debito,
  valor_credito,
  descricao,
  origem_modulo,
  origem_id,
  referencia_documento,
  criado_em,
  criado_por,
  auditada,
  auditado_em,
  auditado_por
)
SELECT
  entidade_id,
  periodo_id,
  centro_custo_id,
  conta_id,
  data,
  CASE WHEN tipo = 'debit' THEN valor ELSE NULL END,
  CASE WHEN tipo = 'credit' THEN valor ELSE NULL END,
  descricao,
  origem_modulo,
  origem_id,
  referencia_documento,
  criado_em,
  NULL,  -- criado_por - preserve NULL as original had no user tracking
  auditada,
  auditado_em,
  NULL   -- auditado_por - preserve NULL as original had no auditor tracking
FROM transacoes_integradas
WHERE id NOT IN (
  SELECT COALESCE(origem_id, -1)
  FROM ledger_entries
  WHERE origem_modulo = 'transacoes'
);

-- Step 3: Add deprecation marker (comment) to ledger_entries
-- This is documentation only; the table is now the single source of truth
COMMENT ON TABLE ledger_entries IS
'Central accounting ledger: single source of truth for all entries.
DEPRECATED TABLE: transacoes_integradas is read-only legacy.
All new accounting operations must use ledger_entries.
Migration date: 2026-09-16';

-- Step 4: Add deprecation marker to transacoes_integradas (if it exists)
-- This table is now read-only legacy; direct inserts are forbidden
-- New code must use registrarLancamentoContabil() in ledger.ts
COMMENT ON TABLE transacoes_integradas IS
'DEPRECATED: Use ledger_entries instead.
This table is read-only legacy for backward compatibility only.
All new accounting entries must use ledger.ts:registrarLancamentoContabil().
Migration date: 2026-09-16. See server/migrations/002_consolidate_ledger_entries.sql';

-- Step 5: Create index for data integrity checks during migration
-- Validate that all records migrated successfully
CREATE INDEX IF NOT EXISTS idx_ledger_entries_migrated_check
  ON ledger_entries(origem_modulo, origem_id);

-- Step 6: Validation query (run separately to verify migration)
-- SELECT
--   'transacoes_integradas' as source,
--   COUNT(*) as total_records,
--   COUNT(CASE WHEN auditada = 1 THEN 1 END) as audited
-- FROM transacoes_integradas
-- UNION ALL
-- SELECT
--   'ledger_entries',
--   COUNT(*),
--   COUNT(CASE WHEN auditada = 1 THEN 1 END)
-- FROM ledger_entries
-- WHERE origem_modulo IN ('transacoes', 'contratos', 'patrimonio', 'caucao', 'financiamento', 'rateios', 'vistorias');

-- Migration complete. transacoes_integradas is now deprecated.
-- See src/domain/erp/core.ts for deprecation notices.
