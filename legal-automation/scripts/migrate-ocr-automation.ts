import { Pool } from 'pg';
import { config } from '../src/utils/config';

const pool = new Pool({
  connectionString: config.database_url || 'postgresql://localhost:5432/legal_automation',
});

const createTableSQL = `
-- OCR Documents table
CREATE TABLE IF NOT EXISTS ocr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('pdf', 'image', 'scan')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  extracted_text TEXT,
  confidence DECIMAL(3,2),
  structured_data JSONB,
  processing_time INT,
  errors TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocr_documents_user_id ON ocr_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_ocr_documents_status ON ocr_documents(status);
CREATE INDEX IF NOT EXISTS idx_ocr_documents_created_at ON ocr_documents(created_at DESC);

-- OCR Signatures table
CREATE TABLE IF NOT EXISTS ocr_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  x_position INT,
  y_position INT,
  width INT,
  height INT,
  confidence DECIMAL(3,2),
  signature_image BYTEA,
  detected_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocr_signatures_document_id ON ocr_signatures(document_id);

-- OCR Tables table
CREATE TABLE IF NOT EXISTS ocr_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,
  table_index INT NOT NULL,
  table_headers VARCHAR(255)[],
  table_data JSONB NOT NULL,
  confidence DECIMAL(3,2),
  extracted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocr_tables_document_id ON ocr_tables(document_id);

-- Automation Workflows table
CREATE TABLE IF NOT EXISTS automation_workflows (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger JSONB NOT NULL,
  steps JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('active', 'inactive', 'draft')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  execution_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  last_execution TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_automation_workflows_created_by ON automation_workflows(created_by);
CREATE INDEX IF NOT EXISTS idx_automation_workflows_status ON automation_workflows(status);

-- Workflow Executions table
CREATE TABLE IF NOT EXISTS workflow_executions (
  id VARCHAR(50) PRIMARY KEY,
  workflow_id VARCHAR(50) NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  steps_completed INT,
  total_steps INT,
  errors JSONB,
  executed_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_executed_at ON workflow_executions(executed_at DESC);

-- Workflow Logs table
CREATE TABLE IF NOT EXISTS workflow_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id VARCHAR(50) NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_id VARCHAR(50),
  level VARCHAR(20) NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_logs_execution_id ON workflow_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_logs_level ON workflow_logs(level);
`;

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🔄 Running OCR & Automation schema migration...');

    await client.query('BEGIN');

    // Create tables
    await client.query(createTableSQL);

    await client.query('COMMIT');

    console.log('✅ OCR & Automation schema migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
