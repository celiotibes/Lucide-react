import { describe, it, expect, beforeEach } from "vitest";
import { calcularBudgetVariance } from "../budget-variance";
import { prepararBancoTeste } from "./test-setup";

describe("Budget vs Realizado (Variance Analysis)", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("calcularBudgetVariance", () => {
    it("deve retornar estrutura de resumo orçamentário válida", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      expect(resumo).toHaveProperty("periodo");
      expect(resumo).toHaveProperty("receitas_orcadas");
      expect(resumo).toHaveProperty("receitas_realizadas");
      expect(resumo).toHaveProperty("receitas_variacao");
      expect(resumo).toHaveProperty("despesas_orcadas");
      expect(resumo).toHaveProperty("despesas_realizadas");
      expect(resumo).toHaveProperty("despesas_variacao");
      expect(resumo).toHaveProperty("resultado_orcado");
      expect(resumo).toHaveProperty("resultado_realizado");
      expect(resumo).toHaveProperty("resultado_variacao");
      expect(resumo).toHaveProperty("linhas");
    });

    it("linhas devem conter apenas receitas e despesas", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      for (const linha of resumo.linhas) {
        expect(["receita", "despesa"]).toContain(linha.grupo);
        expect(["receita", "despesa"]).toContain(linha.tipo);
      }
    });

    it("cada linha deve ter variação calculada", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      for (const linha of resumo.linhas) {
        const variacao_esperada = linha.realizado - linha.orcado;
        expect(linha.variacao).toBe(variacao_esperada);
      }
    });

    it("status deve estar em ok/alerta/critico", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      for (const linha of resumo.linhas) {
        expect(["ok", "alerta", "critico"]).toContain(linha.status);
      }
    });

    it("receita_variacao = receita_realizada - receita_orcada", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      const esperado = resumo.receitas_realizadas - resumo.receitas_orcadas;
      expect(resumo.receitas_variacao).toBe(esperado);
    });

    it("despesa_variacao = despesa_realizada - despesa_orcada", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      const esperado = resumo.despesas_realizadas - resumo.despesas_orcadas;
      expect(resumo.despesas_variacao).toBe(esperado);
    });

    it("resultado_variacao = resultado_realizado - resultado_orcado", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      const esperado = resumo.resultado_realizado - resumo.resultado_orcado;
      expect(resumo.resultado_variacao).toBe(esperado);
    });

    it("valores devem ser não-negativos (orcado e realizado)", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      expect(resumo.receitas_orcadas).toBeGreaterThanOrEqual(0);
      expect(resumo.receitas_realizadas).toBeGreaterThanOrEqual(0);
      expect(resumo.despesas_orcadas).toBeGreaterThanOrEqual(0);
      expect(resumo.despesas_realizadas).toBeGreaterThanOrEqual(0);
    });

    it("para receitas: status ok quando variação >= -5%", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      const receitasLinhas = resumo.linhas.filter((l) => l.grupo === "receita");
      for (const linha of receitasLinhas) {
        if (linha.variacao_percentual >= -5) {
          expect(linha.status).toBe("ok");
        }
      }
    });

    it("para despesas: status ok quando variação <= 5%", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      const despesasLinhas = resumo.linhas.filter((l) => l.grupo === "despesa");
      for (const linha of despesasLinhas) {
        if (linha.variacao_percentual <= 5) {
          expect(linha.status).toBe("ok");
        }
      }
    });

    it("resultado_orcado = receitas_orcadas - despesas_orcadas", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      const esperado = resumo.receitas_orcadas - resumo.despesas_orcadas;
      expect(resumo.resultado_orcado).toBe(esperado);
    });

    it("resultado_realizado = receitas_realizadas - despesas_realizadas", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      const esperado = resumo.receitas_realizadas - resumo.despesas_realizadas;
      expect(resumo.resultado_realizado).toBe(esperado);
    });

    it("período deve estar no formato YYYY/MM", () => {
      const resumo = calcularBudgetVariance(db, entidade_id, periodo_id);

      expect(resumo.periodo).toMatch(/^\d{4}\/\d{2}$/);
    });
  });
});
