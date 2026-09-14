import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { percentualTributavel, gerarRendaTributavel, totalizarRendaTributavel } from "./rendaTributavel";

async function bancoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
  return db;
}

describe("percentualTributavel", () => {
  it("1.1.02 (reembolso de consumo individualizado) é sempre 0%, mesmo com contrato vinculado", () => {
    expect(percentualTributavel("1.1.02", 55)).toBe(0);
    expect(percentualTributavel("1.1.02", null)).toBe(0);
  });

  it("1.1.01 (aluguel) usa o percentual_aluguel_efetivo do contrato quando vinculado", () => {
    expect(percentualTributavel("1.1.01", 55)).toBe(55);
    expect(percentualTributavel("1.1.01", 100)).toBe(100);
  });

  it("1.1.01 sem contrato vinculado (percentual null): assume 100% tributável, nunca inventa uma decomposição", () => {
    expect(percentualTributavel("1.1.01", null)).toBe(100);
  });

  it("qualquer outro código (Airbnb, multas, etc.): 100% tributável, sem decomposição contratual", () => {
    expect(percentualTributavel("1.2.01", 55)).toBe(100);
    expect(percentualTributavel("9.9.99", null)).toBe(100);
  });
});

describe("gerarRendaTributavel", () => {
  it("aluguel com contrato de rateio embutido: decompõe em tributável (aluguel efetivo) e reembolso", async () => {
    const db = await bancoBase();
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, percentual_aluguel_efetivo)
       VALUES (1, 1, 'Locatário', 'residencial_fixo', 1500, '2026-01-01', 60)`,
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, contrato_id) VALUES (1, 1, '2026-03-10', 1500, 'PIX ALUGUEL', '1.1.01', 1)",
    );

    const [linha] = gerarRendaTributavel(db, "2026-01-01", "2026-12-31");

    expect(linha.mes).toBe("2026-03");
    expect(linha.totalRecebido).toBe(1500);
    expect(linha.rendaTributavel).toBeCloseTo(900, 6); // 60% de 1500
    expect(linha.reembolsoNaoTributavel).toBeCloseTo(600, 6); // 40% de 1500
  });

  it("reembolso de consumo individualizado (1.1.02): 100% do valor vira reembolso, nunca renda tributável", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-03-10', 200, 'REPASSE ENERGIA', '1.1.02')",
    );

    const [linha] = gerarRendaTributavel(db, "2026-01-01", "2026-12-31");
    expect(linha.rendaTributavel).toBe(0);
    expect(linha.reembolsoNaoTributavel).toBe(200);
  });

  it("receita fora de aluguel (Airbnb) sem contrato vinculado: 100% tributável", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-03-10', 800, 'PIX AIRBNB', '1.2.01')",
    );

    const [linha] = gerarRendaTributavel(db, "2026-01-01", "2026-12-31");
    expect(linha.rendaTributavel).toBe(800);
    expect(linha.reembolsoNaoTributavel).toBe(0);
  });

  it("transação de grupo 'pessoal' (ex: salário) NUNCA entra — não é receita da atividade", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-03-10', 23400, 'CREDITO FOLHA', '1.9.01')",
    );

    expect(gerarRendaTributavel(db, "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("agrupa por mês e respeita o filtro de período (BETWEEN)", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-03-05', 500, 'PIX AIRBNB', '1.2.01')",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (2, 1, '2026-03-20', 300, 'PIX AIRBNB', '1.2.01')",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (3, 1, '2026-05-01', 999, 'PIX AIRBNB FORA DO PERIODO', '1.2.01')",
    );

    const linhas = gerarRendaTributavel(db, "2026-01-01", "2026-04-30");

    expect(linhas).toHaveLength(1);
    expect(linhas[0].mes).toBe("2026-03");
    expect(linhas[0].totalRecebido).toBe(800); // soma das duas de março, exclui a de maio
  });
});

describe("totalizarRendaTributavel", () => {
  it("soma corretamente através de múltiplos meses", () => {
    const total = totalizarRendaTributavel([
      { mes: "2026-01", totalRecebido: 1000, rendaTributavel: 600, reembolsoNaoTributavel: 400 },
      { mes: "2026-02", totalRecebido: 2000, rendaTributavel: 1200, reembolsoNaoTributavel: 800 },
    ]);

    expect(total).toEqual({ totalRecebido: 3000, rendaTributavel: 1800, reembolsoNaoTributavel: 1200 });
  });

  it("lista vazia soma zero em tudo (nunca undefined/NaN)", () => {
    expect(totalizarRendaTributavel([])).toEqual({ totalRecebido: 0, rendaTributavel: 0, reembolsoNaoTributavel: 0 });
  });
});
