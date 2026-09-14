import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { gerarFluxoFinanceiro } from "./fluxoFinanceiro";

async function bancoComContaBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  return db;
}

describe("gerarFluxoFinanceiro", () => {
  it("não deixa uma transação não-receita com imóvel atribuído manualmente herdar imovelId na metadata do nó", async () => {
    // Regressão do bug real: a metadata de origem usava "imovel_id não-nulo" pra decidir
    // entre imovelId/codigo, mas o RÓTULO do nó usa grupo='receita' — os dois critérios
    // divergiam quando uma transação de salário (grupo='pessoal') tinha um imóvel atribuído
    // manualmente em Transações, fazendo o nó "Salário" filtrar por imóvel em vez de pela
    // categoria salário no drill-down.
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (1, 'Kitnet A', 'kitnet', 0)");
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-06-10', 5000, 'SALARIO', '1.9.01', 1)",
    );

    const fluxo = gerarFluxoFinanceiro(db, "2026-01-01", "2026-12-31");
    const noSalario = fluxo.nodes.find((n) => n.name === "Salário — servidor federal");

    expect(noSalario).toBeDefined();
    expect(noSalario?.imovelId).toBeNull();
    expect(noSalario?.codigo).toBe("1.9.01");
  });

  it("zera a metadata do nó (em vez de escolher um imovelId arbitrário) quando dois imóveis compartilham o mesmo apelido", async () => {
    // Regressão do bug real: metadataOrigemPorNome guardava "o primeiro que aparecer" quando
    // duas linhas mapeavam pro mesmo nome de nó exibido — schema não exige apelido único, então
    // dois imóveis com o mesmo nome faziam o drill-down mostrar só as transações de um deles,
    // apesar do valor do nó ser a soma dos dois.
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (2, 'Kitnet Duplicada', 'kitnet', 0)");
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (3, 'Kitnet Duplicada', 'kitnet', 0)");
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-06-05', 1000, 'ALUGUEL A', '1.1.01', 2)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (3, 1, '2026-06-06', 1500, 'ALUGUEL B', '1.1.01', 3)",
    );

    const fluxo = gerarFluxoFinanceiro(db, "2026-01-01", "2026-12-31");
    const noDuplicado = fluxo.nodes.find((n) => n.name === "Kitnet Duplicada");
    const valorTotal = fluxo.links
      .filter((l) => fluxo.nodes[l.source]?.name === "Kitnet Duplicada" || fluxo.nodes[l.target]?.name === "Kitnet Duplicada")
      .reduce((acc, l) => acc + l.value, 0);

    expect(noDuplicado?.imovelId).toBeNull();
    // A soma exibida no nó precisa continuar correta mesmo sem um alvo único de drill-down —
    // "sem drill-down" é aceitável, "valor errado" ou "metade dos lançamentos escondidos" não.
    expect(valorTotal).toBe(2500);
  });

  it("não colapsa um nó de origem e um nó de destino que compartilham o mesmo texto exibido", async () => {
    // Regressão do bug real: indiceDoNo deduplicava só pelo nome, sem considerar a coluna —
    // um imóvel com apelido igual a uma descrição do plano de contas colapsava os dois nós
    // (origem e destino) no mesmo índice, corrompendo a topologia do Sankey.
    const db = await bancoComContaBase();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (4, 'Condomínio e IPTU', 'kitnet', 0)");
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (4, 1, '2026-06-07', 2000, 'ALUGUEL C', '1.1.01', 4)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (5, 1, '2026-06-08', -300, 'CONDOMINIO', '2.1.01')",
    );

    const fluxo = gerarFluxoFinanceiro(db, "2026-01-01", "2026-12-31");
    const nosComEsseNome = fluxo.nodes.filter((n) => n.name === "Condomínio e IPTU");

    expect(nosComEsseNome).toHaveLength(2);
    expect(nosComEsseNome.map((n) => n.coluna).sort()).toEqual([0, 2]);
  });

  it("exclui transferência entre contas próprias/caução dos dois lados", async () => {
    const db = await bancoComContaBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, 1, '2026-03-01', 1000, 'TRANSFERENCIA ENTRE CONTAS', '9.0.01')",
    );

    const fluxo = gerarFluxoFinanceiro(db, "2026-01-01", "2026-12-31");

    expect(fluxo.nodes).toHaveLength(0);
    expect(fluxo.links).toHaveLength(0);
  });

  it("agrupa origens/categorias além do topo N sob 'Outras origens'/'Outras despesas'", async () => {
    const db = await bancoComContaBase();
    // 9 imóveis com receita — acima do limite de 8 origens nomeadas.
    for (let i = 1; i <= 9; i++) {
      executar(db, `INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (${i}, 'Imovel ${i}', 'kitnet', 0)`);
      executar(
        db,
        `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (${i}, 1, '2026-04-0${i > 9 ? 9 : i}', ${1000 - i}, 'ALUGUEL ${i}', '1.1.01', ${i})`,
      );
    }

    const fluxo = gerarFluxoFinanceiro(db, "2026-01-01", "2026-12-31");
    const nomesOrigem = fluxo.nodes.filter((n) => n.coluna === 0).map((n) => n.name);

    expect(nomesOrigem).toContain("Outras origens");
    expect(nomesOrigem.filter((n) => n !== "Outras origens")).toHaveLength(8);
  });
});
