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
  // __dirname = server/src/domain/erp/__tests__ -> 3 níveis acima chega em server/src
  let schemaPath = path.join(__dirname, "../../../migrations-phase2-auth.sql");

  // Fallback: try from current working directory (cwd pode ser a raiz do
  // repo ou a pasta server/, dependendo de onde os testes são disparados)
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), "server/src/migrations-phase2-auth.sql");
  }
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), "src/migrations-phase2-auth.sql");
  }

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Migration file not found at ${schemaPath}`);
  }

  const schema = fs.readFileSync(schemaPath, "utf-8");

  // Executa o schema inteiro numa única chamada. better-sqlite3 já roda
  // múltiplas statements separadas por ';' e entende comentários SQL
  // (-- e /* */) nativamente — não precisamos (e não devemos) dividir o
  // arquivo manualmente por ';' aqui: um split ingênuo agrupa cada bloco de
  // comentário "-- ===..." com a statement seguinte (não há ';' entre eles),
  // e um filtro que descarta blocos começados por "--" acaba descartando
  // CREATE TABLE inteiras (era exatamente o caso da tabela "sessoes").
  db.exec(schema);

  return db;
}

/**
 * registrarPagamento() sempre grava data_submissao = CURRENT_TIMESTAMP (a
 * data real da submissão). Os testes de janela de período (obterPorPeriodo)
 * não podem depender de "hoje" cair dentro do mês fixo do teste — isso
 * quebraria sempre que o teste rodasse fora daquele mês. Esta função ajusta
 * a data gravada para um valor determinístico após o registro.
 */
function fixarDataSubmissao(db: Database.Database, pagamentoId: string, dataISO: string): void {
  db.prepare("UPDATE pagamentos_apontamentos SET data_submissao = ? WHERE id = ?").run(
    dataISO,
    pagamentoId
  );
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
      }).toThrow("Já existe um pagamento pendente");
    });
  });

  describe("Status Updates", () => {
    it("approves payment", () => {
      const pagamento = guard.registrarPagamento(testContexto, 1, "2026-08", 5000, "pendente");
      fixarDataSubmissao(db, pagamento.id, "2026-08-15 12:00:00");

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
      const pagamento = guard.registrarPagamento(testContexto, 1, "2026-08", 5000, "pendente");
      fixarDataSubmissao(db, pagamento.id, "2026-08-15 12:00:00");

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
      // Register multiple payments, com data_submissao fixada em ordem
      // cronológica (ver fixarDataSubmissao) para que "mais recente
      // primeiro" e as janelas de período sejam determinísticas.
      const p1 = guard.registrarPagamento(testContexto, 1, "2026-06", 4000, "aprovado");
      fixarDataSubmissao(db, p1.id, "2026-06-15 12:00:00");
      const p2 = guard.registrarPagamento(testContexto, 1, "2026-07", 5000, "pendente");
      fixarDataSubmissao(db, p2.id, "2026-07-15 12:00:00");
      const p3 = guard.registrarPagamento(testContexto, 1, "2026-08", 5500, "pendente");
      fixarDataSubmissao(db, p3.id, "2026-08-15 12:00:00");
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
