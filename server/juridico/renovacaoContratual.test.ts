import { describe, expect, it } from 'vitest';
import { calcularJanelasRenovacao } from './renovacaoContratual';

function data(ano: number, mes1Indexado: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1Indexado - 1, dia));
}

describe('calcularJanelasRenovacao', () => {
  it('mais de 60 dias do fim do contrato: nenhuma notificação devida', () => {
    const janelas = calcularJanelasRenovacao(data(2027, 1, 1), data(2026, 7, 19));
    expect(janelas.devidoPlanejamento).toBe(false);
    expect(janelas.devidoAjuste).toBe(false);
  });

  it('exatamente 60 dias antes: planejamento devido, ajuste ainda não', () => {
    const dataFim = data(2026, 9, 17); // 60 dias após 19/07
    const janelas = calcularJanelasRenovacao(dataFim, data(2026, 7, 19));
    expect(janelas.devidoPlanejamento).toBe(true);
    expect(janelas.devidoAjuste).toBe(false);
  });

  it('30 dias antes do fim: ambas devidas', () => {
    const dataFim = data(2026, 8, 18); // 30 dias após 19/07
    const janelas = calcularJanelasRenovacao(dataFim, data(2026, 7, 19));
    expect(janelas.devidoPlanejamento).toBe(true);
    expect(janelas.devidoAjuste).toBe(true);
  });

  it('data de fim já passou: ambas continuam devidas (dias negativos)', () => {
    const janelas = calcularJanelasRenovacao(data(2026, 7, 1), data(2026, 7, 19));
    expect(janelas.devidoPlanejamento).toBe(true);
    expect(janelas.devidoAjuste).toBe(true);
  });
});
