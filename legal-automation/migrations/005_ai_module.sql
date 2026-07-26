-- migrations/005_ai_module.sql
-- Legal AI Module - Precedent Analysis, Outcome Prediction, Judge Patterns

-- Precedent cases table
CREATE TABLE IF NOT EXISTS precedent_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number VARCHAR(50) UNIQUE NOT NULL,
  court VARCHAR(100) NOT NULL,
  year INT NOT NULL,
  case_type VARCHAR(100) NOT NULL,
  plaintiff VARCHAR(255) NOT NULL,
  defendant VARCHAR(255) NOT NULL,
  claim_amount NUMERIC(15, 2),
  decision VARCHAR(50) NOT NULL CHECK (decision IN ('favorable', 'unfavorable', 'partially_favorable', 'reversed')),
  reason TEXT NOT NULL,
  judges TEXT[] NOT NULL DEFAULT '{}',
  relevance_score NUMERIC(3, 2) DEFAULT 0.5,
  citation_count INT DEFAULT 0,
  jurisdiction VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'OVERRULED')),
  source_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Judge decision patterns table
CREATE TABLE IF NOT EXISTS judge_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id VARCHAR(50) NOT NULL UNIQUE,
  judge_name VARCHAR(255) NOT NULL,
  total_decisions INT DEFAULT 0,
  win_rate NUMERIC(3, 2) DEFAULT 0,
  reversal_rate NUMERIC(3, 2) DEFAULT 0,
  average_time_to_decision INT DEFAULT 0,
  favorite_arguments TEXT[] DEFAULT '{}',
  reversal_reasons TEXT[] DEFAULT '{}',
  specializations VARCHAR(100)[] DEFAULT '{}',
  years_of_experience INT DEFAULT 0,
  court VARCHAR(100),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Case analysis cache table
CREATE TABLE IF NOT EXISTS case_analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_hash VARCHAR(64) UNIQUE NOT NULL,
  case_type VARCHAR(100) NOT NULL,
  jurisdiction VARCHAR(100) NOT NULL,
  claim_amount NUMERIC(15, 2),
  analysis_result JSONB NOT NULL,
  prediction_result JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

-- Argument suggestions cache
CREATE TABLE IF NOT EXISTS argument_suggestions_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_hash VARCHAR(64) NOT NULL,
  side VARCHAR(20) NOT NULL CHECK (side IN ('plaintiff', 'defendant')),
  arguments JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),

  CONSTRAINT unique_argument_cache UNIQUE (case_hash, side)
);

-- AI analysis results archive
CREATE TABLE IF NOT EXISTS ai_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  analysis_type VARCHAR(50) NOT NULL,
  precedent_count INT,
  win_probability INT,
  confidence_level INT,
  risk_factors TEXT[],
  favorable_factors TEXT[],
  recommendations TEXT[],
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_precedent_cases_case_type ON precedent_cases(case_type);
CREATE INDEX idx_precedent_cases_jurisdiction ON precedent_cases(jurisdiction);
CREATE INDEX idx_precedent_cases_decision ON precedent_cases(decision);
CREATE INDEX idx_precedent_cases_year ON precedent_cases(year);
CREATE INDEX idx_precedent_cases_court ON precedent_cases(court);
CREATE INDEX idx_precedent_cases_relevance ON precedent_cases(relevance_score DESC);
CREATE INDEX idx_precedent_cases_citation_count ON precedent_cases(citation_count DESC);
CREATE INDEX idx_precedent_cases_status ON precedent_cases(status);

CREATE INDEX idx_judge_patterns_judge_id ON judge_patterns(judge_id);
CREATE INDEX idx_judge_patterns_court ON judge_patterns(court);
CREATE INDEX idx_judge_patterns_win_rate ON judge_patterns(win_rate DESC);
CREATE INDEX idx_judge_patterns_active ON judge_patterns(active);

CREATE INDEX idx_case_analysis_cache_expires ON case_analysis_cache(expires_at);
CREATE INDEX idx_case_analysis_cache_hash ON case_analysis_cache(case_hash);

CREATE INDEX idx_argument_cache_expires ON argument_suggestions_cache(expires_at);
CREATE INDEX idx_argument_cache_hash ON argument_suggestions_cache(case_hash);

CREATE INDEX idx_ai_analysis_results_case_id ON ai_analysis_results(case_id);
CREATE INDEX idx_ai_analysis_results_type ON ai_analysis_results(analysis_type);
CREATE INDEX idx_ai_analysis_results_date ON ai_analysis_results(created_at DESC);

-- Full-text search index for precedent reasons
CREATE INDEX idx_precedent_cases_reason_fts ON precedent_cases USING GIN (
  to_tsvector('portuguese', reason)
);

-- Cleanup expired cache records (can be run via scheduled job)
-- DELETE FROM case_analysis_cache WHERE expires_at < CURRENT_TIMESTAMP;
-- DELETE FROM argument_suggestions_cache WHERE expires_at < CURRENT_TIMESTAMP;
