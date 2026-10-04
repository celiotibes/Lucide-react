import { describe, expect, it, vi } from "vitest";
import JsPdf from "jspdf";
import { Escritor, MARGEM, LARGURA_UTIL, sanitizarTextoPdf } from "./escritorPdf";

function novoEscritor() {
  const doc = new JsPdf({ unit: "mm", format: "a4" });
  return { doc, w: new Escritor(doc) };
}

describe("sanitizarTextoPdf", () => {
  it("mantém texto comum inalterado", () => {
    expect(sanitizarTextoPdf("Aluguel Kitnet 302 — R$ 1.000,00")).toBe("Aluguel Kitnet 302 — R$ 1.000,00");
  });

  it("substitui variantes Unicode de hífen/menos por hífen ASCII", () => {
    // U+2212 MINUS SIGN, U+2010 HYPHEN, U+2011 NON-BREAKING HYPHEN, U+2012 FIGURE DASH, U+2015 HORIZONTAL BAR
    expect(sanitizarTextoPdf("Saldo: −350,00")).toBe("Saldo: -350,00");
    expect(sanitizarTextoPdf("‐‑‒―")).toBe("----");
  });

  it("não afeta travessão (—) nem meia-risca (–), cobertos nativamente pelo WinAnsiEncoding", () => {
    expect(sanitizarTextoPdf("Imóvel A — matrícula 123")).toBe("Imóvel A — matrícula 123");
    expect(sanitizarTextoPdf("10–20")).toBe("10–20");
  });

   
  it("normaliza NBSP (U+00A0) para espaço ASCII comum (bug real: a regex antiga não fazia nada)", () => {
    // eslint-disable-next-line no-irregular-whitespace
    const entrada = `Pagamento PIX recebido`;
    const saida = sanitizarTextoPdf(entrada);
     
    expect(saida).toBe("Pagamento PIX recebido");
    // confere que o resultado usa de fato o espaço ASCII comum (0x20), não NBSP (0xA0)
    expect(saida.includes(" ")).toBe(false);
    expect(saida.charCodeAt("Pagamento".length)).toBe(0x20);
  });

  it("string vazia permanece vazia", () => {
    expect(sanitizarTextoPdf("")).toBe("");
  });
});

describe("MARGEM / LARGURA_UTIL", () => {
  it("largura útil é a página A4 (210mm) menos as duas margens", () => {
    expect(LARGURA_UTIL).toBe(210 - MARGEM * 2);
  });
});

describe("Escritor", () => {
  it("titulo() escreve na posição atual e avança y em 8", () => {
    const { doc, w } = novoEscritor();
    const spy = vi.spyOn(doc, "text");
    const yInicial = w.y;
    w.titulo("Laudo Pericial");
    expect(spy).toHaveBeenCalledWith("Laudo Pericial", MARGEM, yInicial);
    expect(w.y).toBe(yInicial + 8);
  });

  it("secao() avança y em 6.5", () => {
    const { w } = novoEscritor();
    const yInicial = w.y;
    w.secao("1. Metodologia");
    expect(w.y).toBeCloseTo(yInicial + 6.5, 6);
  });

  it("espaco() avança y pelo valor informado, com 4 como padrão", () => {
    const { w } = novoEscritor();
    const yInicial = w.y;
    w.espaco();
    expect(w.y).toBe(yInicial + 4);
    w.espaco(10);
    expect(w.y).toBe(yInicial + 14);
  });

  it("paragrafo() quebra texto longo em múltiplas linhas e avança y de acordo", () => {
    const { doc, w } = novoEscritor();
    const spy = vi.spyOn(doc, "text");
    const textoLongo =
      "Este é um parágrafo deliberadamente longo, escrito para forçar a quebra automática de " +
      "linha dentro da largura útil da página A4, exercitando splitTextToSize() de jsPDF e o " +
      "incremento de y linha a linha dentro de Escritor.paragrafo().";
    const yInicial = w.y;
    w.paragrafo(textoLongo);
    expect(spy.mock.calls.length).toBeGreaterThan(1);
    // cada linha avança 4.6 + 2 de respiro ao final
    expect(w.y).toBeCloseTo(yInicial + spy.mock.calls.length * 4.6 + 2, 6);
  });

  it("paragrafo() sanitiza o texto antes de desenhar (hífen Unicode -> ASCII)", () => {
    const { doc, w } = novoEscritor();
    const spy = vi.spyOn(doc, "text");
    w.paragrafo("Resultado: −100,00");
    expect(spy.mock.calls[0][0]).toBe("Resultado: -100,00");
  });

  it("linhaTabela() posiciona cada coluna lado a lado, deslocando x pela largura anterior", () => {
    const { doc, w } = novoEscritor();
    const spy = vi.spyOn(doc, "text");
    const yInicial = w.y;
    w.linhaTabela(["Código", "Descrição", "Valor"], [20, 90, 45]);
    expect(spy).toHaveBeenNthCalledWith(1, "Código", MARGEM, yInicial);
    expect(spy).toHaveBeenNthCalledWith(2, "Descrição", MARGEM + 20, yInicial);
    expect(spy).toHaveBeenNthCalledWith(3, "Valor", MARGEM + 20 + 90, yInicial);
    expect(w.y).toBe(yInicial + 5);
  });

  it("linhaTabela() trunca texto que não cabe na largura da coluna, terminando em '…'", () => {
    const { doc, w } = novoEscritor();
    const spy = vi.spyOn(doc, "text");
    const colunaEstreitaMm = 12;
    const textoLongo = "Descrição bancária crua e comprida demais para a coluna";
    w.linhaTabela([textoLongo], [colunaEstreitaMm]);
    const textoDesenhado = String(spy.mock.calls[0][0]);
    expect(textoDesenhado.endsWith("…")).toBe(true);
    expect(textoDesenhado.length).toBeLessThan(textoLongo.length);
    // o texto truncado (sem a elipse) deve realmente caber na largura disponível
    expect(doc.getTextWidth(textoDesenhado)).toBeLessThanOrEqual(colunaEstreitaMm);
  });

  it("linhaTabela() não trunca texto que já cabe na coluna", () => {
    const { doc, w } = novoEscritor();
    const spy = vi.spyOn(doc, "text");
    w.linhaTabela(["OK"], [100]);
    expect(spy.mock.calls[0][0]).toBe("OK");
  });

  it("linhaTabela() com negrito=true usa fonte 'bold' (cabeçalho de tabela)", () => {
    const { doc, w } = novoEscritor();
    const spySetFont = vi.spyOn(doc, "setFont");
    w.linhaTabela(["Cabeçalho"], [100], true);
    expect(spySetFont).toHaveBeenCalledWith("helvetica", "bold");
  });

  it("quebra de página automática: titulo()/secao()/linhaTabela() repetidos estouram a página A4 e avançam para a próxima", () => {
    const { doc, w } = novoEscritor();
    expect(doc.getNumberOfPages()).toBe(1);
    // 297mm de altura, margem 18 de cada lado — cada secao() ocupa ~9mm reservados antes de
    // desenhar; repetir até estourar força addPage() dentro de quebrarPaginaSeNecessario().
    for (let i = 0; i < 40; i++) w.secao(`Seção ${i}`);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("após quebrar de página, y volta para MARGEM (topo da nova página)", () => {
    const { doc, w } = novoEscritor();
    for (let i = 0; i < 40; i++) w.secao(`Seção ${i}`);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    // y nunca deve exceder o limite inferior útil (297 - MARGEM) por mais de uma linha de
    // margem de erro — a última chamada deve ter respeitado o reset ao estourar.
    expect(w.y).toBeLessThanOrEqual(297 - MARGEM + 0.001);
  });
});
