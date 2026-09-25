/**
 * Phase 2: Database Integration for Authentication & Authorization
 * Migrates from in-memory to persistent database storage
 *
 * Tables:
 * - usuarios: User accounts and credentials
 * - sessoes: Active sessions with tokens
 * - auditoria: Complete audit trail
 * - pagamentos_apontamentos: Payment submissions and status
 */

-- ============================================================
-- 1. USUARIOS TABLE - User accounts and authentication
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'gestor', 'prestador')),
  prestador_id INTEGER,
  ativo BOOLEAN NOT NULL DEFAULT true,
  data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_login TIMESTAMP,
  tentativas_falhas INTEGER DEFAULT 0,
  bloqueado_ate TIMESTAMP,

  -- Constraints
  CONSTRAINT email_format CHECK(email LIKE '%@%.%'),
  CONSTRAINT prestador_id_required_for_prestador
    CHECK(role != 'prestador' OR prestador_id IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_prestador_id ON usuarios(prestador_id);
CREATE INDEX idx_usuarios_role ON usuarios(role);
CREATE INDEX idx_usuarios_ativo ON usuarios(ativo);

-- ============================================================
-- 2. SESSOES TABLE - Active session tokens
-- ============================================================

CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_expiracao TIMESTAMP NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  endereco_ip TEXT,
  user_agent TEXT,

  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_sessoes_usuario_id ON sessoes(usuario_id);
CREATE INDEX idx_sessoes_data_expiracao ON sessoes(data_expiracao);
CREATE INDEX idx_sessoes_ativo ON sessoes(ativo);

-- ============================================================
-- 3. AUDITORIA TABLE - Complete audit trail
-- ============================================================

CREATE TABLE IF NOT EXISTS auditoria (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id TEXT,
  usuario_nome TEXT NOT NULL,
  usuario_email TEXT NOT NULL,
  usuario_role TEXT NOT NULL,
  tipo_acao TEXT NOT NULL CHECK(
    tipo_acao IN (
      'criar_apontamento',
      'atualizar_apontamento',
      'deletar_apontamento',
      'criar_pagamento',
      'aprovar_pagamento',
      'rejeitar_pagamento',
      'modificar_parametro',
      'login',
      'logout',
      'acesso_negado'
    )
  ),
  recurso TEXT NOT NULL,
  recurso_id TEXT NOT NULL,
  prestador_id INTEGER,
  descricao TEXT NOT NULL,
  valores_antigos JSON,
  valores_novos JSON,
  endereco_ip TEXT,
  user_agent TEXT,
  resultado TEXT NOT NULL CHECK(resultado IN ('sucesso', 'falha', 'negado')),
  motivo_falha TEXT,

  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Indexes (for fast lookups by audit queries)
CREATE INDEX idx_auditoria_timestamp ON auditoria(timestamp DESC);
CREATE INDEX idx_auditoria_usuario_id ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_tipo_acao ON auditoria(tipo_acao);
CREATE INDEX idx_auditoria_recurso ON auditoria(recurso);
CREATE INDEX idx_auditoria_resultado ON auditoria(resultado);
CREATE INDEX idx_auditoria_prestador_id ON auditoria(prestador_id);
CREATE INDEX idx_auditoria_usuario_periodo ON auditoria(usuario_id, timestamp DESC);

-- ============================================================
-- 4. PAGAMENTOS_APONTAMENTOS TABLE - Payment submissions
-- ============================================================

CREATE TABLE IF NOT EXISTS pagamentos_apontamentos (
  id TEXT PRIMARY KEY,
  prestador_id INTEGER NOT NULL,
  mes_referencia TEXT NOT NULL,
  total_pagar DECIMAL(12, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(
    status IN ('pendente', 'aprovado', 'rejeitado')
  ),
  usuario_submissao_id TEXT NOT NULL,
  data_submissao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_aprovacao_id TEXT,
  data_aprovacao TIMESTAMP,
  motivo_rejeicao TEXT,

  -- Constraints
  -- (a unicidade parcial "só um pendente/aprovado por mês" não pode ser uma
  -- CONSTRAINT de tabela em SQLite — UNIQUE(...) WHERE só é aceito em
  -- CREATE UNIQUE INDEX; o índice parcial equivalente vai logo abaixo,
  -- junto com os demais índices desta tabela)
  CONSTRAINT data_aprovacao_requer_status
    CHECK(
      (status = 'aprovado' AND data_aprovacao IS NOT NULL) OR
      (status != 'aprovado' AND data_aprovacao IS NULL)
    ),
  CONSTRAINT motivo_requer_rejeicao
    CHECK(
      (status = 'rejeitado' AND motivo_rejeicao IS NOT NULL) OR
      (status != 'rejeitado' AND motivo_rejeicao IS NULL)
    ),

  FOREIGN KEY(prestador_id) REFERENCES prestadores(id),
  FOREIGN KEY(usuario_submissao_id) REFERENCES usuarios(id),
  FOREIGN KEY(usuario_aprovacao_id) REFERENCES usuarios(id)
);

-- Indexes
CREATE INDEX idx_pagamentos_prestador ON pagamentos_apontamentos(prestador_id);
CREATE INDEX idx_pagamentos_mes ON pagamentos_apontamentos(mes_referencia);
CREATE INDEX idx_pagamentos_status ON pagamentos_apontamentos(status);
CREATE INDEX idx_pagamentos_periodo ON pagamentos_apontamentos(
  prestador_id, mes_referencia
);
CREATE INDEX idx_pagamentos_data_submissao ON pagamentos_apontamentos(
  data_submissao DESC
);

-- Índice único parcial: substitui a CONSTRAINT de tabela
-- "pagamento_unico_pendente" (UNIQUE(...) WHERE ... não é válido como
-- constraint de CREATE TABLE em SQLite, só em CREATE INDEX)
CREATE UNIQUE INDEX idx_pagamento_unico_pendente
  ON pagamentos_apontamentos(prestador_id, mes_referencia, status)
  WHERE status != 'rejeitado';

-- ============================================================
-- 5. APONTAMENTOS_DIARIOS TABLE - Daily work entries
-- ============================================================

CREATE TABLE IF NOT EXISTS apontamentos_diarios (
  id TEXT PRIMARY KEY,
  pagamento_id TEXT NOT NULL,
  prestador_id INTEGER NOT NULL,
  data DATE NOT NULL,
  tipo_dia TEXT NOT NULL CHECK(
    tipo_dia IN ('dia_util', 'sabado', 'domingo', 'feriado')
  ),
  horas_trabalhadas DECIMAL(5, 2) NOT NULL CHECK(
    horas_trabalhadas >= 0 AND horas_trabalhadas <= 24
  ),
  km_percorridos DECIMAL(8, 2) NOT NULL CHECK(km_percorridos >= 0),
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,

  FOREIGN KEY(pagamento_id) REFERENCES pagamentos_apontamentos(id)
    ON DELETE CASCADE,
  FOREIGN KEY(prestador_id) REFERENCES prestadores(id)
);

-- Indexes
CREATE INDEX idx_apontamentos_pagamento ON apontamentos_diarios(pagamento_id);
CREATE INDEX idx_apontamentos_prestador ON apontamentos_diarios(prestador_id);
CREATE INDEX idx_apontamentos_data ON apontamentos_diarios(data);
CREATE UNIQUE INDEX idx_apontamentos_diarios_unico
  ON apontamentos_diarios(pagamento_id, data);

-- ============================================================
-- 6. PARAMETROS_CONTRATO TABLE - Contract parameters by month
-- ============================================================

CREATE TABLE IF NOT EXISTS parametros_contrato (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mes_referencia TEXT NOT NULL UNIQUE,
  diaria_base DECIMAL(10, 2) NOT NULL,
  valor_km DECIMAL(8, 2) NOT NULL,
  reajuste_percentual DECIMAL(5, 2) NOT NULL DEFAULT 0,
  data_vigencia DATE NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK(diaria_base > 0),
  CHECK(valor_km > 0),
  CHECK(mes_referencia LIKE '____-__')
);

-- Indexes
CREATE INDEX idx_parametros_mes ON parametros_contrato(mes_referencia);
CREATE INDEX idx_parametros_ativo ON parametros_contrato(ativo);

-- ============================================================
-- 7. PRESTADORES TABLE - Service provider data
-- ============================================================

CREATE TABLE IF NOT EXISTS prestadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  telefone TEXT,
  endereco TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_prestadores_usuario_id ON prestadores(usuario_id);
CREATE INDEX idx_prestadores_email ON prestadores(email);
CREATE INDEX idx_prestadores_ativo ON prestadores(ativo);

-- ============================================================
-- Initial Test Data
-- ============================================================

-- Hash of 'senha123' would go here in production
-- For now, using a placeholder that will be replaced with bcrypt hash

-- Ordem importa: usuarios.prestador_id exige (via CHECK
-- prestador_id_required_for_prestador) que todo usuário 'prestador' já
-- nasça com prestador_id preenchido — não dá para inserir o usuário antes
-- e "completar" depois com UPDATE, porque o INSERT com prestador_id NULL
-- falharia a CHECK (e INSERT OR IGNORE engoliria essa falha em silêncio,
-- deixando o usuário 'user_prestador_1' de fora e quebrando o INSERT
-- seguinte em prestadores por violação de FOREIGN KEY). Por isso o
-- prestador é criado primeiro (sem usuario_id, que é nullable), depois o
-- usuário já referenciando esse prestador, e só então o prestador é
-- ligado de volta ao usuário.
INSERT OR IGNORE INTO prestadores (id, usuario_id, nome, email, ativo, data_criacao)
VALUES
  (1, NULL, 'Paulo Bruxel', 'paulo@example.com', true, '2026-01-01');

INSERT OR IGNORE INTO usuarios (id, nome, email, senha_hash, role, prestador_id, ativo, data_criacao)
VALUES
  ('user_admin_1', 'Admin User', 'admin@example.com',
   '$2b$12$placeholder_hash_admin', 'admin', NULL, true, '2026-01-01'),
  ('user_gestor_1', 'Gestor User', 'gestor@example.com',
   '$2b$12$placeholder_hash_gestor', 'gestor', NULL, true, '2026-01-01'),
  ('user_prestador_1', 'Paulo Bruxel', 'paulo@example.com',
   '$2b$12$placeholder_hash_paulo', 'prestador', 1, true, '2026-01-01');

-- Liga o prestador de volta ao usuário
UPDATE prestadores SET usuario_id = 'user_prestador_1' WHERE id = 1;

-- ============================================================
-- Views for Common Queries
-- ============================================================

-- Active sessions with user info
CREATE VIEW IF NOT EXISTS v_sessoes_ativas AS
SELECT
  s.token,
  s.usuario_id,
  u.nome as usuario_nome,
  u.email as usuario_email,
  u.role,
  s.data_criacao,
  s.data_expiracao,
  s.endereco_ip,
  CURRENT_TIMESTAMP < s.data_expiracao as valida
FROM sessoes s
JOIN usuarios u ON s.usuario_id = u.id
WHERE s.ativo = true AND CURRENT_TIMESTAMP < s.data_expiracao;

-- Payment status summary
CREATE VIEW IF NOT EXISTS v_pagamentos_resumo AS
SELECT
  prestador_id,
  mes_referencia,
  COUNT(*) as total_submissoes,
  SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
  SUM(CASE WHEN status = 'aprovado' THEN 1 ELSE 0 END) as aprovados,
  SUM(CASE WHEN status = 'rejeitado' THEN 1 ELSE 0 END) as rejeitados,
  SUM(CASE WHEN status = 'aprovado' THEN total_pagar ELSE 0 END) as total_aprovado
FROM pagamentos_apontamentos
GROUP BY prestador_id, mes_referencia;

-- Audit trail summary by user
CREATE VIEW IF NOT EXISTS v_auditoria_usuario AS
SELECT
  usuario_id,
  usuario_nome,
  usuario_role,
  COUNT(*) as total_acoes,
  COUNT(CASE WHEN resultado = 'sucesso' THEN 1 END) as acoes_sucesso,
  COUNT(CASE WHEN resultado = 'negado' THEN 1 END) as acessos_negados,
  MAX(timestamp) as ultima_acao
FROM auditoria
GROUP BY usuario_id, usuario_nome, usuario_role;
