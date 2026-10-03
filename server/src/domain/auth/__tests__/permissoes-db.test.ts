import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PermissoesServiceDB } from "../permissoes-db";
import { matrizPadrao, FUNCOES_CATALOGO, PAPEIS_VALIDOS } from "../permissoes";
import type { ContextoAutenticacao } from "../auth-service";
import { migrarPapeisUsuarios } from "../../../migrations/migrar-papeis-usuarios.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-permissoes-${process.pid}.db`);

function createTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");

  let schemaPath = path.join(__dirname, "../../../migrations-phase2-auth.sql");
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), "server/src/migrations-phase2-auth.sql");
  }
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), "src/migrations-phase2-auth.sql");
  }
  db.exec(fs.readFileSync(schemaPath, "utf-8"));

  // Aplicar migração de papéis (idempotente)
  migrarPapeisUsuarios(db);

  return db;
}

/** Mesma semente que `database-init.ts` grava num banco novo — reproduzida
 * aqui (em vez de importar database-init.ts, que abriria um arquivo de
 * banco fixo em `data/app.db`) para os testes começarem do mesmo estado que
 * a aplicação real usa. */
function seedMatrizPadrao(db: Database.Database): void {
  const inserir = db.prepare(
    `INSERT OR IGNORE INTO permissoes_papel (papel, funcao, habilitado, limite_valor, atualizado_em, atualizado_por)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)`,
  );
  for (const e of matrizPadrao()) {
    inserir.run(e.papel, e.funcao, e.habilitado ? 1 : 0, e.limite_valor);
  }
}

function seedTitular(db: Database.Database): void {
  db.prepare(
    `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
     VALUES ('user_titular_1', 'Titular', 'titular@example.com', 'x', 'titular', true, '2026-01-01')`,
  ).run();
}

function contextoTitular(): ContextoAutenticacao {
  return {
    autenticado: true,
    usuario: {
      id: "user_titular_1",
      nome: "Titular",
      email: "titular@example.com",
      role: "titular",
      ativo: true,
      data_criacao: "2026-01-01",
    },
  };
}

describe("PermissoesServiceDB", () => {
  let db: Database.Database;
  let service: PermissoesServiceDB;

  beforeEach(() => {
    db = createTestDatabase();
    seedTitular(db);
    seedMatrizPadrao(db);
    service = new PermissoesServiceDB(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe("obterMatriz", () => {
    it("returns one row per (papel, funcao) combination from the default seed", () => {
      const matriz = service.obterMatriz();
      expect(matriz.length).toBe(PAPEIS_VALIDOS.length * FUNCOES_CATALOGO.length);
    });

    it("seeds titular and administrador with every function enabled", () => {
      const matriz = service.obterMatriz();
      const doTitular = matriz.filter((e) => e.papel === "titular");
      const doAdministrador = matriz.filter((e) => e.papel === "administrador");
      expect(doTitular.every((e) => e.habilitado)).toBe(true);
      expect(doAdministrador.every((e) => e.habilitado)).toBe(true);
    });

    it("seeds contador's aprovar_despesa_os with a default limite_valor", () => {
      const matriz = service.obterMatriz();
      const entrada = matriz.find((e) => e.papel === "contador" && e.funcao === "aprovar_despesa_os");
      expect(entrada?.habilitado).toBe(true);
      expect(entrada?.limite_valor).toBe(5000);
    });

    it("seeds economista without editar_plano_de_contas (not a bookkeeping role)", () => {
      const matriz = service.obterMatriz();
      const entrada = matriz.find((e) => e.papel === "economista" && e.funcao === "editar_plano_de_contas");
      expect(entrada?.habilitado).toBe(false);
    });
  });

  describe("atualizarMatriz — casos válidos", () => {
    it("enables a function for a role", () => {
      const resultado = service.atualizarMatriz(
        [{ papel: "perito", funcao: "ver_indicadores_gestao", habilitado: true, limite_valor: null }],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(true);

      const entrada = service.obterMatriz().find((e) => e.papel === "perito" && e.funcao === "ver_indicadores_gestao");
      expect(entrada?.habilitado).toBe(true);
    });

    it("updates limite_valor for a function that supports it", () => {
      const resultado = service.atualizarMatriz(
        [{ papel: "contador", funcao: "aprovar_pagamento", habilitado: true, limite_valor: 12000 }],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(true);

      const entrada = service.obterMatriz().find((e) => e.papel === "contador" && e.funcao === "aprovar_pagamento");
      expect(entrada?.limite_valor).toBe(12000);
    });

    it("records who last changed the row", () => {
      service.atualizarMatriz(
        [{ papel: "advogado", funcao: "importar_documentos", habilitado: false, limite_valor: null }],
        contextoTitular(),
      );
      const linha = db
        .prepare("SELECT atualizado_por FROM permissoes_papel WHERE papel = 'advogado' AND funcao = 'importar_documentos'")
        .get() as { atualizado_por: string };
      expect(linha.atualizado_por).toBe("user_titular_1");
    });

    it("leaves entries not included in the payload unchanged", () => {
      const antes = service.obterMatriz().find((e) => e.papel === "contador" && e.funcao === "lancar_transacoes");
      service.atualizarMatriz(
        [{ papel: "perito", funcao: "importar_documentos", habilitado: false, limite_valor: null }],
        contextoTitular(),
      );
      const depois = service.obterMatriz().find((e) => e.papel === "contador" && e.funcao === "lancar_transacoes");
      expect(depois).toEqual(antes);
    });
  });

  describe("atualizarMatriz — validação", () => {
    it("rejects an empty payload", () => {
      const resultado = service.atualizarMatriz([], contextoTitular());
      expect(resultado.sucesso).toBe(false);
    });

    it("rejects a non-array payload", () => {
      const resultado = service.atualizarMatriz({ papel: "titular" }, contextoTitular());
      expect(resultado.sucesso).toBe(false);
    });

    it("rejects an invalid papel", () => {
      const resultado = service.atualizarMatriz(
        [{ papel: "estagiario", funcao: "importar_documentos", habilitado: true, limite_valor: null }],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Papel inválido");
    });

    it("rejects an invalid funcao", () => {
      const resultado = service.atualizarMatriz(
        [{ papel: "contador", funcao: "deletar_tudo", habilitado: true, limite_valor: null }],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Função inválida");
    });

    it("rejects limite_valor on a function that does not support it", () => {
      const resultado = service.atualizarMatriz(
        [{ papel: "contador", funcao: "lancar_transacoes", habilitado: true, limite_valor: 100 }],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("não aceita limite_valor");
    });

    it("rejects a negative limite_valor", () => {
      const resultado = service.atualizarMatriz(
        [{ papel: "contador", funcao: "aprovar_pagamento", habilitado: true, limite_valor: -1 }],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(false);
    });

    it("rejects a duplicated (papel, funcao) pair within the same payload", () => {
      const resultado = service.atualizarMatriz(
        [
          { papel: "contador", funcao: "lancar_transacoes", habilitado: true, limite_valor: null },
          { papel: "contador", funcao: "lancar_transacoes", habilitado: false, limite_valor: null },
        ],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("duplicada");
    });

    it("writes nothing when any entry in the batch is invalid", () => {
      service.atualizarMatriz(
        [
          { papel: "contador", funcao: "lancar_transacoes", habilitado: false, limite_valor: null },
          { papel: "papel_invalido", funcao: "lancar_transacoes", habilitado: false, limite_valor: null },
        ],
        contextoTitular(),
      );
      const entrada = service.obterMatriz().find((e) => e.papel === "contador" && e.funcao === "lancar_transacoes");
      // Continua com o valor da semente (true) — nada foi gravado.
      expect(entrada?.habilitado).toBe(true);
    });
  });

  describe("atualizarMatriz — proteção contra autotravamento", () => {
    it("refuses to disable gerenciar_permissoes for titular", () => {
      const resultado = service.atualizarMatriz(
        [{ papel: "titular", funcao: "gerenciar_permissoes", habilitado: false, limite_valor: null }],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("gerenciar_permissoes");

      const entrada = service.obterMatriz().find((e) => e.papel === "titular" && e.funcao === "gerenciar_permissoes");
      expect(entrada?.habilitado).toBe(true);
    });

    it("refuses to disable gerenciar_permissoes for administrador, even when titular calls it", () => {
      const resultado = service.atualizarMatriz(
        [{ papel: "administrador", funcao: "gerenciar_permissoes", habilitado: false, limite_valor: null }],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(false);

      const entrada = service
        .obterMatriz()
        .find((e) => e.papel === "administrador" && e.funcao === "gerenciar_permissoes");
      expect(entrada?.habilitado).toBe(true);
    });

    it("rejects the WHOLE batch when one entry would disable the protected function, even if other entries are valid", () => {
      const resultado = service.atualizarMatriz(
        [
          { papel: "perito", funcao: "importar_documentos", habilitado: false, limite_valor: null },
          { papel: "titular", funcao: "gerenciar_permissoes", habilitado: false, limite_valor: null },
        ],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(false);

      const peritoEntrada = service.obterMatriz().find((e) => e.papel === "perito" && e.funcao === "importar_documentos");
      // Nem a entrada válida foi gravada — o lote falha por inteiro.
      expect(peritoEntrada?.habilitado).toBe(true);
    });

    it("allows disabling gerenciar_permissoes for a role OTHER than titular/administrador", () => {
      // Nenhum papel além de titular/administrador tem essa função habilitada
      // por padrão, mas a operação em si (desabilitar algo que já estava
      // desabilitado) precisa continuar permitida — só titular/administrador
      // são protegidos.
      const resultado = service.atualizarMatriz(
        [{ papel: "contador", funcao: "gerenciar_permissoes", habilitado: false, limite_valor: null }],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(true);
    });

    it("allows re-enabling gerenciar_permissoes together with another change in the same batch", () => {
      const resultado = service.atualizarMatriz(
        [
          { papel: "titular", funcao: "gerenciar_permissoes", habilitado: true, limite_valor: null },
          { papel: "perito", funcao: "gerar_laudo_pericial", habilitado: true, limite_valor: null },
        ],
        contextoTitular(),
      );
      expect(resultado.sucesso).toBe(true);
    });
  });
});
