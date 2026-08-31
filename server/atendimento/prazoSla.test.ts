import { describe, expect, it } from 'vitest';
import { calcularPrazoSla } from './prazoSla';

function data(ano: number, mes1Indexado: number, dia: number, hora = 0, minuto = 0): Date {
  return new Date(Date.UTC(ano, mes1Indexado - 1, dia, hora, minuto));
}

describe('calcularPrazoSla', () => {
  describe('horasUteis: false (emergência — relógio de parede)', () => {
    it('soma horas corridas, mesmo fora do expediente e no fim de semana', () => {
      // sexta 22h + 2h corridas = sábado 00h, sem esperar o expediente reabrir
      const prazo = calcularPrazoSla(data(2026, 7, 10, 22, 0), { prazoHoras: 2, horasUteis: false });
      expect(prazo).toEqual(data(2026, 7, 11, 0, 0));
    });
  });

  describe('horasUteis: true (financeiro/contratual/manutenção — expediente seg-sex 9h-18h)', () => {
    it('abertura dentro do expediente, prazo cabe no mesmo dia', () => {
      // segunda 10h + 3h úteis = segunda 13h (não toca 18h, não passa de dia)
      const prazo = calcularPrazoSla(data(2026, 7, 6, 10, 0), { prazoHoras: 3, horasUteis: true }); // 06/07/2026 é segunda
      expect(prazo).toEqual(data(2026, 7, 6, 13, 0));
    });

    it('prazo de 24h úteis a partir de segunda 10h: consome o resto de segunda, todo terça, parte de quarta', () => {
      // segunda 10h->18h = 8h; terça 9h->18h = 9h (total 17h); resta 7h -> quarta 9h+7h = 16h
      const prazo = calcularPrazoSla(data(2026, 7, 6, 10, 0), { prazoHoras: 24, horasUteis: true });
      expect(prazo).toEqual(data(2026, 7, 8, 16, 0)); // quarta-feira 08/07/2026
    });

    it('abertura antes do expediente: começa a contar às 9h do mesmo dia', () => {
      const prazo = calcularPrazoSla(data(2026, 7, 6, 6, 0), { prazoHoras: 2, horasUteis: true });
      expect(prazo).toEqual(data(2026, 7, 6, 11, 0));
    });

    it('abertura depois do expediente: começa a contar às 9h do próximo dia útil', () => {
      const prazo = calcularPrazoSla(data(2026, 7, 6, 19, 0), { prazoHoras: 2, horasUteis: true }); // segunda 19h
      expect(prazo).toEqual(data(2026, 7, 7, 11, 0)); // terça 9h + 2h
    });

    it('abertura no sábado: começa a contar na segunda-feira seguinte', () => {
      const prazo = calcularPrazoSla(data(2026, 7, 11, 15, 0), { prazoHoras: 2, horasUteis: true }); // sábado 11/07/2026
      expect(prazo).toEqual(data(2026, 7, 13, 11, 0)); // segunda 13/07/2026, 9h + 2h
    });

    it('abertura no domingo: começa a contar na segunda-feira seguinte', () => {
      const prazo = calcularPrazoSla(data(2026, 7, 12, 8, 0), { prazoHoras: 1, horasUteis: true }); // domingo
      expect(prazo).toEqual(data(2026, 7, 13, 10, 0)); // segunda 9h + 1h
    });

    it('prazo exato até o fim do expediente: deadline cai em 18h, não passa para o dia seguinte', () => {
      const prazo = calcularPrazoSla(data(2026, 7, 6, 10, 0), { prazoHoras: 8, horasUteis: true });
      expect(prazo).toEqual(data(2026, 7, 6, 18, 0));
    });
  });

  it('rejeita prazoHoras zero ou negativo', () => {
    expect(() => calcularPrazoSla(data(2026, 7, 6, 10, 0), { prazoHoras: 0, horasUteis: true })).toThrow();
    expect(() => calcularPrazoSla(data(2026, 7, 6, 10, 0), { prazoHoras: -1, horasUteis: false })).toThrow();
  });
});
