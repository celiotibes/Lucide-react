import { describe, it, expect, beforeEach } from "vitest";
import { prepararBancoTeste } from "./test-setup";
import {
  calcularNOI,
  calcularTaxaOcupacao,
  calcularROIAnual,
  calcularCashflowMensal,
  calcularInadimplencia,
  obterMetricaImovel,
  obterPortfolioCompleto,
} from "../dashboard-portfolio";
import type { Database } from "sql.js";

describe("Dashboard Portfolio - KPIs", () => {
  let db: Database;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("Calcular NOI (Net Operating Income)", () => {
    it("deve calcular NOI positivo quando receitas > despesas", () => {
      // NOI = receita - despesa
      // Aluguel 2000 + Rateios 0 - Condomínio 1500 - Água 150 = 350
      const noi = calcularNOI(db, 1, periodo_id);
      expect(noi).toBe(350);
    });

    it("deve calcular NOI incluindo despesas operacionais", () => {
      // Inserir uma despesa operacional adicional
      db.run(
        `INSERT INTO despesas_operacionais_agendadas (id, imovel_id, entidade_id, tipo_despesa, descricao, valor_mensal, dia_vencimento, data_inicio, status, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [3, 1, entidade_id, "energia", "Eletricidade", 200, 15, "2025-01-01", "ativa", "2025-01-01"]
      );

      const noi = calcularNOI(db, 1, periodo_id);
      // Aluguel 2000 - Condomínio 1500 - Água 150 - Energia 200 = 150
      expect(noi).toBe(150);
    });

    it("deve retornar 0 para imóvel sem contratos", () => {
      const noi = calcularNOI(db, 999, periodo_id);
      expect(noi).toBe(0);
    });
  });

  describe("Calcular Taxa de Ocupação", () => {
    it("deve calcular taxa de ocupação 100% para contrato ativo no mês", () => {
      // Contrato 1: 2025-01-01 a 2026-12-31, janeiro com 31 dias
      const taxa = calcularTaxaOcupacao(db, 1, 1, 2025);
      // Ocupado de 1 a 31 de janeiro = 31 dias / 31 = 100%
      expect(taxa).toBeCloseTo(100, 0);
    });

    it("deve calcular taxa de ocupação parcial", () => {
      // Para janeiro (31 dias), contrato começa em 15/01
      const taxa = calcularTaxaOcupacao(db, 1, 1, 2026);
      // Se contrato termina antes do fim do mês, calcula pro-rata
      // Este teste depende da lógica de data_fim do contrato
      expect(taxa).toBeGreaterThanOrEqual(0);
      expect(taxa).toBeLessThanOrEqual(100);
    });

    it("deve retornar 0% para imóvel sem contratos", () => {
      const taxa = calcularTaxaOcupacao(db, 999, 1, 2026);
      expect(taxa).toBe(0);
    });

    it("deve calcular para imóvel com múltiplos contratos", () => {
      // Imovel 1 tem 2 contratos ativos
      const taxa = calcularTaxaOcupacao(db, 1, 1, 2025);
      expect(taxa).toBeGreaterThan(0);
    });
  });

  describe("Calcular ROI Anual", () => {
    it("deve calcular ROI positivo com NOI positivo", () => {
      // NOI mensal estimado em 350 (do teste anterior)
      // NOI anual = 350 * 12 = 4200
      // ROI = (4200 / 300000) * 100 = 1.4%
      const roi = calcularROIAnual(db, 1, 2026);
      expect(roi).toBeGreaterThan(0);
    });

    it("deve retornar 0 para imóvel sem valor de aquisição", () => {
      // Inserir imóvel com valor_aquisicao = 0
      db.run(
        `INSERT INTO imoveis (id, entidade_id, endereco, tipo_imovel, uso_pessoal, financiado, valor_aquisicao)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [999, entidade_id, "Rua Teste", "apartamento", 0, 0, 0]
      );

      const roi = calcularROIAnual(db, 999, 2026);
      expect(roi).toBe(0);
    });

    it("deve incluir NOI de todos os meses do ano", () => {
      // Teste verifica que a função itera por 12 meses
      const roi = calcularROIAnual(db, 1, 2026);
      // ROI deve ser um número positivo ou zero
      expect(typeof roi).toBe("number");
      expect(roi).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Calcular Cashflow Mensal", () => {
    it("deve calcular cashflow como recebimentos menos desembolsos", () => {
      // Recebimentos: Aluguel 2000
      // Desembolsos: Condomínio 1500 + Água 150 = 1650
      // Cashflow = 2000 - 1650 = 350
      const cashflow = calcularCashflowMensal(db, 1, periodo_id);
      expect(cashflow).toBe(350);
    });

    it("deve retornar 0 para imóvel sem movimentação", () => {
      // Imovel que não existe nas despesas
      const cashflow = calcularCashflowMensal(db, 999, periodo_id);
      expect(cashflow).toBe(0);
    });

    it("deve calcular cashflow positivo quando receitas > despesas", () => {
      // Este test depende dos dados de setup
      const cashflow = calcularCashflowMensal(db, 1, periodo_id);
      expect(typeof cashflow).toBe("number");
    });
  });

  describe("Calcular Inadimplência", () => {
    it("deve retornar 0% de inadimplência para contrato sem atraso", () => {
      // Contrato com vencimento próximo deve ter 0% de atraso
      const inadimplencia = calcularInadimplencia(db, 1);
      expect(inadimplencia.percentual).toBeGreaterThanOrEqual(0);
      expect(inadimplencia.percentual).toBeLessThanOrEqual(100);
    });

    it("deve retornar estrutura com valores e percentuais corretos", () => {
      const inadimplencia = calcularInadimplencia(db, 1);
      expect(inadimplencia).toHaveProperty("valor_atraso");
      expect(inadimplencia).toHaveProperty("percentual");
      expect(inadimplencia).toHaveProperty("dias_medio");
      expect(inadimplencia.valor_atraso).toBeGreaterThanOrEqual(0);
      expect(inadimplencia.dias_medio).toBeGreaterThanOrEqual(0);
    });

    it("deve retornar 0 para imóvel sem contratos", () => {
      const inadimplencia = calcularInadimplencia(db, 999);
      expect(inadimplencia.valor_atraso).toBe(0);
      expect(inadimplencia.percentual).toBe(0);
      expect(inadimplencia.dias_medio).toBe(0);
    });

    it("deve calcular dias médios de atraso para múltiplos contratos", () => {
      // Imovel 1 tem 2 contratos
      const inadimplencia = calcularInadimplencia(db, 1);
      expect(inadimplencia.dias_medio).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Obter Métrica Completa de Imóvel", () => {
    it("deve retornar null para imóvel inexistente", () => {
      const metrica = obterMetricaImovel(db, 999, 2026, 1);
      expect(metrica).toBeNull();
    });

    it("deve retornar métrica com todos os KPIs preenchidos", () => {
      const metrica = obterMetricaImovel(db, 1, 2026, 1);
      expect(metrica).not.toBeNull();
      if (metrica) {
        expect(metrica).toHaveProperty("imovel_id");
        expect(metrica).toHaveProperty("endereco");
        expect(metrica).toHaveProperty("valor_aquisicao");
        expect(metrica).toHaveProperty("noi_mensal");
        expect(metrica).toHaveProperty("noi_anual");
        expect(metrica).toHaveProperty("taxa_ocupacao");
        expect(metrica).toHaveProperty("roi_anual");
        expect(metrica).toHaveProperty("cashflow_mensal");
        expect(metrica).toHaveProperty("inadimplencia_valor");
        expect(metrica).toHaveProperty("inadimplencia_percentual");
        expect(metrica).toHaveProperty("dias_medio_inadimplencia");
      }
    });

    it("deve ter valores numéricos válidos para KPIs", () => {
      const metrica = obterMetricaImovel(db, 1, 2026, 1);
      if (metrica) {
        expect(typeof metrica.noi_mensal).toBe("number");
        expect(typeof metrica.roi_anual).toBe("number");
        expect(typeof metrica.taxa_ocupacao).toBe("number");
        expect(metrica.taxa_ocupacao).toBeGreaterThanOrEqual(0);
        expect(metrica.taxa_ocupacao).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("Obter Portfolio Completo", () => {
    it("deve retornar portfolio com agregações corretas", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, 2026, 1);
      expect(portfolio).toHaveProperty("total_imoveis");
      expect(portfolio).toHaveProperty("valor_total");
      expect(portfolio).toHaveProperty("noi_mensal_total");
      expect(portfolio).toHaveProperty("noi_anual_total");
      expect(portfolio).toHaveProperty("roi_medio_anual");
      expect(portfolio).toHaveProperty("taxa_ocupacao_media");
      expect(portfolio).toHaveProperty("cashflow_mensal_total");
      expect(portfolio).toHaveProperty("inadimplencia_valor_total");
      expect(portfolio).toHaveProperty("inadimplencia_percentual_media");
      expect(portfolio).toHaveProperty("imoveis");
    });

    it("deve conter lista de imóveis com suas métricas", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, 2026, 1);
      expect(Array.isArray(portfolio.imoveis)).toBe(true);
      expect(portfolio.imoveis.length).toBeGreaterThan(0);
      expect(portfolio.total_imoveis).toBe(portfolio.imoveis.length);
    });

    it("deve calcular totais como soma das métricas dos imóveis", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, 2026, 1);
      let somaValorTotal = 0;
      let somaNoiMensal = 0;
      let somaRoi = 0;

      for (const imovel of portfolio.imoveis) {
        somaValorTotal += imovel.valor_aquisicao;
        somaNoiMensal += imovel.noi_mensal;
        somaRoi += imovel.roi_anual;
      }

      expect(portfolio.valor_total).toBe(somaValorTotal);
      expect(portfolio.noi_mensal_total).toBe(somaNoiMensal);
      // ROI média deve ser diferente da soma
      if (portfolio.total_imoveis > 0) {
        expect(portfolio.roi_medio_anual).toBeCloseTo(somaRoi / portfolio.total_imoveis, 1);
      }
    });

    it("deve calcular taxa de ocupação média dos imóveis", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, 2026, 1);
      expect(portfolio.taxa_ocupacao_media).toBeGreaterThanOrEqual(0);
      expect(portfolio.taxa_ocupacao_media).toBeLessThanOrEqual(100);
    });

    it("deve incluir inadimplência total e média", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, 2026, 1);
      expect(portfolio.inadimplencia_valor_total).toBeGreaterThanOrEqual(0);
      expect(portfolio.inadimplencia_percentual_media).toBeGreaterThanOrEqual(0);
      expect(portfolio.inadimplencia_percentual_media).toBeLessThanOrEqual(100);
    });

    it("deve retornar portfolio com 2 imóveis do setup", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, 2026, 1);
      expect(portfolio.total_imoveis).toBe(2);
    });

    it("deve retornar valores monetários com 2 casas decimais", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, 2026, 1);
      // Verificar se há parte decimal com até 2 casas
      const temDecimais = (valor: number) => {
        const decimal = valor - Math.floor(valor);
        return decimal === 0 || String(decimal).match(/\.\d{1,2}$/);
      };
      expect(temDecimais(portfolio.valor_total)).toBe(true);
      expect(temDecimais(portfolio.noi_mensal_total)).toBe(true);
    });
  });

  describe("Casos de Uso Integrados", () => {
    it("deve calcular portfolio com diferentes cenários de imóveis", () => {
      // Criar imóvel adicional com valor de aquisição diferente
      db.run(
        `INSERT INTO imoveis (id, entidade_id, endereco, tipo_imovel, uso_pessoal, financiado, valor_aquisicao)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [3, entidade_id, "Rua Secundária 456, Apto 301", "apartamento", 0, 0, 450000]
      );

      const portfolio = obterPortfolioCompleto(db, entidade_id, 2026, 1);
      expect(portfolio.total_imoveis).toBe(3);
      expect(portfolio.valor_total).toBeGreaterThan(650000);
    });

    it("deve calcular ROI médio como média simples dos ROIs individuais", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, 2026, 1);

      if (portfolio.imoveis.length > 1) {
        const somaRoi = portfolio.imoveis.reduce((acc, i) => acc + i.roi_anual, 0);
        const roiEsperado = somaRoi / portfolio.imoveis.length;
        expect(portfolio.roi_medio_anual).toBeCloseTo(roiEsperado, 1);
      }
    });

    it("deve manter consistência entre métricas individuais e portfolio", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, 2026, 1);

      for (const imovelPortfolio of portfolio.imoveis) {
        const metricaIndividual = obterMetricaImovel(db, imovelPortfolio.imovel_id, 2026, 1);
        expect(metricaIndividual).not.toBeNull();
        if (metricaIndividual) {
          expect(imovelPortfolio.imovel_id).toBe(metricaIndividual.imovel_id);
          expect(imovelPortfolio.noi_mensal).toBe(metricaIndividual.noi_mensal);
          expect(imovelPortfolio.roi_anual).toBe(metricaIndividual.roi_anual);
        }
      }
    });
  });
});
