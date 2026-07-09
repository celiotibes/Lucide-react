import { describe, expect, it } from 'vitest';
import { calcularJurosMulta, POLITICA_COBRANCA_GENERICA, type PoliticaCobranca } from './jurosMulta';

function data(ano: number, mes1Indexado: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1Indexado - 1, dia));
}

// Reproduz a cláusula 5.1 do contrato real (Kitnet 16, Residencial João
// Pottker): multa em degraus (2% até o 5º dia, 10% substituindo a partir
// do 6º), juros de 1% a.m., honorários de 20% só se houver necessidade de
// ação judicial — não automático aos 30 dias.
const POLITICA_KITNET16_JOAO_POTTKER: PoliticaCobranca = {
  multaInicialPct: 0.02,
  diasLimiteMultaInicial: 5,
  multaAposLimitePct: 0.1,
  jurosPctAoMes: 0.01,
  honorariosPct: 0.2,
  gatilhoHonorarios: { tipo: 'somente_se_necessario_judicial' },
};

describe('calcularJurosMulta', () => {
  it('sem atraso (pagamento no dia do vencimento): sem multa/juros', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 10),
      dataReferencia: data(2026, 7, 10),
      politica: POLITICA_KITNET16_JOAO_POTTKER,
    });
    expect(resultado.diasAtraso).toBe(0);
    expect(resultado.multa).toBe(0);
    expect(resultado.juros).toBe(0);
    expect(resultado.valorAtualizado).toBe(1000);
  });

  it('pagamento antecipado (dataReferencia antes do vencimento): diasAtraso nunca é negativo', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 10),
      dataReferencia: data(2026, 7, 5),
      politica: POLITICA_KITNET16_JOAO_POTTKER,
    });
    expect(resultado.diasAtraso).toBe(0);
    expect(resultado.valorAtualizado).toBe(1000);
  });

  it('cláusula 5.1.1: até o 5º dia de atraso, multa é 2% sobre o valor original (não sobre principal+juros)', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 10),
      dataReferencia: data(2026, 7, 15), // 5 dias de atraso, exatamente no limite
      politica: POLITICA_KITNET16_JOAO_POTTKER,
    });
    expect(resultado.diasAtraso).toBe(5);
    expect(resultado.multa).toBe(20); // 2% de 1000
  });

  it('cláusula 5.1.2: a partir do 6º dia, a multa de 2% é SUBSTITUÍDA por 10% sobre principal+juros (não somada)', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 10),
      dataReferencia: data(2026, 7, 16), // 6 dias de atraso
      politica: POLITICA_KITNET16_JOAO_POTTKER,
    });
    expect(resultado.diasAtraso).toBe(6);
    const jurosEsperado = 1000 * 0.01 * (6 / 30); // 2.00
    expect(resultado.juros).toBeCloseTo(jurosEsperado, 2);
    const multaEsperada = (1000 + jurosEsperado) * 0.1; // 10% sobre principal+juros, não os 2% antigos
    expect(resultado.multa).toBeCloseTo(multaEsperada, 2);
  });

  it('cláusula 5.1.3: juros de 1% a.m. pro rata die (não 2%, valor do contrato antigo)', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 3000,
      dataVencimento: data(2026, 7, 10),
      dataReferencia: data(2026, 8, 9), // 30 dias de atraso
      politica: POLITICA_KITNET16_JOAO_POTTKER,
    });
    expect(resultado.juros).toBeCloseTo(3000 * 0.01 * (30 / 30), 2); // = 30.00
  });

  it('correção monetária (IPCA) é aplicada quando a taxa acumulada é informada, e soma ao valor atualizado', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 10),
      dataReferencia: data(2026, 7, 20),
      politica: POLITICA_KITNET16_JOAO_POTTKER,
      taxaCorrecaoAcumulada: 0.004, // 0,4% no período, resolvido externamente (Bacen)
    });
    expect(resultado.correcaoMonetaria).toBeCloseTo(4, 2);
  });

  it('sem taxaCorrecaoAcumulada informada, correção monetária é 0 (default seguro, não chuta índice)', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 10),
      dataReferencia: data(2026, 7, 20),
      politica: POLITICA_KITNET16_JOAO_POTTKER,
    });
    expect(resultado.correcaoMonetaria).toBe(0);
  });

  it('cláusula 5.1.5: honorários só incidem quando necessitaAcaoJudicial é true (não automático aos 30 dias)', () => {
    const semNecessidade = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 1),
      dataReferencia: data(2026, 9, 1), // 62 dias de atraso, bem além de 30
      politica: POLITICA_KITNET16_JOAO_POTTKER,
      necessitaAcaoJudicial: false,
    });
    expect(semNecessidade.honorarios).toBe(0);

    const comNecessidade = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 1),
      dataReferencia: data(2026, 9, 1),
      politica: POLITICA_KITNET16_JOAO_POTTKER,
      necessitaAcaoJudicial: true,
    });
    expect(comNecessidade.honorarios).toBeGreaterThan(0);
  });

  it('gatilho "automatico_apos_dias" (política genérica) ainda aplica honorários automaticamente aos 30 dias', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 1),
      dataReferencia: data(2026, 7, 31), // 30 dias de atraso
      politica: POLITICA_COBRANCA_GENERICA,
    });
    expect(resultado.honorarios).toBeGreaterThan(0);
  });

  it('permiteAcordo suspende multa/juros/correção/honorários mesmo com atraso grande', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 1, 1),
      dataReferencia: data(2026, 7, 1),
      politica: POLITICA_KITNET16_JOAO_POTTKER,
      permiteAcordo: true,
      necessitaAcaoJudicial: true,
    });
    expect(resultado.multa).toBe(0);
    expect(resultado.juros).toBe(0);
    expect(resultado.correcaoMonetaria).toBe(0);
    expect(resultado.honorarios).toBe(0);
    expect(resultado.valorAtualizado).toBe(1000);
  });

  it('regressão: dataReferencia com hora do dia real não infla diasAtraso (bug achado via teste de integração)', () => {
    const vencimento = data(2026, 7, 1);
    const referenciaComHora = new Date(Date.UTC(2026, 6, 4, 18, 30, 0));
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: vencimento,
      dataReferencia: referenciaComHora,
      politica: POLITICA_KITNET16_JOAO_POTTKER,
    });
    expect(resultado.diasAtraso).toBe(3);
  });

  it('regressão: mesma checagem também não deve arredondar para baixo demais com hora antes do meio-dia', () => {
    const vencimento = data(2026, 7, 1);
    const referenciaComHora = new Date(Date.UTC(2026, 6, 4, 2, 0, 0));
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: vencimento,
      dataReferencia: referenciaComHora,
      politica: POLITICA_KITNET16_JOAO_POTTKER,
    });
    expect(resultado.diasAtraso).toBe(3);
  });

  it('rejeita valorOriginal zero ou negativo', () => {
    expect(() =>
      calcularJurosMulta({
        valorOriginal: 0,
        dataVencimento: data(2026, 7, 1),
        dataReferencia: data(2026, 7, 2),
        politica: POLITICA_KITNET16_JOAO_POTTKER,
      }),
    ).toThrow();
    expect(() =>
      calcularJurosMulta({
        valorOriginal: -50,
        dataVencimento: data(2026, 7, 1),
        dataReferencia: data(2026, 7, 2),
        politica: POLITICA_KITNET16_JOAO_POTTKER,
      }),
    ).toThrow();
  });
});
