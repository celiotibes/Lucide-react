import { describe, expect, it } from 'vitest';
import { calcularProrata } from './prorata';

function data(ano: number, mes1Indexado: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1Indexado - 1, dia));
}

describe('calcularProrata', () => {
  it('contrato iniciado no dia 1: cobre o mês inteiro, valor igual ao aluguel cheio', () => {
    const resultado = calcularProrata({ dataInicio: data(2026, 7, 1), valorAluguelMensal: 1000 });
    expect(resultado.valorProrata).toBe(1000);
    expect(resultado.diasCobertos).toBe(31); // julho tem 31 dias
    expect(resultado.dataVencimentoPrimeiraFatura).toEqual(data(2026, 8, 1));
  });

  it('contrato iniciado no dia 15 (limite): usa o ciclo do mês atual', () => {
    const resultado = calcularProrata({ dataInicio: data(2026, 7, 15), valorAluguelMensal: 3100 });
    // julho tem 31 dias; do dia 15 ao 31 = 17 dias
    expect(resultado.diasCobertos).toBe(17);
    expect(resultado.valorProrata).toBe(1700); // 3100/31 * 17 = 1700 exato
    expect(resultado.dataVencimentoPrimeiraFatura).toEqual(data(2026, 8, 1));
  });

  it('contrato iniciado no dia 16 (limite do outro lado): usa o ciclo deslocado para o dia 10', () => {
    const resultado = calcularProrata({ dataInicio: data(2026, 7, 16), valorAluguelMensal: 3100 });
    // julho: do dia 16 ao 31 = 16 dias; agosto: dias 1 a 9 = 9 dias
    expect(resultado.dataVencimentoPrimeiraFatura).toEqual(data(2026, 8, 10));
    expect(resultado.diasCobertos).toBe(16 + 9);
  });

  it('contrato iniciado no fim do ano: vencimento cruza para janeiro do ano seguinte', () => {
    const resultado = calcularProrata({ dataInicio: data(2025, 12, 20), valorAluguelMensal: 1000 });
    expect(resultado.dataVencimentoPrimeiraFatura).toEqual(data(2026, 1, 10));
  });

  it('fevereiro em ano bissexto (2028) usa 29 dias no denominador', () => {
    const resultado = calcularProrata({ dataInicio: data(2028, 2, 1), valorAluguelMensal: 2900 });
    expect(resultado.diasCobertos).toBe(29);
    expect(resultado.valorProrata).toBe(2900);
  });

  it('fevereiro em ano não bissexto (2026) usa 28 dias', () => {
    const resultado = calcularProrata({ dataInicio: data(2026, 2, 1), valorAluguelMensal: 2800 });
    expect(resultado.diasCobertos).toBe(28);
  });

  it('rejeita valorAluguelMensal zero ou negativo', () => {
    expect(() => calcularProrata({ dataInicio: data(2026, 7, 1), valorAluguelMensal: 0 })).toThrow();
    expect(() => calcularProrata({ dataInicio: data(2026, 7, 1), valorAluguelMensal: -100 })).toThrow();
  });
});
