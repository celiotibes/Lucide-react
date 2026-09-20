import { describe, expect, it } from "vitest";
import { avaliarQualidadeTexto } from "./qualidadeOcr";

describe("avaliarQualidadeTexto — critério de 'OCR ruim' (ver comentário do arquivo)", () => {
  it("texto limpo, com data/valor/CNPJ reconhecíveis, é considerado bom", () => {
    const texto = `
      BOLETO DE COBRANÇA
      CEDENTE: LIFE SPACE ESTACIONAMENTOS LTDA
      CNPJ: 18.071.719/0001-89
      Valor: R$ 242,15
      Vencimento: 07/09/2026
    `;
    const avaliacao = avaliarQualidadeTexto(texto);
    expect(avaliacao.ruim).toBe(false);
    expect(avaliacao.encontrouPadraoEsperado).toBe(true);
    expect(avaliacao.motivos).toHaveLength(0);
  });

  it("texto vazio/curto demais é reprovado (não há o que avaliar além do tamanho)", () => {
    const avaliacao = avaliarQualidadeTexto("R$ 10");
    expect(avaliacao.ruim).toBe(true);
    expect(avaliacao.pontuacao).toBe(0);
    expect(avaliacao.motivos[0]).toMatch(/curto demais/);
  });

  it("texto com alta proporção de caracteres fora do alfabeto esperado é reprovado", () => {
    // Simula o tipo de ruído que tesseract produz sobre uma imagem de baixa qualidade:
    // símbolos soltos e glifos não mapeados, sem nenhum padrão de documento reconhecível.
    const texto = "#@¤§¶†‡•∞≈≠¥£¢©®±×÷¬¦¨´`~^°µ¤§¶†‡•∞≈≠¥£¢©®±×÷¬¦¨´`~^°µ¤§¶†‡•∞≈≠¥£¢©®";
    const avaliacao = avaliarQualidadeTexto(texto);
    expect(avaliacao.ruim).toBe(true);
    expect(avaliacao.proporcaoCaracteresRuido).toBeGreaterThan(0.12);
    expect(avaliacao.motivos.some((m) => m.includes("fora do alfabeto esperado"))).toBe(true);
  });

  it("texto limpo mas sem nenhum padrão de data/valor/CNPJ esperado também é reprovado", () => {
    // Ruído baixo (é português legível), mas nenhum sinal do que um documento financeiro
    // deveria conter — o critério mais relevante dos três (ver comentário do arquivo).
    const texto = "Prezado cliente, segue em anexo o documento solicitado para sua análise e conferência.";
    const avaliacao = avaliarQualidadeTexto(texto);
    expect(avaliacao.encontrouPadraoEsperado).toBe(false);
    expect(avaliacao.ruim).toBe(true);
    expect(avaliacao.motivos.some((m) => m.includes("Nenhum padrão"))).toBe(true);
  });
});
