import { describe, expect, it } from 'vitest';
import { calcularSplitPagamento } from './splitPagamento';

describe('calcularSplitPagamento', () => {
  it('divide um valor exato sem sobra (dois beneficiários, percentuais redondos)', () => {
    const resultado = calcularSplitPagamento(1000, [
      { beneficiarioId: 'A', percentual: 0.6 },
      { beneficiarioId: 'B', percentual: 0.4 },
    ]);
    expect(resultado.find((r) => r.beneficiarioId === 'A')?.valor).toBe(600);
    expect(resultado.find((r) => r.beneficiarioId === 'B')?.valor).toBe(400);
  });

  it('o clássico bug de 1/3: soma continua batendo com o total, sem perder centavo', () => {
    const resultado = calcularSplitPagamento(100, [
      { beneficiarioId: 'A', percentual: 1 / 3 },
      { beneficiarioId: 'B', percentual: 1 / 3 },
      { beneficiarioId: 'C', percentual: 1 / 3 },
    ]);
    const soma = resultado.reduce((acc, r) => acc + r.valor, 0);
    expect(Math.round(soma * 100) / 100).toBe(100);
    // cada um recebe 33.33 ou 33.34, nunca 33.33 nos três (perderia 1 centavo)
    const valores = resultado.map((r) => r.valor).sort();
    expect(valores).toEqual([33.33, 33.33, 33.34]);
  });

  it('beneficiário único com 100% recebe o valor integral', () => {
    const resultado = calcularSplitPagamento(1234.56, [{ beneficiarioId: 'A', percentual: 1 }]);
    expect(resultado).toEqual([{ beneficiarioId: 'A', valor: 1234.56 }]);
  });

  it('valor pequeno dividido entre mais gente do que centavos disponíveis', () => {
    // 3 centavos para 4 beneficiários: 3 recebem 1 centavo, 1 recebe 0 — mas
    // a soma tem que fechar em 0.03, não pode sobrar nem faltar.
    const resultado = calcularSplitPagamento(0.03, [
      { beneficiarioId: 'A', percentual: 0.25 },
      { beneficiarioId: 'B', percentual: 0.25 },
      { beneficiarioId: 'C', percentual: 0.25 },
      { beneficiarioId: 'D', percentual: 0.25 },
    ]);
    const soma = resultado.reduce((acc, r) => acc + r.valor, 0);
    expect(Math.round(soma * 100)).toBe(3);
  });

  it('rejeita quando os percentuais não somam 100%', () => {
    expect(() =>
      calcularSplitPagamento(1000, [
        { beneficiarioId: 'A', percentual: 0.5 },
        { beneficiarioId: 'B', percentual: 0.3 },
      ]),
    ).toThrow(/soma dos percentuais/);
  });

  it('rejeita lista vazia de participações', () => {
    expect(() => calcularSplitPagamento(1000, [])).toThrow(/pelo menos uma participação/);
  });

  it('rejeita percentual negativo', () => {
    expect(() =>
      calcularSplitPagamento(1000, [
        { beneficiarioId: 'A', percentual: 1.2 },
        { beneficiarioId: 'B', percentual: -0.2 },
      ]),
    ).toThrow(/negativo/);
  });

  it('stress test: 300 combinações aleatórias de split nunca perdem nem criam um centavo', () => {
    let seed = 42; // gerador determinístico para o teste ser reproduzível
    const proximoAleatorio = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let iteracao = 0; iteracao < 300; iteracao++) {
      const numBeneficiarios = 2 + Math.floor(proximoAleatorio() * 6); // 2 a 7 beneficiários
      const pesos = Array.from({ length: numBeneficiarios }, () => proximoAleatorio() + 0.01);
      const somaPesos = pesos.reduce((a, b) => a + b, 0);
      const percentuais = pesos.map((p) => p / somaPesos);

      // corrige o último para garantir soma exatamente 1 (evita ruído de ponto flutuante no teste)
      const somaSemUltimo = percentuais.slice(0, -1).reduce((a, b) => a + b, 0);
      percentuais[percentuais.length - 1] = 1 - somaSemUltimo;

      const valorTotal = Math.round(proximoAleatorio() * 1_000_000) / 100; // até R$10.000,00

      const participacoes = percentuais.map((percentual, i) => ({
        beneficiarioId: `B${i}`,
        percentual,
      }));

      const resultado = calcularSplitPagamento(valorTotal, participacoes);
      const somaCentavos = resultado.reduce((acc, r) => acc + Math.round(r.valor * 100), 0);
      const totalCentavos = Math.round(valorTotal * 100);

      expect(somaCentavos).toBe(totalCentavos);
      // nenhum beneficiário deveria ficar com valor negativo
      for (const r of resultado) {
        expect(r.valor).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
