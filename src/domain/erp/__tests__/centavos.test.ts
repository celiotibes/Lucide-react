import { describe, it, expect } from "vitest";
import { ratearEmCentavos } from "../centavos";
import { normalizarCentavos } from "../ledger";

describe("ratearEmCentavos (maior resto)", () => {
  it("R$ 1.000 em 3 partes iguais: 333,34 + 333,33 + 333,33 = 1.000,00", () => {
    const partes = ratearEmCentavos(1000, [1, 1, 1]);
    expect(partes).toEqual([333.34, 333.33, 333.33]);
    expect(Math.round(partes.reduce((a, b) => a + b, 0) * 100)).toBe(100000);
  });

  it("a soma sempre fecha, para totais e pesos variados", () => {
    for (const total of [0.01, 0.02, 99.99, 1234.57, 10000]) {
      for (const pesos of [[1, 1, 1], [33.3, 33.3, 33.4], [10, 20, 70], [1, 2, 3, 4, 5, 6, 7]]) {
        const partes = ratearEmCentavos(total, pesos);
        expect(Math.round(partes.reduce((a, b) => a + b, 0) * 100)).toBe(Math.round(total * 100));
        for (const p of partes) expect(Math.abs(p * 100 - Math.round(p * 100))).toBeLessThan(1e-6);
      }
    }
  });

  it("peso zero recebe zero e entrada inválida é recusada", () => {
    expect(ratearEmCentavos(100, [1, 0, 1])).toEqual([50, 0, 50]);
    expect(() => ratearEmCentavos(100, [0, 0])).toThrow();
    expect(() => ratearEmCentavos(100, [-1, 2])).toThrow();
  });
});

describe("normalizarCentavos", () => {
  it("absorve ruído de ponto flutuante e recusa fração de centavo", () => {
    expect(normalizarCentavos(0.1 + 0.2, "v")).toBe(0.3);
    expect(normalizarCentavos(1234.5, "v")).toBe(1234.5);
    expect(() => normalizarCentavos(333.3333, "v")).toThrow(/2 casas/);
    expect(() => normalizarCentavos(-1, "v")).toThrow(/inválido/);
    expect(() => normalizarCentavos(NaN, "v")).toThrow(/inválido/);
  });
});

import { arredondarCentavos } from "../centavos";
import { calcularEmprestimo } from "../apontamento-prestador";

describe("produtores de valores calculados lançam centavos exatos", () => {
  it("arredondarCentavos: depreciação 320.000 × 4% ÷ 12 = 1.066,67", () => {
    expect(arredondarCentavos((320000 * 0.04) / 12)).toBe(1066.67);
  });

  it("parcelas do empréstimo: principais em centavos e soma igual ao valor contratado", () => {
    const e = calcularEmprestimo("Fulano", 1000, 3, 2);
    expect(e.parcelas.map((p) => p.principal)).toEqual([333.34, 333.33, 333.33]);
    expect(Math.round(e.parcelas.reduce((a, p) => a + p.principal, 0) * 100)).toBe(100000);
  });
});
