-- Create certificates table for ICP-Brasil certificate management
CREATE TABLE IF NOT EXISTS certificates (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  thumbprint VARCHAR(255) NOT NULL UNIQUE,
  serial_number VARCHAR(255),
  subject TEXT NOT NULL,
  issuer TEXT NOT NULL,
  not_before TIMESTAMP,
  not_after TIMESTAMP,
  algorithm VARCHAR(50),
  key_usage JSON,
  extended_key_usage JSON,
  certificate_type VARCHAR(10) NOT NULL,
  person_type VARCHAR(20) NOT NULL,
  cpf_cnpj VARCHAR(20),
  name VARCHAR(255),
  email VARCHAR(255),
  organization VARCHAR(255),
  certificate_pem LONGTEXT,
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  is_valid BOOLEAN DEFAULT true,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_thumbprint (thumbprint),
  INDEX idx_certificate_type (certificate_type),
  INDEX idx_person_type (person_type),
  INDEX idx_valid_until (valid_until),
  INDEX idx_is_valid (is_valid)
);

-- Create signatures table for tracking signed documents
CREATE TABLE IF NOT EXISTS digital_signatures (
  id VARCHAR(100) PRIMARY KEY,
  document_hash VARCHAR(255) NOT NULL,
  certificate_thumbprint VARCHAR(255) NOT NULL,
  signature_value LONGTEXT NOT NULL,
  signature_format VARCHAR(20) NOT NULL,
  timestamp_authority VARCHAR(255),
  tsa_response TEXT,
  signing_time TIMESTAMP,
  signed_by VARCHAR(255),
  verification_status VARCHAR(20),
  chain_validation BOOLEAN,
  timestamp_validation BOOLEAN,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_document_hash (document_hash),
  INDEX idx_certificate_thumbprint (certificate_thumbprint),
  INDEX idx_signature_format (signature_format),
  INDEX idx_verification_status (verification_status),
  INDEX idx_created_at (created_at),

  FOREIGN KEY (certificate_thumbprint) REFERENCES certificates(thumbprint)
);

-- Create revoked_certificates table for certificate revocation tracking
CREATE TABLE IF NOT EXISTS revoked_certificates (
  id SERIAL PRIMARY KEY,
  thumbprint VARCHAR(255) NOT NULL UNIQUE,
  certificate_data JSON,
  reason TEXT,
  revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_by VARCHAR(255),

  INDEX idx_thumbprint (thumbprint),
  INDEX idx_revoked_at (revoked_at)
);

-- Create certificate_chains table for chain validation
CREATE TABLE IF NOT EXISTS certificate_chains (
  id SERIAL PRIMARY KEY,
  leaf_thumbprint VARCHAR(255) NOT NULL,
  chain_position INTEGER NOT NULL,
  certificate_thumbprint VARCHAR(255) NOT NULL,
  certificate_subject TEXT,
  certificate_issuer TEXT,
  validation_status VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_leaf_thumbprint (leaf_thumbprint),
  INDEX idx_certificate_thumbprint (certificate_thumbprint)
);
