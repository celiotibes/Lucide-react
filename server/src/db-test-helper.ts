/**
 * Test helper for creating databases with schema
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load all migrations (Phase 2-16) for comprehensive schema testing
// These are all idempotent and use CREATE TABLE/INDEX IF NOT EXISTS
const SCHEMA_PATHS = [
  path.join(__dirname, "migrations-phase2-auth.sql"),
  path.join(__dirname, "migrations-phase3-integracoes.sql"),
  path.join(__dirname, "migrations-phase4-vinculos-externos.sql"),
  path.join(__dirname, "migrations-phase4.1-anomalias.sql"),
  path.join(__dirname, "migrations-phase5-lembretes-agendados.sql"),
  path.join(__dirname, "migrations-phase6-analytics-completa.sql"),
  path.join(__dirname, "migrations-phase6-relatorios-dre.sql"),
  path.join(__dirname, "migrations-phase7-margens-propriedades.sql"),
  path.join(__dirname, "migrations-phase7-relatorio-executivo.sql"),
  path.join(__dirname, "migrations-phase8-asaas-reembolsos.sql"),
  path.join(__dirname, "migrations-phase8-reconciliacao-asaas.sql"),
  path.join(__dirname, "migrations-phase8-conciliacao-pix-ofx.sql"),
  path.join(__dirname, "migrations-phase9-pagamentos-pix-proativos.sql"),
  path.join(__dirname, "migrations-phase10-assinatura-lgpd.sql"),
  path.join(__dirname, "migrations-phase11-performance-indexes.sql"),
  path.join(__dirname, "migrations-phase12-asaas-webhook-dedup.sql"),
  path.join(__dirname, "migrations-phase12-imutabilidade.sql"),
  path.join(__dirname, "migrations-phase13-acl-recursos.sql"),
  path.join(__dirname, "migrations-phase14-portal-inquilino.sql"),
  path.join(__dirname, "migrations-phase15-prestador-apontamentos.sql"),
  path.join(__dirname, "migrations-phase16-ledger-entries.sql"),
  path.join(__dirname, "migrations-phase16-revisao-ia.sql"),
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

  // Parse SQL statements properly, removing comments first
  const statements = parseSQLStatements(SCHEMA);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    try {
      // Use exec for DDL statements (CREATE/ALTER/DROP)
      db.exec(statement);
    } catch (err) {
      // Ignore "already exists" errors (idempotent migrations)
      if (!(err instanceof Error && err.message.includes("already exists"))) {
        console.error(`Failed on statement ${i + 1}/${statements.length}`);
        console.error(`Statement text: ${statement.substring(0, 200)}...`);
        throw err;
      }
    }
  }

  return db;
}

/**
 * Parse SQL statements from schema text, properly handling comments
 */
function parseSQLStatements(schema: string): string[] {
  // Remove SQL comments (both -- line comments and /* */ block comments)
  let cleaned = schema
    // Remove /* */ block comments
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    // Remove -- line comments
    .split("\n")
    .map((line) => {
      const commentIndex = line.indexOf("--");
      return commentIndex === -1 ? line : line.substring(0, commentIndex);
    })
    .join("\n");

  // Split by semicolon and filter empty statements
  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return statements;
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
