/**
 * Phase 22.20.2: Advanced PDF Reports — Database Schema
 *
 * Tables:
 * - relatorios: Cache de relatórios gerados (BS, DRE, CF)
 * - relatorios_templates: Templates personalizados para marcas
 * - relatorios_exports: Histórico de exportações em múltiplos formatos
 * - relatorios_auditar: Audit trail de acessos a relatórios
 *
 * Triggers:
 * - Auto-cleanup de relatórios obsoletos (>90 dias)
 * - Auto-cleanup de exports obsoletos (>30 dias)
 */

-- Tabela principal: Cache de relatórios gerados
CREATE TABLE IF NOT EXISTS relatorios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK(tipo IN ('balance_sheet', 'income_statement', 'cash_flow', 'real_estate')),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  conteudo_pdf BLOB NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  hash_conteudo TEXT UNIQUE NOT NULL,

  -- Metadata de geração
  tempo_geracao_ms INTEGER NOT NULL,
  versao_relatorio TEXT DEFAULT '1.0.0',

  -- Criação e versionamento
  criado_em DATETIME DEFAULT (datetime('now')),
  atualizado_em DATETIME DEFAULT (datetime('now')),
  expirado_em DATETIME DEFAULT datetime('now', '+90 days'),

  -- Auditoria
  usuario_id INTEGER,
  ip_cliente TEXT,

  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CHECK(tamanho_bytes <= 10485760) -- 10MB max
);

CREATE INDEX IF NOT EXISTS idx_relatorios_tipo_periodo ON relatorios(tipo, data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_relatorios_criado ON relatorios(criado_em);
CREATE INDEX IF NOT EXISTS idx_relatorios_expirado ON relatorios(expirado_em);
CREATE INDEX IF NOT EXISTS idx_relatorios_usuario ON relatorios(usuario_id);

-- Tabela: Templates personalizados (logos, formatação)
CREATE TABLE IF NOT EXISTS relatorios_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,

  -- Assets (logo, header, footer)
  logo_png BLOB,
  logo_base64 TEXT,
  cor_primaria TEXT DEFAULT '#1E40AF', -- Blue
  cor_secundaria TEXT DEFAULT '#7C3AED', -- Purple

  -- Configurações de formatação ABNT
  fonte_corpo TEXT DEFAULT 'Arial',
  tamanho_fonte_corpo INTEGER DEFAULT 11,
  margem_top REAL DEFAULT 2.5, -- cm
  margem_bottom REAL DEFAULT 2.0, -- cm
  margem_left REAL DEFAULT 2.0, -- cm
  margem_right REAL DEFAULT 2.0, -- cm

  -- Rodapé (assinatura digital)
  rodape_texto TEXT,
  incluir_data_geracao INTEGER DEFAULT 1,
  incluir_assinatura INTEGER DEFAULT 0,

  -- Metadata
  criado_em DATETIME DEFAULT (datetime('now')),
  atualizado_em DATETIME DEFAULT (datetime('now')),
  ativo INTEGER DEFAULT 1,

  usuario_id INTEGER NOT NULL,
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_relatorios_templates_usuario ON relatorios_templates(usuario_id);
CREATE INDEX IF NOT EXISTS idx_relatorios_templates_ativo ON relatorios_templates(ativo);

-- Tabela: Histórico de exportações (CSV, XLSX, XML, PDF)
CREATE TABLE IF NOT EXISTS relatorios_exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relatorio_id INTEGER NOT NULL,
  tipo_exportacao TEXT NOT NULL CHECK(tipo_exportacao IN ('csv', 'xlsx', 'xml', 'pdf')),
  nome_arquivo TEXT NOT NULL,
  caminho_local TEXT,
  tamanho_bytes INTEGER NOT NULL,
  hash_arquivo TEXT,

  -- Metadata
  criado_em DATETIME DEFAULT (datetime('now')),
  expirado_em DATETIME DEFAULT datetime('now', '+30 days'),

  -- Auditoria
  usuario_id INTEGER,
  ip_cliente TEXT,
  tempo_processamento_ms INTEGER,

  FOREIGN KEY(relatorio_id) REFERENCES relatorios(id) ON DELETE CASCADE,
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_relatorios_exports_relatorio ON relatorios_exports(relatorio_id);
CREATE INDEX IF NOT EXISTS idx_relatorios_exports_tipo ON relatorios_exports(tipo_exportacao);
CREATE INDEX IF NOT EXISTS idx_relatorios_exports_criado ON relatorios_exports(criado_em);
CREATE INDEX IF NOT EXISTS idx_relatorios_exports_usuario ON relatorios_exports(usuario_id);

-- Tabela: Audit trail de acessos
CREATE TABLE IF NOT EXISTS relatorios_auditar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relatorio_id INTEGER,
  acao TEXT NOT NULL CHECK(acao IN ('gerado', 'acessado', 'exportado', 'compartilhado', 'deletado')),
  tipo_relatorio TEXT,
  detalhes TEXT,

  -- Auditoria
  usuario_id INTEGER,
  ip_cliente TEXT,
  user_agent TEXT,

  criado_em DATETIME DEFAULT (datetime('now')),

  FOREIGN KEY(relatorio_id) REFERENCES relatorios(id) ON DELETE CASCADE,
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_relatorios_auditar_relatorio ON relatorios_auditar(relatorio_id);
CREATE INDEX IF NOT EXISTS idx_relatorios_auditar_usuario ON relatorios_auditar(usuario_id);
CREATE INDEX IF NOT EXISTS idx_relatorios_auditar_acao ON relatorios_auditar(acao);
CREATE INDEX IF NOT EXISTS idx_relatorios_auditar_criado ON relatorios_auditar(criado_em);

-- ============================================================================
-- TRIGGERS: Auto-cleanup e Maintenance
-- ============================================================================

-- Trigger: Limpar relatórios expirados (>90 dias)
CREATE TRIGGER IF NOT EXISTS cleanup_relatorios_expirados
AFTER INSERT ON relatorios
BEGIN
  DELETE FROM relatorios
  WHERE expirado_em < datetime('now')
    AND id != NEW.id
  LIMIT 100;
END;

-- Trigger: Limpar exports expirados (>30 dias)
CREATE TRIGGER IF NOT EXISTS cleanup_exports_expirados
AFTER INSERT ON relatorios_exports
BEGIN
  DELETE FROM relatorios_exports
  WHERE expirado_em < datetime('now')
  LIMIT 100;
END;

-- Trigger: Atualizar timestamp de modificação
CREATE TRIGGER IF NOT EXISTS update_relatorios_timestamp
BEFORE UPDATE ON relatorios
BEGIN
  UPDATE relatorios SET atualizado_em = (datetime('now'))
  WHERE id = NEW.id;
END;

-- Trigger: Atualizar timestamp de templates
CREATE TRIGGER IF NOT EXISTS update_relatorios_templates_timestamp
BEFORE UPDATE ON relatorios_templates
BEGIN
  UPDATE relatorios_templates SET atualizado_em = (datetime('now'))
  WHERE id = NEW.id;
END;

-- ============================================================================
-- VIEWS: Queries úteis
-- ============================================================================

-- View: Relatórios mais acessados
CREATE VIEW IF NOT EXISTS vw_relatorios_populares AS
SELECT
  r.id,
  r.tipo,
  COUNT(ra.id) as acessos,
  r.criado_em,
  u.nome as usuario
FROM relatorios r
LEFT JOIN relatorios_auditar ra ON r.id = ra.relatorio_id AND ra.acao = 'acessado'
LEFT JOIN usuarios u ON r.usuario_id = u.id
WHERE r.expirado_em > datetime('now')
GROUP BY r.id
ORDER BY acessos DESC;

-- View: Exportações recentes por formato
CREATE VIEW IF NOT EXISTS vw_exports_por_formato AS
SELECT
  tipo_exportacao,
  COUNT(*) as total,
  SUM(tamanho_bytes) as tamanho_total_bytes,
  AVG(tempo_processamento_ms) as tempo_medio_ms,
  MAX(criado_em) as ultima_exportacao
FROM relatorios_exports
WHERE expirado_em > datetime('now')
GROUP BY tipo_exportacao;

-- View: Auditoria de uso
CREATE VIEW IF NOT EXISTS vw_auditoria_relatorios AS
SELECT
  ra.id,
  ra.acao,
  r.tipo as tipo_relatorio,
  u.nome as usuario,
  ra.ip_cliente,
  ra.criado_em
FROM relatorios_auditar ra
LEFT JOIN relatorios r ON ra.relatorio_id = r.id
LEFT JOIN usuarios u ON ra.usuario_id = u.id
ORDER BY ra.criado_em DESC;
