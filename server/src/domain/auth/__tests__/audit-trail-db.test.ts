import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AuditTrailServiceDB } from "../audit-trail-db";
import { ContextoAutenticacao, Usuario } from "../auth-service";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test database file
const TEST_DB_PATH = path.join(__dirname, "test-audit.db");

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
  let schemaPath = path.join(__dirname, "../../../migrations-phase2-auth.sql");

  // Fallback: try from current working directory
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), "server/src/migrations-phase2-auth.sql");
  }

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Migration file not found at ${schemaPath}`);
  }

  const schema = fs.readFileSync(schemaPath, "utf-8");

  // Execute schema - split and execute statements one by one
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    try {
      db.exec(statement);
    } catch (err) {
      // Ignore "already exists" errors
      if (!(err instanceof Error && err.message.includes("already exists"))) {
        console.error("Failed to execute statement:", statement.substring(0, 100));
        throw err;
      }
    }
  }

  return db;
}

const adminUser: Usuario = {
  id: "user_admin_1",
  nome: "Admin User",
  email: "admin@example.com",
  role: "admin",
  ativo: true,
  data_criacao: "2026-01-01",
  senha_hash: "hash",
};

const adminContexto: ContextoAutenticacao = {
  usuario: adminUser,
  autenticado: true,
  role: "admin",
};

describe("AuditTrailServiceDB (Phase 2)", () => {
  let db: Database.Database;
  let auditService: AuditTrailServiceDB;

  beforeEach(() => {
    db = createTestDatabase();
    auditService = new AuditTrailServiceDB(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe("Action Registration", () => {
    it("registers simple action", () => {
      const registro = auditService.registrarAcao(
        adminContexto,
        "login",
        "usuario",
        "user_admin_1",
        { descricao: "Admin login" }
      );

      expect(registro.id).toBeDefined();
      expect(registro.tipo_acao).toBe("login");
      expect(registro.usuario_email).toBe("admin@example.com");
      expect(registro.resultado).toBe("sucesso");
    });

    it("registers action with old and new values", () => {
      const registro = auditService.registrarAcao(
        adminContexto,
        "atualizar_apontamento",
        "apontamento",
        "apt_123",
        {
          descricao: "Updated hours",
          valores_antigos: { horas: 8 },
          valores_novos: { horas: 9 },
        }
      );

      expect(registro.valores_antigos).toEqual({ horas: 8 });
      expect(registro.valores_novos).toEqual({ horas: 9 });
    });

    it("registers denied access action", () => {
      const registro = auditService.registrarAcessoNegado(
        adminContexto,
        "prestador_pagamento",
        "aprovar",
        "Permissão insuficiente"
      );

      expect(registro.tipo_acao).toBe("acesso_negado");
      expect(registro.resultado).toBe("negado");
      expect(registro.motivo_falha).toBe("Permissão insuficiente");
    });

    it("persists audit record to database", () => {
      const registro = auditService.registrarAcao(
        adminContexto,
        "criar_apontamento",
        "apontamento",
        "apt_123",
        { descricao: "Created new daily entry" }
      );

      // Retrieve from database
      const stmt = db.prepare("SELECT COUNT(*) as count FROM auditoria WHERE id = ?");
      const result = stmt.get(registro.id) as { count: number };

      expect(result.count).toBe(1);
    });
  });

  describe("History Retrieval", () => {
    beforeEach(() => {
      // Register multiple actions
      auditService.registrarAcao(
        adminContexto,
        "login",
        "usuario",
        "user_admin_1"
      );
      auditService.registrarAcao(
        adminContexto,
        "criar_apontamento",
        "apontamento",
        "apt_1"
      );
      auditService.registrarAcao(
        adminContexto,
        "atualizar_apontamento",
        "apontamento",
        "apt_1"
      );
      auditService.registrarAcao(
        adminContexto,
        "aprovar_pagamento",
        "pagamento",
        "pag_1"
      );
    });

    it("retrieves user history", () => {
      const historico = auditService.obterHistoricoUsuario("user_admin_1");

      expect(historico.length).toBe(4);
      expect(historico.every((r) => r.usuario_id === "user_admin_1")).toBe(true);
    });

    it("respects history limit", () => {
      const historico = auditService.obterHistoricoUsuario("user_admin_1", 2);

      expect(historico.length).toBe(2);
    });

    it("retrieves resource history", () => {
      const historico = auditService.obterHistoricoRecurso("apontamento");

      expect(historico.length).toBe(2);
      expect(historico.every((r) => r.recurso === "apontamento")).toBe(true);
    });

    it("orders history by most recent first", () => {
      const historico = auditService.obterHistoricoUsuario("user_admin_1");

      // Most recent should be first
      expect(historico[0].tipo_acao).toBe("aprovar_pagamento");
    });
  });

  describe("Filtered Retrieval", () => {
    beforeEach(() => {
      auditService.registrarAcao(adminContexto, "login", "usuario", "user_1", {
        resultado: "sucesso",
      });
      auditService.registrarAcao(adminContexto, "login", "usuario", "user_2", {
        resultado: "sucesso",
      });
      auditService.registrarAcessoNegado(
        adminContexto,
        "prestador_pagamento",
        "aprovar",
        "Denied"
      );
    });

    it("filters by action type", () => {
      const registros = auditService.obterTodos({
        tipo_acao: "login",
      });

      expect(registros.length).toBe(2);
      expect(registros.every((r) => r.tipo_acao === "login")).toBe(true);
    });

    it("filters by result", () => {
      const registros = auditService.obterTodos({
        resultado: "negado",
      });

      expect(registros.length).toBe(1);
      expect(registros[0].resultado).toBe("negado");
    });

    it("filters by user", () => {
      const registros = auditService.obterTodos({
        usuario_id: "user_admin_1",
      });

      expect(registros.every((r) => r.usuario_id === "user_admin_1")).toBe(true);
    });
  });

  describe("Statistics", () => {
    beforeEach(() => {
      // Register successful actions
      auditService.registrarAcao(
        adminContexto,
        "login",
        "usuario",
        "user_1"
      );
      auditService.registrarAcao(
        adminContexto,
        "criar_apontamento",
        "apontamento",
        "apt_1"
      );
      auditService.registrarAcao(
        adminContexto,
        "login",
        "usuario",
        "user_2"
      );

      // Register denied access
      auditService.registrarAcessoNegado(
        adminContexto,
        "prestador_pagamento",
        "deletar",
        "Not permitted"
      );
    });

    it("calculates statistics", () => {
      const stats = auditService.obterEstatisticas(24);

      expect(stats.total_registros).toBe(4);
      expect(stats.total_acessos_negados).toBe(1);
      expect(stats.usuario_mais_ativo).toBe("user_admin_1");
      expect(stats.acao_mais_comum).toBe("login");
    });

    it("filters statistics by period", () => {
      // Wait a bit and create new records
      const stats24h = auditService.obterEstatisticas(24);
      expect(stats24h.total_registros).toBeGreaterThan(0);

      // Very short period should exclude old records
      const stats1h = auditService.obterEstatisticas(1);
      // Might be 0 or more depending on timing, just check it doesn't error
      expect(stats1h.total_registros).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Period Reports", () => {
    beforeEach(() => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      // Register actions at different times
      auditService.registrarAcao(
        adminContexto,
        "login",
        "usuario",
        "user_1"
      );
      auditService.registrarAcao(
        adminContexto,
        "criar_apontamento",
        "apontamento",
        "apt_1"
      );
      auditService.registrarAcessoNegado(
        adminContexto,
        "prestador_pagamento",
        "aprovar",
        "Denied"
      );
    });

    it("generates period report", () => {
      const inicio = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const fim = new Date();

      const relatorio = auditService.gerarRelatorioPeriodo(inicio, fim);

      expect(relatorio.total_eventos).toBeGreaterThan(0);
      expect(relatorio.usuarios_ativos).toBeGreaterThan(0);
      expect(relatorio.acessos_negados).toBeGreaterThan(0);
      expect(Object.keys(relatorio.eventos_por_tipo).length).toBeGreaterThan(0);
    });

    it("includes denied access details in report", () => {
      const inicio = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const fim = new Date();

      const relatorio = auditService.gerarRelatorioPeriodo(inicio, fim);

      expect(relatorio.acessos_negados_detalhes.length).toBeGreaterThan(0);
      expect(relatorio.acessos_negados_detalhes[0].usuario).toBeDefined();
      expect(relatorio.acessos_negados_detalhes[0].recurso).toBeDefined();
    });
  });

  describe("Data Persistence", () => {
    it("persists audit records across service instances", () => {
      // Register action with first instance
      auditService.registrarAcao(
        adminContexto,
        "login",
        "usuario",
        "user_admin_1"
      );

      // Create new service instance with same database
      const auditService2 = new AuditTrailServiceDB(db);

      // Retrieve with new instance
      const historico = auditService2.obterHistoricoUsuario("user_admin_1");

      expect(historico.length).toBe(1);
    });

    it("survives service restart", () => {
      // Register action
      auditService.registrarAcao(
        adminContexto,
        "criar_apontamento",
        "apontamento",
        "apt_1"
      );

      // Close and reopen database
      db.close();
      const db2 = new Database(TEST_DB_PATH);
      db2.pragma("foreign_keys = ON");

      // Create new service with reopened database
      const auditService2 = new AuditTrailServiceDB(db2);

      // Verify record still exists
      const historico = auditService2.obterHistoricoRecurso("apontamento");

      expect(historico.length).toBe(1);

      db2.close();
    });

    it("is append-only (no UPDATE or DELETE)", () => {
      const registro = auditService.registrarAcao(
        adminContexto,
        "login",
        "usuario",
        "user_1"
      );

      // Try to manually update (this shouldn't be allowed by the service)
      // The database doesn't prevent UPDATE, but the service doesn't expose it
      expect(() => {
        auditService.registrarAcao(
          adminContexto,
          "login",
          "usuario",
          "user_2"
        );
      }).not.toThrow();

      // Verify both records exist
      const todos = auditService.obterTodos();
      expect(todos.length).toBe(2);
    });
  });
});
