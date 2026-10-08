/**
 * Fase 10: Assinatura Digital + LGPD/GDPR Compliance
 *
 * Implementa suporte a assinatura digital de relatórios (Certisign A3)
 * com validação 2FA (Ser Pro ID), auditoria LGPD completa e direito ao esquecimento.
 *
 * Tabelas:
 * - certificados_digitais: Certificados A3 cadastrados
 * - assinaturas_digitais: Registro de assinaturas em relatórios
 * - audit_log_lgpd: Log de auditoria LGPD completo
 * - pessoas_anonimizadas: Registro de pessoas anonimizadas (direito ao esquecimento)
 *
 * Aplicada em TODO boot (idempotente — todas as tabelas usam IF NOT EXISTS).
 */

-- =====================================================================
-- Tabela 1: CERTIFICADOS_DIGITAIS - Certificados A3 cadastrados
-- =====================================================================
CREATE TABLE IF NOT EXISTS certificados_digitais (
  id                          TEXT PRIMARY KEY,                -- UUID
  usuario_id                  TEXT NOT NULL,                  -- Fk para usuarios.id

  -- Dados do certificado
  numero_serie                TEXT NOT NULL UNIQUE,           -- Serial number do certificado
  titular_nome                TEXT NOT NULL,                  -- Nome do titular
  titular_cpf_cnpj            TEXT NOT NULL,                  -- CPF/CNPJ

  -- Validação e status
  valido_ate                  DATETIME NOT NULL,              -- Data de expiração
  emissor_nome                TEXT NOT NULL,                  -- Ex: "Certisign"
  ativo                       INTEGER NOT NULL DEFAULT 1,

  -- Auditoria
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_certs_usuario
  ON certificados_digitais(usuario_id);
CREATE INDEX IF NOT EXISTS idx_certs_ativo
  ON certificados_digitais(ativo);


-- =====================================================================
-- Tabela 2: ASSINATURAS_DIGITAIS - Registro de assinaturas
-- =====================================================================
CREATE TABLE IF NOT EXISTS assinaturas_digitais (
  id                          TEXT PRIMARY KEY,                -- UUID
  usuario_id                  TEXT NOT NULL,                  -- Quem assinou
  certificado_id              TEXT NOT NULL,                  -- FK para certificados_digitais

  -- Documento assinado
  relatorio_id                TEXT NOT NULL,                  -- Identifica qual relatório (DRE/Fluxo/Margens)
  relatorio_tipo              TEXT NOT NULL,                  -- DRE, FLUXO, MARGENS
  relatorio_periodo           TEXT NOT NULL,                  -- Período (YYYY-MM)

  -- Assinatura
  hash_documento              TEXT NOT NULL,                  -- SHA256 do documento
  assinatura_base64           TEXT NOT NULL,                  -- Assinatura em Base64
  timestamp_assinatura        DATETIME NOT NULL,              -- Quando foi assinado

  -- 2FA Validation (Ser Pro ID)
  validado_2fa                INTEGER NOT NULL DEFAULT 0,
  timestamp_validacao_2fa     DATETIME,                       -- Quando foi validado via SMS
  nonce_2fa                   TEXT,                           -- Nonce do desafio 2FA

  -- Status
  status                      TEXT NOT NULL DEFAULT 'PENDENTE',  -- PENDENTE, VALIDADO, REJEITADO, REVOGADO
  motivo_rejeicao             TEXT,                           -- Se rejeitado

  -- PDF assinado (salvo após validação 2FA)
  pdf_assinado_url            TEXT,                           -- URL/path para download

  -- Auditoria
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (certificado_id) REFERENCES certificados_digitais(id)
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_usuario
  ON assinaturas_digitais(usuario_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_relatorio
  ON assinaturas_digitais(relatorio_id, relatorio_tipo);
CREATE INDEX IF NOT EXISTS idx_assinaturas_status
  ON assinaturas_digitais(status);
CREATE INDEX IF NOT EXISTS idx_assinaturas_criado
  ON assinaturas_digitais(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_assinaturas_2fa_validado
  ON assinaturas_digitais(validado_2fa, timestamp_validacao_2fa);
CREATE INDEX IF NOT EXISTS idx_assinaturas_relatorio_periodo
  ON assinaturas_digitais(relatorio_tipo, relatorio_periodo, status);


-- =====================================================================
-- Tabela 3: AUDIT_LOG_LGPD - Log de auditoria LGPD completo
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_log_lgpd (
  id                          TEXT PRIMARY KEY,                -- UUID
  usuario_id                  TEXT,                           -- Quem fez a ação (pode ser NULL para sistema)

  -- Ação e contexto
  acao                        TEXT NOT NULL,                  -- INSERT, UPDATE, DELETE, VIEW, EXPORT, ANONIMIZAR
  tabela                      TEXT NOT NULL,                  -- Tabela afetada (ex: cobrancas_asaas, usuarios)
  registro_id                 TEXT,                           -- ID do registro afetado

  -- Dados antes/depois
  dados_antigos                TEXT,                           -- JSON com dados antes (para UPDATE/DELETE)
  dados_novos                  TEXT,                           -- JSON com dados depois (para INSERT/UPDATE)

  -- Contexto de acesso
  ip_address                  TEXT,                           -- IP de origem
  user_agent                  TEXT,                           -- User agent do navegador/cliente
  endpoint                    TEXT,                           -- Endpoint da API acessado

  -- Dados sensíveis acessados (para rastreamento de LGPD)
  contem_dados_sensveis       INTEGER NOT NULL DEFAULT 0,     -- TRUE se contém CPF/email/telefone
  tipo_dado_sensvel           TEXT,                           -- CPF, EMAIL, TELEFONE, ENDERECO, etc

  -- Consentimento
  consentimento_id            TEXT,                           -- FK para registro de consentimento (se aplica)

  -- Auditoria
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_usuario
  ON audit_log_lgpd(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_acao
  ON audit_log_lgpd(acao);
CREATE INDEX IF NOT EXISTS idx_audit_tabela
  ON audit_log_lgpd(tabela);
CREATE INDEX IF NOT EXISTS idx_audit_criado
  ON audit_log_lgpd(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_dados_sensveis
  ON audit_log_lgpd(contem_dados_sensveis, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_registro_id
  ON audit_log_lgpd(tabela, registro_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_ip_address
  ON audit_log_lgpd(ip_address, criado_em DESC);


-- =====================================================================
-- Tabela 4: PESSOAS_ANONIMIZADAS - Direito ao esquecimento
-- =====================================================================
CREATE TABLE IF NOT EXISTS pessoas_anonimizadas (
  id                          TEXT PRIMARY KEY,                -- UUID

  -- Pessoa original
  pessoa_tipo                 TEXT NOT NULL,                  -- INQUILINO, PRESTADOR, FORNECEDOR
  pessoa_id                   TEXT NOT NULL,                  -- ID da pessoa em sua tabela original

  -- Dados originais (arquivados antes de anonimizar)
  dados_originais_json        TEXT NOT NULL,                  -- JSON com dados antes da anonimização

  -- Solicitação
  motivo_solicitacao          TEXT,                           -- "Direito ao esquecimento", etc
  usuario_id_solicitante      TEXT,                           -- Quem solicitou a anonimização

  -- Execução
  anonimizado_em              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  versao_anonimizacao         TEXT NOT NULL DEFAULT '1.0',

  -- Compliance
  gdpr_compliant              INTEGER NOT NULL DEFAULT 1,     -- True se seguiu diretrizes GDPR
  auditado                    INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (usuario_id_solicitante) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_pessoas_anon_tipo
  ON pessoas_anonimizadas(pessoa_tipo);
CREATE INDEX IF NOT EXISTS idx_pessoas_anon_pessoa_id
  ON pessoas_anonimizadas(pessoa_tipo, pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_anon_data
  ON pessoas_anonimizadas(anonimizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pessoas_anon_gdpr
  ON pessoas_anonimizadas(gdpr_compliant);


-- =====================================================================
-- Tabela 5: CONSENTIMENTOS_LGPD - Registro de consentimentos dados
-- =====================================================================
CREATE TABLE IF NOT EXISTS consentimentos_lgpd (
  id                          TEXT PRIMARY KEY,                -- UUID
  pessoa_id                   TEXT NOT NULL,                  -- Quem deu consentimento
  pessoa_tipo                 TEXT NOT NULL,                  -- USUARIO, INQUILINO, PRESTADOR

  -- Consentimento
  tipo_consentimento          TEXT NOT NULL,                  -- PROCESSAMENTO_DADOS, MARKETING, ANÁLISE_CRÉDITO
  descricao                   TEXT,

  -- Status
  consentido                  INTEGER NOT NULL,
  data_consentimento          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  validade_ate                DATETIME,                       -- NULL = indefinido

  -- Contexto
  ip_address                  TEXT,
  user_agent                  TEXT,

  -- Auditoria
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consentimentos_pessoa
  ON consentimentos_lgpd(pessoa_tipo, pessoa_id);
CREATE INDEX IF NOT EXISTS idx_consentimentos_tipo
  ON consentimentos_lgpd(tipo_consentimento);
CREATE INDEX IF NOT EXISTS idx_consentimentos_status
  ON consentimentos_lgpd(consentido, validade_ate);


-- =====================================================================
-- Tabela 6: SOLICITACOES_DIREITOS_LGPD - Rastreamento de solicitações
-- =====================================================================
CREATE TABLE IF NOT EXISTS solicitacoes_direitos_lgpd (
  id                          TEXT PRIMARY KEY,                -- UUID

  -- Solicitante
  pessoa_id                   TEXT NOT NULL,
  pessoa_tipo                 TEXT NOT NULL,                  -- USUARIO, INQUILINO, PRESTADOR

  -- Direito exercido
  direito                     TEXT NOT NULL,                  -- ACESSO, RETIFICACAO, ANONIMIZACAO, EXPORTACAO, RESTRICAO
  descricao                   TEXT,

  -- Status
  status                      TEXT NOT NULL DEFAULT 'PENDENTE', -- PENDENTE, EM_PROCESSAMENTO, CONCLUIDA, REJEITADA
  data_solicitacao            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_conclusao              DATETIME,

  -- Resposta
  resposta_json               TEXT,                           -- Dados exportados/relatório de acesso
  motivo_rejeicao             TEXT,

  -- Auditoria
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_pessoa
  ON solicitacoes_direitos_lgpd(pessoa_tipo, pessoa_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_direito
  ON solicitacoes_direitos_lgpd(direito);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status
  ON solicitacoes_direitos_lgpd(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_data
  ON solicitacoes_direitos_lgpd(data_solicitacao DESC);
