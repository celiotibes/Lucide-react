import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { gerarHeatmapDespesas } from "./heatmapDespesas";

async function bancoComContaBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  return db;
}

describe("gerarHeatmapDespesas", () => {
  it("agrupa despesa por categoria × mês, ignorando receita e transferência", async () => {
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-03-05', -300, 'CONDOMINIO', '2.1.01')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (2, 1, '2026-03-20', -100, 'CONDOMINIO 2', '2.1.01')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (3, 1, '2026-04-05', -50, 'PRESTADOR', '2.1.04')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (4, 1, '2026-03-10', 2000, 'ALUGUEL', '1.1.01')");
    executar(db, "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (5, 1, '2026-03-15', 500, 'TRANSFERENCIA', '9.0.01')");

    const heatmap = gerarHeatmapDespesas(db, "2026-01-01", "2026-12-31");

    expect(heatmap.meses).toEqual(["2026-03", "2026-04"]);
    expect(heatmap.categorias.sort()).toEqual(["Condomínio e IPTU", "Prestadores de serviço"].sort());
    // As duas transações de condomínio em março (300 + 100) somam numa única célula.
    const celulaCondominioMarco = heatmap.celulas.find((c) => c.categoria === "Condomínio e IPTU" && c.mes === "2026-03");
    expect(celulaCondominioMarco?.valor).toBe(400);
    expect(heatmap.valorMaximo).toBe(400);
  });

  it("limita a 10 categorias, priorizando as de maior soma total no período", async () => {
    const db = await bancoComContaBase();
    // 11 categorias de despesa existem no plano de contas padrão (2.1.01 a 2.1.11) — valor
    // decrescente por código, então 2.1.11 (o menor) é a única que deve ficar de fora do top 10.
    const codigosDespesa = ["2.1.01", "2.1.02", "2.1.03", "2.1.04", "2.1.05", "2.1.06", "2.1.07", "2.1.08", "2.1.09", "2.1.10", "2.1.11"];
    codigosDespesa.forEach((codigo, i) => {
      const valor = -(1000 - i * 10);
      executar(
        db,
        `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (${i + 1}, 1, '2026-05-01', ${valor}, 'DESPESA ${i}', '${codigo}')`,
      );
    });

    const heatmap = gerarHeatmapDespesas(db, "2026-01-01", "2026-12-31");
    const descricaoDoMaisFraco = "Advocacia — honorários e despesas jurídicas"; // 2.1.11 no plano de contas padrão

    expect(heatmap.categorias).toHaveLength(10);
    expect(heatmap.categorias).not.toContain(descricaoDoMaisFraco);
  });

  it("sem nenhuma despesa no período, retorna estrutura vazia sem quebrar", async () => {
    const db = await bancoComContaBase();
    const heatmap = gerarHeatmapDespesas(db, "2026-01-01", "2026-12-31");
    expect(heatmap.categorias).toEqual([]);
    expect(heatmap.meses).toEqual([]);
    expect(heatmap.celulas).toEqual([]);
    expect(heatmap.valorMaximo).toBe(0);
  });
});
