import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { calcularCarneLeaoPorImovel, calcularImpostoMensal, TABELA_IRPF_MENSAL_PADRAO } from "./irpfCarneLeao";

async function bancoComContaBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  return db;
}

describe("calcularCarneLeaoPorImovel", () => {
  it("agrega a base tributável de TODOS os imóveis antes de aplicar a tabela progressiva — regressão do bug real", async () => {
    // Regressão: o Carnê-Leão é uma obrigação PESSOAL, apurada sobre a soma de todos os
    // imóveis, nunca imóvel por imóvel. 3 imóveis de R$2.000/mês cada ficam individualmente
    // abaixo da faixa de isenção (R$2.259,20) — calcular o imposto de cada um isoladamente
    // daria R$0 pros três. Juntos, a base é R$6.000/mês, que cai na faixa de 27,5%.
    const db = await bancoComContaBase();
    for (let i = 1; i <= 3; i++) {
      executar(db, `INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (${i}, 'Kitnet ${i}', 'kitnet', 0)`);
      executar(
        db,
        `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (${i}, 1, '2026-06-10', 2000, 'ALUGUEL', '1.1.01', ${i})`,
      );
    }

    // Sanity check: cada imóvel isolado ficaria isento pela tabela — é exatamente o cenário
    // que o cálculo agregado precisa evitar.
    expect(calcularImpostoMensal(2000, TABELA_IRPF_MENSAL_PADRAO).imposto).toBe(0);

    const resultado = calcularCarneLeaoPorImovel(db, "2026-06-01", "2026-06-30", []);

    expect(resultado.baseTributavelTotal).toBe(6000);
    expect(resultado.aliquotaMarginalConsolidada).toBe(27.5);
    // 6000 * 27.5% - 896 (parcela a deduzir da última faixa) = 754.
    expect(resultado.impostoEstimadoTotal).toBeCloseTo(754, 2);
    expect(resultado.impostoEstimadoTotal).toBeGreaterThan(0);
  });

  it("distribui o imposto agregado de volta pra cada imóvel proporcionalmente à sua base tributável", async () => {
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (1, 'Imóvel Grande', 'apartamento', 0)");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (2, 'Imóvel Pequeno', 'kitnet', 0)");
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-06-10', 8000, 'ALUGUEL GRANDE', '1.1.01', 1)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-06-10', 2000, 'ALUGUEL PEQUENO', '1.1.01', 2)",
    );

    const resultado = calcularCarneLeaoPorImovel(db, "2026-06-01", "2026-06-30", []);
    const linhaGrande = resultado.linhas.find((l) => l.imovel.apelido === "Imóvel Grande")!;
    const linhaPequena = resultado.linhas.find((l) => l.imovel.apelido === "Imóvel Pequeno")!;

    // A soma das fatias distribuídas de volta bate exatamente com o total agregado (nenhum
    // imposto "some" ou é duplicado na divisão proporcional).
    expect(linhaGrande.impostoEstimado + linhaPequena.impostoEstimado).toBeCloseTo(resultado.impostoEstimadoTotal, 6);
    // Imóvel Grande é 80% da base (8000 de 10000) — deve carregar 80% do imposto.
    expect(linhaGrande.impostoEstimado).toBeCloseTo(resultado.impostoEstimadoTotal * 0.8, 6);
  });

  it("deduz apenas as categorias de despesa marcadas como dedutíveis, sem duplicar reembolso de rateio já excluído da base", async () => {
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (1, 'Kitnet A', 'kitnet', 0)");
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-06-10', 3000, 'ALUGUEL', '1.1.01', 1)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-06-15', -400, 'MANUTENCAO', '2.1.02', 1)",
    );

    const semDeducao = calcularCarneLeaoPorImovel(db, "2026-06-01", "2026-06-30", []);
    const comDeducao = calcularCarneLeaoPorImovel(db, "2026-06-01", "2026-06-30", ["2.1.02"]);

    expect(semDeducao.baseTributavelTotal).toBe(3000);
    expect(comDeducao.baseTributavelTotal).toBe(2600);
    expect(comDeducao.despesaDedutivelTotal).toBe(400);
  });
});

describe("calcularImpostoMensal", () => {
  it("base abaixo do limite de isenção não gera imposto", () => {
    expect(calcularImpostoMensal(2000, TABELA_IRPF_MENSAL_PADRAO).imposto).toBe(0);
  });

  it("base zero ou negativa nunca gera imposto negativo", () => {
    expect(calcularImpostoMensal(0, TABELA_IRPF_MENSAL_PADRAO).imposto).toBe(0);
    expect(calcularImpostoMensal(-500, TABELA_IRPF_MENSAL_PADRAO).imposto).toBe(0);
  });
});
