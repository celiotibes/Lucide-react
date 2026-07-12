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
