import { describe, expect, it } from 'vitest';
import { FaturaCelescGDInvalidaError, parsearFaturaCelescGD } from './celescGD';

// Excerto real de uma fatura de Geração Distribuída da Celesc (Unidade
// Consumidora 313.198.011-71, Prof João Carlos Pottker 25, Florianópolis
// — a mesma "geradora" do Residencial João Pottker, docs/10), texto como
// extraído do PDF, competência 07/2026.
const TEXTO_FATURA_REAL = `
RESIDENCIAL - RESIDENCIAL - B1 Residencial - TRIFÁSICO
313.198.011-71
Cliente: 40848967
07/2026 17/08/2026 R$ 328,87
NOME: CELIO RIBAS MATZENBACHER TIBES
CPF/CNPJ: ***.402.781-**
PROF JOAO CARLOS POTTKER 25 -
SACO DOS LIMOES-FNS
ENDERECO:
CEP: 88000-000 CIDADE: FLORIANOPOLIS SC Grupo/Subgrupo Tensão:B/B1
03/06/2026 06/07/2026 33 05/08/2026
NOTA FISCAL Nº 097363620 SERIE:001 DATA EMISSAO: 06/07/2026
5496999 Energia Único 48.505 50.377 1,00000 0,00 1.872
5496999 Energia injetada Único 95.470 96.648 1,00000 0,00 1.178
TOTAL 328,87
`;

describe('parsearFaturaCelescGD', () => {
  it('extrai competência, vencimento, valor total e as duas grandezas de energia da fatura real', () => {
    const resultado = parsearFaturaCelescGD(TEXTO_FATURA_REAL);

    expect(resultado.competencia).toBe('2026-07-01');
    expect(resultado.vencimento).toBe('2026-08-17');
    expect(resultado.valorTotal).toBe(328.87);
    expect(resultado.energiaConsumidaRedeKwh).toBe(1872);
    expect(resultado.energiaInjetadaKwh).toBe(1178);
  });

  it('lança erro quando não encontra a linha de referência/vencimento/total', () => {
    expect(() => parsearFaturaCelescGD('texto qualquer sem os campos esperados')).toThrow(FaturaCelescGDInvalidaError);
  });

  it('lança erro quando não encontra a linha de Energia (consumo)', () => {
    const semEnergia = TEXTO_FATURA_REAL.replace(/5496999 Energia Único.*\n/, '');
    expect(() => parsearFaturaCelescGD(semEnergia)).toThrow(FaturaCelescGDInvalidaError);
  });

  it('lança erro quando não encontra a linha de Energia injetada', () => {
    const semInjetada = TEXTO_FATURA_REAL.replace(/5496999 Energia injetada.*\n/, '');
    expect(() => parsearFaturaCelescGD(semInjetada)).toThrow(FaturaCelescGDInvalidaError);
  });

  it('converte números no padrão brasileiro corretamente (milhar com ponto, decimal com vírgula)', () => {
    const comValorGrande = TEXTO_FATURA_REAL.replace('R$ 328,87', 'R$ 1.328,87');
    const resultado = parsearFaturaCelescGD(comValorGrande);
    expect(resultado.valorTotal).toBe(1328.87);
  });
});
