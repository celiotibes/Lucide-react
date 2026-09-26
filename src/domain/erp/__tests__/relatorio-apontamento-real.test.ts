/**
 * relatorio-apontamento-real.ts contra o schema real (criarBancoDeTeste()): apontamentos_diarios,
 * itens_remuneraveis, movimentacoes_financeiras e fechamentos_semanais. Substitui o antigo
 * relatorios-apontamento.ts (removido — consultava tabelas fictícias, ver
 * docs/dominios-a-reconstruir.md seção 8).
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import {
  relatorioResumoApontamentos,
  relatorioDespesasRemuneracao,
  relatorioComparativoPrestadores,
  relatorioStatusPagamento,
} from "../relatorio-apontamento-real";

let db: Database;
let prestadorAnaId: number;
let prestadorBrunoId: number;

function criarPrestador(nome: string, servico = "faxina"): number {
  executar(db, "INSERT INTO prestadores (nome, servico) VALUES (?, ?)", [nome, servico]);
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

function criarApontamento(
  prestadorId: number,
  data: string,
  horarios: { entrada: string; saida_intervalo?: string; retorno_intervalo?: string; saida_final: string },
  status = "aprovado",
): number {
  executar(
    db,
    `INSERT INTO apontamentos_diarios (prestador_id, data, entrada, saida_intervalo, retorno_intervalo, saida_final, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [prestadorId, data, horarios.entrada, horarios.saida_intervalo ?? null, horarios.retorno_intervalo ?? null, horarios.saida_final, status],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

function adicionarItem(apontamentoId: number, tipo: string, rubrica: string, valorFinal: number): void {
  executar(
    db,
    `INSERT INTO itens_remuneraveis (apontamento_id, tipo, rubrica, valor_base, valor_final) VALUES (?, ?, ?, ?, ?)`,
    [apontamentoId, tipo, rubrica, valorFinal, valorFinal],
  );
}

beforeEach(async () => {
  db = await criarBancoDeTeste();
  prestadorAnaId = criarPrestador("Ana");
  prestadorBrunoId = criarPrestador("Bruno");
});

describe("relatorioResumoApontamentos", () => {
  it("agrega horas, valores por tipo e contagem por status, por prestador", () => {
    const apt1 = criarApontamento(prestadorAnaId, "2026-03-02", {
      entrada: "08:00:00",
      saida_intervalo: "12:00:00",
      retorno_intervalo: "13:00:00",
      saida_final: "17:00:00",
    });
    adicionarItem(apt1, "diaria", "Diária integral", 160);
    adicionarItem(apt1, "deslocamento", "Deslocamento", 21);

    const apt2 = criarApontamento(
      prestadorAnaId,
      "2026-03-03",
      { entrada: "09:00:00", saida_final: "13:00:00" },
      "retificado",
    );
    adicionarItem(apt2, "urgencia", "Urgência dia útil", 50);

    const aptBruno = criarApontamento(prestadorBrunoId, "2026-03-02", { entrada: "10:00:00", saida_final: "12:00:00" });
    adicionarItem(aptBruno, "airbnb", "Airbnb 1 quarto", 31.5);

    const resumo = relatorioResumoApontamentos(db, { data_inicio: "2026-03-01", data_fim: "2026-03-31" });

    expect(resumo.prestadores_ativos).toBe(2);
    expect(resumo.total_apontamentos).toBe(3);

    const ana = resumo.por_prestador.find((p) => p.prestador_id === prestadorAnaId)!;
    expect(ana.total_apontamentos).toBe(2);
    expect(ana.horas_apontadas).toBeCloseTo(8 + 4, 2); // 8h (com intervalo) + 4h
    expect(ana.valor_por_tipo.diaria).toBe(160);
    expect(ana.valor_por_tipo.deslocamento).toBe(21);
    expect(ana.valor_por_tipo.urgencia).toBe(50);
    expect(ana.valor_total).toBe(160 + 21 + 50);
    expect(ana.por_status.aprovado).toBe(1);
    expect(ana.por_status.retificado).toBe(1);

    const bruno = resumo.por_prestador.find((p) => p.prestador_id === prestadorBrunoId)!;
    expect(bruno.valor_por_tipo.airbnb).toBe(31.5);

    expect(resumo.valor_total_geral).toBeCloseTo(160 + 21 + 50 + 31.5, 2);
  });

  it("filtra por prestador_id", () => {
    const apt = criarApontamento(prestadorAnaId, "2026-03-02", { entrada: "08:00:00", saida_final: "12:00:00" });
    adicionarItem(apt, "diaria", "Diária", 100);
    criarApontamento(prestadorBrunoId, "2026-03-02", { entrada: "08:00:00", saida_final: "12:00:00" });

    const resumo = relatorioResumoApontamentos(db, { prestador_id: prestadorAnaId });

    expect(resumo.prestadores_ativos).toBe(1);
    expect(resumo.por_prestador[0].prestador_id).toBe(prestadorAnaId);
  });

  it("apontamento em rascunho sem horários não quebra o cálculo de horas", () => {
    executar(db, `INSERT INTO apontamentos_diarios (prestador_id, data, entrada, saida_final, status) VALUES (?, ?, '', '', 'rascunho')`, [
      prestadorAnaId,
      "2026-03-05",
    ]);

    const resumo = relatorioResumoApontamentos(db, {});
    const ana = resumo.por_prestador.find((p) => p.prestador_id === prestadorAnaId)!;
    expect(ana.horas_apontadas).toBe(0);
    expect(ana.por_status.rascunho).toBe(1);
  });
});

describe("relatorioDespesasRemuneracao", () => {
  it("distribui valores por rubrica com percentual e detalhamento", () => {
    const apt1 = criarApontamento(prestadorAnaId, "2026-03-02", { entrada: "08:00:00", saida_final: "12:00:00" });
    adicionarItem(apt1, "diaria", "Diária", 100);
    const apt2 = criarApontamento(prestadorBrunoId, "2026-03-03", { entrada: "08:00:00", saida_final: "12:00:00" });
    adicionarItem(apt2, "urgencia", "Urgência", 50);

    const despesas = relatorioDespesasRemuneracao(db, {});

    expect(despesas.total_geral).toBe(150);
    expect(despesas.por_tipo.diaria.valor).toBe(100);
    expect(despesas.por_tipo.diaria.percentual).toBeCloseTo((100 / 150) * 100, 2);
    expect(despesas.por_tipo.urgencia.valor).toBe(50);
    expect(despesas.por_tipo.diaria.detalhamento).toHaveLength(1);
    expect(despesas.por_tipo.diaria.detalhamento[0].prestador_nome).toBe("Ana");
  });

  it("sem lançamentos no período, percentuais não viram NaN", () => {
    const despesas = relatorioDespesasRemuneracao(db, { data_inicio: "2099-01-01", data_fim: "2099-01-31" });
    expect(despesas.total_geral).toBe(0);
    expect(despesas.por_tipo.diaria.percentual).toBe(0);
  });
});

describe("relatorioComparativoPrestadores", () => {
  it("identifica o prestador mais ativo, de maior valor e de maior valor/hora", () => {
    // Ana: 2 apontamentos, valor alto, poucas horas => maior valor/hora
    const apt1 = criarApontamento(prestadorAnaId, "2026-03-02", { entrada: "08:00:00", saida_final: "10:00:00" });
    adicionarItem(apt1, "urgencia", "Urgência", 200);
    const apt2 = criarApontamento(prestadorAnaId, "2026-03-03", { entrada: "08:00:00", saida_final: "10:00:00" });
    adicionarItem(apt2, "urgencia", "Urgência", 200);

    // Bruno: mais apontamentos (3), valor total menor, mais horas => menor valor/hora
    for (const dia of ["2026-03-04", "2026-03-05", "2026-03-06"]) {
      const apt = criarApontamento(prestadorBrunoId, dia, { entrada: "08:00:00", saida_final: "16:00:00" });
      adicionarItem(apt, "diaria", "Diária", 50);
    }

    const comparativo = relatorioComparativoPrestadores(db, {});

    expect(comparativo.agregados.prestador_mais_ativo?.nome).toBe("Bruno");
    expect(comparativo.agregados.prestador_maior_valor?.nome).toBe("Ana"); // 400 > 150
    expect(comparativo.agregados.prestador_maior_valor_hora?.nome).toBe("Ana"); // 200/2h = 100 > 50/8h

    const ana = comparativo.prestadores.find((p) => p.prestador_nome === "Ana")!;
    expect(ana.valor_medio_apontamento).toBe(200);
    expect(ana.valor_por_hora).toBeCloseTo(100, 2);
  });

  it("prestador sem horas apontadas não gera divisão por zero (valor_por_hora null)", () => {
    const apt = criarApontamento(prestadorAnaId, "2026-03-02", { entrada: "", saida_final: "" }, "rascunho");
    adicionarItem(apt, "diaria", "Diária", 100);

    const comparativo = relatorioComparativoPrestadores(db, {});
    const ana = comparativo.prestadores.find((p) => p.prestador_nome === "Ana")!;
    expect(ana.valor_por_hora).toBeNull();
  });

  it("taxa de retificação reflete apontamentos retificados sobre o total", () => {
    criarApontamento(prestadorAnaId, "2026-03-02", { entrada: "08:00:00", saida_final: "12:00:00" }, "retificado");
    criarApontamento(prestadorAnaId, "2026-03-03", { entrada: "08:00:00", saida_final: "12:00:00" }, "aprovado");

    const comparativo = relatorioComparativoPrestadores(db, {});
    const ana = comparativo.prestadores.find((p) => p.prestador_nome === "Ana")!;
    expect(ana.taxa_retificacao).toBeCloseTo(50, 2);
  });
});

describe("relatorioStatusPagamento", () => {
  it("agrega fechamentos semanais e movimentações financeiras por prestador", () => {
    executar(
      db,
      `INSERT INTO fechamentos_semanais (prestador_id, data_inicio, data_fim, valor_bruto, valor_liquido, status)
       VALUES (?, '2026-03-02', '2026-03-08', 500, 450, 'fechado')`,
      [prestadorAnaId],
    );
    executar(
      db,
      `INSERT INTO fechamentos_semanais (prestador_id, data_inicio, data_fim, valor_bruto, valor_liquido, status)
       VALUES (?, '2026-02-23', '2026-03-01', 400, 400, 'pago')`,
      [prestadorAnaId],
    );

    const apt = criarApontamento(prestadorAnaId, "2026-03-02", { entrada: "08:00:00", saida_final: "12:00:00" });
    executar(
      db,
      `INSERT INTO movimentacoes_financeiras (apontamento_id, tipo, valor, data_solicitacao, status) VALUES (?, 'vale', 100, '2026-03-02', 'pendente')`,
      [apt],
    );
    executar(
      db,
      `INSERT INTO movimentacoes_financeiras (apontamento_id, tipo, valor, data_solicitacao, status) VALUES (?, 'emprestimo', 300, '2026-03-02', 'descontado')`,
      [apt],
    );

    const status = relatorioStatusPagamento(db, {});
    const ana = status.prestadores.find((p) => p.prestador_id === prestadorAnaId)!;

    expect(ana.fechamentos.quantidade_por_status.fechado).toBe(1);
    expect(ana.fechamentos.quantidade_por_status.pago).toBe(1);
    // valor_pendente_pagamento só soma os != 'pago' (o de 450, não o de 400 já pago)
    expect(ana.fechamentos.valor_pendente_pagamento).toBe(450);

    expect(ana.movimentacoes.quantidade_por_status.pendente).toBe(1);
    expect(ana.movimentacoes.valor_por_tipo.vale).toBe(100);
    expect(ana.movimentacoes.valor_por_tipo.emprestimo).toBe(300);
    expect(ana.movimentacoes.valor_pendente_aprovacao).toBe(100);

    expect(status.totalizadores.valor_pendente_pagamento_total).toBe(450);
    expect(status.totalizadores.valor_pendente_aprovacao_total).toBe(100);
  });

  it("sem nenhum fechamento ou movimentação, devolve lista vazia sem quebrar", () => {
    const status = relatorioStatusPagamento(db, {});
    expect(status.prestadores).toHaveLength(0);
    expect(status.totalizadores.valor_pendente_pagamento_total).toBe(0);
  });
});
