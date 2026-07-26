-- migrations/004_timesheet_module.sql
-- Time Tracking & Billing Module

-- Tabela de advogados (se não existir)
CREATE TABLE IF NOT EXISTS lawyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bar_registration VARCHAR(20) UNIQUE,
  specialization VARCHAR(100),
  hourly_rate NUMERIC(10, 2) DEFAULT 300.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lançamentos de tempo
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id UUID NOT NULL REFERENCES lawyers(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('research', 'drafting', 'meeting', 'court_appearance', 'review', 'other')),
  description TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  billable BOOLEAN DEFAULT TRUE,
  hourly_rate NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Tags para time entries
CREATE TABLE IF NOT EXISTS timesheet_tags (
  time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  tag VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (time_entry_id, tag)
);

-- Linkar documentos a time entries
CREATE TABLE IF NOT EXISTS timesheet_document_links (
  time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (time_entry_id, document_id)
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  client_id UUID NOT NULL REFERENCES users(id),
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  subtotal NUMERIC(15, 2) NOT NULL,
  tax NUMERIC(15, 2),
  total NUMERIC(15, 2) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'PAID', 'OVERDUE')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Itens da invoice
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  time_entry_id UUID REFERENCES time_entries(id),
  description TEXT NOT NULL,
  hours NUMERIC(10, 2) NOT NULL,
  hourly_rate NUMERIC(10, 2) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX idx_time_entries_lawyer_id ON time_entries(lawyer_id);
CREATE INDEX idx_time_entries_case_id ON time_entries(case_id);
CREATE INDEX idx_time_entries_start_time ON time_entries(start_time);
CREATE INDEX idx_time_entries_billable ON time_entries(billable);
CREATE INDEX idx_timesheet_tags_time_entry_id ON timesheet_tags(time_entry_id);
CREATE INDEX idx_timesheet_document_links_time_entry_id ON timesheet_document_links(time_entry_id);
CREATE INDEX idx_invoices_case_id ON invoices(case_id);
CREATE INDEX idx_invoices_client_id ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);
