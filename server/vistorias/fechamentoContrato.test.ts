import { describe, expect, it } from 'vitest';
import { calcularFechamentoContrato } from './fechamentoContrato';

describe('calcularFechamentoContrato', () => {
  it('sem débitos, sem créditos, sem caução: saldo zero', () => {
    const resultado = calcularFechamentoContrato({ debitos: [], creditos: [], caucao: null });
    expect(resultado.totalDebitos).toBe(0);
    expect(resultado.totalCreditos).toBe(0);
    expect(resultado.saldoFinal).toBe(0);
    expect(resultado.caucaoValorAtualizado).toBeNull();
  });

  it('caução via índice Bacen supera os débitos: saldo positivo (a devolver)', () => {
    const resultado = calcularFechamentoContrato({
      debitos: [{ descricao: 'Pintura de parede riscada', valor: 300, origem: 'orcamento' }],
      creditos: [],
      caucao: { fonte: 'indice_bacen', valorBase: 2000, taxaMensal: 0.005, diasDecorridos: 30 },
    });
    expect(resultado.caucaoFonte).toBe('indice_bacen');
    expect(resultado.caucaoValorAtualizado).toBeCloseTo(2010, 2); // 2000 + 2000*0.005
    expect(resultado.totalCreditos).toBeCloseTo(2010, 2);
    expect(resultado.totalDebitos).toBe(300);
    expect(resultado.saldoFinal).toBeCloseTo(1710, 2);
    expect(resultado.itens.find((i) => i.origem === 'caucao')?.tipo).toBe('credito');
  });

  it('débitos superam a caução: saldo negativo (inquilino deve)', () => {
    const resultado = calcularFechamentoContrato({
      debitos: [
        { descricao: 'Reposição de piso — cláusula 8.2', valor: 4000, origem: 'previsto_em_contrato' },
        { descricao: 'Aluguel de junho em aberto', valor: 1200, origem: 'encargo_aberto' },
      ],
      creditos: [],
      caucao: { fonte: 'extrato_manual', valorAtualizado: 2100 },
    });
    expect(resultado.totalDebitos).toBe(5200);
    expect(resultado.totalCreditos).toBe(2100);
    expect(resultado.saldoFinal).toBe(-3100);
  });

  it('extrato manual prevalece sobre o valor base sem recalcular pelo índice', () => {
    const resultado = calcularFechamentoContrato({
      debitos: [],
      creditos: [],
      caucao: { fonte: 'extrato_manual', valorAtualizado: 2137.45 },
    });
    expect(resultado.caucaoValorAtualizado).toBe(2137.45);
    expect(resultado.caucaoIndicePeriodo).toBeNull();
  });

  it('adiantamento e saldo a favor entram como crédito adicional à caução', () => {
    const resultado = calcularFechamentoContrato({
      debitos: [{ descricao: 'Reparo elétrico', valor: 150, origem: 'estimativa' }],
      creditos: [{ descricao: 'Adiantamento de fevereiro', valor: 200, origem: 'adiantamento' }],
      caucao: { fonte: 'extrato_manual', valorAtualizado: 1000 },
    });
    expect(resultado.totalCreditos).toBe(1200);
    expect(resultado.totalDebitos).toBe(150);
    expect(resultado.saldoFinal).toBe(1050);
  });

  it('rejeita débito com valor zero ou negativo', () => {
    expect(() =>
      calcularFechamentoContrato({
        debitos: [{ descricao: 'inválido', valor: 0, origem: 'multa' }],
        creditos: [],
        caucao: null,
      }),
    ).toThrow();
    expect(() =>
      calcularFechamentoContrato({
        debitos: [{ descricao: 'inválido', valor: -10, origem: 'multa' }],
        creditos: [],
        caucao: null,
      }),
    ).toThrow();
  });

  it('rejeita crédito com valor zero ou negativo', () => {
    expect(() =>
      calcularFechamentoContrato({
        debitos: [],
        creditos: [{ descricao: 'inválido', valor: 0, origem: 'adiantamento' }],
        caucao: null,
      }),
    ).toThrow();
  });

  it('cada item de resultado é compatível com a constraint tipo/origem da migração', () => {
    const origensValidasPorTipo: Record<'debito' | 'credito', string[]> = {
      debito: ['previsto_em_contrato', 'orcamento', 'estimativa', 'encargo_aberto', 'multa'],
      credito: ['caucao', 'adiantamento', 'saldo_a_favor'],
    };
    const resultado = calcularFechamentoContrato({
      debitos: [
        { descricao: 'a', valor: 10, origem: 'previsto_em_contrato' },
        { descricao: 'b', valor: 20, origem: 'multa' },
      ],
      creditos: [{ descricao: 'c', valor: 30, origem: 'saldo_a_favor' }],
      caucao: { fonte: 'extrato_manual', valorAtualizado: 500 },
    });
    for (const item of resultado.itens) {
      expect(origensValidasPorTipo[item.tipo]).toContain(item.origem);
    }
  });
});
