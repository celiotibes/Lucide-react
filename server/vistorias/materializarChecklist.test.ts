import { describe, expect, it } from 'vitest';
import { materializarChecklist } from './materializarChecklist';

describe('materializarChecklist', () => {
  it('converte estrutura de template em ambientes/itens ordenados', () => {
    const resultado = materializarChecklist([
      { ambiente: 'Cozinha', itens: [{ nome: 'Piso' }, { nome: 'Pia' }] },
      { ambiente: 'Banheiro', itens: [{ nome: 'Vaso sanitário' }] },
    ]);

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toEqual({
      nome: 'Cozinha',
      ordem: 0,
      itens: [
        { nome: 'Piso', ordem: 0 },
        { nome: 'Pia', ordem: 1 },
      ],
    });
    expect(resultado[1].nome).toBe('Banheiro');
    expect(resultado[1].ordem).toBe(1);
  });

  it('rejeita estrutura vazia', () => {
    expect(() => materializarChecklist([])).toThrow();
  });

  it('rejeita ambiente sem itens', () => {
    expect(() => materializarChecklist([{ ambiente: 'Sala', itens: [] }])).toThrow();
  });

  it('rejeita ambiente sem nome', () => {
    expect(() => materializarChecklist([{ ambiente: '', itens: [{ nome: 'Piso' }] }])).toThrow();
  });

  it('rejeita item sem nome', () => {
    expect(() => materializarChecklist([{ ambiente: 'Sala', itens: [{ nome: '' }] }])).toThrow();
  });
});
