import { describe, expect, it } from 'vitest';
import { calcularJurosMulta, DIAS_GATILHO_HONORARIOS, HONORARIOS_PCT, JUROS_PCT_AM, MULTA_PCT } from './jurosMulta';

function data(ano: number, mes1Indexado: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1Indexado - 1, dia));
}

describe('calcularJurosMulta', () => {
  it('sem atraso (pagamento no dia do vencimento): sem multa/juros', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 10),
      dataReferencia: data(2026, 7, 10),
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
    });
    expect(resultado.diasAtraso).toBe(0);
    expect(resultado.valorAtualizado).toBe(1000);
  });

  it('1 dia de atraso: aplica multa cheia + juros de 1 dia, sem honorários', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 10),
      dataReferencia: data(2026, 7, 11),
    });
    expect(resultado.diasAtraso).toBe(1);
    expect(resultado.multa).toBe(100); // 10% de 1000
    expect(resultado.juros).toBeCloseTo(1000 * JUROS_PCT_AM * (1 / 30), 2);
    expect(resultado.honorarios).toBe(0);
  });

  it('29 dias de atraso: ainda sem honorários (gatilho é 30)', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 1),
      dataReferencia: data(2026, 7, 30),
    });
    expect(resultado.diasAtraso).toBe(29);
    expect(resultado.honorarios).toBe(0);
  });

  it('exatamente 30 dias de atraso: honorários de 20% entram', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 7, 1),
      dataReferencia: data(2026, 7, 31),
    });
    expect(resultado.diasAtraso).toBe(DIAS_GATILHO_HONORARIOS);
    const base = 1000 * (1 + MULTA_PCT) + 1000 * JUROS_PCT_AM * (30 / 30);
    expect(resultado.honorarios).toBeCloseTo(base * HONORARIOS_PCT, 2);
  });

  it('permiteAcordo suspende multa/juros/honorários mesmo com atraso grande', () => {
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: data(2026, 1, 1),
      dataReferencia: data(2026, 7, 1),
      permiteAcordo: true,
    });
    expect(resultado.multa).toBe(0);
    expect(resultado.juros).toBe(0);
    expect(resultado.honorarios).toBe(0);
    expect(resultado.valorAtualizado).toBe(1000);
  });

  it('regressão: dataReferencia com hora do dia real não infla diasAtraso (bug achado via teste de integração)', () => {
    // Vencimento à meia-noite UTC de 3 dias atrás, mas dataReferencia no
    // fim da tarde (18h) — antes da correção, Math.round(3.75) virava 4.
    const vencimento = data(2026, 7, 1);
    const referenciaComHora = new Date(Date.UTC(2026, 6, 4, 18, 30, 0));
    const resultado = calcularJurosMulta({
      valorOriginal: 1000,
      dataVencimento: vencimento,
      dataReferencia: referenciaComHora,
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
    });
    expect(resultado.diasAtraso).toBe(3);
  });

  it('rejeita valorOriginal zero ou negativo', () => {
    expect(() =>
      calcularJurosMulta({ valorOriginal: 0, dataVencimento: data(2026, 7, 1), dataReferencia: data(2026, 7, 2) }),
    ).toThrow();
    expect(() =>
      calcularJurosMulta({ valorOriginal: -50, dataVencimento: data(2026, 7, 1), dataReferencia: data(2026, 7, 2) }),
    ).toThrow();
  });
});
