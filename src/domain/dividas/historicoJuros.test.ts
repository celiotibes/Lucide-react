import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal } from "../erp/entidadeLegal";
import { gerarCompetenciasPendentes } from "../erp/aluguel-competencias";
import { provisarJurosMora, reverterProvisaoJurosMora } from "../erp/integracao-inadimplencia";
import { registrarRateioDestino } from "./rateioDividas";
import { gerarCronogramaSAC } from "../financiamento/amortizacao";
import {
  calcularJurosMensaisFinanciamentoSacPrice,
  obterJurosPagosPeriodo,
  relatorioJurosMensal,
  relatorioJurosAnual,
} from "./historicoJuros";

const CPF_TESTE = "52998224725";

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

function criarFinanciamentoSac(overrides: Partial<{ instituicao: string; valor_contratado: number; taxa_juros_mensal: number; data_contrato: string; parcelas_total: number }> = {}): number {
  const imovelId = criarImovel();
  const p = {
    instituicao: "Caixa",
    valor_contratado: 300000,
    taxa_juros_mensal: 0.8,
    data_contrato: "2024-01-01",
    parcelas_total: 360,
    ...overrides,
  };
  executar(
    db,
    "INSERT INTO financiamentos (imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total) VALUES (?, ?, 'SAC', ?, ?, ?, ?)",
    [imovelId, p.instituicao, p.valor_contratado, p.taxa_juros_mensal, p.data_contrato, p.parcelas_total],
  );
  return ultimoId("financiamentos");
}

function criarFinanciamentoOutro(): number {
  const imovelId = criarImovel("Kitnet Consórcio");
  executar(
    db,
    "INSERT INTO financiamentos (imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total) VALUES (?, 'Administradora X', 'OUTRO', 200000, '2023-01-01', 180)",
    [imovelId],
  );
  return ultimoId("financiamentos");
}

function criarDividaConsumo(overrides: Partial<{ instituicao: string; saldo: number; taxaEstimada: number | null }> = {}): number {
  const p = { instituicao: "Banco X", saldo: 10000, taxaEstimada: null as number | null, ...overrides };
  executar(
    db,
    "INSERT INTO dividas_consumo (tipo, instituicao, saldo_devedor_atual, parcela_mensal, data_referencia_saldo, taxa_juros_mensal_estimada) VALUES ('consignado', ?, ?, 500, '2026-01-01', ?)",
    [p.instituicao, p.saldo, p.taxaEstimada],
  );
  return ultimoId("dividas_consumo");
}

function registrarPagamentoHistorico(
  dividaTipo: "divida_consumo" | "financiamento",
  dividaId: number,
  data: string,
  valorJuros: number | null,
  confirmado: 0 | 1 = 1,
): number {
  executar(
    db,
    "INSERT INTO divida_pagamentos_historico (divida_tipo, divida_id, data_pagamento, valor_pago, valor_juros, valor_amortizacao, origem, confirmado_por_usuario) VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)",
    [dividaTipo, dividaId, data, (valorJuros ?? 0) + 100, valorJuros, 100, confirmado],
  );
  return ultimoId("divida_pagamentos_historico");
}

function criarContrato(overrides: Partial<{ imovelId: number; valorReferencia: number; diaVencimento: number }> = {}): number {
  const imovelId = overrides.imovelId ?? criarImovel("Kitnet Locação");
  executar(
    db,
    `INSERT INTO contratos_locacao
      (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio,
       multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual)
     VALUES (?, 'Locatário Teste', 'residencial_fixo', ?, ?, '2024-01-01', 2.0, 5, 10.0, 1.0)`,
    [imovelId, overrides.valorReferencia ?? 1000, overrides.diaVencimento ?? 10],
  );
  return ultimoId("contratos_locacao");
}

function gerarMoraNoRazao(contratoId: number, ano: number, mes: number, dataReferencia: string): number {
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Falha ao criar entidade: ${r.mensagem}`);

  gerarCompetenciasPendentes(db, contratoId, dataReferencia);
  const competenciaId = consultar<{ id: number }>(
    db,
    "SELECT id FROM aluguel_competencias WHERE contrato_id = ? AND ano = ? AND mes = ?",
    [contratoId, ano, mes],
  )[0].id;

  const resultado = provisarJurosMora(db, competenciaId, r.entidade_id, { data_referencia: dataReferencia });
  if (!resultado.sucesso || resultado.valorJurosMulta <= 0) {
    throw new Error(`Fixture de mora não gerou juros: ${resultado.mensagem}`);
  }
  return competenciaId;
}

describe("historicoJuros", () => {
  describe("calcularJurosMensaisFinanciamentoSacPrice", () => {
    it("extrai o componente de juros exato de uma parcela SAC a partir do cronograma", () => {
      const financiamento = {
        id: 1,
        imovel_id: 1,
        instituicao: "Caixa",
        sistema: "SAC" as const,
        valor_contratado: 300000,
        taxa_juros_mensal: 0.8,
        data_contrato: "2024-01-01",
        parcelas_total: 360,
        saldo_devedor_manual: null,
        parcela_mensal_manual: null,
        data_referencia_saldo_manual: null,
      };

      const resultado = calcularJurosMensaisFinanciamentoSacPrice(financiamento, 2, 2024);
      expect(resultado).not.toBeNull();
      expect(resultado?.parcelaNumero).toBe(1);

      // Confere batendo com o cronograma calculado diretamente por amortizacao.ts
      const cronograma = gerarCronogramaSAC(300000, 0.8, 360, "2024-01-01");
      expect(resultado?.valorJuros).toBeCloseTo(cronograma[0].juros, 6);
      expect(resultado?.saldoDevedorInicial).toBeCloseTo(300000, 6);
    });

    it("retorna null quando o financiamento não tem parcela naquele mês/ano", () => {
      const financiamento = {
        id: 1,
        imovel_id: 1,
        instituicao: "Caixa",
        sistema: "SAC" as const,
        valor_contratado: 300000,
        taxa_juros_mensal: 0.8,
        data_contrato: "2024-01-01",
        parcelas_total: 12,
        saldo_devedor_manual: null,
        parcela_mensal_manual: null,
        data_referencia_saldo_manual: null,
      };
      expect(calcularJurosMensaisFinanciamentoSacPrice(financiamento, 6, 2030)).toBeNull();
    });
  });

  describe("obterJurosPagosPeriodo — fonte 'exato' (financiamento SAC/PRICE)", () => {
    it("gera um evento por parcela dentro do período, com valor batendo com o cronograma", () => {
      const financiamentoId = criarFinanciamentoSac({ valor_contratado: 300000, taxa_juros_mensal: 0.8, parcelas_total: 360, data_contrato: "2024-01-01" });

      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2024, anoFim: 2024 });
      // Contrato em 2024-01-01: a 1ª parcela cai em 2024-02-01 (1 mês após o contrato) — só
      // 11 das 12 parcelas do 1º ano caem dentro de 2024 (fev a dez); a 12ª cai em jan/2025.
      expect(eventos.length).toBe(11);
      expect(eventos.every((e) => e.fonte === "exato")).toBe(true);
      expect(eventos.every((e) => e.dividaTipo === "financiamento" && e.dividaId === financiamentoId)).toBe(true);

      const cronograma = gerarCronogramaSAC(300000, 0.8, 360, "2024-01-01");
      // primeira parcela cai em fevereiro/2024 (1 mês após o contrato)
      expect(eventos[0].data).toBe(cronograma[0].data);
      expect(eventos[0].valorJuros).toBeCloseTo(cronograma[0].juros, 2);
      // juros decrescem mês a mês em SAC
      expect(eventos[1].valorJuros).toBeLessThan(eventos[0].valorJuros);
    });

    it("sem rateio cadastrado, a quebra por destino é 100% 'não classificado'", () => {
      criarFinanciamentoSac();
      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2024, anoFim: 2024 });
      expect(eventos[0].quebraPorDestino).toEqual([{ destino: "não classificado", valor: eventos[0].valorJuros }]);
    });

    it("com rateio cadastrado, a quebra por destino reflete os percentuais", () => {
      const financiamentoId = criarFinanciamentoSac();
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Empresa (imóveis)", percentual: 70 });
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Pessoal", percentual: 30 });

      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2024, anoFim: 2024 });
      const evento = eventos[0];
      const soma = evento.quebraPorDestino.reduce((acc, f) => acc + f.valor, 0);
      expect(Math.round(soma * 100) / 100).toBeCloseTo(evento.valorJuros, 2);
      expect(evento.quebraPorDestino.find((f) => f.destino === "Empresa (imóveis)")?.valor).toBeCloseTo(evento.valorJuros * 0.7, 2);
      expect(evento.quebraPorDestino.find((f) => f.destino === "não classificado")).toBeUndefined();
    });

    it("com rateio parcial (soma < 100%), o resíduo aparece como 'não classificado'", () => {
      const financiamentoId = criarFinanciamentoSac();
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Pessoal", percentual: 40 });

      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2024, anoFim: 2024 });
      const evento = eventos[0];
      const naoClassificado = evento.quebraPorDestino.find((f) => f.destino === "não classificado");
      expect(naoClassificado).toBeDefined();
      expect(naoClassificado?.valor).toBeCloseTo(evento.valorJuros * 0.6, 2);
    });
  });

  describe("obterJurosPagosPeriodo — fonte 'confirmado' (divida_pagamentos_historico)", () => {
    it("dívida de consumo: só linhas confirmadas com valor_juros preenchido entram no relatório", () => {
      const dividaId = criarDividaConsumo({ instituicao: "Banco Confirmado" });
      registrarPagamentoHistorico("divida_consumo", dividaId, "2025-03-15", 85.5, 1);
      registrarPagamentoHistorico("divida_consumo", dividaId, "2025-04-15", 80, 0); // não confirmado — ignorado
      registrarPagamentoHistorico("divida_consumo", dividaId, "2025-05-15", null, 1); // confirmado mas sem valor_juros — ignorado

      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2025, anoFim: 2025 }).filter((e) => e.dividaId === dividaId);
      expect(eventos).toHaveLength(1);
      expect(eventos[0].fonte).toBe("confirmado");
      expect(eventos[0].valorJuros).toBe(85.5);
      expect(eventos[0].data).toBe("2025-03-15");
    });

    it("financiamento 'OUTRO': entra via histórico confirmado, não via cronograma (que não existe para 'OUTRO')", () => {
      const financiamentoId = criarFinanciamentoOutro();
      registrarPagamentoHistorico("financiamento", financiamentoId, "2025-02-10", 620, 1);

      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2025, anoFim: 2025 }).filter((e) => e.dividaId === financiamentoId);
      expect(eventos).toHaveLength(1);
      expect(eventos[0].fonte).toBe("confirmado");
      expect(eventos[0].dividaTipo).toBe("financiamento");
      expect(eventos[0].valorJuros).toBe(620);
    });
  });

  describe("obterJurosPagosPeriodo — fonte 'estimado' (dívida de consumo sem histórico confirmado)", () => {
    it("estima juros mensal como saldo × taxa quando não há nenhuma linha confirmada", () => {
      const dividaId = criarDividaConsumo({ instituicao: "Banco Estimado", saldo: 10000, taxaEstimada: 2.5 });

      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2025, anoFim: 2025 }).filter((e) => e.dividaId === dividaId);
      expect(eventos).toHaveLength(12);
      expect(eventos.every((e) => e.fonte === "estimado")).toBe(true);
      expect(eventos[0].valorJuros).toBeCloseTo(10000 * 0.025, 6);
    });

    it("dívida com histórico confirmado utilizável NÃO gera estimativa (evita duplicar a fonte 'confirmado')", () => {
      const dividaId = criarDividaConsumo({ instituicao: "Banco Misto", saldo: 10000, taxaEstimada: 2.5 });
      registrarPagamentoHistorico("divida_consumo", dividaId, "2025-06-10", 200, 1);

      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2025, anoFim: 2025 }).filter((e) => e.dividaId === dividaId);
      expect(eventos).toHaveLength(1);
      expect(eventos[0].fonte).toBe("confirmado");
    });

    it("dívida sem taxa estimada e sem histórico confirmado não gera nenhum evento", () => {
      const dividaId = criarDividaConsumo({ instituicao: "Banco Sem Dado", saldo: 10000, taxaEstimada: null });
      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2025, anoFim: 2025 }).filter((e) => e.dividaId === dividaId);
      expect(eventos).toHaveLength(0);
    });
  });

  describe("obterJurosPagosPeriodo — fonte 'mora' (ledger_entries, origem_modulo='inadimplencia_juros')", () => {
    it("lê juros/multa de mora provisionados no razão e classifica como 'não classificado' (sem mecanismo de rateio para contrato de locação)", () => {
      const contratoId = criarContrato({ diaVencimento: 10, valorReferencia: 1000 });
      const competenciaId = gerarMoraNoRazao(contratoId, 2025, 6, "2025-06-20");

      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2025, anoFim: 2025 }).filter((e) => e.fonte === "mora");
      expect(eventos).toHaveLength(1);
      expect(eventos[0].dividaTipo).toBe("contrato_locacao");
      expect(eventos[0].dividaId).toBe(competenciaId);
      expect(eventos[0].valorJuros).toBeGreaterThan(0);
      expect(eventos[0].quebraPorDestino).toEqual([{ destino: "não classificado", valor: eventos[0].valorJuros }]);
    });

    it("provisão estornada não aparece no relatório", () => {
      const contratoId = criarContrato({ diaVencimento: 10, valorReferencia: 1000 });
      gerarMoraNoRazao(contratoId, 2025, 6, "2025-06-20");

      // reverte a provisão
      const competenciaId = consultar<{ id: number }>(
        db,
        "SELECT id FROM aluguel_competencias WHERE contrato_id = ? AND ano = 2025 AND mes = 6",
        [contratoId],
      )[0].id;
      reverterProvisaoJurosMora(db, competenciaId, "teste: locatário pagou");

      const eventos = obterJurosPagosPeriodo(db, { anoInicio: 2025, anoFim: 2025 }).filter((e) => e.fonte === "mora");
      expect(eventos).toHaveLength(0);
    });
  });

  describe("relatorioJurosMensal", () => {
    it("agrupa só os eventos do mês pedido, com total geral e total por destino", () => {
      const financiamentoId = criarFinanciamentoSac({ data_contrato: "2024-01-01" });
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Pessoal", percentual: 100 });

      const relatorio = relatorioJurosMensal(db, 2024, 2); // primeira parcela cai em fev/2024
      expect(relatorio.eventos).toHaveLength(1);
      expect(relatorio.totalGeral).toBeCloseTo(relatorio.eventos[0].valorJuros, 2);
      expect(relatorio.totalPorDestino).toEqual([{ destino: "Pessoal", valor: relatorio.totalGeral }]);
    });

    it("mês sem nenhum evento retorna totais zerados e lista vazia", () => {
      const relatorio = relatorioJurosMensal(db, 2025, 1);
      expect(relatorio.eventos).toHaveLength(0);
      expect(relatorio.totalGeral).toBe(0);
      expect(relatorio.totalPorDestino).toEqual([]);
    });
  });

  describe("relatorioJurosAnual", () => {
    it("consolidado do ano bate exatamente com a soma dos 12 meses", () => {
      criarFinanciamentoSac({ data_contrato: "2024-01-01" });
      const dividaId = criarDividaConsumo({ instituicao: "Banco Estimado Anual", saldo: 5000, taxaEstimada: 1.5 });
      void dividaId;

      const relatorio = relatorioJurosAnual(db, 2024);
      expect(relatorio.porMes).toHaveLength(12);

      const somaMeses = relatorio.porMes.reduce((acc, m) => acc + m.totalGeral, 0);
      expect(Math.round(somaMeses * 100) / 100).toBeCloseTo(relatorio.totalGeral, 2);

      const somaEventosMeses = relatorio.porMes.reduce((acc, m) => acc + m.eventos.length, 0);
      expect(somaEventosMeses).toBe(relatorio.eventos.length);
    });

    it("quebra por destino do ano bate com a soma das quebras mensais", () => {
      const financiamentoId = criarFinanciamentoSac({ data_contrato: "2024-01-01" });
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Advocacia", percentual: 25 });
      registrarRateioDestino(db, { dividaTipo: "financiamento", dividaId: financiamentoId, destino: "Pessoal", percentual: 75 });

      const relatorio = relatorioJurosAnual(db, 2024);
      const somaPessoalMeses = relatorio.porMes.reduce(
        (acc, m) => acc + (m.totalPorDestino.find((d) => d.destino === "Pessoal")?.valor ?? 0),
        0,
      );
      const totalPessoalAno = relatorio.totalPorDestino.find((d) => d.destino === "Pessoal")?.valor ?? 0;
      expect(Math.round(somaPessoalMeses * 100) / 100).toBeCloseTo(totalPessoalAno, 2);
    });

    it("mistura fontes 'exato', 'confirmado', 'estimado' e 'mora' no mesmo ano, cada uma com seu rótulo preservado", () => {
      criarFinanciamentoSac({ data_contrato: "2025-01-01" });

      const financiamentoOutroId = criarFinanciamentoOutro();
      registrarPagamentoHistorico("financiamento", financiamentoOutroId, "2025-03-05", 600, 1);

      criarDividaConsumo({ instituicao: "Banco Estimado Misto", saldo: 8000, taxaEstimada: 2.0 });

      const contratoId = criarContrato({ diaVencimento: 10, valorReferencia: 1000 });
      gerarMoraNoRazao(contratoId, 2025, 6, "2025-06-20");

      const relatorio = relatorioJurosAnual(db, 2025);
      const fontesPresentes = new Set(relatorio.eventos.map((e) => e.fonte));
      expect(fontesPresentes).toEqual(new Set(["exato", "confirmado", "estimado", "mora"]));
    });
  });
});
