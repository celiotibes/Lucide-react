import { describe, expect, it } from 'vitest';
import { calcularPatrimonioLiquidoConsolidado, calcularPatrimonioLiquidoImovel } from './patrimonioLiquido';

describe('calcularPatrimonioLiquidoImovel', () => {
  it('patrimônio líquido = valor de avaliação − saldo devedor total', () => {
    const resultado = calcularPatrimonioLiquidoImovel({
      imovelId: 'imovel-1',
      valorAvaliacao: 500000,
      financiamentosAtivos: [{ valorParcela: 1800, saldoDevedor: 120000 }],
    });
    expect(resultado.patrimonioLiquido).toBe(380000);
    expect(resultado.saldoDevedorTotal).toBe(120000);
    expect(resultado.despesaFixaMensal).toBe(1800);
  });

  it('soma múltiplos financiamentos do mesmo imóvel (quitado um, contratado outro, ambos ativos por período)', () => {
    const resultado = calcularPatrimonioLiquidoImovel({
      imovelId: 'imovel-1',
      valorAvaliacao: 600000,
      financiamentosAtivos: [
        { valorParcela: 1200, saldoDevedor: 80000 },
        { valorParcela: 900, saldoDevedor: 40000 },
      ],
    });
    expect(resultado.saldoDevedorTotal).toBe(120000);
    expect(resultado.despesaFixaMensal).toBe(2100);
    expect(resultado.patrimonioLiquido).toBe(480000);
  });

  it('sem valor de avaliação: patrimônio líquido é null, não estimado', () => {
    const resultado = calcularPatrimonioLiquidoImovel({
      imovelId: 'imovel-1',
      valorAvaliacao: null,
      financiamentosAtivos: [{ valorParcela: 1800, saldoDevedor: 120000 }],
    });
    expect(resultado.patrimonioLiquido).toBeNull();
    expect(resultado.despesaFixaMensal).toBe(1800);
  });

  it('sem financiamento ativo: patrimônio líquido é o valor de avaliação integral', () => {
    const resultado = calcularPatrimonioLiquidoImovel({
      imovelId: 'imovel-1',
      valorAvaliacao: 300000,
      financiamentosAtivos: [],
    });
    expect(resultado.patrimonioLiquido).toBe(300000);
    expect(resultado.despesaFixaMensal).toBe(0);
  });

  it('financiamento sem saldo devedor informado (ainda não preenchido): conta como zero no saldo, mas a parcela conta na despesa fixa', () => {
    const resultado = calcularPatrimonioLiquidoImovel({
      imovelId: 'imovel-1',
      valorAvaliacao: 300000,
      financiamentosAtivos: [{ valorParcela: 2290, saldoDevedor: null }],
    });
    expect(resultado.saldoDevedorTotal).toBe(0);
    expect(resultado.despesaFixaMensal).toBe(2290);
    expect(resultado.patrimonioLiquido).toBe(300000);
  });
});

describe('calcularPatrimonioLiquidoConsolidado', () => {
  it('soma só os imóveis com avaliação cadastrada, mas conta quantos ainda não têm', () => {
    const resultado = calcularPatrimonioLiquidoConsolidado([
      { imovelId: 'a', valorAvaliacao: 500000, financiamentosAtivos: [{ valorParcela: 1800, saldoDevedor: 120000 }] },
      { imovelId: 'b', valorAvaliacao: null, financiamentosAtivos: [{ valorParcela: 2290, saldoDevedor: null }] },
      { imovelId: 'c', valorAvaliacao: 300000, financiamentosAtivos: [] },
    ]);

    expect(resultado.patrimonioLiquidoConsolidado).toBe(380000 + 300000);
    expect(resultado.imoveisSemAvaliacao).toBe(1);
    expect(resultado.despesaFixaMensalTotal).toBe(1800 + 2290);
    expect(resultado.imoveis).toHaveLength(3);
  });

  it('lista vazia: consolidado zerado, sem erro', () => {
    const resultado = calcularPatrimonioLiquidoConsolidado([]);
    expect(resultado.patrimonioLiquidoConsolidado).toBe(0);
    expect(resultado.imoveisSemAvaliacao).toBe(0);
    expect(resultado.despesaFixaMensalTotal).toBe(0);
  });
});
