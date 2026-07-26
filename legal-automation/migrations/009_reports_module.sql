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
