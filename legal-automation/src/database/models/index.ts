import { UserModel, createUserTable } from './user.model';
import { PetitionModel, createPetitionTable } from './petition.model';

export interface Database {
  users: UserModel[];
  petitions: PetitionModel[];
}

export const allMigrations = [
  createUserTable,
  createPetitionTable,
  `
  CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    details JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    certificate_fingerprint VARCHAR(64),
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(50),
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `,
  `
  CREATE TABLE IF NOT EXISTS processes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    number VARCHAR(20) NOT NULL UNIQUE,
    cnj VARCHAR(20),
    tribunal VARCHAR(100),
    forum VARCHAR(100),
    subject TEXT,
    status VARCHAR(50),
    filing_date DATE,
    last_update TIMESTAMP,
    last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_processes_user_id ON processes(user_id);
  CREATE INDEX IF NOT EXISTS idx_processes_number ON processes(number);
  CREATE INDEX IF NOT EXISTS idx_processes_last_sync ON processes(last_sync DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    petition_id UUID NOT NULL REFERENCES petitions(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    size_bytes INTEGER,
    file_hash VARCHAR(64),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    storage_path VARCHAR(500)
  );
  CREATE INDEX IF NOT EXISTS idx_documents_petition_id ON documents(petition_id);
  `,
];

export type { UserModel, PetitionModel };
