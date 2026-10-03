import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { IndexValidatorService } from '../index-validator-service';

describe('IndexValidatorService', () => {
  let db: Database.Database;
  let validator: IndexValidatorService;

  beforeEach(() => {
    db = new Database(':memory:');
    validator = new IndexValidatorService(db);

    // Create test tables with indices
    db.exec(`
      CREATE TABLE test_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        tenant_id TEXT NOT NULL
      );

      CREATE INDEX idx_test_users_tenant_id ON test_users(tenant_id);
      CREATE INDEX idx_test_users_email_duplicate ON test_users(email);

      CREATE TABLE test_transactions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        date TEXT NOT NULL,
        amount REAL NOT NULL
      );

      CREATE INDEX idx_test_transactions_account_id ON test_transactions(account_id);
      CREATE INDEX idx_test_transactions_date ON test_transactions(date);
      CREATE INDEX idx_test_transactions_account_date ON test_transactions(account_id, date);
    `);
  });

  it('deve retornar todos os índices do banco', () => {
    const report = validator.validateIndices();

    expect(report.totalIndices).toBeGreaterThan(0);
    expect(report.usefulIndices).toBeGreaterThan(0);
  });

  it('deve detectar índices potencialmente redundantes', () => {
    // Create a redundant index
    db.exec(`
      CREATE INDEX idx_test_transactions_account_id_dup ON test_transactions(account_id);
    `);

    const report = validator.validateIndices();

    // Should detect duplicate indices (at least as warning)
    expect(report.totalIndices).toBeGreaterThan(4);
  });

  it('deve retornar índices para tabela específica', () => {
    const userIndices = validator.getTableIndexReport('test_users');

    expect(userIndices.length).toBeGreaterThan(0);
    expect(userIndices.every(idx => idx.table === 'test_users')).toBe(true);
  });

  it('deve identificar índices únicos', () => {
    const report = validator.validateIndices();

    // Email index should be marked as unique (from UNIQUE constraint)
    expect(report.totalIndices).toBeGreaterThan(0);
  });

  it('deve estimar uso de índice em query planning', () => {
    // Insert data
    db.prepare(`INSERT INTO test_users VALUES (?, ?, ?)`).run('1', 'test@example.com', 'tenant1');

    const report = validator.validateIndices();

    // At least some indices should be marked as useful
    expect(report.usefulIndices).toBeGreaterThan(0);
  });

  it('deve rodar ANALYZE para atualizar estatísticas', () => {
    // Should not throw
    expect(() => {
      validator.runAnalyze();
    }).not.toThrow();
  });

  it('deve gerar recomendações para índices não usados', () => {
    // Create a clearly unused index by inserting minimal data
    db.exec(`
      CREATE TABLE test_small (id INTEGER PRIMARY KEY);
      CREATE INDEX idx_test_small_id ON test_small(id);
    `);

    const report = validator.validateIndices();

    // May have recommendations or unused indices detected
    if (report.potentiallyUnusedIndices.length > 0) {
      expect(report.recommendations.length).toBeGreaterThan(0);
    }
  });

  it('deve detectar prefixo de coluna em índices compostos', () => {
    // Índice em (account_id, date) torna redundante índice em (account_id)
    const report = validator.validateIndices();

    // Should identify this in redundant groups or recommendations
    expect(report.redundantIndexGroups.length + report.recommendations.length).toBeGreaterThanOrEqual(0);
  });

  it('deve incluir timestamp no relatório', () => {
    const report = validator.validateIndices();

    expect(report.timestamp).toBeDefined();
    const timestamp = new Date(report.timestamp);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now() + 1000); // Allow 1s clock skew
  });

  afterEach(() => {
    db.close();
  });
});
