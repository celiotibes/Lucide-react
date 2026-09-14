import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarMovimentoPessoal,
  obterSaldoContaPessoal,
  obterRelatorioFinanceiroPessoal,
  avaliarSeparacaoPessoalXNegocio,
  validarSeparacaoContabil,
} from "../contas-pessoais";
import { prepararBancoTeste } from "./test-setup";

describe("Contas Pessoais", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("registrarMovimentoPessoal", () => {
    it("deve registrar movimento de entrada", () => {
      const resultado = registrarMovimentoPessoal(db, {
        conta_pessoal_id: 1,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-10",
        descricao: "Depósito pessoal",
        tipo_movimento: "entrada",
        valor: 1000,
        categoria: "renda_pessoal",
      });

      expect(resultado).toBeGreaterThan(0);
    });

    it("deve registrar movimento de saída", () => {
      const resultado = registrarMovimentoPessoal(db, {
        conta_pessoal_id: 1,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-15",
        descricao: "Retirada pessoal",
        tipo_movimento: "saida",
        valor: 300,
        categoria: "despesas_pessoais",
      });

      expect(resultado).toBeGreaterThan(0);
    });
  });

  describe("obterSaldoContaPessoal", () => {
    it("deve retornar saldo de conta pessoal", () => {
      registrarMovimentoPessoal(db, {
        conta_pessoal_id: 1,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-10",
        descricao: "Depósito",
        tipo_movimento: "entrada",
        valor: 1000,
        categoria: "renda",
      });

      const saldo = obterSaldoContaPessoal(db, 1);

      expect(typeof saldo).toBe("number");
      expect(saldo).toBeGreaterThan(0);
    });

    it("saldo deve considerar entradas e saídas", () => {
      registrarMovimentoPessoal(db, {
        conta_pessoal_id: 1,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-10",
        descricao: "Entrada",
        tipo_movimento: "entrada",
        valor: 500,
        categoria: "renda",
      });

      registrarMovimentoPessoal(db, {
        conta_pessoal_id: 1,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-15",
        descricao: "Saída",
        tipo_movimento: "saida",
        valor: 300,
        categoria: "despesa",
      });

      const saldo = obterSaldoContaPessoal(db, 1);

      expect(saldo).toBeCloseTo(700, 0);
    });
  });

  describe("obterRelatorioFinanceiroPessoal", () => {
    it("deve retornar relatório com estrutura válida", () => {
      const relatorio = obterRelatorioFinanceiroPessoal(db, periodo_id, entidade_id);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("contas");
      expect(relatorio).toHaveProperty("saldo_total");
      expect(relatorio).toHaveProperty("entradas_total");
      expect(relatorio).toHaveProperty("saidas_total");
      expect(Array.isArray(relatorio.contas)).toBe(true);
    });

    it("movimentos_por_categoria deve ser dicionário", () => {
      const relatorio = obterRelatorioFinanceiroPessoal(db, periodo_id, entidade_id);

      expect(typeof relatorio.movimentos_por_categoria).toBe("object");
    });
  });

  describe("avaliarSeparacaoPessoalXNegocio", () => {
    it("deve retornar estrutura de separação válida", () => {
      const separacao = avaliarSeparacaoPessoalXNegocio(db, entidade_id, periodo_id);

      expect(separacao).toHaveProperty("saldo_pessoal_liquido");
      expect(separacao).toHaveProperty("saldo_negocios");
      expect(separacao).toHaveProperty("percentual_pessoal");
      expect(separacao).toHaveProperty("movimentos_nao_classificados");
    });

    it("percentual_pessoal deve estar entre 0 e 100", () => {
      const separacao = avaliarSeparacaoPessoalXNegocio(db, entidade_id, periodo_id);

      expect(separacao.percentual_pessoal).toBeGreaterThanOrEqual(0);
      expect(separacao.percentual_pessoal).toBeLessThanOrEqual(100);
    });
  });

  describe("validarSeparacaoContabil", () => {
    it("deve retornar resultado de validação", () => {
      const validacao = validarSeparacaoContabil(db, entidade_id);

      expect(validacao).toHaveProperty("separacao_adequada");
      expect(validacao).toHaveProperty("avisos");
      expect(typeof validacao.separacao_adequada).toBe("boolean");
      expect(Array.isArray(validacao.avisos)).toBe(true);
    });

    it("avisos deve ser array de strings", () => {
      const validacao = validarSeparacaoContabil(db, entidade_id);

      for (const aviso of validacao.avisos) {
        expect(typeof aviso).toBe("string");
      }
    });
  });
});
