import { describe, expect, it } from 'vitest';
import { calcularAuditoriaEnergiaSolar } from './auditoriaGeracaoSolar';

const TARIFA_EXEMPLO = 0.85; // R$/kWh

describe('calcularAuditoriaEnergiaSolar', () => {
  it('caso simples: prédio consome mais do que gera, área comum é o resíduo entre total usado e cobrado', () => {
    const resultado = calcularAuditoriaEnergiaSolar({
      energiaGeradaTotalKwh: 1000,
      energiaInjetadaKwh: 300,
      energiaConsumidaRedeKwh: 200,
      totalCobradoInquilinosKwh: 750,
      totalCobradoInquilinosValor: 750 * TARIFA_EXEMPLO,
      tarifaCelescVigente: TARIFA_EXEMPLO,
    });

    // consumo próprio = 1000 - 300 = 700
    expect(resultado.consumoProprioInstantaneoKwh).toBe(700);
    // total consumido = 700 + 200 = 900
    expect(resultado.totalConsumidoKwh).toBe(900);
    // área comum = 900 - 750 = 150
    expect(resultado.areaComumKwh).toBe(150);
    expect(resultado.areaComumValor).toBeCloseTo(150 * TARIFA_EXEMPLO, 2);
    expect(resultado.inconsistente).toBe(false);
  });

  it('resultado financeiro positivo: cobrado dos inquilinos supera o custo real de energia usada', () => {
    const resultado = calcularAuditoriaEnergiaSolar({
      energiaGeradaTotalKwh: 1000,
      energiaInjetadaKwh: 100,
      energiaConsumidaRedeKwh: 0,
      totalCobradoInquilinosKwh: 900,
      totalCobradoInquilinosValor: 900 * TARIFA_EXEMPLO + 50, // cobrado um pouco a mais
      tarifaCelescVigente: TARIFA_EXEMPLO,
    });

    // total consumido = (1000-100) + 0 = 900; valor da energia usada = 900 * tarifa
    expect(resultado.resultadoFinanceiroValor).toBeCloseTo(50, 2);
  });

  it('resultado financeiro negativo: administração absorveu parte do custo', () => {
    const resultado = calcularAuditoriaEnergiaSolar({
      energiaGeradaTotalKwh: 1000,
      energiaInjetadaKwh: 100,
      energiaConsumidaRedeKwh: 0,
      totalCobradoInquilinosKwh: 800,
      totalCobradoInquilinosValor: 800 * TARIFA_EXEMPLO, // não cobriu a área comum
      tarifaCelescVigente: TARIFA_EXEMPLO,
    });

    expect(resultado.resultadoFinanceiroValor).toBeLessThan(0);
  });

  it('sem injeção: toda a geração foi autoconsumida instantaneamente', () => {
    const resultado = calcularAuditoriaEnergiaSolar({
      energiaGeradaTotalKwh: 500,
      energiaInjetadaKwh: 0,
      energiaConsumidaRedeKwh: 100,
      totalCobradoInquilinosKwh: 550,
      totalCobradoInquilinosValor: 550 * TARIFA_EXEMPLO,
      tarifaCelescVigente: TARIFA_EXEMPLO,
    });

    expect(resultado.consumoProprioInstantaneoKwh).toBe(500);
    expect(resultado.totalConsumidoKwh).toBe(600);
    expect(resultado.areaComumKwh).toBe(50);
  });

  it('cobrado dos inquilinos excede o total consumido: sinaliza inconsistência, não devolve área comum negativa', () => {
    const resultado = calcularAuditoriaEnergiaSolar({
      energiaGeradaTotalKwh: 500,
      energiaInjetadaKwh: 0,
      energiaConsumidaRedeKwh: 0,
      totalCobradoInquilinosKwh: 600, // mais do que o prédio realmente consumiu — erro de leitura em algum lugar
      totalCobradoInquilinosValor: 600 * TARIFA_EXEMPLO,
      tarifaCelescVigente: TARIFA_EXEMPLO,
    });

    expect(resultado.inconsistente).toBe(true);
    expect(resultado.areaComumKwh).toBe(0);
  });

  it('rejeita energia injetada maior que a gerada', () => {
    expect(() =>
      calcularAuditoriaEnergiaSolar({
        energiaGeradaTotalKwh: 100,
        energiaInjetadaKwh: 150,
        energiaConsumidaRedeKwh: 0,
        totalCobradoInquilinosKwh: 50,
        totalCobradoInquilinosValor: 50 * TARIFA_EXEMPLO,
        tarifaCelescVigente: TARIFA_EXEMPLO,
      }),
    ).toThrow();
  });

  it('rejeita valores negativos de energia', () => {
    expect(() =>
      calcularAuditoriaEnergiaSolar({
        energiaGeradaTotalKwh: -10,
        energiaInjetadaKwh: 0,
        energiaConsumidaRedeKwh: 0,
        totalCobradoInquilinosKwh: 0,
        totalCobradoInquilinosValor: 0,
        tarifaCelescVigente: TARIFA_EXEMPLO,
      }),
    ).toThrow();
  });

  it('rejeita tarifa não positiva', () => {
    expect(() =>
      calcularAuditoriaEnergiaSolar({
        energiaGeradaTotalKwh: 100,
        energiaInjetadaKwh: 10,
        energiaConsumidaRedeKwh: 0,
        totalCobradoInquilinosKwh: 90,
        totalCobradoInquilinosValor: 90 * TARIFA_EXEMPLO,
        tarifaCelescVigente: 0,
      }),
    ).toThrow();
  });
});
