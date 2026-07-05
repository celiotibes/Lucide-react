import { Pool } from 'pg';
import { logger } from '@utils/logger';

let testPool: Pool | null = null;

export const setupTestDatabase = async () => {
  try {
    const testDbUrl = process.env.TEST_DATABASE_URL || 'postgresql://legaluser:legalpass@localhost:5432/legal_automation_test';

    testPool = new Pool({
      connectionString: testDbUrl,
    });

    logger.info('Test database pool created');

    // Test the connection
    const client = await testPool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('Test database connection verified');
  } catch (error) {
    logger.error({ err: error }, 'Failed to setup test database');
    throw error;
  }
};

export const cleanupTestDatabase = async () => {
  if (testPool) {
    await testPool.end();
    testPool = null;
    logger.info('Test database pool closed');
  }
};

export const getTestDatabase = () => {
  if (!testPool) {
    throw new Error('Test database not initialized');
  }
  return testPool;
};

export const resetTestDatabase = async () => {
  const pool = getTestDatabase();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop tables in reverse order
    await client.query('DROP TABLE IF EXISTS audit_logs CASCADE');
    await client.query('DROP TABLE IF EXISTS documents CASCADE');
    await client.query('DROP TABLE IF EXISTS processes CASCADE');
    await client.query('DROP TABLE IF EXISTS petitions CASCADE');
    await client.query('DROP TABLE IF EXISTS sessions CASCADE');
    await client.query('DROP TABLE IF EXISTS users CASCADE');

    // Recreate tables
    await client.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        oab_number VARCHAR(50) NOT NULL,
        oab_state VARCHAR(2) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        certificate_fingerprint VARCHAR(255),
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_oab ON users(oab_number, oab_state);
    `);

    await client.query(`
      CREATE TABLE sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(1024) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
    `);

    await client.query(`
      CREATE TABLE petitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        process_number VARCHAR(50),
        tribunal VARCHAR(50),
        title VARCHAR(500),
        content TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        validation_score INTEGER,
        generated_by VARCHAR(50),
        signed_at TIMESTAMP,
        submitted_at TIMESTAMP,
        protocol_number VARCHAR(255),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_petitions_user_id ON petitions(user_id);
      CREATE INDEX idx_petitions_status ON petitions(status);
      CREATE INDEX idx_petitions_process_number ON petitions(process_number);
    `);

    await client.query(`
      CREATE TABLE processes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        process_number VARCHAR(50) NOT NULL UNIQUE,
        cnj VARCHAR(50),
        tribunal VARCHAR(50),
        status VARCHAR(100),
        plaintiff VARCHAR(500),
        defendant VARCHAR(500),
        subject VARCHAR(500),
        last_movement TIMESTAMP,
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_processes_process_number ON processes(process_number);
      CREATE INDEX idx_processes_tribunal ON processes(tribunal);
    `);

    await client.query(`
      CREATE TABLE documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        petition_id UUID NOT NULL REFERENCES petitions(id) ON DELETE CASCADE,
        filename VARCHAR(255),
        file_path VARCHAR(500),
        file_size INTEGER,
        mime_type VARCHAR(100),
        uploaded_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_documents_petition_id ON documents(petition_id);
      CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
    `);

    await client.query(`
      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(255),
        details JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
      CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
    `);

    await client.query('COMMIT');
    logger.info('Test database reset successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ err: error }, 'Failed to reset test database');
    throw error;
  } finally {
    client.release();
  }
};
