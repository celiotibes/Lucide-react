import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import type { NotificacoesApiClient, ResultadoDisparo } from "../despachoCliente";
import {
  gerarCodigoVinculo,
  listarVinculosPendentesEAtivos,
  resolverVinculosExternosPendentes,
  type PendenteVinculoExternoServidor,
  type VinculosExternosApiClient,
} from "../vinculosExternos";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function ultimoId(tabela: string): number {
  return consultar<{ id: number }>(db, `SELECT id FROM ${tabela} ORDER BY id DESC LIMIT 1`)[0].id;
}

function criarPrestador(nome = "João Pedreiro"): number {
  executar(db, "INSERT INTO prestadores (nome, servico) VALUES (?, 'reforma')", [nome]);
  return ultimoId("prestadores");
}

/** Insere uma linha direto em `vinculos_telegram_externos`, sem passar por
 * `gerarCodigoVinculo` — útil para simular um código já expirado ou já vinculado. */
function inserirVinculoBruto(
  referenciaTipo: "contrato_locatario" | "entidade_legal" | "prestador",
  referenciaId: number,
  codigo: string,
  expiraEm: string,
  chatId: string | null = null,
): void {
  executar(
    db,
    `INSERT INTO vinculos_telegram_externos (referencia_tipo, referencia_id, codigo_vinculo, chat_id, vinculado_em, expira_em)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [referenciaTipo, referenciaId, codigo, chatId, chatId ? "2026-01-01 00:00:00" : null, expiraEm],
  );
}

/** Fake de VinculosExternosApiClient — lista fixa de pendentes em memória; `marcarConsumido`
 * só registra as chamadas (nunca lança), para o teste poder checar o que foi consumido. */
function criarVinculosApiClientFake(
  pendentes: PendenteVinculoExternoServidor[],
): VinculosExternosApiClient & { consumidos: string[] } {
  const consumidos: string[] = [];
  return {
    consumidos,
    async listarPendentes() {
      return pendentes;
    },
    async marcarConsumido(id: string) {
      consumidos.push(id);
    },
  };
}

/** Fake de NotificacoesApiClient — nunca toca rede; devolve "enviado" para todo canal
 * recebido e registra as chamadas para o teste inspecionar a mensagem de confirmação. */
function criarNotificacoesApiClientFake(): NotificacoesApiClient & { chamadas: any[] } {
  const chamadas: any[] = [];
  return {
    chamadas,
    async disparar(dados) {
      chamadas.push(dados);
      const resultados: ResultadoDisparo[] = [];
      if (dados.destinatarios.telegramChatId) {
        resultados.push({ canal: "telegram", destinatario: dados.destinatarios.telegramChatId, status: "enviado" });
      }
      return { resultados };
    },
  };
}

describe("vinculosExternos", () => {
  describe("gerarCodigoVinculo", () => {
    it("gera um código de 6 dígitos válido por 15 minutos e grava sem chat_id", () => {
      const prestadorId = criarPrestador();
      const { codigo, expiraEm } = gerarCodigoVinculo(db, "prestador", prestadorId);

      expect(codigo).toMatch(/^\d{6}$/);
      expect(expiraEm).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

      const [linha] = consultar<{ chat_id: string | null; referencia_tipo: string; referencia_id: number }>(
        db,
        "SELECT chat_id, referencia_tipo, referencia_id FROM vinculos_telegram_externos WHERE codigo_vinculo = ?",
        [codigo],
      );
      expect(linha).toBeTruthy();
      expect(linha.chat_id).toBeNull();
      expect(linha.referencia_tipo).toBe("prestador");
      expect(linha.referencia_id).toBe(prestadorId);
    });

    it("gerar um novo código não invalida um código anterior ainda válido para a mesma referência", () => {
      const prestadorId = criarPrestador();
      const primeiro = gerarCodigoVinculo(db, "prestador", prestadorId);
      const segundo = gerarCodigoVinculo(db, "prestador", prestadorId);

      expect(primeiro.codigo).not.toBe(segundo.codigo);
      const linhas = consultar(db, "SELECT codigo_vinculo FROM vinculos_telegram_externos WHERE referencia_id = ?", [prestadorId]);
      expect(linhas).toHaveLength(2);
    });
  });

  describe("listarVinculosPendentesEAtivos", () => {
    it("devolve 'nenhum' quando não há código nem vínculo", () => {
      const prestadorId = criarPrestador();
      expect(listarVinculosPendentesEAtivos(db, "prestador", prestadorId)).toEqual({ vinculado: false });
    });

    it("devolve o código pendente quando há um código ainda válido sem chat_id", () => {
      const prestadorId = criarPrestador();
      const { codigo, expiraEm } = gerarCodigoVinculo(db, "prestador", prestadorId);

      const estado = listarVinculosPendentesEAtivos(db, "prestador", prestadorId);
      expect(estado).toEqual({ vinculado: false, codigo, expiraEm });
    });

    it("ignora um código já expirado (devolve 'nenhum')", () => {
      const prestadorId = criarPrestador();
      inserirVinculoBruto("prestador", prestadorId, "000111", "2000-01-01 00:00:00");

      expect(listarVinculosPendentesEAtivos(db, "prestador", prestadorId)).toEqual({ vinculado: false });
    });

    it("devolve 'vinculado' com o chat_id quando já há um vínculo confirmado", () => {
      const prestadorId = criarPrestador();
      inserirVinculoBruto("prestador", prestadorId, "222333", "2030-01-01 00:00:00", "chat-999");

      expect(listarVinculosPendentesEAtivos(db, "prestador", prestadorId)).toEqual({ vinculado: true, chatId: "chat-999" });
    });

    it("um vínculo confirmado prevalece sobre um código pendente mais recente da mesma referência", () => {
      const prestadorId = criarPrestador();
      inserirVinculoBruto("prestador", prestadorId, "111111", "2030-01-01 00:00:00", "chat-antigo");
      gerarCodigoVinculo(db, "prestador", prestadorId); // novo código, gerado depois, ainda sem uso

      expect(listarVinculosPendentesEAtivos(db, "prestador", prestadorId)).toEqual({ vinculado: true, chatId: "chat-antigo" });
    });
  });

  describe("resolverVinculosExternosPendentes", () => {
    it("não quebra quando não há nada pendente no servidor", async () => {
      const apiClient = criarVinculosApiClientFake([]);
      const notificacoesApiClient = criarNotificacoesApiClientFake();

      const resultado = await resolverVinculosExternosPendentes(db, apiClient, notificacoesApiClient);

      expect(resultado).toEqual({ resolvidos: 0, naoEncontrados: 0 });
      expect(notificacoesApiClient.chamadas).toHaveLength(0);
    });

    it("casa um código válido, grava chat_id/vinculado_em, dispara a confirmação e marca consumido", async () => {
      const prestadorId = criarPrestador();
      const { codigo } = gerarCodigoVinculo(db, "prestador", prestadorId);

      const apiClient = criarVinculosApiClientFake([{ id: "pend-1", codigoVinculo: codigo, chatId: "chat-abc" }]);
      const notificacoesApiClient = criarNotificacoesApiClientFake();

      const resultado = await resolverVinculosExternosPendentes(db, apiClient, notificacoesApiClient);

      expect(resultado).toEqual({ resolvidos: 1, naoEncontrados: 0 });

      const [linha] = consultar<{ chat_id: string | null; vinculado_em: string | null }>(
        db,
        "SELECT chat_id, vinculado_em FROM vinculos_telegram_externos WHERE codigo_vinculo = ?",
        [codigo],
      );
      expect(linha.chat_id).toBe("chat-abc");
      expect(linha.vinculado_em).toBeTruthy();

      expect(apiClient.consumidos).toEqual(["pend-1"]);

      expect(notificacoesApiClient.chamadas).toHaveLength(1);
      expect(notificacoesApiClient.chamadas[0]).toMatchObject({
        origemTipo: "comunicado_generico",
        destinatarios: { telegramChatId: "chat-abc" },
      });
      expect(notificacoesApiClient.chamadas[0].mensagem).toContain("Vínculo confirmado");
    });

    it("conta como não encontrado um código inexistente, mas ainda marca consumido (sem lixo no servidor)", async () => {
      const apiClient = criarVinculosApiClientFake([{ id: "pend-x", codigoVinculo: "999999", chatId: "chat-fantasma" }]);
      const notificacoesApiClient = criarNotificacoesApiClientFake();

      const resultado = await resolverVinculosExternosPendentes(db, apiClient, notificacoesApiClient);

      expect(resultado).toEqual({ resolvidos: 0, naoEncontrados: 1 });
      expect(apiClient.consumidos).toEqual(["pend-x"]);
      expect(notificacoesApiClient.chamadas).toHaveLength(0);
    });

    it("conta como não encontrado um código que existe localmente mas já expirou", async () => {
      const prestadorId = criarPrestador();
      inserirVinculoBruto("prestador", prestadorId, "000111", "2000-01-01 00:00:00");

      const apiClient = criarVinculosApiClientFake([{ id: "pend-exp", codigoVinculo: "000111", chatId: "chat-tarde" }]);
      const notificacoesApiClient = criarNotificacoesApiClientFake();

      const resultado = await resolverVinculosExternosPendentes(db, apiClient, notificacoesApiClient);

      expect(resultado).toEqual({ resolvidos: 0, naoEncontrados: 1 });
      const [linha] = consultar<{ chat_id: string | null }>(db, "SELECT chat_id FROM vinculos_telegram_externos WHERE codigo_vinculo = '000111'");
      expect(linha.chat_id).toBeNull();
      expect(apiClient.consumidos).toEqual(["pend-exp"]);
    });

    it("conta como não encontrado um código que já foi vinculado a outro chat (não sobrescreve)", async () => {
      const prestadorId = criarPrestador();
      inserirVinculoBruto("prestador", prestadorId, "444555", "2030-01-01 00:00:00", "chat-original");

      const apiClient = criarVinculosApiClientFake([{ id: "pend-y", codigoVinculo: "444555", chatId: "chat-novo" }]);
      const notificacoesApiClient = criarNotificacoesApiClientFake();

      const resultado = await resolverVinculosExternosPendentes(db, apiClient, notificacoesApiClient);

      expect(resultado).toEqual({ resolvidos: 0, naoEncontrados: 1 });
      const [linha] = consultar<{ chat_id: string | null }>(db, "SELECT chat_id FROM vinculos_telegram_externos WHERE codigo_vinculo = '444555'");
      expect(linha.chat_id).toBe("chat-original");
      expect(apiClient.consumidos).toEqual(["pend-y"]);
    });

    it("segue processando o resto do lote mesmo quando o disparo da confirmação falha para um pendente", async () => {
      const prestadorId1 = criarPrestador("Prestador 1");
      const prestadorId2 = criarPrestador("Prestador 2");
      const { codigo: codigo1 } = gerarCodigoVinculo(db, "prestador", prestadorId1);
      const { codigo: codigo2 } = gerarCodigoVinculo(db, "prestador", prestadorId2);

      const apiClient = criarVinculosApiClientFake([
        { id: "pend-1", codigoVinculo: codigo1, chatId: "chat-1" },
        { id: "pend-2", codigoVinculo: codigo2, chatId: "chat-2" },
      ]);
      let chamadas = 0;
      const notificacoesApiClient: NotificacoesApiClient = {
        async disparar() {
          chamadas++;
          if (chamadas === 1) throw new Error("backend fora do ar");
          return { resultados: [] };
        },
      };

      const resultado = await resolverVinculosExternosPendentes(db, apiClient, notificacoesApiClient);

      // Ambos casaram localmente (a falha foi só no disparo da mensagem, best-effort).
      expect(resultado).toEqual({ resolvidos: 2, naoEncontrados: 0 });
      expect(apiClient.consumidos).toEqual(["pend-1", "pend-2"]);

      const linhas = consultar<{ codigo_vinculo: string; chat_id: string | null }>(
        db,
        "SELECT codigo_vinculo, chat_id FROM vinculos_telegram_externos WHERE codigo_vinculo IN (?, ?)",
        [codigo1, codigo2],
      );
      expect(linhas.find((l) => l.codigo_vinculo === codigo1)?.chat_id).toBe("chat-1");
      expect(linhas.find((l) => l.codigo_vinculo === codigo2)?.chat_id).toBe("chat-2");
    });
  });
});
