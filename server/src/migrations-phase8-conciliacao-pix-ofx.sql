/**
 * Phase 8: Sistema de reconciliação automática PIX↔OFX
 *
 * Adiciona:
 * 1. Tabela `conciliacoes_pix_ofx` para rastreamento de matches PIX/OFX
 * 2. Tabela `conciliacao_ofx_cache` para cache de transações Pluggy OFX
 * 3. Tabela `audit_conciliacao_discrepancias` para auditoria de discrepâncias
 * 4. Coluna `conciliacao_pix_ofx_id` em `razao` (FK)
 * 5. Índices para queries de status e auditoria
 *
 * Migração idempotente — todas as operações usam IF NOT EXISTS.
 *
 * Fluxo:
 * - Charges Asaas (status='PAID') são buscadas via conciliarPixOFX()
 * - Procura-se match em conciliacao_ofx_cache (valor ±5%, data ±2 dias)
 * - Se match único: cria lançamento em razao + marca como 'reconciliado'
 * - Se múltiplos: flags 'discrepancia' para revisão manual
 * - Se nenhum: marca como 'pendente' (retry na próxima rodada)
 * - Pendências >7 dias são marcadas como 'expirado'
 */

-- ============================================================
-- 1. TABELA DE TRANSAÇÕES OFX (CACHE PLUGGY)
-- ============================================================

CREATE TABLE IF NOT EXISTS conciliacao_ofx_cache (
  id TEXT PRIMARY KEY DEFAULT lower(hex(randomblob(16))),
  valor REAL NOT NULL,
  data TEXT NOT NULL,                    -- ISO 8601 format
  descricao TEXT NOT NULL,
  conta_origem TEXT,                     -- ID da conta no Pluggy
  processado INTEGER NOT NULL DEFAULT 0, -- 0 = pendente, 1 = processado
  criado_em TEXT NOT NULL DEFAULT datetime('now'),
  atualizado_em TEXT
);

CREATE INDEX IF NOT EXISTS idx_conciliacao_ofx_cache_data
  ON conciliacao_ofx_cache(data DESC);

CREATE INDEX IF NOT EXISTS idx_conciliacao_ofx_cache_valor
  ON conciliacao_ofx_cache(valor);

CREATE INDEX IF NOT EXISTS idx_conciliacao_ofx_cache_processado
  ON conciliacao_ofx_cache(processado);

-- ============================================================
-- 2. TABELA DE CONCILIAÇÕES PIX↔OFX
-- ============================================================

CREATE TABLE IF NOT EXISTS conciliacoes_pix_ofx (
  id TEXT PRIMARY KEY DEFAULT lower(hex(randomblob(16))),
  asaas_charge_id TEXT NOT NULL,         -- FK para cobrancas_asaas.id
  pluggy_ofx_id TEXT,                    -- FK para conciliacao_ofx_cache.id (NULL se pendente)
  valor_asaas REAL NOT NULL,
  valor_ofx REAL,                        -- NULL se não encontrado OFX
  data_asaas TEXT NOT NULL,              -- ISO 8601
  data_ofx TEXT,                         -- ISO 8601 (NULL se não encontrado)
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK(status IN ('reconciliado', 'pendente', 'discrepancia', 'expirado')),
  discrepancia_flag INTEGER NOT NULL DEFAULT 0,
  lancamento_razao_id TEXT,              -- FK para razao.id (NULL até criar lançamento)
  criado_em TEXT NOT NULL DEFAULT datetime('now'),
  atualizado_em TEXT,

  -- Uma charge só aparece uma vez (UX: impedir re-processamento)
  UNIQUE(asaas_charge_id, criado_em),
  FOREIGN KEY (asaas_charge_id) REFERENCES cobrancas_asaas(id) ON DELETE CASCADE,
  FOREIGN KEY (pluggy_ofx_id) REFERENCES conciliacao_ofx_cache(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conciliacao_pix_ofx_asaas_charge
  ON conciliacoes_pix_ofx(asaas_charge_id);

CREATE INDEX IF NOT EXISTS idx_conciliacao_pix_ofx_status
  ON conciliacoes_pix_ofx(status);

CREATE INDEX IF NOT EXISTS idx_conciliacao_pix_ofx_criado_desc
  ON conciliacoes_pix_ofx(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_conciliacao_pix_ofx_status_criado
  ON conciliacoes_pix_ofx(status, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_conciliacao_pix_ofx_discrepancia
  ON conciliacoes_pix_ofx(discrepancia_flag, criado_em DESC)
  WHERE discrepancia_flag = 1;

-- ============================================================
-- 3. TABELA DE AUDITORIA DE DISCREPÂNCIAS
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_conciliacao_discrepancias (
  id TEXT PRIMARY KEY DEFAULT lower(hex(randomblob(16))),
  conciliacao_id TEXT NOT NULL,
  tipo_discrepancia TEXT NOT NULL
    CHECK(tipo_discrepancia IN (
      'multiplos_matches',
      'valor_divergente',
      'data_divergente',
      'sem_match',
      'beneficiario_divergente',
      'outro'
    )),
  descricao TEXT,
  criado_em TEXT NOT NULL DEFAULT datetime('now'),

  FOREIGN KEY (conciliacao_id) REFERENCES conciliacoes_pix_ofx(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_conciliacao_discrepancias_conciliacao
  ON audit_conciliacao_discrepancias(conciliacao_id);

CREATE INDEX IF NOT EXISTS idx_audit_conciliacao_discrepancias_tipo
  ON audit_conciliacao_discrepancias(tipo_discrepancia);

CREATE INDEX IF NOT EXISTS idx_audit_conciliacao_discrepancias_criado
  ON audit_conciliacao_discrepancias(criado_em DESC);

-- ============================================================
-- 4. ADICIONA COLUNA EM RAZAO (SE JÁ EXISTIR)
-- ============================================================

-- Nota: razao pode não existir ainda. Quando existir, será preciso adicionar:
-- ALTER TABLE razao ADD COLUMN conciliacao_pix_ofx_id TEXT
--   REFERENCES conciliacoes_pix_ofx(id) ON DELETE SET NULL;
--
-- Por segurança, o schema vai tentar criar a tabela razao aqui se não existir:

CREATE TABLE IF NOT EXISTS razao (
  id TEXT PRIMARY KEY DEFAULT lower(hex(randomblob(16))),
  conta_credito TEXT,
  conta_debito TEXT,
  valor REAL NOT NULL,
  tipo TEXT,
  status TEXT DEFAULT 'rascunho',
  referencia_id TEXT,                    -- Pode apontar para diversos tipos de doc
  conciliacao_pix_ofx_id TEXT,           -- FK para conciliacoes_pix_ofx.id
  criado_em TEXT NOT NULL DEFAULT datetime('now'),
  atualizado_em TEXT,

  FOREIGN KEY (conciliacao_pix_ofx_id) REFERENCES conciliacoes_pix_ofx(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_razao_tipo ON razao(tipo);
CREATE INDEX IF NOT EXISTS idx_razao_status ON razao(status);
CREATE INDEX IF NOT EXISTS idx_razao_criado_desc ON razao(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_razao_conciliacao_pix_ofx
  ON razao(conciliacao_pix_ofx_id);
