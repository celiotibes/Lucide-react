/**
 * Database Initialization Module
 * Phase 2: Sets up better-sqlite3 database, runs migrations, and seeds initial data
 */

import Database from "better-sqlite3";
import { logger } from './services/logger-service.js';
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { matrizPadrao } from "./domain/auth/permissoes.js";
import { migrarPapeisUsuarios } from "./migrations/migrar-papeis-usuarios.js";
import { migrarTiposAcaoAuditoria } from "./migrations/migrar-tipos-acao-auditoria.js";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the SQLite database file
const DB_PATH = path.join(process.cwd(), "data", "app.db");

// Ensure data directory exists
const DATA_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let dbInstance: Database.Database | null = null;

/**
 * Initialize the database connection
 * - Creates or opens existing database
 * - Runs Phase 2 migrations if needed
 * - Seeds initial test data
 * - Enables WAL mode for better concurrency
 */
export function initializeDatabase(): Database.Database {
  // Return existing instance if already initialized
  if (dbInstance) {
    return dbInstance;
  }

  try {
    // Open or create database
    const db = new Database(DB_PATH);

    // Enable WAL mode for better concurrency and crash recovery
    db.pragma("journal_mode = WAL");

    // Enable foreign keys
    db.pragma("foreign_keys = ON");

    // Set timeout for lock contention
    db.pragma("busy_timeout = 5000");

    logger.info(`[Database] Connected to ${DB_PATH}`);

    // Check if migrations have been run
    const migrationRunStmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'"
    );
    const usersTableExists = migrationRunStmt.get();

    if (!usersTableExists) {
      logger.info("[Database] Running Phase 2 migrations...");
      runMigrations(db);
      seedInitialData(db);
      logger.info("[Database] Migrations and seed data completed");
    } else {
      logger.info("[Database] Schema already initialized");
    }

    // Migração de papéis para usuários externos (inquilino, prestador) — aplicada em todo
    // boot, idempotente (verifica o CHECK antes de fazer alterações).
    migrarPapeisUsuarios(db);
    migrarTiposAcaoAuditoria(db);

    // Fases 3+ (integrações Asaas/MeuPluggy/bot Telegram, vínculos externos de Telegram, e
    // o que vier depois): aplicadas em TODO boot, não só na primeira vez — ver cabeçalho de
    // cada arquivo. Lista cresce a cada fase nova; nenhuma reescreve o que já existe.
    runMigracoesIdempotentes(db, [
      "migrations-phase3-integracoes.sql",
      "migrations-phase4-vinculos-externos.sql",
      "migrations-phase4.1-anomalias.sql",
      "migrations-phase5-lembretes-agendados.sql",
      "migrations-phase6-analytics-completa.sql",
      "migrations-phase6-relatorios-dre.sql",
      "migrations-phase7-margens-propriedades.sql",
      "migrations-phase7-relatorio-executivo.sql",
      "migrations-phase8-asaas-reembolsos.sql",
      "migrations-phase8-reconciliacao-asaas.sql",
      "migrations-phase8-conciliacao-pix-ofx.sql",
      "migrations-phase9-pagamentos-pix-proativos.sql",
      "migrations-phase10-assinatura-lgpd.sql",
      "migrations-phase11-performance-indexes.sql",
      "migrations-phase12-asaas-webhook-dedup.sql",
      "migrations-phase12-imutabilidade.sql",
      "migrations-phase13-acl-recursos.sql",
      "migrations-phase14-portal-inquilino.sql",
      "migrations-phase15-prestador-apontamentos.sql",
      "migrations-phase16-ledger-entries.sql",
      "migrations-phase16-revisao-ia.sql",
      "migrations-phase17-importacao.sql",
      "migrations-phase18-agentes-economicos-sqlite.sql",
      "migrations-phase18-ocr-extraction.sql",
      "migrations-phase19-reconciliation.sql",
      "migrations-phase19-ledger-agentes-fk-sqlite.sql",
      "migrations-phase20-agentes-deduplicacao-sqlite.sql",
      "migrations-phase21-setup-wizard-config.sql",
      "migrations-phase22-ai-analytics.sql",
      "migrations-phase22-reports.sql",
      "migrations-phase22-properties.sql",
    ]);

    // Adicionar colunas opcionais de forma idempotente (Phase 19 e 20)
    ensurePhase19Columns(db);
    ensurePhase20Columns(db);

    // Setup periodic cleanup of expired sessions
    setupSessionCleanup(db);

    dbInstance = db;
    return db;
  } catch (erro) {
    logger.error("[Database] Initialization failed:", erro);
    throw new Error(
      `Failed to initialize database: ${erro instanceof Error ? erro.message : String(erro)}`
    );
  }
}

/**
 * Tabelas de fases pós-auth (integrações, vínculos externos, etc.), aplicadas em todo
 * boot (idempotente — cada arquivo só usa CREATE TABLE/INDEX IF NOT EXISTS, ver
 * cabeçalho de cada um).
 */
function runMigracoesIdempotentes(db: Database.Database, arquivos: string[]): void {
  for (const nomeArquivo of arquivos) {
    const migrationPath = path.join(__dirname, nomeArquivo);
    if (!fs.existsSync(migrationPath)) {
      logger.warn(`[Database] Migração não encontrada em ${migrationPath}, pulando`);
      continue;
    }
    db.exec(fs.readFileSync(migrationPath, "utf-8"));
  }
}

/**
 * Run Phase 2 migrations from SQL file
 */
function runMigrations(db: Database.Database): void {
  try {
    // Read migration SQL file
    const migrationPath = path.join(
      __dirname,
      "migrations-phase2-auth.sql"
    );

    if (!fs.existsSync(migrationPath)) {
      throw new Error(
        `Migration file not found: ${migrationPath}`
      );
    }

    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // Try executing the full migration script first
    try {
      db.exec(migrationSQL);
      logger.info("[Database] Migration script executed successfully");
    } catch {
      // If that fails, try splitting and executing one by one
      // This helps identify and skip problematic statements
      const statements = migrationSQL
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--") && !s.startsWith("/*"));

      let executedCount = 0;
      for (const statement of statements) {
        try {
          db.exec(statement);
          executedCount++;
        } catch (stmtError) {
          // Ignore "already exists" errors (idempotent migrations)
          if (stmtError instanceof Error && stmtError.message.includes("already exists")) {
            executedCount++;
          } else {
            logger.error("[Database] Failed to execute:", statement.substring(0, 80));
            throw stmtError;
          }
        }
      }

      logger.info("[Database] Executed", executedCount, "migration statements");
    }
  } catch (erro) {
    throw new Error(
      `Migration failed: ${erro instanceof Error ? erro.message : String(erro)}`
    );
  }
}

/**
 * Seed initial data.
 *
 * Fase 1 (auth real): este arquivo já criou aqui 3 usuários demo
 * (admin/gestor/prestador) com um hash placeholder que nunca foi
 * criptograficamente válido (o código antigo comparava a senha em texto
 * puro contra a constante "senha123", nunca esta coluna). Removido de
 * propósito — ver a mesma nota em migrations-phase2-auth.sql: seedar um
 * usuário titular com senha pública e conhecida em TODA instalação nova
 * (inclusive produção) seria recriar o mesmo problema que esta fase
 * corrigiu, só que na semente em vez do comparador. O primeiro usuário
 * titular agora nasce via `POST /api/auth/bootstrap`
 * (`AuthServiceDB.bootstrapTitular`), que só funciona uma vez e exige senha
 * escolhida por quem instala. Os parâmetros de contrato padrão abaixo não
 * são dado de autenticação — continuam sendo seedados normalmente.
 */
function seedInitialData(db: Database.Database): void {
  try {
    // Insert default contract parameters for current month
    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const insertParamsStmt = db.prepare(
      `INSERT OR IGNORE INTO parametros_contrato
       (mes_referencia, diaria_base, valor_km, reajuste_percentual, data_vigencia, ativo, criado_em)
       VALUES (?, ?, ?, ?, ?, true, CURRENT_TIMESTAMP)`
    );

    insertParamsStmt.run(
      mesAtual,
      150.00, // R$ 150 daily rate
      2.50,   // R$ 2.50 per km
      0,      // No adjustment
      now.toISOString().split("T")[0]
    );

    logger.info("[Database] Seeded default contract parameters");

    seedMatrizPermissoesPadrao(db);
  } catch (erro) {
    throw new Error(
      `Seed data insertion failed: ${erro instanceof Error ? erro.message : String(erro)}`
    );
  }
}

/**
 * Seeda a matriz de permissões (papel × função) com os defaults de
 * `matrizPadrao()` — TODA combinação (6 papéis × 14 funções) fica com uma
 * linha desde o início, para `GET /api/auth/permissoes` nunca precisar
 * "inventar" um default em memória para uma combinação ausente. Usa
 * `INSERT OR IGNORE`, mesmo padrão de `insertParamsStmt` acima — idempotente
 * se rodar mais de uma vez (não deveria, já que só é chamada dentro do
 * `if (!usersTableExists)` de `initializeDatabase`, mas não custa a
 * segurança extra). `atualizado_por` fica NULL: ninguém "alterou" essas
 * linhas, nasceram assim no boot.
 */
function seedMatrizPermissoesPadrao(db: Database.Database): void {
  const inserir = db.prepare(
    `INSERT OR IGNORE INTO permissoes_papel (papel, funcao, habilitado, limite_valor, atualizado_em, atualizado_por)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)`,
  );
  const executarLote = db.transaction((entradas: ReturnType<typeof matrizPadrao>) => {
    for (const entrada of entradas) {
      inserir.run(entrada.papel, entrada.funcao, entrada.habilitado ? 1 : 0, entrada.limite_valor);
    }
  });
  executarLote(matrizPadrao());
  logger.info("[Database] Seeded default permission matrix (papel × função)");
}

/**
 * Setup periodic cleanup of expired sessions
 * Runs every 1 hour to clean up old sessions
 */
function setupSessionCleanup(db: Database.Database): void {
  try {
    // Clean up expired sessions immediately
    cleanupExpiredSessions(db);

    // Setup periodic cleanup (every hour)
    const cleanupInterval = setInterval(() => {
      try {
        const deleted = cleanupExpiredSessions(db);
        if (deleted > 0) {
          logger.info(`[Database] Cleaned ${deleted} expired sessions`);
        }
      } catch (erro) {
        logger.error("[Database] Session cleanup error:", erro);
      }
    }, 60 * 60 * 1000); // Every hour

    // Don't keep this interval alive on process exit
    cleanupInterval.unref();

    logger.info("[Database] Session cleanup scheduled");
  } catch (erro) {
    logger.error("[Database] Failed to setup session cleanup:", erro);
    // Don't fail the whole app, just warn
  }
}

/**
 * Clean up expired sessions from database
 */
export function cleanupExpiredSessions(db: Database.Database): number {
  try {
    const stmt = db.prepare(
      "DELETE FROM sessoes WHERE data_expiracao < CURRENT_TIMESTAMP"
    );
    const result = stmt.run();
    return result.changes || 0;
  } catch (erro) {
    logger.error("[Database] Error cleaning expired sessions:", erro);
    return 0;
  }
}

/**
 * Adiciona colunas para Phase 19 de forma idempotente
 * SQLite não suporta IF NOT EXISTS em ALTER TABLE, então usa PRAGMA table_info para verificar
 */
function ensurePhase19Columns(db: Database.Database): void {
  try {
    // Verificar se as colunas já existem usando PRAGMA table_info
    const columns = db
      .prepare("PRAGMA table_info(ledger_entries)")
      .all() as Array<{ name: string }>;

    const columnNames = columns.map((c: { name: string }) => c.name);

    // Adicionar coluna agente_id se não existir
    if (!columnNames.includes("agente_id")) {
      try {
        db.exec("ALTER TABLE ledger_entries ADD COLUMN agente_id TEXT");
        logger.info("[Database] Added column agente_id to ledger_entries");
      } catch (e) {
        if (!(e instanceof Error && e.message.includes("duplicate column"))) {
          logger.warn("[Database] Could not add agente_id column:", e instanceof Error ? e.message : String(e));
        }
      }
    }

    // Adicionar coluna agente_papel se não existir
    if (!columnNames.includes("agente_papel")) {
      try {
        db.exec("ALTER TABLE ledger_entries ADD COLUMN agente_papel TEXT");
        logger.info("[Database] Added column agente_papel to ledger_entries");
      } catch (e) {
        if (!(e instanceof Error && e.message.includes("duplicate column"))) {
          logger.warn("[Database] Could not add agente_papel column:", e instanceof Error ? e.message : String(e));
        }
      }
    }

    // Adicionar coluna referencia_agente_externo se não existir
    if (!columnNames.includes("referencia_agente_externo")) {
      try {
        db.exec("ALTER TABLE ledger_entries ADD COLUMN referencia_agente_externo TEXT");
        logger.info("[Database] Added column referencia_agente_externo to ledger_entries");
      } catch (e) {
        if (!(e instanceof Error && e.message.includes("duplicate column"))) {
          logger.warn("[Database] Could not add referencia_agente_externo column:", e instanceof Error ? e.message : String(e));
        }
      }
    }

    // Adicionar coluna backfill_em se não existir
    if (!columnNames.includes("backfill_em")) {
      try {
        db.exec("ALTER TABLE ledger_entries ADD COLUMN backfill_em TIMESTAMP");
        logger.info("[Database] Added column backfill_em to ledger_entries");
      } catch (e) {
        if (!(e instanceof Error && e.message.includes("duplicate column"))) {
          logger.warn("[Database] Could not add backfill_em column:", e instanceof Error ? e.message : String(e));
        }
      }
    }

    // Adicionar coluna agente_atualizado_em se não existir
    if (!columnNames.includes("agente_atualizado_em")) {
      try {
        db.exec("ALTER TABLE ledger_entries ADD COLUMN agente_atualizado_em TIMESTAMP");
        logger.info("[Database] Added column agente_atualizado_em to ledger_entries");
      } catch (e) {
        if (!(e instanceof Error && e.message.includes("duplicate column"))) {
          logger.warn("[Database] Could not add agente_atualizado_em column:", e instanceof Error ? e.message : String(e));
        }
      }
    }

    // Adicionar coluna agente_atualizado_por se não existir
    if (!columnNames.includes("agente_atualizado_por")) {
      try {
        db.exec("ALTER TABLE ledger_entries ADD COLUMN agente_atualizado_por TEXT");
        logger.info("[Database] Added column agente_atualizado_por to ledger_entries");
      } catch (e) {
        if (!(e instanceof Error && e.message.includes("duplicate column"))) {
          logger.warn("[Database] Could not add agente_atualizado_por column:", e instanceof Error ? e.message : String(e));
        }
      }
    }
  } catch (erro) {
    logger.warn("[Database] Error checking Phase 19 columns:", erro instanceof Error ? erro.message : String(erro));
  }
}

/**
 * Get the database instance
 * Must call initializeDatabase() first
 */
/**
 * Adiciona colunas opcionais para Phase 20 de forma idempotente
 * SQLite não suporta IF NOT EXISTS em ALTER TABLE em todas as versões
 */
function ensurePhase20Columns(db: Database.Database): void {
  try {
    // Verificar se as colunas já existem usando PRAGMA table_info
    const columns = db
      .prepare("PRAGMA table_info(agentes_duplicatas_suspeitas)")
      .all() as Array<{ name: string }>;

    const columnNames = columns.map((c: { name: string }) => c.name);

    // Adicionar coluna revisao_notas se não existir
    if (!columnNames.includes("revisao_notas")) {
      try {
        db.exec("ALTER TABLE agentes_duplicatas_suspeitas ADD COLUMN revisao_notas TEXT");
        logger.info("[Database] Added column revisao_notas to agentes_duplicatas_suspeitas");
      } catch (e) {
        if (!(e instanceof Error && e.message.includes("duplicate column"))) {
          logger.warn("[Database] Could not add revisao_notas column:", e instanceof Error ? e.message : String(e));
        }
      }
    }

    // Adicionar coluna merge_data se não existir
    if (!columnNames.includes("merge_data")) {
      try {
        db.exec("ALTER TABLE agentes_duplicatas_suspeitas ADD COLUMN merge_data TIMESTAMP");
        logger.info("[Database] Added column merge_data to agentes_duplicatas_suspeitas");
      } catch (e) {
        if (!(e instanceof Error && e.message.includes("duplicate column"))) {
          logger.warn("[Database] Could not add merge_data column:", e instanceof Error ? e.message : String(e));
        }
      }
    }
  } catch (erro) {
    logger.warn("[Database] Error checking Phase 20 columns:", erro instanceof Error ? erro.message : String(erro));
  }
}

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first."
    );
  }
  return dbInstance;
}

/**
 * Close database connection (for graceful shutdown)
 */
export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
      dbInstance = null;
      logger.info("[Database] Connection closed");
    } catch (erro) {
      logger.error("[Database] Error closing connection:", erro);
    }
  }
}

/**
 * Get database file path (useful for testing)
 */
export function getDatabasePath(): string {
  return DB_PATH;
}
