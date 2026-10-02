import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LembretesAgendadosServiceDB, type LembreteParaSincronizar } from "../domain/notificacoes/lembretes-agendados-db";
import { executarRodadaDisparo, iniciarDisparoLembretesAgendados, type SendersLembretesAgendados } from "../lembretes-dispatcher";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, "test-lembretes-dispatcher.db");

function resolverSchema(nomeArquivo: string): string {
  const candidatos = [
    path.join(__dirname, `../../${nomeArquivo}`),
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

/** Fakes dos 3 senders — nunca tocam rede real nem exigem env vars de produção (mesmo
 * padrão de notificacoes-routes.test.ts). */
function criarSendersFake(): SendersLembretesAgendados & {
  enviarEmail: ReturnType<typeof vi.fn>;
  enviarWhatsapp: ReturnType<typeof vi.fn>;
  enviarTelegram: ReturnType<typeof vi.fn>;
} {
  return {
    enviarEmail: vi.fn().mockResolvedValue(undefined),
    enviarWhatsapp: vi.fn().mockResolvedValue(undefined),
    enviarTelegram: vi.fn().mockResolvedValue(undefined),
  };
}

function item(overrides: Partial<LembreteParaSincronizar> = {}): LembreteParaSincronizar {
  return {
    origemId: 1,
    tipoLembrete: "no_dia",
    canal: "email",
    destinatario: "locatario@example.com",
    assunto: "Vencimento HOJE",
    mensagem: "Seu aluguel vence hoje.",
    dataDisparoPrevista: "2026-01-01",
    ...overrides,
  };
}

describe("lembretes-dispatcher", () => {
  let db: Database.Database;
  let service: LembretesAgendadosServiceDB;

  beforeEach(() => {
    db = createTestDatabase();
    service = new LembretesAgendadosServiceDB(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    vi.useRealTimers();
  });

  describe("executarRodadaDisparo", () => {
    it("envia cada lembrete pendente pelo canal certo e marca 'enviado'", async () => {
      service.sincronizar("lembrete_aluguel", [
        item({ origemId: 1, canal: "email", destinatario: "a@b.com", dataDisparoPrevista: "2026-01-01" }),
        item({ origemId: 2, canal: "whatsapp", destinatario: "+5511999990000", dataDisparoPrevista: "2026-01-01" }),
        item({ origemId: 3, canal: "telegram", destinatario: "999888", dataDisparoPrevista: "2026-01-01" }),
      ]);
      const senders = criarSendersFake();

      const total = await executarRodadaDisparo(service, senders);

      expect(total).toBe(3);
      expect(senders.enviarEmail).toHaveBeenCalledWith({ destinatario: "a@b.com", assunto: "Vencimento HOJE", corpo: "Seu aluguel vence hoje." });
      expect(senders.enviarWhatsapp).toHaveBeenCalledWith({ destinatarioE164: "+5511999990000", mensagem: "Seu aluguel vence hoje." });
      expect(senders.enviarTelegram).toHaveBeenCalledWith({ chatId: "999888", mensagem: "Seu aluguel vence hoje." });

      expect(service.listarTodos().every((l) => l.status === "enviado")).toBe(true);
      expect(service.listarPendentesParaDisparo("2026-12-31")).toHaveLength(0);
    });

    it("não toca em lembrete cuja data_disparo_prevista ainda não chegou", async () => {
      service.sincronizar("lembrete_aluguel", [item({ origemId: 1, dataDisparoPrevista: "2099-01-01" })]);
      const senders = criarSendersFake();

      const total = await executarRodadaDisparo(service, senders);

      expect(total).toBe(0);
      expect(senders.enviarEmail).not.toHaveBeenCalled();
      expect(service.listarTodos()[0].status).toBe("pendente");
    });

    it("marca 'falha' (com a mensagem do erro) quando o sender rejeita, e continua processando os outros", async () => {
      service.sincronizar("lembrete_aluguel", [
        item({ origemId: 1, canal: "email", destinatario: "a@b.com", dataDisparoPrevista: "2026-01-01" }),
        item({ origemId: 2, canal: "whatsapp", destinatario: "+5511999990000", dataDisparoPrevista: "2026-01-01" }),
      ]);
      const senders = criarSendersFake();
      senders.enviarEmail.mockRejectedValue(new Error("SMTP indisponível"));

      const total = await executarRodadaDisparo(service, senders);

      expect(total).toBe(2);
      const todos = service.listarTodos();
      expect(todos.find((l) => l.canal === "email")).toMatchObject({ status: "falha", erroMensagem: "SMTP indisponível" });
      expect(todos.find((l) => l.canal === "whatsapp")).toMatchObject({ status: "enviado" });
    });

    it("sem nenhum pendente vencido, não chama nenhum sender e devolve 0", async () => {
      const senders = criarSendersFake();
      const total = await executarRodadaDisparo(service, senders);
      expect(total).toBe(0);
      expect(senders.enviarEmail).not.toHaveBeenCalled();
      expect(senders.enviarWhatsapp).not.toHaveBeenCalled();
      expect(senders.enviarTelegram).not.toHaveBeenCalled();
    });
  });

  describe("iniciarDisparoLembretesAgendados", () => {
    it("dispara uma rodada imediatamente no boot, e outra depois de 1h decorrida", async () => {
      vi.useFakeTimers();
      try {
        // Horário fixo ao meio-dia (não perto de meia-noite UTC) — evita que o avanço de
        // 1h do teste abaixo atravesse a virada do dia e mude "hojeReal" no meio do teste,
        // o que seria flakiness mecânica, não um defeito do código (mesmo cuidado já
        // documentado em lembretesVencimento.test.ts para o relógio real).
        vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
        const hojeReal = new Date().toISOString().slice(0, 10);
        service.sincronizar("lembrete_aluguel", [item({ origemId: 1, dataDisparoPrevista: hojeReal })]);
        const senders = criarSendersFake();

        iniciarDisparoLembretesAgendados(db, senders);

        // Rodada do boot — roda de forma assíncrona (promise), então é preciso avançar o
        // relógio fake em 0ms para esvaziar a fila de microtasks/promises pendentes.
        await vi.advanceTimersByTimeAsync(0);
        expect(senders.enviarEmail).toHaveBeenCalledTimes(1);
        expect(service.listarPendentesParaDisparo(hojeReal)).toHaveLength(0);

        // Um novo lembrete "chega" (o cliente sincronizou de novo) antes da próxima hora —
        // só deve ser processado quando o timer de 1h disparar, não antes.
        service.sincronizar("lembrete_aluguel", [
          item({ origemId: 1, dataDisparoPrevista: hojeReal }),
          item({ origemId: 2, canal: "whatsapp", destinatario: "+5511999990000", dataDisparoPrevista: hojeReal }),
        ]);
        expect(senders.enviarWhatsapp).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

        expect(senders.enviarWhatsapp).toHaveBeenCalledTimes(1);
        expect(service.listarPendentesParaDisparo(hojeReal)).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
