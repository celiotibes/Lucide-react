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
