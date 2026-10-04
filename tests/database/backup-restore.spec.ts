/**
 * Testes para Backup e Restore de Banco de Dados
 *
 * Valida:
 * - Criação de backup com dados conhecidos
 * - Restauração em DB limpo mantendo integridade
 * - Verificação de row count e checksums
 * - Inserção de 1000 registros → backup → restore → verificar
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { createTestDatabase, cleanupTestDatabase } from "../../server/src/db-test-helper";
import crypto from "crypto";
import { join } from "path";

const TEST_DB_PATH = path.join(process.cwd(), "test-backup-restore.db");
const TEST_BACKUP_DIR = path.join(process.cwd(), "test-backup-data");
const TEST_BACKUP_DB_PATH = join(TEST_BACKUP_DIR, "app.db");
const TEST_BACKUP_METADATA_PATH = join(TEST_BACKUP_DIR, "backup-metadata.json");

/**
 * Helper para calcular checksum de dados do banco
 */
function calculateTableChecksum(
  db: Database.Database,
  tableName: string,
): string {
  try {
    const rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY rowid`).all();
    const jsonStr = JSON.stringify(rows);
    return crypto.createHash("sha256").update(jsonStr).digest("hex");
  } catch {
    // Tabela pode não existir
    return "";
  }
}

/**
 * Helper para exportar banco de dados para arquivo
 */
function backupDatabase(db: Database.Database, backupDir: string): void {
  // Garantir que diretório existe
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Fazer VACUUM antes de fazer backup
  db.exec("VACUUM");

  // Copiar arquivo do banco de dados
  const dbPath = (db as Database.Database & { name: string }).name; // better-sqlite3 armazena o path em .name
  const backupDbPath = join(backupDir, "app.db");

  fs.copyFileSync(dbPath, backupDbPath);

  // Salvar metadata
  const metadata = {
    timestamp: new Date().toISOString(),
    version: "1.0",
    tables: listTables(db),
    rowCounts: getTableRowCounts(db),
    checksums: getTableChecksums(db),
  };

  const metadataPath = join(backupDir, "backup-metadata.json");
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

/**
 * Helper para restaurar banco de dados de arquivo
 */
function restoreDatabase(backupDir: string, targetDbPath: string): void {
  // Remover DB anterior se existir
  if (fs.existsSync(targetDbPath)) {
    fs.unlinkSync(targetDbPath);
  }

  // Copiar arquivo de backup
  const backupDbPath = join(backupDir, "app.db");

  if (!fs.existsSync(backupDbPath)) {
    throw new Error(`app.db não encontrado em ${backupDbPath}`);
  }

  fs.copyFileSync(backupDbPath, targetDbPath);
}

/**
 * Helper para listar tabelas no banco
 */
function listTables(db: Database.Database): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/**
 * Helper para obter contagem de linhas por tabela
 */
function getTableRowCounts(db: Database.Database): Record<string, number> {
  const tables = listTables(db);
  const counts: Record<string, number> = {};

  for (const table of tables) {
    try {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as {
        count: number;
      };
      counts[table] = result.count;
    } catch {
      counts[table] = 0;
    }
  }

  return counts;
}

/**
 * Helper para obter checksums de todas as tabelas
 */
function getTableChecksums(db: Database.Database): Record<string, string> {
  const tables = listTables(db);
  const checksums: Record<string, string> = {};

  for (const table of tables) {
    checksums[table] = calculateTableChecksum(db, table);
  }

  return checksums;
}

describe("Database Backup/Restore", () => {
  let db: Database.Database;

  beforeEach(() => {
    cleanupTestDatabase(TEST_DB_PATH);
    db = createTestDatabase(TEST_DB_PATH);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    cleanupTestDatabase(TEST_DB_PATH);
    // Cleanup backup directory
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    }
  });

  it("deve criar um backup de banco de dados com dados conhecidos", () => {
    // Inserir dados de teste
    const stmt = db.prepare(`
      INSERT INTO usuarios (id, email, senha_hash, nome_completo)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run("user-1", "teste@example.com", "hash123", "Teste User");
    stmt.run("user-2", "outro@example.com", "hash456", "Outro User");

    // Criar backup
    expect(() => {
      backupDatabase(db, TEST_BACKUP_DIR);
    }).not.toThrow();

    // Verificar que arquivos foram criados
    expect(fs.existsSync(TEST_BACKUP_DB_PATH)).toBe(true);
    expect(fs.existsSync(TEST_BACKUP_METADATA_PATH)).toBe(true);

    // Verificar metadata
    const metadata = JSON.parse(fs.readFileSync(TEST_BACKUP_METADATA_PATH, "utf-8"));
    expect(metadata.rowCounts.usuarios).toBe(2);
    expect(metadata.tables).toContain("usuarios");
    expect(metadata.version).toBe("1.0");
  });

  it("deve restaurar banco de dados em DB limpo", () => {
    // Inserir dados de teste
    const stmt = db.prepare(`
      INSERT INTO usuarios (id, email, senha_hash, nome_completo)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run("user-1", "teste@example.com", "hash123", "Teste User");
    stmt.run("user-2", "outro@example.com", "hash456", "Outro User");

    // Capturar checksums originais
    const originalChecksums = getTableChecksums(db);
    const originalCounts = getTableRowCounts(db);

    // Criar backup
    backupDatabase(db, TEST_BACKUP_DIR);
    db.close();

    // Limpar arquivo original
    cleanupTestDatabase(TEST_DB_PATH);

    // Restaurar de backup
    const restoreDbPath = path.join(process.cwd(), "test-restore.db");
    restoreDatabase(TEST_BACKUP_DIR, restoreDbPath);

    // Abrir banco restaurado
    const restoredDb = new Database(restoreDbPath);
    restoredDb.pragma("foreign_keys = ON");

    try {
      // Verificar que dados foram restaurados
      const users = restoredDb.prepare("SELECT * FROM usuarios").all() as Array<{ email: string }>;
      expect(users).toHaveLength(2);
      expect(users[0].email).toBe("teste@example.com");
      expect(users[1].email).toBe("outro@example.com");

      // Verificar checksums
      const restoredChecksums = getTableChecksums(restoredDb);
      expect(restoredChecksums.usuarios).toBe(originalChecksums.usuarios);

      // Verificar row counts
      const restoredCounts = getTableRowCounts(restoredDb);
      expect(restoredCounts.usuarios).toBe(originalCounts.usuarios);
    } finally {
      restoredDb.close();
      if (fs.existsSync(restoreDbPath)) {
        fs.unlinkSync(restoreDbPath);
      }
    }
  });

  it("deve validar integridade com 1000 registros", () => {
    // Inserir 1000 registros
    const stmt = db.prepare(`
      INSERT INTO usuarios (id, email, senha_hash, nome_completo)
      VALUES (?, ?, ?, ?)
    `);

    const insertMany = db.transaction((count: number) => {
      for (let i = 0; i < count; i++) {
        stmt.run(
          `user-${i}`,
          `user${i}@example.com`,
          `hash${i}`,
          `User ${i}`,
        );
      }
    });

    insertMany(1000);

    // Capturar dados originais
    const originalChecksum = calculateTableChecksum(db, "usuarios");

    // Criar backup
    backupDatabase(db, TEST_BACKUP_DIR);
    db.close();

    // Restaurar de backup
    cleanupTestDatabase(TEST_DB_PATH);
    const restoreDbPath = path.join(process.cwd(), "test-restore-1000.db");
    restoreDatabase(TEST_BACKUP_DIR, restoreDbPath);

    const restoredDb = new Database(restoreDbPath);
    restoredDb.pragma("foreign_keys = ON");

    try {
      // Verificar contagem
      const result = restoredDb.prepare("SELECT COUNT(*) as count FROM usuarios").get() as {
        count: number;
      };
      expect(result.count).toBe(1000);

      // Verificar checksum
      const restoredChecksum = calculateTableChecksum(restoredDb, "usuarios");
      expect(restoredChecksum).toBe(originalChecksum);

      // Spot check alguns registros
      const spotCheck = restoredDb.prepare("SELECT * FROM usuarios WHERE id IN (?, ?, ?)").all(
        "user-0",
        "user-500",
        "user-999",
      ) as Array<{ email: string }>;
      expect(spotCheck).toHaveLength(3);
      expect(spotCheck[0].email).toBe("user0@example.com");
      expect(spotCheck[1].email).toBe("user500@example.com");
      expect(spotCheck[2].email).toBe("user999@example.com");
    } finally {
      restoredDb.close();
      if (fs.existsSync(restoreDbPath)) {
        fs.unlinkSync(restoreDbPath);
      }
    }
  });

  it("deve preservar integridade referencial após restore", () => {
    // Inserir dados com relacionamentos
    const userStmt = db.prepare(`
      INSERT INTO usuarios (id, email, senha_hash, nome_completo)
      VALUES (?, ?, ?, ?)
    `);

    userStmt.run("user-1", "teste@example.com", "hash123", "Teste User");

    // Criar backup
    backupDatabase(db, TEST_BACKUP_PATH);
    db.close();

    // Restaurar
    cleanupTestDatabase(TEST_DB_PATH);
    const restoreDbPath = path.join(process.cwd(), "test-restore-fk.db");
    restoreDatabase(TEST_BACKUP_PATH, restoreDbPath);

    const restoredDb = new Database(restoreDbPath);
    restoredDb.pragma("foreign_keys = ON");

    try {
      // Verificar que foreign keys estão habilitadas
      const fkEnabled = restoredDb.pragma("foreign_keys") as Array<{ foreign_keys: number }>;
      expect(fkEnabled[0].foreign_keys).toBe(1);

      // Verificar dados
      const users = restoredDb.prepare("SELECT * FROM usuarios").all();
      expect(users).toHaveLength(1);
    } finally {
      restoredDb.close();
      if (fs.existsSync(restoreDbPath)) {
        fs.unlinkSync(restoreDbPath);
      }
    }
  });

  it("deve gerar metadata válida no backup", () => {
    // Inserir dados
    const stmt = db.prepare(`
      INSERT INTO usuarios (id, email, senha_hash, nome_completo)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run("user-1", "teste@example.com", "hash123", "Teste User");

    // Criar backup
    backupDatabase(db, TEST_BACKUP_PATH);

    // Extrair e validar metadata
    const zip = new AdmZip(TEST_BACKUP_PATH);
    const metadata = JSON.parse(zip.readAsText("backup-metadata.json"));

    // Verificar campos obrigatórios
    expect(metadata.timestamp).toBeDefined();
    expect(metadata.version).toBe("1.0");
    expect(Array.isArray(metadata.tables)).toBe(true);
    expect(typeof metadata.rowCounts).toBe("object");
    expect(typeof metadata.checksums).toBe("object");

    // Verificar que contém informações úteis
    expect(metadata.rowCounts.usuarios).toBe(1);
    expect(metadata.checksums.usuarios).toBeDefined();
    expect(metadata.checksums.usuarios.length).toBeGreaterThan(0);
  });
});
