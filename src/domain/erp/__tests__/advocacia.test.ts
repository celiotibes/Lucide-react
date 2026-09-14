import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarProcessoLegal,
  registrarDespesaLegal,
  obterRelatorioAdvocacia,
  registrarPartesProcesso,
} from "../advocacia";
import { prepararBancoTeste } from "./test-setup";

describe("Advocacia", () => {
  let db: any;
  let entidade_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
  });

  describe("registrarProcessoLegal", () => {
    it("deve registrar processo legal", () => {
      const resultado = registrarProcessoLegal(db, entidade_id, {
        numero_processo: "0000123-45.2026.8.26.0100",
        tipo: "cobrança",
        descricao: "Ação de cobrança",
        data_ajuizamento: "2026-01-15",
        status: "ativo",
        foro: "São Paulo",
        nivel_hierarquia: 1,
        valor_causa: 50000,
        estimativa_despesa: 5000,
        risco_potencial: "médio",
      });

      expect(resultado).toBeGreaterThan(0);
    });
  });

  describe("registrarDespesaLegal", () => {
    it("deve registrar despesa legal", () => {
      registrarProcessoLegal(db, entidade_id, {
        numero_processo: "0000123-45.2026.8.26.0100",
        tipo: "cobrança",
        descricao: "Ação de cobrança",
        data_ajuizamento: "2026-01-15",
        status: "ativo",
        foro: "São Paulo",
        nivel_hierarquia: 1,
        valor_causa: 50000,
        estimativa_despesa: 5000,
        risco_potencial: "médio",
      });

      const resultado = registrarDespesaLegal(db, entidade_id, 1, {
        processo_id: 2,
        data_lancamento: "2026-01-20",
        tipo_despesa: "honorarios_advocaticios",
        descricao: "Honorários iniciais",
        valor_despesa: 2500,
        beneficiario: "Dr. Advogado",
        referencia_documento: "NOTA001",
      });

      expect(resultado).toBeGreaterThan(0);
    });
  });

  describe("obterRelatorioAdvocacia", () => {
    it("deve retornar relatório com estrutura válida", () => {
      const relatorio = obterRelatorioAdvocacia(db);

      expect(relatorio).toHaveProperty("total_processos_ativos");
      expect(relatorio).toHaveProperty("processos_por_status");
      expect(relatorio).toHaveProperty("valor_total_causas");
      expect(relatorio).toHaveProperty("estimativa_total_despesas");
      expect(relatorio).toHaveProperty("despesas_realizadas");
      expect(relatorio).toHaveProperty("processos_por_risco");
    });

    it("deve contar processos ativos", () => {
      const relatorio = obterRelatorioAdvocacia(db);

      expect(typeof relatorio.total_processos_ativos).toBe("number");
      expect(relatorio.total_processos_ativos).toBeGreaterThanOrEqual(0);
    });

    it("valores devem ser não-negativos", () => {
      const relatorio = obterRelatorioAdvocacia(db);

      expect(relatorio.valor_total_causas).toBeGreaterThanOrEqual(0);
      expect(relatorio.estimativa_total_despesas).toBeGreaterThanOrEqual(0);
      expect(relatorio.despesas_realizadas).toBeGreaterThanOrEqual(0);
    });
  });

  describe("registrarPartesProcesso", () => {
    it("deve registrar parte em processo", () => {
      registrarProcessoLegal(db, entidade_id, {
        numero_processo: "0000123-45.2026.8.26.0100",
        tipo: "cobrança",
        descricao: "Ação de cobrança",
        data_ajuizamento: "2026-01-15",
        status: "ativo",
        foro: "São Paulo",
        nivel_hierarquia: 1,
        valor_causa: 50000,
        estimativa_despesa: 5000,
        risco_potencial: "médio",
      });

      const resultado = registrarPartesProcesso(db, {
        processo_id: 2,
        tipo_parte: "autor",
        nome_parte: "Proprietário PJ",
        contato: "proprietario@email.com",
      });

      expect(resultado).toBeGreaterThan(0);
    });
  });
});
