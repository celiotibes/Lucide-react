import { describe, it, expect } from "vitest";
import { gerarTokenSessao, tokenTemAssinaturaValida } from "../token";

describe("token.ts (token de sessão assinado)", () => {
  it("a freshly generated token has a valid signature", () => {
    const token = gerarTokenSessao();
    expect(tokenTemAssinaturaValida(token)).toBe(true);
  });

  it("generates a different token each time", () => {
    expect(gerarTokenSessao()).not.toBe(gerarTokenSessao());
  });

  it("rejects a token with a tampered signature", () => {
    const token = gerarTokenSessao();
    const [aleatorio] = token.split(".");
    const forjado = `${aleatorio}.${"a".repeat(64)}`;
    expect(tokenTemAssinaturaValida(forjado)).toBe(false);
  });

  it("rejects a token with a tampered random part (signature no longer matches)", () => {
    const token = gerarTokenSessao();
    const [, assinatura] = token.split(".");
    const forjado = `${"b".repeat(64)}.${assinatura}`;
    expect(tokenTemAssinaturaValida(forjado)).toBe(false);
  });

  it("rejects malformed tokens without throwing", () => {
    expect(tokenTemAssinaturaValida("")).toBe(false);
    expect(tokenTemAssinaturaValida("sem-ponto")).toBe(false);
    expect(tokenTemAssinaturaValida("a.b.c")).toBe(false);
    expect(tokenTemAssinaturaValida("token_antigo_math_random")).toBe(false);
  });
});
