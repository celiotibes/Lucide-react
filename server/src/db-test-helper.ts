/**
 * Test helper for creating databases with schema
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read schema once
const SCHEMA_PATH = path.join(__dirname, "migrations-phase2-auth.sql");
const SCHEMA = (() => {
  try {
    return fs.readFileSync(SCHEMA_PATH, "utf-8");
  } catch (e) {
    throw new Error(`Cannot read schema file from ${SCHEMA_PATH}: ${e}`);
  }
})();

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
