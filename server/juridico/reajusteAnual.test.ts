import { describe, expect, it } from 'vitest';
import { calcularJanelaReajusteAnual, calcularProximoReajusteAnual } from './reajusteAnual';

function data(ano: number, mes1Indexado: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1Indexado - 1, dia));
}

describe('calcularProximoReajusteAnual', () => {
  it('sem reajuste anterior: usa data_inicio + 1 ano', () => {
    expect(calcularProximoReajusteAnual(data(2025, 7, 10), null)).toEqual(data(2026, 7, 10));
  });

  it('com reajuste anterior: usa data_ultimo_reajuste + 1 ano, não data_inicio', () => {
    expect(calcularProximoReajusteAnual(data(2023, 1, 1), data(2026, 3, 5))).toEqual(data(2027, 3, 5));
  });
});

describe('calcularJanelaReajusteAnual', () => {
  it('fora da janela de 30 dias: não devido', () => {
    const janela = calcularJanelaReajusteAnual(data(2025, 7, 10), null, data(2026, 1, 1));
    expect(janela.devidoAgora).toBe(false);
  });

  it('dentro de 30 dias do próximo reajuste: devido', () => {
    const janela = calcularJanelaReajusteAnual(data(2025, 7, 10), null, data(2026, 6, 15));
    expect(janela.proximoReajuste).toEqual(data(2026, 7, 10));
    expect(janela.devidoAgora).toBe(true);
  });
});
