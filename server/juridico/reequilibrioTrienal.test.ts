import { describe, expect, it } from 'vitest';
import { calcularJanelasReequilibrio, calcularProximoMarcoTrienal, diasAteData } from './reequilibrioTrienal';

function data(ano: number, mes1Indexado: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1Indexado - 1, dia));
}

describe('calcularProximoMarcoTrienal', () => {
  it('contrato recém-iniciado: marco é data_inicio + 3 anos', () => {
    const marco = calcularProximoMarcoTrienal(data(2026, 1, 1), data(2026, 7, 19));
    expect(marco).toEqual(data(2029, 1, 1));
  });

  it('primeiro marco já passou: avança para o segundo ciclo (Art. 19 permite pedir a cada 3 anos)', () => {
    const marco = calcularProximoMarcoTrienal(data(2023, 1, 1), data(2026, 7, 19));
    expect(marco).toEqual(data(2029, 1, 1));
  });

  it('vários marcos já passados: avança até encontrar o próximo futuro', () => {
    const marco = calcularProximoMarcoTrienal(data(2010, 1, 1), data(2026, 7, 19));
    expect(marco).toEqual(data(2028, 1, 1));
  });
});

describe('diasAteData', () => {
  it('calcula dias corridos entre duas datas', () => {
    expect(diasAteData(data(2026, 8, 1), data(2026, 7, 19))).toBe(13);
  });

  it('devolve negativo quando a data alvo já passou', () => {
    expect(diasAteData(data(2026, 7, 1), data(2026, 7, 19))).toBe(-18);
  });
});

describe('calcularJanelasReequilibrio', () => {
  it('fora das janelas (mais de 90 dias do marco): nenhuma notificação devida', () => {
    const janelas = calcularJanelasReequilibrio(data(2026, 1, 1), data(2026, 1, 1));
    // marco = 2029-01-01, referência 2026-01-01 -> muito mais de 90 dias
    expect(janelas.devidoPlanejamento).toBe(false);
    expect(janelas.devidoOficial).toBe(false);
  });

  it('dentro de 90 dias do marco: planejamento devido, oficial ainda não', () => {
    // marco = 2029-01-01; referência a 80 dias do marco
    const janelas = calcularJanelasReequilibrio(data(2026, 1, 1), data(2028, 10, 13));
    expect(janelas.marco).toEqual(data(2029, 1, 1));
    expect(janelas.devidoPlanejamento).toBe(true);
    expect(janelas.devidoOficial).toBe(false);
  });

  it('dentro de 30 dias do marco: ambas devidas', () => {
    const janelas = calcularJanelasReequilibrio(data(2026, 1, 1), data(2028, 12, 15));
    expect(janelas.devidoPlanejamento).toBe(true);
    expect(janelas.devidoOficial).toBe(true);
  });
});
