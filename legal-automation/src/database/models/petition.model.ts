export interface PetitionModel {
  id: string;
  user_id: string;
  process_number: string;
  title: string;
  type: 'initial' | 'intermediate' | 'final' | 'other';
  content: string;
  rtf_content?: string;
  tribunal: 'projudi' | 'eproc';
  status: 'draft' | 'validating' | 'validated' | 'signing' | 'signed' | 'submitted' | 'rejected' | 'error';
  ai_provider?: string;
  confidence_score?: number;
  validation_score?: number;
  validation_issues?: string[];
  signed_at?: Date;
  signature_hash?: string;
  protocol_number?: string;
  submitted_at?: Date;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export const createPetitionTable = `
CREATE TABLE IF NOT EXISTS petitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  process_number VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('initial', 'intermediate', 'final', 'other')),
  content TEXT NOT NULL,
  rtf_content TEXT,
  tribunal VARCHAR(20) NOT NULL CHECK (tribunal IN ('projudi', 'eproc')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'validating', 'validated', 'signing', 'signed', 'submitted', 'rejected', 'error')),
  ai_provider VARCHAR(50),
  confidence_score NUMERIC(3,2),
  validation_score NUMERIC(3,2),
  validation_issues TEXT[],
  signed_at TIMESTAMP,
  signature_hash VARCHAR(64),
  protocol_number VARCHAR(50),
  submitted_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_petitions_user_id ON petitions(user_id);
CREATE INDEX IF NOT EXISTS idx_petitions_process ON petitions(process_number);
CREATE INDEX IF NOT EXISTS idx_petitions_status ON petitions(status);
CREATE INDEX IF NOT EXISTS idx_petitions_tribunal ON petitions(tribunal);
CREATE INDEX IF NOT EXISTS idx_petitions_created_at ON petitions(created_at DESC);
`;
