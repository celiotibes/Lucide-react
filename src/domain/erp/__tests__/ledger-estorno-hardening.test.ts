/**
 * Testes de endurecimento: estornarLancamento (PARTE B)
 *
 * Testa:
 * 1. Rejeição de estorno duplo (já foi estornado)
 * 2. Estorno em período fechado vai para período aberto de hoje
 */

import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar, consultar } from "../../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "../entidadeLegal";
import { estornarLancamento } from "../ledger";

describe("PARTE B: Endurecimento de estornarLancamento", () => {
  async function bancoComRazao() {
    const db = await criarBancoDeTeste();
    executar(
      db,
      "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1,'T','0001','1','T','corrente')",
    );
    const { entidade_id } = criarEntidadeLegal(db, {
      nome: "Titular Teste",
      cpf_cnpj: "52998224725",
    });
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo)
       VALUES (1, 1, '2024-03-10', 2500, 'Aluguel recebido', '1.1.01')`,
    );
    sincronizarRazao(db, entidade_id!);
    const pernas = consultar<{ id: number; conta_id: number; periodo_id: number }>(
      db,
      "SELECT id, conta_id, periodo_id FROM ledger_entries WHERE origem_modulo = 'transacoes' AND origem_id = 1 ORDER BY id",
    );
    return { db, entidade_id: entidade_id!, pernas };
  }

  it("deve rejeitar estorno duplo com erro claro", async () => {
    const { db, pernas } = await bancoComRazao();
    const original = pernas[0];

    // Primeiro estorno funciona
    expect(estornarLancamento(db, original.id, "primeira vez", 1)).toBeGreaterThan(0);

    // Segundo estorno deve rejeitar
    expect(() => {
      estornarLancamento(db, original.id, "segunda vez", 1);
    }).toThrow(/já foi estornado/i);
  });

  it("estorno em período fechado lança em período aberto de hoje", async () => {
    const { db, pernas, entidade_id } = await bancoComRazao();
    const original = pernas[0];
    const periodo_id = pernas[0].periodo_id;

    // Fechar o período original
    executar(db, "UPDATE periodos_contabeis SET status = 'fechado' WHERE id = ?", [
      periodo_id,
    ]);

    // Simular "hoje" sendo em período diferente — criar período aberto para hoje
    const hoje = new Date();
    const anoHoje = hoje.getFullYear();
    const mesHoje = hoje.getMonth() + 1;

    // Verificar/criar período aberto para hoje
    const [periodoHoje] = consultar<{ id: number }>(
      db,
      "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = ? AND mes = ? AND status = 'aberto'",
      [entidade_id, anoHoje, mesHoje],
    );

    let periodoHojeId: number;
    if (!periodoHoje) {
      executar(
        db,
        "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, ?, ?, 'aberto')",
        [entidade_id, anoHoje, mesHoje],
      );
      const [novo] = consultar<{ id: number }>(
        db,
        "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = ? AND mes = ?",
        [entidade_id, anoHoje, mesHoje],
      );
      periodoHojeId = novo.id;
    } else {
      periodoHojeId = periodoHoje.id;
    }

    // Estornar lançamento do período fechado
    // A função deve detectar que período_id está fechado e lançar em periodoHojeId
    const estornoId = estornarLancamento(db, original.id, "período fechado", 1);

    const [estorno] = consultar<{
      periodo_id: number;
      estorno_de_id: number;
    }>(
      db,
      "SELECT periodo_id, estorno_de_id FROM ledger_entries WHERE id = ?",
      [estornoId],
    );

    // Estorno deve estar no período aberto de hoje, não no fechado
    expect(estorno.periodo_id).toBe(periodoHojeId);
    expect(estorno.estorno_de_id).toBe(original.id);

    // Original continua no período fechado
    const [orig] = consultar<{ periodo_id: number }>(
      db,
      "SELECT periodo_id FROM ledger_entries WHERE id = ?",
      [original.id],
    );
    expect(orig.periodo_id).toBe(periodo_id);
  });

  it("deve lançar erro se não houver período aberto para estorno em período fechado", async () => {
    const { db, pernas, entidade_id } = await bancoComRazao();
    const original = pernas[0];
    const periodo_id = pernas[0].periodo_id;

    // Fechar o período original
    executar(db, "UPDATE periodos_contabeis SET status = 'fechado' WHERE id = ?", [
      periodo_id,
    ]);

    // Fechar TODOS os períodos do mês de hoje também
    const hoje = new Date();
    const anoHoje = hoje.getFullYear();
    const mesHoje = hoje.getMonth() + 1;

    executar(
      db,
      "UPDATE periodos_contabeis SET status = 'fechado' WHERE entidade_id = ? AND ano = ? AND mes = ?",
      [entidade_id, anoHoje, mesHoje],
    );

    // Tentar estornar deve falhar com mensagem clara
    expect(() => {
      estornarLancamento(db, original.id, "sem período aberto", 1);
    }).toThrow(/nenhum período aberto/i);
  });
});
