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
  -- Papéis REAIS do produto (Fase 1 — ver docs/viabilidade-backend-pagamentos.md
  -- e server/src/domain/auth/auth-service.ts). Não são mais os papéis do
  -- antigo módulo interno de pagamento a prestadores (admin/gestor/prestador).
  -- `administrador` e `economista` adicionados numa fase seguinte — ver
  -- UserRole/PAPEIS_VALIDOS em auth-service.ts (fonte única desta lista;
  -- mantenha em sincronia com o CHECK abaixo e com o CHECK de `funcao` na
  -- tabela permissoes_papel mais adiante neste arquivo).
  -- 'inquilino' e 'prestador' adicionados para suportar usuários externos.
  role TEXT NOT NULL CHECK(role IN ('titular', 'administrador', 'contador', 'perito', 'advogado', 'economista', 'inquilino', 'prestador')),
  -- prestador_id agora é só um vínculo de identidade opcional com o módulo
  -- de pagamento a prestadores (qualquer um dos 4 papéis pode tê-lo ou não —
  -- não existe mais checagem "papel X exige prestador_id"; ver
  -- podeAcessarPrestador em auth-service.ts).
  prestador_id INTEGER,
  ativo INTEGER NOT NULL DEFAULT 1,
  data_criacao TEXT NOT NULL DEFAULT datetime('now'),
  updated_at TEXT NOT NULL DEFAULT datetime('now'),
  ultimo_login TEXT,
  tentativas_falhas INTEGER DEFAULT 0,
  bloqueado_ate TEXT,

  -- Constraints
  CONSTRAINT email_format CHECK(email LIKE '%@%.%')
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
  data_criacao TEXT NOT NULL DEFAULT datetime('now'),
  data_expiracao TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
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
  timestamp TEXT NOT NULL DEFAULT datetime('now'),
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
      'criar_usuario',
      'atualizar_permissoes',
      'acesso_negado',
      'acl_concessao',
      'acl_reativacao',
      'acl_revogacao',
      'lgpd_acesso_dados',
      'lgpd_exclusao_conta',
      'portal_publicacao',
      'prestador_apontamento_recebido',
      'prestador_apontamento_conferencia'
    )
  ),
  recurso TEXT NOT NULL,
  recurso_id TEXT NOT NULL,
  prestador_id INTEGER,
  descricao TEXT NOT NULL,
  valores_antigos TEXT,
  valores_novos TEXT,
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
  total_pagar REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(
    status IN ('pendente', 'aprovado', 'rejeitado')
  ),
  usuario_submissao_id TEXT NOT NULL,
  data_submissao TEXT NOT NULL DEFAULT datetime('now'),
  usuario_aprovacao_id TEXT,
  data_aprovacao TEXT,
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
  data TEXT NOT NULL,
  tipo_dia TEXT NOT NULL CHECK(
    tipo_dia IN ('dia_util', 'sabado', 'domingo', 'feriado')
  ),
  horas_trabalhadas REAL NOT NULL CHECK(
    horas_trabalhadas >= 0 AND horas_trabalhadas <= 24
  ),
  km_percorridos REAL NOT NULL CHECK(km_percorridos >= 0),
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,

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
  diaria_base REAL NOT NULL,
  valor_km REAL NOT NULL,
  reajuste_percentual REAL NOT NULL DEFAULT 0,
  data_vigencia TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT datetime('now'),

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
  ativo INTEGER NOT NULL DEFAULT 1,
  data_criacao TEXT NOT NULL DEFAULT datetime('now'),

  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_prestadores_usuario_id ON prestadores(usuario_id);
CREATE INDEX idx_prestadores_email ON prestadores(email);
CREATE INDEX idx_prestadores_ativo ON prestadores(ativo);

-- ============================================================
-- 8. PERMISSOES_PAPEL TABLE - Matriz de permissões papel × função
-- ============================================================
--
-- Chave primária composta (papel, funcao): uma linha por combinação, não um
-- histórico — a última escrita é o estado vigente (a trilha de MUDANÇAS fica
-- em `auditoria`, tipo_acao='atualizar_permissoes', não nesta tabela).
--
-- `funcao` é uma capacidade nomeada do sistema (ex: 'aprovar_despesa_os',
-- 'gerar_laudo_pericial') — o catálogo com descrição de cada uma vive em
-- server/src/domain/auth/permissoes.ts (FUNCOES_CATALOGO), fonte única desta
-- lista; o CHECK abaixo precisa ser mantido em sincronia manualmente com
-- aquele arquivo (SQLite não permite CHECK dinâmico a partir de outra
-- tabela/enum TypeScript).
--
-- `limite_valor` é opcional (NULL = função não tem limite numérico, ou tem
-- mas está desabilitado) — usado por funções como 'aprovar_despesa_os' e
-- 'aprovar_pagamento', no mesmo espírito de LIMITE_APROVACAO_DUPLA já
-- existente no client (src/domain/operacoes/ordensServico.ts), mas agora
-- configurável por papel em vez de uma constante fixa global.
CREATE TABLE IF NOT EXISTS permissoes_papel (
  papel TEXT NOT NULL CHECK(papel IN ('titular', 'administrador', 'contador', 'perito', 'advogado', 'economista', 'inquilino', 'prestador')),
  funcao TEXT NOT NULL CHECK(funcao IN (
    'gerenciar_usuarios',
    'gerenciar_permissoes',
    'ver_trilha_auditoria',
    'aprovar_despesa_os',
    'aprovar_pagamento',
    'editar_plano_de_contas',
    'lancar_transacoes',
    'fechar_periodo_contabil',
    'gerar_laudo_pericial',
    'exportar_ecd',
    'ver_indicadores_gestao',
    'gerenciar_contratos_advocacia',
    'editar_lgpd_chaves',
    'importar_documentos'
  )),
  habilitado INTEGER NOT NULL DEFAULT 0,
  limite_valor REAL,
  atualizado_em TEXT NOT NULL DEFAULT datetime('now'),
  -- Quem fez a ÚLTIMA alteração nesta linha — NULL para as linhas seedadas
  -- automaticamente no boot (ninguém "alterou", nasceram assim); nunca uma
  -- string inventada, mesmo motivo do usuario_id em auditoria.
  atualizado_por TEXT,

  PRIMARY KEY(papel, funcao),
  CHECK(limite_valor IS NULL OR limite_valor >= 0),
  FOREIGN KEY(atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX idx_permissoes_papel_papel ON permissoes_papel(papel);
CREATE INDEX idx_permissoes_papel_funcao ON permissoes_papel(funcao);

-- ============================================================
-- Views for Common Queries
-- ============================================================
--
-- NOTA (Fase 1): este arquivo já teve, aqui, um bloco "Initial Test Data"
-- que criava usuários demo (admin/gestor/prestador) com senha fixa
-- "senha123" (hash placeholder, nunca de verdade validado — o código antigo
-- comparava a senha em texto puro contra a constante "senha123", ignorando
-- esta coluna). Removido de propósito: como este .sql roda por inteiro em
-- QUALQUER banco novo — inclusive uma instalação de produção, via
-- database-init.ts — manter esse bloco significaria criar, toda vez, uma
-- conta titular com senha pública e conhecida. O caminho de entrada correto
-- para o primeiro usuário agora é o bootstrap
-- (`AuthServiceDB.bootstrapTitular`, exposto em `POST /api/auth/bootstrap`),
-- que só funciona uma vez e exige que quem instala escolha a própria senha.
-- Testes que precisam de usuários fixos os inserem explicitamente no setup
-- do próprio arquivo de teste (ver server/src/domain/auth/__tests__/).

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
  datetime('now') < s.data_expiracao as valida
FROM sessoes s
JOIN usuarios u ON s.usuario_id = u.id
WHERE s.ativo = 1 AND datetime('now') < s.data_expiracao;

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
