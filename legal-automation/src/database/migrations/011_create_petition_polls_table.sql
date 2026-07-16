-- Create petition_polls table for post-petition confirmation tracking
CREATE TABLE IF NOT EXISTS petition_polls (
  id SERIAL PRIMARY KEY,
  petition_id VARCHAR(255) NOT NULL,
  case_id VARCHAR(255) NOT NULL,
  process_number VARCHAR(50) NOT NULL,
  tribunal_code VARCHAR(20) NOT NULL,
  protocol_number VARCHAR(50) NOT NULL,
  lawyer_id VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  poll_count INTEGER NOT NULL DEFAULT 0,
  max_polls INTEGER NOT NULL DEFAULT 12,
  submitted_at TIMESTAMP NOT NULL,
  last_polled_at TIMESTAMP,
  notified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(petition_id),
  INDEX idx_petition_id (petition_id),
  INDEX idx_case_id (case_id),
  INDEX idx_process_number (process_number),
  INDEX idx_status (status),
  INDEX idx_submitted_at (submitted_at)
);

-- Create index for querying active polls
CREATE INDEX IF NOT EXISTS idx_petition_polls_status_created
ON petition_polls(status, created_at);

-- Create index for cleanup queries (finding old completed polls)
CREATE INDEX IF NOT EXISTS idx_petition_polls_notified_at
ON petition_polls(notified_at);
