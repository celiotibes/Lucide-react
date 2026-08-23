import type { default as jsPDF } from "jspdf";

/** Substitui variantes Unicode de hífen/menos (ex: MINUS SIGN "−" U+2212) por hífen ASCII
 * antes de desenhar no PDF. A fonte padrão helvetica do jsPDF usa WinAnsiEncoding, que
 * cobre bem acentuação portuguesa e até travessão/aspas curvas (—, –, ", ") — mas não
 * esses sinais de menos matemáticos, que quebram o kerning e renderizam letra por letra
 * (bug real encontrado e corrigido nesta seção). Aplicado a TODO texto que passa por
 * paragrafo()/linhaTabela(), não só às strings fixas — texto dinâmico (nome de
 * locatário, descrição bancária crua do OFX) pode conter o mesmo caractere. */
export function sanitizarTextoPdf(texto: string): string {
  return texto.replace(/[−‐‑‒―]/g, "-").replace(/ /g, " ");
}

export const MARGEM = 18;
export const LARGURA_UTIL = 210 - MARGEM * 2;

/** Escritor de PDF de uso geral (título/seção/parágrafo/tabela com quebra de página
 * automática) — compartilhado entre gerarLaudoPdf() e gerarRadPdf() para não duplicar o
 * boilerplate do jsPDF nem a correção de hífen Unicode acima. */
export class Escritor {
  doc: jsPDF;
  y = MARGEM;

  constructor(doc: jsPDF) {
    this.doc = doc;
  }

  private quebrarPaginaSeNecessario(alturaLinha: number) {
    if (this.y + alturaLinha > 297 - MARGEM) {
      this.doc.addPage();
      this.y = MARGEM;
    }
  }

  titulo(texto: string) {
    this.quebrarPaginaSeNecessario(10);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(15);
    this.doc.text(texto, MARGEM, this.y);
    this.y += 8;
  }

  secao(texto: string) {
    this.quebrarPaginaSeNecessario(9);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11.5);
    this.doc.text(texto, MARGEM, this.y);
    this.y += 6.5;
  }

  paragrafo(texto: string) {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9.5);
    const linhas = this.doc.splitTextToSize(sanitizarTextoPdf(texto), LARGURA_UTIL);
    for (const linha of linhas) {
      this.quebrarPaginaSeNecessario(5);
      this.doc.text(linha, MARGEM, this.y);
      this.y += 4.6;
    }
    this.y += 2;
  }

  /** Corta texto que estouraria a largura da coluna, medindo a largura real no jsPDF
   * (fonte/tamanho já ajustados por quem chama) — antes o corte era só num ponto do
   * arquivo, com um limite de caracteres chutado; qualquer outra coluna com texto longo
   * (descrição bancária crua, nome de locatário) colava visualmente na coluna seguinte. */
  private truncarParaLargura(texto: string, larguraMm: number): string {
    const larguraDisponivel = larguraMm - 1;
    if (this.doc.getTextWidth(texto) <= larguraDisponivel) return texto;
    let cortado = texto;
    while (cortado.length > 1 && this.doc.getTextWidth(`${cortado}…`) > larguraDisponivel) {
      cortado = cortado.slice(0, -1);
    }
    return `${cortado}…`;
  }

  linhaTabela(colunas: string[], larguras: number[], negrito = false) {
    this.quebrarPaginaSeNecessario(5.5);
    this.doc.setFont("helvetica", negrito ? "bold" : "normal");
    this.doc.setFontSize(9);
    let x = MARGEM;
    colunas.forEach((coluna, indice) => {
      this.doc.text(this.truncarParaLargura(sanitizarTextoPdf(coluna), larguras[indice]), x, this.y);
      x += larguras[indice];
    });
    this.y += 5;
  }

  espaco(altura = 4) {
    this.y += altura;
  }
}
