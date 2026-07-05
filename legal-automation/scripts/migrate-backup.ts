import db from '../src/db/connection';
import { logger } from '../src/utils/logger';

export function migrateBackup(): void {
  try {
    logger.info('Iniciando migração: Tabelas de Backup e Disaster Recovery (Phase 11)');

    // Tabela: backup_configurations
    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_configurations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL DEFAULT 'full',
        frequency TEXT NOT NULL DEFAULT 'daily',
        retention_days INTEGER NOT NULL DEFAULT 30,
        storage_backends TEXT NOT NULL,
        include_database INTEGER NOT NULL DEFAULT 1,
        include_files INTEGER NOT NULL DEFAULT 1,
        include_configs INTEGER NOT NULL DEFAULT 1,
        notify_on_completion INTEGER NOT NULL DEFAULT 1,
        notify_on_failure INTEGER NOT NULL DEFAULT 1,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_backup_configurations_is_enabled ON backup_configurations(is_enabled);
      CREATE INDEX IF NOT EXISTS idx_backup_configurations_next_run_at ON backup_configurations(next_run_at);
    `);

    // Tabela: backup_jobs
    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_jobs (
        id TEXT PRIMARY KEY,
        backup_config_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        failure_reason TEXT,
        data_size INTEGER NOT NULL,
        compressed_size INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        files_backed_up INTEGER NOT NULL,
        tables_backed_up INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (backup_config_id) REFERENCES backup_configurations(id)
      );
      CREATE INDEX IF NOT EXISTS idx_backup_jobs_status ON backup_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_backup_jobs_created_at ON backup_jobs(created_at);
      CREATE INDEX IF NOT EXISTS idx_backup_jobs_backup_config_id ON backup_jobs(backup_config_id);
    `);

    // Tabela: backup_files
    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_files (
        id TEXT PRIMARY KEY,
        backup_job_id TEXT NOT NULL,
        storage_backend TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        compressed_size INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        encryption_algorithm TEXT,
        is_verified INTEGER NOT NULL DEFAULT 0,
        verified_at TEXT,
        uploaded_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (backup_job_id) REFERENCES backup_jobs(id)
      );
      CREATE INDEX IF NOT EXISTS idx_backup_files_backup_job_id ON backup_files(backup_job_id);
      CREATE INDEX IF NOT EXISTS idx_backup_files_storage_backend ON backup_files(storage_backend);
      CREATE INDEX IF NOT EXISTS idx_backup_files_expires_at ON backup_files(expires_at);
    `);

    // Tabela: restore_jobs
    db.exec(`
      CREATE TABLE IF NOT EXISTS restore_jobs (
        id TEXT PRIMARY KEY,
        restore_point_id TEXT NOT NULL,
        target_environment TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        failure_reason TEXT,
        items_restored INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        verification_passed INTEGER NOT NULL DEFAULT 0,
        performed_by TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (restore_point_id) REFERENCES backup_jobs(id)
      );
      CREATE INDEX IF NOT EXISTS idx_restore_jobs_status ON restore_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_restore_jobs_performed_by ON restore_jobs(performed_by);
      CREATE INDEX IF NOT EXISTS idx_restore_jobs_created_at ON restore_jobs(created_at);
    `);

    // Tabela: replication_configurations
    db.exec(`
      CREATE TABLE IF NOT EXISTS replication_configurations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        source_database TEXT NOT NULL,
        target_database TEXT NOT NULL,
        replication_lag INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_replication_at TEXT,
        next_replication_at TEXT NOT NULL,
        conflict_resolution TEXT NOT NULL DEFAULT 'source_wins',
        monitoring_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_replication_configurations_is_active ON replication_configurations(is_active);
      CREATE INDEX IF NOT EXISTS idx_replication_configurations_next_replication_at ON replication_configurations(next_replication_at);
    `);

    // Tabela: disaster_recovery_plans
    db.exec(`
      CREATE TABLE IF NOT EXISTS disaster_recovery_plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        rto_minutes INTEGER NOT NULL,
        rpo_minutes INTEGER NOT NULL,
        backup_configurations TEXT NOT NULL,
        replication_configurations TEXT NOT NULL,
        test_schedule TEXT NOT NULL DEFAULT 'monthly',
        last_test_at TEXT,
        next_test_at TEXT NOT NULL,
        owner TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (owner) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_disaster_recovery_plans_owner ON disaster_recovery_plans(owner);
      CREATE INDEX IF NOT EXISTS idx_disaster_recovery_plans_next_test_at ON disaster_recovery_plans(next_test_at);
    `);

    // Tabela: backup_health_checks
    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_health_checks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        timestamp TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_backup_health_checks_type ON backup_health_checks(type);
      CREATE INDEX IF NOT EXISTS idx_backup_health_checks_status ON backup_health_checks(status);
      CREATE INDEX IF NOT EXISTS idx_backup_health_checks_created_at ON backup_health_checks(created_at);
    `);

    // Tabela: storage_credentials
    db.exec(`
      CREATE TABLE IF NOT EXISTS storage_credentials (
        id TEXT PRIMARY KEY,
        backend TEXT NOT NULL,
        region TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        access_key TEXT NOT NULL,
        secret_key TEXT NOT NULL,
        bucket_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        tested_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_storage_credentials_backend ON storage_credentials(backend);
      CREATE INDEX IF NOT EXISTS idx_storage_credentials_is_active ON storage_credentials(is_active);
    `);

    // Tabela: backup_schedules
    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_schedules (
        id TEXT PRIMARY KEY,
        day_of_week INTEGER,
        day_of_month INTEGER,
        time TEXT NOT NULL,
        timezone TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_backup_schedules_time ON backup_schedules(time);
    `);

    // Tabela: backup_audit_log
    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_audit_log (
        id TEXT PRIMARY KEY,
        backup_job_id TEXT,
        restore_job_id TEXT,
        action TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (backup_job_id) REFERENCES backup_jobs(id),
        FOREIGN KEY (restore_job_id) REFERENCES restore_jobs(id)
      );
      CREATE INDEX IF NOT EXISTS idx_backup_audit_log_actor_id ON backup_audit_log(actor_id);
      CREATE INDEX IF NOT EXISTS idx_backup_audit_log_created_at ON backup_audit_log(created_at);
    `);

    logger.info('✓ Migração de Backup e Disaster Recovery concluída (9 tabelas criadas)');
  } catch (error) {
    logger.error({ err: error }, 'Erro ao migrar tabelas de backup');
    throw error;
  }
}

// Executar migração se chamado diretamente
if (require.main === module) {
  migrateBackup();
}

export default migrateBackup;
