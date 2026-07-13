/**
 * Database Migration Template
 * 
 * Arquivo: backend/db/migrations/YYYYMMDDHHMMSS_descriptive_name.ts
 * 
 * Naming Convention: YYYYMMDDHHMMSS_snake_case_description.ts
 * Exemplo: 20240115120000_create_users_table.ts
 * 
 * Para criar nova migration:
 * 1. Copiar este template
 * 2. Renomear com timestamp e descrição
 * 3. Implementar up() e down()
 * 4. Testar: npm run migrate -- up
 * 5. Testar rollback: npm run migrate -- down
 */

import { Pool } from 'pg';

interface MigrationContext {
  pool: Pool;
  logger: any;
}

/**
 * Migrate up (aplicar mudanças)
 * Executado quando: npm run migrate -- up
 */
export async function up(context: MigrationContext): Promise<void> {
  const { pool, logger } = context;
  
  logger.info('Migrating up: 00_MIGRATION_TEMPLATE');
  
  // Começar transação
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // ========================================
    // Implementar aqui
    // ========================================
    
    // Exemplo: Criar tabela
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Exemplo: Criar índice
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    
    // Exemplo: Inserir dados iniciais
    await client.query(`
      INSERT INTO users (email, password_hash, name, role)
      VALUES (
        'admin@example.com',
        'hashed_password_here',
        'Admin User',
        'admin'
      )
      ON CONFLICT (email) DO NOTHING;
    `);
    
    // ========================================
    
    await client.query('COMMIT');
    logger.info('Migration up completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration up failed', { error });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Migrate down (reverter mudanças)
 * Executado quando: npm run migrate -- down
 */
export async function down(context: MigrationContext): Promise<void> {
  const { pool, logger } = context;
  
  logger.info('Migrating down: 00_MIGRATION_TEMPLATE');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // ========================================
    // IMPORTANTE: Reverter operações de "up"
    // em ordem inversa (FIFO)
    // ========================================
    
    // Remover dados (se necessário)
    await client.query(`
      DELETE FROM users WHERE email = 'admin@example.com';
    `);
    
    // Remover índices
    await client.query(`
      DROP INDEX IF EXISTS idx_users_email;
    `);
    
    // Remover tabelas
    await client.query(`
      DROP TABLE IF EXISTS users;
    `);
    
    // ========================================
    
    await client.query('COMMIT');
    logger.info('Migration down completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration down failed', { error });
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// EXEMPLOS DE MIGRAÇÕES COMUNS
// ============================================================================

/**
 * Exemplo 1: Criar tabela com constraints
 */
const EXAMPLE_CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS properties (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  bedrooms INT CHECK (bedrooms > 0),
  bathrooms INT CHECK (bathrooms > 0),
  max_guests INT CHECK (max_guests > 0),
  price_per_night DECIMAL(10, 2) NOT NULL CHECK (price_per_night > 0),
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, address, city)
);
`;

/**
 * Exemplo 2: Adicionar coluna com default
 */
const EXAMPLE_ADD_COLUMN = `
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS cancellation_policy VARCHAR(50) DEFAULT 'flexible';

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS minimum_stay INT DEFAULT 1;

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS maximum_stay INT DEFAULT 365;
`;

/**
 * Exemplo 3: Criar índice para performance
 */
const EXAMPLE_CREATE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties(created_at DESC);
`;

/**
 * Exemplo 4: Criar vista materializada
 */
const EXAMPLE_MATERIALIZED_VIEW = `
CREATE MATERIALIZED VIEW IF NOT EXISTS property_stats AS
SELECT
  p.id,
  p.user_id,
  COUNT(DISTINCT l.id) as total_listings,
  COUNT(DISTINCT ld.id) as total_leads,
  AVG(pr.nightly_rate) as avg_price,
  MAX(pr.updated_at) as last_price_update
FROM properties p
LEFT JOIN listings l ON p.id = l.property_id
LEFT JOIN leads ld ON p.id = ld.property_id
LEFT JOIN pricing pr ON p.id = pr.property_id
GROUP BY p.id, p.user_id;

CREATE INDEX idx_property_stats_user_id ON property_stats(user_id);
`;

/**
 * Exemplo 5: Modificar tipo de coluna
 */
const EXAMPLE_ALTER_COLUMN_TYPE = `
-- Safe way to change column type
ALTER TABLE properties
ALTER COLUMN latitude TYPE NUMERIC(10, 8);

ALTER TABLE properties
ALTER COLUMN longitude TYPE NUMERIC(11, 8);
`;

/**
 * Exemplo 6: Adicionar constraint
 */
const EXAMPLE_ADD_CONSTRAINT = `
ALTER TABLE users
ADD CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');

ALTER TABLE properties
ADD CONSTRAINT chk_coordinates CHECK (
  (latitude IS NULL AND longitude IS NULL) OR
  (latitude IS NOT NULL AND longitude IS NOT NULL)
);
`;

/**
 * Exemplo 7: Dados iniciais (seed)
 */
const EXAMPLE_INSERT_DATA = `
INSERT INTO users (email, password_hash, name, role)
VALUES
  ('admin@example.com', 'hash1', 'Administrator', 'admin'),
  ('support@example.com', 'hash2', 'Support Team', 'support_agent')
ON CONFLICT (email) DO NOTHING;
`;

/**
 * Exemplo 8: Renomear tabela/coluna
 */
const EXAMPLE_RENAME = `
-- Renomear tabela
ALTER TABLE old_table_name RENAME TO new_table_name;

-- Renomear coluna
ALTER TABLE users RENAME COLUMN phone_number TO phone;
`;

/**
 * Exemplo 9: Trigger para audit
 */
const EXAMPLE_CREATE_TRIGGER = `
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_properties_updated_at
BEFORE UPDATE ON properties
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
`;

/**
 * Exemplo 10: Dados em bulk
 */
const EXAMPLE_BULK_INSERT = `
-- Usando COPY é mais eficiente que INSERT múltiplos
\COPY properties (user_id, title, description, address, city, country, bedrooms, bathrooms)
FROM STDIN WITH (FORMAT CSV, HEADER);
1,"Nice Apartment","Beautiful place","123 Main St","NYC","USA",2,1
2,"Cozy Studio","Modern studio","456 Park Ave","LA","USA",1,1
\.
`;

export default { up, down };
