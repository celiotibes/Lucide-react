-- Phase 17: Official Diaries & Alerts Tables

-- Create official_diaries table
CREATE TABLE IF NOT EXISTS official_diaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state VARCHAR(2) NOT NULL,
  title VARCHAR(500) NOT NULL,
  published_date TIMESTAMP NOT NULL,
  content TEXT NOT NULL,
  source VARCHAR(255) NOT NULL,
  url VARCHAR(500),
  process_number VARCHAR(50),
  scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, published_date)
);

CREATE INDEX idx_official_diaries_state ON official_diaries(state);
CREATE INDEX idx_official_diaries_published_date ON official_diaries(published_date);
CREATE INDEX idx_official_diaries_process_number ON official_diaries(process_number);
CREATE INDEX idx_official_diaries_scraped_at ON official_diaries(scraped_at);
CREATE INDEX idx_official_diaries_content_tsvector ON official_diaries USING GIN(to_tsvector('portuguese', content));

-- Create diary_alerts table
CREATE TABLE IF NOT EXISTS diary_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  process_number VARCHAR(50),
  party_name VARCHAR(500),
  alert_type VARCHAR(50) NOT NULL,
  found_in VARCHAR(255) NOT NULL,
  diary_id UUID NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (diary_id) REFERENCES official_diaries(id) ON DELETE CASCADE
);

CREATE INDEX idx_diary_alerts_user_id ON diary_alerts(user_id);
CREATE INDEX idx_diary_alerts_process_number ON diary_alerts(process_number);
CREATE INDEX idx_diary_alerts_read ON diary_alerts(read);
CREATE INDEX idx_diary_alerts_created_at ON diary_alerts(created_at);
CREATE INDEX idx_diary_alerts_user_read ON diary_alerts(user_id, read);

-- Create alert_preferences table
CREATE TABLE IF NOT EXISTS alert_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL UNIQUE,
  process_numbers JSONB DEFAULT '[]'::jsonb,
  party_names JSONB DEFAULT '[]'::jsonb,
  keywords JSONB DEFAULT '[]'::jsonb,
  states JSONB DEFAULT '[]'::jsonb,
  email_notification BOOLEAN DEFAULT TRUE,
  sms_notification BOOLEAN DEFAULT FALSE,
  push_notification BOOLEAN DEFAULT TRUE,
  slack_notification BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_alert_preferences_user_id ON alert_preferences(user_id);

-- Create diary_scrape_logs table (for tracking scraping operations)
CREATE TABLE IF NOT EXISTS diary_scrape_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state VARCHAR(2) NOT NULL,
  scrape_start TIMESTAMP NOT NULL,
  scrape_end TIMESTAMP,
  entries_found INTEGER DEFAULT 0,
  entries_stored INTEGER DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  UNIQUE(state, scrape_start)
);

CREATE INDEX idx_diary_scrape_logs_state ON diary_scrape_logs(state);
CREATE INDEX idx_diary_scrape_logs_status ON diary_scrape_logs(status);
CREATE INDEX idx_diary_scrape_logs_scrape_start ON diary_scrape_logs(scrape_start);

-- Create trigger to update alert_preferences.updated_at
CREATE OR REPLACE FUNCTION update_alert_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER alert_preferences_updated_at_trigger
BEFORE UPDATE ON alert_preferences
FOR EACH ROW
EXECUTE FUNCTION update_alert_preferences_timestamp();

-- Create trigger to update official_diaries.scraped_at
CREATE OR REPLACE FUNCTION update_official_diaries_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.scraped_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER official_diaries_scraped_at_trigger
BEFORE UPDATE ON official_diaries
FOR EACH ROW
EXECUTE FUNCTION update_official_diaries_timestamp();
