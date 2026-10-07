/**
 * Fase 20: Sistema de deduplicação e resolução de duplicatas para agentes econômicos - SQLite
 *
 * Versão SQLite da Fase 20 com adaptações para compatibilidade:
 * - Remove DEFAULT gen_random_uuid() (SQLite não tem isso, use UUID textual)
 * - Remove JSONB (SQLite usa TEXT para JSON)
 * - Remove IF NOT EXISTS em ALTER TABLE
 * - Usa UUIDs como TEXT
 *
 * Idempotente em boot.
 */

-- =====================================================================
-- Tabela: AGENTES_DUPLICATAS_AUDIT_TRAIL - Log de operações
-- =====================================================================

CREATE TABLE IF NOT EXISTS agentes_duplicatas_audit_trail (
  id TEXT PRIMARY KEY,

  -- Tipo de operação
  tipo_operacao TEXT NOT NULL CHECK (tipo_operacao IN ('MERGE', 'UNMERGE', 'REVIEW')),

  -- Referências aos agentes
  agente_primario_id TEXT NOT NULL,
  agente_secundario_id TEXT NOT NULL,

  -- Estados antes e depois (JSON como TEXT para SQLite)
  estado_anterior TEXT NOT NULL,
  estado_posterior TEXT NOT NULL,

  -- Auditoria
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por TEXT NOT NULL,
  descricao TEXT,

  -- Metadata
  resultado TEXT,
  mensagem_erro TEXT,

  FOREIGN KEY (agente_primario_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
  FOREIGN KEY (agente_secundario_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_agentes_audit_trail_tipo
  ON agentes_duplicatas_audit_trail(tipo_operacao);

CREATE INDEX IF NOT EXISTS idx_agentes_audit_trail_agentes
  ON agentes_duplicatas_audit_trail(agente_primario_id, agente_secundario_id);

CREATE INDEX IF NOT EXISTS idx_agentes_audit_trail_data
  ON agentes_duplicatas_audit_trail(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_agentes_audit_trail_usuario
  ON agentes_duplicatas_audit_trail(criado_por);


-- =====================================================================
-- Alterações à Tabela: AGENTES_DUPLICATAS_SUSPEITAS
-- =====================================================================

-- Adicionar colunas para revisão e merge (via aplicação se não existir)
ALTER TABLE agentes_duplicatas_suspeitas
ADD COLUMN revisao_notas TEXT;

ALTER TABLE agentes_duplicatas_suspeitas
ADD COLUMN merge_data TIMESTAMP;

-- Índice para buscar duplicatas não revisadas
CREATE INDEX IF NOT EXISTS idx_agentes_duplicatas_nao_revisadas
  ON agentes_duplicatas_suspeitas(status)
  WHERE status = 'pendente';
