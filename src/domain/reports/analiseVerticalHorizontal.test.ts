import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { calcularAnaliseVertical, calcularAnaliseHorizontal } from "./analiseVerticalHorizontal";

async function bancoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
  return db;
}

describe("calcularAnaliseVertical", () => {
  it("cada linha de despesa aparece como % da receita total do período", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-03-10', 1000, 'PIX AIRBNB', '1.2.01', 1)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-03-05', -300, 'CONDOMINIO', '2.1.01', 1)",
    );

    const linhas = calcularAnaliseVertical(db, "2026-01-01", "2026-12-31");

    const receita = linhas.find((l) => l.codigo === "1.2.01");
    const despesa = linhas.find((l) => l.codigo === "2.1.01");
    expect(receita?.percentualSobreReceita).toBeCloseTo(100, 6); // é a única receita, 100% de si mesma
    expect(despesa?.percentualSobreReceita).toBeCloseTo(30, 6); // 300/1000 * 100
  });

  it("percentualSobreReceita é null em todas as linhas quando não há receita no período (nunca divide por zero)", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-03-05', -300, 'CONDOMINIO', '2.1.01', 1)",
    );

    const linhas = calcularAnaliseVertical(db, "2026-01-01", "2026-12-31");
    expect(linhas.every((l) => l.percentualSobreReceita === null)).toBe(true);
  });
});

describe("calcularAnaliseHorizontal", () => {
  it("compara o período atual com o período imediatamente anterior de mesma duração", async () => {
    const db = await bancoBase();
    // Ano anterior (2025): despesa de manutenção R$100.
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2025-06-10', -100, 'MANUTENCAO', '2.1.04', 1)",
    );
    // Ano atual (2026): despesa de manutenção R$150 — alta de 50%.
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-06-10', -150, 'MANUTENCAO', '2.1.04', 1)",
    );

    const linhas = calcularAnaliseHorizontal(db, "2026-01-01", "2026-12-31");
    const manutencao = linhas.find((l) => l.codigo === "2.1.04");

    expect(manutencao?.totalAtual).toBe(-150);
    expect(manutencao?.totalAnterior).toBe(-100);
    expect(manutencao?.variacaoPercentual).toBeCloseTo(50, 6);
  });

  it("janela anterior de um ano civil completo cai exatamente no ano civil anterior (achado documentado no código: +1 dia no cálculo do período)", async () => {
    const db = await bancoBase();
    // Transação no ÚLTIMO dia do ano anterior (2025-12-31) — deve entrar na janela "anterior".
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2025-12-31', -100, 'MANUTENCAO FIM DE ANO', '2.1.04', 1)",
    );
    // Transação no dia anterior a esse (2025-12-30) — não deveria entrar em nenhuma das duas
    // janelas se o período atual for só o ano de 2026, mas convém confirmar que 2025-12-31
    // é o único dia de borda que entra.
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-01-01', -50, 'MANUTENCAO INICIO DE ANO', '2.1.04', 1)",
    );

    const linhas = calcularAnaliseHorizontal(db, "2026-01-01", "2026-12-31");
    const manutencao = linhas.find((l) => l.codigo === "2.1.04");

    // totalAnterior deve conter só os -100 de 2025-12-31 (a janela anterior fecha exatamente
    // no dia anterior ao início do período atual, sem deslocar 1 dia).
    expect(manutencao?.totalAnterior).toBe(-100);
    expect(manutencao?.totalAtual).toBe(-50);
  });

  it("variacaoPercentual é null quando não havia nada no período anterior (linha nova)", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-06-10', -200, 'OBRA NOVA', '2.1.07', 1)",
    );

    const linhas = calcularAnaliseHorizontal(db, "2026-01-01", "2026-12-31");
    const obra = linhas.find((l) => l.codigo === "2.1.07");
    expect(obra?.totalAnterior).toBe(0);
    expect(obra?.variacaoPercentual).toBeNull();
  });

  it("ordena do maior para o menor valor absoluto do período atual", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-06-10', -50, 'PEQUENA', '2.1.04', 1)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-06-11', -5000, 'GRANDE', '2.1.06', 1)",
    );

    const linhas = calcularAnaliseHorizontal(db, "2026-01-01", "2026-12-31");
    expect(linhas[0].codigo).toBe("2.1.06");
  });
});
