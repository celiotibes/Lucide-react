import { Pool } from 'pg';
import { config } from '../src/utils/config';

const pool = new Pool({
  connectionString: config.database_url || 'postgresql://localhost:5432/legal_automation',
});

const createTableSQL = `
-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('individual', 'company')),
  document_id VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  cellphone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  country VARCHAR(100) DEFAULT 'Brasil',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_document_id ON clients(document_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

-- Escritórios (Law Firms) table
CREATE TABLE IF NOT EXISTS escritorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  registration_number VARCHAR(20),
  type VARCHAR(20) NOT NULL CHECK (type IN ('solo', 'partnership', 'firm')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escritorios_owner_id ON escritorios(owner_id);
CREATE INDEX IF NOT EXISTS idx_escritorios_status ON escritorios(status);

-- Departments table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  head_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departments_escritorio_id ON departments(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_departments_head_id ON departments(head_id);

-- Team Members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('partner', 'associate', 'intern', 'administrative')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  join_date TIMESTAMP DEFAULT NOW(),
  UNIQUE(escritorio_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_escritorio_id ON team_members(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- Team Member Departments (many-to-many)
CREATE TABLE IF NOT EXISTS team_member_departments (
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (team_member_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_team_member_departments_team_member_id ON team_member_departments(team_member_id);
CREATE INDEX IF NOT EXISTS idx_team_member_departments_department_id ON team_member_departments(department_id);

-- Cases table
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  tribunal VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'filed', 'pending', 'in_progress', 'appealed', 'concluded')),
  phase VARCHAR(50),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id),
  process_value DECIMAL(15,2),
  filing_date TIMESTAMP,
  expected_closing_date TIMESTAMP,
  closing_date TIMESTAMP,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(escritorio_id, case_number)
);

CREATE INDEX IF NOT EXISTS idx_cases_client_id ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_escritorio_id ON cases(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_cases_department_id ON cases(department_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);

-- Case Assignments table (many-to-many for cases and users)
CREATE TABLE IF NOT EXISTS case_assignments (
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (case_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_case_assignments_case_id ON case_assignments(case_id);
CREATE INDEX IF NOT EXISTS idx_case_assignments_user_id ON case_assignments(user_id);

-- Case Participants table
CREATE TABLE IF NOT EXISTS case_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('client', 'opposing', 'third_party')),
  client_id UUID REFERENCES clients(id),
  name VARCHAR(255) NOT NULL,
  document_id VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_participants_case_id ON case_participants(case_id);
CREATE INDEX IF NOT EXISTS idx_case_participants_client_id ON case_participants(client_id);

-- Case Deadlines table
CREATE TABLE IF NOT EXISTS case_deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  description VARCHAR(500) NOT NULL,
  due_date TIMESTAMP NOT NULL,
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue')),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_deadlines_case_id ON case_deadlines(case_id);
CREATE INDEX IF NOT EXISTS idx_case_deadlines_status ON case_deadlines(status);
CREATE INDEX IF NOT EXISTS idx_case_deadlines_due_date ON case_deadlines(due_date);

-- Case Updates table
CREATE TABLE IF NOT EXISTS case_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('status_change', 'document_upload', 'hearing_scheduled', 'decision', 'note')),
  description TEXT NOT NULL,
  document_id UUID,
  document_name VARCHAR(255),
  document_type VARCHAR(50),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_updates_case_id ON case_updates(case_id);
CREATE INDEX IF NOT EXISTS idx_case_updates_type ON case_updates(type);
CREATE INDEX IF NOT EXISTS idx_case_updates_created_at ON case_updates(created_at DESC);

-- Case Tasks table
CREATE TABLE IF NOT EXISTS case_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL CHECK (type IN ('review_documents', 'prepare_petition', 'schedule_hearing', 'respond_to_opposition', 'file_appeal', 'other')),
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to UUID NOT NULL REFERENCES users(id),
  due_date TIMESTAMP,
  estimated_hours INT,
  actual_hours INT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_case_tasks_case_id ON case_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_case_tasks_assigned_to ON case_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_case_tasks_status ON case_tasks(status);
CREATE INDEX IF NOT EXISTS idx_case_tasks_due_date ON case_tasks(due_date);

-- Case Workflows table
CREATE TABLE IF NOT EXISTS case_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  progress INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_case_workflows_case_id ON case_workflows(case_id);
CREATE INDEX IF NOT EXISTS idx_case_workflows_status ON case_workflows(status);

-- Case Metrics table
CREATE TABLE IF NOT EXISTS case_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  duration_days INT,
  success_rate DECIMAL(3,2),
  cost_per_day DECIMAL(15,2),
  documents_count INT DEFAULT 0,
  interactions_count INT DEFAULT 0,
  tasks_completed INT DEFAULT 0,
  deadlines_met INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_metrics_case_id ON case_metrics(case_id);

-- Analytics Events table (for tracking user actions)
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  escritorio_id UUID REFERENCES escritorios(id),
  event_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_escritorio_id ON analytics_events(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC);
`;

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🔄 Running Projuris schema migration...');

    await client.query('BEGIN');

    await client.query(createTableSQL);

    await client.query('COMMIT');

    console.log('✅ Projuris schema migration completed successfully');
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
