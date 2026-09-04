import { describe, expect, it } from "vitest";
import { gerarXlsxConciliacao, type LinhaConciliacao } from "./conciliacaoBancaria";

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
});
