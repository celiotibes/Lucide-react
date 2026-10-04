/**
 * Test helper for creating databases with schema
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load only Phase 2 for basic test database
// Other phases have complex triggers that require more sophisticated parsing
// For comprehensive Phase 2-16 testing, use database-init.ts via integration tests
const SCHEMA_PATHS = [
  path.join(__dirname, "migrations-phase2-auth.sql"),
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
 * Parse SQL statements from schema text, properly handling comments and quoted strings
 * This handles multi-line statements including CREATE TRIGGER with BEGIN...END blocks
 */
function parseSQLStatements(schema: string): string[] {
  // Remove SQL comments (both -- line comments and /* */ block comments)
  const cleaned = schema
    // Remove /* */ block comments
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    // Remove -- line comments
    .split("\n")
    .map((line) => {
      const commentIndex = line.indexOf("--");
      return commentIndex === -1 ? line : line.substring(0, commentIndex);
    })
    .join("\n");

  // Smart split: track whether we're inside a string literal to avoid splitting on semicolons in strings
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prevChar = i > 0 ? cleaned[i - 1] : "";

    // Toggle quote tracking (handle escaped quotes with two consecutive quotes)
    if (char === "'" && prevChar !== "'") {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && prevChar !== '"') {
      inDoubleQuote = !inDoubleQuote;
    }

    // Check for statement separator (semicolon not in a string)
    if (char === ";" && !inSingleQuote && !inDoubleQuote) {
      const statement = current.trim();
      if (statement.length > 0) {
        statements.push(statement);
      }
      current = "";
    } else {
      current += char;
    }
  }

  // Add any remaining statement
  const finalStatement = current.trim();
  if (finalStatement.length > 0) {
    statements.push(finalStatement);
  }

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
