/**
 * Test helper for creating databases with schema
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lê os dois arquivos de schema (fase 2 + fase 3 — ver migrations-phase3-integracoes.sql)
// e concatena, na mesma ordem em que database-init.ts os aplica num boot real.
const SCHEMA_PATHS = [
  path.join(__dirname, "migrations-phase2-auth.sql"),
  path.join(__dirname, "migrations-phase3-integracoes.sql"),
];
const SCHEMA = SCHEMA_PATHS.map((schemaPath) => {
  try {
    return fs.readFileSync(schemaPath, "utf-8");
  } catch (e) {
    throw new Error(`Cannot read schema file from ${schemaPath}: ${e}`);
  }
}).join("\n");

/**
 * Initialize a test database with the Phase 2 schema
 */
export function createTestDatabase(dbPath: string): Database.Database {
  // Remove existing test DB
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const db = new Database(dbPath);

  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Execute schema statements one by one
  const statements = SCHEMA
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--") && !s.startsWith("/*"));

  for (const statement of statements) {
    try {
      db.exec(statement);
    } catch (err) {
      // Ignore "already exists" errors (idempotent migrations)
      if (!(err instanceof Error && err.message.includes("already exists"))) {
        throw err;
      }
    }
  }

  return db;
}

/**
 * Clean up test database
 */
export function cleanupTestDatabase(dbPath: string): void {
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}
