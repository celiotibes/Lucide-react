/**
 * Phase 22.18: Compliance & Regulatory Reporting System
 *
 * Tables for:
 * - SPED/ECF reporting (Brazil)
 * - LGPD compliance (Brazil)
 * - GDPR compliance (EU)
 * - Audit trail & legal hold
 * - Tax compliance
 */

-- =====================================================================
-- Table: AUDIT_LOG - Universal audit trail
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id VARCHAR(50) PRIMARY KEY,

  -- Actor
  usuario_id UUID NOT NULL,

  -- Action
  acao TEXT NOT NULL,
  tipo_recurso VARCHAR(100) NOT NULL,
  id_recurso VARCHAR(100) NOT NULL,

  -- Data changes
  valor_anterior LONGTEXT,
  valor_novo LONGTEXT,

  -- Metadata
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  endereco_ip VARCHAR(45),
  user_agent TEXT,

  -- Status
  status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  motivo TEXT,

  -- Integrity
  hash_valor VARCHAR(64),

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  INDEX idx_audit_usuario (usuario_id),
  INDEX idx_audit_recurso (tipo_recurso, id_recurso),
  INDEX idx_audit_acao (acao),
  INDEX idx_audit_timestamp (timestamp DESC),
  INDEX idx_audit_integridade (hash_valor)
);

-- =====================================================================
-- Table: LEGAL_HOLDS - Legal hold management
-- =====================================================================

CREATE TABLE IF NOT EXISTS legal_holds (
  hold_id VARCHAR(50) PRIMARY KEY,
  id_recurso VARCHAR(100) NOT NULL,

  -- Hold details
  motivo TEXT NOT NULL,

  -- Dates
  data_inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_expiracao DATETIME NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED', 'EXPIRED')),
  data_liberacao DATETIME,
  motivo_liberacao TEXT,

  -- Audit
  criado_por UUID,
  liberado_por UUID,

  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (liberado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_holds_recurso (id_recurso),
  INDEX idx_holds_status (status),
  INDEX idx_holds_expiracao (data_expiracao)
);

-- =====================================================================
-- Table: LGPD_CONSENT_LOG - LGPD consent tracking
-- =====================================================================

CREATE TABLE IF NOT EXISTS lgpd_consent_log (
  id UUID PRIMARY KEY,
  usuario_id UUID NOT NULL,

  -- Consent type
  tipo_consentimento VARCHAR(100) NOT NULL,
  versao VARCHAR(10) NOT NULL,

  -- Status
  concedido_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revogado_em DATETIME,

  -- Tracking
  ip_address VARCHAR(45),
  user_agent TEXT,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_lgpd_usuario (usuario_id),
  INDEX idx_lgpd_tipo (tipo_consentimento),
  INDEX idx_lgpd_data (concedido_em DESC)
);

-- =====================================================================
-- Table: LGPD_DELETION_REQUESTS - Right to be forgotten requests
-- =====================================================================

CREATE TABLE IF NOT EXISTS lgpd_deletion_requests (
  request_id VARCHAR(50) PRIMARY KEY,
  usuario_id UUID NOT NULL,

  -- Request
  motivo TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED')
  ),

  -- Dates
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_exclusao_agendada DATETIME,
  data_exclusao_efetiva DATETIME,

  -- Review
  revisado_por UUID,
  data_revisao DATETIME,
  motivo_rejeicao TEXT,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (revisado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_lgpd_del_usuario (usuario_id),
  INDEX idx_lgpd_del_status (status),
  INDEX idx_lgpd_del_data_agendada (data_exclusao_agendada)
);

-- =====================================================================
-- Table: LGPD_DATA_PROCESSING - Data processing purposes
-- =====================================================================

CREATE TABLE IF NOT EXISTS lgpd_data_processing (
  id UUID PRIMARY KEY,
  usuario_id UUID NOT NULL,

  -- Data type and purpose
  tipo_dado VARCHAR(100) NOT NULL,
  proposito_processamento TEXT NOT NULL,

  -- Legal basis
  base_legal VARCHAR(100) NOT NULL CHECK (
    base_legal IN ('CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'VITAL_INTERESTS', 'PUBLIC_TASK', 'LEGITIMATE_INTERESTS')
  ),

  -- Retention
  periodo_retencao_dias INTEGER,
  data_expiracao DATETIME,

  -- Tracking
  ativo TINYINT NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_lgpd_processing_usuario (usuario_id),
  INDEX idx_lgpd_processing_tipo (tipo_dado)
);

-- =====================================================================
-- Table: LGPD_INCIDENT_LOG - Data breach/incident log
-- =====================================================================

CREATE TABLE IF NOT EXISTS lgpd_incident_log (
  id UUID PRIMARY KEY,

  -- Incident details
  tipo_incidente VARCHAR(100) NOT NULL,
  descricao TEXT NOT NULL,

  -- Impact
  usuarios_afetados INTEGER,
  dados_afetados TEXT,
  risco_nivel VARCHAR(20) NOT NULL CHECK (
    risco_nivel IN ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO')
  ),

  -- Dates
  data_incidente DATETIME NOT NULL,
  data_descoberta DATETIME NOT NULL,
  data_notificacao_autoridade DATETIME,

  -- Response
  medidas_tomadas TEXT,
  status_resolucao VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (
    status_resolucao IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')
  ),

  -- Audit
  investigador_id UUID,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (investigador_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_lgpd_incident_data (data_incidente DESC),
  INDEX idx_lgpd_incident_risco (risco_nivel)
);

-- =====================================================================
-- Table: GDPR_CONSENTS - GDPR consent records
-- =====================================================================

CREATE TABLE IF NOT EXISTS gdpr_consents (
  id UUID PRIMARY KEY,
  usuario_id UUID NOT NULL,

  -- Consent
  tipo_consentimento VARCHAR(100) NOT NULL,
  categoria_dados VARCHAR(100) NOT NULL,

  -- Status
  concedido TINYINT NOT NULL DEFAULT 0,
  data_consentimento DATETIME,
  data_revogacao DATETIME,

  -- Tracking
  versao_politica VARCHAR(10),
  ip_address VARCHAR(45),

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_gdpr_usuario (usuario_id),
  INDEX idx_gdpr_tipo (tipo_consentimento),
  INDEX idx_gdpr_concedido (concedido)
);

-- =====================================================================
-- Table: GDPR_DELETION_LOG - Right to be forgotten (immediate)
-- =====================================================================

CREATE TABLE IF NOT EXISTS gdpr_deletion_log (
  id UUID PRIMARY KEY,
  usuario_id UUID NOT NULL,

  -- Deletion
  data_exclusao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  motivo VARCHAR(255),

  -- Verification
  hash_verificacao VARCHAR(64),

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_gdpr_del_data (data_exclusao DESC)
);

-- =====================================================================
-- Table: COMPLIANCE_REPORTS - Generated compliance reports
-- =====================================================================

CREATE TABLE IF NOT EXISTS compliance_reports (
  id UUID PRIMARY KEY,

  -- Report type
  tipo_relatorio VARCHAR(50) NOT NULL CHECK (
    tipo_relatorio IN ('SPED', 'LGPD', 'GDPR', 'TAX', 'AUDIT')
  ),
  jurisdicao VARCHAR(10) NOT NULL CHECK (
    jurisdicao IN ('BR', 'EU', 'INTL')
  ),

  -- Period
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,

  -- File
  nome_arquivo VARCHAR(255),
  hash_arquivo VARCHAR(64),
  tamanho_bytes BIGINT,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'GENERATED', 'VALIDATED', 'SUBMITTED')
  ),

  -- Dates
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  gerado_em DATETIME,
  validado_em DATETIME,
  submetido_em DATETIME,

  -- Audit
  criado_por UUID NOT NULL,
  validado_por UUID,

  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
  FOREIGN KEY (validado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_compliance_tipo (tipo_relatorio),
  INDEX idx_compliance_periodo (data_inicio, data_fim),
  INDEX idx_compliance_status (status)
);

-- =====================================================================
-- Table: TAX_OBLIGATIONS - Tax compliance tracking
-- =====================================================================

CREATE TABLE IF NOT EXISTS tax_obligations (
  id UUID PRIMARY KEY,

  -- Tax type
  tipo_imposto VARCHAR(100) NOT NULL,
  periodo_ano INTEGER NOT NULL,
  periodo_mes INTEGER,

  -- Values
  valor_base DECIMAL(15, 2) NOT NULL,
  valor_imposto DECIMAL(15, 2) NOT NULL,
  valor_multa DECIMAL(15, 2) DEFAULT 0,

  -- Dates
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'PAID', 'LATE', 'WAIVED')
  ),

  -- Tracking
  comprovante_pagamento VARCHAR(255),
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (tipo_imposto, periodo_ano, periodo_mes),
  INDEX idx_tax_vencimento (data_vencimento),
  INDEX idx_tax_status (status)
);

-- =====================================================================
-- Table: COMPLIANCE_CERTIFICATIONS - Compliance certifications
-- =====================================================================

CREATE TABLE IF NOT EXISTS compliance_certifications (
  id UUID PRIMARY KEY,

  -- Certification
  tipo_certificacao VARCHAR(100) NOT NULL,
  orgao_certificador VARCHAR(255),
  numero_certificado VARCHAR(100),

  -- Dates
  data_expedicao DATE NOT NULL,
  data_expiracao DATE NOT NULL,

  -- Status
  ativo TINYINT NOT NULL DEFAULT 1,
  data_renovacao_sugerida DATE,

  -- File
  arquivo_certificado VARCHAR(255),

  UNIQUE (tipo_certificacao, numero_certificado),
  INDEX idx_cert_expiracao (data_expiracao),
  INDEX idx_cert_ativo (ativo)
);

-- =====================================================================
-- View: COMPLIANCE_STATUS - Current compliance status overview
-- =====================================================================

DROP VIEW IF EXISTS compliance_status;
CREATE VIEW compliance_status AS
SELECT
  'AUDIT_TRAIL' as compliance_area,
  COUNT(*) as total_records,
  MAX(timestamp) as ultimo_registro,
  SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as registros_falha
FROM audit_log
UNION ALL
SELECT
  'LEGAL_HOLDS' as compliance_area,
  COUNT(*) as total_records,
  MAX(data_inicio) as ultimo_registro,
  SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as registros_falha
FROM legal_holds
UNION ALL
SELECT
  'LGPD_CONSENTS' as compliance_area,
  COUNT(*) as total_records,
  MAX(concedido_em) as ultimo_registro,
  SUM(CASE WHEN revogado_em IS NOT NULL THEN 1 ELSE 0 END) as registros_falha
FROM lgpd_consent_log
UNION ALL
SELECT
  'TAX_OBLIGATIONS' as compliance_area,
  COUNT(*) as total_records,
  MAX(data_vencimento) as ultimo_registro,
  SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) as registros_falha
FROM tax_obligations;

-- =====================================================================
-- View: UPCOMING_COMPLIANCE_DEADLINES
-- =====================================================================

DROP VIEW IF EXISTS upcoming_compliance_deadlines;
CREATE VIEW upcoming_compliance_deadlines AS
SELECT
  'TAX_OBLIGATION' as tipo,
  tipo_imposto as descricao,
  data_vencimento as data_limite,
  DATEDIFF(data_vencimento, CURDATE()) as dias_restantes,
  valor_imposto as valor_total,
  status
FROM tax_obligations
WHERE data_vencimento >= CURDATE() AND status = 'PENDING'
UNION ALL
SELECT
  'LEGAL_HOLD' as tipo,
  'Legal Hold - ' || id_recurso as descricao,
  data_expiracao as data_limite,
  DATEDIFF(data_expiracao, CURDATE()) as dias_restantes,
  0 as valor_total,
  status
FROM legal_holds
WHERE data_expiracao >= CURDATE() AND status = 'ACTIVE'
UNION ALL
SELECT
  'CERTIFICATION' as tipo,
  tipo_certificacao as descricao,
  data_expiracao as data_limite,
  DATEDIFF(data_expiracao, CURDATE()) as dias_restantes,
  0 as valor_total,
  CASE WHEN ativo = 1 THEN 'ACTIVE' ELSE 'EXPIRED' END
FROM compliance_certifications
WHERE ativo = 1
ORDER BY data_limite ASC;
