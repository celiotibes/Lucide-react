import { describe, expect, it } from "vitest";
import type { LinhaDre } from "../types";
import { gerarCascataDre } from "./dreCascata";

const RECEITA_A: LinhaDre = { codigo: "1.1.01", descricao: "Aluguéis", grupo: "receita", total: 10000 };
const RECEITA_B: LinhaDre = { codigo: "1.2.01", descricao: "Airbnb", grupo: "receita", total: 2000 };
const DESPESA_GRANDE: LinhaDre = { codigo: "2.1.05", descricao: "Financiamento — juros", grupo: "despesa", total: -3000 };
const DESPESA_PEQUENA: LinhaDre = { codigo: "2.1.01", descricao: "Condomínio e IPTU", grupo: "despesa", total: -500 };

describe("gerarCascataDre", () => {
  it("soma toda receita na primeira etapa e cada despesa individual nas etapas seguintes, maior para menor", () => {
    const etapas = gerarCascataDre([RECEITA_A, RECEITA_B, DESPESA_PEQUENA, DESPESA_GRANDE]);

    expect(etapas[0]).toMatchObject({ rotulo: "Receita bruta", tipo: "receita", valor: 12000 });
    // DESPESA_GRANDE (-3000) vem antes de DESPESA_PEQUENA (-500): maior valor absoluto primeiro.
    expect(etapas[1]).toMatchObject({ rotulo: "Financiamento — juros", tipo: "despesa", valor: -3000, codigo: "2.1.05" });
    expect(etapas[2]).toMatchObject({ rotulo: "Condomínio e IPTU", tipo: "despesa", valor: -500, codigo: "2.1.01" });
  });

  it("cada barra de despesa 'pendura' do acumulado da etapa anterior (base = acumulado após a etapa)", () => {
    const etapas = gerarCascataDre([RECEITA_A, DESPESA_GRANDE]);
    // Receita bruta: base=0, sobe até 10000.
    expect(etapas[0]).toMatchObject({ base: 0, altura: 10000 });
    // Despesa de 3000: acumulado vai de 10000 para 7000 — a barra ocupa a faixa [7000, 10000].
    expect(etapas[1]).toMatchObject({ base: 7000, altura: 3000 });
  });

  it("a etapa final é o acumulado inteiro do período, não mais um delta", () => {
    const etapas = gerarCascataDre([RECEITA_A, RECEITA_B, DESPESA_GRANDE, DESPESA_PEQUENA]);
    const final = etapas.at(-1);
    expect(final).toMatchObject({ rotulo: "Resultado líquido", tipo: "total", valor: 12000 - 3000 - 500, codigo: null });
  });

  it("resultado líquido negativo (despesa maior que receita) preserva o sinal no valor da etapa final", () => {
    const despesaMaiorQueReceita: LinhaDre = { codigo: "2.1.05", descricao: "Financiamento — juros", grupo: "despesa", total: -15000 };
    const etapas = gerarCascataDre([RECEITA_A, despesaMaiorQueReceita]);
    const final = etapas.at(-1);
    expect(final?.valor).toBe(10000 - 15000);
    expect(final?.valor).toBeLessThan(0);
  });

  it("sem nenhuma linha, ainda retorna receita bruta e resultado líquido zerados (não quebra)", () => {
    const etapas = gerarCascataDre([]);
    expect(etapas).toHaveLength(2);
    expect(etapas[0].valor).toBe(0);
    expect(etapas[1].valor).toBe(0);
  });
});
