import { describe, expect, it } from 'vitest';
import { calcularRetencaoCaucao } from './calcularRetencaoCaucao';

describe('calcularRetencaoCaucao', () => {
  it('sem danos: caução inteiro é devolvido', () => {
    const resultado = calcularRetencaoCaucao(1500, 0);
    expect(resultado.valorRetido).toBe(0);
    expect(resultado.valorDevolvido).toBe(1500);
    expect(resultado.saldoDevedor).toBe(0);
  });

  it('danos menores que o caução: retém só o necessário, devolve o resto', () => {
    const resultado = calcularRetencaoCaucao(1500, 400);
    expect(resultado.valorRetido).toBe(400);
    expect(resultado.valorDevolvido).toBe(1100);
    expect(resultado.saldoDevedor).toBe(0);
  });

  it('danos iguais ao caução: retém tudo, nada a devolver, sem saldo devedor', () => {
    const resultado = calcularRetencaoCaucao(1500, 1500);
    expect(resultado.valorRetido).toBe(1500);
    expect(resultado.valorDevolvido).toBe(0);
    expect(resultado.saldoDevedor).toBe(0);
  });

  it('danos maiores que o caução: retém tudo, gera saldo devedor', () => {
    const resultado = calcularRetencaoCaucao(1500, 2200);
    expect(resultado.valorRetido).toBe(1500);
    expect(resultado.valorDevolvido).toBe(0);
    expect(resultado.saldoDevedor).toBe(700);
  });

  it('sem caução cadastrado (0): todo o dano vira saldo devedor', () => {
    const resultado = calcularRetencaoCaucao(0, 800);
    expect(resultado.valorRetido).toBe(0);
    expect(resultado.valorDevolvido).toBe(0);
    expect(resultado.saldoDevedor).toBe(800);
  });

  it('lança erro para valores negativos', () => {
    expect(() => calcularRetencaoCaucao(-1, 100)).toThrow();
    expect(() => calcularRetencaoCaucao(100, -1)).toThrow();
  });
});
