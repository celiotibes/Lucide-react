import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarContaAPagar, cancelarContaAPagar } from "../../contasAPagar/contasAPagar";
import {
  calcularNOI,
  calcularTaxaOcupacao,
  calcularROIAnual,
  calcularCashflowMensal,
  calcularInadimplencia,
  obterMetricaImovel,
  obterPortfolioCompleto,
} from "../dashboard-portfolio";

/** Cenário determinístico, contra o schema REAL (contabilidade-reconstituicao/schema.sql),
 * via criarBancoDeTeste() — não contra a cópia fictícia de test-setup.ts (que tinha uma
 * tabela `despesas_operacionais_agendadas` que não existe em produção e não provava nada
 * sobre o módulo rodando de verdade).
 *
 * Imóvel 1 (investimento): valor_aquisicao 300.000, aluguel 2.000/mês (contrato vigente o
 * ano inteiro), despesas de janeiro/2026 em contas_a_pagar: condomínio 1.500 + água 150 =
 * 1.650 (mais uma conta CANCELADA de 1.000, que não deve entrar na soma).
 * Imóvel 2 (investimento): valor_aquisicao 350.000, aluguel 2.500/mês (contrato sem
 * data_fim), despesa de janeiro/2026: manutenção 300. Tem também uma conta de FEVEREIRO
 * (200), que não deve contar no cálculo de janeiro.
 * Imóvel 3: uso_pessoal = 1 — não é imóvel de investimento, não entra no portfólio.
 * Imóvel 4 (investimento, sem contrato e sem despesas): valida os casos de zero.
 */
describe("Dashboard Portfolio - KPIs (schema real)", () => {
  let db: Database;
  let entidade_id: number;
  const ANO = 2026;
  const MES = 1; // janeiro

  const IMOVEL_1 = 1;
  const IMOVEL_2 = 2;
  const IMOVEL_3_USO_PESSOAL = 3;
  const IMOVEL_4_SEM_CONTRATO = 4;

  beforeEach(async () => {
    db = await criarBancoDeTeste();
    const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "52998224725" });
    if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
    entidade_id = r.entidade_id;

    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, endereco, financiado, uso_pessoal, valor_aquisicao)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
      [IMOVEL_1, "Apto 101", "apartamento", "Rua Principal 123, Apto 101", 300000],
    );
    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, endereco, financiado, uso_pessoal, valor_aquisicao)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
      [IMOVEL_2, "Apto 102", "apartamento", "Rua Principal 123, Apto 102", 350000],
    );
    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, endereco, financiado, uso_pessoal, valor_aquisicao)
       VALUES (?, ?, ?, ?, 0, 1, ?)`,
      [IMOVEL_3_USO_PESSOAL, "Residência", "apartamento", "Rua da Família 1", 900000],
    );
    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, endereco, financiado, uso_pessoal, valor_aquisicao)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
      [IMOVEL_4_SEM_CONTRATO, "Sala vazia", "sala_comercial", "Rua Nova 1", 100000],
    );

    // Contrato do imóvel 1: cobre o ano inteiro de 2026 (data_inicio anterior, data_fim
    // depois do fim do ano) — é exatamente o caso que o cálculo de ocupação anterior
    // (comparava só o número do mês, ignorando o ano) tratava como 0% de ocupação.
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
       VALUES (?, ?, ?, 'residencial_fixo', ?, ?, ?)`,
      [1, IMOVEL_1, "João da Silva", 2000, "2025-01-01", "2026-12-31"],
    );
    // Contrato do imóvel 2: sem data_fim (vigente indefinidamente).
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
       VALUES (?, ?, ?, 'residencial_fixo', ?, ?, NULL)`,
      [2, IMOVEL_2, "Maria Souza", 2500, "2025-06-01"],
    );

    // Despesas operacionais de janeiro/2026 do imóvel 1, em contas_a_pagar (ver decisão no
    // cabeçalho de dashboard-portfolio.ts).
    registrarContaAPagar(db, {
      entidade_id,
      fornecedor_nome: "Condomínio Edifício Aurora",
      descricao: "Condomínio - janeiro",
      valor: 1500,
      data_vencimento: "2026-01-10",
      imovel_id: IMOVEL_1,
    });
    registrarContaAPagar(db, {
      entidade_id,
      fornecedor_nome: "Companhia de Água",
      descricao: "Água e esgoto - janeiro",
      valor: 150,
      data_vencimento: "2026-01-20",
      imovel_id: IMOVEL_1,
    });
    // Conta CANCELADA: não deve entrar na soma das despesas do mês.
    const canceladaResult = registrarContaAPagar(db, {
      entidade_id,
      fornecedor_nome: "Fornecedor Errado",
      descricao: "Lançada por engano",
      valor: 1000,
      data_vencimento: "2026-01-15",
      imovel_id: IMOVEL_1,
    });
    if (canceladaResult.id) cancelarContaAPagar(db, canceladaResult.id, "Lançada por engano");

    // Despesa de janeiro/2026 do imóvel 2.
    registrarContaAPagar(db, {
      entidade_id,
      fornecedor_nome: "Eletricista João",
      descricao: "Manutenção - janeiro",
      valor: 300,
      data_vencimento: "2026-01-05",
      imovel_id: IMOVEL_2,
    });
    // Despesa de FEVEREIRO/2026 do imóvel 2: não deve contar no cálculo de janeiro.
    registrarContaAPagar(db, {
      entidade_id,
      fornecedor_nome: "Eletricista João",
      descricao: "Manutenção - fevereiro",
      valor: 200,
      data_vencimento: "2026-02-05",
      imovel_id: IMOVEL_2,
    });
  });

  describe("Calcular NOI (Net Operating Income)", () => {
    it("deve calcular NOI do imóvel 1: aluguel 2000 - (condomínio 1500 + água 150) = 350", () => {
      const noi = calcularNOI(db, IMOVEL_1, entidade_id, ANO, MES);
      expect(noi).toBe(350);
    });

    it("não deve incluir contas a pagar CANCELADAS na despesa do mês", () => {
      // Se a conta cancelada de 1000 entrasse, o NOI seria 350 - 1000 = -650.
      const noi = calcularNOI(db, IMOVEL_1, entidade_id, ANO, MES);
      expect(noi).toBeGreaterThan(0);
    });

    it("deve calcular NOI do imóvel 2: aluguel 2500 - manutenção 300 = 2200", () => {
      const noi = calcularNOI(db, IMOVEL_2, entidade_id, ANO, MES);
      expect(noi).toBe(2200);
    });

    it("não deve incluir despesa de mês diferente (fevereiro) no cálculo de janeiro", () => {
      // Se a conta de fevereiro (200) entrasse, o NOI de janeiro cairia para 2000.
      const noi = calcularNOI(db, IMOVEL_2, entidade_id, ANO, MES);
      expect(noi).toBe(2200);
    });

    it("deve retornar NOI 0 para imóvel sem contrato e sem despesas registradas", () => {
      const noi = calcularNOI(db, IMOVEL_4_SEM_CONTRATO, entidade_id, ANO, MES);
      expect(noi).toBe(0);
    });

    it("deve retornar 0 para imóvel inexistente", () => {
      const noi = calcularNOI(db, 9999, entidade_id, ANO, MES);
      expect(noi).toBe(0);
    });
  });

  describe("Calcular Taxa de Ocupação", () => {
    it("deve calcular 100% para contrato iniciado em ano anterior e ainda vigente", () => {
      // ACHADO corrigido: a versão anterior comparava só o mês do contrato (ignorando o
      // ano) e devolvia 0% neste caso exato (contrato de 2025 vigente em janeiro/2026).
      const taxa = calcularTaxaOcupacao(db, IMOVEL_1, MES, ANO);
      expect(taxa).toBe(100);
    });

    it("deve calcular 100% para contrato sem data_fim", () => {
      const taxa = calcularTaxaOcupacao(db, IMOVEL_2, MES, ANO);
      expect(taxa).toBe(100);
    });

    it("deve calcular ocupação parcial quando o contrato começa no meio do mês", () => {
      executar(
        db,
        `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
         VALUES (?, ?, ?, 'residencial_fixo', ?, ?, NULL)`,
        [3, IMOVEL_4_SEM_CONTRATO, "Novo Inquilino", 1800, "2026-01-16"],
      );
      // Janeiro tem 31 dias; ocupado de 16 a 31 = 16 dias.
      const taxa = calcularTaxaOcupacao(db, IMOVEL_4_SEM_CONTRATO, MES, ANO);
      expect(taxa).toBeCloseTo((16 / 31) * 100, 5);
    });

    it("deve capar em 100% mesmo com contratos sobrepostos no mesmo imóvel", () => {
      executar(
        db,
        `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
         VALUES (?, ?, ?, 'residencial_fixo', ?, ?, NULL)`,
        [4, IMOVEL_1, "Segundo contrato sobreposto", 500, "2025-01-01"],
      );
      const taxa = calcularTaxaOcupacao(db, IMOVEL_1, MES, ANO);
      expect(taxa).toBe(100);
    });

    it("deve retornar 0% para imóvel sem contratos", () => {
      const taxa = calcularTaxaOcupacao(db, IMOVEL_4_SEM_CONTRATO, MES, ANO);
      expect(taxa).toBe(0);
    });
  });

  describe("Calcular ROI Anual", () => {
    it("deve calcular o ROI anual do imóvel 1 a partir do NOI real de cada mês", () => {
      // NOI de janeiro = 350 (aluguel 2000 - despesas 1650); demais 11 meses sem despesa
      // registrada = 2000 cada. NOI anual = 350 + 2000*11 = 22350.
      // ROI = 22350 / 300000 * 100 = 7.45%.
      const roi = calcularROIAnual(db, IMOVEL_1, entidade_id, ANO);
      expect(roi).toBeCloseTo(7.45, 5);
    });

    it("deve calcular o ROI anual do imóvel 2 a partir do NOI real de cada mês", () => {
      // NOI de janeiro = 2200 (aluguel 2500 - despesa 300); fevereiro tem despesa de 200
      // (aluguel 2500 - 200 = 2300); demais 10 meses = 2500 cada.
      // NOI anual = 2200 + 2300 + 2500*10 = 29500.
      // ROI = 29500 / 350000 * 100 = 8.428571...%.
      const roi = calcularROIAnual(db, IMOVEL_2, entidade_id, ANO);
      expect(roi).toBeCloseTo((29500 / 350000) * 100, 5);
    });

    it("deve retornar 0 para imóvel sem valor de aquisição", () => {
      executar(
        db,
        `INSERT INTO imoveis (id, apelido, tipo, financiado, uso_pessoal, valor_aquisicao) VALUES (?, ?, ?, 0, 0, 0)`,
        [50, "Imóvel sem valor", "apartamento"],
      );
      const roi = calcularROIAnual(db, 50, entidade_id, ANO);
      expect(roi).toBe(0);
    });

    it("deve retornar 0 para imóvel inexistente", () => {
      const roi = calcularROIAnual(db, 9999, entidade_id, ANO);
      expect(roi).toBe(0);
    });
  });

  describe("Calcular Cashflow Mensal", () => {
    it("deve calcular cashflow do imóvel 1 como recebimentos menos desembolsos (2000 - 1650 = 350)", () => {
      const cashflow = calcularCashflowMensal(db, IMOVEL_1, entidade_id, ANO, MES);
      expect(cashflow).toBe(350);
    });

    it("deve calcular cashflow do imóvel 2 como recebimentos menos desembolsos (2500 - 300 = 2200)", () => {
      const cashflow = calcularCashflowMensal(db, IMOVEL_2, entidade_id, ANO, MES);
      expect(cashflow).toBe(2200);
    });

    it("deve retornar 0 para imóvel sem contrato e sem despesas", () => {
      const cashflow = calcularCashflowMensal(db, IMOVEL_4_SEM_CONTRATO, entidade_id, ANO, MES);
      expect(cashflow).toBe(0);
    });
  });

  describe("Calcular Inadimplência (ponto de extensão)", () => {
    it("deve retornar zerado (apuração real é responsabilidade de reconcile/inadimplencia.ts)", () => {
      const inadimplencia = calcularInadimplencia(db, IMOVEL_1);
      expect(inadimplencia).toEqual({ valor_atraso: 0, percentual: 0, dias_medio: 0 });
    });

    it("deve retornar 0 para imóvel sem contratos", () => {
      const inadimplencia = calcularInadimplencia(db, IMOVEL_4_SEM_CONTRATO);
      expect(inadimplencia).toEqual({ valor_atraso: 0, percentual: 0, dias_medio: 0 });
    });
  });

  describe("Obter Métrica Completa de Imóvel", () => {
    it("deve retornar null para imóvel inexistente", () => {
      const metrica = obterMetricaImovel(db, 9999, entidade_id, ANO, MES);
      expect(metrica).toBeNull();
    });

    it("deve retornar a métrica completa e correta do imóvel 1", () => {
      const metrica = obterMetricaImovel(db, IMOVEL_1, entidade_id, ANO, MES);
      expect(metrica).not.toBeNull();
      expect(metrica).toMatchObject({
        imovel_id: IMOVEL_1,
        endereco: "Rua Principal 123, Apto 101",
        valor_aquisicao: 300000,
        noi_mensal: 350,
        noi_anual: 22350,
        taxa_ocupacao: 100,
        roi_anual: 7.45,
        cashflow_mensal: 350,
        inadimplencia_valor: 0,
        inadimplencia_percentual: 0,
      });
    });
  });

  describe("Obter Portfolio Completo — projeção de fluxo de caixa por portfólio", () => {
    it("deve agregar os 3 imóveis de investimento (exclui o de uso pessoal)", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, ANO, MES);
      expect(portfolio.total_imoveis).toBe(3);
      expect(portfolio.imoveis.map((i) => i.imovel_id).sort()).toEqual([
        IMOVEL_1,
        IMOVEL_2,
        IMOVEL_4_SEM_CONTRATO,
      ]);
    });

    it("deve somar valor_total, NOI e cashflow do portfólio batendo com os números esperados", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, ANO, MES);
      // valor_total = 300000 + 350000 + 100000 = 750000
      expect(portfolio.valor_total).toBe(750000);
      // noi_mensal_total = 350 (imóvel 1) + 2200 (imóvel 2) + 0 (imóvel 4) = 2550
      expect(portfolio.noi_mensal_total).toBe(2550);
      // cashflow_mensal_total = mesma soma, pela simplificação documentada no módulo
      expect(portfolio.cashflow_mensal_total).toBe(2550);
    });

    it("deve calcular a taxa de ocupação média do portfólio", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, ANO, MES);
      // (100 + 100 + 0) / 3 = 66.666...
      expect(portfolio.taxa_ocupacao_media).toBeCloseTo(200 / 3, 1);
    });

    it("deve manter consistência entre métricas individuais e o agregado do portfólio", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, ANO, MES);
      for (const imovelPortfolio of portfolio.imoveis) {
        const individual = obterMetricaImovel(db, imovelPortfolio.imovel_id, entidade_id, ANO, MES);
        expect(individual).not.toBeNull();
        expect(imovelPortfolio).toEqual(individual);
      }
    });

    it("não deve incluir o imóvel de uso pessoal no portfólio nem em seus totais", () => {
      const portfolio = obterPortfolioCompleto(db, entidade_id, ANO, MES);
      expect(portfolio.imoveis.some((i) => i.imovel_id === IMOVEL_3_USO_PESSOAL)).toBe(false);
      // Se o imóvel de uso pessoal (900000) entrasse, valor_total passaria de 1.650.000.
      expect(portfolio.valor_total).toBeLessThan(1000000);
    });

    it("portfólio sem nenhum imóvel de investimento não deve quebrar (banco vazio)", async () => {
      const dbVazio = await criarBancoDeTeste();
      const rVazio = criarEntidadeLegal(dbVazio, { nome: "Outro Titular", cpf_cnpj: "11144477735" });
      if (!rVazio.entidade_id) throw new Error(`Falha ao criar entidade: ${rVazio.mensagem}`);

      const portfolio = obterPortfolioCompleto(dbVazio, rVazio.entidade_id, ANO, MES);
      expect(portfolio.total_imoveis).toBe(0);
      expect(portfolio.valor_total).toBe(0);
      expect(portfolio.noi_mensal_total).toBe(0);
      expect(portfolio.noi_anual_total).toBe(0);
      expect(portfolio.roi_medio_anual).toBe(0);
      expect(portfolio.taxa_ocupacao_media).toBe(0);
      expect(portfolio.cashflow_mensal_total).toBe(0);
      expect(portfolio.inadimplencia_valor_total).toBe(0);
      expect(portfolio.inadimplencia_percentual_media).toBe(0);
      expect(portfolio.imoveis).toEqual([]);
    });
  });
});
