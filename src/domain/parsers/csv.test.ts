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

describe("analisarCsv — fitid sintético não colide entre transações reais idênticas", () => {
  it("duas linhas com mesma data/valor/descrição geram fitid distinto (não são a mesma transação)", () => {
    // Achado de auditoria adversarial: sem contador de ocorrência, dois PIX idênticos de
    // R$50,00 "ALUGUEL" no mesmo dia colidiam no mesmo fitid — o segundo era descartado pelo
    // INSERT OR IGNORE como se fosse duplicata do primeiro, mesmo numa única importação real.
    const csv = "Data;Valor;Descricao\n01/07/2026;50,00;ALUGUEL\n01/07/2026;50,00;ALUGUEL";
    const linhas = analisarCsv(csv);
    expect(linhas).toHaveLength(2);
    expect(linhas[0].fitid).not.toBe(linhas[1].fitid);
  });

  it("reimportar o mesmo CSV produz os mesmos fitids na mesma ordem (dedup continua funcionando)", () => {
    const csv = "Data;Valor;Descricao\n01/07/2026;50,00;ALUGUEL\n01/07/2026;50,00;ALUGUEL";
    const primeiraLeitura = analisarCsv(csv);
    const segundaLeitura = analisarCsv(csv);
    expect(segundaLeitura.map((t) => t.fitid)).toEqual(primeiraLeitura.map((t) => t.fitid));
  });
});
