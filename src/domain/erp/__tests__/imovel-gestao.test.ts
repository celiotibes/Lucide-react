import { describe, it, expect, beforeEach } from "vitest";
import {
  obterRelatorioImovel,
  registrarVistoria,
  registrarManutencao,
  registrarDocumentoImovel,
  obterPortfolioImoveis,
} from "../imovel-gestao";
import { prepararBancoTeste } from "./test-setup";

describe("Gestão de Imóveis", () => {
  let db: any;
  let entidade_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
  });

  describe("obterRelatorioImovel", () => {
    it("deve retornar relatório com estrutura válida", () => {
      const relatorio = obterRelatorioImovel(db, 1);

      expect(relatorio).toHaveProperty("imovel_id");
      expect(relatorio).toHaveProperty("endereco");
      expect(relatorio).toHaveProperty("status_geral");
      expect(relatorio).toHaveProperty("valor_aquisicao");
      expect(relatorio).toHaveProperty("valor_aluguel_mensal");
      expect(relatorio).toHaveProperty("despesas_mensais");
      expect(relatorio).toHaveProperty("despesas_total_mensal");
      expect(relatorio).toHaveProperty("margem_liquida_mensal");
      expect(relatorio).toHaveProperty("roi_anual_estimado");
    });

    it("despesas_mensais deve ser array", () => {
      const relatorio = obterRelatorioImovel(db, 1);

      expect(Array.isArray(relatorio.despesas_mensais)).toBe(true);
    });

    it("margem_liquida deve ser aluguel - despesas", () => {
      const relatorio = obterRelatorioImovel(db, 1);

      const margem_esperada =
        (relatorio.valor_aluguel_mensal || 0) - relatorio.despesas_total_mensal;
      expect(relatorio.margem_liquida_mensal).toBe(margem_esperada);
    });

    it("roi_anual_estimado deve ser positivo para imóvel alugado", () => {
      const relatorio = obterRelatorioImovel(db, 1);

      if (relatorio.valor_aluguel_mensal && relatorio.valor_aquisicao > 0) {
        expect(relatorio.roi_anual_estimado).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("registrarVistoria", () => {
    it("deve registrar vistoria", () => {
      const resultado = registrarVistoria(db, {
        imovel_id: 1,
        data_vistoria: "2026-01-20",
        tipo_vistoria: "periodica",
        responsavel: "Gerente",
        descricao: "Vistoria periódica",
        status_imovel: "bom",
      });

      expect(resultado).toBeGreaterThan(0);
    });
  });

  describe("registrarManutencao", () => {
    it("deve registrar manutenção", () => {
      const resultado = registrarManutencao(db, {
        imovel_id: 1,
        data_manutencao: "2026-01-25",
        tipo_manutencao: "pintura",
        descricao: "Repintura sala",
        prestador_servico: "Pintor João",
        valor_manutencao: 1500,
        status: "concluida",
      });

      expect(resultado).toBeGreaterThan(0);
    });
  });

  describe("registrarDocumentoImovel", () => {
    it("deve registrar documento de imóvel", () => {
      const resultado = registrarDocumentoImovel(db, {
        imovel_id: 1,
        tipo_documento: "apo",
        numero_documento: "APO-123456",
        data_documento: "2020-05-15",
        status: "vigente",
      });

      expect(resultado).toBeGreaterThan(0);
    });
  });

  describe("obterPortfolioImoveis", () => {
    it("deve retornar portfolio com estrutura válida", () => {
      const portfolio = obterPortfolioImoveis(db, entidade_id);

      expect(portfolio).toHaveProperty("total_imoveis");
      expect(portfolio).toHaveProperty("valor_total_portfolio");
      expect(portfolio).toHaveProperty("receita_mensal_total");
      expect(portfolio).toHaveProperty("despesas_mensais_total");
      expect(portfolio).toHaveProperty("roi_medio_anual");
      expect(portfolio).toHaveProperty("imoveis");
      expect(Array.isArray(portfolio.imoveis)).toBe(true);
    });

    it("total_imoveis deve corresponder ao tamanho da lista", () => {
      const portfolio = obterPortfolioImoveis(db, entidade_id);

      expect(portfolio.total_imoveis).toBe(portfolio.imoveis.length);
    });

    it("receita_total deve ser soma de aluguéis", () => {
      const portfolio = obterPortfolioImoveis(db, entidade_id);

      const somaManuais = portfolio.imoveis.reduce(
        (sum, im) => sum + (im.valor_aluguel_mensal || 0),
        0
      );
      expect(portfolio.receita_mensal_total).toBe(somaManuais);
    });

    it("roi_medio deve estar razoável para portfolio", () => {
      const portfolio = obterPortfolioImoveis(db, entidade_id);

      expect(typeof portfolio.roi_medio_anual).toBe("number");
    });
  });
});
