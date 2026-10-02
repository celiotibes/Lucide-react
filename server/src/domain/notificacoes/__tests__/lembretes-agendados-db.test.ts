import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LembretesAgendadosServiceDB, type LembreteParaSincronizar } from "../lembretes-agendados-db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, "test-lembretes-agendados-db.db");

function resolverSchema(nomeArquivo: string): string {
  const candidatos = [
    path.join(__dirname, `../../../${nomeArquivo}`),
    path.join(process.cwd(), `server/src/${nomeArquivo}`),
    path.join(process.cwd(), `src/${nomeArquivo}`),
  ];
  const encontrado = candidatos.find((p) => fs.existsSync(p));
  if (!encontrado) throw new Error(`Schema não encontrado: ${nomeArquivo} (tentei ${candidatos.join(", ")})`);
  return fs.readFileSync(encontrado, "utf-8");
}

function createTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  const db = new Database(TEST_DB_PATH);
  db.exec(resolverSchema("migrations-phase5-lembretes-agendados.sql"));
  return db;
}

function item(overrides: Partial<LembreteParaSincronizar> = {}): LembreteParaSincronizar {
  return {
    origemId: 1,
    tipoLembrete: "no_dia",
    canal: "email",
    destinatario: "locatario@example.com",
    assunto: "Vencimento HOJE",
    mensagem: "Seu aluguel vence hoje.",
    dataDisparoPrevista: "2026-11-10",
    ...overrides,
  };
}

function statusDe(db: Database.Database, origemId: number, tipoLembrete: string, canal: string): string | undefined {
  const linha = db
    .prepare(`SELECT status FROM lembretes_agendados WHERE origem_tipo = 'lembrete_aluguel' AND origem_id = ? AND tipo_lembrete = ? AND canal = ?`)
    .get(origemId, tipoLembrete, canal) as { status: string } | undefined;
  return linha?.status;
}

describe("LembretesAgendadosServiceDB", () => {
  let db: Database.Database;
  let service: LembretesAgendadosServiceDB;

  beforeEach(() => {
    db = createTestDatabase();
    service = new LembretesAgendadosServiceDB(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe("sincronizar", () => {
    it("insere linhas novas como 'pendente'", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1 }), item({ origemId: 2, tipoLembrete: "2_dias_antes" })]);

      const todos = service.listarTodos();
      expect(todos).toHaveLength(2);
      expect(todos.every((l) => l.status === "pendente")).toBe(true);
      expect(todos.find((l) => l.origemId === 1)?.canal).toBe("email");
    });

    it("upsert: sincronizar de novo a mesma chave, ainda pendente, atualiza destinatário/mensagem/data", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1, destinatario: "a@b.com", mensagem: "primeira" })]);
      service.sincronizar("lembrete_aluguel", [
        item({ origemId: 1, destinatario: "novo@b.com", mensagem: "atualizada", dataDisparoPrevista: "2026-11-11" }),
      ]);

      const [linha] = service.listarTodos();
      expect(linha.destinatario).toBe("novo@b.com");
      expect(linha.mensagem).toBe("atualizada");
      expect(linha.dataDisparoPrevista).toBe("2026-11-11");
      expect(linha.status).toBe("pendente");
    });

    it("NUNCA sobrescreve uma linha já 'enviado', mesmo que o payload mande dados diferentes para a mesma chave", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1, destinatario: "a@b.com", mensagem: "original" })]);
      const [{ id }] = service.listarTodos();
      service.marcarEnviado(id);

      service.sincronizar("lembrete_aluguel", [item({ origemId: 1, destinatario: "mudou@b.com", mensagem: "nova tentativa" })]);

      const [linha] = service.listarTodos();
      expect(linha.status).toBe("enviado");
      expect(linha.destinatario).toBe("a@b.com");
      expect(linha.mensagem).toBe("original");
    });

    it("NUNCA sobrescreve uma linha já 'falha'", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1 })]);
      const [{ id }] = service.listarTodos();
      service.marcarFalha(id, "SMTP indisponível");

      service.sincronizar("lembrete_aluguel", [item({ origemId: 1, mensagem: "nova tentativa" })]);

      const [linha] = service.listarTodos();
      expect(linha.status).toBe("falha");
      expect(linha.erroMensagem).toBe("SMTP indisponível");
      expect(linha.mensagem).not.toBe("nova tentativa");
    });

    it("cancela uma linha 'pendente' cuja chave some do payload na sincronização seguinte", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1 }), item({ origemId: 2 })]);
      expect(statusDe(db, 1, "no_dia", "email")).toBe("pendente");
      expect(statusDe(db, 2, "no_dia", "email")).toBe("pendente");

      // Segunda sincronização: origemId=2 não aparece mais (competência paga, por ex.).
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1 })]);

      expect(statusDe(db, 1, "no_dia", "email")).toBe("pendente");
      expect(statusDe(db, 2, "no_dia", "email")).toBe("cancelado");
    });

    it("payload vazio cancela TUDO que estava pendente para aquele origemTipo", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1 }), item({ origemId: 2 })]);
      service.sincronizar("lembrete_aluguel", []);

      const todos = service.listarTodos();
      expect(todos.every((l) => l.status === "cancelado")).toBe(true);
    });

    it("cancelamento é isolado por origemTipo — sincronizar 'lembrete_honorario' não cancela linhas de 'lembrete_aluguel'", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1 })]);
      service.sincronizar("lembrete_honorario", [item({ origemId: 99 })]);

      expect(statusDe(db, 1, "no_dia", "email")).toBe("pendente");
    });

    it("uma competência pode ter múltiplos canais sincronizados independentemente (chave inclui canal)", () => {
      service.sincronizar("lembrete_aluguel", [
        item({ origemId: 1, canal: "email", destinatario: "a@b.com" }),
        item({ origemId: 1, canal: "whatsapp", destinatario: "+5511999990000" }),
      ]);

      const todos = service.listarTodos();
      expect(todos).toHaveLength(2);
      expect(todos.map((l) => l.canal).sort()).toEqual(["email", "whatsapp"]);
    });
  });

  describe("listarPendentesParaDisparo", () => {
    it("lista só 'pendente' com data_disparo_prevista <= dataReferencia", () => {
      service.sincronizar("lembrete_aluguel", [
        item({ origemId: 1, dataDisparoPrevista: "2026-11-01" }),
        item({ origemId: 2, canal: "whatsapp", destinatario: "+5511999990000", dataDisparoPrevista: "2026-11-10" }),
        item({ origemId: 3, canal: "telegram", destinatario: "123", dataDisparoPrevista: "2026-11-20" }),
      ]);

      const pendentes = service.listarPendentesParaDisparo("2026-11-10");
      expect(pendentes.map((p) => p.origemId).sort()).toEqual([1, 2]);
    });

    it("não lista linhas 'enviado'/'falha'/'cancelado' mesmo com data_disparo_prevista vencida", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1, dataDisparoPrevista: "2026-11-01" })]);
      const [{ id }] = service.listarTodos();
      service.marcarEnviado(id);

      expect(service.listarPendentesParaDisparo("2026-12-01")).toHaveLength(0);
    });
  });

  describe("marcarEnviado / marcarFalha", () => {
    it("marcarEnviado grava enviado_em e muda o status", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1 })]);
      const [{ id }] = service.listarTodos();

      service.marcarEnviado(id);

      const [linha] = service.listarTodos();
      expect(linha.status).toBe("enviado");
      expect(linha.enviadoEm).not.toBeNull();
    });

    it("marcarFalha grava a mensagem de erro e muda o status", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1 })]);
      const [{ id }] = service.listarTodos();

      service.marcarFalha(id, "Telegram Bot API respondeu 500");

      const [linha] = service.listarTodos();
      expect(linha.status).toBe("falha");
      expect(linha.erroMensagem).toBe("Telegram Bot API respondeu 500");
    });

    it("é idempotente: chamar de novo para um id já 'enviado' não lança e não altera nada", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1 })]);
      const [{ id }] = service.listarTodos();
      service.marcarEnviado(id);

      expect(() => service.marcarFalha(id, "não deveria aplicar")).not.toThrow();

      const [linha] = service.listarTodos();
      expect(linha.status).toBe("enviado");
      expect(linha.erroMensagem).toBeNull();
    });
  });

  describe("listarTodos", () => {
    it("filtra por status quando informado", () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1 }), item({ origemId: 2 })]);
      const [primeiro] = service.listarTodos();
      service.marcarEnviado(primeiro.id);

      expect(service.listarTodos("enviado")).toHaveLength(1);
      expect(service.listarTodos("pendente")).toHaveLength(1);
    });
  });
});
