-- Phase 15: Kanban & Timesheet Tables

-- Create kanban_columns table
CREATE TABLE IF NOT EXISTS kanban_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, id)
);

CREATE INDEX idx_kanban_columns_user_id ON kanban_columns(user_id);

-- Create kanban_tasks table
CREATE TABLE IF NOT EXISTS kanban_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  case_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  column_id VARCHAR(50) NOT NULL,
  lawyer_id VARCHAR(255) NOT NULL,
  client_id VARCHAR(255),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  due_date TIMESTAMP,
  assigned_to VARCHAR(255),
  tags JSONB DEFAULT '[]'::jsonb,
  documents_needed INTEGER DEFAULT 0,
  documents_received INTEGER DEFAULT 0,
  tribunal VARCHAR(100),
  "position" INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_kanban_tasks_user_id ON kanban_tasks(user_id);
CREATE INDEX idx_kanban_tasks_column_id ON kanban_tasks(column_id);
CREATE INDEX idx_kanban_tasks_lawyer_id ON kanban_tasks(lawyer_id);
CREATE INDEX idx_kanban_tasks_case_id ON kanban_tasks(case_id);
CREATE INDEX idx_kanban_tasks_priority ON kanban_tasks(priority);
CREATE INDEX idx_kanban_tasks_due_date ON kanban_tasks(due_date);

-- Create timesheet_entries table
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id VARCHAR(255) NOT NULL,
  case_id VARCHAR(255) NOT NULL,
  description VARCHAR(500) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_minutes INTEGER DEFAULT 0,
  hourly_rate DECIMAL(10, 2) NOT NULL,
  amount DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lawyer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_timesheet_entries_lawyer_id ON timesheet_entries(lawyer_id);
CREATE INDEX idx_timesheet_entries_case_id ON timesheet_entries(case_id);
CREATE INDEX idx_timesheet_entries_start_time ON timesheet_entries(start_time);
CREATE INDEX idx_timesheet_entries_status ON timesheet_entries(status);
CREATE INDEX idx_timesheet_entries_created_at ON timesheet_entries(created_at);

-- Create calendar_sync_logs table (for Google Calendar integration)
CREATE TABLE IF NOT EXISTS calendar_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  sync_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  event_count INTEGER DEFAULT 0,
  error_message TEXT,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_calendar_sync_logs_user_id ON calendar_sync_logs(user_id);
CREATE INDEX idx_calendar_sync_logs_synced_at ON calendar_sync_logs(synced_at);

-- Add trigger to update kanban_columns.updated_at
CREATE OR REPLACE FUNCTION update_kanban_columns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kanban_columns_updated_at_trigger
BEFORE UPDATE ON kanban_columns
FOR EACH ROW
EXECUTE FUNCTION update_kanban_columns_updated_at();

-- Add trigger to update kanban_tasks.updated_at
CREATE OR REPLACE FUNCTION update_kanban_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kanban_tasks_updated_at_trigger
BEFORE UPDATE ON kanban_tasks
FOR EACH ROW
EXECUTE FUNCTION update_kanban_tasks_updated_at();

-- Add trigger to update timesheet_entries.updated_at
CREATE OR REPLACE FUNCTION update_timesheet_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER timesheet_entries_updated_at_trigger
BEFORE UPDATE ON timesheet_entries
FOR EACH ROW
EXECUTE FUNCTION update_timesheet_entries_updated_at();
