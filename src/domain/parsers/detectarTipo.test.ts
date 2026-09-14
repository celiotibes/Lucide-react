import { describe, expect, it } from "vitest";
import { contarLinhasComData, avisoExtracaoPdfVazia } from "./detectarTipo";

describe("contarLinhasComData", () => {
  it("conta linhas com data no formato DD/MM ou DD/MM/AAAA", () => {
    expect(
      contarLinhasComData(["05/01/2026 PIX RECEBIDO 1.500,00", "linha sem data nenhuma", "10/02 UBER *TRIP 45,90 D"]),
    ).toBe(2);
  });

  it("lista vazia conta 0", () => {
    expect(contarLinhasComData([])).toBe(0);
  });
});

describe("avisoExtracaoPdfVazia", () => {
  it("sem aviso quando pelo menos uma transação foi extraída (extração funcionou)", () => {
    expect(avisoExtracaoPdfVazia("extrato", 5, 10)).toEqual([]);
  });

  it("sem aviso quando há poucas linhas com data (PDF genuinamente sem muito conteúdo — não é sinal de layout não reconhecido)", () => {
    expect(avisoExtracaoPdfVazia("extrato", 0, 2)).toEqual([]);
  });

  it("aviso quando o PDF tem linhas com data de sobra mas nenhuma transação foi reconhecida — achado real: layout de banco diferente do esperado", () => {
    const avisos = avisoExtracaoPdfVazia("extrato", 0, 15);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("15 linha(s) com data");
    expect(avisos[0]).toContain("extrato");
    expect(avisos[0]).not.toBe(""); // nunca finge sucesso silenciosamente
  });

  it("rótulo do aviso muda entre 'extrato' e 'fatura' conforme o tipo de documento", () => {
    const avisoExtrato = avisoExtracaoPdfVazia("extrato", 0, 10)[0];
    const avisoFatura = avisoExtracaoPdfVazia("fatura", 0, 10)[0];
    expect(avisoExtrato).toContain("extrato");
    expect(avisoFatura).toContain("fatura");
  });
});
