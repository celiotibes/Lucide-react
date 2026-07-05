-- Phase 16: AI Triage Tables

-- Create ai_classifications table
CREATE TABLE IF NOT EXISTS ai_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  document_id VARCHAR(255) NOT NULL,
  case_id VARCHAR(255) NOT NULL,
  classification VARCHAR(50) NOT NULL,
  confidence DECIMAL(3, 2) NOT NULL,
  extracted_data JSONB,
  kanban_task_created BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_classifications_user_id ON ai_classifications(user_id);
CREATE INDEX idx_ai_classifications_case_id ON ai_classifications(case_id);
CREATE INDEX idx_ai_classifications_classification ON ai_classifications(classification);
CREATE INDEX idx_ai_classifications_confidence ON ai_classifications(confidence);
CREATE INDEX idx_ai_classifications_created_at ON ai_classifications(created_at);

-- Create jurimetry_cache table
CREATE TABLE IF NOT EXISTS jurimetry_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id VARCHAR(255) NOT NULL,
  tribunal VARCHAR(100),
  success_rate DECIMAL(5, 2),
  total_cases INTEGER DEFAULT 0,
  successful_cases INTEGER DEFAULT 0,
  judge_success_rate DECIMAL(5, 2),
  subject_analysis JSONB,
  recent_similar_cases JSONB,
  recommendations JSONB,
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_jurimetry_cache_case_id ON jurimetry_cache(case_id);
CREATE INDEX idx_jurimetry_cache_tribunal ON jurimetry_cache(tribunal);
CREATE INDEX idx_jurimetry_cache_cached_at ON jurimetry_cache(cached_at);

-- Create ai_documents table (for tracking uploaded documents)
CREATE TABLE IF NOT EXISTS ai_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  case_id VARCHAR(255) NOT NULL,
  document_name VARCHAR(500) NOT NULL,
  document_path VARCHAR(1000),
  file_type VARCHAR(50),
  file_size INTEGER,
  processed BOOLEAN DEFAULT FALSE,
  classification_id UUID,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (classification_id) REFERENCES ai_classifications(id) ON DELETE SET NULL
);

CREATE INDEX idx_ai_documents_user_id ON ai_documents(user_id);
CREATE INDEX idx_ai_documents_case_id ON ai_documents(case_id);
CREATE INDEX idx_ai_documents_processed ON ai_documents(processed);
CREATE INDEX idx_ai_documents_uploaded_at ON ai_documents(uploaded_at);

-- Create ai_classification_feedback table (for model improvement)
CREATE TABLE IF NOT EXISTS ai_classification_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classification_id UUID NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  correct_classification VARCHAR(50),
  notes TEXT,
  feedback_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (classification_id) REFERENCES ai_classifications(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_classification_feedback_user_id ON ai_classification_feedback(user_id);
CREATE INDEX idx_ai_classification_feedback_classification_id ON ai_classification_feedback(classification_id);

-- Add columns to kanban_tasks for auto-triage tracking
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS ai_created BOOLEAN DEFAULT FALSE;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS ai_classification VARCHAR(50);

-- Create trigger for ai_documents
CREATE OR REPLACE FUNCTION update_ai_documents_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.uploaded_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_documents_timestamp_trigger
BEFORE UPDATE ON ai_documents
FOR EACH ROW
EXECUTE FUNCTION update_ai_documents_timestamp();
