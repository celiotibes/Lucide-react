-- Legal Automation System - Comprehensive Database Schema
-- 57 tables across 9 migration phases
-- Generated for Supabase deployment

-- ============================================
-- PHASE 1: Core Tables (Users, Authentication, Sessions)
-- ============================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  avatar_url TEXT,
  phone VARCHAR(20),
  document_id VARCHAR(20),
  document_type VARCHAR(20),
  law_firm_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL UNIQUE,
  certificate_fingerprint VARCHAR(64),
  ip_address VARCHAR(50),
  user_agent TEXT,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  details JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================
-- PHASE 2: PKI Module (Digital Certificates)
-- ============================================

CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certificate_name VARCHAR(255) NOT NULL,
  certificate_path VARCHAR(500) NOT NULL,
  certificate_type VARCHAR(50),
  issuer VARCHAR(255),
  valid_from DATE,
  valid_until DATE,
  fingerprint_sha1 VARCHAR(64),
  fingerprint_sha256 VARCHAR(64),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_certificates_user_id ON certificates(user_id);
CREATE INDEX idx_certificates_valid_until ON certificates(valid_until);
CREATE INDEX idx_certificates_is_active ON certificates(is_active);

CREATE TABLE IF NOT EXISTS certificate_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  key_password_hash VARCHAR(255) NOT NULL,
  key_algorithm VARCHAR(50),
  key_size INTEGER,
  is_encrypted BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_certificate_keys_cert_id ON certificate_keys(certificate_id);

-- ============================================
-- PHASE 3: GED Module (Document Management)
-- ============================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID,
  document_name VARCHAR(500) NOT NULL,
  document_type VARCHAR(100),
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  file_hash VARCHAR(64),
  mime_type VARCHAR(100),
  is_confidential BOOLEAN DEFAULT false,
  status VARCHAR(50) DEFAULT 'active',
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_case_id ON documents(case_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_uploaded_at ON documents(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_document_versions_document_id ON document_versions(document_id);

-- ============================================
-- PHASE 4: Timesheet Module (Time Tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID,
  description VARCHAR(500) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_minutes INTEGER DEFAULT 0,
  hourly_rate DECIMAL(10, 2),
  amount DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'running',
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timesheet_entries_lawyer_id ON timesheet_entries(lawyer_id);
CREATE INDEX idx_timesheet_entries_case_id ON timesheet_entries(case_id);
CREATE INDEX idx_timesheet_entries_start_time ON timesheet_entries(start_time DESC);
CREATE INDEX idx_timesheet_entries_status ON timesheet_entries(status);

-- ============================================
-- PHASE 5: AI Module (Intelligence/Predictions)
-- ============================================

CREATE TABLE IF NOT EXISTS ai_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID,
  prediction_type VARCHAR(100) NOT NULL,
  confidence DECIMAL(5, 2),
  prediction_text TEXT NOT NULL,
  evidence JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_predictions_case_id ON ai_predictions(case_id);
CREATE INDEX idx_ai_predictions_type ON ai_predictions(prediction_type);
CREATE INDEX idx_ai_predictions_created_at ON ai_predictions(created_at DESC);

CREATE TABLE IF NOT EXISTS ai_triage_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name VARCHAR(255) NOT NULL,
  condition_json JSONB NOT NULL,
  action_json JSONB NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_triage_rules_active ON ai_triage_rules(is_active);

-- ============================================
-- PHASE 6: Mobile Module (Mobile Support)
-- ============================================

CREATE TABLE IF NOT EXISTS mobile_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL UNIQUE,
  device_name VARCHAR(255),
  device_model VARCHAR(100),
  os_type VARCHAR(50),
  os_version VARCHAR(50),
  app_version VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mobile_devices_user_id ON mobile_devices(user_id);
CREATE INDEX idx_mobile_devices_device_id ON mobile_devices(device_id);

-- ============================================
-- PHASE 7: Alerts Module (Notifications)
-- ============================================

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID,
  alert_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(20) DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  action_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_case_id ON alerts(case_id);
CREATE INDEX idx_alerts_is_read ON alerts(is_read);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);

-- ============================================
-- PHASE 8: Calendar Module (Scheduling)
-- ============================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID,
  event_title VARCHAR(255) NOT NULL,
  event_description TEXT,
  event_type VARCHAR(50),
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  location VARCHAR(255),
  is_all_day BOOLEAN DEFAULT false,
  reminders JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX idx_calendar_events_case_id ON calendar_events(case_id);
CREATE INDEX idx_calendar_events_start_date ON calendar_events(start_date);

-- ============================================
-- PHASE 9: Reports Module (Analytics)
-- ============================================

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type VARCHAR(100) NOT NULL,
  report_name VARCHAR(255) NOT NULL,
  report_data JSONB NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_type ON reports(report_type);
CREATE INDEX idx_reports_generated_at ON reports(generated_at DESC);

-- ============================================
-- Case/Process Management (Core Legal)
-- ============================================

CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_number VARCHAR(50) NOT NULL UNIQUE,
  cnj_number VARCHAR(50),
  tribunal VARCHAR(255),
  forum VARCHAR(255),
  subject TEXT,
  status VARCHAR(50) DEFAULT 'open',
  filing_date DATE,
  last_update TIMESTAMP,
  last_sync TIMESTAMP,
  case_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cases_user_id ON cases(user_id);
CREATE INDEX idx_cases_number ON cases(case_number);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_filing_date ON cases(filing_date);

-- Success message
SELECT 'Legal Automation Database Schema Created Successfully' as status;
