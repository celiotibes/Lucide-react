import { describe, expect, it } from 'vitest';
import { calcularProrata } from './prorata';

function data(ano: number, mes1Indexado: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1Indexado - 1, dia));
}

describe('calcularProrata', () => {
  it('reproduz exatamente o contrato real (Kitnet 16, Residencial João Pottker, cláusula 6.4)', () => {
    // início 08/07/2026, R$2.490,00/mês, vencimento dia 10, "mês comercial de 30 dias"
    // -> 24 dias cobertos, R$1.992,00, primeira fatura vencendo 10/08/2026.
    const resultado = calcularProrata({
      dataInicio: data(2026, 7, 8),
      valorAluguelMensal: 2490,
      diaVencimento: 10,
    });
    expect(resultado.diasCobertos).toBe(24);
    expect(resultado.valorProrata).toBe(1992);
    expect(resultado.dataVencimentoPrimeiraFatura).toEqual(data(2026, 8, 10));
  });

  it('contrato iniciado no dia 1: cobre o mês inteiro (30 dias no denominador, não os 31 do calendário)', () => {
    const resultado = calcularProrata({ dataInicio: data(2026, 7, 1), valorAluguelMensal: 3000, diaVencimento: 10 });
    // julho tem 31 dias corridos, mas a base é sempre 30 (mês comercial)
    expect(resultado.diasCobertos).toBe(31);
    expect(resultado.valorProrata).toBe(3100); // 3000/30*31 — mês cheio pode passar de 100% se o mês tem 31 dias
    expect(resultado.dataVencimentoPrimeiraFatura).toEqual(data(2026, 8, 10));
  });

  it('vencimento sempre no mês seguinte, mesmo quando o dia de vencimento ainda não passou no mês de início', () => {
    // início dia 3, vencimento dia 10: o dia 10 do PRÓPRIO mês de início
    // ainda não passou, mas a primeira fatura vence no mês seguinte mesmo
    // assim (evidência do contrato real: início dia 8, vencimento dia 10,
    // primeira fatura no mês seguinte, não em "dois dias depois").
    const resultado = calcularProrata({ dataInicio: data(2026, 7, 3), valorAluguelMensal: 3000, diaVencimento: 10 });
    expect(resultado.dataVencimentoPrimeiraFatura).toEqual(data(2026, 8, 10));
  });

  it('contrato iniciado no fim do ano: vencimento cruza para janeiro do ano seguinte', () => {
    const resultado = calcularProrata({ dataInicio: data(2025, 12, 20), valorAluguelMensal: 1000, diaVencimento: 10 });
    expect(resultado.dataVencimentoPrimeiraFatura).toEqual(data(2026, 1, 10));
  });

  it('dia de vencimento diferente de 10 é respeitado (contrato configurável, não fixo no sistema)', () => {
    const resultado = calcularProrata({ dataInicio: data(2026, 7, 8), valorAluguelMensal: 2490, diaVencimento: 1 });
    expect(resultado.dataVencimentoPrimeiraFatura).toEqual(data(2026, 8, 1));
  });

  it('rejeita valorAluguelMensal zero ou negativo', () => {
    expect(() => calcularProrata({ dataInicio: data(2026, 7, 1), valorAluguelMensal: 0, diaVencimento: 10 })).toThrow();
    expect(() =>
      calcularProrata({ dataInicio: data(2026, 7, 1), valorAluguelMensal: -100, diaVencimento: 10 }),
    ).toThrow();
  });

  it('rejeita diaVencimento fora do intervalo 1-31', () => {
    expect(() =>
      calcularProrata({ dataInicio: data(2026, 7, 1), valorAluguelMensal: 1000, diaVencimento: 0 }),
    ).toThrow();
    expect(() =>
      calcularProrata({ dataInicio: data(2026, 7, 1), valorAluguelMensal: 1000, diaVencimento: 32 }),
    ).toThrow();
  });
});
