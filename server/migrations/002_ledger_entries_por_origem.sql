-- SQL View: ledger_entries_por_origem
-- Purpose: Pre-aggregated ledger entries by origem_modulo for efficient filtering
-- Provides cached totals for débito/crédito by module, account, and period
-- Supports fast module-based filtering in reports

-- Drop existing view if present (for migrations)
DROP VIEW IF EXISTS ledger_entries_por_origem;

-- Create the view
CREATE VIEW ledger_entries_por_origem AS
SELECT
  le.origem_modulo,
  le.conta_id,
  le.periodo_id,
  cp.codigo as conta_codigo,
  cp.descricao as conta_descricao,
  cp.grupo as conta_grupo,
  cp.natureza as conta_natureza,
  COUNT(*) as total_lancamentos,
  COALESCE(SUM(le.valor_debito), 0) as total_debito,
  COALESCE(SUM(le.valor_credito), 0) as total_credito,
  COALESCE(SUM(le.valor_debito), 0) - COALESCE(SUM(le.valor_credito), 0) as saldo_liquido,
  MIN(le.data_lancamento) as primeira_data,
  MAX(le.data_lancamento) as ultima_data,
  COUNT(DISTINCT le.entidade_id) as num_entidades
FROM ledger_entries le
INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
GROUP BY le.origem_modulo, le.conta_id, le.periodo_id, cp.codigo, cp.descricao, cp.grupo, cp.natureza;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ledger_por_origem_modulo ON ledger_entries_por_origem(origem_modulo);
CREATE INDEX IF NOT EXISTS idx_ledger_por_origem_period ON ledger_entries_por_origem(periodo_id);
CREATE INDEX IF NOT EXISTS idx_ledger_por_origem_conta ON ledger_entries_por_origem(conta_id);
CREATE INDEX IF NOT EXISTS idx_ledger_por_origem_modulo_periodo ON ledger_entries_por_origem(origem_modulo, periodo_id);
CREATE INDEX IF NOT EXISTS idx_ledger_por_origem_grupo ON ledger_entries_por_origem(conta_grupo);

-- View: consolidacao_por_modulo_periodo
-- Purpose: High-level summary of all ledger entries by module and period
DROP VIEW IF EXISTS consolidacao_por_modulo_periodo;

CREATE VIEW consolidacao_por_modulo_periodo AS
SELECT
  le.origem_modulo,
  le.periodo_id,
  pc.ano,
  pc.mes,
  COUNT(*) as total_lancamentos,
  COALESCE(SUM(le.valor_debito), 0) as total_debito,
  COALESCE(SUM(le.valor_credito), 0) as total_credito,
  COALESCE(SUM(le.valor_debito), 0) - COALESCE(SUM(le.valor_credito), 0) as saldo_liquido,
  COUNT(DISTINCT le.entidade_id) as num_entidades,
  COUNT(DISTINCT le.conta_id) as num_contas
FROM ledger_entries le
INNER JOIN periodos_contabeis pc ON le.periodo_id = pc.id
GROUP BY le.origem_modulo, le.periodo_id, pc.ano, pc.mes;

-- Create index for consolidation view
CREATE INDEX IF NOT EXISTS idx_consolidacao_modulo_periodo ON consolidacao_por_modulo_periodo(origem_modulo, periodo_id);
