import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

    // "Hoje" fixado (mesmo padrão de exercicioRestauracao.test.ts): calcularKPIRentabilidade
    // agora chama resumoInadimplenciaTotal() → apurarInadimplenciaContrato(), que usa
    // `new Date()` como data de referência por padrão. Fixar o relógio para TODOS os
    // testes deste arquivo (não só os de inadimplência) torna "contratos 1/2 estão pagos
    // em dia" e "contrato 999 está vencido" determinísticos, independente do dia real em
    // que a suíte rodar. Só afeta `new Date()` (JS) — `DATE('now')` dentro de SQL (usada
    // por calcularOcupacao e pelo denominador de taxa_inadimplencia) continua no relógio
    // real, inalterada: os contratos do fixture têm data_fim '2026-12-31', então nada
    // aqui depende de essas duas datas coincidirem.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    // calcularKPIRentabilidade agora chama resumoInadimplenciaTotal() (ver
    // integracao-inadimplencia.ts), que por sua vez chama apurarInadimplenciaContrato()
    // — essa função seleciona de contratos_locacao as colunas locatario, dia_vencimento,
    // multa_percentual, multa_ate_dias, multa_percentual_substitutiva e
    // juros_mensal_percentual, e consulta a tabela `transacoes` quando há atraso
    // aparente. O schema real (contabilidade-reconstituicao/schema.sql) tem todas essas
    // colunas/tabela; o fixture simplificado deste arquivo (test-setup.ts) não tem —
    // sem isso, TODO teste abaixo que chama calcularKPIRentabilidade/calcularTendencia
    // quebraria com "no such column: locatario", porque os contratos 1 e 2 já semeados
    // por prepararBancoTeste() são alcançados pela query de contratos vigentes dentro de
    // relatorioInadimplenciaDetalhado. Acrescentamos as colunas aqui (em vez de em
    // test-setup.ts, fora do escopo deste achado).
    //
    // Colunas NULL não bastam, porém: com dia_vencimento NULL, apurarInadimplenciaContrato
    // monta a string de vencimento como "AAAA-MM-null", uma data inválida — e
    // `new Date(...).toISOString()` sobre data inválida LANÇA RangeError (não devolve
    // NaN), derrubando todo teste que passe por aqui. Por isso damos aos contratos 1 e 2
    // um dia_vencimento válido e, para não os contar como inadimplentes (o que mudaria o
    // numerador esperado nos testes abaixo e no "ROI e taxa_inadimplencia devem estar
    // entre -100 e 100 percent"), um recebimento em `transacoes` que cobre o aluguel do
    // mês corrente (fixado acima): exatamente o que a tela de conciliação registraria
    // para um locatário em dia.
    db.run(`
      ALTER TABLE contratos_locacao ADD COLUMN locatario TEXT;
      ALTER TABLE contratos_locacao ADD COLUMN dia_vencimento INTEGER;
      ALTER TABLE contratos_locacao ADD COLUMN multa_percentual REAL;
      ALTER TABLE contratos_locacao ADD COLUMN multa_ate_dias INTEGER;
      ALTER TABLE contratos_locacao ADD COLUMN multa_percentual_substitutiva REAL;
      ALTER TABLE contratos_locacao ADD COLUMN juros_mensal_percentual REAL;
      CREATE TABLE IF NOT EXISTS transacoes (
        id INTEGER PRIMARY KEY,
        contrato_id INTEGER,
        valor REAL,
        data TEXT
      );
      UPDATE contratos_locacao
        SET locatario = 'Locatário Teste', dia_vencimento = 1,
            multa_percentual = 2.0, multa_ate_dias = 5,
            multa_percentual_substitutiva = 10.0, juros_mensal_percentual = 1.0
        WHERE id IN (1, 2);
      INSERT INTO transacoes (contrato_id, valor, data)
        SELECT id, valor_referencia, '2026-10-05' FROM contratos_locacao WHERE id IN (1, 2);
    `);
  });

  afterEach(() => {
    vi.useRealTimers();
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

    describe("taxa_inadimplencia (ligada a resumoInadimplenciaTotal)", () => {
      it("fica em 0 quando nenhum contrato tem competência vencida e não paga", () => {
        // Os contratos 1 e 2 do fixture (test-setup.ts) estão com o aluguel do mês
        // corrente pago (recebimento inserido no beforeEach) — nenhum contrato
        // inadimplente, taxa_inadimplencia deve permanecer 0, exatamente como antes do
        // achado ser corrigido.
        const kpis = calcularKPIRentabilidade(db, entidade_id, periodo_id);
        expect(kpis.taxa_inadimplencia).toBe(0);
      });

      it("reflete o aluguel vencido e não pago de um contrato inadimplente (ACHADO corrigido)", () => {
        // Contrato novo, vencimento no dia 1 — com "hoje" fixado em 15/10/2026 (beforeEach), o
        // vencimento de outubro (2026-10-01) já passou há 14 dias, e não há nenhuma
        // linha em `transacoes` para este contrato: aluguel vencido e não pago.
        // data_fim NULL (vigente) para entrar tanto no numerador quanto no
        // denominador de taxa_inadimplencia (ambos filtram contratos vigentes).
        db.run(
          `INSERT INTO contratos_locacao
            (id, entidade_id, imovel_id, valor_aluguel, valor_referencia, data_inicio, data_fim, status,
             locatario, dia_vencimento, multa_percentual, multa_ate_dias, multa_percentual_substitutiva, juros_mensal_percentual)
           VALUES (999, ?, 1, 1000, 1000, '2025-01-01', NULL, 'ativo',
                   'Inadimplente Teste', 1, 2.0, 5, 10.0, 1.0)`,
          [entidade_id],
        );

        const kpis = calcularKPIRentabilidade(db, entidade_id, periodo_id);

        // Numerador (valor_aluguel_em_atraso, via resumoInadimplenciaTotal): só o
        // contrato 999 tem dias_atraso > 0 (os contratos 1 e 2 do fixture estão pagos
        // em dia — recebimento inserido no beforeEach) — valor vencido e não pago =
        // R$ 1.000 (o valor_referencia do contrato, SEM multa/juros, que não entram em
        // valor_aluguel_em_atraso).
        // Denominador (contratosTodos, em analytics-integradas.ts): soma
        // valor_referencia de todo contrato vigente = contrato 1 (R$ 2.000) +
        // contrato 2 (R$ 2.500) + contrato 999 (R$ 1.000) = R$ 5.500.
        // taxa_inadimplencia = 1000 / 5500 * 100 = 18,1818...% — maior que zero e
        // batendo a conta à mão.
        const taxaEsperada = (1000 / 5500) * 100;
        expect(kpis.taxa_inadimplencia).toBeGreaterThan(0);
        expect(kpis.taxa_inadimplencia).toBeCloseTo(taxaEsperada, 10);
        expect(kpis.taxa_inadimplencia).toBeCloseTo(18.1818, 3);
      });
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
