import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { calcularCapacidadeContributiva, calcularCapacidadeContributivaMensal } from "./capacidadeContributiva";

async function bancoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
  return db;
}

describe("calcularCapacidadeContributiva", () => {
  it("resultado líquido real = renda tributável (após decompor rateio) menos despesa operacional — não o total bruto recebido", async () => {
    // Cenário central do caso: "valor único mensal" de R$1500 decomposto em 60% aluguel
    // efetivo / 40% reembolso de rateio — o total recebido bruto (o que aparece no extrato)
    // é bem maior do que a capacidade contributiva real depois de tirar despesa operacional.
    const db = await bancoBase();
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, percentual_aluguel_efetivo)
       VALUES (1, 1, 'Locatário', 'residencial_fixo', 1500, '2026-01-01', 60)`,
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, contrato_id, imovel_id) VALUES (1, 1, '2026-03-10', 1500, 'PIX ALUGUEL', '1.1.01', 1, 1)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-03-05', -200, 'CONDOMINIO', '2.1.01', 1)",
    );

    const resultado = calcularCapacidadeContributiva(db, "2026-01-01", "2026-12-31");

    expect(resultado.totalRecebidoBruto).toBe(1500);
    expect(resultado.rendaTributavel).toBeCloseTo(900, 6); // 60% de 1500
    expect(resultado.reembolsoNaoTributavel).toBeCloseTo(600, 6);
    expect(resultado.despesaOperacionalTotal).toBe(200);
    expect(resultado.resultadoLiquidoReal).toBeCloseTo(700, 6); // 900 - 200, nunca 1500 - 200
    expect(resultado.percentualDisponivelSobreRecebido).toBeCloseTo((700 / 1500) * 100, 6);
  });

  it("percentualDisponivelSobreRecebido é null quando não há nada recebido (nunca divide por zero silenciosamente)", async () => {
    const db = await bancoBase();
    const resultado = calcularCapacidadeContributiva(db, "2026-01-01", "2026-12-31");

    expect(resultado.totalRecebidoBruto).toBe(0);
    expect(resultado.percentualDisponivelSobreRecebido).toBeNull();
  });

  it("resultado líquido real pode ser negativo quando a despesa operacional supera a renda tributável", async () => {
    const db = await bancoBase();
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, percentual_aluguel_efetivo)
       VALUES (1, 1, 'Locatário', 'residencial_fixo', 500, '2026-01-01', 100)`,
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, contrato_id, imovel_id) VALUES (1, 1, '2026-03-10', 500, 'PIX ALUGUEL', '1.1.01', 1, 1)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-03-05', -800, 'FINANCIAMENTO JUROS', '2.1.05', 1)",
    );

    const resultado = calcularCapacidadeContributiva(db, "2026-01-01", "2026-12-31");
    expect(resultado.resultadoLiquidoReal).toBeCloseTo(500 - 800, 6);
  });

  it("respeita o filtro de período — transação fora do intervalo não entra em nenhum dos totais", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2025-01-01', 5000, 'PIX AIRBNB FORA DO PERIODO', '1.2.01', 1)",
    );

    const resultado = calcularCapacidadeContributiva(db, "2026-01-01", "2026-12-31");
    expect(resultado.totalRecebidoBruto).toBe(0);
  });
});

describe("calcularCapacidadeContributivaMensal", () => {
  it("gera uma linha por mês, casando renda tributável e despesa operacional do mesmo mês", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-03-10', 1000, 'PIX AIRBNB', '1.2.01', 1)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-03-05', -300, 'CONDOMINIO', '2.1.01', 1)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (3, 1, '2026-04-10', 2000, 'PIX AIRBNB', '1.2.01', 1)",
    );
    // Abril não tem despesa lançada nenhuma — deve ficar 0, nunca undefined/NaN.

    const serie = calcularCapacidadeContributivaMensal(db, "2026-01-01", "2026-12-31");

    const marco = serie.find((s) => s.mes === "2026-03");
    expect(marco?.totalRecebidoBruto).toBe(1000);
    expect(marco?.despesaOperacionalTotal).toBe(300);
    expect(marco?.resultadoLiquidoReal).toBe(700);

    const abril = serie.find((s) => s.mes === "2026-04");
    expect(abril?.rendaTributavel).toBe(2000);
    expect(abril?.despesaOperacionalTotal).toBe(0);
    expect(abril?.resultadoLiquidoReal).toBe(2000);
  });

  it("lista vazia quando não há nenhuma receita no período", async () => {
    const db = await bancoBase();
    expect(calcularCapacidadeContributivaMensal(db, "2026-01-01", "2026-12-31")).toEqual([]);
  });
});
