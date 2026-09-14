import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs from "sql.js";
import { gerarDRE, gerarBalanco, gerarFluxoCaixa, gerarRelatorioIntegrado } from "../relatorios-integrados";
import { prepararBancoTeste } from "./test-setup";

describe("Relatórios Integrados", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("gerarDRE", () => {
    it("deve retornar estrutura DRE válida", () => {
      const dre = gerarDRE(db, entidade_id, periodo_id);

      expect(dre).toHaveProperty("receitas");
      expect(dre).toHaveProperty("custos");
      expect(dre).toHaveProperty("resultado_operacional");
      expect(dre).toHaveProperty("juros_e_multas");
      expect(dre).toHaveProperty("provisoes");
      expect(dre).toHaveProperty("resultado_final");
    });

    it("receitas devem ser não-negativas", () => {
      const dre = gerarDRE(db, entidade_id, periodo_id);

      expect(dre.receitas.total_receitas).toBeGreaterThanOrEqual(0);
      expect(dre.receitas.aluguel).toBeGreaterThanOrEqual(0);
      expect(dre.receitas.reajustes).toBeGreaterThanOrEqual(0);
      expect(dre.receitas.rateios).toBeGreaterThanOrEqual(0);
    });

    it("custos devem ser não-negativos", () => {
      const dre = gerarDRE(db, entidade_id, periodo_id);

      expect(dre.custos.total_custos).toBeGreaterThanOrEqual(0);
      expect(dre.custos.condominio).toBeGreaterThanOrEqual(0);
      expect(dre.custos.manutencao).toBeGreaterThanOrEqual(0);
    });

    it("resultado_operacional = receitas - custos", () => {
      const dre = gerarDRE(db, entidade_id, periodo_id);

      const esperado = dre.receitas.total_receitas - dre.custos.total_custos;
      expect(dre.resultado_operacional).toBe(esperado);
    });
  });

  describe("gerarBalanco", () => {
    it("deve retornar estrutura de balanço válida", () => {
      const balanco = gerarBalanco(db, entidade_id, periodo_id);

      expect(balanco).toHaveProperty("ativo");
      expect(balanco).toHaveProperty("passivo");
      expect(balanco).toHaveProperty("patrimonio_liquido");
      expect(balanco.ativo).toHaveProperty("circulante_total");
      expect(balanco.ativo).toHaveProperty("nao_circulante_total");
      expect(balanco.ativo).toHaveProperty("total_ativo");
    });

    it("ativo circulante e não-circulante devem somar total_ativo", () => {
      const balanco = gerarBalanco(db, entidade_id, periodo_id);

      const totalEsperado = balanco.ativo.circulante_total + balanco.ativo.nao_circulante_total;
      expect(balanco.ativo.total_ativo).toBe(totalEsperado);
    });

    it("passivo circulante e não-circulante devem somar total_passivo", () => {
      const balanco = gerarBalanco(db, entidade_id, periodo_id);

      const totalEsperado = balanco.passivo.circulante_total + balanco.passivo.nao_circulante_total;
      expect(balanco.passivo.total_passivo).toBe(totalEsperado);
    });

    it("total_ativo deve ser não-negativo", () => {
      const balanco = gerarBalanco(db, entidade_id, periodo_id);

      expect(balanco.ativo.total_ativo).toBeGreaterThanOrEqual(0);
    });

    it("total_passivo deve ser não-negativo", () => {
      const balanco = gerarBalanco(db, entidade_id, periodo_id);

      expect(balanco.passivo.total_passivo).toBeGreaterThanOrEqual(0);
    });
  });

  describe("gerarFluxoCaixa", () => {
    it("deve retornar estrutura de fluxo de caixa válida", () => {
      const fluxo = gerarFluxoCaixa(db, entidade_id, periodo_id);

      expect(fluxo).toHaveProperty("saldo_inicial");
      expect(fluxo).toHaveProperty("operacional");
      expect(fluxo).toHaveProperty("investimento");
      expect(fluxo).toHaveProperty("financiamento");
      expect(fluxo).toHaveProperty("saldo_final");
      expect(fluxo.operacional).toHaveProperty("liquido");
    });

    it("fluxo operacional deve calcular líquido corretamente", () => {
      const fluxo = gerarFluxoCaixa(db, entidade_id, periodo_id);

      const esperado = fluxo.operacional.entradas - fluxo.operacional.saidas;
      expect(fluxo.operacional.liquido).toBe(esperado);
    });

    it("saldo_final deve ser não-negativo (conservador)", () => {
      const fluxo = gerarFluxoCaixa(db, entidade_id, periodo_id);

      expect(fluxo.saldo_final).toBeGreaterThanOrEqual(0);
    });

    it("saldo final = inicial + fluxos", () => {
      const fluxo = gerarFluxoCaixa(db, entidade_id, periodo_id);

      const calculado =
        fluxo.saldo_inicial +
        fluxo.operacional.liquido +
        fluxo.investimento.liquido +
        fluxo.financiamento.liquido;

      // Permitir margem de erro pequena por arredondamento
      expect(Math.abs(fluxo.saldo_final - Math.max(0, calculado))).toBeLessThan(0.01);
    });
  });

  describe("gerarRelatorioIntegrado", () => {
    it("deve integrar DRE, balanço e fluxo de caixa", () => {
      const relatorio = gerarRelatorioIntegrado(db, entidade_id, periodo_id);

      expect(relatorio).toHaveProperty("dre");
      expect(relatorio).toHaveProperty("balanço");
      expect(relatorio).toHaveProperty("fluxo_caixa");
      expect(relatorio).toHaveProperty("resultado_liquido");
      expect(relatorio).toHaveProperty("margem_operacional");
    });

    it("resultado_liquido deve ser resultado_final da DRE", () => {
      const relatorio = gerarRelatorioIntegrado(db, entidade_id, periodo_id);

      expect(relatorio.resultado_liquido).toBe(relatorio.dre.resultado_final);
    });

    it("margem operacional deve estar entre -100 e 100 percent", () => {
      const relatorio = gerarRelatorioIntegrado(db, entidade_id, periodo_id);

      expect(relatorio.margem_operacional).toBeGreaterThanOrEqual(-100);
      expect(relatorio.margem_operacional).toBeLessThanOrEqual(100);
    });

    it("margem deve ser 0 quando receita total é 0", () => {
      const relatorio = gerarRelatorioIntegrado(db, entidade_id, periodo_id);

      if (relatorio.dre.receitas.total_receitas === 0) {
        expect(relatorio.margem_operacional).toBe(0);
      }
    });
  });
});
