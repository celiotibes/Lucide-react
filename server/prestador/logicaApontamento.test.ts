import { describe, expect, it } from 'vitest';
import {
  calcularHoras,
  calcularCombustivel,
  calcularKits,
  calcularEmergencia,
  rateiarAutomatico,
  calcularApontamentoTotal,
  type RegrasApontamento,
  type ApontamentoDado,
} from './logicaApontamento';

describe('logicaApontamento — Cálculos de Prestadores', () => {
  // ========================================================================
  // Testes: calcularHoras
  // ========================================================================

  describe('calcularHoras', () => {
    it('calcula 8 horas de trabalho com intervalo de 1 hora de almoço', () => {
      const horas = calcularHoras('08:00', '17:00', 60);
      expect(horas).toBe(8);
    });

    it('calcula 7 horas quando intervalo é removido de 9 horas totais', () => {
      const horas = calcularHoras('08:00', '17:00', 120);
      expect(horas).toBe(7);
    });

    it('retorna 0 quando horário de saída é igual ao de início', () => {
      const horas = calcularHoras('08:00', '08:00', 60);
      expect(horas).toBe(0);
    });

    it('retorna 0 quando horários não são informados', () => {
      expect(calcularHoras(undefined, '17:00', 60)).toBe(0);
      expect(calcularHoras('08:00', undefined, 60)).toBe(0);
    });

    it('calcula com minutos (ex: 08:30 a 17:15 = 8h45m - 1h = 7h45m)', () => {
      const horas = calcularHoras('08:30', '17:15', 60);
      expect(horas).toBeCloseTo(7.75, 1);
    });
  });

  // ========================================================================
  // Testes: calcularCombustivel
  // ========================================================================

  describe('calcularCombustivel', () => {
    const regras: RegrasApontamento = {
      diaria: 200,
      combustivel_valor_litro: 7.2,
      combustivel_diario_litros: 3,
    };

    it('retorna 0 quando não há quilometragem e deslocamento é vazio', () => {
      const valor = calcularCombustivel(undefined, undefined, regras);
      expect(valor).toBe(0);
    });

    it('retorna R$ 20 para deslocamento até Córrego Grande', () => {
      const valor = calcularCombustivel(0, 'corrego_grande', regras);
      expect(valor).toBe(20);
    });

    it('retorna R$ 20 para deslocamento até suprimentos (até 5km)', () => {
      const valor = calcularCombustivel(0, 'suprimentos_ate5km', regras);
      expect(valor).toBe(20);
    });

    it('calcula quilometragem extra em litros (aprox 12km/L)', () => {
      // 60 km / 12 km/L = 5L * 7.2 = R$ 36
      const valor = calcularCombustivel(60, 'quilometragem', regras);
      expect(valor).toBeCloseTo(36, 0);
    });
  });

  // ========================================================================
  // Testes: calcularKits (Cristiano)
  // ========================================================================

  describe('calcularKits', () => {
    const regras: RegrasApontamento = {
      diaria: 200,
      kit_pos_hospedagem_dentro_8h: 30,
      kit_extraordinario_dia_semana: 40,
      kit_extraordinario_fim_semana: 60,
    };

    it('calcula 2 kits dentro de 8h a R$ 30 cada = R$ 60', () => {
      const segunda = new Date('2026-07-13'); // segunda-feira
      const valor = calcularKits(segunda, 2, 0, regras);
      expect(valor).toBe(60);
    });

    it('calcula kit extraordinário em dia de semana (segunda) a R$ 40', () => {
      const segunda = new Date('2026-07-13'); // segunda-feira
      const valor = calcularKits(segunda, 0, 1, regras);
      expect(valor).toBe(40);
    });

    it('calcula kit extraordinário em sábado a R$ 60', () => {
      const sabado = new Date('2026-07-18'); // sábado
      const valor = calcularKits(sabado, 0, 1, regras);
      expect(valor).toBe(60);
    });

    it('calcula kit extraordinário em domingo a R$ 60', () => {
      const domingo = new Date('2026-07-19'); // domingo
      const valor = calcularKits(domingo, 0, 1, regras);
      expect(valor).toBe(60);
    });

    it('calcula múltiplos kits corretamente', () => {
      const sabado = new Date('2026-07-18');
      const valor = calcularKits(sabado, 2, 3, regras);
      // 2 * 30 + 3 * 60 = 60 + 180 = 240
      expect(valor).toBe(240);
    });
  });

  // ========================================================================
  // Testes: calcularEmergencia
  // ========================================================================

  describe('calcularEmergencia', () => {
    const regras: RegrasApontamento = {
      diaria: 200,
      emergencia_percentual_extra: 20,
      emergencia_deslocamento: 20,
      emergencia_minimo: 50,
    };

    it('aplica mínimo de R$ 50 + deslocamento R$ 20 para até 2h', () => {
      const valor = calcularEmergencia(1, regras);
      // min 50 + deslocamento 20 = 70
      expect(valor).toBe(70);
    });

    it('calcula 3 horas com +20% de forma correta', () => {
      // Diária 200 / 8 = 25/h, +20% = 30/h, 3h * 30 + 20 deslocamento = 110
      const valor = calcularEmergencia(3, regras);
      expect(valor).toBe(110);
    });

    it('retorna 0 para 0 horas', () => {
      const valor = calcularEmergencia(0, regras);
      expect(valor).toBe(0);
    });
  });

  // ========================================================================
  // Testes: rateiarAutomatico
  // ========================================================================

  describe('rateiarAutomatico', () => {
    it('não rateia quando residencial_horas está preenchido manualmente', () => {
      const resultado = rateiarAutomatico(8, ['uuid-1', 'uuid-2'], { 'uuid-1': 5, 'uuid-2': 3 });
      expect(resultado).toEqual({ 'uuid-1': 5, 'uuid-2': 3 });
    });

    it('divide 8h igualmente entre 2 residenciais', () => {
      const resultado = rateiarAutomatico(8, ['uuid-1', 'uuid-2'], undefined);
      expect(resultado['uuid-1']).toBe(4);
      expect(resultado['uuid-2']).toBe(4);
    });

    it('divide 9h entre 3 residenciais (3h cada)', () => {
      const resultado = rateiarAutomatico(9, ['uuid-1', 'uuid-2', 'uuid-3'], undefined);
      expect(resultado['uuid-1']).toBe(3);
      expect(resultado['uuid-2']).toBe(3);
      expect(resultado['uuid-3']).toBe(3);
    });

    it('retorna objeto vazio quando sem residenciais informados', () => {
      const resultado = rateiarAutomatico(8, undefined, undefined);
      expect(resultado).toEqual({});
    });
  });

  // ========================================================================
  // Testes: calcularApontamentoTotal (Integração)
  // ========================================================================

  describe('calcularApontamentoTotal', () => {
    const regrasPaulo: RegrasApontamento = {
      diaria: 121.63,
      valor_hora: 14.53,
      combustivel_valor_litro: 7.2,
      combustivel_diario_litros: 3,
    };

    it('calcula apontamento simples de Paulo: 8h = 1 diária', () => {
      const apontamento: ApontamentoDado = {
        data: new Date('2026-07-13'),
        hora_inicio: '08:00',
        hora_saida: '17:00',
        intervalo_almoco_minutos: 60,
      };

      const resultado = calcularApontamentoTotal(apontamento, regrasPaulo);
      expect(resultado.horas_trabalhadas).toBe(8);
      expect(resultado.valor_diaria).toBe(121.63);
      expect(resultado.valor_horas_adicionais).toBe(0);
      expect(resultado.total).toBe(121.63);
    });

    it('calcula apontamento com 10h: 1 diária + 2h extras', () => {
      const apontamento: ApontamentoDado = {
        data: new Date('2026-07-13'),
        hora_inicio: '08:00',
        hora_saida: '19:00',
        intervalo_almoco_minutos: 60,
      };

      const resultado = calcularApontamentoTotal(apontamento, regrasPaulo);
      expect(resultado.horas_trabalhadas).toBe(10);
      expect(resultado.valor_diaria).toBe(121.63);
      expect(resultado.valor_horas_adicionais).toBeCloseTo(2 * 14.53, 1);
    });

    const regrasCristiano: RegrasApontamento = {
      diaria: 200,
      valor_hora: 25,
      kit_pos_hospedagem_dentro_8h: 30,
      emergencia_percentual_extra: 20,
      emergencia_deslocamento: 20,
    };

    it('calcula apontamento de Cristiano com 3 kits dentro de 8h', () => {
      const apontamento: ApontamentoDado = {
        data: new Date('2026-07-13'),
        hora_inicio: '08:00',
        hora_saida: '17:00',
        intervalo_almoco_minutos: 60,
        quantidade_kits_dentro_horario: 3,
      };

      const resultado = calcularApontamentoTotal(apontamento, regrasCristiano);
      expect(resultado.horas_trabalhadas).toBe(8);
      expect(resultado.valor_diaria).toBe(200);
      expect(resultado.valor_kits).toBe(90); // 3 * 30
      expect(resultado.total).toBe(290);
    });
  });
});
