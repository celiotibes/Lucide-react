import { UserModel, createUserTable } from './user.model';
import { PetitionModel, createPetitionTable } from './petition.model';

export interface Database {
  users: UserModel[];
  petitions: PetitionModel[];
}

// Phase 5.6: Persistence migrations
const createRateLimitingQuotasTable = `
CREATE TABLE IF NOT EXISTS rate_limiting_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  tier VARCHAR(50) NOT NULL DEFAULT 'free',
  daily_limit INTEGER NOT NULL DEFAULT 100,
  hourly_limit INTEGER NOT NULL DEFAULT 20,
  minutely_limit INTEGER NOT NULL DEFAULT 5,
  daily_consumed INTEGER NOT NULL DEFAULT 0,
  hourly_consumed INTEGER NOT NULL DEFAULT 0,
  minutely_consumed INTEGER NOT NULL DEFAULT 0,
  last_reset_daily TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_reset_hourly TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_reset_minutely TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rate_limiting_quotas_user_id ON rate_limiting_quotas(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limiting_quotas_tier ON rate_limiting_quotas(tier);
`;

const createABTestingResultsTable = `
CREATE TABLE IF NOT EXISTS ab_testing_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type VARCHAR(100) NOT NULL,
  model_a VARCHAR(100) NOT NULL,
  model_b VARCHAR(100) NOT NULL,
  quality_a DECIMAL(5,2),
  quality_b DECIMAL(5,2),
  cost_a DECIMAL(10,6),
  cost_b DECIMAL(10,6),
  winner VARCHAR(100),
  confidence DECIMAL(5,2),
  samples_a INTEGER DEFAULT 0,
  samples_b INTEGER DEFAULT 0,
  average_latency_a INTEGER,
  average_latency_b INTEGER,
  success_rate_a DECIMAL(5,2),
  success_rate_b DECIMAL(5,2),
  test_metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ab_testing_results_task_type ON ab_testing_results(task_type);
CREATE INDEX IF NOT EXISTS idx_ab_testing_results_created_at ON ab_testing_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ab_testing_results_winner ON ab_testing_results(winner);
`;

const createOptimizationStrategiesTable = `
CREATE TABLE IF NOT EXISTS optimization_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type VARCHAR(100) NOT NULL UNIQUE,
  recommended_model VARCHAR(100) NOT NULL,
  confidence DECIMAL(5,2),
  estimated_savings DECIMAL(10,2),
  last_ab_test_id UUID REFERENCES ab_testing_results(id) ON DELETE SET NULL,
  strategy_metadata JSONB,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_optimization_strategies_task_type ON optimization_strategies(task_type);
CREATE INDEX IF NOT EXISTS idx_optimization_strategies_active ON optimization_strategies(active);
`;

const createSystemAnalyticsTable = `
CREATE TABLE IF NOT EXISTS system_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(15,2),
  task_type VARCHAR(100),
  provider VARCHAR(100),
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  analytics_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_system_analytics_metric_name ON system_analytics(metric_name);
CREATE INDEX IF NOT EXISTS idx_system_analytics_created_at ON system_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_analytics_task_type ON system_analytics(task_type);
`;

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
  createRateLimitingQuotasTable,
  createABTestingResultsTable,
  createOptimizationStrategiesTable,
  createSystemAnalyticsTable,
];

export type { UserModel, PetitionModel };
