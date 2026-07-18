import { describe, expect, it } from 'vitest';
import { compararVistorias } from './compararVistorias';

describe('compararVistorias', () => {
  it('sem mudança de estado: nenhuma divergência', () => {
    const entrada = [{ itemChecklistId: 'i1', estado: 'bom', observacao: null }];
    const saida = [{ itemChecklistId: 'i1', estado: 'bom', observacao: 'confirmado na saída' }];
    const resultado = compararVistorias(entrada, saida);
    expect(resultado.divergencias).toHaveLength(0);
    expect(resultado.itensComparados).toBe(1);
  });

  it('estado piorou: gera divergência', () => {
    const entrada = [{ itemChecklistId: 'i1', estado: 'novo', observacao: null }];
    const saida = [{ itemChecklistId: 'i1', estado: 'danificado', observacao: 'risco profundo' }];
    const resultado = compararVistorias(entrada, saida);
    expect(resultado.divergencias).toEqual([
      {
        itemChecklistId: 'i1',
        estadoAnterior: 'novo',
        estadoAtual: 'danificado',
        observacaoAnterior: null,
        observacaoAtual: 'risco profundo',
      },
    ]);
  });

  it('item existia na entrada mas não foi vistoriado na saída: ainda assim compara (estado nulo x anterior)', () => {
    const entrada = [{ itemChecklistId: 'i1', estado: 'bom', observacao: null }];
    const saida: typeof entrada = [];
    const resultado = compararVistorias(entrada, saida);
    expect(resultado.divergencias[0].estadoAtual).toBeNull();
  });

  it('item novo só apareceu na saída (ex.: dano não catalogado na entrada)', () => {
    const entrada: { itemChecklistId: string; estado: string | null; observacao: string | null }[] = [];
    const saida = [{ itemChecklistId: 'i2', estado: 'danificado', observacao: 'buraco na parede' }];
    const resultado = compararVistorias(entrada, saida);
    expect(resultado.divergencias[0].estadoAnterior).toBeNull();
    expect(resultado.divergencias[0].estadoAtual).toBe('danificado');
  });

  it('múltiplos itens: só reporta os que de fato divergem', () => {
    const entrada = [
      { itemChecklistId: 'i1', estado: 'bom', observacao: null },
      { itemChecklistId: 'i2', estado: 'novo', observacao: null },
    ];
    const saida = [
      { itemChecklistId: 'i1', estado: 'bom', observacao: null },
      { itemChecklistId: 'i2', estado: 'regular', observacao: 'desgaste leve' },
    ];
    const resultado = compararVistorias(entrada, saida);
    expect(resultado.itensComparados).toBe(2);
    expect(resultado.divergencias).toHaveLength(1);
    expect(resultado.divergencias[0].itemChecklistId).toBe('i2');
  });
});
