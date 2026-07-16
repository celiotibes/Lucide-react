-- Create legis_searches table for jurisprudence search history
CREATE TABLE IF NOT EXISTS legis_searches (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  keywords TEXT NOT NULL,
  court VARCHAR(10) NOT NULL DEFAULT 'both',
  case_number VARCHAR(50),
  results_count INTEGER DEFAULT 0,
  confidence_score INTEGER,
  search_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_court (court),
  INDEX idx_case_number (case_number),
  INDEX idx_created_at (created_at),
  INDEX idx_search_type (search_type)
);

-- Table for caching jurisprudence decisions from STJ/STF
CREATE TABLE IF NOT EXISTS legis_jurisprudence (
  id VARCHAR(100) PRIMARY KEY,
  court VARCHAR(10) NOT NULL,
  case_number VARCHAR(50) NOT NULL,
  decision_date DATE,
  title TEXT NOT NULL,
  summary TEXT,
  content LONGTEXT,
  rapporteur VARCHAR(255),
  subjects JSON,
  keywords JSON,
  jurisprudential_theme VARCHAR(100),
  repeat_count INTEGER DEFAULT 0,
  source VARCHAR(255),
  url TEXT,
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_court (court),
  INDEX idx_case_number (case_number),
  INDEX idx_repeat_count (repeat_count DESC),
  INDEX idx_cached_at (cached_at)
);
