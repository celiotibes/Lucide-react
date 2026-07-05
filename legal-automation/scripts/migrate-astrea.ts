import { Pool } from 'pg';
import { config } from '../src/utils/config';

const pool = new Pool({
  connectionString: config.database_url || 'postgresql://localhost:5432/legal_automation',
});

const createTableSQL = `
-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  taxes DECIMAL(15,2) DEFAULT 0,
  discounts DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'overdue', 'cancelled')),
  issue_date TIMESTAMP,
  due_date TIMESTAMP NOT NULL,
  paid_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_case_id ON invoices(case_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

-- Case Costs table
CREATE TABLE IF NOT EXISTS case_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('hourly_work', 'expertise', 'travel', 'filing_fees', 'other')),
  amount DECIMAL(15,2) NOT NULL,
  billable BOOLEAN DEFAULT true,
  cost_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_costs_case_id ON case_costs(case_id);
CREATE INDEX IF NOT EXISTS idx_case_costs_category ON case_costs(category);
CREATE INDEX IF NOT EXISTS idx_case_costs_cost_date ON case_costs(cost_date DESC);

-- Time Entries table
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hours INT NOT NULL,
  minutes INT DEFAULT 0,
  billable BOOLEAN DEFAULT true,
  category VARCHAR(50) NOT NULL CHECK (category IN ('research', 'writing', 'meetings', 'court', 'other')),
  entry_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_case_id ON time_entries(case_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_entry_date ON time_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_billable ON time_entries(billable);

-- Deadlines table (enhanced from case_deadlines)
CREATE TABLE IF NOT EXISTS deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  due_date TIMESTAMP NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('inicial', 'recurso', 'execucao', 'outro')),
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('baixa', 'média', 'alta', 'crítica')),
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'extended')),
  extended_to TIMESTAMP,
  extend_reason TEXT,
  notification_days INT[] DEFAULT ARRAY[7, 3, 1],
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deadlines_case_id ON deadlines(case_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_status ON deadlines(status);
CREATE INDEX IF NOT EXISTS idx_deadlines_due_date ON deadlines(due_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_priority ON deadlines(priority);

-- Deadline Assignments table (many-to-many)
CREATE TABLE IF NOT EXISTS deadline_assignments (
  deadline_id UUID NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (deadline_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_deadline_assignments_deadline_id ON deadline_assignments(deadline_id);
CREATE INDEX IF NOT EXISTS idx_deadline_assignments_user_id ON deadline_assignments(user_id);

-- Deadline Alerts table
CREATE TABLE IF NOT EXISTS deadline_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deadline_id UUID NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('notification', 'email', 'sms')),
  message TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW(),
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deadline_alerts_user_id ON deadline_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_deadline_alerts_deadline_id ON deadline_alerts(deadline_id);
CREATE INDEX IF NOT EXISTS idx_deadline_alerts_read ON deadline_alerts(read);

-- KPIs table
CREATE TABLE IF NOT EXISTS kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('financial', 'operational', 'quality')),
  value DECIMAL(15,2) NOT NULL,
  target DECIMAL(15,2),
  unit VARCHAR(50),
  period VARCHAR(30) NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'yearly')),
  trend VARCHAR(10) CHECK (trend IN ('up', 'down', 'stable')),
  change_percentage DECIMAL(5,2),
  calculated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kpis_escritorio_id ON kpis(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_kpis_category ON kpis(category);
CREATE INDEX IF NOT EXISTS idx_kpis_calculated_at ON kpis(calculated_at DESC);

-- Financial Forecasts table
CREATE TABLE IF NOT EXISTS financial_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  period VARCHAR(100) NOT NULL,
  projected_revenue DECIMAL(15,2) NOT NULL,
  projected_costs DECIMAL(15,2) NOT NULL,
  projected_profit DECIMAL(15,2) NOT NULL,
  confidence INT CHECK (confidence >= 0 AND confidence <= 100),
  assumptions JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_forecasts_escritorio_id ON financial_forecasts(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_financial_forecasts_period ON financial_forecasts(period);

-- Billing Schedules table
CREATE TABLE IF NOT EXISTS billing_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  frequency VARCHAR(30) NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly')),
  day_of_week INT,
  day_of_month INT,
  auto_invoice BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_schedules_escritorio_id ON billing_schedules(escritorio_id);

-- Financial Reports table
CREATE TABLE IF NOT EXISTS financial_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  total_revenue DECIMAL(15,2),
  total_costs DECIMAL(15,2),
  net_profit DECIMAL(15,2),
  profit_margin DECIMAL(5,2),
  metrics JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_reports_escritorio_id ON financial_reports(escritorio_id);
CREATE INDEX IF NOT EXISTS idx_financial_reports_period ON financial_reports(period_start, period_end);

-- Case Financials Summary table
CREATE TABLE IF NOT EXISTS case_financials (
  case_id UUID PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  total_invoiced DECIMAL(15,2) DEFAULT 0,
  total_costs DECIMAL(15,2) DEFAULT 0,
  profit_margin DECIMAL(5,2),
  hourly_rate DECIMAL(15,2),
  estimated_profit DECIMAL(15,2),
  invoices_sent INT DEFAULT 0,
  invoices_pending INT DEFAULT 0,
  invoices_paid INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_financials_case_id ON case_financials(case_id);
`;

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🔄 Running Astrea schema migration...');

    await client.query('BEGIN');

    await client.query(createTableSQL);

    await client.query('COMMIT');

    console.log('✅ Astrea schema migration completed successfully');
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
