/**
 * Phase 21: Setup Wizard Configuration - SQLite
 *
 * Stores the complete setup configuration for the application across all platforms.
 * Tracks:
 * - AI provider configuration (Anthropic, OpenAI, Gemini, local)
 * - Database connection settings
 * - Backup and persistence configuration
 * - Encryption credentials (encrypted at rest)
 * - Platform-specific settings (macOS/Windows/Docker)
 * - Setup completion status and timestamps
 */

-- =====================================================================
-- 1. Setup Wizard Configuration Table
-- =====================================================================

CREATE TABLE IF NOT EXISTS setup_wizard_config (
  id TEXT PRIMARY KEY,

  -- Setup status
  setup_completed BOOLEAN NOT NULL DEFAULT 0,
  completed_at TIMESTAMP,
  last_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- AI Provider Configuration
  ai_provider TEXT NOT NULL DEFAULT 'anthropic',
  -- Options: 'anthropic', 'openai', 'gemini', 'local'

  anthropic_api_key TEXT,
  anthropic_model TEXT DEFAULT 'claude-3-5-sonnet-20241022',

  openai_api_key TEXT,
  openai_model TEXT DEFAULT 'gpt-4-turbo',

  gemini_api_key TEXT,
  gemini_model TEXT DEFAULT 'gemini-2.0-flash',

  -- Local LLM settings
  local_llm_endpoint TEXT,
  local_llm_model TEXT,

  -- Database Configuration
  db_host TEXT DEFAULT 'localhost',
  db_port INTEGER DEFAULT 5432,
  db_name TEXT DEFAULT 'lucide_react',
  db_user TEXT,
  db_password TEXT,
  db_ssl_enabled BOOLEAN DEFAULT 1,

  -- Backup Configuration
  backup_enabled BOOLEAN NOT NULL DEFAULT 1,
  backup_frequency TEXT DEFAULT 'daily',
  -- Options: 'hourly', 'daily', 'weekly', 'monthly'

  backup_retention_days INTEGER DEFAULT 30,

  -- Backup destinations (JSON array of enabled destinations)
  backup_destinations TEXT,
  -- Example: '["local","s3","google-drive"]'

  -- Cloud Backup Settings
  aws_s3_bucket TEXT,
  aws_s3_region TEXT DEFAULT 'us-east-1',
  aws_access_key_id TEXT,
  aws_secret_access_key TEXT,

  google_drive_folder_id TEXT,
  google_drive_service_account TEXT,

  -- Platform-Specific Settings
  platform TEXT,
  -- Options: 'macos', 'windows', 'docker', 'linux', 'web'

  -- macOS specific
  macos_app_version TEXT,
  macos_auto_update_enabled BOOLEAN DEFAULT 1,

  -- Windows specific
  windows_app_version TEXT,
  windows_auto_update_enabled BOOLEAN DEFAULT 1,
  windows_scheduled_backup_time TEXT DEFAULT '02:00',

  -- Docker specific
  docker_compose_version TEXT,
  docker_network_name TEXT DEFAULT 'lucide-network',
  docker_volume_name TEXT DEFAULT 'lucide-data',

  -- General Settings
  app_name TEXT DEFAULT 'Lucide React',
  app_port INTEGER DEFAULT 3000,
  log_level TEXT DEFAULT 'info',
  -- Options: 'debug', 'info', 'warn', 'error'

  -- GDPR & Consent
  gdpr_consent_given BOOLEAN DEFAULT 0,
  gdpr_consent_timestamp TIMESTAMP,
  analytics_enabled BOOLEAN DEFAULT 0,

  -- Configuration metadata (JSON)
  metadata TEXT,
  -- Stores additional platform-specific or experimental settings

  UNIQUE(platform)
);

CREATE INDEX IF NOT EXISTS idx_setup_wizard_config_completed
  ON setup_wizard_config(setup_completed, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_setup_wizard_config_platform
  ON setup_wizard_config(platform);


-- =====================================================================
-- 2. Setup Wizard Audit Log
-- =====================================================================

CREATE TABLE IF NOT EXISTS setup_wizard_audit (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL,
  action TEXT NOT NULL,
  -- Options: 'created', 'updated', 'validated', 'completed', 'error', 'rollback'

  changed_fields TEXT,
  -- JSON array of field names that were changed

  status TEXT NOT NULL,
  -- Options: 'success', 'partial_failure', 'failure'

  error_message TEXT,
  validation_errors TEXT,
  -- JSON array of validation errors

  user_ip TEXT,
  user_agent TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (config_id) REFERENCES setup_wizard_config(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_setup_wizard_audit_config
  ON setup_wizard_audit(config_id);

CREATE INDEX IF NOT EXISTS idx_setup_wizard_audit_action
  ON setup_wizard_audit(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_setup_wizard_audit_status
  ON setup_wizard_audit(status, created_at DESC);


-- =====================================================================
-- 3. Credential Backup Log
-- =====================================================================

CREATE TABLE IF NOT EXISTS credential_backup_log (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL,
  backup_type TEXT NOT NULL,
  -- Options: 'manual', 'scheduled', 'pre_update'

  backup_destination TEXT NOT NULL,
  -- Options: 'local', 's3', 'google_drive', 'azure_blob'

  backup_path TEXT,
  backup_size_bytes INTEGER,
  checksum_sha256 TEXT,

  status TEXT NOT NULL DEFAULT 'pending',
  -- Options: 'pending', 'in_progress', 'success', 'failed'

  error_message TEXT,

  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  retention_until TIMESTAMP,
  -- Date after which this backup can be deleted

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (config_id) REFERENCES setup_wizard_config(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_credential_backup_log_config
  ON credential_backup_log(config_id);

CREATE INDEX IF NOT EXISTS idx_credential_backup_log_destination
  ON credential_backup_log(backup_destination, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credential_backup_log_status
  ON credential_backup_log(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credential_backup_log_retention
  ON credential_backup_log(retention_until) WHERE status = 'success';


-- =====================================================================
-- 4. AI Provider Validation Cache
-- =====================================================================

CREATE TABLE IF NOT EXISTS ai_provider_validation_cache (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,

  is_valid BOOLEAN NOT NULL DEFAULT 0,
  validation_error TEXT,

  response_time_ms INTEGER,
  model_capabilities TEXT,
  -- JSON storing supported features of the model

  validated_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,

  UNIQUE(provider, model, api_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_validation_provider
  ON ai_provider_validation_cache(provider, model);

CREATE INDEX IF NOT EXISTS idx_ai_provider_validation_expires
  ON ai_provider_validation_cache(expires_at DESC);
