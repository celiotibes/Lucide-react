import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar, consultar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarLancamentoContabil, encerrarPeriodo, gerarBalancete } from "../ledger";

/**
 * ACHADO (gravidade MODERADA/GRAVE) em ledger.ts::gerarBalancete.
 *
 * O comentário no próprio código já confessa o problema: `saldo_anterior: 0, //
 * Implementar saldo_anterior de ledger_saldos_periodo`. Ao fechar um período,
 * `criarSaldosProximoPeriodo()` GRAVA o saldo acumulado em `ledger_saldos_periodo`
 * (saldo_anterior/total_debito/total_credito/saldo_final por conta) para o período
 * seguinte — mas gerarBalancete() nunca lê essa tabela. Toda linha do balancete sai com
 * saldo_anterior fixo em zero, mesmo havendo dado gravado especificamente para preenchê-lo.
 *
 * Efeito para um laudo pericial: o balancete apresentado na tela de Fechamento de Período
 * (FechamentoPeriodo.tsx, que usa gerarBalancete) não mostra de onde vem o saldo de cada
 * conta — parece que toda conta começa do zero todo mês, mesmo com meses fechados antes com
 * saldo real. Isso é a MESMA classe de defeito confirmada separadamente em
 * relatorios-integrados.ts::gerarBalanco (ver balanco-patrimonial.test.ts), mas na função
 * mais antiga e mais central do módulo — a que o próprio fechamento de período usa para
 * decidir se pode fechar.
 *
 * Como reproduzir: `npx vitest run src/domain/erp/__auditoria__/ledger-saldo-anterior.test.ts`.
 *
 * Onde corrigir: src/domain/erp/ledger.ts::gerarBalancete — buscar saldo_anterior de
 * `ledger_saldos_periodo WHERE periodo_id = ? AND conta_id = ?` em vez do literal 0.
 */
describe("ledger: gerarBalancete nunca lê o saldo_anterior que criarSaldosProximoPeriodo grava", () => {
  it.fails("saldo_anterior da conta Caixa no período 2 deveria refletir o saldo final do período 1, fechado", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });

    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 1, 'aberto')", [entidade_id!]);
    const periodo1 = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=1")[0].id;

    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id: periodo1, conta_id: 1101,
      data_lancamento: "2025-01-10", valor_debito: 4000, descricao: "Aluguel",
      origem_modulo: "manual", origem_id: 1, referencia_documento: "T1",
    });
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id: periodo1, conta_id: 4101,
      data_lancamento: "2025-01-10", valor_credito: 4000, descricao: "Aluguel",
      origem_modulo: "manual", origem_id: 1, referencia_documento: "T1",
    });

    const fechamento = await encerrarPeriodo(db, periodo1, 1, "fechamento de teste");
    expect(fechamento.sucesso).toBe(true);

    const periodo2 = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=2")[0].id;

    // A prova de que o dado EXISTE: ledger_saldos_periodo foi gravado por
    // criarSaldosProximoPeriodo() com o saldo final de Caixa do período 1.
    const [saldoGravado] = consultar<{ saldo_anterior: number }>(
      db,
      "SELECT saldo_anterior FROM ledger_saldos_periodo WHERE periodo_id = ? AND conta_id = 1101",
      [periodo2],
    );
    expect(saldoGravado?.saldo_anterior).toBeCloseTo(4000, 2);

    // O que gerarBalancete deveria mostrar para a mesma conta, no mesmo período.
    const balancete = gerarBalancete(db, periodo2);
    const linhaCaixa = balancete.saldos.find((s) => s.conta_codigo === "1.1.01");
    expect(linhaCaixa?.saldo_anterior).toBeCloseTo(4000, 2);
  });
});
