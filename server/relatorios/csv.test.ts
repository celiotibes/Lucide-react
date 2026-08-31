import { describe, expect, it } from 'vitest';
import { adicionarBOM, gerarCSV, type ColunaCSV } from './csv';

interface Linha {
  nome: string;
  valor: number;
  observacao: string | null;
}

const COLUNAS: ColunaCSV<Linha>[] = [
  { cabecalho: 'Nome', valor: (l) => l.nome },
  { cabecalho: 'Valor', valor: (l) => l.valor },
  { cabecalho: 'Observação', valor: (l) => l.observacao },
];

describe('gerarCSV', () => {
  it('gera cabeçalho e linhas com delimitador ; e decimal , por padrão (PT-BR)', () => {
    const csv = gerarCSV<Linha>([{ nome: 'Aluguel', valor: 1234.5, observacao: null }], COLUNAS);
    expect(csv).toBe('Nome;Valor;Observação\r\nAluguel;1234,50;');
  });

  it('escapa campos com o delimitador, aspas ou quebra de linha (RFC 4180)', () => {
    const csv = gerarCSV<Linha>(
      [{ nome: 'Silva; Costa', valor: 10, observacao: 'Linha 1\nLinha 2' }],
      COLUNAS,
    );
    expect(csv).toContain('"Silva; Costa"');
    expect(csv).toContain('"Linha 1\nLinha 2"');
  });

  it('escapa aspas duplas duplicando-as', () => {
    const csv = gerarCSV<Linha>([{ nome: 'Apto "Central"', valor: 1, observacao: null }], COLUNAS);
    expect(csv).toContain('"Apto ""Central"""');
  });

  it('suporta delimitador e separador decimal customizados (CSV internacional)', () => {
    const csv = gerarCSV<Linha>([{ nome: 'Aluguel', valor: 1234.5, observacao: null }], COLUNAS, {
      delimitador: ',',
      separadorDecimal: '.',
    });
    expect(csv).toBe('Nome,Valor,Observação\r\nAluguel,1234.50,');
  });

  it('lista vazia: só o cabeçalho', () => {
    const csv = gerarCSV<Linha>([], COLUNAS);
    expect(csv).toBe('Nome;Valor;Observação');
  });

  it('sempre arredonda para 2 casas decimais', () => {
    const csv = gerarCSV<Linha>([{ nome: 'x', valor: 10.005, observacao: null }], COLUNAS);
    expect(csv).toContain('10,01'); // toFixed(2) já lida com o arredondamento
  });
});

describe('adicionarBOM', () => {
  it('prefixa o caractere BOM UTF-8 (U+FEFF)', () => {
    const resultado = adicionarBOM('a;b');
    expect(resultado.charCodeAt(0)).toBe(0xfeff);
    expect(resultado.slice(1)).toBe('a;b');
  });
});
