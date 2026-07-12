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
