import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AuthServiceDB } from "../auth-service-db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test database file
const TEST_DB_PATH = path.join(__dirname, "test-auth.db");

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

  // Fallback: try from current working directory (for tests run from different locations)
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), "server/src/migrations-phase2-auth.sql");
  }

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Migration file not found at ${schemaPath}`);
  }

  const schema = fs.readFileSync(schemaPath, "utf-8");

  // Execute schema - use db.exec() to execute the full script
  try {
    db.exec(schema);
  } catch (e) {
    // If exec fails, try splitting and executing statements one by one
    const statements = schema
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    for (const statement of statements) {
      try {
        db.exec(statement);
      } catch (err) {
        console.error("Failed to execute statement:", statement.substring(0, 100));
        throw err;
      }
    }
  }

  return db;
}

describe("AuthServiceDB (Phase 2)", () => {
  let db: Database.Database;
  let authService: AuthServiceDB;

  beforeEach(() => {
    db = createTestDatabase();
    authService = new AuthServiceDB(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe("Authentication", () => {
    it("autenticates valid user and creates session", () => {
      const resultado = authService.autenticar("admin@example.com", "senha123");

      expect(resultado.sucesso).toBe(true);
      expect(resultado.token).toBeDefined();
      expect(resultado.erro).toBeUndefined();
    });

    it("rejects invalid email", () => {
      const resultado = authService.autenticar(
        "invalido@example.com",
        "senha123"
      );

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Email ou senha");
    });

    it("rejects empty password", () => {
      const resultado = authService.autenticar("admin@example.com", "");

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Email ou senha");
    });

    it("rejects inactive user", () => {
      // Make user inactive
      const updateStmt = db.prepare("UPDATE usuarios SET ativo = false WHERE email = ?");
      updateStmt.run("admin@example.com");

      const resultado = authService.autenticar("admin@example.com", "senha123");

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Email ou senha");
    });

    it("protects against brute force after 5 attempts", () => {
      const email = "admin@example.com";

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        authService.autenticar(email, "wrong_password");
      }

      // 6th attempt with correct password should still fail
      const resultado = authService.autenticar(email, "senha123");

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Muitas tentativas");
    });

    it("persists session to database", () => {
      const resultado = authService.autenticar("admin@example.com", "senha123");

      expect(resultado.sucesso).toBe(true);

      // Verify session exists in database
      const stmt = db.prepare(
        "SELECT COUNT(*) as count FROM sessoes WHERE token = ?"
      );
      const result = stmt.get(resultado.token!) as { count: number };

      expect(result.count).toBe(1);
    });
  });

  describe("Token Validation", () => {
    it("validates active session token", () => {
      const authResult = authService.autenticar("admin@example.com", "senha123");
      expect(authResult.sucesso).toBe(true);

      const contexto = authService.validarToken(authResult.token!);

      expect(contexto).not.toBeNull();
      expect(contexto?.autenticado).toBe(true);
      expect(contexto?.usuario?.email).toBe("admin@example.com");
      expect(contexto?.usuario?.role).toBe("admin");
    });

    it("rejects invalid token", () => {
      const contexto = authService.validarToken("invalid_token_12345");

      expect(contexto).toBeNull();
    });

    it("rejects expired session", () => {
      const authResult = authService.autenticar("admin@example.com", "senha123");
      expect(authResult.sucesso).toBe(true);

      // Mark session as expired in database
      const updateStmt = db.prepare(
        "UPDATE sessoes SET data_expiracao = datetime('now', '-1 hour') WHERE token = ?"
      );
      updateStmt.run(authResult.token!);

      const contexto = authService.validarToken(authResult.token!);

      expect(contexto).toBeNull();
    });

    it("returns user data in valid context", () => {
      const authResult = authService.autenticar("paulo@example.com", "senha123");
      expect(authResult.sucesso).toBe(true);

      const contexto = authService.validarToken(authResult.token!);

      expect(contexto?.usuario?.nome).toBe("Paulo Bruxel");
      expect(contexto?.usuario?.prestador_id).toBe(1);
      expect(contexto?.role).toBe("prestador");
    });
  });

  describe("Permissions", () => {
    it("admin has all permissions", () => {
      const authResult = authService.autenticar("admin@example.com", "senha123");
      const contexto = authService.validarToken(authResult.token!);

      expect(contexto?.autenticado).toBe(true);

      expect(authService.temPermissao(contexto!, "prestador_contrato", "criar")).toBe(
        true
      );
      expect(authService.temPermissao(contexto!, "prestador_contrato", "atualizar")).toBe(
        true
      );
      expect(authService.temPermissao(contexto!, "prestador_pagamento", "aprovar")).toBe(
        true
      );
      expect(authService.temPermissao(contexto!, "auditoria", "ler")).toBe(true);
    });

    it("gestor can read and approve payments", () => {
      const authResult = authService.autenticar("gestor@example.com", "senha123");
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.temPermissao(contexto!, "prestador_pagamento", "ler")).toBe(
        true
      );
      expect(authService.temPermissao(contexto!, "prestador_pagamento", "aprovar")).toBe(
        true
      );
    });

    it("prestador can only create apontamentos", () => {
      const authResult = authService.autenticar("paulo@example.com", "senha123");
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.temPermissao(contexto!, "prestador_apontamento", "criar")).toBe(
        true
      );
      expect(authService.temPermissao(contexto!, "prestador_apontamento", "ler")).toBe(
        true
      );
      expect(authService.temPermissao(contexto!, "prestador_pagamento", "aprovar")).toBe(
        false
      );
    });
  });

  describe("Data Access Control", () => {
    it("prestador can only read own data", () => {
      const authResult = authService.autenticar("paulo@example.com", "senha123");
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.podeLerPrestador(contexto!, 1)).toBe(true);
      expect(authService.podeLerPrestador(contexto!, 2)).toBe(false);
    });

    it("admin can read any prestador data", () => {
      const authResult = authService.autenticar("admin@example.com", "senha123");
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.podeLerPrestador(contexto!, 1)).toBe(true);
      expect(authService.podeLerPrestador(contexto!, 2)).toBe(true);
      expect(authService.podeLerPrestador(contexto!, 999)).toBe(true);
    });

    it("gestor can modify any prestador apontamentos", () => {
      const authResult = authService.autenticar("gestor@example.com", "senha123");
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.podeModificarApontamentos(contexto!, 1)).toBe(true);
      expect(authService.podeModificarApontamentos(contexto!, 2)).toBe(true);
    });

    it("prestador can only modify own apontamentos", () => {
      const authResult = authService.autenticar("paulo@example.com", "senha123");
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.podeModificarApontamentos(contexto!, 1)).toBe(true);
      expect(authService.podeModificarApontamentos(contexto!, 2)).toBe(false);
    });
  });

  describe("Logout", () => {
    it("invalidates session on logout", () => {
      const authResult = authService.autenticar("admin@example.com", "senha123");
      const token = authResult.token!;

      // Verify session is valid
      let contexto = authService.validarToken(token);
      expect(contexto?.autenticado).toBe(true);

      // Logout
      authService.logout(token);

      // Verify session is now invalid
      contexto = authService.validarToken(token);
      expect(contexto).toBeNull();
    });
  });

  describe("Session Cleanup", () => {
    it("cleans up expired sessions", () => {
      const authResult = authService.autenticar("admin@example.com", "senha123");

      // Insert expired session manually
      const insertStmt = db.prepare(
        `INSERT INTO sessoes (token, usuario_id, data_expiracao, ativo)
         VALUES (?, ?, datetime('now', '-1 hour'), true)`
      );
      insertStmt.run("expired_token", "user_admin_1");

      // Verify both sessions exist
      let countStmt = db.prepare("SELECT COUNT(*) as count FROM sessoes");
      let result = countStmt.get() as { count: number };
      expect(result.count).toBe(2);

      // Run cleanup
      const deleted = authService.limparSessoesExpiradas();

      // Verify expired session was deleted
      countStmt = db.prepare("SELECT COUNT(*) as count FROM sessoes");
      result = countStmt.get() as { count: number };
      expect(result.count).toBe(1);
      expect(deleted).toBe(1);
    });
  });
});
