import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { criarEntidadeLegal } from "../erp/entidadeLegal";
import { registrarContaAPagar } from "../contasAPagar/contasAPagar";
import {
  calcularYieldBruto,
  calcularYieldLiquido,
  calcularGRM,
  calcularPaybackSimples,
  calcularCashOnCashReturn,
  calcularLTV,
  calcularDSCR,
  calcularDebtYield,
  calcularIndicadoresHistoricoPortfolio,
} from "./indicadoresHistorico";

/**
 * Cenário determinístico (schema real, via criarBancoDeTeste()):
 *
 * Imóvel 1 (financiado): valor_aquisicao 300.000, aluguel 2.000/mês o ano inteiro de 2026
 * (receita bruta anual = 24.000), despesa operacional de 200/mês em contas_a_pagar (12×200 =
 * 2.400/ano) → NOI anual = 21.600.
 * Financiamento SAC sem juros (taxa 0%, só para números exatos): valor_contratado 120.000,
 * 120 parcelas de 1.000 (amortização constante), contratado em 2024-01-01. Em 2026-01-01 já
 * venceram exatamente 24 parcelas → saldo devedor = 120.000 − 24×1.000 = 96.000. As parcelas
 * datadas em 2026 (Jan a Dez) são 12 — serviço da dívida anual = 12.000.
 *
 * Imóvel 2 (sem financiamento, sem valor_aquisicao): valida os casos `null`/motivo.
 * Imóvel 3: uso_pessoal = 1 — fora do portfólio de investimento.
 */
async function bancoCenario() {
  const db = await criarBancoDeTeste();
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "52998224725" });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  const entidade_id = r.entidade_id;

  executar(
    db,
    `INSERT INTO imoveis (id, apelido, tipo, financiado, uso_pessoal, valor_aquisicao)
     VALUES (1, 'Apto Financiado', 'apartamento', 1, 0, 300000)`,
  );
  executar(
    db,
    `INSERT INTO imoveis (id, apelido, tipo, financiado, uso_pessoal, valor_aquisicao)
     VALUES (2, 'Sala Sem Financiamento e Sem Valor', 'sala_comercial', 0, 0, NULL)`,
  );
  executar(
    db,
    `INSERT INTO imoveis (id, apelido, tipo, financiado, uso_pessoal, valor_aquisicao)
     VALUES (3, 'Residência', 'apartamento', 0, 1, 900000)`,
  );

  executar(
    db,
    `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
     VALUES (1, 1, 'Inquilino A', 'residencial_fixo', 2000, '2025-01-01', '2026-12-31')`,
  );

  for (let mes = 1; mes <= 12; mes++) {
    const mm = String(mes).padStart(2, "0");
    registrarContaAPagar(db, {
      entidade_id,
      fornecedor_nome: "Condomínio",
      descricao: `Condomínio ${mm}/2026`,
      valor: 200,
      data_vencimento: `2026-${mm}-05`,
      imovel_id: 1,
    });
  }

  executar(
    db,
    `INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total)
     VALUES (1, 1, 'Banco Teste', 'SAC', 120000, 0, '2024-01-01', 120)`,
  );

  return db;
}

describe("indicadores puros — números conhecidos", () => {
  it("calcularYieldBruto: receita bruta anual / valor de aquisição", () => {
    const r = calcularYieldBruto(24000, 300000);
    expect(r.valor).toBe(8);
    expect(r.formula).toMatch(/receita bruta anual/i);
  });

  it("calcularYieldBruto: sem valor_aquisicao retorna null com motivo, nunca 0/NaN", () => {
    const r = calcularYieldBruto(24000, null);
    expect(r.valor).toBeNull();
    expect(r.motivoNulo).toMatch(/valor_aquisicao/);
  });

  it("calcularYieldLiquido: NOI anual / valor de aquisição", () => {
    const r = calcularYieldLiquido(21600, 300000);
    expect(r.valor).toBe(7.2);
  });

  it("calcularGRM: valor de aquisição / receita bruta anual", () => {
    const r = calcularGRM(24000, 300000);
    expect(r.valor).toBe(12.5);
  });

  it("calcularGRM: receita bruta zero retorna null (divisão por zero), nunca Infinity", () => {
    const r = calcularGRM(0, 300000);
    expect(r.valor).toBeNull();
    expect(r.motivoNulo).toMatch(/zero/);
  });

  it("calcularPaybackSimples: valor de aquisição / NOI anual", () => {
    const r = calcularPaybackSimples(21600, 300000);
    expect(r.valor).toBeCloseTo(13.89, 2);
  });

  it("calcularPaybackSimples: NOI anual não positivo retorna null (nunca payback negativo/infinito)", () => {
    const r = calcularPaybackSimples(-100, 300000);
    expect(r.valor).toBeNull();
    expect(r.motivoNulo).toMatch(/não positivo/);
  });

  it("calcularCashOnCashReturn: (NOI anual - serviço da dívida) / capital próprio investido", () => {
    // capital próprio = 300000 - 120000 = 180000; fluxo pós-dívida = 21600 - 12000 = 9600
    const r = calcularCashOnCashReturn(21600, 12000, 300000, 120000);
    expect(r.valor).toBeCloseTo(5.33, 2);
  });

  it("calcularCashOnCashReturn: sem financiamento, capital próprio = valor de aquisição integral (coincide com yield líquido)", () => {
    const r = calcularCashOnCashReturn(21600, 0, 300000, 0);
    expect(r.valor).toBe(7.2);
  });

  it("calcularCashOnCashReturn: financiamento maior ou igual ao valor de aquisição retorna null", () => {
    const r = calcularCashOnCashReturn(21600, 12000, 300000, 350000);
    expect(r.valor).toBeNull();
    expect(r.motivoNulo).toMatch(/capital próprio/i);
  });

  it("calcularLTV: saldo devedor / valor de aquisição", () => {
    const r = calcularLTV(96000, 300000, true);
    expect(r.valor).toBe(32);
  });

  it("calcularLTV: sem financiamento retorna null (nunca 0% de alavancagem)", () => {
    const r = calcularLTV(null, 300000, false);
    expect(r.valor).toBeNull();
    expect(r.motivoNulo).toMatch(/sem financiamento/i);
  });

  it("calcularDSCR: NOI anual / serviço anual da dívida", () => {
    const r = calcularDSCR(21600, 12000, true);
    expect(r.valor).toBe(1.8);
  });

  it("calcularDSCR: sem financiamento retorna null", () => {
    const r = calcularDSCR(21600, null, false);
    expect(r.valor).toBeNull();
    expect(r.motivoNulo).toMatch(/não se aplica/i);
  });

  it("calcularDebtYield: NOI anual / saldo devedor atual", () => {
    const r = calcularDebtYield(21600, 96000, true);
    expect(r.valor).toBe(22.5);
  });
});

describe("calcularIndicadoresHistoricoPortfolio — integração com banco real", () => {
  let db: Database;

  beforeEach(async () => {
    db = await bancoCenario();
  });

  it("filtra uso_pessoal = 1 fora do portfólio", () => {
    const resultado = calcularIndicadoresHistoricoPortfolio(db, 2026, "2026-01-01");
    const ids = resultado.imoveis.map((i) => i.imovelId);
    expect(ids).not.toContain(3);
    expect(ids).toEqual([1, 2]); // ordenado por apelido: "Apto Financiado" < "Sala..."
  });

  it("imóvel 1 (financiado): todos os indicadores batem com o cenário calculado à mão", () => {
    const resultado = calcularIndicadoresHistoricoPortfolio(db, 2026, "2026-01-01");
    const imovel1 = resultado.imoveis.find((i) => i.imovelId === 1)!;

    expect(imovel1.valorAquisicao).toBe(300000);
    expect(imovel1.temFinanciamento).toBe(true);

    expect(imovel1.yieldBruto.valor).toBe(8);
    expect(imovel1.yieldLiquido.valor).toBe(7.2);
    expect(imovel1.grm.valor).toBe(12.5);
    expect(imovel1.paybackSimplesAnos.valor).toBeCloseTo(13.89, 2);
    expect(imovel1.ltv.valor).toBe(32);
    expect(imovel1.dscr.valor).toBe(1.8);
    expect(imovel1.debtYield.valor).toBe(22.5);
    expect(imovel1.cashOnCashReturn.valor).toBeCloseTo(5.33, 2);

    // cada indicador carrega a legenda (fórmula + fonte), sempre, mesmo com valor não-nulo
    for (const indicador of [
      imovel1.yieldBruto,
      imovel1.yieldLiquido,
      imovel1.grm,
      imovel1.paybackSimplesAnos,
      imovel1.cashOnCashReturn,
      imovel1.ltv,
      imovel1.dscr,
      imovel1.debtYield,
    ]) {
      expect(indicador.formula.length).toBeGreaterThan(0);
      expect(indicador.fonteDados.length).toBeGreaterThan(0);
      expect(indicador.motivoNulo).toBeUndefined();
    }
  });

  it("imóvel 2 (sem financiamento e sem valor_aquisicao): todos os indicadores vêm null com motivo, nunca 0/NaN/Infinity", () => {
    const resultado = calcularIndicadoresHistoricoPortfolio(db, 2026, "2026-01-01");
    const imovel2 = resultado.imoveis.find((i) => i.imovelId === 2)!;

    expect(imovel2.valorAquisicao).toBeNull();
    expect(imovel2.temFinanciamento).toBe(false);

    for (const indicador of [
      imovel2.yieldBruto,
      imovel2.yieldLiquido,
      imovel2.grm,
      imovel2.paybackSimplesAnos,
      imovel2.cashOnCashReturn,
      imovel2.ltv,
      imovel2.dscr,
      imovel2.debtYield,
    ]) {
      expect(indicador.valor).toBeNull();
      expect(Number.isNaN(indicador.valor)).toBe(false);
      expect(typeof indicador.motivoNulo).toBe("string");
      expect(indicador.motivoNulo!.length).toBeGreaterThan(0);
    }

    // LTV/DSCR/Debt Yield são "não se aplica" (sem financiamento), não "valor_aquisicao ausente"
    expect(imovel2.ltv.motivoNulo).toMatch(/sem financiamento/i);
    expect(imovel2.dscr.motivoNulo).toMatch(/não se aplica/i);
    expect(imovel2.debtYield.motivoNulo).toMatch(/não se aplica/i);
  });

  it("financiamento 'Outro' sem saldo_devedor_manual: LTV/DSCR/Debt Yield ficam null (nunca subestimados como zero)", async () => {
    const db2 = await criarBancoDeTeste();
    const r = criarEntidadeLegal(db2, { nome: "Titular 2", cpf_cnpj: "52998224725" });
    if (!r.entidade_id) throw new Error("fixture");
    executar(
      db2,
      `INSERT INTO imoveis (id, apelido, tipo, financiado, uso_pessoal, valor_aquisicao)
       VALUES (1, 'Imóvel Outro', 'kitnet', 1, 0, 200000)`,
    );
    executar(
      db2,
      `INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total)
       VALUES (1, 1, 'Consórcio XYZ', 'OUTRO', 100000, '2025-01-01', 120)`,
    );

    const resultado = calcularIndicadoresHistoricoPortfolio(db2, 2026, "2026-06-01");
    const imovel = resultado.imoveis.find((i) => i.imovelId === 1)!;

    expect(imovel.temFinanciamento).toBe(true);
    expect(imovel.ltv.valor).toBeNull();
    expect(imovel.ltv.motivoNulo).toMatch(/saldo_devedor_manual/);
    expect(imovel.dscr.valor).toBeNull();
    expect(imovel.debtYield.valor).toBeNull();
    // Cash-on-Cash também depende do serviço da dívida (parcela_mensal_manual) — igualmente incompleto
    expect(imovel.cashOnCashReturn.valor).toBeNull();
  });
});
