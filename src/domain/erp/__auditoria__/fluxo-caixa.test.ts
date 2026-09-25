import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar, consultar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarLancamentoContabil } from "../ledger";
import { gerarFluxoCaixa, gerarFluxoCaixaComFiltro } from "../relatorios-integrados";

/**
 * ACHADOS (gravidade GRAVE) em relatorios-integrados.ts — Fluxo de Caixa.
 *
 * 1. gerarFluxoCaixa() (a versão SEM filtro, a que a tela usa por padrão) busca a
 *    aquisição de imóvel na conta "2.1.01" — que é Capital Social (patrimônio líquido,
 *    natureza crédito), não Imóveis. A conta real do ativo imobilizado é "1.2.05", que é
 *    exatamente a que gerarFluxoCaixaComFiltro() (a versão filtrada) usa. As duas funções,
 *    chamadas para o MESMO período com os MESMOS dados, dão respostas diferentes: uma obra
 *    capitalizada nunca aparece em "Investimento" no relatório principal — só na versão
 *    filtrada. Isso é exatamente o caso que a tarefa de auditoria pediu para checar: "obra
 *    capitaliza no ativo" — aqui capitaliza, mas o relatório principal não mostra.
 *
 * 2. `saldo_final: Math.max(0, saldo_final)` em ambas as versões esconde caixa negativo. Um
 *    saldo de caixa realmente negativo (a situação mais crítica para revelar problema de
 *    liquidez) é apresentado como R$ 0,00 — não como o dado real.
 *
 * Como reproduzir: `npx vitest run src/domain/erp/__auditoria__/fluxo-caixa.test.ts`.
 *
 * Onde corrigir: src/domain/erp/relatorios-integrados.ts — gerarFluxoCaixa: trocar
 * `cp.codigo = '2.1.01'` por `cp.codigo = '1.2.05'` nas consultas de aquisições (linhas
 * ~449 e a query de "Amortizações" segue correta, em 3.2.01); e remover o
 * `Math.max(0, ...)` do saldo_final nas duas funções (ou, se a intenção é não permitir
 * saldo negativo NA EXIBIÇÃO, sinalizar o déficit separadamente em vez de apagá-lo).
 */
describe("relatorios-integrados: Fluxo de Caixa diverge entre as duas versões e esconde caixa negativo", () => {
  it.fails("aquisição de imóvel deveria aparecer em Investimento também na versão sem filtro (usa conta 2.1.01 em vez de 1.2.05)", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 7, 'aberto')", [entidade_id!]);
    const periodo_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=7")[0].id;

    // Compra de imóvel/obra capitalizada: R$ 80.000, débito em Imóveis (1.2.05), crédito
    // em Caixa — exatamente como migracao-ledger.ts/mapeamentoPlanoApp.ts fazem para
    // "2.1.03 Obra / capex".
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id, conta_id: 1205,
      data_lancamento: "2025-07-05", valor_debito: 80000, descricao: "Obra capitalizada",
      origem_modulo: "patrimonio", origem_id: 1, referencia_documento: "OBRA-1",
    });
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id, conta_id: 1101,
      data_lancamento: "2025-07-05", valor_credito: 80000, descricao: "Obra capitalizada",
      origem_modulo: "patrimonio", origem_id: 1, referencia_documento: "OBRA-1",
    });

    const semFiltro = gerarFluxoCaixa(db, entidade_id!, periodo_id);
    const comFiltro = gerarFluxoCaixaComFiltro(db, entidade_id!, periodo_id);

    // As duas versões deveriam concordar sobre o mesmo fato.
    expect(semFiltro.investimento.aquisicoes).toBeCloseTo(comFiltro.investimento.aquisicoes, 2);
    expect(semFiltro.investimento.aquisicoes).toBeCloseTo(80000, 2);
  });

  it.fails("saldo de caixa negativo não deveria ser apresentado como R$ 0,00", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 8, 'aberto')", [entidade_id!]);
    const periodo_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=8")[0].id;

    // Despesa de R$ 500 paga do caixa sem nenhuma entrada no período — saldo deveria fechar
    // em -500 (situação real de descoberto/dívida, não zero).
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id, conta_id: 5210, // Condomínio
      data_lancamento: "2025-08-10", valor_debito: 500, descricao: "Condomínio pago",
      origem_modulo: "manual", origem_id: 1, referencia_documento: "COND-1",
    });
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id, conta_id: 1101,
      data_lancamento: "2025-08-10", valor_credito: 500, descricao: "Condomínio pago",
      origem_modulo: "manual", origem_id: 1, referencia_documento: "COND-1",
    });

    const fluxo = gerarFluxoCaixa(db, entidade_id!, periodo_id);
    expect(fluxo.saldo_final).toBeCloseTo(-500, 2);
  });
});
