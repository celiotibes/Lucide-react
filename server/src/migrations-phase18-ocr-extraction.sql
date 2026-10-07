/**
 * Fase 18: OCR Document Extraction and Invoice Parsing
 *
 * Implements OCR-based document text extraction and invoice field recognition:
 * - PDF text extraction via pdfjs-dist
 * - Image OCR via Tesseract.js (Portuguese/English)
 * - Invoice field detection (CNPJ, CPF, invoice number, date, amount, etc.)
 * - Confidence scoring per field (0-100%)
 * - Manual review workflow for low-confidence extractions
 * - Linking to agents (CNPJ/CPF) and ledger entries (invoice number)
 *
 * Tables:
 * - document_extractions: Stores OCR extraction results per lote
 * - extraction_fields: Individual field extraction with confidence scores
 * - extraction_reviews: Manual review and correction audit trail
 *
 * Applied on every boot (idempotent — all tables use IF NOT EXISTS).
 */

-- =====================================================================
-- Table 1: DOCUMENT_EXTRACTIONS - OCR results per document/lote
-- =====================================================================
CREATE TABLE IF NOT EXISTS document_extractions (
  id                          TEXT PRIMARY KEY,                -- UUID
  lote_id                     TEXT NOT NULL,                  -- FK to importacao_lotes.id
  usuario_id                  TEXT NOT NULL,                  -- FK to usuarios.id

  -- Document metadata
  document_type               TEXT NOT NULL DEFAULT 'unknown', -- invoice, receipt, contract, unknown
  extraction_status           TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED
  extraction_error            TEXT,                            -- Error message if extraction failed

  -- Extracted text (raw)
  extracted_text              TEXT,                            -- Full OCR text output
  extracted_text_length       INTEGER,                         -- Bytes of extracted text

  -- Confidence scores (JSON)
  confidence_scores           TEXT,                            -- JSON: { overall: 0-100, field_name: score, ... }
  overall_confidence          INTEGER DEFAULT 0,               -- 0-100: overall extraction quality

  -- Manual review flag
  requires_manual_review      INTEGER NOT NULL DEFAULT 0 CHECK(requires_manual_review IN (0, 1)),
  manual_review_flag_reason   TEXT,                            -- Why manual review is needed

  -- Linked entities (optional)
  cnpj_extraido               TEXT,                            -- Extracted CNPJ (supplier)
  cpf_extraido                TEXT,                            -- Extracted CPF (buyer)
  numero_nf_extraido          TEXT,                            -- Extracted invoice number
  data_nf_extraida            DATE,                            -- Extracted invoice date
  valor_extraido              DECIMAL(12, 2),                  -- Extracted total amount

  -- Review workflow
  revisado_por                TEXT,                           -- FK to usuarios.id (reviewer)
  revisado_em                 DATETIME,
  aprovado_por                TEXT,                           -- FK to usuarios.id (approver)
  aprovado_em                 DATETIME,
  rejeitado_por               TEXT,                           -- FK to usuarios.id (rejecter)
  rejeitado_em                DATETIME,
  motivo_rejeicao             TEXT,                           -- Reason for rejection

  -- Audit trail
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys
  FOREIGN KEY (lote_id) REFERENCES importacao_lotes(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (revisado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (aprovado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (rejeitado_por) REFERENCES usuarios(id) ON DELETE SET NULL,

  -- Constraints
  CHECK (extraction_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  CHECK (overall_confidence >= 0 AND overall_confidence <= 100),
  CHECK (document_type IN ('invoice', 'receipt', 'contract', 'unknown'))
);

-- Indices for extraction lookup and filtering
CREATE INDEX IF NOT EXISTS idx_document_extractions_lote
  ON document_extractions(lote_id);

CREATE INDEX IF NOT EXISTS idx_document_extractions_usuario
  ON document_extractions(usuario_id);

CREATE INDEX IF NOT EXISTS idx_document_extractions_status
  ON document_extractions(extraction_status);

CREATE INDEX IF NOT EXISTS idx_document_extractions_confidence
  ON document_extractions(overall_confidence);

CREATE INDEX IF NOT EXISTS idx_document_extractions_requires_review
  ON document_extractions(requires_manual_review)
  WHERE requires_manual_review = 1;

-- Index for linking to agents/ledger
CREATE INDEX IF NOT EXISTS idx_document_extractions_cnpj
  ON document_extractions(cnpj_extraido);

CREATE INDEX IF NOT EXISTS idx_document_extractions_cpf
  ON document_extractions(cpf_extraido);

CREATE INDEX IF NOT EXISTS idx_document_extractions_invoice_number
  ON document_extractions(numero_nf_extraido);

-- =====================================================================
-- Table 2: EXTRACTION_FIELDS - Individual field extractions
-- =====================================================================
CREATE TABLE IF NOT EXISTS extraction_fields (
  id                          TEXT PRIMARY KEY,                -- UUID
  extraction_id               TEXT NOT NULL,                  -- FK to document_extractions.id
  lote_id                     TEXT NOT NULL,                  -- FK to importacao_lotes.id (denormalized for query efficiency)

  -- Field data
  field_name                  TEXT NOT NULL,                  -- Field identifier (supplier_cnpj, invoice_number, etc.)
  field_value                 TEXT,                           -- Extracted value
  field_confidence            INTEGER NOT NULL DEFAULT 0,     -- 0-100: confidence in this field
  raw_text                    TEXT,                           -- Raw text from OCR before parsing

  -- Validation
  is_valid                    INTEGER NOT NULL DEFAULT 1 CHECK(is_valid IN (0, 1)),
  validation_error            TEXT,                           -- Validation error message if invalid

  -- Correction (manual review)
  corrected_by                TEXT,                           -- FK to usuarios.id (who corrected)
  corrected_value             TEXT,                           -- Corrected value if changed by user
  corrected_em                DATETIME,
  correction_notes            TEXT,

  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys
  FOREIGN KEY (extraction_id) REFERENCES document_extractions(id) ON DELETE CASCADE,
  FOREIGN KEY (lote_id) REFERENCES importacao_lotes(id) ON DELETE CASCADE,
  FOREIGN KEY (corrected_by) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Indices for field lookup
CREATE INDEX IF NOT EXISTS idx_extraction_fields_extraction
  ON extraction_fields(extraction_id);

CREATE INDEX IF NOT EXISTS idx_extraction_fields_field_name
  ON extraction_fields(field_name);

CREATE INDEX IF NOT EXISTS idx_extraction_fields_confidence
  ON extraction_fields(field_confidence);

-- Index for finding corrections
CREATE INDEX IF NOT EXISTS idx_extraction_fields_corrected
  ON extraction_fields(corrected_by)
  WHERE corrected_by IS NOT NULL;

-- =====================================================================
-- Table 3: EXTRACTION_REVIEWS - Manual review audit trail
-- =====================================================================
CREATE TABLE IF NOT EXISTS extraction_reviews (
  id                          TEXT PRIMARY KEY,                -- UUID
  extraction_id               TEXT NOT NULL,                  -- FK to document_extractions.id
  usuario_id                  TEXT NOT NULL,                  -- FK to usuarios.id (reviewer)

  -- Review metadata
  review_type                 TEXT NOT NULL,                  -- BULK_APPROVAL, BULK_REJECTION, INDIVIDUAL_CORRECTION
  reviewed_fields             TEXT,                           -- JSON array: field names that were reviewed/corrected

  -- Review action
  action                      TEXT NOT NULL,                  -- APPROVED, REJECTED, CORRECTIONS_MADE
  notes                       TEXT,                           -- Review notes
  timestamp                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys
  FOREIGN KEY (extraction_id) REFERENCES document_extractions(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,

  -- Constraints
  CHECK (review_type IN ('BULK_APPROVAL', 'BULK_REJECTION', 'INDIVIDUAL_CORRECTION')),
  CHECK (action IN ('APPROVED', 'REJECTED', 'CORRECTIONS_MADE'))
);

-- Indices for review audit trail
CREATE INDEX IF NOT EXISTS idx_extraction_reviews_extraction
  ON extraction_reviews(extraction_id);

CREATE INDEX IF NOT EXISTS idx_extraction_reviews_usuario
  ON extraction_reviews(usuario_id);

CREATE INDEX IF NOT EXISTS idx_extraction_reviews_timestamp
  ON extraction_reviews(timestamp DESC);

-- =====================================================================
-- VIEWS FOR ANALYSIS AND WORKFLOW
-- =====================================================================

-- View: Documents pending manual review
CREATE VIEW IF NOT EXISTS v_documents_pending_review AS
SELECT
  de.id,
  de.lote_id,
  de.document_type,
  de.overall_confidence,
  de.cnpj_extraido,
  de.numero_nf_extraido,
  de.valor_extraido,
  de.criado_em,
  COUNT(ef.id) as total_fields,
  COUNT(CASE WHEN ef.field_confidence < 75 THEN 1 END) as low_confidence_fields
FROM document_extractions de
LEFT JOIN extraction_fields ef ON de.id = ef.extraction_id
WHERE de.requires_manual_review = 1
  AND de.aprovado_em IS NULL
  AND de.rejeitado_em IS NULL
GROUP BY de.id
ORDER BY de.overall_confidence ASC, de.criado_em DESC;

-- View: Extraction success rate by document type
CREATE VIEW IF NOT EXISTS v_extraction_success_rate AS
SELECT
  document_type,
  COUNT(*) as total_extractions,
  COUNT(CASE WHEN extraction_status = 'COMPLETED' THEN 1 END) as successful,
  COUNT(CASE WHEN extraction_status = 'FAILED' THEN 1 END) as failed,
  ROUND(
    100.0 * COUNT(CASE WHEN extraction_status = 'COMPLETED' THEN 1 END) / COUNT(*),
    2
  ) as success_percentage,
  ROUND(AVG(overall_confidence), 2) as avg_confidence
FROM document_extractions
GROUP BY document_type;

-- View: Linked extractions by CNPJ/CPF
CREATE VIEW IF NOT EXISTS v_extractions_by_agent AS
SELECT
  cnpj_extraido as identifier,
  'CNPJ' as type,
  COUNT(*) as total_documents,
  ROUND(AVG(overall_confidence), 2) as avg_confidence,
  MAX(criado_em) as latest_extraction
FROM document_extractions
WHERE cnpj_extraido IS NOT NULL
GROUP BY cnpj_extraido

UNION ALL

SELECT
  cpf_extraido as identifier,
  'CPF' as type,
  COUNT(*) as total_documents,
  ROUND(AVG(overall_confidence), 2) as avg_confidence,
  MAX(criado_em) as latest_extraction
FROM document_extractions
WHERE cpf_extraido IS NOT NULL
GROUP BY cpf_extraido;

-- View: Field extraction quality metrics
CREATE VIEW IF NOT EXISTS v_field_extraction_quality AS
SELECT
  field_name,
  COUNT(*) as total_extractions,
  ROUND(AVG(field_confidence), 2) as avg_confidence,
  COUNT(CASE WHEN field_confidence >= 75 THEN 1 END) as high_confidence_count,
  ROUND(
    100.0 * COUNT(CASE WHEN field_confidence >= 75 THEN 1 END) / COUNT(*),
    2
  ) as high_confidence_percentage,
  COUNT(CASE WHEN is_valid = 0 THEN 1 END) as invalid_count
FROM extraction_fields
GROUP BY field_name
ORDER BY avg_confidence DESC;
