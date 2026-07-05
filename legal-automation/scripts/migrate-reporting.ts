import db from '../src/db/connection';
import { logger } from '../src/utils/logger';

export async function migrateReporting(): Promise<void> {
  logger.info('Iniciando migração de infraestrutura de relatórios');

  try {
    db.exec(\`
      CREATE TABLE IF NOT EXISTS report_metadata (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        report_type TEXT NOT NULL,
        format TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        page_count INTEGER,
        status TEXT DEFAULT 'generated',
        error TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_report_type (report_type),
        INDEX idx_generated_at (generated_at)
      )
    \`);

    db.exec(\`
      CREATE TABLE IF NOT EXISTS report_schedules (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        report_type TEXT NOT NULL,
        format TEXT NOT NULL,
        frequency TEXT NOT NULL,
        day_of_week INTEGER,
        day_of_month INTEGER,
        schedule_time TEXT,
        recipients TEXT,
        enabled BOOLEAN DEFAULT 1,
        last_run DATETIME,
        next_run DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_next_run (next_run),
        INDEX idx_enabled (enabled)
      )
    \`);

    db.exec(\`
      CREATE TABLE IF NOT EXISTS report_templates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        report_type TEXT NOT NULL,
        default_format TEXT NOT NULL,
        html_template LONGTEXT,
        css_styles LONGTEXT,
        sections TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_report_type (report_type)
      )
    \`);

    logger.info('✓ Migração de relatórios concluída');
  } catch (error) {
    logger.error({ err: error }, 'Erro na migração de relatórios');
    throw error;
  }
}

if (require.main === module) {
  migrateReporting()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default migrateReporting;
