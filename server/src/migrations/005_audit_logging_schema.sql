-- Phase 7: Audit Logging & Immutable Records Schema
-- Creates tables for immutable audit logging (WORM - Write Once, Read Many)
-- Blockchain-style chaining for tamper detection

-- =============================================
-- AUDIT LOG - Immutable Records Table
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  sequencia BIGINT NOT NULL UNIQUE,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  usuario_id VARCHAR(255) NOT NULL,
  usuario_email VARCHAR(255) NOT NULL,
  tipo_operacao ENUM(
    'LEITURA',
    'CRIACAO',
    'ATUALIZACAO',
    'DELECAO',
    'EXPORTACAO',
    'IMPORTACAO',
    'AUTENTICACAO',
    'AUTORIZACAO',
    'CONFIGURACAO'
  ) NOT NULL,
  entidade_tipo VARCHAR(100) NOT NULL,
  entidade_id VARCHAR(255) NOT NULL,
  entidade_descricao TEXT,
  dados_anteriores JSON,
  dados_novos JSON,
  endereco_ip VARCHAR(45),
  user_agent TEXT,
  resultado ENUM('SUCESSO', 'FALHA', 'PARCIAL') NOT NULL,
  mensagem_erro TEXT,
  nivel_sensibilidade ENUM(
    'PUBLICO',
    'INTERNO',
    'CONFIDENCIAL',
    'RESTRITO'
  ) DEFAULT 'INTERNO',
  motivo TEXT NOT NULL,
  aprovado_por VARCHAR(255),
  hash_registro CHAR(64) NOT NULL UNIQUE,
  hash_anterior CHAR(64),
  assinatura_digital CHAR(128),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_timestamp (timestamp),
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_tipo_operacao (tipo_operacao),
  INDEX idx_entidade (entidade_tipo, entidade_id),
  INDEX idx_resultado (resultado),
  INDEX idx_hash_registro (hash_registro),
  INDEX idx_hash_anterior (hash_anterior),
  CONSTRAINT fk_audit_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Immutable audit log with blockchain-style hash chaining';

-- =============================================
-- BLOCKCHAIN - Audit Log Blocks
-- =============================================
CREATE TABLE IF NOT EXISTS audit_blocks (
  numero_bloco BIGINT PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  registros_quantidade INT NOT NULL DEFAULT 0,
  hash_bloco CHAR(64) NOT NULL UNIQUE,
  hash_bloco_anterior CHAR(64),
  merkle_root CHAR(64),
  nonce BIGINT DEFAULT 0,
  verificado BOOLEAN DEFAULT FALSE,
  data_verificacao TIMESTAMP NULL,

  INDEX idx_timestamp (timestamp),
  INDEX idx_hash_bloco (hash_bloco),
  CONSTRAINT chk_bloco_numero CHECK (numero_bloco >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Blockchain blocks for immutable audit log';

-- =============================================
-- CONSENTIMENTO - LGPD Compliance
-- =============================================
CREATE TABLE IF NOT EXISTS audit_consentimentos (
  id VARCHAR(36) PRIMARY KEY,
  usuario_id VARCHAR(255) NOT NULL,
  tipo_consentimento ENUM(
    'AUDITORIA',
    'RASTREAMENTO',
    'EXPORTACAO'
  ) NOT NULL,
  concedido BOOLEAN NOT NULL,
  data_concessao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_revogacao TIMESTAMP NULL,
  prova_consentimento TEXT,
  valido BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_usuario_id (usuario_id),
  INDEX idx_tipo (tipo_consentimento),
  UNIQUE KEY uk_usuario_tipo (usuario_id, tipo_consentimento),
  CONSTRAINT fk_consentimento_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='LGPD Consent tracking for audit log access';

-- =============================================
-- RELATORIOS - Audit Reports
-- =============================================
CREATE TABLE IF NOT EXISTS audit_relatorios (
  id VARCHAR(36) PRIMARY KEY,
  titulo VARCHAR(500) NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  registros_encontrados INT DEFAULT 0,
  operacoes_por_tipo JSON,
  usuarios_ativos JSON,
  entidades_afetadas JSON,
  taxa_sucesso_percentual DECIMAL(5, 2),
  avisos JSON,
  criado_por VARCHAR(255),
  assinado_digitalmente BOOLEAN DEFAULT FALSE,
  arquivo_url VARCHAR(500),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_data_inicio (data_inicio),
  INDEX idx_data_fim (data_fim),
  INDEX idx_criado_por (criado_por)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Audit reports for compliance';

-- =============================================
-- BACKUP - Strategy & Execution
-- =============================================
CREATE TABLE IF NOT EXISTS backup_history (
  id VARCHAR(36) PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tipo ENUM('COMPLETO', 'INCREMENTAL', 'DIFERENCIAL') NOT NULL,
  status ENUM(
    'PENDENTE',
    'EM_PROGRESSO',
    'CONCLUIDO',
    'FALHA',
    'VERIFICANDO'
  ) NOT NULL,
  tamanho_bytes BIGINT,
  tamanho_comprimido_bytes BIGINT,
  taxa_compressao DECIMAL(5, 2),
  caminho_local VARCHAR(500),
  caminho_offshore VARCHAR(500),
  checksum_sha256 CHAR(64),
  duracao_segundos INT,
  linhas_processadas BIGINT,
  versao_schema VARCHAR(20),
  encriptado BOOLEAN DEFAULT TRUE,
  blocos_sincronizados INT,
  blocos_falhados INT,
  ultima_verificacao TIMESTAMP NULL,
  integralidade_verificada BOOLEAN DEFAULT FALSE,
  restauracao_testada TIMESTAMP NULL,
  metadados JSON,
  criado_por VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_timestamp (timestamp),
  INDEX idx_tipo (tipo),
  INDEX idx_status (status),
  INDEX idx_checksum (checksum_sha256),
  CONSTRAINT fk_backup_usuario FOREIGN KEY (criado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Backup execution history';

-- =============================================
-- RETENTION POLICIES - Backup Retention
-- =============================================
CREATE TABLE IF NOT EXISTS backup_retention_policies (
  id VARCHAR(36) PRIMARY KEY,
  nivel ENUM(
    'DIARIO_30_DIAS',
    'SEMANAL_1_ANO',
    'MENSAL_7_ANOS'
  ) NOT NULL UNIQUE,
  dias_retencao INT NOT NULL,
  quantidade_minima INT,
  quantidade_maxima INT,
  replicas_geograficas INT DEFAULT 1,
  compressao_habilitada BOOLEAN DEFAULT TRUE,
  encriptacao_habilitada BOOLEAN DEFAULT TRUE,
  verificacao_integridade_frequencia_horas INT DEFAULT 24,
  ativa BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Backup retention policies';

-- =============================================
-- REPLICATION STATUS - HA Monitoring
-- =============================================
CREATE TABLE IF NOT EXISTS replication_status (
  id VARCHAR(36) PRIMARY KEY,
  replica_id VARCHAR(255) NOT NULL,
  status ENUM(
    'SAUDAVEL',
    'DEGRADADA',
    'DESCONECTADA',
    'SINCRONIZANDO',
    'FALHA'
  ) NOT NULL,
  replicacao_lag_ms BIGINT,
  linhas_sincronizadas BIGINT,
  linhas_pendentes INT,
  ultima_sincronizacao TIMESTAMP,
  taxa_transferencia_mbps DECIMAL(8, 2),
  percentual_disco DECIMAL(5, 2),
  cpu_percentual DECIMAL(5, 2),
  memoria_percentual DECIMAL(5, 2),
  conexoes_ativas INT,
  transacoes_por_segundo INT,
  erros_ultimas_24h INT,
  ultimaVerificacao TIMESTAMP,
  proximaVerificacao TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_replica_id (replica_id),
  INDEX idx_status (status),
  INDEX idx_timestamp (ultimaVerificacao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Replication status for high availability';

-- =============================================
-- FAILOVER EVENTS - Disaster Recovery
-- =============================================
CREATE TABLE IF NOT EXISTS failover_history (
  id VARCHAR(36) PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tipo ENUM('FAILOVER', 'FAILBACK', 'VERIFICACAO', 'RECUPERACAO') NOT NULL,
  replica_origem_id VARCHAR(255),
  replica_destino_id VARCHAR(255),
  razao TEXT,
  automatico BOOLEAN DEFAULT TRUE,
  tempo_execucao_ms BIGINT,
  sucesso BOOLEAN,
  dados_perdidos BIGINT DEFAULT 0,
  transacoes_reviravoltadas BIGINT DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_timestamp (timestamp),
  INDEX idx_tipo (tipo),
  INDEX idx_sucesso (sucesso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Failover events for disaster recovery';

-- =============================================
-- COMPLIANCE CONTROLS - Monitoring
-- =============================================
CREATE TABLE IF NOT EXISTS compliance_controles (
  id VARCHAR(36) PRIMARY KEY,
  tipo_compliance ENUM(
    'SOC_2',
    'ISO_27001',
    'LGPD',
    'HIPAA',
    'PCI_DSS'
  ) NOT NULL,
  codigo_controle VARCHAR(50) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  categoria VARCHAR(100),
  status ENUM(
    'CONFORME',
    'PARCIALMENTE_CONFORME',
    'NAO_CONFORME',
    'AUSENTE'
  ) DEFAULT 'AUSENTE',
  nivel_risco ENUM('CRITICO', 'ALTO', 'MEDIO', 'BAIXO') DEFAULT 'MEDIO',
  responsavel VARCHAR(255),
  data_ultimo_teste TIMESTAMP,
  proxima_data_teste TIMESTAMP,
  evidencias JSON,
  observacoes TEXT,
  plano_remediacao TEXT,
  prazo_remediacao DATE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_tipo_compliance (tipo_compliance),
  INDEX idx_status (status),
  INDEX idx_responsavel (responsavel),
  UNIQUE KEY uk_compliance (tipo_compliance, codigo_controle)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Compliance control tracking';

-- =============================================
-- CRIPTOGRAFIA - Key Management
-- =============================================
CREATE TABLE IF NOT EXISTS criptografia_chaves (
  id VARCHAR(100) PRIMARY KEY,
  tipo ENUM('MESTRE', 'ENCRIPTACAO', 'ASSINATURA') NOT NULL,
  algoritmo ENUM(
    'AES_256_GCM',
    'RSA_4096',
    'CHACHA20_POLY1305'
  ) NOT NULL,
  versao INT NOT NULL,
  chave_material LONGTEXT,
  chave_publica LONGTEXT,
  status ENUM(
    'ATIVA',
    'ROTACIONANDO',
    'ROTACIONADA',
    'REVOGADA'
  ) DEFAULT 'ATIVA',
  criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  proxima_rotacao TIMESTAMP,
  revogada_em TIMESTAMP NULL,
  rotacoes_pendentes INT DEFAULT 0,
  ambiente ENUM('PRODUCAO', 'STAGING', 'DESENVOLVIMENTO') NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_status (status),
  INDEX idx_ambiente (ambiente),
  INDEX idx_criada_em (criada_em),
  UNIQUE KEY uk_chave (tipo, ambiente, versao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Encryption key management';

-- =============================================
-- Views for easy querying
-- =============================================

CREATE OR REPLACE VIEW vw_audit_recentes AS
SELECT
  id,
  sequencia,
  timestamp,
  usuario_email,
  tipo_operacao,
  entidade_tipo,
  entidade_id,
  resultado,
  nivel_sensibilidade
FROM audit_logs
ORDER BY timestamp DESC
LIMIT 100;

CREATE OR REPLACE VIEW vw_audit_falhas_24h AS
SELECT
  COUNT(*) as total_falhas,
  usuario_id,
  tipo_operacao,
  DATE(timestamp) as data
FROM audit_logs
WHERE resultado = 'FALHA'
  AND timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY usuario_id, tipo_operacao, DATE(timestamp);

CREATE OR REPLACE VIEW vw_backup_status AS
SELECT
  tipo,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'CONCLUIDO' THEN 1 ELSE 0 END) as concluidos,
  SUM(CASE WHEN status = 'FALHA' THEN 1 ELSE 0 END) as falhados,
  MAX(timestamp) as ultima_execucao,
  AVG(taxa_compressao) as taxa_media_compressao
FROM backup_history
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY tipo;

-- =============================================
-- Indexes for performance
-- =============================================

CREATE INDEX idx_audit_logs_sequencia_timestamp ON audit_logs (sequencia, timestamp);
CREATE INDEX idx_audit_logs_usuario_timestamp ON audit_logs (usuario_id, timestamp);
CREATE INDEX idx_audit_blocks_timestamp ON audit_blocks (timestamp);
CREATE INDEX idx_backup_history_tipo_timestamp ON backup_history (tipo, timestamp);
CREATE INDEX idx_replication_status_timestamp ON replication_status (ultimaVerificacao);

-- =============================================
-- Initial data
-- =============================================

INSERT INTO audit_blocks (numero_bloco, hash_bloco, hash_bloco_anterior, merkle_root, verificado, data_verificacao)
VALUES (0, MD5('GENESIS'), '0x0000', MD5(''), TRUE, NOW())
ON DUPLICATE KEY UPDATE numero_bloco = numero_bloco;

INSERT INTO backup_retention_policies (id, nivel, dias_retencao, quantidade_minima, quantidade_maxima, replicas_geograficas)
VALUES
  ('pol-diaria', 'DIARIO_30_DIAS', 30, 25, 31, 2),
  ('pol-semanal', 'SEMANAL_1_ANO', 365, 50, 53, 3),
  ('pol-mensal', 'MENSAL_7_ANOS', 2555, 80, 84, 4)
ON DUPLICATE KEY UPDATE dias_retencao = dias_retencao;

-- =============================================
-- Stored Procedures for common operations
-- =============================================

DELIMITER //

CREATE PROCEDURE sp_audit_log_entrada (
  IN p_usuario_id VARCHAR(255),
  IN p_usuario_email VARCHAR(255),
  IN p_tipo_operacao VARCHAR(50),
  IN p_entidade_tipo VARCHAR(100),
  IN p_entidade_id VARCHAR(255),
  IN p_entidade_descricao TEXT,
  IN p_endereco_ip VARCHAR(45),
  IN p_user_agent TEXT,
  IN p_resultado VARCHAR(20),
  IN p_motivo TEXT
)
BEGIN
  INSERT INTO audit_logs (
    id, sequencia, usuario_id, usuario_email, tipo_operacao,
    entidade_tipo, entidade_id, entidade_descricao, endereco_ip,
    user_agent, resultado, motivo, hash_registro, hash_anterior
  ) VALUES (
    UUID(), (SELECT MAX(sequencia) + 1 FROM audit_logs),
    p_usuario_id, p_usuario_email, p_tipo_operacao,
    p_entidade_tipo, p_entidade_id, p_entidade_descricao, p_endereco_ip,
    p_user_agent, p_resultado, p_motivo,
    SHA2(CONCAT(p_usuario_id, p_entidade_id, NOW()), 256),
    (SELECT hash_registro FROM audit_logs ORDER BY sequencia DESC LIMIT 1)
  );
END //

CREATE PROCEDURE sp_verify_audit_chain()
BEGIN
  SELECT
    COUNT(*) as total_registros,
    SUM(CASE WHEN hash_anterior IS NOT NULL THEN 1 ELSE 0 END) as cadeia_valida,
    COUNT(DISTINCT hash_registro) as hashes_unicos
  FROM audit_logs;
END //

DELIMITER ;

-- =============================================
-- Permissions and grants
-- =============================================

-- Grant permissions based on roles
-- These should be customized per environment
-- GRANT SELECT ON audit_logs TO 'audit_viewer'@'%';
-- GRANT SELECT, INSERT ON audit_logs TO 'audit_logger'@'%';
-- GRANT ALL ON audit_logs TO 'admin'@'%';
