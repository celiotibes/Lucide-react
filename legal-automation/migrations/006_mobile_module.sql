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
