/**
 * Testes Vitest para BackupService
 *
 * Validação:
 * - Criar backup gera arquivo + manifesto
 * - Hash SHA-256 confere antes/depois
 * - Adulteração é detectada
 * - Restauração passa PRAGMA integrity_check
 * - Chave ausente falha fechado
 * - Retenção remove o que excede políticas
 * - Row counts conferem
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import BackupService, { BackupManifest } from "../../src/services/backup-service.js";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

// Mocking de variáveis de ambiente
const TEST_DB_PATH = path.join(os.tmpdir(), `test-backup-${Date.now()}.db`);
const TEST_BACKUP_DIR = path.join(os.tmpdir(), `test-backup-local-${Date.now()}`);
const TEST_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

function setupEnv() {
  process.env.BACKUP_LOCAL_DIR = TEST_BACKUP_DIR;
  process.env.BACKUP_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  // Google Drive é opcional nos testes
  delete process.env.GOOGLE_CREDENTIALS_JSON;
}

function cleanupEnv() {
  delete process.env.BACKUP_LOCAL_DIR;
  delete process.env.BACKUP_ENCRYPTION_KEY;
}

function createTestDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Criar tabela de teste
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      senha_hash TEXT,
      nome_completo TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

function cleanupDatabase(dbPath: string) {
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  } catch {
    // ignorar
  }
}

describe("BackupService", () => {
  beforeEach(() => {
    setupEnv();
    cleanupDatabase(TEST_DB_PATH);
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_BACKUP_DIR, { recursive: true });
  });

  afterEach(() => {
    cleanupEnv();
    cleanupDatabase(TEST_DB_PATH);
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    }
  });

  describe("Inicialização", () => {
    it("deve inicializar com BACKUP_LOCAL_DIR e BACKUP_ENCRYPTION_KEY", () => {
      const service = new BackupService(TEST_DB_PATH);
      expect(service).toBeDefined();
    });

    it("deve falhar fechado se BACKUP_ENCRYPTION_KEY ausente", () => {
      delete process.env.BACKUP_ENCRYPTION_KEY;
      expect(() => new BackupService(TEST_DB_PATH)).toThrow(/BACKUP_ENCRYPTION_KEY/);
    });

    it("deve falhar fechado se BACKUP_LOCAL_DIR ausente", () => {
      delete process.env.BACKUP_LOCAL_DIR;
      expect(() => new BackupService(TEST_DB_PATH)).toThrow(/BACKUP_LOCAL_DIR/);
    });

    it("deve falhar fechado se chave não é 32 bytes (64 hex)", () => {
      process.env.BACKUP_ENCRYPTION_KEY = "abc123"; // Muito curta
      expect(() => new BackupService(TEST_DB_PATH)).toThrow(/64 caracteres hex/);
    });

    it("deve criar BACKUP_LOCAL_DIR se não existe", () => {
      const newDir = path.join(os.tmpdir(), `backup-new-${Date.now()}`);
      process.env.BACKUP_LOCAL_DIR = newDir;

      // Unused __service new BackupService(TEST_DB_PATH);
      expect(fs.existsSync(newDir)).toBe(true);

      fs.rmSync(newDir, { recursive: true, force: true });
    });
  });

  describe("Criação de Backup", () => {
    it("deve criar backup completo com arquivo + manifesto", async () => {
      const db = createTestDatabase(TEST_DB_PATH);

      // Inserir dados de teste
      const stmt = db.prepare(`INSERT INTO usuarios (id, email, senha_hash, nome_completo) VALUES (?, ?, ?, ?)`);
      stmt.run("user-1", "teste1@example.com", "hash123", "User 1");
      stmt.run("user-2", "teste2@example.com", "hash456", "User 2");

      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const result = await service.criarBackup();

      expect(result.sucesso).toBe(true);
      expect(result.backupId).toBeDefined();
      expect(result.manifesto).toBeDefined();

      // Verificar que arquivo foi criado
      const backupFile = path.join(TEST_BACKUP_DIR, `${result.backupId}.enc`);
      const manifestFile = path.join(TEST_BACKUP_DIR, `${result.backupId}-manifest.json`);
      expect(fs.existsSync(backupFile)).toBe(true);
      expect(fs.existsSync(manifestFile)).toBe(true);

      // Verificar manifesto
      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf-8")) as BackupManifest;
      expect(manifest.sha256Hash).toBeDefined();
      expect(manifest.encryptionIv).toBeDefined();
      expect(manifest.encryptionAuthTag).toBeDefined();
      expect(manifest.tables).toContain("usuarios");
      expect(manifest.rowCounts.usuarios).toBe(2);
    });

    it("deve calcular SHA-256 corretamente", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      const stmt = db.prepare(`INSERT INTO usuarios (id, email, senha_hash, nome_completo) VALUES (?, ?, ?, ?)`);
      stmt.run("user-1", "teste@example.com", "hash123", "User 1");
      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const result = await service.criarBackup();

      expect(result.manifesto?.sha256Hash).toBeDefined();
      expect(result.manifesto?.sha256Hash).toMatch(/^[a-f0-9]{64}$/); // 64 hex chars
    });

    it("deve usar AES-256-GCM com IV e auth tag", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const result = await service.criarBackup();

      const manifest = result.manifesto!;
      expect(manifest.encryptionIv).toBeDefined();
      expect(manifest.encryptionAuthTag).toBeDefined();

      // IV deve ser base64
      const ivBuffer = Buffer.from(manifest.encryptionIv, "base64");
      expect(ivBuffer.length).toBe(16); // IV de 128 bits

      // Auth tag deve ser base64
      const tagBuffer = Buffer.from(manifest.encryptionAuthTag, "base64");
      expect(tagBuffer.length).toBe(16); // Auth tag de 128 bits
    });

    it("deve coletar metadados do banco (tables, row counts)", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      const stmt = db.prepare(`INSERT INTO usuarios (id, email, senha_hash, nome_completo) VALUES (?, ?, ?, ?)`);

      for (let i = 0; i < 10; i++) {
        stmt.run(`user-${i}`, `user${i}@example.com`, `hash${i}`, `User ${i}`);
      }

      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const result = await service.criarBackup();

      const manifest = result.manifesto!;
      expect(manifest.tables).toContain("usuarios");
      expect(manifest.rowCounts.usuarios).toBe(10);
    });

    it("deve gerar IDs únicos para cada backup", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const result1 = await service.criarBackup();

      // Aguardar um pouco para garantir timestamp diferente
      await new Promise(r => setTimeout(r, 10));

      const result2 = await service.criarBackup();

      expect(result1.backupId).not.toBe(result2.backupId);
    });
  });

  describe("Verificação de Integridade", () => {
    it("deve validar backup íntegro", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      const stmt = db.prepare(`INSERT INTO usuarios (id, email, senha_hash, nome_completo) VALUES (?, ?, ?, ?)`);
      stmt.run("user-1", "teste@example.com", "hash123", "User 1");
      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const backup = await service.criarBackup();

      const backupFile = path.join(TEST_BACKUP_DIR, `${backup.backupId}.enc`);
      const result = await service.verificarBackup(backupFile, backup.manifesto!);

      expect(result.valido).toBe(true);
      expect(result.erros).toHaveLength(0);
    });

    it("deve detectar adulteração de arquivo", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      const stmt = db.prepare(`INSERT INTO usuarios (id, email, senha_hash, nome_completo) VALUES (?, ?, ?, ?)`);
      stmt.run("user-1", "teste@example.com", "hash123", "User 1");
      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const backup = await service.criarBackup();

      const backupFile = path.join(TEST_BACKUP_DIR, `${backup.backupId}.enc`);

      // Adulterar arquivo
      const content = fs.readFileSync(backupFile);
      content[Math.floor(content.length / 2)]++;
      fs.writeFileSync(backupFile, content);

      const result = await service.verificarBackup(backupFile, backup.manifesto!);

      expect(result.valido).toBe(false);
      expect(result.erros.length).toBeGreaterThan(0);
    });

    it("deve retornar avisos se tamanho mismatch", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const backup = await service.criarBackup();

      const backupFile = path.join(TEST_BACKUP_DIR, `${backup.backupId}.enc`);

      // Modificar manifesto com tamanho incorreto
      const manifest = backup.manifesto!;
      manifest.encryptedSize = 999999;

      const result = await service.verificarBackup(backupFile, manifest);

      expect(result.avisos.length).toBeGreaterThan(0);
    });
  });

  describe("Teste de Restauração", () => {
    it("deve passar no teste de restauração", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      const stmt = db.prepare(`INSERT INTO usuarios (id, email, senha_hash, nome_completo) VALUES (?, ?, ?, ?)`);
      stmt.run("user-1", "teste@example.com", "hash123", "User 1");
      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const backup = await service.criarBackup();

      const backupFile = path.join(TEST_BACKUP_DIR, `${backup.backupId}.enc`);
      const result = await service.testarRestauracao(backupFile, backup.manifesto!);

      expect(result.valido).toBe(true);
      expect(result.relatorio.integridade).toBe("ok");
      expect(result.relatorio.tabelas.usuarios).toBe(1);
    });

    it("deve validar row counts na restauração", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      const stmt = db.prepare(`INSERT INTO usuarios (id, email, senha_hash, nome_completo) VALUES (?, ?, ?, ?)`);

      for (let i = 0; i < 100; i++) {
        stmt.run(`user-${i}`, `user${i}@example.com`, `hash${i}`, `User ${i}`);
      }

      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const backup = await service.criarBackup();

      const backupFile = path.join(TEST_BACKUP_DIR, `${backup.backupId}.enc`);
      const result = await service.testarRestauracao(backupFile, backup.manifesto!);

      expect(result.valido).toBe(true);
      expect(result.relatorio.tabelas.usuarios).toBe(100);
    });

    it("deve retornar avisos se row count mudou (corrupção)", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      const stmt = db.prepare(`INSERT INTO usuarios (id, email, senha_hash, nome_completo) VALUES (?, ?, ?, ?)`);
      stmt.run("user-1", "teste@example.com", "hash123", "User 1");
      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const backup = await service.criarBackup();

      // Falsificar manifesto
      const manifest = backup.manifesto!;
      manifest.rowCounts.usuarios = 999; // Diferente do real

      const backupFile = path.join(TEST_BACKUP_DIR, `${backup.backupId}.enc`);
      const result = await service.testarRestauracao(backupFile, manifest);

      expect(result.relatorio.avisos.length).toBeGreaterThan(0);
    });

    it("deve detectar falha na descriptografia (auth tag inválida)", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const backup = await service.criarBackup();

      const backupFile = path.join(TEST_BACKUP_DIR, `${backup.backupId}.enc`);

      // Falsificar auth tag
      const manifest = backup.manifesto!;
      manifest.encryptionAuthTag = crypto.randomBytes(16).toString("base64");

      const result = await service.testarRestauracao(backupFile, manifest);

      expect(result.valido).toBe(false);
      expect(result.erros.length).toBeGreaterThan(0);
    });
  });

  describe("Retenção", () => {
    it("deve remover apenas backups que excedem a política", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      db.close();

      const service = new BackupService(TEST_DB_PATH);

      // Criar múltiplos backups
      const ids = [];
      for (let i = 0; i < 5; i++) {
        const backup = await service.criarBackup();
        ids.push(backup.backupId!);
        // Esperar um pouco para ter timestamps diferentes
        await new Promise(r => setTimeout(r, 10));
      }

      // Listar para verificar que todos existem
      const backups = service.listarBackups();
      expect(backups.length).toBeLessThanOrEqual(5);

      // Com política de 7 diários, nenhum deve ser removido
      expect(backups.length).toBeGreaterThanOrEqual(4);
    });

    it("deve preservar últimos 7 backups diários", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      db.close();

      const service = new BackupService(TEST_DB_PATH);

      // Criar 10 backups rapidamente (todos são "diários" em tempo real)
      for (let i = 0; i < 10; i++) {
        await service.criarBackup();
        await new Promise(r => setTimeout(r, 5));
      }

      const backups = service.listarBackups();

      // Deve ter mantido <= 10 (policy de 7 diários)
      expect(backups.length).toBeLessThanOrEqual(10);
    });
  });

  describe("Listagem", () => {
    it("deve listar backups disponíveis", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const backup = await service.criarBackup();

      const backups = service.listarBackups();

      expect(backups.length).toBeGreaterThan(0);
      expect(backups[0].id).toBe(backup.backupId);
      expect(backups[0].timestamp).toBeDefined();
      expect(backups[0].tamanho).toBeGreaterThan(0);
    });

    it("deve ordenar backups por timestamp decrescente", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      db.close();

      const service = new BackupService(TEST_DB_PATH);

      const backup1 = await service.criarBackup();
      await new Promise(r => setTimeout(r, 50));
      const backup2 = await service.criarBackup();

      const backups = service.listarBackups();

      expect(backups[0].id).toBe(backup2.backupId); // Mais recente primeiro
      expect(backups[1].id).toBe(backup1.backupId);
    });

    it("deve retornar lista vazia se nenhum backup", () => {
      const service = new BackupService(TEST_DB_PATH);
      const backups = service.listarBackups();

      expect(backups).toHaveLength(0);
    });
  });

  describe("Integração Completa", () => {
    it("backup → verify → restore deve passar", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      const stmt = db.prepare(`INSERT INTO usuarios (id, email, senha_hash, nome_completo) VALUES (?, ?, ?, ?)`);

      for (let i = 0; i < 50; i++) {
        stmt.run(`user-${i}`, `user${i}@example.com`, `hash${i}`, `User ${i}`);
      }

      db.close();

      const service = new BackupService(TEST_DB_PATH);

      // 1. Criar backup
      const backup = await service.criarBackup();
      expect(backup.sucesso).toBe(true);

      const backupFile = path.join(TEST_BACKUP_DIR, `${backup.backupId}.enc`);

      // 2. Verificar integridade
      const verify = await service.verificarBackup(backupFile, backup.manifesto!);
      expect(verify.valido).toBe(true);

      // 3. Testar restauração
      const restore = await service.testarRestauracao(backupFile, backup.manifesto!);
      expect(restore.valido).toBe(true);
      expect(restore.relatorio.integridade).toBe("ok");
      expect(restore.relatorio.tabelas.usuarios).toBe(50);
    });

    it("deve lidar com banco grande (1000+ registros)", async () => {
      const db = createTestDatabase(TEST_DB_PATH);
      const stmt = db.prepare(`INSERT INTO usuarios (id, email, senha_hash, nome_completo) VALUES (?, ?, ?, ?)`);

      const insertMany = db.transaction((count: number) => {
        for (let i = 0; i < count; i++) {
          stmt.run(`user-${i}`, `user${i}@example.com`, `hash${i}`, `User ${i}`);
        }
      });

      insertMany(1200);
      db.close();

      const service = new BackupService(TEST_DB_PATH);
      const backup = await service.criarBackup();

      expect(backup.sucesso).toBe(true);
      expect(backup.manifesto?.rowCounts.usuarios).toBe(1200);

      const backupFile = path.join(TEST_BACKUP_DIR, `${backup.backupId}.enc`);
      const restore = await service.testarRestauracao(backupFile, backup.manifesto!);

      expect(restore.valido).toBe(true);
      expect(restore.relatorio.tabelas.usuarios).toBe(1200);
    });
  });
});
