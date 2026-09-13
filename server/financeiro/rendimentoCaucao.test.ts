import { describe, expect, it } from 'vitest';
import { calcularRendimentoCaucao } from './rendimentoCaucao';

describe('calcularRendimentoCaucao', () => {
  it('30 dias a 0,5% a.m. rende exatamente a taxa mensal cheia', () => {
    const resultado = calcularRendimentoCaucao({ valorBase: 2000, taxaMensal: 0.005, diasDecorridos: 30 });
    expect(resultado.rendimento).toBeCloseTo(2000 * 0.005, 2);
    expect(resultado.valorAtualizado).toBeCloseTo(2000 + 2000 * 0.005, 2);
  });

  it('15 dias rende proporcionalmente à metade do mês', () => {
    const resultado = calcularRendimentoCaucao({ valorBase: 2000, taxaMensal: 0.005, diasDecorridos: 15 });
    expect(resultado.rendimento).toBeCloseTo((2000 * 0.005) / 2, 2);
  });

  it('zero dias decorridos: sem rendimento', () => {
    const resultado = calcularRendimentoCaucao({ valorBase: 2000, taxaMensal: 0.005, diasDecorridos: 0 });
    expect(resultado.rendimento).toBe(0);
    expect(resultado.valorAtualizado).toBe(2000);
  });

  it('taxa mensal zero: sem rendimento independentemente dos dias', () => {
    const resultado = calcularRendimentoCaucao({ valorBase: 2000, taxaMensal: 0, diasDecorridos: 365 });
    expect(resultado.rendimento).toBe(0);
  });

  it('rejeita valorBase zero ou negativo', () => {
    expect(() => calcularRendimentoCaucao({ valorBase: 0, taxaMensal: 0.005, diasDecorridos: 30 })).toThrow();
    expect(() => calcularRendimentoCaucao({ valorBase: -10, taxaMensal: 0.005, diasDecorridos: 30 })).toThrow();
  });

  it('rejeita taxaMensal ou diasDecorridos negativos', () => {
    expect(() => calcularRendimentoCaucao({ valorBase: 100, taxaMensal: -0.01, diasDecorridos: 10 })).toThrow();
    expect(() => calcularRendimentoCaucao({ valorBase: 100, taxaMensal: 0.005, diasDecorridos: -1 })).toThrow();
  });
});
