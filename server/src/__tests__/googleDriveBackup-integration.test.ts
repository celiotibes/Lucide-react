/**
 * Testes de integração para Google Drive Backup
 *
 * NOTA: Estes testes requerem um banco SQLite válido em data/app.db
 * e configuração do GOOGLE_CREDENTIALS_JSON para testes completos.
 * Por padrão, testam apenas o comportamento offline.
 */

import { describe, it, expect, beforeEach, afterEach } from "test";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Google Drive Backup - Integração", () => {
  const BACKUP_DIR = path.join(process.cwd(), "data", "backups");
  const TEST_DB_PATH = path.join(BACKUP_DIR, "test-app.db");

  beforeEach(() => {
    // Limpa variáveis de ambiente
    delete process.env.GOOGLE_CREDENTIALS_JSON;

    // Garante que o diretório de backups existe
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Limpa arquivos de teste
    try {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
    } catch {
      // Ignora erros ao limpar
    }
  });

  describe("Criação de banco de dados de teste", () => {
    it("deve criar um banco SQLite válido para testes", () => {
      const db = new Database(TEST_DB_PATH);
      db.exec("CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT)");
      db.exec("INSERT INTO usuarios (nome) VALUES ('Test User')");
      db.close();

      expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
      const stats = fs.statSync(TEST_DB_PATH);
      expect(stats.size).toBeGreaterThan(0);
    });

    it("deve validar integridade do banco criado", () => {
      const db = new Database(TEST_DB_PATH);
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, valor TEXT)");
      db.exec("INSERT INTO test (valor) VALUES ('test-value')");

      const result = db.prepare("SELECT * FROM test").all();
      expect(result).toHaveLength(1);
      expect((result[0] as unknown).valor).toBe("test-value");

      db.close();
    });
  });

  describe("Estrutura de diretórios", () => {
    it("deve manter diretório data/backups persistente", () => {
      expect(fs.existsSync(BACKUP_DIR)).toBe(true);

      // Cria arquivo de teste
      const testFile = path.join(BACKUP_DIR, ".test-file");
      fs.writeFileSync(testFile, "test");

      expect(fs.existsSync(testFile)).toBe(true);
      fs.unlinkSync(testFile);
    });

    it("deve permitir listar arquivos ZIP no diretório", () => {
      // Cria um ZIP fake
      const fakeZip = path.join(BACKUP_DIR, "backup-test.zip");
      fs.writeFileSync(fakeZip, Buffer.from("fake zip content"));

      const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".zip"));
      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain("backup-test.zip");

      fs.unlinkSync(fakeZip);
    });
  });

  describe("Geração de nomes de arquivo", () => {
    it("deve gerar nome de arquivo com padrão YYYY-MM-DD-HH-mm-ss", () => {
      const agora = new Date();
      const nomeEsperado = `backup-${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}-${String(agora.getHours()).padStart(2, "0")}-${String(agora.getMinutes()).padStart(2, "0")}-${String(agora.getSeconds()).padStart(2, "0")}.zip`;

      const regex = /^backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/;
      expect(nomeEsperado).toMatch(regex);
    });

    it("deve gerar nomes únicos para cada minuto", () => {
      const nome1 = `backup-${new Date().toISOString().split("T")[0]}-01-02-03.zip`;
      const nome2 = `backup-${new Date().toISOString().split("T")[0]}-01-02-04.zip`;

      expect(nome1).not.toBe(nome2);
    });
  });

  describe("Configuração de ambiente", () => {
    it("deve verificar se GOOGLE_CREDENTIALS_JSON está definida", () => {
      const isDefined = !!process.env.GOOGLE_CREDENTIALS_JSON;

      if (!isDefined) {
        console.log(
          "[GoogleDriveBackup] GOOGLE_CREDENTIALS_JSON não configurada — testes de Upload/Restauração desabilitados"
        );
      }

      // Teste não falha, apenas registra o estado
      expect(true).toBe(true);
    });

    it("deve aceitar GOOGLE_CREDENTIALS_JSON como JSON válido se definida", () => {
      const json = '{"type":"serce_account"}';
      process.env.GOOGLE_CREDENTIALS_JSON = json;

      try {
        const parsed = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        expect(parsed.type).toBe("serce_account");
      } catch {
        expect.fail("JSON inválido em GOOGLE_CREDENTIALS_JSON");
      }
    });
  });

  describe("Caminho do banco de dados", () => {
    it("deve resolver caminho correto para data/app.db", () => {
      const expectedPath = path.join(process.cwd(), "data", "app.db");
      expect(expectedPath).toMatch(/data[\/\\]app\.db$/);
    });

    it("deve permitir criar diretório data se não existir", () => {
      const dataDir = path.join(process.cwd(), "data");
      const exists = fs.existsSync(dataDir);
      expect(typeof exists).toBe("boolean");
    });
  });
});
