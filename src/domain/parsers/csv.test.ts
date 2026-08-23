import { describe, expect, it } from "vitest";
import { analisarCsv } from "./csv";

describe("analisarCsv — normalização de valor", () => {
  it("formato brasileiro com milhar (Itaú/BB/Bradesco/Caixa): ponto é milhar, vírgula é decimal", () => {
    const csv = "Data;Valor;Descricao\n01/07/2026;1.234,56;PIX RECEBIDO\n02/07/2026;-987,65;TARIFA";
    const linhas = analisarCsv(csv);
    expect(linhas[0].valor).toBeCloseTo(1234.56, 2);
    expect(linhas[1].valor).toBeCloseTo(-987.65, 2);
  });

  it("regressão: formato Nubank (ponto é decimal, sem milhar) não pode ser multiplicado por 100", () => {
    // Bug real encontrado em auditoria: normalizarValor tratava TODO "." como separador de
    // milhar incondicionalmente, transformando "-50.00" (Nubank) em -5000 — corrompendo por
    // 100x qualquer valor importado desse formato, com efeito direto no DRE e no laudo pericial.
    const csv = "date,amount,title\n2026-07-01,-50.00,Uber\n2026-07-02,3000.00,Salario";
    const linhas = analisarCsv(csv);
    expect(linhas[0].valor).toBe(-50);
    expect(linhas[1].valor).toBe(3000);
  });

  it("valor inteiro sem separador nenhum permanece correto", () => {
    const csv = "Data;Valor;Descricao\n01/07/2026;500;PIX";
    const linhas = analisarCsv(csv);
    expect(linhas[0].valor).toBe(500);
  });
});
