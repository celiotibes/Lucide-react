import dotenv from 'dotenv';
import path from 'path';
import { pool } from '@/database/connection';
import { logger } from '@utils/logger';

dotenv.config();

const runMigrations = async () => {
  const client = await pool.connect();

  try {
    logger.info('Iniciando migrações do banco de dados...');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
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
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_oab ON users(oab_number, oab_state);
    `);
    logger.info('✓ Tabela usuarios criada/verificada');

    // Sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(1024) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `);
    logger.info('✓ Tabela sessions criada/verificada');

    // Petitions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS petitions (
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
      CREATE INDEX IF NOT EXISTS idx_petitions_user_id ON petitions(user_id);
      CREATE INDEX IF NOT EXISTS idx_petitions_status ON petitions(status);
      CREATE INDEX IF NOT EXISTS idx_petitions_process_number ON petitions(process_number);
    `);
    logger.info('✓ Tabela petitions criada/verificada');

    // Processes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS processes (
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
      CREATE INDEX IF NOT EXISTS idx_processes_process_number ON processes(process_number);
      CREATE INDEX IF NOT EXISTS idx_processes_tribunal ON processes(tribunal);
    `);
    logger.info('✓ Tabela processes criada/verificada');

    // Documents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        petition_id UUID NOT NULL REFERENCES petitions(id) ON DELETE CASCADE,
        filename VARCHAR(255),
        file_path VARCHAR(500),
        file_size INTEGER,
        mime_type VARCHAR(100),
        uploaded_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_documents_petition_id ON documents(petition_id);
      CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
    `);
    logger.info('✓ Tabela documents criada/verificada');

    // Audit logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
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
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    `);
    logger.info('✓ Tabela audit_logs criada/verificada');

    logger.info('✅ Todas as migrações executadas com sucesso!');
  } catch (error) {
    logger.error({ err: error }, 'Erro ao executar migrações');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

runMigrations();
