import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { registrarRateioDestino } from "./rateioDividas";
import {
  calcularCustoDeCarregarDivida,
  priorizarQuitacaoDividas,
  simularImpactoAmortizacaoParcial,
} from "./priorizacaoQuitacao";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function ultimoId(tabela: string): number {
  return consultar<{ id: number }>(db, `SELECT id FROM ${tabela} ORDER BY id DESC LIMIT 1`)[0].id;
}

function criarImovel(apelido = "Kitnet 1"): number {
  executar(db, "INSERT INTO imoveis (apelido, tipo, financiado) VALUES (?, 'kitnet', 1)", [apelido]);
  return ultimoId("imoveis");
}

function criarFinanciamentoSac(
  overrides: Partial<{
    instituicao: string;
    valor_contratado: number;
    taxa_juros_mensal: number;
    data_contrato: string;
    parcelas_total: number;
  }> = {},
): number {
  const imovelId = criarImovel();
  const p = {
    instituicao: "Caixa",
    valor_contratado: 12000,
    taxa_juros_mensal: 1,
    data_contrato: "2024-01-01",
    parcelas_total: 12,
    ...overrides,
  };
  executar(
    db,
    "INSERT INTO financiamentos (imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total) VALUES (?, ?, 'SAC', ?, ?, ?, ?)",
    [imovelId, p.instituicao, p.valor_contratado, p.taxa_juros_mensal, p.data_contrato, p.parcelas_total],
  );
  return ultimoId("financiamentos");
}

function criarFinanciamentoOutro(saldoManual: number | null = 50000): number {
  const imovelId = criarImovel("Kitnet Consórcio");
  executar(
    db,
    "INSERT INTO financiamentos (imovel_id, instituicao, sistema, valor_contratado, data_contrato, parcelas_total, saldo_devedor_manual) VALUES (?, 'Administradora X', 'OUTRO', 200000, '2023-01-01', 180, ?)",
    [imovelId, saldoManual],
  );
  return ultimoId("financiamentos");
}

function criarDividaConsumo(
  overrides: Partial<{ instituicao: string; tipo: string; saldo: number; parcela: number; taxaEstimada: number | null }> = {},
): number {
  const p = {
    instituicao: "Banco X",
    tipo: "consignado",
    saldo: 10000,
    parcela: 500,
    taxaEstimada: null as number | null,
    ...overrides,
  };
  executar(
    db,
    "INSERT INTO dividas_consumo (tipo, instituicao, saldo_devedor_atual, parcela_mensal, data_referencia_saldo, taxa_juros_mensal_estimada) VALUES (?, ?, ?, ?, '2026-01-01', ?)",
    [p.tipo, p.instituicao, p.saldo, p.parcela, p.taxaEstimada],
  );
  return ultimoId("dividas_consumo");
}

// Taxa mensal → anual efetiva, mesma fórmula usada pelo módulo — recalculada aqui de forma
// independente para conferir números exatos sem reimplementar a lógica de arredondamento do
// próprio módulo sob teste.
function taxaAnualEsperada(taxaMensalPercentual: number): number {
  return Math.round((Math.pow(1 + taxaMensalPercentual / 100, 12) - 1) * 100 * 100) / 100;
}

describe("priorizacaoQuitacao", () => {
  describe("calcularCustoDeCarregarDivida", () => {
    it("financiamento SAC: taxa anual efetiva e custo anual estimado a partir do saldo devedor numa data de referência", () => {
      // valor_contratado=12000, taxa=1% a.m., 12 parcelas, amortização constante = 1000/mês.
      // Em 2024-07-01 (parcela 6 vencida), saldo devedor = 6000 (ver tabela SAC no módulo de teste abaixo).
      const financiamentoId = criarFinanciamentoSac();
      const resultado = calcularCustoDeCarregarDivida(db, "financiamento", financiamentoId, "2024-07-01");

      expect(resultado.saldoDevedorAtual).toBe(6000);
      expect(resultado.taxaDesconhecida).toBe(false);
      expect(resultado.taxaJurosMensalPercentual).toBe(1);

      const taxaEsperada = taxaAnualEsperada(1);
      expect(resultado.taxaJurosAnualEfetivaPercentual).toBeCloseTo(taxaEsperada, 2);

      const custoEsperado = Math.round(6000 * (taxaEsperada / 100) * 100) / 100;
      expect(resultado.custoAnualEstimadoJuros).toBeCloseTo(custoEsperado, 2);
    });

    it("financiamento 'OUTRO': taxa sempre desconhecida, mesmo com saldo_devedor_manual informado", () => {
      const financiamentoId = criarFinanciamentoOutro(50000);
      const resultado = calcularCustoDeCarregarDivida(db, "financiamento", financiamentoId, "2026-01-01");

      expect(resultado.saldoDevedorAtual).toBe(50000);
      expect(resultado.taxaDesconhecida).toBe(true);
      expect(resultado.taxaJurosMensalPercentual).toBeNull();
      expect(resultado.taxaJurosAnualEfetivaPercentual).toBeNull();
      expect(resultado.custoAnualEstimadoJuros).toBeNull();
      expect(resultado.motivoTaxaDesconhecida).toContain("OUTRO");
    });

    it("dívida de consumo sem taxa_juros_mensal_estimada: taxaDesconhecida true, custo anual null", () => {
      const dividaId = criarDividaConsumo({ taxaEstimada: null });
      const resultado = calcularCustoDeCarregarDivida(db, "divida_consumo", dividaId, "2026-01-01");

      expect(resultado.taxaDesconhecida).toBe(true);
      expect(resultado.taxaJurosAnualEfetivaPercentual).toBeNull();
      expect(resultado.custoAnualEstimadoJuros).toBeNull();
      expect(resultado.motivoTaxaDesconhecida).toBeTruthy();
    });

    it("dívida de consumo com taxa estimada: calcula taxa anual e custo anual normalmente", () => {
      const dividaId = criarDividaConsumo({ saldo: 10000, taxaEstimada: 2 });
      const resultado = calcularCustoDeCarregarDivida(db, "divida_consumo", dividaId, "2026-01-01");

      expect(resultado.taxaDesconhecida).toBe(false);
      const taxaEsperada = taxaAnualEsperada(2);
      expect(resultado.taxaJurosAnualEfetivaPercentual).toBeCloseTo(taxaEsperada, 2);
      const custoEsperado = Math.round(10000 * (taxaEsperada / 100) * 100) / 100;
      expect(resultado.custoAnualEstimadoJuros).toBeCloseTo(custoEsperado, 2);
    });
  });

  describe("priorizarQuitacaoDividas", () => {
    it("ordena por taxa anual efetiva (maior primeiro, método avalanche) e coloca taxa desconhecida sempre por último", () => {
      // 4 dívidas ativas com taxas bem diferentes:
      //   consumoAltaTaxa: 5% a.m.  → maior taxa anual do portfólio, deve ficar em 1º.
      //   financiamentoSac: 1% a.m. → segunda maior.
      //   consumoBaixaTaxa: 0.5% a.m. → terceira.
      //   consumoSemTaxa: taxa desconhecida → sempre por último, independente do saldo.
      const dataReferencia = "2026-01-01";
      // 240 parcelas (20 anos) a partir de 2020-01-01: em 2026-01-01 já se passaram 72
      // parcelas, saldo devedor = 12000 - 72×(12000/240) = 8400 > 0 (financiamento longo o
      // bastante para não estar quitado na data de referência do teste).
      const financiamentoId = criarFinanciamentoSac({ data_contrato: "2020-01-01", parcelas_total: 240 });
      const consumoAltaTaxaId = criarDividaConsumo({ instituicao: "Consumo Alta Taxa", saldo: 5000, taxaEstimada: 5 });
      const consumoBaixaTaxaId = criarDividaConsumo({ instituicao: "Consumo Baixa Taxa", saldo: 8000, taxaEstimada: 0.5 });
      const consumoSemTaxaId = criarDividaConsumo({ instituicao: "Consumo Sem Taxa", saldo: 100000, taxaEstimada: null });

      const ranking = priorizarQuitacaoDividas(db, dataReferencia);

      // Todas as 4 dívidas ativas entraram — nenhuma foi excluída silenciosamente.
      expect(ranking).toHaveLength(4);

      const porId = new Map(ranking.map((item) => [`${item.dividaTipo}:${item.dividaId}`, item]));
      const posicao = (chave: string) => ranking.findIndex((item) => `${item.dividaTipo}:${item.dividaId}` === chave);

      expect(posicao(`divida_consumo:${consumoAltaTaxaId}`)).toBe(0);
      expect(posicao(`financiamento:${financiamentoId}`)).toBe(1);
      expect(posicao(`divida_consumo:${consumoBaixaTaxaId}`)).toBe(2);
      expect(posicao(`divida_consumo:${consumoSemTaxaId}`)).toBe(3); // taxa desconhecida, sempre por último

      // prioridade é 1-based e reflete a posição no array.
      expect(ranking.map((item) => item.prioridade)).toEqual([1, 2, 3, 4]);

      const semTaxa = porId.get(`divida_consumo:${consumoSemTaxaId}`)!;
      expect(semTaxa.taxaDesconhecida).toBe(true);
      expect(semTaxa.justificativa).toContain("não é possível");

      const primeira = porId.get(`divida_consumo:${consumoAltaTaxaId}`)!;
      expect(primeira.justificativa).toContain("mais alta do portfólio");
    });

    it("quebra por destino: dívida com rateio cadastrado é fatiada corretamente; sem rateio, 100% não classificado", () => {
      const dataReferencia = "2026-01-01";
      const consumoComRateioId = criarDividaConsumo({ instituicao: "Com Rateio", saldo: 10000, taxaEstimada: 3 });
      const consumoSemRateioId = criarDividaConsumo({ instituicao: "Sem Rateio", saldo: 4000, taxaEstimada: 1 });

      registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId: consumoComRateioId, destino: "empresa", percentual: 60 });
      registrarRateioDestino(db, { dividaTipo: "divida_consumo", dividaId: consumoComRateioId, destino: "pessoal", percentual: 40 });

      const ranking = priorizarQuitacaoDividas(db, dataReferencia);
      const comRateio = ranking.find((item) => item.dividaTipo === "divida_consumo" && item.dividaId === consumoComRateioId)!;
      const semRateio = ranking.find((item) => item.dividaTipo === "divida_consumo" && item.dividaId === consumoSemRateioId)!;

      expect(comRateio.quebraPorDestino).toEqual(
        expect.arrayContaining([
          { destino: "empresa", valor: 6000 },
          { destino: "pessoal", valor: 4000 },
        ]),
      );
      expect(comRateio.quebraPorDestino).toHaveLength(2); // 60% + 40% = 100%, sem resíduo "não classificado"

      expect(semRateio.quebraPorDestino).toEqual([{ destino: "não classificado", valor: 4000 }]);
    });

    it("dívida com saldo devedor zero (quitada) não entra no ranking", () => {
      criarDividaConsumo({ instituicao: "Quitada", saldo: 0, taxaEstimada: 2 });
      const ativaId = criarDividaConsumo({ instituicao: "Ativa", saldo: 1000, taxaEstimada: 2 });

      const ranking = priorizarQuitacaoDividas(db, "2026-01-01");

      expect(ranking).toHaveLength(1);
      expect(ranking[0].dividaId).toBe(ativaId);
    });
  });

  describe("simularImpactoAmortizacaoParcial", () => {
    it("financiamento SAC: economia de juros exata ao amortizar parcialmente na metade do prazo", () => {
      // Cronograma SAC (valor_contratado=12000, taxa=1% a.m., 12 parcelas, amortização=1000/mês):
      //   parcela 6 vence em 2024-07-01, saldo devedor final = 6000.
      //   parcelas 7..12 (ainda não vencidas em 2024-07-01) têm juros: 60+50+40+30+20+10 = 210.
      // Amortizando 3000 em 2024-07-01: novo saldo = 3000, recalculado em 6 parcelas (mantendo prazo):
      //   amortização constante = 500/mês; juros: 30+25+20+15+10+5 = 105.
      // Economia = 210 - 105 = 105.
      const financiamentoId = criarFinanciamentoSac();

      const resultado = simularImpactoAmortizacaoParcial(db, "financiamento", financiamentoId, 3000, "2024-07-01");

      expect(resultado.saldoDevedorAntes).toBe(6000);
      expect(resultado.valorAmortizadoEfetivo).toBe(3000);
      expect(resultado.novoSaldoDevedor).toBe(3000);
      expect(resultado.totalJurosRestanteAntes).toBe(210);
      expect(resultado.totalJurosRestanteDepois).toBe(105);
      expect(resultado.economiaJurosEstimada).toBe(105);
    });

    it("financiamento SAC: valor amortizado maior que o saldo devedor é limitado ao saldo (quita a dívida)", () => {
      const financiamentoId = criarFinanciamentoSac();

      const resultado = simularImpactoAmortizacaoParcial(db, "financiamento", financiamentoId, 999999, "2024-07-01");

      expect(resultado.valorAmortizadoEfetivo).toBe(6000); // limitado ao saldo devedor de 6000
      expect(resultado.novoSaldoDevedor).toBe(0);
      expect(resultado.totalJurosRestanteDepois).toBe(0); // saldo zerado, sem juros futuros
      expect(resultado.economiaJurosEstimada).toBe(210); // economiza 100% do juro restante
    });

    it("financiamento 'OUTRO': lança erro em vez de fabricar uma economia sem taxa conhecida", () => {
      const financiamentoId = criarFinanciamentoOutro(50000);
      expect(() => simularImpactoAmortizacaoParcial(db, "financiamento", financiamentoId, 1000, "2026-01-01")).toThrow(/OUTRO/);
    });

    it("dívida de consumo: estimativa simples valorAmortizado × taxa mensal × meses restantes estimados, com números exatos", () => {
      // saldo=10000, parcela=500 → meses restantes estimados = ceil(10000/500) = 20.
      // taxa=2% a.m., amortizando 4000: economia = 4000 × 0.02 × 20 = 1600.
      const dividaId = criarDividaConsumo({ saldo: 10000, parcela: 500, taxaEstimada: 2 });

      const resultado = simularImpactoAmortizacaoParcial(db, "divida_consumo", dividaId, 4000, "2026-01-01");

      expect(resultado.saldoDevedorAntes).toBe(10000);
      expect(resultado.novoSaldoDevedor).toBe(6000);
      expect(resultado.economiaJurosEstimada).toBe(1600);
      expect(resultado.totalJurosRestanteAntes).toBeNull();
      expect(resultado.totalJurosRestanteDepois).toBeNull();
    });

    it("dívida de consumo sem taxa estimada: lança erro em vez de inventar uma taxa", () => {
      const dividaId = criarDividaConsumo({ taxaEstimada: null });
      expect(() => simularImpactoAmortizacaoParcial(db, "divida_consumo", dividaId, 1000, "2026-01-01")).toThrow(/taxa_juros_mensal_estimada/);
    });

    it("valor de amortização inválido (<=0) lança erro", () => {
      const dividaId = criarDividaConsumo({ taxaEstimada: 2 });
      expect(() => simularImpactoAmortizacaoParcial(db, "divida_consumo", dividaId, 0, "2026-01-01")).toThrow();
      expect(() => simularImpactoAmortizacaoParcial(db, "divida_consumo", dividaId, -100, "2026-01-01")).toThrow();
    });

    it("dívida já quitada (saldo zero) lança erro em vez de simular economia inexistente", () => {
      const dividaId = criarDividaConsumo({ saldo: 0, taxaEstimada: 2 });
      expect(() => simularImpactoAmortizacaoParcial(db, "divida_consumo", dividaId, 100, "2026-01-01")).toThrow(/quitada/);
    });
  });
});
