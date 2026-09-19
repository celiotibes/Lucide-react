import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DuplicatePaymentGuardDB } from "../duplicate-payment-guard-db";
import { ContextoAutenticacao, Usuario } from "../../auth/auth-service";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test database file
const TEST_DB_PATH = path.join(__dirname, "test-payments.db");

/**
 * Create and initialize a test database
 */
function createTestDatabase(): Database.Database {
  // Remove existing test DB
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const db = new Database(TEST_DB_PATH);

  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Read and run schema
  const schemaPath = path.join(__dirname, "../../../migrations-phase2-auth.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");

  // Execute schema
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  statements.forEach((statement) => {
    db.exec(statement);
  });

  return db;
}

const testContexto: ContextoAutenticacao = {
  usuario: {
    id: "user_prestador_1",
    nome: "Paulo Bruxel",
    email: "paulo@example.com",
    role: "prestador",
    prestador_id: 1,
    ativo: true,
    data_criacao: "2026-01-01",
    senha_hash: "hash",
  } as Usuario,
  autenticado: true,
  role: "prestador",
  prestador_id: 1,
};

describe("DuplicatePaymentGuardDB (Phase 2)", () => {
  let db: Database.Database;
  let guard: DuplicatePaymentGuardDB;

  beforeEach(() => {
    db = createTestDatabase();
    guard = new DuplicatePaymentGuardDB(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe("Duplicate Detection", () => {
    it("blocks unauthenticated context", () => {
      const contexto: ContextoAutenticacao = {
        usuario: null,
        autenticado: false,
      };

      const resultado = guard.verificarDuplicacao(contexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(false);
      expect(resultado.motivo).toContain("não autenticado");
    });

    it("allows first submission", () => {
      const resultado = guard.verificarDuplicacao(testContexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(false);
      expect(resultado.motivo).toBeUndefined();
    });

    it("blocks duplicate pendente submission", () => {
      // First submission
      guard.registrarPagamento(testContexto, 1, "2026-08", 5000, "pendente");

      // Second submission attempt
      const resultado = guard.verificarDuplicacao(testContexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(true);
      expect(resultado.motivo).toContain("já existe");
      expect(resultado.pagamentoAnterior?.status).toBe("pendente");
    });

    it("blocks duplicate aprovado submission", () => {
      // First submission that gets approved
      guard.registrarPagamento(testContexto, 1, "2026-08", 5000, "aprovado");

      // Second submission attempt
      const resultado = guard.verificarDuplicacao(testContexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(true);
      expect(resultado.pagamentoAnterior?.status).toBe("aprovado");
    });

    it("allows resubmission after rejection", () => {
      // First submission gets rejected
      guard.registrarPagamento(testContexto, 1, "2026-08", 5000, "rejeitado");

      // Second submission should be allowed
      const resultado = guard.verificarDuplicacao(testContexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(false);
      expect(resultado.motivo).toContain("resubmissão");
      expect(resultado.pagamentoAnterior?.status).toBe("rejeitado");
    });

    it("blocks prestador from submitting for another prestador", () => {
      const outroContexto: ContextoAutenticacao = {
        usuario: {
          id: "user_prestador_2",
          nome: "Other",
          email: "other@example.com",
          role: "prestador",
          prestador_id: 2,
          ativo: true,
          data_criacao: "2026-01-01",
          senha_hash: "hash",
        } as Usuario,
        autenticado: true,
        role: "prestador",
        prestador_id: 2,
      };

      const resultado = guard.verificarDuplicacao(outroContexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(true);
      expect(resultado.motivo).toContain("outro prestador");
    });
  });

  describe("Payment Registration", () => {
    it("registers payment to database", () => {
      const pagamento = guard.registrarPagamento(
        testContexto,
        1,
        "2026-08",
        5000,
        "pendente"
      );

      expect(pagamento.id).toBeDefined();
      expect(pagamento.prestador_id).toBe(1);
      expect(pagamento.mes_referencia).toBe("2026-08");
      expect(pagamento.total_pagar).toBe(5000);
      expect(pagamento.status).toBe("pendente");
      expect(pagamento.usuario_id).toBe("user_prestador_1");
    });

    it("persists payment to database", () => {
      const pagamento = guard.registrarPagamento(
        testContexto,
        1,
        "2026-08",
        5000,
        "pendente"
      );

      // Retrieve from database
      const retrieved = guard.obterPorId(pagamento.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.prestador_id).toBe(1);
      expect(retrieved?.mes_referencia).toBe("2026-08");
      expect(retrieved?.total_pagar).toBe(5000);
    });

    it("enforces UNIQUE constraint on database level", () => {
      // First submission
      guard.registrarPagamento(testContexto, 1, "2026-08", 5000, "pendente");

      // Second submission should fail
      expect(() => {
        guard.registrarPagamento(testContexto, 1, "2026-08", 6000, "pendente");
      }).toThrow("já existe um pagamento pendente");
    });
  });

  describe("Status Updates", () => {
    it("approves payment", () => {
      guard.registrarPagamento(testContexto, 1, "2026-08", 5000, "pendente");

      const success = guard.atualizarStatus(1, "2026-08", "aprovado", "user_admin_1");

      expect(success).toBe(true);

      // Verify in database
      const pagamentos = guard.obterPorPeriodo(
        new Date("2026-08-01"),
        new Date("2026-08-31")
      );
      expect(pagamentos[0].status).toBe("aprovado");
      expect(pagamentos[0].usuario_aprovacao_id).toBe("user_admin_1");
    });

    it("rejects payment with reason", () => {
      guard.registrarPagamento(testContexto, 1, "2026-08", 5000, "pendente");

      const success = guard.atualizarStatus(
        1,
        "2026-08",
        "rejeitado",
        "user_admin_1",
        "Documentação incompleta"
      );

      expect(success).toBe(true);

      // Verify in database
      const pagamentos = guard.obterPorPeriodo(
        new Date("2026-08-01"),
        new Date("2026-08-31")
      );
      expect(pagamentos[0].status).toBe("rejeitado");
      expect(pagamentos[0].motivo_rejeicao).toBe("Documentação incompleta");
    });
  });

  describe("Payment History", () => {
    beforeEach(() => {
      // Register multiple payments
      guard.registrarPagamento(testContexto, 1, "2026-06", 4000, "aprovado");
      guard.registrarPagamento(testContexto, 1, "2026-07", 5000, "pendente");
      guard.registrarPagamento(testContexto, 1, "2026-08", 5500, "pendente");
    });

    it("retrieves prestador history", () => {
      const historico = guard.obterHistoricoPrestador(1);

      expect(historico.length).toBe(3);
      expect(historico[0].mes_referencia).toBe("2026-08"); // Most recent first
      expect(historico[2].mes_referencia).toBe("2026-06");
    });

    it("respects history limit", () => {
      const historico = guard.obterHistoricoPrestador(1, 2);

      expect(historico.length).toBe(2);
    });

    it("retrieves pending payments", () => {
      const pendentes = guard.obterPendentes();

      expect(pendentes.length).toBe(2);
      expect(pendentes.every((p) => p.status === "pendente")).toBe(true);
    });

    it("retrieves payments by period", () => {
      const pagamentos = guard.obterPorPeriodo(
        new Date("2026-07-01"),
        new Date("2026-08-31")
      );

      expect(pagamentos.length).toBe(2);
      expect(pagamentos.every((p) => p.mes_referencia >= "2026-07")).toBe(true);
    });

    it("retrieves all payments", () => {
      const todos = guard.obterTodos();

      expect(todos.length).toBe(3);
    });
  });

  describe("Data Persistence", () => {
    it("persists across service instances", () => {
      // Register payment with first instance
      guard.registrarPagamento(testContexto, 1, "2026-08", 5000, "pendente");

      // Create new service instance with same database
      const guard2 = new DuplicatePaymentGuardDB(db);

      // Verify payment is accessible from new instance
      const resultado = guard2.verificarDuplicacao(testContexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(true);
      expect(resultado.pagamentoAnterior?.id).toBeDefined();
    });

    it("survives service restart", () => {
      // Register payment
      guard.registrarPagamento(testContexto, 1, "2026-08", 5000, "pendente");

      // Close and reopen database
      db.close();
      const db2 = new Database(TEST_DB_PATH);
      db2.pragma("foreign_keys = ON");

      // Create new service with reopened database
      const guard2 = new DuplicatePaymentGuardDB(db2);

      // Verify payment still exists
      const resultado = guard2.verificarDuplicacao(testContexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(true);

      db2.close();
    });
  });
});
