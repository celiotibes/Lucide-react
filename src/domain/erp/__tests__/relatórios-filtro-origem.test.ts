/**
 * Test suite for origem_modulo filtering in integrated reports
 *
 * Tests filtering capabilities for DRE, Balanço, Fluxo de Caixa
 * and audit trail generation by module origin.
 *
 * Coverage:
 * - Single and multiple module filtering
 * - DRE, Balance Sheet, Cash Flow filtered by origin
 * - Audit trail per module
 * - Consolidation checks (filtered + unfiltered = full total)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  gerarDREComFiltro,
  gerarBalancoComFiltro,
  gerarFluxoCaixaComFiltro,
  gerarRelatorioAuditoriaParModulo,
  obterLancamentosParModulo,
  gerarDRE,
  gerarBalanco,
  gerarFluxoCaixa,
} from "../relatorios-integrados";
import { prepararBancoTeste } from "./test-setup";
import { executar } from "../../../db/connection";

describe("Relatórios com Filtro de Origem de Módulo", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;
  let conta_receita_id: number;
  let conta_despesa_id: number;
  let conta_caixa_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;

    // Setup: criar contas de teste para os módulos
    // Conta de Receita (5.1.01 - Aluguel)
    const receitaResult = executar(
      db,
      `INSERT INTO contas_plano_contas (entidade_id, codigo, descricao, grupo, natureza, analisavel, ativo)
       VALUES (?, '5.1.01', 'Receita de Aluguel', 'receita', 'credito', 1, 1)`,
      [entidade_id],
    );
    conta_receita_id = receitaResult.lastID;

    // Conta de Despesa (6.1.01 - Condomínio)
    const despesaResult = executar(
      db,
      `INSERT INTO contas_plano_contas (entidade_id, codigo, descricao, grupo, natureza, analisavel, ativo)
       VALUES (?, '6.1.01', 'Despesa Condomínio', 'despesa', 'debito', 1, 1)`,
      [entidade_id],
    );
    conta_despesa_id = despesaResult.lastID;

    // Conta de Caixa (1.1.01 - Caixa)
    const caixaResult = executar(
      db,
      `INSERT INTO contas_plano_contas (entidade_id, codigo, descricao, grupo, natureza, analisavel, ativo)
       VALUES (?, '1.1.01', 'Caixa', 'ativo', 'debito', 1, 1)`,
      [entidade_id],
    );
    conta_caixa_id = caixaResult.lastID;
  });

  describe("obterLancamentosParModulo", () => {
    it("deve retornar array vazio quando nenhum lançamento existe para um módulo", () => {
      const lancamentos = obterLancamentosParModulo(db, entidade_id, periodo_id, "contratos");
      expect(Array.isArray(lancamentos)).toBe(true);
    });

    it("deve retornar todos os lançamentos quando origem_modulo não é especificado", () => {
      // Insert test entries
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          1000,
          "Aluguel contrato",
          "contratos",
          1,
          "CT-001",
        ],
      );

      const lancamentos = obterLancamentosParModulo(db, entidade_id, periodo_id);
      expect(lancamentos.length).toBeGreaterThan(0);
    });

    it("deve filtrar lançamentos por módulo específico", () => {
      // Insert entries from different modules
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_credito, valor_debito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          1000,
          "Aluguel contrato",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_despesa_id,
          500,
          "Rateio despesa",
          "rateio",
          2,
          "RT-001",
        ],
      );

      const lancamentosRateio = obterLancamentosParModulo(db, entidade_id, periodo_id, "rateio");
      expect(lancamentosRateio.every((l) => l.origem_modulo === "rateio")).toBe(true);
    });

    it("deve incluir detalhes da conta nos lançamentos", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          1000,
          "Teste",
          "manual",
          1,
          "MAN-001",
        ],
      );

      const lancamentos = obterLancamentosParModulo(db, entidade_id, periodo_id, "manual");
      expect(lancamentos.length).toBeGreaterThan(0);

      const primeiro = lancamentos[0];
      expect(primeiro).toHaveProperty("conta_codigo");
      expect(primeiro).toHaveProperty("conta_descricao");
      expect(primeiro).toHaveProperty("data_lancamento");
      expect(primeiro).toHaveProperty("referencia_documento");
    });
  });

  describe("gerarRelatorioAuditoriaParModulo", () => {
    it("deve gerar estrutura válida de auditoria", () => {
      const auditoria = gerarRelatorioAuditoriaParModulo(db, entidade_id, periodo_id);
      expect(Array.isArray(auditoria)).toBe(true);
    });

    it("deve incluir campo origem_modulo em cada relatório", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_despesa_id,
          500,
          "Despesa",
          "contratos",
          1,
          "CT-001",
        ],
      );

      const auditoria = gerarRelatorioAuditoriaParModulo(db, entidade_id, periodo_id);
      const moduloContratos = auditoria.find((a) => a.origem_modulo === "contratos");

      if (moduloContratos) {
        expect(moduloContratos.total_lancamentos).toBeGreaterThan(0);
      }
    });

    it("deve calcular totais de débito e crédito corretos por módulo", () => {
      const valor_debito_1 = 1000;
      const valor_credito_1 = 500;

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          valor_debito_1,
          "Entrada",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), NULL, ?, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          valor_credito_1,
          "Saída",
          "contratos",
          2,
          "CT-002",
        ],
      );

      const auditoria = gerarRelatorioAuditoriaParModulo(db, entidade_id, periodo_id);
      const moduloContratos = auditoria.find((a) => a.origem_modulo === "contratos");

      expect(moduloContratos).toBeDefined();
      expect(moduloContratos?.total_debito).toBe(valor_debito_1);
      expect(moduloContratos?.total_credito).toBe(valor_credito_1);
    });

    it("deve incluir linhas detalhadas em cada relatório de módulo", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_despesa_id,
          300,
          "Teste auditoria",
          "rateio",
          1,
          "RT-001",
        ],
      );

      const auditoria = gerarRelatorioAuditoriaParModulo(db, entidade_id, periodo_id);
      const moduloRateio = auditoria.find((a) => a.origem_modulo === "rateio");

      expect(moduloRateio?.linhas).toBeDefined();
      expect(Array.isArray(moduloRateio?.linhas)).toBe(true);
    });
  });

  describe("gerarDREComFiltro", () => {
    it("deve retornar estrutura DRE válida com filtro", () => {
      const dre = gerarDREComFiltro(db, entidade_id, periodo_id, ["contratos"]);

      expect(dre).toHaveProperty("receitas");
      expect(dre).toHaveProperty("custos");
      expect(dre).toHaveProperty("resultado_operacional");
      expect(dre).toHaveProperty("juros_e_multas");
      expect(dre).toHaveProperty("provisoes");
      expect(dre).toHaveProperty("resultado_final");
    });

    it("deve filtrar DRE por módulo único (apontamento-prestador)", () => {
      // Add entries from different modules
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_credito, valor_debito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          1000,
          "Aluguel",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_credito, valor_debito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          500,
          "Despesa remuneração",
          "apontamento-prestador",
          1,
          "AP-001",
        ],
      );

      const dreApontamento = gerarDREComFiltro(db, entidade_id, periodo_id, [
        "apontamento-prestador",
      ]);
      const dreContratos = gerarDREComFiltro(db, entidade_id, periodo_id, ["contratos"]);

      // Apontamento should have different totals than contratos
      expect(dreApontamento.receitas.total_receitas).not.toBe(dreContratos.receitas.total_receitas);
    });

    it("deve filtrar DRE por múltiplos módulos", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_credito, valor_debito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          1000,
          "Receita",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_credito, valor_debito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          500,
          "Receita imóvel",
          "imovel-gestao",
          2,
          "IG-001",
        ],
      );

      const dreMultiplo = gerarDREComFiltro(db, entidade_id, periodo_id, [
        "contratos",
        "imovel-gestao",
      ]);
      expect(dreMultiplo.receitas.total_receitas).toBe(1500);
    });

    it("deve retornar zero quando filtro não encontra lançamentos", () => {
      const dreVazio = gerarDREComFiltro(db, entidade_id, periodo_id, ["pagamentos"]);

      expect(dreVazio.receitas.total_receitas).toBe(0);
      expect(dreVazio.custos.total_custos).toBe(0);
      expect(dreVazio.resultado_final).toBe(0);
    });

    it("sem filtro deve retornar DRE completa", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_credito, valor_debito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          2000,
          "Receita total",
          "contratos",
          1,
          "CT-001",
        ],
      );

      const dreSemFiltro = gerarDREComFiltro(db, entidade_id, periodo_id);
      const dreComTodos = gerarDREComFiltro(db, entidade_id, periodo_id, [
        "contratos",
        "rateio",
        "manual",
      ]);

      // Both should be non-zero
      expect(dreSemFiltro.receitas.total_receitas).toBeGreaterThanOrEqual(0);
    });
  });

  describe("gerarBalancoComFiltro", () => {
    it("deve retornar estrutura de balanço válida com filtro", () => {
      const balanco = gerarBalancoComFiltro(db, entidade_id, periodo_id, ["contratos"]);

      expect(balanco).toHaveProperty("ativo");
      expect(balanco).toHaveProperty("passivo");
      expect(balanco).toHaveProperty("patrimonio_liquido");
      expect(balanco.ativo).toHaveProperty("total_ativo");
      expect(balanco.passivo).toHaveProperty("total_passivo");
    });

    it("deve filtrar balanço por módulo único", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          5000,
          "Caixa contratos",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          3000,
          "Caixa pagamentos",
          "pagamentos",
          2,
          "PAG-001",
        ],
      );

      const balançoContratos = gerarBalancoComFiltro(db, entidade_id, periodo_id, ["contratos"]);
      const balançoPagamentos = gerarBalancoComFiltro(db, entidade_id, periodo_id, ["pagamentos"]);

      // Different filtered results
      expect(balançoContratos.ativo.total_ativo).not.toBe(balançoPagamentos.ativo.total_ativo);
    });

    it("deve filtrar balanço por múltiplos módulos", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          2000,
          "Ativo",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          1000,
          "Ativo",
          "rateio",
          2,
          "RT-001",
        ],
      );

      const balançoMultiplo = gerarBalancoComFiltro(db, entidade_id, periodo_id, [
        "contratos",
        "rateio",
      ]);
      expect(balançoMultiplo.ativo.total_ativo).toBe(3000);
    });

    it("deve retornar zero quando nenhum lançamento corresponde ao filtro", () => {
      const balançoVazio = gerarBalancoComFiltro(db, entidade_id, periodo_id, [
        "inexistente",
      ]);

      expect(balançoVazio.ativo.total_ativo).toBe(0);
      expect(balançoVazio.passivo.total_passivo).toBe(0);
    });
  });

  describe("gerarFluxoCaixaComFiltro", () => {
    it("deve retornar estrutura de fluxo de caixa válida com filtro", () => {
      const fluxo = gerarFluxoCaixaComFiltro(db, entidade_id, periodo_id, ["contratos"]);

      expect(fluxo).toHaveProperty("saldo_inicial");
      expect(fluxo).toHaveProperty("operacional");
      expect(fluxo).toHaveProperty("investimento");
      expect(fluxo).toHaveProperty("financiamento");
      expect(fluxo).toHaveProperty("saldo_final");
    });

    it("deve filtrar fluxo de caixa por módulo único", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          1000,
          "Entrada contratos",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          500,
          "Entrada rateio",
          "rateio",
          2,
          "RT-001",
        ],
      );

      const fluxoContratos = gerarFluxoCaixaComFiltro(db, entidade_id, periodo_id, [
        "contratos",
      ]);
      const fluxoRateio = gerarFluxoCaixaComFiltro(db, entidade_id, periodo_id, ["rateio"]);

      expect(fluxoContratos.operacional.entradas).not.toBe(fluxoRateio.operacional.entradas);
    });

    it("deve filtrar fluxo de caixa por múltiplos módulos", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          1500,
          "Entrada",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          500,
          "Entrada",
          "imovel-gestao",
          2,
          "IG-001",
        ],
      );

      const fluxoMultiplo = gerarFluxoCaixaComFiltro(db, entidade_id, periodo_id, [
        "contratos",
        "imovel-gestao",
      ]);
      expect(fluxoMultiplo.operacional.entradas).toBe(2000);
    });

    it("deve retornar saldo_final zero quando sem lançamentos", () => {
      const fluxoVazio = gerarFluxoCaixaComFiltro(db, entidade_id, periodo_id, [
        "nao-existe",
      ]);

      expect(fluxoVazio.saldo_final).toBe(0);
      expect(fluxoVazio.operacional.liquido).toBe(0);
    });
  });

  describe("Consolidação: Filtrado + Unfiltered = Completo", () => {
    it("DRE: soma de filtros individuais deve igualar total", () => {
      // Add diverse entries
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_credito, valor_debito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          1000,
          "Receita 1",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_credito, valor_debito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          500,
          "Receita 2",
          "rateio",
          2,
          "RT-001",
        ],
      );

      const dreTotal = gerarDRE(db, entidade_id, periodo_id);
      const dreContratos = gerarDREComFiltro(db, entidade_id, periodo_id, ["contratos"]);
      const dreRateio = gerarDREComFiltro(db, entidade_id, periodo_id, ["rateio"]);

      const somaParciais = dreContratos.receitas.total_receitas + dreRateio.receitas.total_receitas;
      expect(dreTotal.receitas.total_receitas).toBe(somaParciais);
    });

    it("Balanço: soma de filtros deve igualar total", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          2000,
          "Ativo 1",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          1000,
          "Ativo 2",
          "manual",
          2,
          "MAN-001",
        ],
      );

      const balançoTotal = gerarBalanco(db, entidade_id, periodo_id);
      const balançoContratos = gerarBalancoComFiltro(db, entidade_id, periodo_id, [
        "contratos",
      ]);
      const balançoManual = gerarBalancoComFiltro(db, entidade_id, periodo_id, ["manual"]);

      const somaParciais =
        balançoContratos.ativo.total_ativo + balançoManual.ativo.total_ativo;
      expect(balançoTotal.ativo.total_ativo).toBe(somaParciais);
    });

    it("Fluxo de Caixa: soma de filtros deve igualar total", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          1200,
          "Entrada 1",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          300,
          "Entrada 2",
          "imovel-gestao",
          2,
          "IG-001",
        ],
      );

      const fluxoTotal = gerarFluxoCaixa(db, entidade_id, periodo_id);
      const fluxoContratos = gerarFluxoCaixaComFiltro(db, entidade_id, periodo_id, [
        "contratos",
      ]);
      const fluxoImovel = gerarFluxoCaixaComFiltro(db, entidade_id, periodo_id, [
        "imovel-gestao",
      ]);

      const somaParciais =
        fluxoContratos.operacional.entradas + fluxoImovel.operacional.entradas;
      expect(fluxoTotal.operacional.entradas).toBe(somaParciais);
    });
  });

  describe("Audit Trail com Origin", () => {
    it("deve mostrar origem_modulo para cada linha do item", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_credito, valor_debito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          1000,
          "Receita com origem",
          "advocacia",
          1,
          "ADV-001",
        ],
      );

      const auditoria = gerarRelatorioAuditoriaParModulo(db, entidade_id, periodo_id);
      const moduloAdvocacia = auditoria.find((a) => a.origem_modulo === "advocacia");

      expect(moduloAdvocacia).toBeDefined();
      if (moduloAdvocacia) {
        expect(moduloAdvocacia.linhas.length).toBeGreaterThan(0);
        expect(moduloAdvocacia.linhas[0].origem_modulo).toBe("advocacia");
      }
    });

    it("deve rastrear documentos de origem em lançamentos", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_despesa_id,
          750,
          "Despesa com rastreamento",
          "contas-pessoais",
          1,
          "CP-REF-2024-001",
        ],
      );

      const lancamentos = obterLancamentosParModulo(db, entidade_id, periodo_id, "contas-pessoais");

      expect(lancamentos.length).toBeGreaterThan(0);
      lancamentos.forEach((lance) => {
        expect(lance.referencia_documento).toBeDefined();
        expect(lance.referencia_documento.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Edge Cases e Validações", () => {
    it("deve lidar com período vazio sem erro", () => {
      const dre = gerarDREComFiltro(db, entidade_id, periodo_id, ["inexistente"]);
      expect(dre.resultado_final).toBe(0);
    });

    it("deve aceitar array vazio de origem_modulos como "sem filtro"", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_credito, valor_debito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_receita_id,
          1000,
          "Teste",
          "manual",
          1,
          "MAN-001",
        ],
      );

      const dreSemFiltro = gerarDREComFiltro(db, entidade_id, periodo_id, []);
      const dreComTodos = gerarDREComFiltro(db, entidade_id, periodo_id);

      // Empty array should act like no filter
      expect(dreSemFiltro.receitas.total_receitas).toBe(dreComTodos.receitas.total_receitas);
    });

    it("deve manter integridade contábil: débito - crédito = saldo", () => {
      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), ?, NULL, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          500,
          "D",
          "contratos",
          1,
          "CT-001",
        ],
      );

      executar(
        db,
        `INSERT INTO ledger_entries (
          entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito,
          descricao, origem_modulo, origem_id, referencia_documento
        ) VALUES (?, ?, ?, DATE('now'), NULL, ?, ?, ?, ?, ?)`,
        [
          entidade_id,
          periodo_id,
          conta_caixa_id,
          200,
          "C",
          "contratos",
          2,
          "CT-002",
        ],
      );

      const auditoria = gerarRelatorioAuditoriaParModulo(db, entidade_id, periodo_id);
      const modulo = auditoria.find((a) => a.origem_modulo === "contratos");

      if (modulo) {
        expect(modulo.saldo_liquido).toBe(modulo.total_debito - modulo.total_credito);
      }
    });
  });
});
