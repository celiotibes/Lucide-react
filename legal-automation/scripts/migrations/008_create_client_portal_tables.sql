-- Phase 19: Transparent Client Portal Tables

-- Create client_case_access table (who can see which cases)
CREATE TABLE IF NOT EXISTS client_case_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) NOT NULL,
  case_id VARCHAR(255) NOT NULL,
  lawyer_id VARCHAR(255) NOT NULL,
  access_level VARCHAR(50) NOT NULL DEFAULT 'view_only',
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, case_id),
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lawyer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_client_case_access_client_id ON client_case_access(client_id);
CREATE INDEX idx_client_case_access_case_id ON client_case_access(case_id);

-- Create case_updates table (timeline of all case changes)
CREATE TABLE IF NOT EXISTS case_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id VARCHAR(255) NOT NULL,
  update_type VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_by VARCHAR(255) NOT NULL,
  visibility VARCHAR(50) NOT NULL DEFAULT 'client_visible',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_case_updates_case_id ON case_updates(case_id);
CREATE INDEX idx_case_updates_type ON case_updates(update_type);
CREATE INDEX idx_case_updates_visibility ON case_updates(visibility);
CREATE INDEX idx_case_updates_created_at ON case_updates(created_at);

-- Create case_documents_client table (documents accessible to clients)
CREATE TABLE IF NOT EXISTS case_documents_client (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id VARCHAR(255) NOT NULL,
  document_id VARCHAR(255) NOT NULL,
  document_name VARCHAR(500) NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  document_url VARCHAR(500),
  accessible_to_client BOOLEAN DEFAULT TRUE,
  shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_case_documents_client_case_id ON case_documents_client(case_id);
CREATE INDEX idx_case_documents_client_type ON case_documents_client(document_type);
CREATE INDEX idx_case_documents_client_accessible ON case_documents_client(accessible_to_client);

-- Create case_milestones table (important dates and events)
CREATE TABLE IF NOT EXISTS case_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id VARCHAR(255) NOT NULL,
  milestone_type VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  scheduled_date DATE NOT NULL,
  completed_date DATE,
  description TEXT,
  is_critical BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_case_milestones_case_id ON case_milestones(case_id);
CREATE INDEX idx_case_milestones_type ON case_milestones(milestone_type);
CREATE INDEX idx_case_milestones_scheduled_date ON case_milestones(scheduled_date);
CREATE INDEX idx_case_milestones_critical ON case_milestones(is_critical);

-- Create client_messages table (communications with clients)
CREATE TABLE IF NOT EXISTS client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id VARCHAR(255) NOT NULL,
  sender_id VARCHAR(255) NOT NULL,
  receiver_id VARCHAR(255) NOT NULL,
  message_type VARCHAR(50) NOT NULL,
  subject VARCHAR(500),
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_client_messages_case_id ON client_messages(case_id);
CREATE INDEX idx_client_messages_receiver_id ON client_messages(receiver_id);
CREATE INDEX idx_client_messages_read ON client_messages(read);
CREATE INDEX idx_client_messages_created_at ON client_messages(created_at);

-- Create case_billing_timeline table (cost tracking for clients)
CREATE TABLE IF NOT EXISTS case_billing_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id VARCHAR(255) NOT NULL,
  billing_date DATE NOT NULL,
  description VARCHAR(500),
  hours DECIMAL(5,2),
  hourly_rate DECIMAL(10,2),
  total_amount DECIMAL(12,2) NOT NULL,
  billing_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_case_billing_timeline_case_id ON case_billing_timeline(case_id);
CREATE INDEX idx_case_billing_timeline_status ON case_billing_timeline(status);
CREATE INDEX idx_case_billing_timeline_date ON case_billing_timeline(billing_date);

-- Create client_portal_views table (track client portal activity)
CREATE TABLE IF NOT EXISTS client_portal_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) NOT NULL,
  case_id VARCHAR(255) NOT NULL,
  view_type VARCHAR(100) NOT NULL,
  view_data JSONB,
  viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_client_portal_views_client_id ON client_portal_views(client_id);
CREATE INDEX idx_client_portal_views_case_id ON client_portal_views(case_id);
CREATE INDEX idx_client_portal_views_viewed_at ON client_portal_views(viewed_at);

-- Create case_status_snapshot table (historical case status)
CREATE TABLE IF NOT EXISTS case_status_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id VARCHAR(255) NOT NULL,
  status_type VARCHAR(100) NOT NULL,
  status_value VARCHAR(255) NOT NULL,
  previous_value VARCHAR(255),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  changed_by VARCHAR(255),
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_case_status_snapshot_case_id ON case_status_snapshot(case_id);
CREATE INDEX idx_case_status_snapshot_type ON case_status_snapshot(status_type);
CREATE INDEX idx_case_status_snapshot_changed_at ON case_status_snapshot(changed_at);

-- Create client_preferences table (portal preferences)
CREATE TABLE IF NOT EXISTS client_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) NOT NULL UNIQUE,
  notification_frequency VARCHAR(50) DEFAULT 'daily',
  digest_email_enabled BOOLEAN DEFAULT TRUE,
  receive_document_notifications BOOLEAN DEFAULT TRUE,
  receive_status_updates BOOLEAN DEFAULT TRUE,
  receive_billing_updates BOOLEAN DEFAULT TRUE,
  theme_preference VARCHAR(50) DEFAULT 'light',
  language VARCHAR(10) DEFAULT 'pt-BR',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_client_preferences_client_id ON client_preferences(client_id);

-- Create trigger to update client_preferences.updated_at
CREATE OR REPLACE FUNCTION update_client_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_preferences_updated_at_trigger
BEFORE UPDATE ON client_preferences
FOR EACH ROW
EXECUTE FUNCTION update_client_preferences_timestamp();

-- Create trigger to auto-create case status snapshots
CREATE OR REPLACE FUNCTION create_case_status_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO case_status_snapshot (case_id, status_type, status_value, previous_value, changed_by)
  VALUES (NEW.id, 'status', NEW.status, OLD.status, NEW.updated_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_status_change_trigger
AFTER UPDATE ON cases
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION create_case_status_snapshot();
