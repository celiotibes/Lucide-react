import db from '../src/db/connection';
import { logger } from '../src/utils/logger';

export async function migrateTribunalPolling(): Promise<void> {
  logger.info('Iniciando migração de infraestrutura de polling de tribunais');

  try {
    // Create tribunal_sync_configurations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_sync_configurations (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        tribunal_code TEXT NOT NULL,
        process_number TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        interval INTEGER NOT NULL,
        max_retries INTEGER DEFAULT 3,
        retry_delay INTEGER DEFAULT 5000,
        notifications TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
        UNIQUE(case_id, process_number),
        INDEX idx_case_id (case_id),
        INDEX idx_enabled (enabled),
        INDEX idx_tribunal_code (tribunal_code)
      )
    `);

    // Create tribunal_sync_schedules table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_sync_schedules (
        id TEXT PRIMARY KEY,
        configuration_id TEXT NOT NULL UNIQUE,
        next_sync_time DATETIME NOT NULL,
        last_sync_time DATETIME,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (configuration_id) REFERENCES tribunal_sync_configurations(id) ON DELETE CASCADE,
        INDEX idx_configuration_id (configuration_id),
        INDEX idx_next_sync_time (next_sync_time),
        INDEX idx_status (status)
      )
    `);

    // Create tribunal_sync_results table for tracking sync operations
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_sync_results (
        id TEXT PRIMARY KEY,
        configuration_id TEXT NOT NULL,
        process_number TEXT NOT NULL,
        tribunal_code TEXT NOT NULL,
        sync_time DATETIME NOT NULL,
        success BOOLEAN NOT NULL,
        sync_time_ms INTEGER,
        movements_count INTEGER DEFAULT 0,
        documents_count INTEGER DEFAULT 0,
        deadlines_count INTEGER DEFAULT 0,
        status_changed BOOLEAN DEFAULT 0,
        old_status TEXT,
        new_status TEXT,
        changed_fields TEXT,
        errors TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (configuration_id) REFERENCES tribunal_sync_configurations(id) ON DELETE CASCADE,
        INDEX idx_configuration_id (configuration_id),
        INDEX idx_process_number (process_number),
        INDEX idx_sync_time (sync_time),
        INDEX idx_success (success)
      )
    `);

    // Create tribunal_sync_errors table for error tracking
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_sync_errors (
        id TEXT PRIMARY KEY,
        configuration_id TEXT NOT NULL,
        error_code TEXT NOT NULL,
        error_message TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        next_retry_time DATETIME,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (configuration_id) REFERENCES tribunal_sync_configurations(id) ON DELETE CASCADE,
        INDEX idx_configuration_id (configuration_id),
        INDEX idx_error_code (error_code),
        INDEX idx_timestamp (timestamp),
        INDEX idx_next_retry_time (next_retry_time)
      )
    `);

    // Create process_movement_snapshots table for change detection
    db.exec(`
      CREATE TABLE IF NOT EXISTS process_movement_snapshots (
        id TEXT PRIMARY KEY,
        process_number TEXT NOT NULL,
        movements TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE,
        snapshot_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_process_number (process_number),
        INDEX idx_snapshot_time (snapshot_time),
        INDEX idx_hash (hash)
      )
    `);

    // Create process_update_notifications table
    db.exec(`
      CREATE TABLE IF NOT EXISTS process_update_notifications (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        process_number TEXT NOT NULL,
        tribunal_code TEXT NOT NULL,
        update_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT NOT NULL DEFAULT 'medium',
        data TEXT,
        read BOOLEAN DEFAULT 0,
        read_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
        INDEX idx_case_id (case_id),
        INDEX idx_read (read),
        INDEX idx_priority (priority),
        INDEX idx_created_at (created_at),
        INDEX idx_expires_at (expires_at)
      )
    `);

    // Create tribunal_sync_queue table for job queuing
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_sync_queue (
        id TEXT PRIMARY KEY,
        configuration_id TEXT NOT NULL,
        case_id TEXT NOT NULL,
        process_number TEXT NOT NULL,
        tribunal_code TEXT NOT NULL,
        priority INTEGER DEFAULT 5,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        scheduled_for DATETIME NOT NULL,
        started_at DATETIME,
        completed_at DATETIME,
        status TEXT NOT NULL DEFAULT 'pending',
        FOREIGN KEY (configuration_id) REFERENCES tribunal_sync_configurations(id),
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
        INDEX idx_configuration_id (configuration_id),
        INDEX idx_status (status),
        INDEX idx_priority (priority),
        INDEX idx_scheduled_for (scheduled_for)
      )
    `);

    // Create tribunal_rate_limits table for API rate limiting
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_rate_limits (
        id TEXT PRIMARY KEY,
        tribunal_code TEXT NOT NULL UNIQUE,
        requests_per_minute INTEGER DEFAULT 60,
        current_requests INTEGER DEFAULT 0,
        reset_at DATETIME,
        is_throttled BOOLEAN DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tribunal_code (tribunal_code),
        INDEX idx_reset_at (reset_at)
      )
    `);

    // Create tribunal_health_checks table for monitoring
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_health_checks (
        id TEXT PRIMARY KEY,
        tribunal_code TEXT NOT NULL,
        status TEXT NOT NULL,
        response_time_ms INTEGER,
        last_check DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_successful_check DATETIME,
        consecutive_failures INTEGER DEFAULT 0,
        error_message TEXT,
        INDEX idx_tribunal_code (tribunal_code),
        INDEX idx_status (status),
        INDEX idx_last_check (last_check)
      )
    `);

    // Create polling_statistics table for analytics
    db.exec(`
      CREATE TABLE IF NOT EXISTS polling_statistics (
        id TEXT PRIMARY KEY,
        configuration_id TEXT NOT NULL,
        date_period TEXT NOT NULL,
        total_syncs INTEGER DEFAULT 0,
        successful_syncs INTEGER DEFAULT 0,
        failed_syncs INTEGER DEFAULT 0,
        total_updates INTEGER DEFAULT 0,
        average_sync_time REAL DEFAULT 0,
        peak_hour TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (configuration_id) REFERENCES tribunal_sync_configurations(id) ON DELETE CASCADE,
        UNIQUE(configuration_id, date_period),
        INDEX idx_configuration_id (configuration_id),
        INDEX idx_date_period (date_period)
      )
    `);

    // Create performance monitoring table
    db.exec(`
      CREATE TABLE IF NOT EXISTS polling_performance_metrics (
        id TEXT PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        configuration_id TEXT,
        sync_time_ms INTEGER,
        queue_size INTEGER,
        active_syncs INTEGER,
        memory_usage_mb REAL,
        cpu_usage_percent REAL,
        FOREIGN KEY (configuration_id) REFERENCES tribunal_sync_configurations(id) ON DELETE CASCADE,
        INDEX idx_timestamp (timestamp),
        INDEX idx_configuration_id (configuration_id)
      )
    `);

    // Create indexes for performance optimization
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sync_configs_enabled_interval
      ON tribunal_sync_configurations(enabled, interval);

      CREATE INDEX IF NOT EXISTS idx_sync_results_recent
      ON tribunal_sync_results(configuration_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_notifications_unread
      ON process_update_notifications(case_id, read, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_queue_pending
      ON tribunal_sync_queue(status, priority DESC, scheduled_for ASC);

      CREATE INDEX IF NOT EXISTS idx_errors_unresolved
      ON tribunal_sync_errors(configuration_id, next_retry_time);
    `);

    logger.info('✓ Migração de polling de tribunais concluída com sucesso');
    logger.info('  - Tabelas criadas: 10');
    logger.info('  - Índices de performance: 5');
    logger.info('  - Suporte para: polling, fila, rate limiting, health checks, estatísticas');
  } catch (error) {
    logger.error(
      { err: error },
      'Erro ao executar migração de polling de tribunais',
    );
    throw error;
  }
}

// Execute migration if run directly
if (require.main === module) {
  migrateTribunalPolling()
    .then(() => {
      logger.info('Migração de polling finalizada com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ err: error }, 'Falha na migração de polling');
      process.exit(1);
    });
}

export default migrateTribunalPolling;
