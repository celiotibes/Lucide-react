import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarLancamentoContabil } from "../ledger";
import { calcularBudgetVariance } from "../budget-variance";

/**
 * ACHADO (gravidade CRÍTICA): Orçado vs. Realizado sempre mostra R$ 0,00 de receita
 * realizada, e quase sempre R$ 0,00 de despesa realizada — mesmo com o razão cheio.
 *
 * `calcularBudgetVariance()` filtra as linhas de receita por
 * `cp.grupo = 'receita' AND cp.codigo LIKE '5.1%'` e as de despesa por
 * `cp.grupo = 'despesa' AND cp.codigo LIKE '6.1%'`. Essa é a convenção ANTIGA do plano de
 * contas (a que o cabeçalho de planoDeContasErp.ts descreve como já abandonada: "a faixa 5
 * valia como despesa nos módulos e como receita no fixture"). No plano real
 * (PLANO_DE_CONTAS_ERP), receita é a faixa 4.x (4.1.01 Receita de aluguel etc.) e despesa é
 * 5.2/5.3/5.5/6.x — nenhuma conta com `grupo = 'receita'` tem código começando em "5.1", e
 * a única despesa com prefixo "6.1" é 6.1.01 "Despesa com aluguel", que nenhum módulo do
 * sistema lança (mapeamentoPlanoApp.ts nunca gera essa conta).
 *
 * Efeito para um laudo pericial: o relatório de Orçado vs. Realizado classifica a receita
 * real como 100% abaixo do orçado ("crítico") em QUALQUER período com dados reais,
 * independentemente do que de fato entrou — porque o "realizado" nunca é lido da conta
 * certa. Um perito que confiasse nesse relatório concluiria erroneamente que a operação
 * nunca bate a meta, quando na verdade o relatório nunca lê a receita nenhuma.
 *
 * Como reproduzir: `npx vitest run src/domain/erp/__auditoria__/budget-variance.test.ts`.
 *
 * Onde corrigir: src/domain/erp/budget-variance.ts — trocar `codigo LIKE '5.1%'` (receita)
 * por `codigo LIKE '4.1%'` (ou grupo = 'receita' sem prefixo) e `codigo LIKE '6.1%'`
 * (despesa) pelas faixas reais de despesa (5.2/5.3/5.5/6.x), conforme planoDeContasErp.ts.
 */
describe("budget-variance: Orçado vs. Realizado nunca lê a receita ou a despesa reais", () => {
  it("receitas_realizadas deveria refletir o aluguel lançado no razão, mas sai R$ 0,00", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    expect(entidade_id).toBeDefined();

    executar(
      db,
      "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 6, 'aberto')",
      [entidade_id!],
    );
    const periodo_id = 1;

    // Aluguel de R$ 3.000 efetivamente recebido e lançado no razão (débito Caixa,
    // crédito Receita de aluguel — 4.1.01, id 4101).
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!,
      periodo_id,
      conta_id: 1101, // Caixa
      data_lancamento: "2025-06-05",
      valor_debito: 3000,
      descricao: "Aluguel recebido — junho",
      origem_modulo: "manual",
      origem_id: 1,
      referencia_documento: "TESTE-1",
    });
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!,
      periodo_id,
      conta_id: 4101, // Receita de aluguel
      data_lancamento: "2025-06-05",
      valor_credito: 3000,
      descricao: "Aluguel recebido — junho",
      origem_modulo: "manual",
      origem_id: 1,
      referencia_documento: "TESTE-1",
    });

    const resumo = calcularBudgetVariance(db, entidade_id!, periodo_id);

    // O que um perito esperaria: a receita realizada bate com os R$ 3.000 lançados.
    expect(resumo.receitas_realizadas).toBeCloseTo(3000, 2);
  });
});
