/**
 * Migration: Add Multi-Platform Support
 * Adiciona suporte para Hospeda, Booking Apartments e TripAdvisor
 * 
 * Up: npx ts-node scripts/migrate.ts up
 * Down: npx ts-node scripts/migrate.ts down
 */

import { Pool, QueryResult } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query('BEGIN');

  try {
    // 1. Expandir tabela user_integrations (já existe, adicionar campos)
    await pool.query(`
      ALTER TABLE user_integrations
      ADD COLUMN IF NOT EXISTS auth_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(20) DEFAULT 'never',
      ADD COLUMN IF NOT EXISTS sync_count INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS error_count INT DEFAULT 0;
    `);

    // 2. Expandir property_listings com novos campos
    await pool.query(`
      ALTER TABLE property_listings
      ADD COLUMN IF NOT EXISTS property_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS minimum_stay INT DEFAULT 1,
      ADD COLUMN IF NOT EXISTS cancellation_policy VARCHAR(50) DEFAULT 'moderate',
      ADD COLUMN IF NOT EXISTS platform_specific_data JSONB;
    `);

    // 3. Criar índices para property_type
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_property_type 
      ON property_listings(property_type);
    `);

    // 4. Tabela de pricing por data (Booking Apartments feature)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_pricing_by_date (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_id UUID NOT NULL REFERENCES property_listings(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        nightly_rate DECIMAL(10,2) NOT NULL,
        min_stay INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(listing_id, date)
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_listing_date 
      ON platform_pricing_by_date(listing_id, date);
    `);

    // 5. Tabela de bloqueios de calendário
    await pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_blocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        block_type VARCHAR(20),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason TEXT,
        external_booking_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_calendar_property_dates 
      ON calendar_blocks(property_id, start_date, end_date);
    `);

    // 6. Tabela de ratings por plataforma
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_ratings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        platform VARCHAR(50) NOT NULL,
        external_id VARCHAR(255),
        rating DECIMAL(3,2) NOT NULL,
        review_count INT DEFAULT 0,
        review_text TEXT,
        reviewer_name VARCHAR(255),
        reviewer_id VARCHAR(255),
        sentiment VARCHAR(20),
        response_text TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        synced_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(platform, external_id)
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_platform_ratings_property 
      ON platform_ratings(property_id, platform);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_platform_ratings_synced 
      ON platform_ratings(synced_at DESC);
    `);

    // 7. Tabela de webhooks
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform VARCHAR(50) NOT NULL,
        webhook_url VARCHAR(2048) NOT NULL,
        webhook_secret VARCHAR(255) NOT NULL,
        events_subscribed JSONB,
        is_active BOOLEAN DEFAULT true,
        last_delivery_at TIMESTAMP,
        last_delivery_status INT,
        delivery_failures INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, platform)
      );
    `);

    // 8. Expandir sync_history com platform_specific_data
    await pool.query(`
      ALTER TABLE sync_history
      ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_next_retry 
      ON sync_history(status, next_retry_at) 
      WHERE status = 'failed';
    `);

    await pool.query('COMMIT');

    console.log('✅ Migration up completed successfully');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('BEGIN');

  try {
    // Remover tabelas novas
    await pool.query('DROP TABLE IF EXISTS webhooks CASCADE;');
    await pool.query('DROP TABLE IF EXISTS platform_ratings CASCADE;');
    await pool.query('DROP TABLE IF EXISTS calendar_blocks CASCADE;');
    await pool.query('DROP TABLE IF EXISTS platform_pricing_by_date CASCADE;');

    // Remover colunas de property_listings
    await pool.query(`
      ALTER TABLE property_listings
      DROP COLUMN IF EXISTS property_type,
      DROP COLUMN IF EXISTS minimum_stay,
      DROP COLUMN IF EXISTS cancellation_policy,
      DROP COLUMN IF EXISTS platform_specific_data;
    `);

    // Remover colunas de user_integrations
    await pool.query(`
      ALTER TABLE user_integrations
      DROP COLUMN IF EXISTS auth_expires_at,
      DROP COLUMN IF EXISTS last_sync_at,
      DROP COLUMN IF EXISTS last_sync_status,
      DROP COLUMN IF EXISTS sync_count,
      DROP COLUMN IF EXISTS error_count;
    `);

    // Remover colunas de sync_history
    await pool.query(`
      ALTER TABLE sync_history
      DROP COLUMN IF EXISTS retry_count,
      DROP COLUMN IF EXISTS next_retry_at;
    `);

    await pool.query('COMMIT');

    console.log('✅ Migration down completed successfully');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}
