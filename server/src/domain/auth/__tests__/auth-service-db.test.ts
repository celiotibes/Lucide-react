import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AuthServiceDB } from "../auth-service-db";
import { gerarHashSenha } from "../password";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test database file
const TEST_DB_PATH = path.join(__dirname, `test-auth-${process.pid}.db`);

const SENHA_PADRAO = "senha123";

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
 * A migration não seeda mais usuários demo (ver nota em
 * migrations-phase2-auth.sql — seedar usuário com senha pública conhecida
 * seria recriar, no dado, o mesmo problema que esta fase corrigiu no
 * código). Cada teste insere seus próprios usuários fixos, com hash real
 * calculado pela mesma implementação usada em produção — nunca uma string
 * mágica hardcoded, para o teste continuar válido se o formato do hash
 * mudar.
 */
async function seedUsuarios(db: Database.Database): Promise<void> {
  const hash = await gerarHashSenha(SENHA_PADRAO);
  const inserir = db.prepare(
    `INSERT INTO usuarios (id, nome, email, senha_hash, role, prestador_id, ativo, data_criacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, '2026-01-01')`,
  );
  inserir.run("user_titular_1", "Titular User", "titular@example.com", hash, "titular", null, 1);
  inserir.run("user_administrador_1", "Administrador User", "administrador@example.com", hash, "administrador", null, 1);
  inserir.run("user_contador_1", "Contador User", "contador@example.com", hash, "contador", null, 1);
  inserir.run("user_economista_1", "Economista User", "economista@example.com", hash, "economista", null, 1);
  // Vinculado a um prestador (módulo de pagamento a prestadores) — qualquer
  // um dos 4 papéis pode ter esse vínculo; usamos "perito" aqui só porque é
  // um caso plausível (perito que viaja para vistoria, diária + km).
  db.prepare(
    `INSERT OR IGNORE INTO prestadores (id, usuario_id, nome, email, ativo, data_criacao)
     VALUES (1, NULL, 'Paulo Bruxel', 'paulo@example.com', true, '2026-01-01')`,
  ).run();
  inserir.run("user_perito_1", "Paulo Bruxel", "paulo@example.com", hash, "perito", 1, 1);
}

describe("AuthServiceDB (Phase 2)", () => {
  let db: Database.Database;
  let authService: AuthServiceDB;

  beforeEach(async () => {
    db = createTestDatabase();
    await seedUsuarios(db);
    authService = new AuthServiceDB(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe("Authentication", () => {
    it("autenticates valid user and creates session", async () => {
      const resultado = await authService.autenticar("titular@example.com", SENHA_PADRAO);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.token).toBeDefined();
      expect(resultado.erro).toBeUndefined();
    });

    it("rejects invalid email", async () => {
      const resultado = await authService.autenticar("invalido@example.com", SENHA_PADRAO);

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Email ou senha");
      expect(resultado.motivoInterno).toBe("usuario_nao_encontrado");
      expect(resultado.usuarioParaAuditoria).toBeUndefined();
    });

    it("rejects empty password", async () => {
      const resultado = await authService.autenticar("titular@example.com", "");

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Email ou senha");
    });

    it("rejects wrong password without revealing that the user exists", async () => {
      const resultado = await authService.autenticar("titular@example.com", "senha_errada");

      expect(resultado.sucesso).toBe(false);
      // Mensagem externa idêntica à de e-mail inexistente — não dá pra
      // distinguir os dois casos pela resposta.
      expect(resultado.erro).toBe("Email ou senha inválidos");
      expect(resultado.motivoInterno).toBe("senha_invalida");
      // Só o campo interno (nunca serializado na resposta HTTP) sabe que a
      // conta existe — usado exclusivamente para a trilha de auditoria.
      expect(resultado.usuarioParaAuditoria?.id).toBe("user_titular_1");
    });

    it("rejects inactive user", async () => {
      // Make user inactive
      const updateStmt = db.prepare("UPDATE usuarios SET ativo = false WHERE email = ?");
      updateStmt.run("titular@example.com");

      const resultado = await authService.autenticar("titular@example.com", SENHA_PADRAO);

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Email ou senha");
      expect(resultado.motivoInterno).toBe("usuario_inativo");
    });

    it("protects against brute force after 5 attempts", async () => {
      const email = "titular@example.com";

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await authService.autenticar(email, "wrong_password");
      }

      // 6th attempt with correct password should still fail
      const resultado = await authService.autenticar(email, SENHA_PADRAO);

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Muitas tentativas");
    });

    it("persists session to database", async () => {
      const resultado = await authService.autenticar("titular@example.com", SENHA_PADRAO);

      expect(resultado.sucesso).toBe(true);

      // Verify session exists in database
      const stmt = db.prepare(
        "SELECT COUNT(*) as count FROM sessoes WHERE token = ?"
      );
      const result = stmt.get(resultado.token!) as { count: number };

      expect(result.count).toBe(1);
    });

    it("persists endereco_ip and user_agent on the session", async () => {
      const resultado = await authService.autenticar("titular@example.com", SENHA_PADRAO, {
        enderecoIp: "203.0.113.9",
        userAgent: "vitest-agent",
      });
      expect(resultado.sucesso).toBe(true);

      const stmt = db.prepare(
        "SELECT endereco_ip, user_agent FROM sessoes WHERE token = ?"
      );
      const sessao = stmt.get(resultado.token!) as { endereco_ip: string; user_agent: string };

      expect(sessao.endereco_ip).toBe("203.0.113.9");
      expect(sessao.user_agent).toBe("vitest-agent");
    });
  });

  describe("Token Validation", () => {
    it("validates active session token", async () => {
      const authResult = await authService.autenticar("titular@example.com", SENHA_PADRAO);
      expect(authResult.sucesso).toBe(true);

      const contexto = authService.validarToken(authResult.token!);

      expect(contexto).not.toBeNull();
      expect(contexto?.autenticado).toBe(true);
      expect(contexto?.usuario?.email).toBe("titular@example.com");
      expect(contexto?.usuario?.role).toBe("titular");
    });

    it("rejects invalid token", () => {
      const contexto = authService.validarToken("invalid_token_12345");

      expect(contexto).toBeNull();
    });

    it("rejects a token with a forged/tampered signature", async () => {
      const authResult = await authService.autenticar("titular@example.com", SENHA_PADRAO);
      expect(authResult.sucesso).toBe(true);

      const [aleatorio] = authResult.token!.split(".");
      // 64 caracteres hex (mesmo tamanho de um HMAC-SHA256 real) só que
      // errado — exercita a comparação da assinatura, não só a checagem de
      // tamanho.
      const tokenForjado = `${aleatorio}.${"0".repeat(64)}`;

      expect(authService.validarToken(tokenForjado)).toBeNull();
    });

    it("rejects expired session", async () => {
      const authResult = await authService.autenticar("titular@example.com", SENHA_PADRAO);
      expect(authResult.sucesso).toBe(true);

      // Mark session as expired in database
      const updateStmt = db.prepare(
        "UPDATE sessoes SET data_expiracao = datetime('now', '-1 hour') WHERE token = ?"
      );
      updateStmt.run(authResult.token!);

      const contexto = authService.validarToken(authResult.token!);

      expect(contexto).toBeNull();
    });

    it("returns user data in valid context", async () => {
      const authResult = await authService.autenticar("paulo@example.com", SENHA_PADRAO);
      expect(authResult.sucesso).toBe(true);

      const contexto = authService.validarToken(authResult.token!);

      expect(contexto?.usuario?.nome).toBe("Paulo Bruxel");
      expect(contexto?.usuario?.prestador_id).toBe(1);
      expect(contexto?.role).toBe("perito");
    });
  });

  describe("Roles", () => {
    it.each(["titular", "administrador", "contador", "perito", "advogado", "economista"] as const)(
      "accepts '%s' as a valid role in the database",
      (role) => {
        expect(() => {
          db.prepare(
            `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
             VALUES (?, ?, ?, 'x', ?, true, '2026-01-01')`,
          ).run(`user_${role}_check`, `${role} check`, `${role}.check@example.com`, role);
        }).not.toThrow();
      },
    );

    it("rejects an old/invalid role value", () => {
      expect(() => {
        db.prepare(
          `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
           VALUES ('user_x', 'X', 'x@example.com', 'x', 'admin', true, '2026-01-01')`,
        ).run();
      }).toThrow();
    });
  });

  describe("Permissions", () => {
    it("titular has all permissions, including managing users and auditing", async () => {
      const authResult = await authService.autenticar("titular@example.com", SENHA_PADRAO);
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
      expect(authService.temPermissao(contexto!, "usuario", "criar")).toBe(true);
    });

    it("contador can read and approve payments, but not manage users", async () => {
      const authResult = await authService.autenticar("contador@example.com", SENHA_PADRAO);
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.temPermissao(contexto!, "prestador_pagamento", "ler")).toBe(
        true
      );
      expect(authService.temPermissao(contexto!, "prestador_pagamento", "aprovar")).toBe(
        true
      );
      expect(authService.temPermissao(contexto!, "usuario", "criar")).toBe(false);
    });

    it("administrador has the same broad permissions as titular, including managing users and auditing", async () => {
      const authResult = await authService.autenticar("administrador@example.com", SENHA_PADRAO);
      const contexto = authService.validarToken(authResult.token!);

      expect(contexto?.autenticado).toBe(true);
      expect(authService.temPermissao(contexto!, "prestador_pagamento", "aprovar")).toBe(true);
      expect(authService.temPermissao(contexto!, "auditoria", "ler")).toBe(true);
      expect(authService.temPermissao(contexto!, "usuario", "criar")).toBe(true);
    });

    it("economista can read and approve payments, but not manage users", async () => {
      const authResult = await authService.autenticar("economista@example.com", SENHA_PADRAO);
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.temPermissao(contexto!, "prestador_pagamento", "ler")).toBe(true);
      expect(authService.temPermissao(contexto!, "usuario", "criar")).toBe(false);
      expect(authService.temPermissao(contexto!, "auditoria", "ler")).toBe(false);
    });
  });

  describe("Data Access Control", () => {
    it("a user linked to a prestador_id can only read their own data", async () => {
      const authResult = await authService.autenticar("paulo@example.com", SENHA_PADRAO);
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.podeLerPrestador(contexto!, 1)).toBe(true);
      expect(authService.podeLerPrestador(contexto!, 2)).toBe(false);
    });

    it("a user without a prestador_id link can read any prestador's data", async () => {
      const authResult = await authService.autenticar("titular@example.com", SENHA_PADRAO);
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.podeLerPrestador(contexto!, 1)).toBe(true);
      expect(authService.podeLerPrestador(contexto!, 2)).toBe(true);
      expect(authService.podeLerPrestador(contexto!, 999)).toBe(true);
    });

    it("a user without a prestador_id link can modify any prestador's apontamentos", async () => {
      const authResult = await authService.autenticar("contador@example.com", SENHA_PADRAO);
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.podeModificarApontamentos(contexto!, 1)).toBe(true);
      expect(authService.podeModificarApontamentos(contexto!, 2)).toBe(true);
    });

    it("a user linked to a prestador_id can only modify their own apontamentos", async () => {
      const authResult = await authService.autenticar("paulo@example.com", SENHA_PADRAO);
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.podeModificarApontamentos(contexto!, 1)).toBe(true);
      expect(authService.podeModificarApontamentos(contexto!, 2)).toBe(false);
    });

    it("a user linked to a prestador_id cannot approve payments", async () => {
      const authResult = await authService.autenticar("paulo@example.com", SENHA_PADRAO);
      const contexto = authService.validarToken(authResult.token!);

      expect(authService.podeAprovarPagamento(contexto!)).toBe(false);
    });
  });

  describe("Logout", () => {
    it("invalidates session on logout", async () => {
      const authResult = await authService.autenticar("titular@example.com", SENHA_PADRAO);
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
    it("cleans up expired sessions", async () => {
      await authService.autenticar("titular@example.com", SENHA_PADRAO);

      // Insert expired session manually
      const insertStmt = db.prepare(
        `INSERT INTO sessoes (token, usuario_id, data_expiracao, ativo)
         VALUES (?, ?, datetime('now', '-1 hour'), true)`
      );
      insertStmt.run("expired_token", "user_titular_1");

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

  describe("Bootstrap do primeiro titular", () => {
    it("creates the first titular when none exists yet", async () => {
      // Este describe usa um banco limpo, sem os titulares/contadores
      // seedados no beforeEach do describe pai — testa o cenário real de
      // "banco recém-criado".
      const dbLimpo = createTestDatabase();
      const service = new AuthServiceDB(dbLimpo);

      const resultado = await service.bootstrapTitular({
        nome: "Primeiro Titular",
        email: "primeiro@example.com",
        senha: "uma-senha-bem-forte",
      });

      expect(resultado.sucesso).toBe(true);
      expect(resultado.usuario?.role).toBe("titular");

      const login = await service.autenticar("primeiro@example.com", "uma-senha-bem-forte");
      expect(login.sucesso).toBe(true);

      dbLimpo.close();
      fs.unlinkSync(TEST_DB_PATH);
    });

    it("refuses to bootstrap a second titular once one exists", async () => {
      // O beforeEach já seedou "user_titular_1".
      const resultado = await authService.bootstrapTitular({
        nome: "Segundo Titular",
        email: "segundo@example.com",
        senha: "uma-senha-bem-forte",
      });

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Bootstrap já foi utilizado");

      const contagem = db.prepare("SELECT COUNT(*) as count FROM usuarios WHERE role = 'titular'").get() as {
        count: number;
      };
      expect(contagem.count).toBe(1);
    });

    it("rejects a password shorter than 8 characters", async () => {
      const dbLimpo = createTestDatabase();
      const service = new AuthServiceDB(dbLimpo);

      const resultado = await service.bootstrapTitular({
        nome: "Titular",
        email: "titular2@example.com",
        senha: "curta",
      });

      expect(resultado.sucesso).toBe(false);
      dbLimpo.close();
      fs.unlinkSync(TEST_DB_PATH);
    });
  });
});
