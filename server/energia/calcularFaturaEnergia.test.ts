import { describe, expect, it } from 'vitest';
import { calcularFaturaEnergia } from './calcularFaturaEnergia';

const TARIFA_TE = 0.4;
const TARIFA_TUSD = 0.35;

describe('calcularFaturaEnergia', () => {
  it('consumo abaixo da franquia: fatura pela franquia mínima, não pelo consumo real', () => {
    const resultado = calcularFaturaEnergia({
      leituraAnteriorKwh: 1000,
      leituraAtualKwh: 1020, // 20 kWh consumidos
      franquiaKwh: 30,
      tarifaTePorKwh: TARIFA_TE,
      tarifaTusdPorKwh: TARIFA_TUSD,
    });
    expect(resultado.consumoKwh).toBe(20);
    expect(resultado.consumoFaturavelKwh).toBe(30); // franquia, não os 20 reais
    expect(resultado.valorEnergia).toBeCloseTo(30 * (TARIFA_TE + TARIFA_TUSD), 2);
  });

  it('consumo igual à franquia: fatura exatamente a franquia', () => {
    const resultado = calcularFaturaEnergia({
      leituraAnteriorKwh: 1000,
      leituraAtualKwh: 1030,
      franquiaKwh: 30,
      tarifaTePorKwh: TARIFA_TE,
      tarifaTusdPorKwh: TARIFA_TUSD,
    });
    expect(resultado.consumoFaturavelKwh).toBe(30);
  });

  it('consumo acima da franquia: fatura pelo consumo real', () => {
    const resultado = calcularFaturaEnergia({
      leituraAnteriorKwh: 1000,
      leituraAtualKwh: 1080, // 80 kWh
      franquiaKwh: 30,
      tarifaTePorKwh: TARIFA_TE,
      tarifaTusdPorKwh: TARIFA_TUSD,
    });
    expect(resultado.consumoFaturavelKwh).toBe(80);
  });

  it('franquia de 50 kWh (contrato novo) é respeitada quando informada', () => {
    const resultado = calcularFaturaEnergia({
      leituraAnteriorKwh: 500,
      leituraAtualKwh: 540, // 40 kWh, abaixo dos 50
      franquiaKwh: 50,
      tarifaTePorKwh: TARIFA_TE,
      tarifaTusdPorKwh: TARIFA_TUSD,
    });
    expect(resultado.consumoFaturavelKwh).toBe(50);
  });

  it('taxa administrativa de 25% é calculada sobre o valor de energia e discriminada', () => {
    const resultado = calcularFaturaEnergia({
      leituraAnteriorKwh: 0,
      leituraAtualKwh: 100,
      franquiaKwh: 30,
      tarifaTePorKwh: 0.5,
      tarifaTusdPorKwh: 0.5, // tarifa total R$1,00/kWh -> valorEnergia = 100
    });
    expect(resultado.valorEnergia).toBe(100);
    expect(resultado.valorTaxaAdministrativa).toBe(25);
    expect(resultado.valorTotal).toBe(125);
    expect(resultado.itens).toHaveLength(2);
    expect(resultado.itens[1].descricao).toMatch(/infraestrutura compartilhada/);
    // soma dos itens sempre bate com o total (transparência ao inquilino)
    const somaItens = resultado.itens.reduce((acc, i) => acc + i.valor, 0);
    expect(somaItens).toBeCloseTo(resultado.valorTotal, 2);
  });

  it('permite taxa administrativa customizada (override do padrão de 25%)', () => {
    const resultado = calcularFaturaEnergia({
      leituraAnteriorKwh: 0,
      leituraAtualKwh: 100,
      franquiaKwh: 30,
      tarifaTePorKwh: 0.5,
      tarifaTusdPorKwh: 0.5,
      taxaAdministrativaPct: 0,
    });
    expect(resultado.valorTaxaAdministrativa).toBe(0);
  });

  it('rejeita leitura atual menor que a anterior (medidor resetado/erro) em vez de faturar consumo negativo', () => {
    expect(() =>
      calcularFaturaEnergia({
        leituraAnteriorKwh: 1000,
        leituraAtualKwh: 900,
        franquiaKwh: 30,
        tarifaTePorKwh: TARIFA_TE,
        tarifaTusdPorKwh: TARIFA_TUSD,
      }),
    ).toThrow(/resetado ou erro/);
  });

  it('rejeita franquiaKwh zero ou negativa', () => {
    expect(() =>
      calcularFaturaEnergia({
        leituraAnteriorKwh: 0,
        leituraAtualKwh: 10,
        franquiaKwh: 0,
        tarifaTePorKwh: TARIFA_TE,
        tarifaTusdPorKwh: TARIFA_TUSD,
      }),
    ).toThrow();
  });
});
