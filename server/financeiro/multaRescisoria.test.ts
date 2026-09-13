import { describe, expect, it } from 'vitest';
import { calcularMultaRescisoria } from './multaRescisoria';

const CONTRATO_12_MESES = {
  dataInicioContrato: new Date(Date.UTC(2026, 5, 30)), // 30/06/2026
  dataFimContrato: new Date(Date.UTC(2027, 5, 29)), // 29/06/2027
  valorMensal: 2490,
};

describe('calcularMultaRescisoria', () => {
  it('saída logo no início do contrato: multa próxima do teto de 3 meses', () => {
    const resultado = calcularMultaRescisoria({
      ...CONTRATO_12_MESES,
      dataRescisao: new Date(Date.UTC(2026, 6, 10)), // ~10 dias depois do início
    });

    // Quase o contrato inteiro pela frente => proporção próxima de 1 => multa próxima de 3x aluguel
    expect(resultado.multaProporcional).toBeGreaterThan(2490 * 3 * 0.9);
    expect(resultado.multaProporcional).toBeLessThanOrEqual(2490 * 3);
    expect(resultado.faixaBonificacao).toBe('nao_aplicavel');
    expect(resultado.multaFinal).toBe(resultado.multaProporcional);
  });

  it('saída na metade do contrato: multa proporcional a ~50% do teto', () => {
    const resultado = calcularMultaRescisoria({
      ...CONTRATO_12_MESES,
      dataRescisao: new Date(Date.UTC(2026, 11, 30)), // ~metade do prazo de 12 meses
    });

    expect(resultado.multaProporcional).toBeGreaterThan(2490 * 1.3);
    expect(resultado.multaProporcional).toBeLessThan(2490 * 1.7);
  });

  it('saída no último dia do contrato: multa zero (nada restante)', () => {
    const resultado = calcularMultaRescisoria({
      ...CONTRATO_12_MESES,
      dataRescisao: CONTRATO_12_MESES.dataFimContrato,
    });

    expect(resultado.multaProporcional).toBe(0);
    expect(resultado.multaFinal).toBe(0);
  });

  it('rejeita saída anterior ao início do contrato', () => {
    expect(() =>
      calcularMultaRescisoria({
        ...CONTRATO_12_MESES,
        dataRescisao: new Date(Date.UTC(2026, 0, 1)),
      }),
    ).toThrow();
  });

  it('rejeita valor mensal não positivo', () => {
    expect(() =>
      calcularMultaRescisoria({
        ...CONTRATO_12_MESES,
        valorMensal: 0,
        dataRescisao: new Date(Date.UTC(2026, 6, 10)),
      }),
    ).toThrow();
  });

  describe('bonificação decrescente de dezembro (Anexo I, item 6)', () => {
    it('85% de desconto: notificação até 22/11 e chaves até 22/12', () => {
      const resultado = calcularMultaRescisoria({
        ...CONTRATO_12_MESES,
        dataNotificacao: new Date(Date.UTC(2026, 10, 20)), // 20/11
        dataRescisao: new Date(Date.UTC(2026, 11, 20)), // 20/12
      });

      expect(resultado.faixaBonificacao).toBe('ate_22_novembro');
      expect(resultado.descontoBonificacaoPct).toBe(0.85);
      expect(resultado.multaFinal).toBeCloseTo(resultado.multaProporcional * 0.15, 1);
    });

    it('80% de desconto: notificação até 27/11 e chaves até 28/12 (fora da janela de 85%)', () => {
      const resultado = calcularMultaRescisoria({
        ...CONTRATO_12_MESES,
        dataNotificacao: new Date(Date.UTC(2026, 10, 25)), // 25/11 — depois de 22/11
        dataRescisao: new Date(Date.UTC(2026, 11, 27)), // 27/12
      });

      expect(resultado.faixaBonificacao).toBe('ate_27_novembro');
      expect(resultado.descontoBonificacaoPct).toBe(0.8);
    });

    it('sem bonificação: notificação depois de 27/11', () => {
      const resultado = calcularMultaRescisoria({
        ...CONTRATO_12_MESES,
        dataNotificacao: new Date(Date.UTC(2026, 10, 28)), // 28/11
        dataRescisao: new Date(Date.UTC(2026, 11, 15)),
      });

      expect(resultado.faixaBonificacao).toBe('fora_da_janela');
      expect(resultado.descontoBonificacaoPct).toBe(0);
      expect(resultado.multaFinal).toBe(resultado.multaProporcional);
    });

    it('sem bonificação: entrega das chaves depois de 22/12 invalida a faixa de 85%, mas ainda cabe em 80% se dentro do prazo', () => {
      const resultado = calcularMultaRescisoria({
        ...CONTRATO_12_MESES,
        dataNotificacao: new Date(Date.UTC(2026, 10, 20)), // 20/11 (dentro das duas janelas)
        dataRescisao: new Date(Date.UTC(2026, 11, 25)), // 25/12 — depois de 22/12, mas antes de 28/12
      });

      expect(resultado.faixaBonificacao).toBe('ate_27_novembro');
      expect(resultado.descontoBonificacaoPct).toBe(0.8);
    });

    it('não aplicável: saída fora do mês de dezembro', () => {
      const resultado = calcularMultaRescisoria({
        ...CONTRATO_12_MESES,
        dataNotificacao: new Date(Date.UTC(2026, 9, 1)),
        dataRescisao: new Date(Date.UTC(2026, 10, 15)), // novembro
      });

      expect(resultado.faixaBonificacao).toBe('nao_aplicavel');
      expect(resultado.descontoBonificacaoPct).toBe(0);
    });

    it('sem data de notificação informada, mesmo saindo em dezembro: sem bonificação', () => {
      const resultado = calcularMultaRescisoria({
        ...CONTRATO_12_MESES,
        dataRescisao: new Date(Date.UTC(2026, 11, 10)),
      });

      expect(resultado.faixaBonificacao).toBe('fora_da_janela');
      expect(resultado.descontoBonificacaoPct).toBe(0);
    });
  });
});
