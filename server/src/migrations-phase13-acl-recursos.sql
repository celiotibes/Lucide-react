/**
 * Phase 13: ACL de Recursos
 *
 * Controle de acesso granular por recurso (cobrança, contrato, imóvel, etc.).
 * Permite que um usuário titular/admin conceda acesso a um recurso específico
 * para um usuário de papel externo (inquilino, prestador) sem dar acesso a
 * TODOS os recursos daquele tipo.
 *
 * Padrão: DENY by default (não está na ACL = sem acesso). Apenas quem tiver
 * uma linha na tabela com `revogado_em IS NULL` pode acessar.
 *
 * Tabela idempotente: CREATE TABLE IF NOT EXISTS garante não quebrar se rodar
 * em um banco que já passa por esta fase.
 */

-- ============================================================
-- ACL_RECURSOS TABLE - Control per-resource access
-- ============================================================

CREATE TABLE IF NOT EXISTS acl_recursos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT NOT NULL,
  tipo_recurso TEXT NOT NULL CHECK(
    tipo_recurso IN (
      'cobranca',
      'contrato',
      'imovel',
      'chamado',
      'ordem_servico',
      'pagamento_pix'
    )
  ),
  recurso_id TEXT NOT NULL,
  concedido_por TEXT NOT NULL,
  concedido_em TEXT NOT NULL DEFAULT (datetime('now')),
  revogado_em TEXT,

  -- Foreign keys
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY(concedido_por) REFERENCES usuarios(id) ON DELETE RESTRICT,

  -- Garantir unicidade por usuário, tipo e recurso (permite revogar + reconcer)
  UNIQUE(usuario_id, tipo_recurso, recurso_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_acl_recursos_usuario_id
  ON acl_recursos(usuario_id);

CREATE INDEX IF NOT EXISTS idx_acl_recursos_usuario_tipo_recurso
  ON acl_recursos(usuario_id, tipo_recurso, recurso_id);

CREATE INDEX IF NOT EXISTS idx_acl_recursos_tipo_recurso
  ON acl_recursos(tipo_recurso);

CREATE INDEX IF NOT EXISTS idx_acl_recursos_concedido_por
  ON acl_recursos(concedido_por);

CREATE INDEX IF NOT EXISTS idx_acl_recursos_revogado
  ON acl_recursos(revogado_em)
  WHERE revogado_em IS NULL; -- Índice parcial para linhas ativas
