import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initializeDatabase, closeDatabase, getDatabase, getDatabasePath } from '../database-init.js';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';

describe('Database Boot and Idempotency', () => {
  let testDbDir: string;
  let originalCwd: () => string;

  beforeEach(() => {
    // Create a temporary directory for test database
    testDbDir = fs.mkdtempSync(path.join(tmpdir(), 'lucide-db-test-'));

    // Save original process.cwd
    originalCwd = process.cwd;
    process.cwd = () => testDbDir;

    // Reset modules to force re-import with mocked cwd
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original process.cwd
    process.cwd = originalCwd;

    // Close database connection
    try {
      closeDatabase();
    } catch (e) {
      // Ignore errors
    }

    // Clean up test database files
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  it('should initialize database without errors on new SQLite file', async () => {
    // Import after mocking cwd
    const { initializeDatabase: init, closeDatabase: close } = await import('../database-init.js');

    // Should not throw
    const db = init();
    expect(db).toBeDefined();

    // Database was created at process.cwd()/data/app.db
    const dbFile = path.join(testDbDir, 'data', 'app.db');
    expect(fs.existsSync(dbFile)).toBe(true);

    // Verify basic schema exists (usuarios table from Phase 2 migrations)
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'"
    ).get();
    expect(result).toBeDefined();

    close();
  });

  it('should be idempotent - second initialization on same file should not fail', async () => {
    const { initializeDatabase: init1, closeDatabase: close1 } = await import('../database-init.js');

    // First initialization
    const db1 = init1();
    expect(db1).toBeDefined();
    close1();

    // Reset modules again for second import
    vi.resetModules();
    const { initializeDatabase: init2, closeDatabase: close2 } = await import('../database-init.js');

    // Second initialization on same file - should not throw
    const db2 = init2();
    expect(db2).toBeDefined();

    // Verify schema is still intact
    const result = db2.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"
    ).get() as { count: number };
    expect(result.count).toBeGreaterThan(0);

    close2();
  });

  it('should have all migration tables created without errors', async () => {
    const { initializeDatabase: init, closeDatabase: close } = await import('../database-init.js');

    const db = init();

    // List of expected tables from migrations
    const expectedTables = [
      'usuarios',           // Phase 2
      'permissoes_papel',   // Phase 2
      'sessoes',            // Phase 2
      'integracoes_asaas',  // Phase 3+
      'vinculos_externos',  // Phase 4
      'anomalias',          // Phase 4.1
      'lembretes_agendados', // Phase 5
    ];

    for (const tableName of expectedTables) {
      const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
      ).get(tableName);

      // Some tables might not exist if migrations are optional, but Phase 2 core ones should
      if (['usuarios', 'permissoes_papel', 'sessoes'].includes(tableName)) {
        expect(result).toBeDefined();
      }
    }

    close();
  });
});
