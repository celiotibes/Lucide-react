import { describe, it, expect, beforeEach } from "vitest";
import {
  calcularKPIRentabilidade,
  calcularTendencia,
  calcularOcupacao,
  calcularComposicaoPatrimonio,
} from "../analytics-integradas";
import { prepararBancoTeste } from "./test-setup";

describe("Analytics Integrados", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("calcularKPIRentabilidade", () => {
    it("deve retornar estrutura de KPIs válida", () => {
      const kpis = calcularKPIRentabilidade(db, entidade_id, periodo_id);

      expect(kpis).toHaveProperty("receita_total");
      expect(kpis).toHaveProperty("despesa_total");
      expect(kpis).toHaveProperty("margem_operacional");
      expect(kpis).toHaveProperty("roi_patrimonio");
      expect(kpis).toHaveProperty("taxa_inadimplencia");
    });

    it("margens devem estar entre -100 e 100 percent", () => {
      const kpis = calcularKPIRentabilidade(db, entidade_id, periodo_id);

      expect(kpis.margem_operacional).toBeGreaterThanOrEqual(-100);
      expect(kpis.margem_operacional).toBeLessThanOrEqual(100);
    });

    it("ROI e taxa_inadimplencia devem estar entre -100 e 100 percent", () => {
      const kpis = calcularKPIRentabilidade(db, entidade_id, periodo_id);

      expect(kpis.roi_patrimonio).toBeGreaterThanOrEqual(-100);
      expect(kpis.roi_patrimonio).toBeLessThanOrEqual(100);
      expect(kpis.taxa_inadimplencia).toBeGreaterThanOrEqual(0);
      expect(kpis.taxa_inadimplencia).toBeLessThanOrEqual(100);
    });

    it("receita_total deve ser não-negativo", () => {
      const kpis = calcularKPIRentabilidade(db, entidade_id, periodo_id);

      expect(kpis.receita_total).toBeGreaterThanOrEqual(0);
    });
  });

  describe("calcularTendencia", () => {
    it("deve retornar estrutura de tendência válida", () => {
      const tendencia = calcularTendencia(db, entidade_id, periodo_id, periodo_id);

      expect(tendencia).toHaveProperty("periodo_atual");
      expect(tendencia).toHaveProperty("periodo_anterior");
      expect(tendencia).toHaveProperty("variacao_receita_pct");
      expect(tendencia).toHaveProperty("tendencia");
    });

    it("tendência deve estar em 'crescente', 'decrescente' ou 'estavel'", () => {
      const tendencia = calcularTendencia(db, entidade_id, periodo_id, periodo_id);

      expect(["crescente", "decrescente", "estavel"]).toContain(tendencia.tendencia);
    });

    it("variações percentuais devem ser números", () => {
      const tendencia = calcularTendencia(db, entidade_id, periodo_id, periodo_id);

      expect(typeof tendencia.variacao_receita_pct).toBe("number");
      expect(typeof tendencia.variacao_despesa_pct).toBe("number");
      expect(typeof tendencia.variacao_lucro_pct).toBe("number");
    });
  });

  describe("calcularOcupacao", () => {
    it("deve retornar estrutura de ocupação válida", () => {
      const ocupacao = calcularOcupacao(db);

      expect(ocupacao).toHaveProperty("taxa_ocupacao_pct");
      expect(ocupacao).toHaveProperty("total_imoveis");
      expect(ocupacao).toHaveProperty("imoveis_alugados");
      expect(ocupacao).toHaveProperty("imoveis_vagos");
    });

    it("taxa_ocupacao_pct deve estar entre 0 e 100 percent", () => {
      const ocupacao = calcularOcupacao(db);

      expect(ocupacao.taxa_ocupacao_pct).toBeGreaterThanOrEqual(0);
      expect(ocupacao.taxa_ocupacao_pct).toBeLessThanOrEqual(100);
    });

    it("imoveis_alugados + imoveis_vagos deve = total_imoveis", () => {
      const ocupacao = calcularOcupacao(db);

      expect(ocupacao.imoveis_alugados + ocupacao.imoveis_vagos).toBe(ocupacao.total_imoveis);
    });

    it("para zero imóveis, taxa deve ser 0", () => {
      const ocupacao = calcularOcupacao(db);

      if (ocupacao.total_imoveis === 0) {
        expect(ocupacao.taxa_ocupacao_pct).toBe(0);
      }
    });
  });

  describe("calcularComposicaoPatrimonio", () => {
    it("deve retornar estrutura de composição válida", () => {
      const composicao = calcularComposicaoPatrimonio(db);

      expect(composicao).toHaveProperty("valor_total_imoveis");
      expect(composicao).toHaveProperty("valor_liquido_imoveis");
      expect(composicao).toHaveProperty("proporção_financiado_pct");
      expect(composicao).toHaveProperty("valor_financiado");
    });

    it("todos os valores devem ser não-negativos", () => {
      const composicao = calcularComposicaoPatrimonio(db);

      expect(composicao.valor_total_imoveis).toBeGreaterThanOrEqual(0);
      expect(composicao.valor_liquido_imoveis).toBeGreaterThanOrEqual(0);
      expect(composicao.valor_financiado).toBeGreaterThanOrEqual(0);
    });

    it("proporção_financiado_pct deve estar entre 0 e 100", () => {
      const composicao = calcularComposicaoPatrimonio(db);

      expect(composicao.proporção_financiado_pct).toBeGreaterThanOrEqual(0);
      expect(composicao.proporção_financiado_pct).toBeLessThanOrEqual(100);
    });
  });
});
