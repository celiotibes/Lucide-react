-- migrations/003_ged_module.sql
-- GED (Gestão Eletrônica de Documentos) Module

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  storage_path VARCHAR(500) NOT NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  ocr_content TEXT,
  ocr_processed_at TIMESTAMP,
  searchable_content TEXT,
  extracted_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  storage_path VARCHAR(500) NOT NULL,
  changes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(document_id, version_number)
);

CREATE TABLE IF NOT EXISTS document_tags (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (document_id, tag)
);

-- Full-text search setup
CREATE INDEX idx_documents_case_id ON documents(case_id);
CREATE INDEX idx_documents_document_type ON documents(document_type);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_searchable_content ON documents USING GIN(
  to_tsvector('portuguese', searchable_content)
);

CREATE INDEX idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX idx_document_tags_document_id ON document_tags(document_id);
CREATE INDEX idx_document_tags_tag ON document_tags(tag);
