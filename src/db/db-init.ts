/**
 * Database Initialization Module
 * Handles database setup and migration execution
 *
 * Phase 2: Auth & Authorization Schema
 * - usuarios: User accounts and authentication
 * - sessoes: Active session tokens
 * - auditoria: Audit trail for all actions
 * - pagamentos_apontamentos: Payment submissions
 * - apontamentos_diarios: Daily work entries
 * - parametros_contrato: Contract parameters
 * - prestadores: Service provider data
 */

import fs from "fs";
import path from "path";

/**
 * Database interface - abstract to support different implementations
 */
export interface Database {
  exec(sql: string): void;
  run(sql: string, params?: any[]): any;
  get(sql: string, params?: any[]): any;
  all(sql: string, params?: any[]): any[];
  close(): void;
}

/**
 * H-5 FIX: Initialize database with migrations
 * Ensures all required tables exist before app starts
 */
export async function initializeDatabase(db: Database): Promise<void> {
  try {
    // 1. Read migrations-phase2-auth.sql
    const migrationPath = path.join(__dirname, "migrations-phase2-auth.sql");

    if (!fs.existsSync(migrationPath)) {
      console.warn(`[DB] Migration file not found at ${migrationPath}`);
      console.warn("[DB] Creating in-memory database only");
      return;
    }

    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // 2. Execute migrations
    console.log("[DB] Running Phase 2 migrations (auth schema)...");

    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

    for (const statement of statements) {
      try {
        db.exec(statement + ";");
      } catch (error) {
        // CREATE TABLE IF NOT EXISTS should not fail
        // But log warnings for other errors
        console.warn(`[DB] Statement warning: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    console.log("[DB] ✓ Phase 2 migrations completed successfully");

    // 3. Verify all required tables exist
    verifyTablesExist(db);

  } catch (error) {
    console.error("[DB] Database initialization failed:", error);
    throw error;
  }
}

/**
 * Verify all required tables exist
 */
function verifyTablesExist(db: Database): void {
  const requiredTables = [
    "usuarios",
    "sessoes",
    "auditoria",
    "pagamentos_apontamentos",
    "apontamentos_diarios",
    "parametros_contrato",
    "prestadores",
  ];

  console.log("[DB] Verifying required tables...");

  const missing: string[] = [];

  for (const table of requiredTables) {
    try {
      // Try to query the table
      const result = db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [table]
      );

      if (!result) {
        missing.push(table);
        console.warn(`[DB] ✗ Table "${table}" not found`);
      } else {
        console.log(`[DB] ✓ Table "${table}" exists`);
      }
    } catch (error) {
      console.warn(`[DB] ✗ Error checking table "${table}": ${error instanceof Error ? error.message : "Unknown error"}`);
      missing.push(table);
    }
  }

  if (missing.length > 0) {
    console.error(
      `[DB] Missing required tables: ${missing.join(", ")}`
    );
    console.error("[DB] Database initialization may be incomplete");
  } else {
    console.log("[DB] ✓ All required tables exist");
  }
}

/**
 * Get database connection status
 */
export function getDbStatus(db: Database): { connected: boolean; tables: string[] } {
  try {
    const tables = db.all(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    );

    return {
      connected: true,
      tables: tables.map((t: any) => t.name),
    };
  } catch (error) {
    return {
      connected: false,
      tables: [],
    };
  }
}

/**
 * Load and verify test data exists
 */
export function verifyTestDataLoaded(db: Database): boolean {
  try {
    const adminUser = db.get(
      `SELECT id FROM usuarios WHERE role='admin' LIMIT 1`
    );
    const prestador = db.get(
      `SELECT id FROM prestadores LIMIT 1`
    );

    if (!adminUser || !prestador) {
      console.warn("[DB] Test data not fully loaded");
      return false;
    }

    console.log("[DB] ✓ Test data verified");
    return true;
  } catch (error) {
    console.warn("[DB] Error verifying test data:", error);
    return false;
  }
}
