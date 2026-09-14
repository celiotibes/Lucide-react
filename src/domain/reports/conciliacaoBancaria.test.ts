import { describe, expect, it } from "vitest";
import { gerarCsvConciliacao, gerarXlsxConciliacao, type LinhaConciliacao } from "./conciliacaoBancaria";

describe("gerarXlsxConciliacao", () => {
  it("gera uma tabela HTML com MIME Excel, valores numéricos marcados com x:num e texto escapado", () => {
    const linhas: LinhaConciliacao[] = [
      { data: "2026-03-01", descricao: "PIX <teste> & \"aluguel\"", valor: 1234.56, categoria: "1.1.01 · Aluguéis", imovel: "Kitnet 1", classificacao: "Negócio", origem: "manual" },
    ];
    const html = gerarXlsxConciliacao(linhas);

    expect(html).toContain("<table>");
    expect(html).toContain('x:num="1234.56"');
    expect(html).toContain("1234,56"); // exibição em vírgula decimal (padrão BR), mesmo valor do CSV
    // Caracteres HTML perigosos/especiais escapados, não injetados crus na tabela.
    expect(html).not.toContain("<teste>");
    expect(html).toContain("&lt;teste&gt;");
  });

  it("não quebra com lista vazia", () => {
    const html = gerarXlsxConciliacao([]);
    expect(html).toContain("<tbody></tbody>");
  });

  it("neutraliza descrição que começa com gatilho de fórmula (injeção CSV/Excel)", () => {
    const linhas: LinhaConciliacao[] = [
      { data: "2026-03-01", descricao: "=cmd|'/c calc'!A1", valor: 100, categoria: "+HYPERLINK(\"http://x\")", imovel: "-1+1", classificacao: "Negócio", origem: "manual" },
    ];
    const html = gerarXlsxConciliacao(linhas);
    // O texto original nunca aparece com o caractere de gatilho como primeiro caractere da célula —
    // sempre prefixado por apóstrofo antes do escape HTML, forçando interpretação como texto.
    expect(html).toContain("'=cmd|'/c calc'!A1");
    expect(html).not.toMatch(/<td>=cmd/);
    expect(html).toContain("'+HYPERLINK");
    expect(html).not.toMatch(/<td>\+HYPERLINK/);
    expect(html).toContain("'-1+1");
    expect(html).not.toMatch(/<td>-1\+1/);
  });
});

describe("gerarCsvConciliacao", () => {
  it("escapa aspas e separa colunas com ponto e vírgula", () => {
    const linhas: LinhaConciliacao[] = [
      { data: "2026-03-01", descricao: 'PIX "aluguel"', valor: 1234.56, categoria: "1.1.01 · Aluguéis", imovel: "Kitnet 1", classificacao: "Negócio", origem: "manual" },
    ];
    const csv = gerarCsvConciliacao(linhas);
    expect(csv).toContain('"PIX ""aluguel"""');
    expect(csv.split("\n")).toHaveLength(2); // cabeçalho + 1 linha
  });

  it("neutraliza campos que começam com =, +, - ou @ para não virarem fórmula ao abrir no Excel", () => {
    const linhas: LinhaConciliacao[] = [
      { data: "2026-03-01", descricao: "=SOMA(A1:A9)", valor: 100, categoria: "@import()", imovel: "Kitnet 1", classificacao: "Negócio", origem: "manual" },
    ];
    const csv = gerarCsvConciliacao(linhas);
    // O campo escapado deve ser "'=SOMA..." (apóstrofo antes do gatilho), nunca "=SOMA..." cru,
    // que o Excel/LibreOffice/Google Sheets interpretariam como fórmula ao abrir o arquivo.
    expect(csv).toContain('"\'=SOMA(A1:A9)"');
    expect(csv).not.toContain('"=SOMA(A1:A9)"');
    expect(csv).toContain('"\'@import()"');
    expect(csv).not.toContain('"@import()"');
  });
});
