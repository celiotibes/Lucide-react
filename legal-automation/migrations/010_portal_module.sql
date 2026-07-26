-- migrations/010_portal_module.sql
-- Client Portal Module - Case Access, Billing, Messages, Invitations

-- Portal access control table
CREATE TABLE IF NOT EXISTS portal_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  document_access VARCHAR(50) DEFAULT 'view' CHECK (document_access IN ('view', 'download', 'none')),
  timeline_access BOOLEAN DEFAULT TRUE,
  billing_access BOOLEAN DEFAULT TRUE,

  CONSTRAINT unique_access UNIQUE (client_id, case_id)
);

-- Portal invitations table
CREATE TABLE IF NOT EXISTS portal_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  invited_email VARCHAR(255) NOT NULL,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

-- Client notifications table
CREATE TABLE IF NOT EXISTS client_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('update', 'deadline', 'document', 'billing', 'message')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP,
  action_url VARCHAR(500)
);

-- Client messages table
CREATE TABLE IF NOT EXISTS client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  attachments TEXT[] DEFAULT '{}',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP
);

-- Client activity log table
CREATE TABLE IF NOT EXISTS client_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  action VARCHAR(255) NOT NULL,
  details TEXT,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portal sessions table
CREATE TABLE IF NOT EXISTS portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_portal_access_client_id ON portal_access(client_id);
CREATE INDEX idx_portal_access_case_id ON portal_access(case_id);
CREATE INDEX idx_portal_access_expires ON portal_access(expires_at);

CREATE INDEX idx_portal_invitations_case_id ON portal_invitations(case_id);
CREATE INDEX idx_portal_invitations_email ON portal_invitations(invited_email);
CREATE INDEX idx_portal_invitations_token ON portal_invitations(token);
CREATE INDEX idx_portal_invitations_status ON portal_invitations(status);
CREATE INDEX idx_portal_invitations_expires ON portal_invitations(expires_at);

CREATE INDEX idx_client_notifications_client_id ON client_notifications(client_id);
CREATE INDEX idx_client_notifications_case_id ON client_notifications(case_id);
CREATE INDEX idx_client_notifications_type ON client_notifications(type);
CREATE INDEX idx_client_notifications_read ON client_notifications(read);
CREATE INDEX idx_client_notifications_received ON client_notifications(received_at DESC);

CREATE INDEX idx_client_messages_case_id ON client_messages(case_id);
CREATE INDEX idx_client_messages_sender_id ON client_messages(sender_id);
CREATE INDEX idx_client_messages_recipient_id ON client_messages(recipient_id);
CREATE INDEX idx_client_messages_sent ON client_messages(sent_at DESC);
CREATE INDEX idx_client_messages_read ON client_messages(read);

CREATE INDEX idx_client_activity_user_id ON client_activity_log(user_id);
CREATE INDEX idx_client_activity_case_id ON client_activity_log(case_id);
CREATE INDEX idx_client_activity_timestamp ON client_activity_log(timestamp DESC);

CREATE INDEX idx_portal_sessions_client_id ON portal_sessions(client_id);
CREATE INDEX idx_portal_sessions_token ON portal_sessions(session_token);
CREATE INDEX idx_portal_sessions_expires ON portal_sessions(expires_at);

-- Cleanup function for expired invitations
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS void AS $$
BEGIN
  UPDATE portal_invitations
  SET status = 'expired'
  WHERE status = 'pending'
  AND expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for expired portal access
CREATE OR REPLACE FUNCTION cleanup_expired_portal_access()
RETURNS void AS $$
BEGIN
  DELETE FROM portal_access
  WHERE expires_at IS NOT NULL
  AND expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_portal_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM portal_sessions
  WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to update last_activity timestamp
CREATE OR REPLACE FUNCTION update_portal_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session activity
CREATE TRIGGER portal_session_activity_timestamp
  BEFORE UPDATE ON portal_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_portal_session_activity();
