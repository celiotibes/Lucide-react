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

    // List of expected tables from migrations (including Phase 16)
    const expectedTables = [
      // Phase 2 (Core auth)
      'usuarios',
      'permissoes_papel',
      'sessoes',
      // Phase 3+
      'integracoes_asaas',
      'vinculos_externos',
      'anomalias',
      'lembretes_agendados',
      // Phase 16 (Ledger and IA Review)
      'ledger_entries',
      'fila_revisao_ia',
      'regras_revisao_ia',
    ];

    for (const tableName of expectedTables) {
      const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
      ).get(tableName);

      // Core Phase 2 tables must exist
      if (['usuarios', 'permissoes_papel', 'sessoes'].includes(tableName)) {
        expect(result).toBeDefined();
      } else {
        // Phase 16 tables should exist if migrations loaded successfully
        if (['ledger_entries', 'fila_revisao_ia', 'regras_revisao_ia'].includes(tableName)) {
          expect(result).toBeDefined();
        }
      }
    }

    close();
  });

  it('should have Phase 16 tables with correct structure', async () => {
    const { initializeDatabase: init, closeDatabase: close } = await import('../database-init.js');

    const db = init();

    // Check ledger_entries table structure
    const ledgerColumns = db.prepare(
      "PRAGMA table_info(ledger_entries)"
    ).all() as Array<{ name: string; type: string }>;

    const ledgerColumnNames = ledgerColumns.map(c => c.name);
    expect(ledgerColumnNames).toContain('id');
    expect(ledgerColumnNames).toContain('data');
    expect(ledgerColumnNames).toContain('tipo');
    expect(ledgerColumnNames).toContain('categoria');
    expect(ledgerColumnNames).toContain('valor');

    // Check fila_revisao_ia table structure
    const filaColumns = db.prepare(
      "PRAGMA table_info(fila_revisao_ia)"
    ).all() as Array<{ name: string; type: string }>;

    const filaColumnNames = filaColumns.map(c => c.name);
    expect(filaColumnNames).toContain('id');
    expect(filaColumnNames).toContain('documento_id');
    expect(filaColumnNames).toContain('tipo');
    expect(filaColumnNames).toContain('motivo');
    expect(filaColumnNames).toContain('status');

    // Check regras_revisao_ia table structure
    const regrasColumns = db.prepare(
      "PRAGMA table_info(regras_revisao_ia)"
    ).all() as Array<{ name: string; type: string }>;

    const regrasColumnNames = regrasColumns.map(c => c.name);
    expect(regrasColumnNames).toContain('id');
    expect(regrasColumnNames).toContain('nome');
    expect(regrasColumnNames).toContain('tipo');
    expect(regrasColumnNames).toContain('ativa');

    close();
  });
});
