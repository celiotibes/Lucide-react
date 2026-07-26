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
