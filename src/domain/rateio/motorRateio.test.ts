import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { calcularPercentuais, aplicarRateio, aplicarRateioPersonalizado, obterRateiosDaTransacao } from "./motorRateio";
import type { Imovel } from "../types";

async function bancoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  return db;
}

function imovel(overrides: Partial<Imovel> & { id: number }): Imovel {
  return { apelido: `Imóvel ${overrides.id}`, tipo: "kitnet", financiado: 0, uso_pessoal: 0, regime_patrimonial: "proprio", ...overrides } as Imovel;
}

describe("calcularPercentuais", () => {
  it("'por_unidade' divide igual e nunca marca base incompleta (é uma escolha explícita, não fallback)", () => {
    const imoveis = [imovel({ id: 1 }), imovel({ id: 2 })];
    const { percentuais, baseIncompleta } = calcularPercentuais(imoveis, "por_unidade");

    expect(percentuais).toEqual([{ imovelId: 1, percentual: 0.5 }, { imovelId: 2, percentual: 0.5 }]);
    expect(baseIncompleta).toBe(false);
  });

  it("'fracao_ideal' com todos os imóveis com dado: pondera corretamente, sem base incompleta", () => {
    const imoveis = [imovel({ id: 1, fracao_ideal: 0.3 }), imovel({ id: 2, fracao_ideal: 0.7 })];
    const { percentuais, baseIncompleta } = calcularPercentuais(imoveis, "fracao_ideal");

    expect(percentuais.find((p) => p.imovelId === 1)?.percentual).toBeCloseTo(0.3, 6);
    expect(percentuais.find((p) => p.imovelId === 2)?.percentual).toBeCloseTo(0.7, 6);
    expect(baseIncompleta).toBe(false);
  });

  it("'fracao_ideal' com NENHUM imóvel com dado: cai para divisão igual E marca base incompleta", () => {
    const imoveis = [imovel({ id: 1 }), imovel({ id: 2 })];
    const { percentuais, baseIncompleta } = calcularPercentuais(imoveis, "fracao_ideal");

    expect(percentuais).toEqual([{ imovelId: 1, percentual: 0.5 }, { imovelId: 2, percentual: 0.5 }]);
    expect(baseIncompleta).toBe(true);
  });

  it("'fracao_ideal' com um imóvel SEM dado e outro COM: pondera só quem tem, mas ainda marca base incompleta", () => {
    // Achado ao aplicar a metodologia de rateio do SkillOS (accounting-reconstruction):
    // tratar o peso do imóvel sem dado como 0 (em vez de recusar o cálculo) é uma forma de
    // "equal/zero allocation silencioso" — precisa continuar calculável, mas nunca sem aviso.
    const imoveis = [imovel({ id: 1, fracao_ideal: 0.4 }), imovel({ id: 2 })];
    const { percentuais, baseIncompleta } = calcularPercentuais(imoveis, "fracao_ideal");

    expect(percentuais.find((p) => p.imovelId === 1)?.percentual).toBe(1); // só ele tem peso > 0
    expect(percentuais.find((p) => p.imovelId === 2)?.percentual).toBe(0);
    expect(baseIncompleta).toBe(true);
  });

  it("'area_m2' segue a mesma regra de base incompleta que 'fracao_ideal'", () => {
    const imoveis = [imovel({ id: 1, area_m2: 30 }), imovel({ id: 2 })];
    const { baseIncompleta } = calcularPercentuais(imoveis, "area_m2");
    expect(baseIncompleta).toBe(true);
  });

  it("lista vazia: sem percentuais e sem base incompleta", () => {
    expect(calcularPercentuais([], "fracao_ideal")).toEqual({ percentuais: [], baseIncompleta: false });
  });
});

describe("aplicarRateio", () => {
  it("persiste base_incompleta=1 quando o rateio caiu em fallback, refletido em obterRateiosDaTransacao", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (2, 'Kitnet 2', 'kitnet')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-01-01', -200, 'CONDOMINIO COLETIVO')");

    aplicarRateio(db, 1, [1, 2], "fracao_ideal");

    const rateios = obterRateiosDaTransacao(db, 1);
    expect(rateios).toHaveLength(2);
    expect(rateios.every((r) => r.baseIncompleta)).toBe(true);
    expect(rateios.every((r) => r.percentual === 0.5)).toBe(true);
  });

  it("imóvel com peso 0 (sem fração ideal) entre outros com peso > 0: nunca insere percentual 0 (violaria a CHECK constraint), mas mantém baseIncompleta nos que entram", async () => {
    // Bug real encontrado ao testar ao vivo o aviso de base incompleta: com 2 imóveis com
    // fracao_ideal cadastrada e 1 sem, o 3º recebia percentual calculado = 0 (peso 0 / soma
    // dos pesos) e o INSERT quebrava com "CHECK constraint failed: percentual > 0..." — o
    // rateio inteiro falhava, mesmo os 2 imóveis com dado completo.
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, fracao_ideal) VALUES (1, 'Kitnet 1', 'kitnet', 0.3)");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, fracao_ideal) VALUES (2, 'Kitnet 2', 'kitnet', 0.7)");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (3, 'Kitnet 3', 'kitnet')"); // sem fracao_ideal
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-01-01', -100, 'CONDOMINIO COLETIVO')");

    expect(() => aplicarRateio(db, 1, [1, 2, 3], "fracao_ideal")).not.toThrow();

    const rateios = obterRateiosDaTransacao(db, 1);
    expect(rateios.map((r) => r.imovelId).sort()).toEqual([1, 2]); // imóvel 3 (peso 0) nunca entra
    expect(rateios.every((r) => r.baseIncompleta)).toBe(true);
    expect(rateios.find((r) => r.imovelId === 1)?.percentual).toBeCloseTo(0.3, 6);
    expect(rateios.find((r) => r.imovelId === 2)?.percentual).toBeCloseTo(0.7, 6);
  });

  it("não marca base_incompleta quando os imóveis têm fração ideal cadastrada", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, fracao_ideal) VALUES (1, 'Kitnet 1', 'kitnet', 0.6)");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, fracao_ideal) VALUES (2, 'Kitnet 2', 'kitnet', 0.4)");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-01-01', -200, 'CONDOMINIO COLETIVO')");

    aplicarRateio(db, 1, [1, 2], "fracao_ideal");

    const rateios = obterRateiosDaTransacao(db, 1);
    expect(rateios.every((r) => !r.baseIncompleta)).toBe(true);
  });

  it("a soma dos valores rateados sempre reconstitui o valor original da transação (invariante de conciliação)", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, fracao_ideal) VALUES (1, 'Kitnet 1', 'kitnet', 0.33)");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, fracao_ideal) VALUES (2, 'Kitnet 2', 'kitnet', 0.67)");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-01-01', -333.33, 'AGUA COLETIVA')");

    aplicarRateio(db, 1, [1, 2], "fracao_ideal");

    const rateios = obterRateiosDaTransacao(db, 1);
    const somaRateada = rateios.reduce((acc, r) => acc + r.valorRateado, 0);
    expect(somaRateada).toBeCloseTo(-333.33, 6);
  });

  it("reaplica o rateio (chamar de novo substitui, não duplica)", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, fracao_ideal) VALUES (1, 'Kitnet 1', 'kitnet', 0.5)");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, fracao_ideal) VALUES (2, 'Kitnet 2', 'kitnet', 0.5)");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-01-01', -100, 'DESPESA')");

    aplicarRateio(db, 1, [1, 2], "fracao_ideal");
    aplicarRateio(db, 1, [1, 2], "por_unidade");

    const rateios = obterRateiosDaTransacao(db, 1);
    expect(rateios).toHaveLength(2);
    expect(rateios.every((r) => r.criterio === "por_unidade")).toBe(true);
  });
});

describe("aplicarRateioPersonalizado", () => {
  it("rateio por documento nunca é marcado como base incompleta (vem de dado real, não de fallback)", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (2, 'Kitnet 2', 'kitnet')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-01-01', -100, 'NOTA FISCAL RATEADA')");

    aplicarRateioPersonalizado(db, 1, [{ imovelId: 1, percentual: 0.2 }, { imovelId: 2, percentual: 0.8 }]);

    const rateios = obterRateiosDaTransacao(db, 1);
    expect(rateios.every((r) => !r.baseIncompleta)).toBe(true);
    expect(rateios.every((r) => r.criterio === "documento")).toBe(true);
  });
});

describe("migração de schema", () => {
  it("rateios.base_incompleta tem DEFAULT 0 — uma linha inserida sem informar a coluna não fica NULL", async () => {
    const db = await bancoBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original) VALUES (1, 1, '2026-01-01', -100, 'DESPESA')");
    executar(db, "INSERT INTO rateios (transacao_id, imovel_id, criterio, percentual, valor_rateado) VALUES (1, 1, 'documento', 1, -100)");

    const [linha] = consultar<{ base_incompleta: number }>(db, "SELECT base_incompleta FROM rateios WHERE transacao_id = 1");
    expect(linha.base_incompleta).toBe(0);
  });
});
