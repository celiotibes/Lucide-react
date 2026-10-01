import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import {
  emitirCobrancaAluguel,
  emitirCobrancaHonorario,
  listarCobrancas,
  aplicarEventosWebhookAsaas,
  type AsaasApiClient,
  type RespostaCobrancaAsaas,
} from "../asaasCobranca";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function ultimoId(tabela: string): number {
  return consultar<{ id: number }>(db, `SELECT id FROM ${tabela} ORDER BY id DESC LIMIT 1`)[0].id;
}

function criarImovel(apelido = "Kitnet 1"): number {
  executar(db, "INSERT INTO imoveis (apelido, tipo, financiado) VALUES (?, 'kitnet', 1)", [apelido]);
  return ultimoId("imoveis");
}

function criarContrato(overrides: Partial<{ locatario: string; valorReferencia: number; diaVencimento: number }> = {}): number {
  const imovelId = criarImovel();
  const p = { locatario: "Locatário Teste", valorReferencia: 1200, diaVencimento: 10, ...overrides };
  executar(
    db,
    `INSERT INTO contratos_locacao (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio)
     VALUES (?, ?, 'residencial_fixo', ?, ?, '2026-01-01')`,
    [imovelId, p.locatario, p.valorReferencia, p.diaVencimento],
  );
  return ultimoId("contratos_locacao");
}

function criarContratoLocatario(contratoId: number, overrides: Partial<{ cpf: string | null; email: string | null; telefone: string | null }> = {}): void {
  const p = { cpf: "52998224725", email: "locatario@example.com", telefone: "11999990000", ...overrides };
  executar(
    db,
    `INSERT INTO contrato_locatarios (contrato_id, nome, cpf, papel, telefone, email)
     VALUES (?, 'Locatário Teste', ?, 'locatario', ?, ?)`,
    [contratoId, p.cpf, p.telefone, p.email],
  );
}

function criarCompetencia(contratoId: number, overrides: Partial<{ valorDevido: number; dataVencimento: string; status: string; mes: number }> = {}): number {
  const imovel = consultar<{ imovel_id: number }>(db, "SELECT imovel_id FROM contratos_locacao WHERE id = ?", [contratoId])[0];
  const p = { valorDevido: 1200, dataVencimento: "2026-11-10", status: "pendente", mes: 11, ...overrides };
  executar(
    db,
    `INSERT INTO aluguel_competencias (contrato_id, imovel_id, ano, mes, data_vencimento, valor_devido, status, criado_em)
     VALUES (?, ?, 2026, ?, ?, ?, ?, '2026-10-01')`,
    [contratoId, imovel.imovel_id, p.mes, p.dataVencimento, p.valorDevido, p.status],
  );
  return ultimoId("aluguel_competencias");
}

function criarEntidadeLegalCliente(overrides: Partial<{ cpfCnpj: string; nome: string }> = {}): number {
  const p = { cpfCnpj: "11444777000161", nome: "Cliente da Advocacia LTDA", ...overrides };
  executar(
    db,
    `INSERT INTO entidades_legais (tipo, cpf_cnpj, nome) VALUES ('pessoa_juridica', ?, ?)`,
    [p.cpfCnpj, p.nome],
  );
  return ultimoId("entidades_legais");
}

function criarProcesso(entidadeId: number): number {
  executar(
    db,
    `INSERT INTO processos_legais (entidade_id, tipo, status, criado_em) VALUES (?, 'civel', 'ativo', '2026-10-01')`,
    [entidadeId],
  );
  return ultimoId("processos_legais");
}

function criarHonorario(processoId: number, overrides: Partial<{ valorDevido: number; dataVencimento: string; status: string }> = {}): number {
  const p = { valorDevido: 2500, dataVencimento: "2026-11-15", status: "pendente", ...overrides };
  executar(
    db,
    `INSERT INTO honorarios_advocaticios (processo_id, parcela_numero, valor_devido, data_vencimento, status, criado_em)
     VALUES (?, 1, ?, ?, ?, '2026-10-01')`,
    [processoId, p.valorDevido, p.dataVencimento, p.status],
  );
  return ultimoId("honorarios_advocaticios");
}

/** Fake de `AsaasApiClient` — nunca toca rede; cada instância conta quantas vezes cada
 * método foi chamado, para os testes confirmarem reuso de cliente (não duplica
 * asaas_clientes_externos). */
function criarApiClientFake(overrides: Partial<{ asaasCustomerId: string; respostaCobranca: Partial<RespostaCobrancaAsaas> }> = {}): AsaasApiClient & {
  chamadasCriarCliente: number;
  chamadasCriarCobranca: number;
  ultimaCobrancaEnviada: Record<string, unknown> | null;
} {
  const estado = {
    chamadasCriarCliente: 0,
    chamadasCriarCobranca: 0,
    ultimaCobrancaEnviada: null as Record<string, unknown> | null,
  };
  return {
    ...estado,
    async criarCliente() {
      estado.chamadasCriarCliente++;
      this.chamadasCriarCliente = estado.chamadasCriarCliente;
      // Um id diferente por chamada (quando não sobrescrito) — do contrário, dois
      // clientes Asaas distintos (ex: um locatário e uma entidade da advocacia, no mesmo
      // teste) colidiriam na UNIQUE(asaas_customer_id) de asaas_clientes_externos, o que
      // nunca aconteceria de verdade (a Asaas nunca devolve o mesmo id para dois clientes).
      return { asaasCustomerId: overrides.asaasCustomerId ?? `cus_fake_${estado.chamadasCriarCliente}` };
    },
    async criarCobranca(dados) {
      estado.chamadasCriarCobranca++;
      this.chamadasCriarCobranca = estado.chamadasCriarCobranca;
      estado.ultimaCobrancaEnviada = dados as unknown as Record<string, unknown>;
      this.ultimaCobrancaEnviada = estado.ultimaCobrancaEnviada;
      return {
        asaasChargeId: `pay_fake_${estado.chamadasCriarCobranca}`,
        status: "PENDING",
        boletoUrl: "https://sandbox.asaas.com/boleto/pay_fake_1",
        linhaDigitavel: "00190.00009 01234.567890 12345.678901 1 23450000150000",
        pixQrCode: null,
        ...overrides.respostaCobranca,
      };
    },
    async consultarCobranca(asaasChargeId: string) {
      return {
        asaasChargeId,
        status: "RECEIVED",
        boletoUrl: null,
        linhaDigitavel: null,
        pixQrCode: null,
      };
    },
  } as AsaasApiClient & { chamadasCriarCliente: number; chamadasCriarCobranca: number; ultimaCobrancaEnviada: Record<string, unknown> | null };
}

describe("asaasCobranca", () => {
  describe("emitirCobrancaAluguel", () => {
    it("cria o cliente Asaas, grava o mapeamento e a cobrança local com multa/juros", async () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId);
      const competenciaId = criarCompetencia(contratoId, { valorDevido: 1500, dataVencimento: "2026-12-10" });

      const apiClient = criarApiClientFake();
      const cobranca = await emitirCobrancaAluguel(db, apiClient, competenciaId, {
        tipoCobranca: "boleto",
        multaPercentual: 2,
        jurosPercentualMensal: 1,
      });

      expect(cobranca.origemTipo).toBe("aluguel_competencia");
      expect(cobranca.origemId).toBe(competenciaId);
      expect(cobranca.asaasChargeId).toBe("pay_fake_1");
      expect(cobranca.boletoUrl).toContain("pay_fake_1");
      expect(cobranca.valor).toBe(1500);
      expect(cobranca.status).toBe("pendente");
      expect(apiClient.chamadasCriarCliente).toBe(1);

      const mapeamento = consultar(db, "SELECT * FROM asaas_clientes_externos WHERE referencia_tipo = 'contrato_locacao' AND referencia_id = ?", [
        contratoId,
      ]);
      expect(mapeamento).toHaveLength(1);

      expect(apiClient.ultimaCobrancaEnviada?.fine).toEqual({ value: 2 });
      expect(apiClient.ultimaCobrancaEnviada?.interest).toEqual({ value: 1 });
    });

    it("reutiliza o cliente Asaas já mapeado — não chama criarCliente de novo para o mesmo contrato", async () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId);
      const competencia1 = criarCompetencia(contratoId, { dataVencimento: "2026-11-10", mes: 11 });
      const competencia2 = criarCompetencia(contratoId, { dataVencimento: "2026-12-10", mes: 12 });

      const apiClient = criarApiClientFake();
      await emitirCobrancaAluguel(db, apiClient, competencia1, { tipoCobranca: "boleto" });
      await emitirCobrancaAluguel(db, apiClient, competencia2, { tipoCobranca: "boleto" });

      expect(apiClient.chamadasCriarCliente).toBe(1);
      expect(apiClient.chamadasCriarCobranca).toBe(2);
    });

    it("recusa competência já recebida ou cancelada", async () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId);
      const competenciaRecebida = criarCompetencia(contratoId, { status: "recebido" });

      const apiClient = criarApiClientFake();
      await expect(emitirCobrancaAluguel(db, apiClient, competenciaRecebida, { tipoCobranca: "pix" })).rejects.toThrow(/recebido/);
    });

    it("recusa quando o locatário não tem CPF e opcoes.cpfCnpj não foi informado", async () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId, { cpf: null });
      const competenciaId = criarCompetencia(contratoId);

      const apiClient = criarApiClientFake();
      await expect(emitirCobrancaAluguel(db, apiClient, competenciaId, { tipoCobranca: "boleto" })).rejects.toThrow(/CPF/);
      expect(apiClient.chamadasCriarCliente).toBe(0);
    });

    it("aceita opcoes.cpfCnpj como sobrescrita quando contrato_locatarios não tem CPF", async () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId, { cpf: null });
      const competenciaId = criarCompetencia(contratoId);

      const apiClient = criarApiClientFake();
      const cobranca = await emitirCobrancaAluguel(db, apiClient, competenciaId, {
        tipoCobranca: "pix",
        cpfCnpj: "52998224725",
      });
      expect(cobranca.tipoCobranca).toBe("pix");
    });
  });

  describe("emitirCobrancaHonorario", () => {
    it("usa o cpf_cnpj da entidade legal (sempre presente) e grava a cobrança local", async () => {
      const entidadeId = criarEntidadeLegalCliente();
      const processoId = criarProcesso(entidadeId);
      const honorarioId = criarHonorario(processoId, { valorDevido: 3000 });

      const apiClient = criarApiClientFake();
      const cobranca = await emitirCobrancaHonorario(db, apiClient, honorarioId, { tipoCobranca: "boleto", multaPercentual: 2 });

      expect(cobranca.origemTipo).toBe("honorario_advocaticio");
      expect(cobranca.origemId).toBe(honorarioId);
      expect(cobranca.valor).toBe(3000);

      const mapeamento = consultar<{ referencia_tipo: string; cpf_cnpj: string }>(
        db,
        "SELECT referencia_tipo, cpf_cnpj FROM asaas_clientes_externos WHERE referencia_tipo = 'entidade_legal' AND referencia_id = ?",
        [entidadeId],
      );
      expect(mapeamento).toHaveLength(1);
      expect(mapeamento[0].cpf_cnpj).toBe("11444777000161");
    });

    it("recusa honorário já recebido ou cancelado", async () => {
      const entidadeId = criarEntidadeLegalCliente();
      const processoId = criarProcesso(entidadeId);
      const honorarioId = criarHonorario(processoId, { status: "cancelado" });

      const apiClient = criarApiClientFake();
      await expect(emitirCobrancaHonorario(db, apiClient, honorarioId, { tipoCobranca: "boleto" })).rejects.toThrow(/cancelado/);
    });
  });

  describe("listarCobrancas", () => {
    it("lista todas, mais recentes primeiro, e filtra por origemTipo/status", async () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId);
      const competenciaId = criarCompetencia(contratoId);

      const entidadeId = criarEntidadeLegalCliente();
      const processoId = criarProcesso(entidadeId);
      const honorarioId = criarHonorario(processoId);

      const apiClient = criarApiClientFake();
      await emitirCobrancaAluguel(db, apiClient, competenciaId, { tipoCobranca: "boleto" });
      await emitirCobrancaHonorario(db, apiClient, honorarioId, { tipoCobranca: "pix" });

      const todas = listarCobrancas(db);
      expect(todas).toHaveLength(2);
      expect(todas[0].origemTipo).toBe("honorario_advocaticio"); // mais recente primeiro

      const soAluguel = listarCobrancas(db, { origemTipo: "aluguel_competencia" });
      expect(soAluguel).toHaveLength(1);
      expect(soAluguel[0].origemId).toBe(competenciaId);

      const soPendentes = listarCobrancas(db, { status: "pendente" });
      expect(soPendentes).toHaveLength(2);
    });
  });

  describe("aplicarEventosWebhookAsaas", () => {
    it("marca a cobrança como 'pago' e a competência de origem como 'recebido', sem lançar no razão", async () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId);
      const competenciaId = criarCompetencia(contratoId);

      const apiClient = criarApiClientFake();
      await emitirCobrancaAluguel(db, apiClient, competenciaId, { tipoCobranca: "boleto" });

      const resultados = aplicarEventosWebhookAsaas(db, [
        { id: "evt_1", payload: { event: "PAYMENT_RECEIVED", payment: { id: "pay_fake_1", paymentDate: "2026-11-05" } } },
      ]);

      expect(resultados).toEqual([{ eventoId: "evt_1", aplicado: true }]);

      const cobranca = consultar<{ status: string; data_pagamento_confirmado: string; webhook_ultimo_evento: string }>(
        db,
        "SELECT status, data_pagamento_confirmado, webhook_ultimo_evento FROM cobrancas_asaas WHERE asaas_charge_id = 'pay_fake_1'",
      )[0];
      expect(cobranca.status).toBe("pago");
      expect(cobranca.data_pagamento_confirmado).toBe("2026-11-05");
      expect(cobranca.webhook_ultimo_evento).toBe("PAYMENT_RECEIVED");

      const competencia = consultar<{ status: string; data_recebimento: string; ledger_entry_id_baixa: number | null }>(
        db,
        "SELECT status, data_recebimento, ledger_entry_id_baixa FROM aluguel_competencias WHERE id = ?",
        [competenciaId],
      )[0];
      expect(competencia.status).toBe("recebido");
      expect(competencia.data_recebimento).toBe("2026-11-05");
      // Nenhum lançamento contábil automático — baixa contábil real exige o fluxo de
      // conciliação bancária existente (baixarCompetencia), não o webhook por si só.
      expect(competencia.ledger_entry_id_baixa).toBeNull();
      expect(consultar(db, "SELECT * FROM ledger_entries").length).toBe(0);
    });

    it("marca a cobrança como 'atrasado' em PAYMENT_OVERDUE, sem tocar a competência de origem", async () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId);
      const competenciaId = criarCompetencia(contratoId);
      const apiClient = criarApiClientFake();
      await emitirCobrancaAluguel(db, apiClient, competenciaId, { tipoCobranca: "boleto" });

      aplicarEventosWebhookAsaas(db, [{ id: "evt_2", payload: { event: "PAYMENT_OVERDUE", payment: { id: "pay_fake_1" } } }]);

      const cobranca = consultar<{ status: string }>(db, "SELECT status FROM cobrancas_asaas WHERE asaas_charge_id = 'pay_fake_1'")[0];
      expect(cobranca.status).toBe("atrasado");

      const competencia = consultar<{ status: string }>(db, "SELECT status FROM aluguel_competencias WHERE id = ?", [competenciaId])[0];
      expect(competencia.status).toBe("pendente");
    });

    it("marca a cobrança como 'cancelado' em PAYMENT_DELETED", async () => {
      const entidadeId = criarEntidadeLegalCliente();
      const processoId = criarProcesso(entidadeId);
      const honorarioId = criarHonorario(processoId);
      const apiClient = criarApiClientFake();
      await emitirCobrancaHonorario(db, apiClient, honorarioId, { tipoCobranca: "pix" });

      aplicarEventosWebhookAsaas(db, [{ id: "evt_3", payload: { event: "PAYMENT_DELETED", payment: { id: "pay_fake_1" } } }]);

      const cobranca = consultar<{ status: string }>(db, "SELECT status FROM cobrancas_asaas WHERE asaas_charge_id = 'pay_fake_1'")[0];
      expect(cobranca.status).toBe("cancelado");
    });

    it("não aplica (motivo explicado) quando não há cobrança local para o asaas_charge_id do evento", () => {
      const resultados = aplicarEventosWebhookAsaas(db, [
        { id: "evt_4", payload: { event: "PAYMENT_RECEIVED", payment: { id: "pay_desconhecido" } } },
      ]);
      expect(resultados[0].aplicado).toBe(false);
      expect(resultados[0].motivo).toMatch(/Nenhuma cobrança local/);
    });

    it("não aplica (motivo explicado) para payload sem 'event'/'payment.id', e para evento não mapeado", () => {
      const resultados = aplicarEventosWebhookAsaas(db, [
        { id: "evt_5", payload: { foo: "bar" } },
        { id: "evt_6", payload: { event: "PAYMENT_CREATED", payment: { id: "pay_x" } } },
      ]);
      expect(resultados[0].aplicado).toBe(false);
      expect(resultados[1].aplicado).toBe(false);
      expect(resultados[1].motivo).toMatch(/não mapeado/);
    });
  });
});
