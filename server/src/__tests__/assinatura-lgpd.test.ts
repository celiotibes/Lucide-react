/**
 * Testes para Assinatura Digital + LGPD Compliance
 *
 * Cobertura:
 * - Certisign: Assinatura digital de PDFs
 * - Ser Pro ID: Validação 2FA via SMS
 * - Auditoria LGPD: Registro de acessos
 * - Direito ao Esquecimento: Anonimização de dados
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CertisignAssinador,
  criarAssinadorCertisign,
} from "../domain/assinatura/certisign-assinador.js";
import {
  SerProIdValidacao,
  criarValidadorSerProId,
} from "../domain/assinatura/ser-pro-id-validacao.js";
import { AuditLGPD, criarAuditLGPD } from "../domain/auditoria/audit-lgpd.js";
import {
  DireitoAoEsquecimento,
  criarDireitoAoEsquecimento,
} from "../domain/gdpr/direito-ao-esquecimento.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test database file
const TEST_DB_PATH = path.join(__dirname, `test-assinatura-lgpd-${process.pid}.db`);

function createTestDatabase(): Database.Database {
  // Remove existing test DB
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");

  // Read and run migrations
  let schemaPath = path.join(__dirname, "../migrations-phase10-assinatura-lgpd.sql");

  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), "server/src/migrations-phase10-assinatura-lgpd.sql");
  }

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Migration file not found at ${schemaPath}`);
  }

  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  // Also create minimal usuarios table for foreign keys
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT UNIQUE,
      role TEXT
    );
  `);

  return db;
}

describe("Assinatura Digital + LGPD", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  // ====== CERTISIGN TESTS ======
  describe("CertisignAssinador", () => {
    it("should create a CertisignAssinador instance", () => {
      const assinador = criarAssinadorCertisign("test-api-key");
      expect(assinador).toBeDefined();
      expect(assinador).toBeInstanceOf(CertisignAssinador);
    });

    it("should throw error if API key is missing", () => {
      expect(() => {
        new CertisignAssinador({ apiKey: "" });
      }).toThrow();
    });

    it("should sign a PDF buffer", async () => {
      const assinador = criarAssinadorCertisign("test-api-key");
      const pdfBuffer = Buffer.from("fake pdf content");

      const resultado = await assinador.assinarPDF(
        pdfBuffer,
        "test-serial",
        "password"
      );

      expect(resultado.sucesso).toBe(true);
      expect(resultado.pdf_assinado).toBeDefined();
      expect(resultado.hash_assinatura).toBeDefined();
      expect(resultado.timestamp).toBeDefined();
    });

    it("should return error if PDF is empty", async () => {
      const assinador = criarAssinadorCertisign("test-api-key");
      const emptyBuffer = Buffer.from("");

      const resultado = await assinador.assinarPDF(
        emptyBuffer,
        "test-serial"
      );

      expect(resultado.sucesso).toBe(false);
      expect(resultado.mensagem_erro).toBeDefined();
      expect(resultado.codigo_erro).toBe("INVALID_PDF");
    });

    it("should return error if serial is missing", async () => {
      const assinador = criarAssinadorCertisign("test-api-key");
      const pdfBuffer = Buffer.from("fake pdf");

      const resultado = await assinador.assinarPDF(pdfBuffer, "");

      expect(resultado.sucesso).toBe(false);
      expect(resultado.codigo_erro).toBe("MISSING_SERIAL");
    });

    it("should validate certificate", async () => {
      const assinador = criarAssinadorCertisign("test-api-key");

      const validacao = await assinador.validarCertificado("test-serial");

      expect(validacao.valido).toBe(true);
      expect(validacao.numero_serie).toBe("test-serial");
      expect(validacao.titular).toBeDefined();
      expect(validacao.valido_ate).toBeInstanceOf(Date);
    });

    it("should return error if certificate serial is invalid", async () => {
      const assinador = criarAssinadorCertisign("test-api-key");

      const validacao = await assinador.validarCertificado("");

      expect(validacao.valido).toBe(false);
      expect(validacao.motivo_invalido).toBeDefined();
    });
  });

  // ====== SER PRO ID 2FA TESTS ======
  describe("SerProIdValidacao", () => {
    it("should create a SerProIdValidacao instance", () => {
      const validador = criarValidadorSerProId("test-api-key", "12345678901");
      expect(validador).toBeDefined();
      expect(validador).toBeInstanceOf(SerProIdValidacao);
    });

    it("should throw error if API key is missing", () => {
      expect(() => {
        new SerProIdValidacao({ apiKey: "" });
      }).toThrow();
    });

    it("should send SMS challenge", async () => {
      const validador = criarValidadorSerProId("test-api-key", "12345678901");

      const desafio = await validador.enviarDesafioSMS(
        "12345678901",
        "assinatura_relatorio"
      );

      expect(desafio.sucesso).toBe(true);
      expect(desafio.nonce).toBeDefined();
      expect(desafio.telefone_mascarado).toBeDefined();
      expect(desafio.tentativas_restantes).toBe(3);
      expect(desafio.expira_em).toBeDefined();
    });

    it("should return error if CPF is invalid", async () => {
      const validador = criarValidadorSerProId("test-api-key", "12345678901");

      const desafio = await validador.enviarDesafioSMS("invalid-cpf", "contexto");

      expect(desafio.sucesso).toBe(false);
      expect(desafio.mensagem_erro).toBeDefined();
    });

    it("should validate SMS code correctly", async () => {
      const validador = criarValidadorSerProId("test-api-key", "12345678901");

      // Send challenge first
      const desafio = await validador.enviarDesafioSMS(
        "12345678901",
        "contexto"
      );

      expect(desafio.sucesso).toBe(true);

      // Validate with correct code
      const validacao = await validador.validarRespostaSMS(
        desafio.nonce,
        "123456"
      );

      expect(validacao.sucesso).toBe(true);
      expect(validacao.nonce_validado).toBe(desafio.nonce);
    });

    it("should reject invalid SMS code", async () => {
      const validador = criarValidadorSerProId("test-api-key", "12345678901");

      const desafio = await validador.enviarDesafioSMS(
        "12345678901",
        "contexto"
      );

      const validacao = await validador.validarRespostaSMS(
        desafio.nonce,
        "999999"
      );

      expect(validacao.sucesso).toBe(false);
      expect(validacao.tentativas_restantes).toBe(2);
    });

    it("should expire challenge after attempts", async () => {
      const validador = criarValidadorSerProId("test-api-key", "12345678901");

      const desafio = await validador.enviarDesafioSMS(
        "12345678901",
        "contexto"
      );

      // Try 3 times with wrong code
      for (let i = 0; i < 3; i++) {
        const validacao = await validador.validarRespostaSMS(
          desafio.nonce,
          "999999"
        );
        // The last one should still exist but fail
        if (i === 2) {
          expect(validacao.tentativas_restantes).toBe(0);
        }
      }

      // After 3 failed attempts, challenge should be deleted
      const status = await validador.obterStatusDesafio(desafio.nonce);
      expect(status).toBeNull(); // Challenge should be deleted after max attempts
    });

    it("should get challenge status", async () => {
      const validador = criarValidadorSerProId("test-api-key", "12345678901");

      const desafio = await validador.enviarDesafioSMS(
        "12345678901",
        "contexto"
      );

      const status = await validador.obterStatusDesafio(desafio.nonce);

      expect(status).toBeDefined();
      expect(status!.nonce).toBe(desafio.nonce);
      expect(status!.validado).toBe(false);
      expect(status!.ativo).toBe(true);
      expect(status!.tentativas_restantes).toBe(3);
    });

    it("should clear challenge after use", async () => {
      const validador = criarValidadorSerProId("test-api-key", "12345678901");

      const desafio = await validador.enviarDesafioSMS(
        "12345678901",
        "contexto"
      );

      validador.limparDesafio(desafio.nonce);

      const status = await validador.obterStatusDesafio(desafio.nonce);
      expect(status).toBeNull();
    });
  });

  // ====== AUDIT LGPD TESTS ======
  describe("AuditLGPD", () => {
    beforeEach(() => {
      // Create test user for foreign key constraint
      db.prepare("INSERT INTO usuarios VALUES (?, ?, ?, ?)").run(
        "user123",
        "Teste User",
        "teste@example.com",
        "contador"
      );
    });

    it("should create an AuditLGPD instance", () => {
      const audit = criarAuditLGPD(db);
      expect(audit).toBeDefined();
      expect(audit).toBeInstanceOf(AuditLGPD);
    });

    it("should register audit action", () => {
      const audit = criarAuditLGPD(db);

      const registro = audit.registrarAcao({
        usuario_id: "user123",
        acao: "INSERT",
        tabela: "usuarios",
        registro_id: "registro123",
        dados_novos: {
          nome: "João Silva",
          email: "joao@example.com",
          cpf: "123.456.789-10",
        },
      });

      expect(registro.id).toBeDefined();
      expect(registro.usuario_id).toBe("user123");
      expect(registro.acao).toBe("INSERT");
      expect(registro.contem_dados_sensveis).toBe(true);
      expect(registro.tipo_dado_sensvel).toContain("CPF");
      expect(registro.tipo_dado_sensvel).toContain("EMAIL");
    });

    it("should detect sensitive data in fields", () => {
      const audit = criarAuditLGPD(db);

      const registro = audit.registrarAcao({
        usuario_id: "user123",
        acao: "UPDATE",
        tabela: "inquilinos",
        registro_id: "inq123",
        dados_antigos: {
          cpf: "123.456.789-10",
          nome: "João",
        },
        dados_novos: {
          cpf: "123.456.789-11",
          nome: "João Silva",
        },
      });

      expect(registro.contem_dados_sensveis).toBe(true);
    });

    it("should fetch audit history by record", () => {
      const audit = criarAuditLGPD(db);

      // Create multiple audit entries
      for (let i = 0; i < 5; i++) {
        audit.registrarAcao({
          usuario_id: "user123",
          acao: "UPDATE",
          tabela: "usuarios",
          registro_id: "user456",
          dados_novos: { campo: `valor${i}` },
        });
      }

      const historico = audit.obterHistorico("usuarios", "user456", 10);

      expect(historico.length).toBe(5);
      expect(historico[0].tabela).toBe("usuarios");
      expect(historico[0].registro_id).toBe("user456");
    });

    it("should fetch user access history", () => {
      const audit = criarAuditLGPD(db);

      audit.registrarAcao({
        usuario_id: "user123",
        acao: "VIEW",
        tabela: "usuarios",
        registro_id: "user456",
      });

      audit.registrarAcao({
        usuario_id: "user123",
        acao: "EXPORT",
        tabela: "relatorios",
        registro_id: "rel789",
      });

      const acessos = audit.obterAcessosUsuario("user123", 30, 100);

      expect(acessos.length).toBeGreaterThanOrEqual(2);
      expect(acessos.every((r) => r.usuario_id === "user123")).toBe(true);
    });

    it("should fetch sensitive data accesses", () => {
      const audit = criarAuditLGPD(db);

      audit.registrarAcao({
        usuario_id: "user123",
        acao: "VIEW",
        tabela: "usuarios",
        dados_novos: {
          email: "user@example.com",
          cpf: "123.456.789-10",
        },
      });

      const acessos = audit.obterAcessosDadosSensveis(30, 100);

      expect(acessos.length).toBeGreaterThan(0);
      expect(acessos[0].contem_dados_sensveis).toBe(true);
    });
  });

  // ====== DIREITO AO ESQUECIMENTO TESTS ======
  describe("DireitoAoEsquecimento", () => {
    beforeEach(() => {
      // Create test tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS inquilinos (
          id TEXT PRIMARY KEY,
          nome TEXT,
          email TEXT,
          telefone TEXT,
          cpf TEXT,
          data_nascimento TEXT
        );
        CREATE TABLE IF NOT EXISTS prestadores (
          id TEXT PRIMARY KEY,
          nome TEXT,
          email TEXT,
          telefone TEXT,
          cnpj TEXT
        );
        CREATE TABLE IF NOT EXISTS fornecedores (
          id TEXT PRIMARY KEY,
          nome TEXT,
          email TEXT,
          telefone TEXT,
          cnpj TEXT
        );
      `);

      // Insert test data
      db.prepare(
        "INSERT INTO inquilinos VALUES (?, ?, ?, ?, ?, ?)"
      ).run("inq1", "João Silva", "joao@example.com", "11999999999", "123.456.789-10", "1990-01-01");

      db.prepare(
        "INSERT INTO prestadores VALUES (?, ?, ?, ?, ?)"
      ).run("pres1", "Maria Santos", "maria@example.com", "11988888888", "12.345.678/0001-90");
    });

    it("should create a DireitoAoEsquecimento instance", () => {
      const esquecimento = criarDireitoAoEsquecimento(db);
      expect(esquecimento).toBeDefined();
      expect(esquecimento).toBeInstanceOf(DireitoAoEsquecimento);
    });

    it("should anonymize a person", async () => {
      const esquecimento = criarDireitoAoEsquecimento(db);

      const resultado = await esquecimento.anonimizarPessoa(
        "INQUILINO",
        "inq1",
        "user123"
      );

      expect(resultado.sucesso).toBe(true);
      expect(resultado.pessoa_id).toBe("inq1");
      expect(resultado.campos_anonimizados.length).toBeGreaterThan(0);
    });

    it("should check if person was anonymized", async () => {
      const esquecimento = criarDireitoAoEsquecimento(db);

      await esquecimento.anonimizarPessoa("INQUILINO", "inq1", "user123");

      const foiAnon = esquecimento.foiAnonimizado("INQUILINO", "inq1");

      expect(foiAnon).toBe(true);
    });

    it("should export person data", async () => {
      const esquecimento = criarDireitoAoEsquecimento(db);

      const dados = await esquecimento.exportarDadosPessoa("INQUILINO", "inq1");

      expect(dados).toBeDefined();
      expect(dados!.pessoa_tipo).toBe("INQUILINO");
      expect(dados!.pessoa_id).toBe("inq1");
      expect(dados!.tabelas).toBeDefined();
    });

    it("should fetch anonymization history", async () => {
      const esquecimento = criarDireitoAoEsquecimento(db);

      // Create usuario first for foreign key
      db.prepare("INSERT INTO usuarios VALUES (?, ?, ?, ?)").run(
        "user123",
        "Teste User",
        "teste@example.com",
        "contador"
      );

      const res1 = await esquecimento.anonimizarPessoa("INQUILINO", "inq1", "user123");
      expect(res1.sucesso).toBe(true);

      const res2 = await esquecimento.anonimizarPessoa("PRESTADOR", "pres1", "user123");
      expect(res2.sucesso).toBe(true);

      const historico = esquecimento.obterHistoricoAnonimizacoes(
        "INQUILINO",
        10
      );

      expect(historico.length).toBeGreaterThan(0);
      expect(historico.every((r: any) => r.pessoa_tipo === "INQUILINO")).toBe(true);
    });

    it("should return error if person not found", async () => {
      const esquecimento = criarDireitoAoEsquecimento(db);

      const resultado = await esquecimento.anonimizarPessoa(
        "INQUILINO",
        "nonexistent"
      );

      expect(resultado.sucesso).toBe(false);
      expect(resultado.mensagem_erro).toBeDefined();
    });
  });

  // ====== INTEGRATION TESTS ======
  describe("Integration Tests", () => {
    beforeEach(() => {
      // Create test user for foreign key constraint
      try {
        db.prepare("INSERT INTO usuarios VALUES (?, ?, ?, ?)").run(
          "user123",
          "Teste User",
          "teste@example.com",
          "contador"
        );
      } catch {
        // User might already exist
      }
    });

    it("should complete full signature workflow", async () => {
      const assinador = criarAssinadorCertisign("test-api-key");
      const validador = criarValidadorSerProId("test-api-key", "12345678901");
      const audit = criarAuditLGPD(db);

      // Step 1: Send SMS challenge
      const desafio = await validador.enviarDesafioSMS(
        "12345678901",
        "assinatura_relatorio_dre_2024_01"
      );
      expect(desafio.sucesso).toBe(true);

      // Step 2: Validate SMS
      const validacao = await validador.validarRespostaSMS(
        desafio.nonce,
        "123456"
      );
      expect(validacao.sucesso).toBe(true);

      // Step 3: Sign PDF
      const pdfBuffer = Buffer.from("fake pdf content");
      const resultado = await assinador.assinarPDF(
        pdfBuffer,
        "test-serial"
      );
      expect(resultado.sucesso).toBe(true);

      // Step 4: Register in audit
      const registroAudit = audit.registrarAcao({
        usuario_id: "user123",
        acao: "ASSINATURA_DIGITAL",
        tabela: "assinaturas_digitais",
        dados_novos: {
          relatorio_tipo: "DRE",
          periodo: "2024-01",
          timestamp: resultado.timestamp,
        },
        contem_dados_sensveis: true,
        tipo_dado_sensvel: "CPF",
      });

      expect(registroAudit.id).toBeDefined();
      expect(registroAudit.contem_dados_sensveis).toBe(true);
    });

    it("should complete full GDPR workflow", async () => {
      const esquecimento = criarDireitoAoEsquecimento(db);
      const audit = criarAuditLGPD(db);

      // Create test user first
      try {
        db.prepare("INSERT INTO usuarios VALUES (?, ?, ?, ?)").run(
          "user123",
          "Teste User",
          "teste@example.com",
          "contador"
        );
      } catch {
        // User might already exist
      }

      // Create test data (should match the beforeEach in DireitoAoEsquecimento tests)
      db.exec(`
        DROP TABLE IF EXISTS inquilinos;
        CREATE TABLE IF NOT EXISTS inquilinos (
          id TEXT PRIMARY KEY,
          nome TEXT,
          email TEXT,
          cpf TEXT,
          data_nascimento TEXT
        );
      `);
      db.prepare(
        "INSERT INTO inquilinos VALUES (?, ?, ?, ?, ?)"
      ).run("inq1_gdpr", "João", "joao@example.com", "123.456.789-10", "1990-01-01");

      // Step 1: Export data
      const dados = await esquecimento.exportarDadosPessoa("INQUILINO", "inq1_gdpr");
      expect(dados).toBeDefined();

      // Step 2: Anonymize
      const anonResult = await esquecimento.anonimizarPessoa(
        "INQUILINO",
        "inq1_gdpr",
        "user123"
      );
      expect(anonResult.sucesso).toBe(true);

      // Step 3: Register in audit
      const registroAudit = audit.registrarAcao({
        usuario_id: "user123",
        acao: "ANONIMIZACAO",
        tabela: "pessoas_anonimizadas",
        registro_id: "inq1_gdpr",
        contem_dados_sensveis: true,
      });

      expect(registroAudit.id).toBeDefined();
    });
  });
});
