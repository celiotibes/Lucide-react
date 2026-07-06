import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query, transaction } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Migration {
  id: string;
  name: string;
  executed_at?: Date;
}

async function initMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

async function loadMigrations(): Promise<string[]> {
  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir);
  return files
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function getExecutedMigrations(): Promise<Set<string>> {
  const result = await query("SELECT name FROM migrations");
  return new Set(result.rows.map((r: Migration) => r.name));
}

async function runMigration(
  filename: string,
  _direction: "up" | "down"
): Promise<void> {
  const filepath = path.join(__dirname, "migrations", filename);
  const sql = fs.readFileSync(filepath, "utf-8");

  await transaction(async (client) => {
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING",
        [filename]
      );
      console.log(`✓ Migration executed: ${filename}`);
    } catch (error) {
      console.error(`✗ Migration failed: ${filename}`, error);
      throw error;
    }
  });
}

async function runMigrations(direction: "up" | "down"): Promise<void> {
  await initMigrationsTable();

  const migrations = await loadMigrations();
  const executed = await getExecutedMigrations();

  if (direction === "up") {
    for (const migration of migrations) {
      if (!executed.has(migration)) {
        await runMigration(migration, direction);
      }
    }
  } else {
    for (const migration of migrations.reverse()) {
      if (executed.has(migration)) {
        // For down, we'd need rollback SQL which we're not tracking yet
        console.log(`⊘ Rollback not implemented for: ${migration}`);
      }
    }
  }

  console.log("Migrations completed");
  process.exit(0);
}

const direction = (process.argv[2] as "up" | "down") || "up";
runMigrations(direction).catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
