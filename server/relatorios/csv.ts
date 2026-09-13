// Serializador CSV genérico e puro — usado por qualquer relatório do
// sistema (docs/15-relatorios-exportaveis.md). Formato PT-BR por padrão
// (delimitador `;`, decimal `,`), porque é o que Excel PT-BR e a maioria
// dos sistemas contábeis brasileiros esperam ao importar — CSV com vírgula
// decimal e ponto-e-vírgula como separador de campo evita que o Excel
// interprete "1.234,56" como três campos.

export interface ColunaCSV<T> {
  cabecalho: string;
  valor: (linha: T) => string | number | null;
}

export interface OpcoesCSV {
  delimitador?: string;
  separadorDecimal?: ',' | '.';
}

export function gerarCSV<T>(linhas: T[], colunas: ColunaCSV<T>[], opcoes: OpcoesCSV = {}): string {
  const delimitador = opcoes.delimitador ?? ';';
  const separadorDecimal = opcoes.separadorDecimal ?? ',';

  const formatarCampo = (valor: string | number | null): string => {
    if (valor === null) return '';
    const texto = typeof valor === 'number' ? formatarNumero(valor, separadorDecimal) : valor;
    return escaparCampoCSV(texto, delimitador);
  };

  const linhaCabecalho = colunas.map((c) => escaparCampoCSV(c.cabecalho, delimitador)).join(delimitador);
  const linhasFormatadas = colunas.length === 0 ? [] : linhas.map((linha) => colunas.map((c) => formatarCampo(c.valor(linha))).join(delimitador));

  return [linhaCabecalho, ...linhasFormatadas].join('\r\n');
}

/** Prefixa o BOM UTF-8 — sem ele, Excel (mesmo em PT-BR) às vezes interpreta acentos como Latin-1. */
export function adicionarBOM(csv: string): string {
  return '﻿' + csv;
}

function formatarNumero(valor: number, separadorDecimal: ',' | '.'): string {
  const fixo = valor.toFixed(2);
  return separadorDecimal === ',' ? fixo.replace('.', ',') : fixo;
}

function escaparCampoCSV(texto: string, delimitador: string): string {
  const precisaEscapar = texto.includes(delimitador) || texto.includes('"') || texto.includes('\n') || texto.includes('\r');
  if (!precisaEscapar) return texto;
  return `"${texto.replace(/"/g, '""')}"`;
}
