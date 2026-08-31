import { describe, expect, it } from 'vitest';
import { calcularReajuste, resolverIndiceContrato } from './calcularReajuste';

describe('resolverIndiceContrato', () => {
  it('usa o índice do contrato quando definido', () => {
    expect(resolverIndiceContrato('IGPM', 'IPCA')).toBe('IGPM');
  });

  it('cai para o padrão do sistema quando o contrato não define índice', () => {
    expect(resolverIndiceContrato(null, 'IPCA')).toBe('IPCA');
  });
});

describe('calcularReajuste', () => {
  it('calcula o novo valor aplicando o percentual acumulado', () => {
    const resultado = calcularReajuste({ valorAtual: 1500, indice: 'IPCA', percentualAcumulado12m: 0.045 });
    expect(resultado.disponivel).toBe(true);
    expect(resultado.valorNovo).toBe(1567.5);
    expect(resultado.percentual).toBe(0.045);
  });

  it('arredonda para duas casas decimais', () => {
    const resultado = calcularReajuste({ valorAtual: 999.99, indice: 'IGPM', percentualAcumulado12m: 0.0333 });
    expect(resultado.valorNovo).toBe(1033.29);
  });

  it('devolve disponivel=false sem inventar valor quando não há percentual cadastrado', () => {
    const resultado = calcularReajuste({ valorAtual: 1500, indice: 'IPCA', percentualAcumulado12m: null });
    expect(resultado.disponivel).toBe(false);
    expect(resultado.valorNovo).toBeUndefined();
    expect(resultado.motivoIndisponivel).toContain('IPCA');
  });

  it('lança erro para valorAtual não positivo', () => {
    expect(() => calcularReajuste({ valorAtual: 0, indice: 'IPCA', percentualAcumulado12m: 0.05 })).toThrow();
  });
});
