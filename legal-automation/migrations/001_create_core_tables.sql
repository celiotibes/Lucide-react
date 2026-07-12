-- UP: Create core business tables

-- CRM Clients Table
CREATE TABLE IF NOT EXISTS crm_clients (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  cpf VARCHAR(14) UNIQUE,
  cnpj VARCHAR(18) UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'prospect',
  case_types TEXT[] DEFAULT ARRAY[]::TEXT[],
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  contact_person VARCHAR(255),
  industry VARCHAR(100),
  company_size VARCHAR(50),
  notes TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE INDEX idx_crm_clients_email ON crm_clients(email);
CREATE INDEX idx_crm_clients_status ON crm_clients(status);
CREATE INDEX idx_crm_clients_cpf ON crm_clients(cpf);
CREATE INDEX idx_crm_clients_cnpj ON crm_clients(cnpj);
CREATE INDEX idx_crm_clients_created ON crm_clients("createdAt");

-- Contracts Table
CREATE TABLE IF NOT EXISTS contracts (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL REFERENCES crm_clients(id),
  template_id VARCHAR(36),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  signature_required BOOLEAN DEFAULT true,
  signers TEXT[] DEFAULT ARRAY[]::TEXT[],
  signed_at TIMESTAMP,
  executed_at TIMESTAMP,
  archived_at TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE INDEX idx_contracts_client_id ON contracts(client_id);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_created ON contracts("createdAt");

-- Legal Cases Table
CREATE TABLE IF NOT EXISTS legal_cases (
  id VARCHAR(36) PRIMARY KEY,
  case_number VARCHAR(50) UNIQUE NOT NULL,
  client_id VARCHAR(36) NOT NULL REFERENCES crm_clients(id),
  case_type VARCHAR(50) NOT NULL,
  court_name VARCHAR(255),
  judge_name VARCHAR(255),
  process_number VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'registered',
  outcome VARCHAR(50),
  outcome_description TEXT,
  success_rate DECIMAL(5,2),
  estimated_duration INTEGER,
  filing_date DATE,
  hearing_date DATE,
  deadline_date DATE,
  amount_claimed DECIMAL(15,2),
  amount_awarded DECIMAL(15,2),
  lawyer_assigned VARCHAR(255),
  notes TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE INDEX idx_legal_cases_client_id ON legal_cases(client_id);
CREATE INDEX idx_legal_cases_number ON legal_cases(case_number);
CREATE INDEX idx_legal_cases_status ON legal_cases(status);
CREATE INDEX idx_legal_cases_court ON legal_cases(court_name);
CREATE INDEX idx_legal_cases_deadline ON legal_cases(deadline_date);
CREATE INDEX idx_legal_cases_created ON legal_cases("createdAt");

-- Financial Invoices Table
CREATE TABLE IF NOT EXISTS financial_invoices (
  id VARCHAR(36) PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  client_id VARCHAR(36) NOT NULL REFERENCES crm_clients(id),
  case_id VARCHAR(36) REFERENCES legal_cases(id),
  amount DECIMAL(15,2) NOT NULL,
  amount_paid DECIMAL(15,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'BRL',
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  description TEXT,
  due_date DATE NOT NULL,
  issued_date DATE NOT NULL,
  paid_date DATE,
  overdue_days INTEGER DEFAULT 0,
  payment_method VARCHAR(50),
  receipt_url TEXT,
  notes TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE INDEX idx_invoices_client_id ON financial_invoices(client_id);
CREATE INDEX idx_invoices_number ON financial_invoices(invoice_number);
CREATE INDEX idx_invoices_status ON financial_invoices(status);
CREATE INDEX idx_invoices_due_date ON financial_invoices(due_date);
CREATE INDEX idx_invoices_created ON financial_invoices("createdAt");

-- Intimations Table (Legal Documents)
CREATE TABLE IF NOT EXISTS intimations (
  id VARCHAR(36) PRIMARY KEY,
  case_id VARCHAR(36) NOT NULL REFERENCES legal_cases(id),
  document_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  received_date TIMESTAMP NOT NULL,
  deadline_date TIMESTAMP NOT NULL,
  notification_method VARCHAR(100),
  sender_name VARCHAR(255),
  document_url TEXT,
  is_processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP,
  notes TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_intimations_case_id ON intimations(case_id);
CREATE INDEX idx_intimations_deadline ON intimations(deadline_date);
CREATE INDEX idx_intimations_processed ON intimations(is_processed);

-- DOWN: Drop all tables
-- DROP TABLE IF EXISTS intimations CASCADE;
-- DROP TABLE IF EXISTS financial_invoices CASCADE;
-- DROP TABLE IF EXISTS legal_cases CASCADE;
-- DROP TABLE IF EXISTS contracts CASCADE;
-- DROP TABLE IF EXISTS crm_clients CASCADE;
