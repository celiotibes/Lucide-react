/**
 * Phase 22.20.4 - API Completeness & OpenAPI
 *
 * Tabelas para gerenciamento completo de transações, orçamentos e categorias.
 * Implementa CRUD completo, auditoria, soft-delete e suporte a histórico de alterações.
 *
 * Contexto:
 * - Soft-delete via is_deleted flag
 * - Auditoria automática com usuario_alteracao e data_alteracao
 * - Índices para performance (data, categoria, tipo_fluxo)
 * - Foreign keys com CASCADE/RESTRICT apropriados
 *
 * Aplicada via runMigracoesIdempotentes (CREATE TABLE IF NOT EXISTS)
 */

-- ============================================================================
-- Tabela: categorias
-- Descrição: Hierarquia de categorias com suporte a subcategorias (parent_id)
-- ============================================================================
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  parent_id INTEGER,  -- NULL para categorias raiz, referencia outra categoria para subcategorias
  tipo_fluxo TEXT NOT NULL CHECK (tipo_fluxo IN ('receita', 'despesa', 'ambos')),
  cor_hex TEXT,  -- cor para exibição no frontend #RRGGBB
  icone_nome TEXT,  -- nome do ícone (ex: lucide-react)
  ordem INTEGER DEFAULT 0,  -- para ordenação customizada
  is_deleted INTEGER DEFAULT 0,  -- soft-delete
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_criacao INTEGER,
  alterado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_alteracao INTEGER,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES categorias(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_criacao) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_alteracao) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_categorias_usuario_id ON categorias(usuario_id);
CREATE INDEX IF NOT EXISTS idx_categorias_parent_id ON categorias(parent_id);
CREATE INDEX IF NOT EXISTS idx_categorias_tipo_fluxo ON categorias(tipo_fluxo);
CREATE INDEX IF NOT EXISTS idx_categorias_is_deleted ON categorias(is_deleted);

-- ============================================================================
-- Tabela: transacoes_completas
-- Descrição: Registro completo de transações financeiras com auditoria
-- ============================================================================
CREATE TABLE IF NOT EXISTS transacoes_completas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  categoria_id INTEGER,

  -- Dados da transação
  descricao TEXT NOT NULL,
  tipo_fluxo TEXT NOT NULL CHECK (tipo_fluxo IN ('receita', 'despesa')),
  valor REAL NOT NULL CHECK (valor > 0),
  data_transacao DATE NOT NULL,

  -- Referência externa (ex: ID do Asaas, MeuPluggy, etc)
  referencia_externa TEXT,
  fonte TEXT,  -- 'manual', 'asaas', 'meuplugy', 'arquivo', etc

  -- Status e auditoria
  status TEXT DEFAULT 'confirmada' CHECK (status IN ('rascunho', 'pendente', 'confirmada', 'cancelada')),
  is_deleted INTEGER DEFAULT 0,  -- soft-delete

  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_criacao INTEGER,
  alterado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_alteracao INTEGER,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_criacao) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_alteracao) REFERENCES usuarios(id) ON DELETE SET NULL,

  UNIQUE KEY (referencia_externa, fonte)  -- evita duplicatas de origem externa
);

CREATE INDEX IF NOT EXISTS idx_transacoes_usuario_id ON transacoes_completas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_categoria_id ON transacoes_completas(categoria_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_data_transacao ON transacoes_completas(data_transacao);
CREATE INDEX IF NOT EXISTS idx_transacoes_tipo_fluxo ON transacoes_completas(tipo_fluxo);
CREATE INDEX IF NOT EXISTS idx_transacoes_status ON transacoes_completas(status);
CREATE INDEX IF NOT EXISTS idx_transacoes_is_deleted ON transacoes_completas(is_deleted);
CREATE INDEX IF NOT EXISTS idx_transacoes_referencia ON transacoes_completas(referencia_externa);

-- ============================================================================
-- Tabela: transacoes_historico
-- Descrição: Trilha de alterações (audit trail) para cada transação
-- ============================================================================
CREATE TABLE IF NOT EXISTS transacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transacao_id INTEGER NOT NULL,

  -- Dados antigos e novos
  campo TEXT NOT NULL,  -- 'descricao', 'valor', 'categoria_id', 'status', etc
  valor_antigo TEXT,
  valor_novo TEXT,

  -- Quem e quando
  usuario_id INTEGER,
  data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP,
  motivo_alteracao TEXT,  -- ex: "correção de valor", "duplicata removida"

  FOREIGN KEY (transacao_id) REFERENCES transacoes_completas(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transacoes_historico_transacao_id ON transacoes_historico(transacao_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_historico_usuario_id ON transacoes_historico(usuario_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_historico_data ON transacoes_historico(data_alteracao);

-- ============================================================================
-- Tabela: orcamentos
-- Descrição: Orçamentos com período (from_date/to_date) e tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS orcamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  categoria_id INTEGER,  -- NULL = orçamento global

  nome TEXT NOT NULL,
  descricao TEXT,

  -- Período
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,

  -- Valores
  valor_limite REAL NOT NULL CHECK (valor_limite > 0),
  valor_utilizado REAL DEFAULT 0,
  valor_alerta REAL,  -- opcional: alertar ao atingir % (ex: 80%)
  percentual_alerta INTEGER DEFAULT 80,

  -- Status
  ativo INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,

  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_criacao INTEGER,
  alterado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_alteracao INTEGER,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_criacao) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_alteracao) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_usuario_id ON orcamentos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_categoria_id ON orcamentos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_data_inicio ON orcamentos(data_inicio);
CREATE INDEX IF NOT EXISTS idx_orcamentos_data_fim ON orcamentos(data_fim);
CREATE INDEX IF NOT EXISTS idx_orcamentos_ativo ON orcamentos(ativo);
CREATE INDEX IF NOT EXISTS idx_orcamentos_is_deleted ON orcamentos(is_deleted);

-- ============================================================================
-- Tabela: orcamentos_historico
-- Descrição: Alterações em orçamentos (para rastrear ajustes de limite, alertas, etc)
-- ============================================================================
CREATE TABLE IF NOT EXISTS orcamentos_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orcamento_id INTEGER NOT NULL,

  campo TEXT NOT NULL,
  valor_antigo TEXT,
  valor_novo TEXT,

  usuario_id INTEGER,
  data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP,
  motivo TEXT,

  FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_historico_orcamento_id ON orcamentos_historico(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_historico_usuario_id ON orcamentos_historico(usuario_id);
