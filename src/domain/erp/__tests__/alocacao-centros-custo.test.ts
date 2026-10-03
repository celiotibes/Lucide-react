import { describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarLancamentoContabil } from "../ledger";
import {
  alocarLancamentoACentro,
  alocarRateiosaoCentro,
  analiseRentabilidadePorCentro,
  criarCentroCustoImovel,
  dashboardRentabilidadePorImovel,
  reclassificarDespesaEntreCentros,
  relatorioDespesosPorCentro,
  sincronizarCentrosCustoImoveis,
} from "../alocacao-centros-custo";

/**
 * Primeira suíte deste módulo rodando contra o schema real (`criarBancoDeTeste()`), não
 * contra fixtures fictícias. Ver ACHADOs corrigidos em schema.sql (CHECK de
 * `centros_custo.tipo` tinha o typo 'imavel', rejeitando toda gravação de
 * `criarCentroCustoImovel`) e em alocacao-centros-custo.ts (`relatorioDespesosPorCentro`
 * somava `valor_debito + valor_credito`, que é sempre NULL porque as duas colunas são
 * mutuamente exclusivas no schema real).
 */

async function montarBase() {
  const db = await criarBancoDeTeste();
  const onboarding = criarEntidadeLegal(db, {
    nome: "Titular de Teste",
    cpf_cnpj: "52998224725",
  });
  expect(onboarding.sucesso).toBe(true);
  const entidade_id = onboarding.entidade_id!;

  executar(
    db,
    "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 1, 'aberto')",
    [entidade_id],
  );
  const periodo_id = consultar<{ id: number }>(
    db,
    "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = 2025 AND mes = 1",
    [entidade_id],
  )[0].id;

  return { db, entidade_id, periodo_id };
}

function criarImovel(
  db: Database,
  apelido: string,
  opcoes: { uso_pessoal?: 0 | 1; financiado?: 0 | 1 } = {},
): number {
  executar(
    db,
    "INSERT INTO imoveis (apelido, tipo, uso_pessoal, financiado) VALUES (?, 'kitnet', ?, ?)",
    [apelido, opcoes.uso_pessoal ?? 0, opcoes.financiado ?? 0],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;
}

describe("alocacao-centros-custo: criação e sincronização de centros de custo", () => {
  it("criarCentroCustoImovel grava o centro com código IM-000N e tipo 'imovel' contra o schema real", async () => {
    const { db, entidade_id } = await montarBase();
    const imovel_id = criarImovel(db, "Kitnet 302");

    const centro_id = criarCentroCustoImovel(db, entidade_id, imovel_id, "Kitnet 302");
    expect(centro_id).toBeGreaterThan(0);

    const [centro] = consultar<{ codigo: string; descricao: string; tipo: string; ativo: number }>(
      db,
      "SELECT codigo, descricao, tipo, ativo FROM centros_custo WHERE id = ?",
      [centro_id],
    );
    expect(centro.codigo).toBe(`IM-${String(imovel_id).padStart(4, "0")}`);
    expect(centro.descricao).toBe("Imóvel: Kitnet 302");
    expect(centro.tipo).toBe("imovel");
    expect(centro.ativo).toBe(1);
  });

  it("sincronizarCentrosCustoImoveis cria centros só para imóveis ativos (exclui uso pessoal e financiados) e é idempotente", async () => {
    const { db, entidade_id } = await montarBase();
    criarImovel(db, "Kitnet ativa");
    criarImovel(db, "Casa própria", { uso_pessoal: 1 });
    criarImovel(db, "Apto financiado", { financiado: 1 });

    const criados = sincronizarCentrosCustoImoveis(db, entidade_id);
    expect(criados).toBe(1);

    const centros = consultar<{ codigo: string }>(
      db,
      "SELECT codigo FROM centros_custo WHERE entidade_id = ?",
      [entidade_id],
    );
    expect(centros).toHaveLength(1);

    // Rodar de novo não duplica: já existe centro para o único imóvel elegível.
    const criadosSegundaVez = sincronizarCentrosCustoImoveis(db, entidade_id);
    expect(criadosSegundaVez).toBe(0);
  });
});

describe("alocacao-centros-custo: alocação de lançamentos", () => {
  it("alocarLancamentoACentro atualiza centro_custo_id do lançamento no ledger real", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, "Kitnet 1");
    const centro_id = criarCentroCustoImovel(db, entidade_id, imovel_id, "Kitnet 1");

    const lancamento_id = registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id: 5210,
      data_lancamento: "2025-01-10",
      valor_debito: 300,
      descricao: "Condomínio",
      origem_modulo: "manual",
      origem_id: 1,
      referencia_documento: "T-1",
    });

    expect(alocarLancamentoACentro(db, lancamento_id, centro_id)).toBe(true);

    const [linha] = consultar<{ centro_custo_id: number }>(
      db,
      "SELECT centro_custo_id FROM ledger_entries WHERE id = ?",
      [lancamento_id],
    );
    expect(linha.centro_custo_id).toBe(centro_id);
  });

  it("alocarRateiosaoCentro aloca só os lançamentos de rateio pendentes do imóvel e é idempotente", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, "Kitnet 1");
    const centro_id = criarCentroCustoImovel(db, entidade_id, imovel_id, "Kitnet 1");

    // Dois lançamentos de rateio deste imóvel (origem_id = imovel_id, convenção usada por
    // automacao-rateios.ts) e um lançamento de outra origem, que não deve ser tocado.
    // conta_id DIFERENTE entre l1 e l2 de propósito: idx_ledger_origem_unica é
    // UNIQUE(origem_modulo, origem_id, conta_id) — duas linhas de rateio deste MESMO
    // imóvel na MESMA conta 4103 colidiriam (é exatamente o achado que
    // automacao-rateios.ts já documenta como pendente de decisão de produto). Aqui o
    // que se testa é alocarRateiosaoCentro, que filtra só por origem_modulo+origem_id —
    // não depende de qual conta — então a segunda linha usa outra conta real (4101) só
    // para não colidir, sem alegar que "Rateio 2" seria classificado ali de verdade.
    const l1 = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 4103, data_lancamento: "2025-01-10",
      valor_credito: 100, descricao: "Rateio 1", origem_modulo: "rateios",
      origem_id: imovel_id, referencia_documento: "DOC-1-RAT-" + imovel_id,
    });
    const l2 = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 4101, data_lancamento: "2025-01-10",
      valor_credito: 50, descricao: "Rateio 2", origem_modulo: "rateios",
      origem_id: imovel_id, referencia_documento: "DOC-2-RAT-" + imovel_id,
    });
    const lOutro = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 5210, data_lancamento: "2025-01-10",
      valor_debito: 300, descricao: "Não é rateio", origem_modulo: "manual",
      origem_id: 999, referencia_documento: "T-OUTRO",
    });

    const alocados = alocarRateiosaoCentro(db, imovel_id, entidade_id);
    expect(alocados).toBe(2);

    const centros = consultar<{ id: number; centro_custo_id: number | null }>(
      db,
      "SELECT id, centro_custo_id FROM ledger_entries WHERE id IN (?, ?, ?)",
      [l1, l2, lOutro],
    );
    const porId = new Map(centros.map((c) => [c.id, c.centro_custo_id]));
    expect(porId.get(l1)).toBe(centro_id);
    expect(porId.get(l2)).toBe(centro_id);
    expect(porId.get(lOutro)).toBeNull();

    // Idempotente: já alocados não são recontados.
    expect(alocarRateiosaoCentro(db, imovel_id, entidade_id)).toBe(0);
  });

  it("edge case: centro de custo sem nenhuma alocação (imóvel nunca sincronizado) retorna 0, sem lançar erro", async () => {
    const { db, entidade_id } = await montarBase();
    const imovel_id = criarImovel(db, "Kitnet nunca sincronizada");
    // Nenhum criarCentroCustoImovel foi chamado para este imóvel.
    expect(alocarRateiosaoCentro(db, imovel_id, entidade_id)).toBe(0);
  });
});

describe("alocacao-centros-custo: relatórios de despesa e rentabilidade", () => {
  it("relatorioDespesosPorCentro soma valor_total e percentual_do_centro corretamente (não NULL) contra o schema real", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovelA = criarImovel(db, "A");
    const imovelB = criarImovel(db, "B");
    const centroA = criarCentroCustoImovel(db, entidade_id, imovelA, "A");
    const centroB = criarCentroCustoImovel(db, entidade_id, imovelB, "B");

    const debitoA = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 5210, data_lancamento: "2025-01-10",
      valor_debito: 300, descricao: "Condomínio A", origem_modulo: "manual",
      origem_id: 1, referencia_documento: "T-A1",
    });
    alocarLancamentoACentro(db, debitoA, centroA);

    const debitoB = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 5210, data_lancamento: "2025-01-10",
      valor_debito: 700, descricao: "Condomínio B", origem_modulo: "manual",
      origem_id: 2, referencia_documento: "T-B1",
    });
    alocarLancamentoACentro(db, debitoB, centroB);

    const relatorio = relatorioDespesosPorCentro(db, entidade_id, periodo_id);
    expect(relatorio).toHaveLength(2);

    const linhaA = relatorio.find((r) => r.centro_codigo === `IM-${String(imovelA).padStart(4, "0")}`)!;
    const linhaB = relatorio.find((r) => r.centro_codigo === `IM-${String(imovelB).padStart(4, "0")}`)!;

    expect(linhaA.valor_total).toBeCloseTo(300, 2);
    expect(linhaB.valor_total).toBeCloseTo(700, 2);
    expect(linhaA.percentual_do_centro).toBeCloseTo(30, 2);
    expect(linhaB.percentual_do_centro).toBeCloseTo(70, 2);
    expect(linhaA.quantidade_lancamentos).toBe(1);
  });

  it("analiseRentabilidadePorCentro calcula receita, despesa, resultado e margem por imóvel", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, "Kitnet lucrativa");
    const centro_id = criarCentroCustoImovel(db, entidade_id, imovel_id, "Kitnet lucrativa");

    const credito = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 4101, data_lancamento: "2025-01-05",
      valor_credito: 1000, descricao: "Aluguel", origem_modulo: "manual",
      origem_id: 1, referencia_documento: "T-REC",
    });
    alocarLancamentoACentro(db, credito, centro_id);

    const debito = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 5210, data_lancamento: "2025-01-10",
      valor_debito: 300, descricao: "Condomínio", origem_modulo: "manual",
      origem_id: 2, referencia_documento: "T-DESP",
    });
    alocarLancamentoACentro(db, debito, centro_id);

    const analise = analiseRentabilidadePorCentro(db, entidade_id, periodo_id);
    expect(analise).toHaveLength(1);
    expect(analise[0].receita_total).toBeCloseTo(1000, 2);
    expect(analise[0].despesa_total).toBeCloseTo(300, 2);
    expect(analise[0].resultado_liquido).toBeCloseTo(700, 2);
    expect(analise[0].margem_percentual).toBeCloseTo(70, 2);
  });

  it("edge case: centro de custo sem nenhuma alocação aparece com receita/despesa/margem zeradas, não NULL/NaN", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovel_id = criarImovel(db, "Kitnet sem movimento");
    criarCentroCustoImovel(db, entidade_id, imovel_id, "Kitnet sem movimento");

    const analise = analiseRentabilidadePorCentro(db, entidade_id, periodo_id);
    expect(analise).toHaveLength(1);
    expect(analise[0].receita_total).toBe(0);
    expect(analise[0].despesa_total).toBe(0);
    expect(analise[0].resultado_liquido).toBe(0);
    expect(analise[0].margem_percentual).toBe(0);
  });

  it("dashboardRentabilidadePorImovel aponta melhor/pior imóvel e a média entre eles", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovelBom = criarImovel(db, "Bom");
    const imovelRuim = criarImovel(db, "Ruim");
    const centroBom = criarCentroCustoImovel(db, entidade_id, imovelBom, "Bom");
    const centroRuim = criarCentroCustoImovel(db, entidade_id, imovelRuim, "Ruim");

    const credBom = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 4101, data_lancamento: "2025-01-05",
      valor_credito: 1000, descricao: "Aluguel bom", origem_modulo: "manual",
      origem_id: 1, referencia_documento: "T-BOM-REC",
    });
    alocarLancamentoACentro(db, credBom, centroBom);

    const credRuim = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 4101, data_lancamento: "2025-01-05",
      valor_credito: 1000, descricao: "Aluguel ruim", origem_modulo: "manual",
      origem_id: 2, referencia_documento: "T-RUIM-REC",
    });
    alocarLancamentoACentro(db, credRuim, centroRuim);
    const despRuim = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 5210, data_lancamento: "2025-01-10",
      valor_debito: 900, descricao: "Despesa alta", origem_modulo: "manual",
      origem_id: 3, referencia_documento: "T-RUIM-DESP",
    });
    alocarLancamentoACentro(db, despRuim, centroRuim);

    const dashboard = dashboardRentabilidadePorImovel(db, entidade_id, periodo_id);
    // `nome` vem de centro_descricao, que criarCentroCustoImovel grava sempre como
    // "Imóvel: <nome>" (rótulo contábil, não o apelido nu) — mesma convenção que o
    // teste de criarCentroCustoImovel já confirma para o código IM-000N.
    expect(dashboard.melhor_imovel?.nome).toBe("Imóvel: Bom");
    expect(dashboard.pior_imovel?.nome).toBe("Imóvel: Ruim");
    expect(dashboard.rentabilidade_media).toBeCloseTo((100 + 10) / 2, 2);
  });

  it("edge case: nenhum centro de custo tipo 'imovel' existe ainda — dashboard retorna nulos, sem lançar erro", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const dashboard = dashboardRentabilidadePorImovel(db, entidade_id, periodo_id);
    expect(dashboard.melhor_imovel).toBeNull();
    expect(dashboard.pior_imovel).toBeNull();
    expect(dashboard.rentabilidade_media).toBe(0);
  });
});

describe("alocacao-centros-custo: reclassificação entre centros", () => {
  it("reclassificarDespesaEntreCentros move o lançamento e registra a auditoria em log_alteracoes", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovelOrigem = criarImovel(db, "Origem");
    const imovelDestino = criarImovel(db, "Destino");
    const centroOrigem = criarCentroCustoImovel(db, entidade_id, imovelOrigem, "Origem");
    const centroDestino = criarCentroCustoImovel(db, entidade_id, imovelDestino, "Destino");

    const lancamento_id = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 5210, data_lancamento: "2025-01-10",
      valor_debito: 500, descricao: "Condomínio lançado no imóvel errado",
      origem_modulo: "manual", origem_id: 1, referencia_documento: "T-RECLASS",
    });
    alocarLancamentoACentro(db, lancamento_id, centroOrigem);

    const sucesso = reclassificarDespesaEntreCentros(
      db, lancamento_id, centroOrigem, centroDestino, "Lançado no imóvel errado por engano",
    );
    expect(sucesso).toBe(true);

    const [linha] = consultar<{ centro_custo_id: number }>(
      db, "SELECT centro_custo_id FROM ledger_entries WHERE id = ?", [lancamento_id],
    );
    expect(linha.centro_custo_id).toBe(centroDestino);

    const [log] = consultar<{ tabela: string; operacao: string; resumo: string }>(
      db, "SELECT tabela, operacao, resumo FROM log_alteracoes WHERE registro_id = ? AND tabela = 'ledger_entries'",
      [lancamento_id],
    );
    expect(log.operacao).toBe("edicao");
    expect(log.resumo).toContain("Lançado no imóvel errado por engano");
  });

  it("edge case: reclassificar com centro_origem_id que não bate com o centro atual do lançamento retorna false e não altera nada", async () => {
    const { db, entidade_id, periodo_id } = await montarBase();
    const imovelA = criarImovel(db, "A");
    const imovelB = criarImovel(db, "B");
    const centroA = criarCentroCustoImovel(db, entidade_id, imovelA, "A");
    const centroB = criarCentroCustoImovel(db, entidade_id, imovelB, "B");

    const lancamento_id = registrarLancamentoContabil(db, {
      entidade_id, periodo_id, conta_id: 5210, data_lancamento: "2025-01-10",
      valor_debito: 500, descricao: "Despesa", origem_modulo: "manual",
      origem_id: 1, referencia_documento: "T-X",
    });
    alocarLancamentoACentro(db, lancamento_id, centroA);

    // centro_origem_id errado (o lançamento está em centroA, não em centroB).
    const sucesso = reclassificarDespesaEntreCentros(
      db, lancamento_id, centroB, centroA, "Tentativa inválida",
    );
    expect(sucesso).toBe(false);

    const [linha] = consultar<{ centro_custo_id: number }>(
      db, "SELECT centro_custo_id FROM ledger_entries WHERE id = ?", [lancamento_id],
    );
    expect(linha.centro_custo_id).toBe(centroA);

    const logs = consultar(db, "SELECT id FROM log_alteracoes WHERE registro_id = ?", [lancamento_id]);
    expect(logs).toHaveLength(0);
  });
});
