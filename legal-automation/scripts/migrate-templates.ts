import { Pool } from 'pg';
import { config } from '../src/utils/config';

const pool = new Pool({
  connectionString: config.database_url || 'postgresql://localhost:5432/legal_automation',
});

const createTableSQL = `
-- Templates table
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  category VARCHAR(100),
  content TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  tags VARCHAR(255)[],
  jurisdiction VARCHAR(10)[] DEFAULT ARRAY[]::VARCHAR[],
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_template BOOLEAN DEFAULT true,
  usage_count INT DEFAULT 0,
  success_rate DECIMAL(3,2),
  ai_generated BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_templates_type_category ON templates(type, category);
CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_jurisdiction ON templates USING GIN(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by);

-- Template versions table
CREATE TABLE IF NOT EXISTS template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version INT NOT NULL,
  content TEXT NOT NULL,
  changelog TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON template_versions(template_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_versions_id_version ON template_versions(template_id, version);

-- Template usage table
CREATE TABLE IF NOT EXISTS template_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  petition_id UUID REFERENCES petitions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  variables JSONB,
  customizations JSONB,
  success BOOLEAN,
  feedback TEXT,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_usage_template_id ON template_usage(template_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_user_id ON template_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_petition_id ON template_usage(petition_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_created_at ON template_usage(created_at DESC);

-- Template preferences table
CREATE TABLE IF NOT EXISTS template_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  tribunal_code VARCHAR(10),
  favorite_templates UUID[],
  preferred_style VARCHAR(50) DEFAULT 'formal',
  ai_customization_level INT DEFAULT 5 CHECK (ai_customization_level >= 1 AND ai_customization_level <= 10),
  auto_substitute BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_preferences_user_id ON template_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_template_preferences_tribunal ON template_preferences(tribunal_code);
`;

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🔄 Running template schema migration...');

    await client.query('BEGIN');

    // Create tables
    await client.query(createTableSQL);

    await client.query('COMMIT');

    console.log('✅ Template schema migration completed successfully');
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
