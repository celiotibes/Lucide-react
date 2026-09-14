import { describe, expect, it } from "vitest";
import { aplicarDescontoNegociado } from "./reajustes";

describe("aplicarDescontoNegociado", () => {
  it("aplica o percentual de desconto sobre a multa proporcional", () => {
    // Cenário real: contrato Kitnet 02 JP (29/08/2026) prevê 85% de desconto na multa
    // rescisória para saída antecipada avisada até 22/nov e desocupada até 22/dez.
    expect(aplicarDescontoNegociado(1000, 85)).toBeCloseTo(150, 6);
    expect(aplicarDescontoNegociado(1000, 80)).toBeCloseTo(200, 6);
  });

  it("desconto de 0% não altera a multa", () => {
    expect(aplicarDescontoNegociado(2345.67, 0)).toBeCloseTo(2345.67, 6);
  });

  it("desconto de 100% zera a multa", () => {
    expect(aplicarDescontoNegociado(2345.67, 100)).toBe(0);
  });

  it("nunca inverte o sinal nem satura abaixo de zero para percentuais > 100 (trata como 100%)", () => {
    expect(aplicarDescontoNegociado(1000, 150)).toBe(0);
  });

  it("ignora percentual negativo (trata como 0%, nunca aumenta a multa)", () => {
    expect(aplicarDescontoNegociado(1000, -20)).toBe(1000);
  });
});
