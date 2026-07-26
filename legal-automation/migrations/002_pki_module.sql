-- migrations/002_pki_module.sql
-- PKI (Public Key Infrastructure) Module - Certificate Management

CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cnpj VARCHAR(14) NOT NULL,
  subject_dn TEXT NOT NULL,
  issuer_dn TEXT NOT NULL,
  not_before TIMESTAMP NOT NULL,
  not_after TIMESTAMP NOT NULL,
  serial_number VARCHAR(255) UNIQUE NOT NULL,
  key_type VARCHAR(20) NOT NULL CHECK (key_type IN ('A1', 'A3')),
  fingerprint_sha256 VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'VALID' CHECK (status IN ('VALID', 'EXPIRED', 'REVOKED', 'SUSPENDED')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,

  UNIQUE(user_id, cnpj)
);

CREATE TABLE IF NOT EXISTS signature_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  document_id UUID,
  signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT,
  hash_algorithm VARCHAR(50),
  signature_format VARCHAR(50),
  status VARCHAR(20),
  error_message TEXT
);

-- Índices para performance
CREATE INDEX idx_certificates_user_id ON certificates(user_id);
CREATE INDEX idx_certificates_cnpj ON certificates(cnpj);
CREATE INDEX idx_certificates_fingerprint ON certificates(fingerprint_sha256);
CREATE INDEX idx_certificates_status ON certificates(status);
CREATE INDEX idx_signature_audit_certificate_id ON signature_audit_log(certificate_id);
CREATE INDEX idx_signature_audit_document_id ON signature_audit_log(document_id);
CREATE INDEX idx_signature_audit_signed_at ON signature_audit_log(signed_at);
