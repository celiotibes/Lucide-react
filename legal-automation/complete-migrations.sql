-- ========================================
-- LEGAL AUTOMATION - COMPLETE DATABASE SETUP
-- All migrations combined for Supabase
-- ========================================

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


-- FROM: migrations/002_create_infrastructure_tables.sql
-- UP: Create infrastructure tables

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  before_values JSONB,
  after_values JSONB,
  change_description TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  status VARCHAR(50) DEFAULT 'success',
  error_message TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs("createdAt");
CREATE INDEX idx_audit_logs_date_range ON audit_logs("createdAt") WHERE status = 'success';

-- Events Table (Event Sourcing)
CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(36) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(36),
  aggregate_type VARCHAR(100),
  user_id VARCHAR(36),
  payload JSONB NOT NULL,
  metadata JSONB,
  version INTEGER DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_aggregate ON events(aggregate_id, aggregate_type);
CREATE INDEX idx_events_user ON events(user_id);
CREATE INDEX idx_events_created ON events("createdAt");

-- Event Webhooks Table
CREATE TABLE IF NOT EXISTS event_webhooks (
  id VARCHAR(36) PRIMARY KEY,
  url VARCHAR(500) NOT NULL,
  event_types TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT true,
  secret_token VARCHAR(255),
  retry_count INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 30,
  last_triggered_at TIMESTAMP,
  last_error TEXT,
  failure_count INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhooks_active ON event_webhooks(is_active);
CREATE INDEX idx_webhooks_created ON event_webhooks("createdAt");

-- Webhook Deliveries Table (Retry tracking)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id VARCHAR(36) PRIMARY KEY,
  webhook_id VARCHAR(36) NOT NULL REFERENCES event_webhooks(id),
  event_id VARCHAR(36) NOT NULL REFERENCES events(id),
  http_status_code INTEGER,
  response_body TEXT,
  attempt_number INTEGER DEFAULT 1,
  next_retry_at TIMESTAMP,
  completed_at TIMESTAMP,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_deliveries_event ON webhook_deliveries(event_id);
CREATE INDEX idx_deliveries_success ON webhook_deliveries(success);
CREATE INDEX idx_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE success = false;

-- Cache Entries Table (Optional - for distributed cache)
CREATE TABLE IF NOT EXISTS cache_entries (
  cache_key VARCHAR(500) PRIMARY KEY,
  cache_value JSONB NOT NULL,
  ttl_seconds INTEGER,
  expires_at TIMESTAMP NOT NULL,
  hit_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP
);

CREATE INDEX idx_cache_expires ON cache_entries(expires_at);
CREATE INDEX idx_cache_accessed ON cache_entries(last_accessed);

-- Health Check Results (for monitoring)
CREATE TABLE IF NOT EXISTS health_checks (
  id VARCHAR(36) PRIMARY KEY,
  check_name VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  duration_ms INTEGER,
  message TEXT,
  metadata JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_health_checks_name ON health_checks(check_name);
CREATE INDEX idx_health_checks_status ON health_checks(status);
CREATE INDEX idx_health_checks_created ON health_checks("createdAt");

-- API Keys Table (for service-to-service auth)
CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(36) PRIMARY KEY,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  user_id VARCHAR(36),
  scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_active ON api_keys(is_active);
CREATE INDEX idx_api_keys_expires ON api_keys(expires_at);

-- DOWN: Drop infrastructure tables
-- DROP TABLE IF EXISTS webhook_deliveries CASCADE;
-- DROP TABLE IF EXISTS event_webhooks CASCADE;
-- DROP TABLE IF EXISTS events CASCADE;
-- DROP TABLE IF EXISTS cache_entries CASCADE;
-- DROP TABLE IF EXISTS health_checks CASCADE;
-- DROP TABLE IF EXISTS api_keys CASCADE;
-- DROP TABLE IF EXISTS audit_logs CASCADE;


-- FROM: migrations/002_pki_module.sql
-- migrations/002_pki_module.sql
-- PKI (Public Key Infrastructure) Module - Certificate Management

CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cnpj VARCHAR(14) NOT NULL,
  subject_dn TEXT NOT NULL,
  issuer_dn TEXT NOT NULL,
  not_before TIMESTAMP NOT NULL,
  not_after TIMESTAMP NOT NULL,
  serial_number VARCHAR(255) UNIQUE NOT NULL,
  key_type VARCHAR(20) NOT NULL CHECK (key_type IN ('A1', 'A3')),
  fingerprint_sha256 VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'VALID' CHECK (status IN ('VALID', 'EXPIRED', 'REVOKED', 'SUSPENDED')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,

  UNIQUE(user_id, cnpj)
);

CREATE TABLE IF NOT EXISTS signature_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  document_id UUID,
  signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT,
  hash_algorithm VARCHAR(50),
  signature_format VARCHAR(50),
  status VARCHAR(20),
  error_message TEXT
);

-- Índices para performance
CREATE INDEX idx_certificates_user_id ON certificates(user_id);
CREATE INDEX idx_certificates_cnpj ON certificates(cnpj);
CREATE INDEX idx_certificates_fingerprint ON certificates(fingerprint_sha256);
CREATE INDEX idx_certificates_status ON certificates(status);
CREATE INDEX idx_signature_audit_certificate_id ON signature_audit_log(certificate_id);
CREATE INDEX idx_signature_audit_document_id ON signature_audit_log(document_id);
CREATE INDEX idx_signature_audit_signed_at ON signature_audit_log(signed_at);


-- FROM: migrations/003_create_analytics_tables.sql
-- UP: Create analytics and jurimetry tables

-- Case Analytics Table
CREATE TABLE IF NOT EXISTS case_analytics (
  id VARCHAR(36) PRIMARY KEY,
  case_id VARCHAR(36) NOT NULL REFERENCES legal_cases(id),
  total_cases_by_type JSONB,
  success_rate DECIMAL(5,2),
  avg_duration_days INTEGER,
  avg_cost DECIMAL(15,2),
  favorable_outcomes INTEGER DEFAULT 0,
  unfavorable_outcomes INTEGER DEFAULT 0,
  partial_outcomes INTEGER DEFAULT 0,
  settled_outcomes INTEGER DEFAULT 0,
  dismissed_outcomes INTEGER DEFAULT 0,
  pending_outcomes INTEGER DEFAULT 0,
  predicted_outcome VARCHAR(100),
  prediction_confidence DECIMAL(5,2),
  risk_factors TEXT[],
  opportunity_factors TEXT[],
  similar_cases_count INTEGER,
  precedent_cases TEXT[],
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analytics_case ON case_analytics(case_id);
CREATE INDEX idx_analytics_success_rate ON case_analytics(success_rate DESC);
CREATE INDEX idx_analytics_predicted ON case_analytics(predicted_outcome);

-- Court Analytics Table
CREATE TABLE IF NOT EXISTS court_analytics (
  id VARCHAR(36) PRIMARY KEY,
  court_name VARCHAR(255) NOT NULL UNIQUE,
  total_cases INTEGER DEFAULT 0,
  favorable_cases INTEGER DEFAULT 0,
  unfavorable_cases INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2),
  avg_duration_days INTEGER,
  avg_case_value DECIMAL(15,2),
  total_value_processed DECIMAL(15,2),
  judges JSONB,
  recent_decisions TEXT[],
  specialization TEXT[],
  processing_time_days INTEGER,
  backlog_estimate INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_court_analytics_name ON court_analytics(court_name);
CREATE INDEX idx_court_analytics_success ON court_analytics(success_rate DESC);
CREATE INDEX idx_court_analytics_duration ON court_analytics(avg_duration_days);

-- Lawyer Performance Table
CREATE TABLE IF NOT EXISTS lawyer_performance (
  id VARCHAR(36) PRIMARY KEY,
  lawyer_name VARCHAR(255) NOT NULL UNIQUE,
  total_cases INTEGER DEFAULT 0,
  cases_won INTEGER DEFAULT 0,
  cases_lost INTEGER DEFAULT 0,
  cases_settled INTEGER DEFAULT 0,
  win_rate DECIMAL(5,2),
  avg_case_duration DECIMAL(10,2),
  avg_settlement_time DECIMAL(10,2),
  specializations TEXT[],
  active_cases INTEGER DEFAULT 0,
  total_value_handled DECIMAL(15,2),
  client_satisfaction_score DECIMAL(3,2),
  experience_years INTEGER,
  certifications TEXT[],
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lawyer_win_rate ON lawyer_performance(win_rate DESC);
CREATE INDEX idx_lawyer_active_cases ON lawyer_performance(active_cases);
CREATE INDEX idx_lawyer_specialization ON lawyer_performance USING GIN (specializations);

-- Case Predictions Table
CREATE TABLE IF NOT EXISTS case_predictions (
  id VARCHAR(36) PRIMARY KEY,
  case_id VARCHAR(36) NOT NULL REFERENCES legal_cases(id),
  predicted_outcome VARCHAR(100) NOT NULL,
  confidence_score DECIMAL(5,2) NOT NULL,
  probability_favorable DECIMAL(5,2),
  probability_unfavorable DECIMAL(5,2),
  probability_settlement DECIMAL(5,2),
  estimated_duration_days INTEGER,
  estimated_cost DECIMAL(15,2),
  risk_level VARCHAR(50),
  recommendation TEXT,
  factors_positive TEXT[],
  factors_negative TEXT[],
  model_version VARCHAR(50),
  prediction_date TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_predictions_case ON case_predictions(case_id);
CREATE INDEX idx_predictions_outcome ON case_predictions(predicted_outcome);
CREATE INDEX idx_predictions_confidence ON case_predictions(confidence_score DESC);
CREATE INDEX idx_predictions_created ON case_predictions("createdAt");

-- Historical Case Data (for trend analysis)
CREATE TABLE IF NOT EXISTS case_history (
  id VARCHAR(36) PRIMARY KEY,
  case_id VARCHAR(36) NOT NULL REFERENCES legal_cases(id),
  status_change VARCHAR(100),
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  changed_by VARCHAR(255),
  change_reason TEXT,
  metadata JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_history_case ON case_history(case_id);
CREATE INDEX idx_history_status ON case_history(new_status);
CREATE INDEX idx_history_created ON case_history("createdAt");

-- Financial Analytics Table
CREATE TABLE IF NOT EXISTS financial_analytics (
  id VARCHAR(36) PRIMARY KEY,
  period_month VARCHAR(7) NOT NULL,
  total_invoiced DECIMAL(15,2),
  total_received DECIMAL(15,2),
  collection_rate DECIMAL(5,2),
  overdue_amount DECIMAL(15,2),
  overdue_count INTEGER,
  avg_payment_time DAYS,
  revenue_by_case_type JSONB,
  revenue_by_client JSONB,
  top_clients TEXT[],
  payment_methods JSONB,
  invoice_count INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_financial_period ON financial_analytics(period_month);
CREATE INDEX idx_financial_created ON financial_analytics("createdAt");

-- Dashboard Metrics Table (cached for performance)
CREATE TABLE IF NOT EXISTS dashboard_metrics (
  id VARCHAR(36) PRIMARY KEY,
  metric_key VARCHAR(100) NOT NULL UNIQUE,
  metric_name VARCHAR(255) NOT NULL,
  metric_value JSONB NOT NULL,
  display_type VARCHAR(50),
  last_updated TIMESTAMP NOT NULL,
  cache_ttl_seconds INTEGER DEFAULT 3600,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_metrics_key ON dashboard_metrics(metric_key);
CREATE INDEX idx_metrics_updated ON dashboard_metrics(last_updated DESC);

-- DOWN: Drop analytics tables
-- DROP TABLE IF EXISTS dashboard_metrics CASCADE;
-- DROP TABLE IF EXISTS financial_analytics CASCADE;
-- DROP TABLE IF EXISTS case_history CASCADE;
-- DROP TABLE IF EXISTS case_predictions CASCADE;
-- DROP TABLE IF EXISTS lawyer_performance CASCADE;
-- DROP TABLE IF EXISTS court_analytics CASCADE;
-- DROP TABLE IF EXISTS case_analytics CASCADE;


-- FROM: migrations/003_ged_module.sql
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


-- FROM: migrations/004_seed_test_data.sql
-- UP: Seed test data for development and testing

-- Insert test clients
INSERT INTO crm_clients (id, name, email, phone, cpf, status, case_types, city, state, industry) VALUES
('client-001', 'João Silva', 'joao@example.com', '11987654321', '12345678901', 'customer', ARRAY['trabalhista', 'civil'], 'São Paulo', 'SP', 'Manufatura'),
('client-002', 'Maria Santos', 'maria@example.com', '11987654322', '12345678902', 'customer', ARRAY['familia', 'civil'], 'Rio de Janeiro', 'RJ', 'Varejo'),
('client-003', 'Empresa XYZ LTDA', 'contato@xyz.com', '1133334444', '12345678901234', 'customer', ARRAY['comercial', 'trabalhista'], 'Belo Horizonte', 'MG', 'Tecnologia'),
('client-004', 'Pedro Costa', 'pedro@example.com', '21987654323', '12345678903', 'prospect', ARRAY['criminal'], 'Brasília', 'DF', 'Consultoria'),
('client-005', 'Ana Oliveira', 'ana@example.com', '85987654324', '12345678904', 'lead', ARRAY['imobiliario'], 'Fortaleza', 'CE', 'Imóveis')
ON CONFLICT (email) DO NOTHING;

-- Insert test legal cases
INSERT INTO legal_cases (id, case_number, client_id, case_type, court_name, judge_name, process_number, status, outcome, success_rate, estimated_duration, filing_date, deadline_date, amount_claimed, lawyer_assigned) VALUES
('case-001', '0001234-56.2024.1.02.3500', 'client-001', 'trabalhista', 'TJ-SP', 'Juiz Carlos Mendes', '1234567890123456789', 'in_progress', NULL, 65.00, 180, '2024-01-15', '2024-07-15', 50000.00, 'Dr. Felipe Rocha'),
('case-002', '0002345-67.2024.8.04.7200', 'client-002', 'familia', 'TJ-RJ', 'Juiza Patricia Costa', '1234567890123456790', 'registered', NULL, 45.00, 240, '2024-02-01', '2024-08-01', 0.00, 'Dra. Mariana Gomes'),
('case-003', '0003456-78.2024.1.26.0100', 'client-003', 'comercial', 'TJ-MG', 'Juiz Ricardo Alves', '1234567890123456791', 'closed', 'favorable', 85.00, 120, '2023-12-10', '2024-04-10', 150000.00, 'Dr. André Silva'),
('case-004', '0004567-89.2024.1.01.3800', 'client-004', 'criminal', 'TJ-DF', 'Juiz Paulo Ferreira', '1234567890123456792', 'in_progress', NULL, 55.00, 200, '2024-01-20', '2024-07-20', 0.00, 'Dr. Bruno Castro'),
('case-005', '0005678-90.2024.8.07.0000', 'client-005', 'imobiliario', 'TJ-CE', 'Juiza Helena Martins', '1234567890123456793', 'registered', NULL, 70.00, 160, '2024-02-15', '2024-08-15', 200000.00, 'Dra. Fernanda Lima')
ON CONFLICT (case_number) DO NOTHING;

-- Insert test contracts
INSERT INTO contracts (id, client_id, title, description, content, status, version, signature_required, signed_at) VALUES
('contract-001', 'client-001', 'Contrato de Representação Legal', 'Contrato de prestação de serviços legais', 'CONTRATO DE REPRESENTAÇÃO LEGAL...', 'signed', 1, true, '2024-01-15 10:30:00'),
('contract-002', 'client-002', 'Procuração Específica', 'Procuração para atos específicos', 'PROCURAÇÃO ESPECÍFICA...', 'draft', 1, false, NULL),
('contract-003', 'client-003', 'Retainer Agreement', 'Contrato de retenção de serviços', 'RETAINER AGREEMENT...', 'signed', 2, true, '2023-12-20 14:00:00'),
('contract-004', 'client-004', 'Acordo de Confidencialidade', 'NDA entre partes', 'ACORDO DE CONFIDENCIALIDADE...', 'pending_signature', 1, true, NULL),
('contract-005', 'client-005', 'Contrato de Compra e Venda', 'Imóvel - Contrato de compra', 'CONTRATO DE COMPRA E VENDA...', 'review', 1, true, NULL)
ON CONFLICT DO NOTHING;

-- Insert test invoices
INSERT INTO financial_invoices (id, invoice_number, client_id, case_id, amount, amount_paid, status, due_date, issued_date, payment_method) VALUES
('invoice-001', 'NF-2024-001', 'client-001', 'case-001', 5000.00, 5000.00, 'paid', '2024-02-15', '2024-01-20', 'transferência'),
('invoice-002', 'NF-2024-002', 'client-002', 'case-002', 3500.00, 1750.00, 'partially_paid', '2024-03-15', '2024-02-01', 'cartão'),
('invoice-003', 'NF-2024-003', 'client-003', 'case-003', 15000.00, 0.00, 'overdue', '2024-02-28', '2024-01-15', NULL),
('invoice-004', 'NF-2024-004', 'client-004', 'case-004', 2500.00, 0.00, 'sent', '2024-03-20', '2024-02-20', NULL),
('invoice-005', 'NF-2024-005', 'client-005', 'case-005', 8000.00, 8000.00, 'paid', '2024-03-31', '2024-02-28', 'boleto')
ON CONFLICT (invoice_number) DO NOTHING;

-- Insert test intimations
INSERT INTO intimations (id, case_id, document_type, title, received_date, deadline_date, notification_method, sender_name) VALUES
('intimation-001', 'case-001', 'Audiência', 'Intimação para Audiência de Instrução', '2024-02-10 09:00:00', '2024-03-10 23:59:59', 'Eletrônica', 'Tribunal de Justiça SP'),
('intimation-002', 'case-002', 'Petição', 'Intimação da Petição Inicial', '2024-02-20 10:30:00', '2024-03-20 23:59:59', 'Pessoalmente', 'Cartório'),
('intimation-003', 'case-003', 'Sentença', 'Intimação da Sentença', '2024-02-01 14:00:00', '2024-02-15 23:59:59', 'Eletrônica', 'Tribunal de Justiça MG'),
('intimation-004', 'case-004', 'Despacho', 'Despacho do Juiz', '2024-02-15 11:15:00', '2024-03-01 23:59:59', 'Email', 'Protocolo Eletrônico'),
('intimation-005', 'case-005', 'Recurso', 'Prazo para Apresentação de Recurso', '2024-02-20 16:45:00', '2024-03-10 23:59:59', 'Eletrônica', 'Tribunal de Justiça CE')
ON CONFLICT DO NOTHING;

-- Insert test court analytics
INSERT INTO court_analytics (id, court_name, total_cases, favorable_cases, unfavorable_cases, success_rate, avg_duration_days, avg_case_value) VALUES
('analytics-tj-sp', 'TJ-SP', 5000, 3500, 1500, 70.00, 180, 85000.00),
('analytics-tj-rj', 'TJ-RJ', 3800, 2470, 1330, 65.00, 210, 95000.00),
('analytics-tj-mg', 'TJ-MG', 2900, 2030, 870, 70.00, 165, 75000.00),
('analytics-tj-df', 'TJ-DF', 1500, 900, 600, 60.00, 240, 65000.00),
('analytics-tj-ce', 'TJ-CE', 1200, 720, 480, 60.00, 220, 55000.00)
ON CONFLICT (court_name) DO NOTHING;

-- Insert test lawyer performance
INSERT INTO lawyer_performance (id, lawyer_name, total_cases, cases_won, cases_lost, win_rate, active_cases, experience_years) VALUES
('lawyer-001', 'Dr. Felipe Rocha', 45, 32, 13, 71.11, 5, 12),
('lawyer-002', 'Dra. Mariana Gomes', 38, 22, 16, 57.89, 8, 8),
('lawyer-003', 'Dr. André Silva', 52, 41, 11, 78.85, 3, 15),
('lawyer-004', 'Dr. Bruno Castro', 28, 15, 13, 53.57, 6, 6),
('lawyer-005', 'Dra. Fernanda Lima', 35, 26, 9, 74.29, 4, 10)
ON CONFLICT (lawyer_name) DO NOTHING;

-- Insert test case analytics
INSERT INTO case_analytics (id, case_id, success_rate, avg_duration_days, favorable_outcomes, unfavorable_outcomes, settled_outcomes, predicted_outcome, prediction_confidence) VALUES
('analytics-case-001', 'case-001', 65.00, 180, 0, 0, 0, 'favorable', 72.50),
('analytics-case-002', 'case-002', 45.00, 240, 0, 0, 0, 'unfavorable', 58.30),
('analytics-case-003', 'case-003', 85.00, 120, 1, 0, 0, 'favorable', 95.40),
('analytics-case-004', 'case-004', 55.00, 200, 0, 0, 0, 'settlement', 61.20),
('analytics-case-005', 'case-005', 70.00, 160, 0, 0, 0, 'favorable', 77.80)
ON CONFLICT DO NOTHING;

-- Insert test audit logs
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, status) VALUES
('audit-001', 'user-admin', 'CREATE', 'Client', 'client-001', 'success'),
('audit-002', 'user-admin', 'CREATE', 'Case', 'case-001', 'success'),
('audit-003', 'user-lawyer-001', 'UPDATE', 'Case', 'case-001', 'success'),
('audit-004', 'user-admin', 'CREATE', 'Invoice', 'invoice-001', 'success'),
('audit-005', 'user-admin', 'UPDATE', 'Invoice', 'invoice-001', 'success')
ON CONFLICT DO NOTHING;

-- DOWN: Delete all seed data
-- DELETE FROM audit_logs WHERE id LIKE 'audit-%';
-- DELETE FROM case_analytics WHERE id LIKE 'analytics-case-%';
-- DELETE FROM lawyer_performance WHERE id LIKE 'lawyer-%';
-- DELETE FROM court_analytics WHERE id LIKE 'analytics-%';
-- DELETE FROM intimations WHERE id LIKE 'intimation-%';
-- DELETE FROM financial_invoices WHERE id LIKE 'invoice-%';
-- DELETE FROM contracts WHERE id LIKE 'contract-%';
-- DELETE FROM legal_cases WHERE id LIKE 'case-%';
-- DELETE FROM crm_clients WHERE id LIKE 'client-%';


-- FROM: migrations/004_timesheet_module.sql
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


-- FROM: migrations/005_ai_module.sql
-- migrations/005_ai_module.sql
-- Legal AI Module - Precedent Analysis, Outcome Prediction, Judge Patterns

-- Precedent cases table
CREATE TABLE IF NOT EXISTS precedent_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number VARCHAR(50) UNIQUE NOT NULL,
  court VARCHAR(100) NOT NULL,
  year INT NOT NULL,
  case_type VARCHAR(100) NOT NULL,
  plaintiff VARCHAR(255) NOT NULL,
  defendant VARCHAR(255) NOT NULL,
  claim_amount NUMERIC(15, 2),
  decision VARCHAR(50) NOT NULL CHECK (decision IN ('favorable', 'unfavorable', 'partially_favorable', 'reversed')),
  reason TEXT NOT NULL,
  judges TEXT[] NOT NULL DEFAULT '{}',
  relevance_score NUMERIC(3, 2) DEFAULT 0.5,
  citation_count INT DEFAULT 0,
  jurisdiction VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'OVERRULED')),
  source_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Judge decision patterns table
CREATE TABLE IF NOT EXISTS judge_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id VARCHAR(50) NOT NULL UNIQUE,
  judge_name VARCHAR(255) NOT NULL,
  total_decisions INT DEFAULT 0,
  win_rate NUMERIC(3, 2) DEFAULT 0,
  reversal_rate NUMERIC(3, 2) DEFAULT 0,
  average_time_to_decision INT DEFAULT 0,
  favorite_arguments TEXT[] DEFAULT '{}',
  reversal_reasons TEXT[] DEFAULT '{}',
  specializations VARCHAR(100)[] DEFAULT '{}',
  years_of_experience INT DEFAULT 0,
  court VARCHAR(100),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Case analysis cache table
CREATE TABLE IF NOT EXISTS case_analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_hash VARCHAR(64) UNIQUE NOT NULL,
  case_type VARCHAR(100) NOT NULL,
  jurisdiction VARCHAR(100) NOT NULL,
  claim_amount NUMERIC(15, 2),
  analysis_result JSONB NOT NULL,
  prediction_result JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

-- Argument suggestions cache
CREATE TABLE IF NOT EXISTS argument_suggestions_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_hash VARCHAR(64) NOT NULL,
  side VARCHAR(20) NOT NULL CHECK (side IN ('plaintiff', 'defendant')),
  arguments JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),

  CONSTRAINT unique_argument_cache UNIQUE (case_hash, side)
);

-- AI analysis results archive
CREATE TABLE IF NOT EXISTS ai_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  analysis_type VARCHAR(50) NOT NULL,
  precedent_count INT,
  win_probability INT,
  confidence_level INT,
  risk_factors TEXT[],
  favorable_factors TEXT[],
  recommendations TEXT[],
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_precedent_cases_case_type ON precedent_cases(case_type);
CREATE INDEX idx_precedent_cases_jurisdiction ON precedent_cases(jurisdiction);
CREATE INDEX idx_precedent_cases_decision ON precedent_cases(decision);
CREATE INDEX idx_precedent_cases_year ON precedent_cases(year);
CREATE INDEX idx_precedent_cases_court ON precedent_cases(court);
CREATE INDEX idx_precedent_cases_relevance ON precedent_cases(relevance_score DESC);
CREATE INDEX idx_precedent_cases_citation_count ON precedent_cases(citation_count DESC);
CREATE INDEX idx_precedent_cases_status ON precedent_cases(status);

CREATE INDEX idx_judge_patterns_judge_id ON judge_patterns(judge_id);
CREATE INDEX idx_judge_patterns_court ON judge_patterns(court);
CREATE INDEX idx_judge_patterns_win_rate ON judge_patterns(win_rate DESC);
CREATE INDEX idx_judge_patterns_active ON judge_patterns(active);

CREATE INDEX idx_case_analysis_cache_expires ON case_analysis_cache(expires_at);
CREATE INDEX idx_case_analysis_cache_hash ON case_analysis_cache(case_hash);

CREATE INDEX idx_argument_cache_expires ON argument_suggestions_cache(expires_at);
CREATE INDEX idx_argument_cache_hash ON argument_suggestions_cache(case_hash);

CREATE INDEX idx_ai_analysis_results_case_id ON ai_analysis_results(case_id);
CREATE INDEX idx_ai_analysis_results_type ON ai_analysis_results(analysis_type);
CREATE INDEX idx_ai_analysis_results_date ON ai_analysis_results(created_at DESC);

-- Full-text search index for precedent reasons
CREATE INDEX idx_precedent_cases_reason_fts ON precedent_cases USING GIN (
  to_tsvector('portuguese', reason)
);

-- Cleanup expired cache records (can be run via scheduled job)
-- DELETE FROM case_analysis_cache WHERE expires_at < CURRENT_TIMESTAMP;
-- DELETE FROM argument_suggestions_cache WHERE expires_at < CURRENT_TIMESTAMP;


-- FROM: migrations/006_mobile_module.sql
-- migrations/006_mobile_module.sql
-- Mobile App Module - Sessions, Notifications, Offline Sync

-- Mobile users table
CREATE TABLE IF NOT EXISTS mobile_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  device_tokens TEXT[] DEFAULT '{}',
  last_login TIMESTAMP,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mobile sessions table
CREATE TABLE IF NOT EXISTS mobile_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token VARCHAR(255) NOT NULL UNIQUE,
  refresh_token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mobile notifications table
CREATE TABLE IF NOT EXISTS mobile_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('case_update', 'deadline', 'document', 'billing', 'general')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  action_url VARCHAR(500),
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sync status tracking table
CREATE TABLE IF NOT EXISTS sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  last_sync_time TIMESTAMP NOT NULL,
  pending_changes INT DEFAULT 0,
  sync_in_progress BOOLEAN DEFAULT FALSE,
  last_error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Case updates feed table
CREATE TABLE IF NOT EXISTS case_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('status_change', 'document_added', 'deadline_added', 'note_added', 'time_logged')),
  description TEXT NOT NULL,
  actor UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Offline pending changes (for sync queue)
CREATE TABLE IF NOT EXISTS offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  data JSONB NOT NULL,
  synced BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMP,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_mobile_sessions_user_id ON mobile_sessions(user_id);
CREATE INDEX idx_mobile_sessions_access_token ON mobile_sessions(access_token);
CREATE INDEX idx_mobile_sessions_expires ON mobile_sessions(expires_at);
CREATE INDEX idx_mobile_sessions_active ON mobile_sessions(active);

CREATE INDEX idx_mobile_notifications_user_id ON mobile_notifications(user_id);
CREATE INDEX idx_mobile_notifications_type ON mobile_notifications(type);
CREATE INDEX idx_mobile_notifications_read ON mobile_notifications(read);
CREATE INDEX idx_mobile_notifications_case_id ON mobile_notifications(case_id);
CREATE INDEX idx_mobile_notifications_created ON mobile_notifications(created_at DESC);

CREATE INDEX idx_sync_status_user_id ON sync_status(user_id);
CREATE INDEX idx_sync_status_sync_in_progress ON sync_status(sync_in_progress);

CREATE INDEX idx_case_updates_case_id ON case_updates(case_id);
CREATE INDEX idx_case_updates_type ON case_updates(type);
CREATE INDEX idx_case_updates_actor ON case_updates(actor);
CREATE INDEX idx_case_updates_timestamp ON case_updates(timestamp DESC);

CREATE INDEX idx_offline_sync_queue_user_id ON offline_sync_queue(user_id);
CREATE INDEX idx_offline_sync_queue_synced ON offline_sync_queue(synced);
CREATE INDEX idx_offline_sync_queue_entity ON offline_sync_queue(entity_type, entity_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_mobile_users_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_sync_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for timestamp updates
CREATE TRIGGER mobile_users_update_timestamp
  BEFORE UPDATE ON mobile_users
  FOR EACH ROW
  EXECUTE FUNCTION update_mobile_users_timestamp();

CREATE TRIGGER sync_status_update_timestamp
  BEFORE UPDATE ON sync_status
  FOR EACH ROW
  EXECUTE FUNCTION update_sync_status_timestamp();

-- Cleanup function for expired sessions
-- Run periodically via cron job: SELECT cleanup_expired_sessions();
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM mobile_sessions WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for old notifications
-- Run periodically via cron job: SELECT cleanup_old_notifications();
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM mobile_notifications
  WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for synced offline changes
CREATE OR REPLACE FUNCTION cleanup_synced_offline_changes()
RETURNS void AS $$
BEGIN
  DELETE FROM offline_sync_queue
  WHERE synced = TRUE
  AND synced_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;


-- FROM: migrations/007_alerts_module.sql
-- migrations/007_alerts_module.sql
-- Intelligent Alerts Module - Deadline, Predictive, and Custom Alerts

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('deadline', 'document', 'payment', 'decision', 'deadline_at_risk')),
  priority VARCHAR(50) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  action_url VARCHAR(500),
  metadata JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  schedule_for TIMESTAMP,
  sent_at TIMESTAMP,
  failure_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alert rules table
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  type VARCHAR(50) NOT NULL,
  priority VARCHAR(50) NOT NULL,
  conditions JSONB NOT NULL,
  channels JSONB NOT NULL,
  notify_before INT DEFAULT 7,
  frequency VARCHAR(50) DEFAULT 'once' CHECK (frequency IN ('once', 'daily', 'weekly')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alert preferences table
CREATE TABLE IF NOT EXISTS alert_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  preferred_channels JSONB NOT NULL DEFAULT '["email"]'::jsonb,
  quiet_hours JSONB DEFAULT '{"enabled": false, "startTime": "22:00", "endTime": "07:00", "timezone": "UTC"}'::jsonb,
  daily_digest BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_preference UNIQUE (user_id, alert_type)
);

-- Alert history (audit trail)
CREATE TABLE IF NOT EXISTS alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  sent_via JSONB NOT NULL,
  sent_at TIMESTAMP NOT NULL,
  read_at TIMESTAMP,
  action_taken BOOLEAN DEFAULT FALSE,
  action_taken_at TIMESTAMP,
  action_description TEXT
);

-- Deadline risk tracking table
CREATE TABLE IF NOT EXISTS deadline_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deadline_id UUID REFERENCES deadlines(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  days_until_deadline INT NOT NULL,
  risk_level VARCHAR(50) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  related_cases TEXT[],
  suggested_actions TEXT[],
  alert_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled alerts queue
CREATE TABLE IF NOT EXISTS scheduled_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMP NOT NULL,
  executed BOOLEAN DEFAULT FALSE,
  executed_at TIMESTAMP,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_type ON alerts(type);
CREATE INDEX idx_alerts_priority ON alerts(priority);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_case_id ON alerts(case_id);
CREATE INDEX idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX idx_alerts_schedule ON alerts(schedule_for) WHERE status = 'pending';

CREATE INDEX idx_alert_rules_user_id ON alert_rules(user_id);
CREATE INDEX idx_alert_rules_active ON alert_rules(active);
CREATE INDEX idx_alert_rules_type ON alert_rules(type);

CREATE INDEX idx_alert_preferences_user_id ON alert_preferences(user_id);
CREATE INDEX idx_alert_preferences_type ON alert_preferences(alert_type);

CREATE INDEX idx_alert_history_user_id ON alert_history(user_id);
CREATE INDEX idx_alert_history_case_id ON alert_history(case_id);
CREATE INDEX idx_alert_history_sent ON alert_history(sent_at DESC);
CREATE INDEX idx_alert_history_read ON alert_history(read_at);

CREATE INDEX idx_deadline_risks_case_id ON deadline_risks(case_id);
CREATE INDEX idx_deadline_risks_level ON deadline_risks(risk_level);
CREATE INDEX idx_deadline_risks_days ON deadline_risks(days_until_deadline);

CREATE INDEX idx_scheduled_alerts_scheduled_for ON scheduled_alerts(scheduled_for);
CREATE INDEX idx_scheduled_alerts_executed ON scheduled_alerts(executed);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_alert_rules_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_alert_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_deadline_risks_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for timestamp updates
CREATE TRIGGER alert_rules_update_timestamp
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_alert_rules_timestamp();

CREATE TRIGGER alert_preferences_update_timestamp
  BEFORE UPDATE ON alert_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_alert_preferences_timestamp();

CREATE TRIGGER deadline_risks_update_timestamp
  BEFORE UPDATE ON deadline_risks
  FOR EACH ROW
  EXECUTE FUNCTION update_deadline_risks_timestamp();

-- Cleanup function for old alert history
CREATE OR REPLACE FUNCTION cleanup_old_alert_history()
RETURNS void AS $$
BEGIN
  DELETE FROM alert_history
  WHERE sent_at < CURRENT_TIMESTAMP - INTERVAL '180 days';
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for executed scheduled alerts
CREATE OR REPLACE FUNCTION cleanup_executed_scheduled_alerts()
RETURNS void AS $$
BEGIN
  DELETE FROM scheduled_alerts
  WHERE executed = TRUE
  AND executed_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;


-- FROM: migrations/008_calendar_module.sql
-- migrations/008_calendar_module.sql
-- Calendar Integration Module - Google Calendar, Outlook, Local Calendar

-- Calendar credentials table
CREATE TABLE IF NOT EXISTS calendar_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'outlook', 'local')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP NOT NULL,
  calendar_id VARCHAR(255),
  email VARCHAR(255),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_credential UNIQUE (user_id, provider)
);

-- Calendar events table
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('deadline', 'hearing', 'meeting', 'court_appearance', 'consultation', 'other')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  location VARCHAR(255),
  reminders INT[] DEFAULT '{15,60}',
  status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled')),
  external_id VARCHAR(255),
  provider VARCHAR(50) NOT NULL,
  attendees TEXT[] DEFAULT '{}',
  notes TEXT,
  attachments TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT valid_event_time CHECK (end_date > start_date)
);

-- Calendar sync history table
CREATE TABLE IF NOT EXISTS calendar_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  last_sync_time TIMESTAMP,
  next_sync_time TIMESTAMP,
  events_created INT DEFAULT 0,
  events_updated INT DEFAULT 0,
  events_deleted INT DEFAULT 0,
  sync_status VARCHAR(50) DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Meeting requests table
CREATE TABLE IF NOT EXISTS meeting_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_with UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggested_date TIMESTAMP,
  duration INT DEFAULT 60,
  type VARCHAR(50) NOT NULL CHECK (type IN ('consultation', 'status_meeting', 'strategy_session', 'client_meeting')),
  purpose TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'confirmed', 'completed', 'cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Calendar availability tracking table
CREATE TABLE IF NOT EXISTS calendar_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  available_slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_available_minutes INT DEFAULT 0,
  busy BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_user_date UNIQUE (user_id, date)
);

-- Indexes for performance
CREATE INDEX idx_calendar_credentials_user_id ON calendar_credentials(user_id);
CREATE INDEX idx_calendar_credentials_provider ON calendar_credentials(provider);
CREATE INDEX idx_calendar_credentials_active ON calendar_credentials(active);

CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX idx_calendar_events_case_id ON calendar_events(case_id);
CREATE INDEX idx_calendar_events_type ON calendar_events(type);
CREATE INDEX idx_calendar_events_status ON calendar_events(status);
CREATE INDEX idx_calendar_events_start_date ON calendar_events(start_date);
CREATE INDEX idx_calendar_events_date_range ON calendar_events(start_date, end_date);
CREATE INDEX idx_calendar_events_provider ON calendar_events(provider);

CREATE INDEX idx_calendar_syncs_user_id ON calendar_syncs(user_id);
CREATE INDEX idx_calendar_syncs_provider ON calendar_syncs(provider);
CREATE INDEX idx_calendar_syncs_status ON calendar_syncs(sync_status);
CREATE INDEX idx_calendar_syncs_last_sync ON calendar_syncs(last_sync_time DESC);

CREATE INDEX idx_meeting_requests_case_id ON meeting_requests(case_id);
CREATE INDEX idx_meeting_requests_requested_by ON meeting_requests(requested_by);
CREATE INDEX idx_meeting_requests_requested_with ON meeting_requests(requested_with);
CREATE INDEX idx_meeting_requests_status ON meeting_requests(status);

CREATE INDEX idx_calendar_availability_user_id ON calendar_availability(user_id);
CREATE INDEX idx_calendar_availability_date ON calendar_availability(date);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_calendar_credentials_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_calendar_events_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_meeting_requests_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for timestamp updates
CREATE TRIGGER calendar_credentials_update_timestamp
  BEFORE UPDATE ON calendar_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_credentials_timestamp();

CREATE TRIGGER calendar_events_update_timestamp
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_events_timestamp();

CREATE TRIGGER meeting_requests_update_timestamp
  BEFORE UPDATE ON meeting_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_meeting_requests_timestamp();

-- Cleanup function for old calendar syncs
CREATE OR REPLACE FUNCTION cleanup_old_calendar_syncs()
RETURNS void AS $$
BEGIN
  DELETE FROM calendar_syncs
  WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for completed/cancelled events
CREATE OR REPLACE FUNCTION cleanup_old_calendar_events()
RETURNS void AS $$
BEGIN
  DELETE FROM calendar_events
  WHERE (status IN ('completed', 'cancelled') AND end_date < CURRENT_TIMESTAMP - INTERVAL '180 days');
END;
$$ LANGUAGE plpgsql;


-- FROM: migrations/009_reports_module.sql
-- migrations/009_reports_module.sql
-- Reports and Analytics Module - Case Analytics, Financial Reports, Dashboards

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('case_summary', 'financial', 'performance', 'timeline', 'analytics')),
  description TEXT,
  format VARCHAR(50) NOT NULL CHECK (format IN ('pdf', 'excel', 'json', 'html')),
  filters JSONB DEFAULT '{}'::jsonb,
  data JSONB NOT NULL,
  file_url VARCHAR(500),
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dashboards table
CREATE TABLE IF NOT EXISTS dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dashboard sharing table
CREATE TABLE IF NOT EXISTS dashboard_sharing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(50) DEFAULT 'view' CHECK (permission IN ('view', 'edit', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics cache table
CREATE TABLE IF NOT EXISTS analytics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric_type VARCHAR(100) NOT NULL,
  period_from DATE,
  period_to DATE,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

-- Report templates table
CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  fields JSONB NOT NULL,
  default_format VARCHAR(50) DEFAULT 'pdf',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Export jobs table
CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  format VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_url VARCHAR(500),
  file_size INT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_type ON reports(type);
CREATE INDEX idx_reports_generated ON reports(generated_at DESC);
CREATE INDEX idx_reports_expires ON reports(expires_at);

CREATE INDEX idx_dashboards_user_id ON dashboards(user_id);
CREATE INDEX idx_dashboards_is_public ON dashboards(is_public);

CREATE INDEX idx_dashboard_sharing_dashboard_id ON dashboard_sharing(dashboard_id);
CREATE INDEX idx_dashboard_sharing_shared_with ON dashboard_sharing(shared_with);

CREATE INDEX idx_analytics_cache_user_id ON analytics_cache(user_id);
CREATE INDEX idx_analytics_cache_metric ON analytics_cache(metric_type);
CREATE INDEX idx_analytics_cache_expires ON analytics_cache(expires_at);

CREATE INDEX idx_export_jobs_user_id ON export_jobs(user_id);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE INDEX idx_export_jobs_created ON export_jobs(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reports_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_dashboards_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for timestamp updates
CREATE TRIGGER reports_update_timestamp
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION update_reports_timestamp();

CREATE TRIGGER dashboards_update_timestamp
  BEFORE UPDATE ON dashboards
  FOR EACH ROW
  EXECUTE FUNCTION update_dashboards_timestamp();

-- Cleanup function for expired reports
CREATE OR REPLACE FUNCTION cleanup_expired_reports()
RETURNS void AS $$
BEGIN
  DELETE FROM reports
  WHERE expires_at IS NOT NULL
  AND expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for expired cache
CREATE OR REPLACE FUNCTION cleanup_expired_analytics_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM analytics_cache
  WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for old export jobs
CREATE OR REPLACE FUNCTION cleanup_old_export_jobs()
RETURNS void AS $$
BEGIN
  DELETE FROM export_jobs
  WHERE status IN ('completed', 'failed')
  AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
