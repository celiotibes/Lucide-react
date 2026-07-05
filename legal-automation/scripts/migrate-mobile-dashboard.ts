import db from '../src/db/connection';
import { logger } from '../src/utils/logger';

export async function migrateMobileDashboard(): Promise<void> {
  logger.info('Iniciando migração de dashboard mobile');

  try {
    // Create mobile_dashboard_cache table
    db.exec(`
      CREATE TABLE IF NOT EXISTS mobile_dashboard_cache (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        cache_data TEXT NOT NULL,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_expires_at (expires_at)
      )
    `);

    // Create mobile_preferences table
    db.exec(`
      CREATE TABLE IF NOT EXISTS mobile_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        theme TEXT DEFAULT 'auto',
        font_size TEXT DEFAULT 'normal',
        compact_mode BOOLEAN DEFAULT 0,
        auto_sync BOOLEAN DEFAULT 1,
        sync_interval INTEGER DEFAULT 30,
        notifications_enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create mobile_offline_queue table
    db.exec(`
      CREATE TABLE IF NOT EXISTS mobile_offline_queue (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced_at DATETIME,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status)
      )
    `);

    logger.info('✓ Migração de dashboard mobile concluída');
  } catch (error) {
    logger.error({ err: error }, 'Erro na migração de dashboard mobile');
    throw error;
  }
}

if (require.main === module) {
  migrateMobileDashboard().then(() => process.exit(0)).catch(() => process.exit(1));
}

export default migrateMobileDashboard;
