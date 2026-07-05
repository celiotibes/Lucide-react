import db from '../src/db/connection';
import { logger } from '../src/utils/logger';

export async function migrateDigitalSignatures(): Promise<void> {
  logger.info('Iniciando migração de infraestrutura de assinatura digital');

  try {
    // Create certificates table
    db.exec(`
      CREATE TABLE IF NOT EXISTS certificates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        common_name TEXT NOT NULL,
        issuer_name TEXT NOT NULL,
        serial_number TEXT NOT NULL UNIQUE,
        thumbprint TEXT NOT NULL UNIQUE,
        public_key LONGTEXT NOT NULL,
        key_type TEXT NOT NULL DEFAULT 'RSA',
        key_size INTEGER DEFAULT 2048,
        valid_from DATETIME NOT NULL,
        valid_until DATETIME NOT NULL,
        is_valid BOOLEAN DEFAULT 1,
        is_pinned BOOLEAN DEFAULT 0,
        certificate_type TEXT NOT NULL DEFAULT 'A1',
        issuer_type TEXT NOT NULL DEFAULT 'AC',
        owner_type TEXT NOT NULL DEFAULT 'person',
        owner_name TEXT NOT NULL,
        owner_identifier TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME,
        usage_count INTEGER DEFAULT 0,
        metadata TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_thumbprint (thumbprint),
        INDEX idx_valid_until (valid_until)
      )
    `);

    // Create signing_keys table for key management
    db.exec(`
      CREATE TABLE IF NOT EXISTS signing_keys (
        id TEXT PRIMARY KEY,
        certificate_id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        private_key_encrypted LONGTEXT NOT NULL,
        algorithm TEXT NOT NULL DEFAULT 'SHA256withRSA',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_certificate_id (certificate_id),
        INDEX idx_user_id (user_id)
      )
    `);

    // Create document_signatures table
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_signatures (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        process_id TEXT,
        case_id TEXT,
        signer_id TEXT NOT NULL,
        certificate_id TEXT NOT NULL,
        signature_value LONGTEXT NOT NULL,
        signature_algorithm TEXT NOT NULL DEFAULT 'SHA256withRSA',
        signing_time DATETIME NOT NULL,
        location TEXT,
        reason TEXT,
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        content_hash TEXT NOT NULL,
        signature_format TEXT NOT NULL DEFAULT 'CMS',
        trust_level TEXT NOT NULL DEFAULT 'unknown',
        validation_result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (signer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (certificate_id) REFERENCES certificates(id),
        INDEX idx_document_id (document_id),
        INDEX idx_signer_id (signer_id),
        INDEX idx_certificate_id (certificate_id),
        INDEX idx_signing_time (signing_time),
        INDEX idx_content_hash (content_hash)
      )
    `);

    // Create timestamp_tokens table for RFC 3161 timestamps
    db.exec(`
      CREATE TABLE IF NOT EXISTS timestamp_tokens (
        id TEXT PRIMARY KEY,
        signature_id TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        tsa_url TEXT NOT NULL,
        token LONGTEXT NOT NULL,
        serial_number TEXT NOT NULL UNIQUE,
        hash_algorithm TEXT NOT NULL DEFAULT 'SHA256',
        is_valid BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (signature_id) REFERENCES document_signatures(id) ON DELETE CASCADE,
        INDEX idx_signature_id (signature_id),
        INDEX idx_timestamp (timestamp)
      )
    `);

    // Create signature_audit_logs table for LGPD compliance
    db.exec(`
      CREATE TABLE IF NOT EXISTS signature_audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        certificate_id TEXT NOT NULL,
        document_id TEXT,
        signature_id TEXT,
        action TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'success',
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        lgpd_compliant BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (certificate_id) REFERENCES certificates(id),
        INDEX idx_user_id (user_id),
        INDEX idx_action (action),
        INDEX idx_timestamp (timestamp),
        INDEX idx_lgpd_compliant (lgpd_compliant)
      )
    `);

    // Create certificate_chain table for trust validation
    db.exec(`
      CREATE TABLE IF NOT EXISTS certificate_chains (
        id TEXT PRIMARY KEY,
        root_certificate_id TEXT NOT NULL,
        issuer_certificate_id TEXT,
        chain_order INTEGER NOT NULL,
        is_trusted BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (root_certificate_id) REFERENCES certificates(id) ON DELETE CASCADE,
        FOREIGN KEY (issuer_certificate_id) REFERENCES certificates(id),
        INDEX idx_root_id (root_certificate_id),
        INDEX idx_issuer_id (issuer_certificate_id)
      )
    `);

    // Create document_counter_signatures table for multi-signature support
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_counter_signatures (
        id TEXT PRIMARY KEY,
        main_signature_id TEXT NOT NULL,
        counter_signature_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (main_signature_id) REFERENCES document_signatures(id) ON DELETE CASCADE,
        FOREIGN KEY (counter_signature_id) REFERENCES document_signatures(id) ON DELETE CASCADE,
        UNIQUE(main_signature_id, counter_signature_id)
      )
    `);

    // Create certificate_revocation_checks table
    db.exec(`
      CREATE TABLE IF NOT EXISTS certificate_revocation_checks (
        id TEXT PRIMARY KEY,
        certificate_id TEXT NOT NULL,
        check_time DATETIME NOT NULL,
        status TEXT NOT NULL,
        crl_url TEXT,
        ocsp_url TEXT,
        revocation_time DATETIME,
        reason TEXT,
        next_check DATETIME,
        FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE CASCADE,
        INDEX idx_certificate_id (certificate_id),
        INDEX idx_check_time (check_time),
        INDEX idx_next_check (next_check)
      )
    `);

    // Create petition_signatures table for petition-specific signing
    db.exec(`
      CREATE TABLE IF NOT EXISTS petition_signatures (
        id TEXT PRIMARY KEY,
        petition_id TEXT NOT NULL,
        main_signature_id TEXT NOT NULL,
        signer_name TEXT NOT NULL,
        signer_cpf TEXT,
        signer_cnpj TEXT,
        role TEXT,
        signature_timestamp DATETIME NOT NULL,
        include_timestamp BOOLEAN DEFAULT 0,
        signature_format TEXT NOT NULL DEFAULT 'PAdES',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (main_signature_id) REFERENCES document_signatures(id) ON DELETE CASCADE,
        INDEX idx_petition_id (petition_id),
        INDEX idx_signature_id (main_signature_id),
        INDEX idx_signer_cpf (signer_cpf),
        INDEX idx_signer_cnpj (signer_cnpj)
      )
    `);

    // Create certificate_expiration_alerts table
    db.exec(`
      CREATE TABLE IF NOT EXISTS certificate_expiration_alerts (
        id TEXT PRIMARY KEY,
        certificate_id TEXT NOT NULL,
        days_until_expiration INTEGER NOT NULL,
        severity TEXT NOT NULL,
        last_notification_at DATETIME,
        acknowledged BOOLEAN DEFAULT 0,
        acknowledged_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE CASCADE,
        FOREIGN KEY (acknowledged_by) REFERENCES users(id),
        INDEX idx_certificate_id (certificate_id),
        INDEX idx_severity (severity),
        INDEX idx_acknowledged (acknowledged)
      )
    `);

    // Create indexes for performance optimization
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_certificates_user_valid
      ON certificates(user_id, is_valid, valid_until);

      CREATE INDEX IF NOT EXISTS idx_document_signatures_case
      ON document_signatures(case_id, signing_time DESC);

      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action
      ON signature_audit_logs(user_id, action, timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_petition_signatures_signer
      ON petition_signatures(signer_cpf, signature_timestamp DESC);
    `);

    logger.info('✓ Migração de assinatura digital concluída com sucesso');
    logger.info('  - Tabelas criadas: 9');
    logger.info('  - Índices otimizados: 4');
    logger.info(
      '  - Suporte LGPD: Ativo (audit_logs com compliance flag)',
    );
  } catch (error) {
    logger.error(
      { err: error },
      'Erro ao executar migração de assinatura digital',
    );
    throw error;
  }
}

// Execute migration if run directly
if (require.main === module) {
  migrateDigitalSignatures()
    .then(() => {
      logger.info('Migração de assinatura digital finalizada com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ err: error }, 'Falha na migração de assinatura digital');
      process.exit(1);
    });
}

export default migrateDigitalSignatures;
