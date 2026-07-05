import { Database } from 'better-sqlite3';
import db from '../src/db/connection';
import { logger } from '../src/utils/logger';

export async function migrateTribunalAdapters(): Promise<void> {
  logger.info('Iniciando migração de configurações de adaptadores de tribunal');

  try {
    // Create tribunal_adapters configuration table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_adapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        api_url TEXT NOT NULL,
        api_type TEXT NOT NULL DEFAULT 'rest',
        is_active BOOLEAN DEFAULT 1,
        requires_auth BOOLEAN DEFAULT 0,
        auth_type TEXT,
        timeout_ms INTEGER DEFAULT 30000,
        max_retries INTEGER DEFAULT 3,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create tribunal_credentials table for sensitive auth data
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        adapter_id INTEGER NOT NULL,
        credential_type TEXT NOT NULL,
        credential_key TEXT NOT NULL,
        credential_value TEXT NOT NULL,
        is_encrypted BOOLEAN DEFAULT 1,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (adapter_id) REFERENCES tribunal_adapters(id) ON DELETE CASCADE,
        UNIQUE(adapter_id, credential_type, credential_key)
      )
    `);

    // Create tribunal_systems mapping table for multi-tribunal support
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_systems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tribunal_code TEXT NOT NULL UNIQUE,
        tribunal_name TEXT NOT NULL,
        adapter_id INTEGER NOT NULL,
        fallback_adapter_id INTEGER,
        region TEXT,
        jurisdiction TEXT,
        supports_petitions BOOLEAN DEFAULT 1,
        supports_queries BOOLEAN DEFAULT 1,
        supports_deadlines BOOLEAN DEFAULT 1,
        is_operational BOOLEAN DEFAULT 1,
        last_health_check DATETIME,
        health_status TEXT DEFAULT 'unknown',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (adapter_id) REFERENCES tribunal_adapters(id),
        FOREIGN KEY (fallback_adapter_id) REFERENCES tribunal_adapters(id)
      )
    `);

    // Create tribunal_endpoints table for customizable API endpoints
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_endpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        adapter_id INTEGER NOT NULL,
        endpoint_type TEXT NOT NULL,
        endpoint_path TEXT NOT NULL,
        http_method TEXT DEFAULT 'GET',
        supports_pagination BOOLEAN DEFAULT 1,
        rate_limit_per_minute INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (adapter_id) REFERENCES tribunal_adapters(id) ON DELETE CASCADE,
        UNIQUE(adapter_id, endpoint_type, endpoint_path)
      )
    `);

    // Create tribunal_health_history table for monitoring
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_health_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tribunal_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        response_time_ms INTEGER,
        error_message TEXT,
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tribunal_id) REFERENCES tribunal_systems(id) ON DELETE CASCADE
      )
    `);

    // Create tribunal_sync_log table for tracking sync operations
    db.exec(`
      CREATE TABLE IF NOT EXISTS tribunal_sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tribunal_id INTEGER NOT NULL,
        sync_type TEXT NOT NULL,
        total_records INTEGER,
        synced_records INTEGER,
        failed_records INTEGER,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        status TEXT DEFAULT 'in_progress',
        error_details TEXT,
        FOREIGN KEY (tribunal_id) REFERENCES tribunal_systems(id) ON DELETE CASCADE
      )
    `);

    // Insert PJe adapters
    const pjeInsert = db.prepare(`
      INSERT OR IGNORE INTO tribunal_adapters
      (code, name, api_url, api_type, requires_auth, auth_type, timeout_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    pjeInsert.run(
      'pje',
      'PJe - Plataforma de Processo Eletrônico',
      process.env.PJE_API_URL || 'https://pje.cnj.jus.br/api',
      'rest',
      1,
      'oauth2',
      30000,
    );

    // Insert eSAJ adapters
    const esajInsert = db.prepare(`
      INSERT OR IGNORE INTO tribunal_adapters
      (code, name, api_url, api_type, requires_auth, auth_type, timeout_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    esajInsert.run(
      'esaj',
      'eSAJ - Tribunal de Justiça',
      process.env.ESAJ_API_URL || 'https://esaj.tjsp.jus.br/webservices',
      'rest',
      0,
      'basic',
      30000,
    );

    // Get adapter IDs
    const getPjeId = db.prepare('SELECT id FROM tribunal_adapters WHERE code = ?');
    const getEsajId = db.prepare('SELECT id FROM tribunal_adapters WHERE code = ?');

    const pjeRow = getPjeId.get('pje') as any;
    const esajRow = getEsajId.get('esaj') as any;

    const pjeId = pjeRow?.id;
    const esajId = esajRow?.id;

    // Insert tribunal systems - PJe systems
    const tribunalInsert = db.prepare(`
      INSERT OR IGNORE INTO tribunal_systems
      (tribunal_code, tribunal_name, adapter_id, region, jurisdiction, supports_petitions, supports_queries, supports_deadlines)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    if (pjeId) {
      tribunalInsert.run(
        'pje-tjal',
        'Tribunal de Justiça de Alagoas (PJe)',
        pjeId,
        'Nordeste',
        'estadual',
        1,
        1,
        1,
      );
      tribunalInsert.run(
        'pje-tjpi',
        'Tribunal de Justiça do Piauí (PJe)',
        pjeId,
        'Nordeste',
        'estadual',
        1,
        1,
        1,
      );
      tribunalInsert.run(
        'pje-tjma',
        'Tribunal de Justiça do Maranhão (PJe)',
        pjeId,
        'Nordeste',
        'estadual',
        1,
        1,
        1,
      );
    }

    // Insert tribunal systems - eSAJ systems
    if (esajId) {
      tribunalInsert.run(
        'esaj-tjsp',
        'Tribunal de Justiça de São Paulo (eSAJ)',
        esajId,
        'Sudeste',
        'estadual',
        1,
        1,
        1,
      );
      tribunalInsert.run(
        'esaj-tjrs',
        'Tribunal de Justiça do Rio Grande do Sul (eSAJ)',
        esajId,
        'Sul',
        'estadual',
        1,
        1,
        1,
      );
      tribunalInsert.run(
        'esaj-tjmg',
        'Tribunal de Justiça de Minas Gerais (eSAJ)',
        esajId,
        'Sudeste',
        'estadual',
        1,
        1,
        1,
      );
    }

    // Insert endpoints for PJe adapter
    const endpointInsert = db.prepare(`
      INSERT OR IGNORE INTO tribunal_endpoints
      (adapter_id, endpoint_type, endpoint_path, http_method, supports_pagination, rate_limit_per_minute)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    if (pjeId) {
      endpointInsert.run(
        pjeId,
        'search_process',
        '/consultas/processo',
        'GET',
        0,
        120,
      );
      endpointInsert.run(
        pjeId,
        'search_party',
        '/consultas/partes',
        'GET',
        1,
        100,
      );
      endpointInsert.run(
        pjeId,
        'submit_petition',
        '/peticionamento/registrar',
        'POST',
        0,
        60,
      );
      endpointInsert.run(
        pjeId,
        'get_deadlines',
        '/processo/{processNumber}/prazos',
        'GET',
        0,
        120,
      );
      endpointInsert.run(pjeId, 'health', '/health', 'GET', 0, 1000);
    }

    // Insert endpoints for eSAJ adapter
    if (esajId) {
      endpointInsert.run(
        esajId,
        'search_process',
        '/consultarprocesso',
        'POST',
        0,
        120,
      );
      endpointInsert.run(
        esajId,
        'search_party',
        '/consultarpartes',
        'POST',
        1,
        100,
      );
      endpointInsert.run(
        esajId,
        'submit_petition',
        '/protocolarpdocumento',
        'POST',
        0,
        60,
      );
      endpointInsert.run(
        esajId,
        'get_deadlines',
        '/consultarprazos',
        'POST',
        0,
        120,
      );
      endpointInsert.run(esajId, 'health', '/status', 'GET', 0, 1000);
    }

    // Create indexes for performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tribunal_adapters_code ON tribunal_adapters(code);
      CREATE INDEX IF NOT EXISTS idx_tribunal_systems_code ON tribunal_systems(tribunal_code);
      CREATE INDEX IF NOT EXISTS idx_tribunal_systems_adapter ON tribunal_systems(adapter_id);
      CREATE INDEX IF NOT EXISTS idx_tribunal_credentials_adapter ON tribunal_credentials(adapter_id);
      CREATE INDEX IF NOT EXISTS idx_tribunal_endpoints_adapter ON tribunal_endpoints(adapter_id);
      CREATE INDEX IF NOT EXISTS idx_tribunal_health_history_tribunal ON tribunal_health_history(tribunal_id);
      CREATE INDEX IF NOT EXISTS idx_tribunal_health_history_checked ON tribunal_health_history(checked_at);
      CREATE INDEX IF NOT EXISTS idx_tribunal_sync_log_tribunal ON tribunal_sync_log(tribunal_id);
      CREATE INDEX IF NOT EXISTS idx_tribunal_sync_log_status ON tribunal_sync_log(status);
    `);

    logger.info('✓ Migração de adaptadores de tribunal concluída com sucesso');
    logger.info('  - Tabelas criadas: 7');
    logger.info('  - Adaptadores registrados: 2 (PJe, eSAJ)');
    logger.info('  - Sistemas de tribunal registrados: 6');
  } catch (error) {
    logger.error({ err: error }, 'Erro ao executar migração de adaptadores');
    throw error;
  }
}

// Execute migration if run directly
if (require.main === module) {
  migrateTribunalAdapters()
    .then(() => {
      logger.info('Migração finalizada com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ err: error }, 'Falha na migração');
      process.exit(1);
    });
}

export default migrateTribunalAdapters;
