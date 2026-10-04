import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import { dispararNotificacao, dispararNotificacaoCobranca, dispararNotificacaoComunicado, type NotificacoesApiClient, type ResultadoDisparo } from "../despachoCliente";
import { listarPorOrigem } from "../notificacoes-db";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function ultimoId(tabela: string): number {
  return consultar<{ id: number }>(db, `SELECT id FROM ${tabela} ORDER BY id DESC LIMIT 1`)[0].id;
}

function criarContratoComLocatario(overrides: Partial<{ email: string | null; telefone: string | null }> = {}): { contratoId: number; competenciaId: number } {
  executar(db, "INSERT INTO imoveis (apelido, tipo, financiado) VALUES ('Kitnet 1', 'kitnet', 1)");
  const imovelId = ultimoId("imoveis");
  executar(
    db,
    `INSERT INTO contratos_locacao (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio)
     VALUES (?, 'Locatário Teste', 'residencial_fixo', 1200, 10, '2026-01-01')`,
    [imovelId],
  );
  const contratoId = ultimoId("contratos_locacao");
  const p = { email: "locatario@example.com" as string | null, telefone: "11999990000" as string | null, ...overrides };
  executar(
    db,
    `INSERT INTO contrato_locatarios (contrato_id, nome, cpf, papel, telefone, email) VALUES (?, 'Locatário Teste', '52998224725', 'locatario', ?, ?)`,
    [contratoId, p.telefone, p.email],
  );
  executar(
    db,
    `INSERT INTO aluguel_competencias (contrato_id, imovel_id, ano, mes, data_vencimento, valor_devido, status, criado_em)
     VALUES (?, ?, 2026, 11, '2026-11-10', 1200, 'pendente', '2026-10-01')`,
    [contratoId, imovelId],
  );
  return { contratoId, competenciaId: ultimoId("aluguel_competencias") };
}

function criarCobrancaAsaas(origemId: number): number {
  executar(
    db,
    `INSERT INTO cobrancas_asaas (origem_tipo, origem_id, asaas_customer_id, tipo_cobranca, valor, data_vencimento, status)
     VALUES ('aluguel_competencia', ?, 'cus_fake_1', 'boleto', 1200, '2026-11-10', 'pendente')`,
    [origemId],
  );
  return ultimoId("cobrancas_asaas");
}

/** Fake do apiClient — nunca toca rede; devolve um resultado fixo por canal recebido,
 * ou o comportamento sobrescrito por teste. */
function criarApiClientFake(
  gerarResultado: (canal: "email" | "whatsapp" | "telegram", destinatario: string) => ResultadoDisparo = (canal, destinatario) => ({
    canal,
    destinatario,
    status: "enviado",
  }),
): NotificacoesApiClient & { chamadas: Record<string, unknown>[] } {
  const chamadas: Record<string, unknown>[] = [];
  return {
    chamadas,
    async disparar(dados) {
      chamadas.push(dados);
      const resultados: ResultadoDisparo[] = [];
      if (dados.destinatarios.email) resultados.push(gerarResultado("email", dados.destinatarios.email));
      if (dados.destinatarios.whatsappE164) resultados.push(gerarResultado("whatsapp", dados.destinatarios.whatsappE164));
      if (dados.destinatarios.telegramChatId) resultados.push(gerarResultado("telegram", dados.destinatarios.telegramChatId));
      return { resultados };
    },
  };
}

describe("despachoCliente", () => {
  describe("dispararNotificacao (genérico)", () => {
    it("registra tentativa, chama o apiClient só com os canais presentes e marca enviado", async () => {
      const apiClient = criarApiClientFake();
      const resultados = await dispararNotificacao(db, apiClient, {
        origemTipo: "comunicado_generico",
        origemId: null,
        assunto: "Aviso",
        mensagem: "Olá",
        destinatarios: { email: "a@b.com", whatsappE164: "+5511999990000" }, // sem telegram
      });

      expect(resultados).toHaveLength(3);
      expect(resultados.find((r) => r.canal === "email")).toMatchObject({ status: "enviado", destinatario: "a@b.com" });
      expect(resultados.find((r) => r.canal === "whatsapp")).toMatchObject({ status: "enviado" });
      expect(resultados.find((r) => r.canal === "telegram")).toMatchObject({ status: "pulado", destinatario: "(nenhum)" });

      // apiClient só recebeu os 2 canais com destinatário — nunca telegram vazio.
      expect(apiClient.chamadas).toHaveLength(1);
      expect(apiClient.chamadas[0].destinatarios.telegramChatId).toBeUndefined();

      const historico = listarPorOrigem(db, "comunicado_generico", null);
      expect(historico).toHaveLength(2); // só email+whatsapp foram registrados — telegram pulado não gera tentativa
      expect(historico.every((n) => n.status === "enviado")).toBe(true);
    });

    it("quando nenhum canal tem destinatário, não chama o apiClient e devolve 3 'pulado'", async () => {
      const apiClient = criarApiClientFake();
      const resultados = await dispararNotificacao(db, apiClient, {
        origemTipo: "comunicado_generico",
        origemId: null,
        mensagem: "oi",
        destinatarios: {},
      });
      expect(resultados).toHaveLength(3);
      expect(resultados.every((r) => r.status === "pulado")).toBe(true);
      expect(apiClient.chamadas).toHaveLength(0);
      expect(listarPorOrigem(db, "comunicado_generico", null)).toHaveLength(0);
    });

    it("marca falha na tentativa quando o servidor devolve status 'falha', mantendo o motivo", async () => {
      const apiClient = criarApiClientFake((canal, destinatario) =>
        canal === "whatsapp" ? { canal, destinatario, status: "falha", motivo: "WhatsApp fora do ar" } : { canal, destinatario, status: "enviado" },
      );
      const resultados = await dispararNotificacao(db, apiClient, {
        origemTipo: "comunicado_generico",
        origemId: null,
        mensagem: "oi",
        destinatarios: { email: "a@b.com", whatsappE164: "+5511999990000", telegramChatId: "123" },
      });

      expect(resultados.find((r) => r.canal === "whatsapp")).toMatchObject({ status: "falha", motivo: "WhatsApp fora do ar" });
      expect(resultados.find((r) => r.canal === "email")).toMatchObject({ status: "enviado" });
      expect(resultados.find((r) => r.canal === "telegram")).toMatchObject({ status: "enviado" });

      const historico = listarPorOrigem(db, "comunicado_generico", null);
      const whatsappHist = historico.find((n) => n.canal === "whatsapp")!;
      expect(whatsappHist.status).toBe("falha");
      expect(whatsappHist.erroMensagem).toBe("WhatsApp fora do ar");
    });
  });

  describe("dispararNotificacaoCobranca", () => {
    it("resolve o destinatário da cobrança (locatário) e dispara só os canais disponíveis", async () => {
      const { competenciaId } = criarContratoComLocatario({ email: "loc@example.com", telefone: "11988887777" });
      const cobrancaId = criarCobrancaAsaas(competenciaId);

      const apiClient = criarApiClientFake();
      const resultados = await dispararNotificacaoCobranca(db, apiClient, cobrancaId, { assunto: "Boleto disponível", mensagem: "Seu boleto chegou" });

      expect(resultados.find((r) => r.canal === "email")).toMatchObject({ status: "enviado", destinatario: "loc@example.com" });
      expect(resultados.find((r) => r.canal === "whatsapp")).toMatchObject({ status: "enviado", destinatario: "+5511988887777" });
      // Limitação de produto documentada: locatário sem Telegram vinculado -> pulado.
      expect(resultados.find((r) => r.canal === "telegram")).toMatchObject({
        status: "pulado",
        motivo: expect.stringContaining("Telegram"),
      });

      const historico = listarPorOrigem(db, "cobranca_asaas", cobrancaId);
      expect(historico).toHaveLength(2);
    });

    it("locatário sem nenhum contato cadastrado: os 3 canais vêm 'pulado', sem chamar o apiClient", async () => {
      const { competenciaId } = criarContratoComLocatario({ email: null, telefone: null });
      const cobrancaId = criarCobrancaAsaas(competenciaId);

      const apiClient = criarApiClientFake();
      const resultados = await dispararNotificacaoCobranca(db, apiClient, cobrancaId, { mensagem: "Seu boleto chegou" });

      expect(resultados.every((r) => r.status === "pulado")).toBe(true);
      expect(apiClient.chamadas).toHaveLength(0);
    });
  });

  describe("dispararNotificacaoComunicado", () => {
    it("usa destinatarios explícitos (sem resolver nada), com origemId nulo", async () => {
      const apiClient = criarApiClientFake();
      const resultados = await dispararNotificacaoComunicado(db, apiClient, { email: "titular@example.com" }, { assunto: "Aviso geral", mensagem: "Leia com atenção" });

      expect(resultados.find((r) => r.canal === "email")).toMatchObject({ status: "enviado" });
      const historico = listarPorOrigem(db, "comunicado_generico", null);
      expect(historico).toHaveLength(1);
      expect(historico[0].assunto).toBe("Aviso geral");
    });
  });
});
