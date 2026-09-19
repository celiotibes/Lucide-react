/**
 * Database Initialization Module
 * Phase 2: Sets up better-sqlite3 database, runs migrations, and seeds initial data
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

    console.log(`[Database] Connected to ${DB_PATH}`);

    // Check if migrations have been run
    const migrationRunStmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'"
    );
    const usersTableExists = migrationRunStmt.get();

    if (!usersTableExists) {
      console.log("[Database] Running Phase 2 migrations...");
      runMigrations(db);
      seedInitialData(db);
      console.log("[Database] Migrations and seed data completed");
    } else {
      console.log("[Database] Schema already initialized");
    }

    // Setup periodic cleanup of expired sessions
    setupSessionCleanup(db);

    dbInstance = db;
    return db;
  } catch (erro) {
    console.error("[Database] Initialization failed:", erro);
    throw new Error(
      `Failed to initialize database: ${erro instanceof Error ? erro.message : String(erro)}`
    );
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
      console.log("[Database] Migration script executed successfully");
    } catch (error) {
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
            console.error("[Database] Failed to execute:", statement.substring(0, 80));
            throw stmtError;
          }
        }
      }

      console.log("[Database] Executed", executedCount, "migration statements");
    }
  } catch (erro) {
    throw new Error(
      `Migration failed: ${erro instanceof Error ? erro.message : String(erro)}`
    );
  }
}

/**
 * Seed initial test data (admin, gestor, prestador users)
 * Uses placeholder password hashes - in production these should be set properly
 */
function seedInitialData(db: Database.Database): void {
  try {
    // Check if test users already exist
    const checkStmt = db.prepare("SELECT COUNT(*) as count FROM usuarios");
    const result = checkStmt.get() as { count: number };

    if (result.count > 0) {
      console.log("[Database] Users already seeded");
      return;
    }

    // Insert test users (with placeholder hashes - should be bcrypt in production)
    const insertUserStmt = db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES (?, ?, ?, ?, ?, true, '2026-01-01')`
    );

    // Password: senha123 (placeholder)
    insertUserStmt.run(
      "user_admin_1",
      "Admin User",
      "admin@example.com",
      "$2b$12$placeholder_hash_admin",
      "admin"
    );

    insertUserStmt.run(
      "user_gestor_1",
      "Gestor User",
      "gestor@example.com",
      "$2b$12$placeholder_hash_gestor",
      "gestor"
    );

    insertUserStmt.run(
      "user_prestador_1",
      "Paulo Bruxel",
      "paulo@example.com",
      "$2b$12$placeholder_hash_paulo",
      "prestador"
    );

    // Insert prestador
    const insertPrestadorStmt = db.prepare(
      `INSERT INTO prestadores (id, usuario_id, nome, email, ativo, data_criacao)
       VALUES (?, ?, ?, ?, true, '2026-01-01')`
    );

    insertPrestadorStmt.run(
      1,
      "user_prestador_1",
      "Paulo Bruxel",
      "paulo@example.com"
    );

    // Update prestador_id for prestador user
    const updateStmt = db.prepare(
      "UPDATE usuarios SET prestador_id = 1 WHERE id = 'user_prestador_1'"
    );
    updateStmt.run();

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

    console.log(
      "[Database] Seeded initial test data (3 users, 1 prestador, contract params)"
    );
  } catch (erro) {
    throw new Error(
      `Seed data insertion failed: ${erro instanceof Error ? erro.message : String(erro)}`
    );
  }
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
          console.log(`[Database] Cleaned ${deleted} expired sessions`);
        }
      } catch (erro) {
        console.error("[Database] Session cleanup error:", erro);
      }
    }, 60 * 60 * 1000); // Every hour

    // Don't keep this interval alive on process exit
    cleanupInterval.unref();

    console.log("[Database] Session cleanup scheduled");
  } catch (erro) {
    console.error("[Database] Failed to setup session cleanup:", erro);
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
    console.error("[Database] Error cleaning expired sessions:", erro);
    return 0;
  }
}

/**
 * Get the database instance
 * Must call initializeDatabase() first
 */
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
      console.log("[Database] Connection closed");
    } catch (erro) {
      console.error("[Database] Error closing connection:", erro);
    }
  }
}

/**
 * Get database file path (useful for testing)
 */
export function getDatabasePath(): string {
  return DB_PATH;
}
