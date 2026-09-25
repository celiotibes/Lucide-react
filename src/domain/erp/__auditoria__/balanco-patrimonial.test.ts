import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar, consultar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarLancamentoContabil, encerrarPeriodo } from "../ledger";
import { gerarBalanco } from "../relatorios-integrados";

/**
 * ACHADOS (gravidade CRÍTICA) em relatorios-integrados.ts::gerarBalanco /
 * gerarBalancoComFiltro — o Balanço Patrimonial da tela "Relatórios Integrados".
 *
 * 1. Balanço calculado como MOVIMENTO DO PERÍODO, não saldo acumulado. Todas as consultas
 *    (getAtivoConta, getPassivoConta, getPatrimonioLiquidoConta) filtram
 *    `le.periodo_id = ?` — somam só os lançamentos daquele mês. Um balanço patrimonial é,
 *    por definição, uma FOTOGRAFIA acumulada até o fim do período, não o fluxo do mês. Isso
 *    é o mesmo problema, com outra cara, do "saldo_anterior: 0" documentado em
 *    ledger.ts::gerarBalancete: mesmo com criarSaldosProximoPeriodo() gravando o saldo
 *    acumulado em `ledger_saldos_periodo` a cada fechamento, gerarBalanco() nunca lê essa
 *    tabela. Resultado: caixa que entrou em janeiro e nunca saiu desaparece do Ativo
 *    apresentado em fevereiro.
 *
 * 2. Incompatibilidade entre prefixo de código e grupo real do plano de contas. O código
 *    usa "1.%"/"2.%" para ativo circulante/não-circulante e "4.%" para patrimônio líquido —
 *    mas no plano real (planoDeContasErp.ts) TODO ativo é "1.x" (não há ativo "2.x": a
 *    faixa 2 é patrimônio líquido) e patrimônio líquido é "2.x" (não "4.x": a faixa 4 é
 *    receita). Efeito:
 *      a) Ativo Não-Circulante (`getAtivoConta("2.%")` AND grupo='ativo') é SEMPRE R$ 0,00
 *         — nenhuma conta de ativo tem código começando em "2.".
 *      b) Patrimônio Líquido (`getPatrimonioLiquidoConta("4.%")` AND
 *         grupo='patrimonio_liquido') é SEMPRE R$ 0,00 — Capital Social (2.1.01) e Lucros
 *         Acumulados (2.1.02) existem no razão mas ficam de fora do balanço inteiro (não
 *         aparecem em ativo, nem em passivo, nem em PL).
 *      c) Depósitos de caução recebidos (3.3.01, passivo) não batem nem em "3.1%" nem em
 *         "3.2%" — a caução simplesmente desaparece do total do passivo, embora seja
 *         dinheiro de terceiro que o locador deve.
 *
 * Efeito para um laudo pericial: o Balanço Patrimonial gerado pelo sistema não fecha
 * (Ativo ≠ Passivo + PL) para qualquer entidade real, e some justamente com as três coisas
 * que a tarefa de auditoria pediu para verificar: caução (passivo), capital/lucros
 * acumulados (PL) e qualquer saldo carregado de meses anteriores.
 *
 * Como reproduzir: `npx vitest run src/domain/erp/__auditoria__/balanco-patrimonial.test.ts`.
 *
 * Onde corrigir: src/domain/erp/relatorios-integrados.ts (gerarBalanco e
 * gerarBalancoComFiltro) — (1) somar o saldo acumulado até o período, não só o movimento
 * do mês (via ledger_saldos_periodo ou soma cumulativa por periodo_id <= X); (2) alinhar os
 * filtros de prefixo ao grupo real de cada conta, e incluir 3.3.01 no passivo.
 */
describe("relatorios-integrados: gerarBalanco não acumula saldo e some com contas reais", () => {
  it.fails("o caixa recebido em um período fechado deveria continuar no Ativo do período seguinte", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });

    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 1, 'aberto')", [entidade_id!]);
    const periodo1 = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=1")[0].id;

    // Janeiro: aluguel de R$ 5.000 recebido e nunca gasto.
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id: periodo1, conta_id: 1101,
      data_lancamento: "2025-01-10", valor_debito: 5000, descricao: "Aluguel",
      origem_modulo: "manual", origem_id: 1, referencia_documento: "T1",
    });
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id: periodo1, conta_id: 4101,
      data_lancamento: "2025-01-10", valor_credito: 5000, descricao: "Aluguel",
      origem_modulo: "manual", origem_id: 1, referencia_documento: "T1",
    });

    await encerrarPeriodo(db, periodo1, 1, "fechamento de teste");

    const periodo2 = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=2")[0].id;
    // Fevereiro: nenhum lançamento novo — o caixa de janeiro continua lá, intocado.

    const balanco = gerarBalanco(db, entidade_id!, periodo2);
    // O caixa acumulado (R$ 5.000) deveria continuar aparecendo no Ativo de fevereiro.
    expect(balanco.ativo.total_ativo).toBeCloseTo(5000, 2);
  });

  it.fails("depósito de caução (passivo, 3.3.01) deveria entrar no total do passivo", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 3, 'aberto')", [entidade_id!]);
    const periodo_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=3")[0].id;

    // Caução recebida de R$ 1.200 — dinheiro do inquilino em poder do locador (passivo).
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id, conta_id: 1101,
      data_lancamento: "2025-03-01", valor_debito: 1200, descricao: "Caução recebida",
      origem_modulo: "caucao", origem_id: 1, referencia_documento: "CAUCAO-1",
    });
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id, conta_id: 3301, // Depósitos caução recebidos
      data_lancamento: "2025-03-01", valor_credito: 1200, descricao: "Caução recebida",
      origem_modulo: "caucao", origem_id: 1, referencia_documento: "CAUCAO-1",
    });

    const balanco = gerarBalanco(db, entidade_id!, periodo_id);
    expect(balanco.passivo.total_passivo).toBeCloseTo(1200, 2);
  });

  it.fails("capital social lançado (2.1.01, PL) deveria aparecer em patrimônio_liquido, não desaparecer do balanço", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 4, 'aberto')", [entidade_id!]);
    const periodo_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=4")[0].id;

    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id, conta_id: 1101,
      data_lancamento: "2025-04-01", valor_debito: 10000, descricao: "Integralização de capital",
      origem_modulo: "manual", origem_id: 1, referencia_documento: "CAP-1",
    });
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id, conta_id: 2101, // Capital social
      data_lancamento: "2025-04-01", valor_credito: 10000, descricao: "Integralização de capital",
      origem_modulo: "manual", origem_id: 1, referencia_documento: "CAP-1",
    });

    const balanco = gerarBalanco(db, entidade_id!, periodo_id);
    expect(balanco.patrimonio_liquido).toBeCloseTo(10000, 2);
  });
});
