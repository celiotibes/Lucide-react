import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import {
  projetarOcupacaoEReceitaMedia,
  simularCenarioLiquidezFutura,
  compararCenarios,
} from "./simulacaoLiquidez";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function ultimoId(tabela: string): number {
  return consultar<{ id: number }>(db, `SELECT id FROM ${tabela} ORDER BY id DESC LIMIT 1`)[0].id;
}

function criarImovel(overrides: Partial<{ apelido: string; financiado: number; usoPessoal: number }> = {}): number {
  const p = { apelido: "Imóvel Teste", financiado: 0, usoPessoal: 0, ...overrides };
  executar(db, "INSERT INTO imoveis (apelido, tipo, financiado, uso_pessoal) VALUES (?, 'kitnet', ?, ?)", [
    p.apelido,
    p.financiado,
    p.usoPessoal,
  ]);
  return ultimoId("imoveis");
}

function criarContrato(imovelId: number, overrides: Partial<{ valorReferencia: number; dataInicio: string; dataFim: string | null }> = {}): number {
  const p = { valorReferencia: 2000, dataInicio: "2020-01-01", dataFim: null as string | null, ...overrides };
  executar(
    db,
    `INSERT INTO contratos_locacao (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio, data_fim)
     VALUES (?, 'Locatário Teste', 'residencial_fixo', ?, 10, ?, ?)`,
    [imovelId, p.valorReferencia, p.dataInicio, p.dataFim],
  );
  return ultimoId("contratos_locacao");
}

function criarCompetencia(contratoId: number, imovelId: number, ano: number, mes: number, valor = 2000): void {
  const dataVenc = `${ano}-${String(mes).padStart(2, "0")}-10`;
  executar(
    db,
    `INSERT INTO aluguel_competencias (contrato_id, imovel_id, ano, mes, data_vencimento, valor_devido, status, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?)`,
    [contratoId, imovelId, ano, mes, dataVenc, valor, dataVenc],
  );
}

/** Gera competências reais para os `quantidade` meses terminando em `anoFim`/`mesFim`
 * (inclusive) — mesma janela que `projetarOcupacaoEReceitaMedia` usa internamente. */
function criarHistoricoCompetencias(contratoId: number, imovelId: number, anoFim: number, mesFim: number, quantidade: number, valor = 2000): void {
  let ano = anoFim;
  let mes = mesFim;
  for (let i = 0; i < quantidade; i++) {
    criarCompetencia(contratoId, imovelId, ano, mes, valor);
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }
}

function criarFinanciamentoSac(
  overrides: Partial<{
    imovelId: number;
    instituicao: string;
    valorContratado: number;
    taxaJurosMensal: number;
    dataContrato: string;
    parcelasTotal: number;
  }> = {},
): number {
  const imovelId = overrides.imovelId ?? criarImovel({ apelido: "Kitnet Financiada", financiado: 1 });
  const p = {
    instituicao: "Caixa",
    valorContratado: 12000,
    taxaJurosMensal: 1,
    dataContrato: "2024-01-01",
    parcelasTotal: 12,
    ...overrides,
  };
  executar(
    db,
    "INSERT INTO financiamentos (imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total) VALUES (?, ?, 'SAC', ?, ?, ?, ?)",
    [imovelId, p.instituicao, p.valorContratado, p.taxaJurosMensal, p.dataContrato, p.parcelasTotal],
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

describe("simulacaoLiquidez", () => {
  describe("projetarOcupacaoEReceitaMedia", () => {
    it("receita e ocupação média real: 12 meses de histórico completo, amostra suficiente", () => {
      const imovelId = criarImovel();
      const contratoId = criarContrato(imovelId, { valorReferencia: 2000, dataInicio: "2023-01-01" });
      criarHistoricoCompetencias(contratoId, imovelId, 2024, 7, 12, 2000);

      const resultado = projetarOcupacaoEReceitaMedia(db, { dataReferencia: "2024-07-01", mesesHistorico: 12 });

      expect(resultado.mesesComDadosReais).toBe(12);
      expect(resultado.amostraPequena).toBe(false);
      expect(resultado.receitaMediaHistoricaMensal).toBeCloseTo(2000, 2);
      expect(resultado.ocupacaoMediaHistorica).toBeCloseTo(100, 2);
      expect(resultado.despesaMediaHistoricaMensal).toBe(0);
      expect(resultado.metodologia).toContain("Amostra considerada suficiente");
    });

    it("amostra pequena (menos de 3 meses de dado real) é sinalizada, sem quebrar o cálculo", () => {
      const imovelId = criarImovel();
      const contratoId = criarContrato(imovelId, { valorReferencia: 1500, dataInicio: "2024-05-01" });
      // Só 2 meses de competência dentro da janela de 12 meses pedida.
      criarCompetencia(contratoId, imovelId, 2024, 6, 1500);
      criarCompetencia(contratoId, imovelId, 2024, 7, 1500);

      const resultado = projetarOcupacaoEReceitaMedia(db, { dataReferencia: "2024-07-01", mesesHistorico: 12 });

      expect(resultado.mesesComDadosReais).toBe(2);
      expect(resultado.amostraPequena).toBe(true);
      expect(resultado.receitaMediaHistoricaMensal).toBeCloseTo(1500, 2);
      expect(resultado.metodologia).toContain("AMOSTRA PEQUENA");
    });

    it("sem nenhum histórico de competência: não quebra, receita zero e metodologia explica a ausência de dado", () => {
      const resultado = projetarOcupacaoEReceitaMedia(db, { dataReferencia: "2024-07-01", mesesHistorico: 6 });

      expect(resultado.mesesComDadosReais).toBe(0);
      expect(resultado.amostraPequena).toBe(true);
      expect(resultado.receitaMediaHistoricaMensal).toBe(0);
      expect(resultado.despesaMediaHistoricaMensal).toBe(0);
      expect(resultado.taxaReajusteMediaAnualPct).toBeNull();
      expect(resultado.fonteTaxaReajuste).toContain("Nenhum reajuste de contrato registrado");
    });

    it("taxa de reajuste: usa a média real de contrato_reajustes.percentual_aplicado quando há reajuste já aplicado", () => {
      const imovelId = criarImovel();
      const contratoId = criarContrato(imovelId, { valorReferencia: 1000, dataInicio: "2022-01-01" });
      executar(
        db,
        `INSERT INTO contrato_reajustes (contrato_id, data_vigencia, valor_anterior, valor_novo, percentual_aplicado, criterio, eh_reajuste_anual)
         VALUES (?, '2023-01-01', 1000, 1080, 8.0, 'igpm', 1)`,
        [contratoId],
      );
      executar(
        db,
        `INSERT INTO contrato_reajustes (contrato_id, data_vigencia, valor_anterior, valor_novo, percentual_aplicado, criterio, eh_reajuste_anual)
         VALUES (?, '2024-01-01', 1080, 1166.4, 8.0, 'igpm', 1)`,
        [contratoId],
      );
      // Inserida junto com taxas de IGP-M, para provar que reajuste real tem prioridade sobre o índice.
      executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('igpm', '2023-06-01', 50.0)");

      const resultado = projetarOcupacaoEReceitaMedia(db, { dataReferencia: "2024-07-01", mesesHistorico: 3 });

      expect(resultado.taxaReajusteMediaAnualPct).toBeCloseTo(8.0, 2);
      expect(resultado.fonteTaxaReajuste).toContain("contrato_reajustes.percentual_aplicado");
    });

    it("taxa de reajuste: cai para a variação composta do IGP-M real quando não há reajuste de contrato ainda", () => {
      // Dois meses de IGP-M a 1% a.m.: fator composto = 1.01^2 - 1 = 2.01% (arredondado).
      executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('igpm', '2024-05-01', 1.0)");
      executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('igpm', '2024-06-01', 1.0)");

      const resultado = projetarOcupacaoEReceitaMedia(db, { dataReferencia: "2024-07-01", mesesHistorico: 3 });

      expect(resultado.taxaReajusteMediaAnualPct).toBeCloseTo((Math.pow(1.01, 2) - 1) * 100, 2);
      expect(resultado.fonteTaxaReajuste).toContain("IGP-M");
    });
  });

  describe("simularCenarioLiquidezFutura", () => {
    it("valida parâmetros: meses inválido, cenário sem dívida-alvo, amortizar_parcial sem valor", () => {
      expect(() => simularCenarioLiquidezFutura(db, { meses: 0, cenario: "manter" })).toThrow();
      expect(() => simularCenarioLiquidezFutura(db, { meses: 6, cenario: "quitar_divida" })).toThrow(/exige dividaTipo e dividaId/);
      expect(() =>
        simularCenarioLiquidezFutura(db, { meses: 6, cenario: "amortizar_parcial", dividaTipo: "financiamento", dividaId: 1 }),
      ).toThrow(/valorAmortizacao/);
    });

    it("cenário 'manter': sem dívida-alvo, os dois lados da comparação são idênticos (ganho zero)", () => {
      const imovelId = criarImovel();
      const contratoId = criarContrato(imovelId, { valorReferencia: 2000, dataInicio: "2023-01-01" });
      criarHistoricoCompetencias(contratoId, imovelId, 2024, 7, 12, 2000);

      const resultado = simularCenarioLiquidezFutura(db, { meses: 6, cenario: "manter", dataReferencia: "2024-07-01" });

      expect(resultado.impactoAmortizacao).toBeNull();
      expect(resultado.ganhoLiquidezAcumulada).toBe(0);
      expect(resultado.ganhoPatrimonioLiquidoFuturo).toBe(0);
      for (const mes of resultado.meses) {
        expect(mes.liquidezManter).toBe(mes.liquidezAlternativo);
      }
    });

    it("quitar integralmente um financiamento SAC: dip de caixa no mês 1, liquidez maior nos meses seguintes, ganho == economia de juros exata", () => {
      const imovelId = criarImovel();
      const contratoId = criarContrato(imovelId, { valorReferencia: 2000, dataInicio: "2023-01-01" });
      criarHistoricoCompetencias(contratoId, imovelId, 2024, 7, 12, 2000);

      // Mesmo cronograma de priorizacaoQuitacao.test.ts: valor=12000, taxa=1% a.m., 12 parcelas,
      // data_contrato=2024-01-01 — saldo devedor em 2024-07-01 é 6000; quitação integral
      // economiza exatamente 210 de juros (parcelas 7..12 ainda não vencidas).
      const financiamentoId = criarFinanciamentoSac();

      const resultado = simularCenarioLiquidezFutura(db, {
        meses: 6,
        cenario: "quitar_divida",
        dividaTipo: "financiamento",
        dividaId: financiamentoId,
        dataReferencia: "2024-07-01",
      });

      expect(resultado.impactoAmortizacao).not.toBeNull();
      expect(resultado.impactoAmortizacao!.economiaJurosEstimada).toBeCloseTo(210, 2);
      expect(resultado.impactoAmortizacao!.novoSaldoDevedor).toBe(0);

      // Mês 1: saída de caixa integral da quitação — liquidez alternativa cai bem abaixo da
      // liquidez "manter" (dip de caixa, visível lado a lado na mesma linha).
      expect(resultado.meses[0].saidaCaixaAmortizacao).toBeCloseTo(6000, 2);
      expect(resultado.meses[0].liquidezAlternativo).toBeLessThan(resultado.meses[0].liquidezManter);

      // Meses seguintes: sem mais parcela a pagar, liquidez alternativa supera a "manter".
      for (const mes of resultado.meses.slice(1)) {
        expect(mes.liquidezAlternativo).toBeGreaterThan(mes.liquidezManter);
        expect(mes.servicoDividaTotalAlternativo).toBe(0);
      }

      // Patrimônio líquido e liquidez acumulada convergem para a mesma economia de juros
      // (210) — no fim do contrato o saldo devedor remanescente é zero nos dois cenários, a
      // única diferença acumulada ao longo dos 6 meses é o juro que deixou de ser pago.
      expect(resultado.ganhoLiquidezAcumulada).toBeCloseTo(210, 2);
      expect(resultado.ganhoPatrimonioLiquidoFuturo).toBeCloseTo(210, 2);
    });

    it("amortização parcial de um financiamento SAC: ganho positivo, mas menor que a quitação integral", () => {
      const imovelId = criarImovel();
      const contratoId = criarContrato(imovelId, { valorReferencia: 2000, dataInicio: "2023-01-01" });
      criarHistoricoCompetencias(contratoId, imovelId, 2024, 7, 12, 2000);
      const financiamentoId = criarFinanciamentoSac();

      const resultado = simularCenarioLiquidezFutura(db, {
        meses: 6,
        cenario: "amortizar_parcial",
        dividaTipo: "financiamento",
        dividaId: financiamentoId,
        valorAmortizacao: 3000,
        dataReferencia: "2024-07-01",
      });

      expect(resultado.impactoAmortizacao!.economiaJurosEstimada).toBeCloseTo(105, 2);
      expect(resultado.impactoAmortizacao!.novoSaldoDevedor).toBe(3000);
      expect(resultado.meses[0].saidaCaixaAmortizacao).toBeCloseTo(3000, 2);
      expect(resultado.ganhoLiquidezAcumulada).toBeCloseTo(105, 2);
      expect(resultado.ganhoPatrimonioLiquidoFuturo).toBeCloseTo(105, 2);
      expect(resultado.ganhoPatrimonioLiquidoFuturo).toBeLessThan(210);
    });

    it("quitar uma dívida de consumo: elimina o serviço da dívida nos meses seguintes; patrimônio líquido futuro melhora pelo juro evitado mesmo quando o caixa de curto prazo cai", () => {
      const imovelId = criarImovel();
      const contratoId = criarContrato(imovelId, { valorReferencia: 1000, dataInicio: "2023-01-01" });
      criarHistoricoCompetencias(contratoId, imovelId, 2026, 1, 12, 1000);
      // saldo=4000, parcela=500 → 8 meses restantes estimados (ceil(4000/500)); taxa=2% a.m.
      const dividaId = criarDividaConsumo({ saldo: 4000, parcela: 500, taxaEstimada: 2 });

      // Janela de 4 meses (menor que os 8 meses restantes estimados): dívida de consumo não
      // tem cronograma teórico — o serviço mensal projetado (servicoConsumoNoMes) é amortização
      // linear pura, sem juro embutido no fluxo de caixa. Pagar 4000 hoje para deixar de pagar
      // 4×500=2000 nos 4 meses da janela é, em CAIXA puro, uma perda de curto prazo — comportamento
      // correto e esperado do modelo simples documentado no cabeçalho do módulo.
      const resultado = simularCenarioLiquidezFutura(db, {
        meses: 4,
        cenario: "quitar_divida",
        dividaTipo: "divida_consumo",
        dividaId,
        dataReferencia: "2026-01-01",
      });

      expect(resultado.impactoAmortizacao!.novoSaldoDevedor).toBe(0);
      expect(resultado.impactoAmortizacao!.economiaJurosEstimada).toBeCloseTo(4000 * 0.02 * 8, 2); // 640
      expect(resultado.meses[0].saidaCaixaAmortizacao).toBeCloseTo(4000, 2);
      for (const mes of resultado.meses) {
        expect(mes.servicoDividaTotalAlternativo).toBe(0);
      }

      // Caixa de curto prazo (4 meses < 8 meses restantes): a amortização integral ainda não
      // "se paga" só em fluxo de caixa dentro da janela — negativo é o resultado correto aqui.
      expect(resultado.ganhoLiquidezAcumulada).toBeLessThan(0);

      // Patrimônio líquido futuro, porém, melhora: o juro real evitado (economiaJurosEstimada,
      // reaproveitado de priorizacaoQuitacao.ts) é somado explicitamente porque o fluxo de caixa
      // acima não o capta (ver comentário em simularCenarioLiquidezFutura).
      expect(resultado.ganhoPatrimonioLiquidoFuturo).toBeCloseTo(640, 2);
    });
  });

  describe("compararCenarios", () => {
    it("ordena do maior para o menor ganho de patrimônio líquido futuro", () => {
      const imovelId = criarImovel();
      const contratoId = criarContrato(imovelId, { valorReferencia: 2000, dataInicio: "2023-01-01" });
      criarHistoricoCompetencias(contratoId, imovelId, 2024, 7, 12, 2000);
      const financiamentoId = criarFinanciamentoSac();

      const comparacao = compararCenarios(db, [
        { nome: "Manter", meses: 6, cenario: "manter", dataReferencia: "2024-07-01" },
        {
          nome: "Amortizar parcial",
          meses: 6,
          cenario: "amortizar_parcial",
          dividaTipo: "financiamento",
          dividaId: financiamentoId,
          valorAmortizacao: 3000,
          dataReferencia: "2024-07-01",
        },
        {
          nome: "Quitar financiamento",
          meses: 6,
          cenario: "quitar_divida",
          dividaTipo: "financiamento",
          dividaId: financiamentoId,
          dataReferencia: "2024-07-01",
        },
      ]);

      expect(comparacao.itens.map((i) => i.nome)).toEqual(["Quitar financiamento", "Amortizar parcial", "Manter"]);
      expect(comparacao.itens[0].ganhoPatrimonioLiquidoFuturo).toBeCloseTo(210, 2);
      expect(comparacao.itens[1].ganhoPatrimonioLiquidoFuturo).toBeCloseTo(105, 2);
      expect(comparacao.itens[2].ganhoPatrimonioLiquidoFuturo).toBe(0);
      expect(comparacao.criterioOrdenacao).toContain("ganhoPatrimonioLiquidoFuturo");
    });

    it("lança erro quando nenhum cenário é informado", () => {
      expect(() => compararCenarios(db, [])).toThrow();
    });
  });
});
