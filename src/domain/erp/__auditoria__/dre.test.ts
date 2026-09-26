import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar, consultar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarLancamentoContabil } from "../ledger";
import { gerarDRE } from "../relatorios-integrados";

/**
 * ACHADOS (gravidade CRÍTICA) em relatorios-integrados.ts::gerarDRE (e o gêmeo idêntico
 * gerarDREComFiltro).
 *
 * 1. Dupla contagem de "Juros recebidos" (4.2.01) e "Outras receitas" (4.3.01). A função
 *    soma as duas contas dentro de `receitas.total_receitas` (que entra em
 *    resultado_operacional) e DE NOVO em resultado_final, via
 *    `+ receitaJurosJuros + receitaMulta` — que são a MESMA consulta, à mesma conta,
 *    somadas outra vez. O lucro final sai inflado pelo dobro de juros recebidos + outras
 *    receitas em qualquer período que tenha uma delas.
 *
 * 2. "despesa_juros_financiamento" lê a conta 6.3.01 — que é Honorários Advocatícios, não
 *    juros de financiamento. A conta real de juros de financiamento é 5.5.01
 *    (mapeamentoPlanoApp.ts mapeia "2.1.05 Financiamento — juros" para 5501 =
 *    "Financiamento imobiliário — juros"). Efeito duplo: (a) despesa de honorários
 *    advocatícios é rotulada como se fosse juro de financiamento; (b) o juro de
 *    financiamento real (5.5.01) nunca aparece em NENHUM lugar da DRE — nem em custos, nem
 *    em juros_e_multas — porque a query que deveria somá-lo não existe.
 *
 * Efeito para um laudo pericial: o resultado final apresentado não corresponde à soma
 * algébrica correta de receitas menos despesas do período — está inflado pela dupla
 * contagem, e uma despesa real (juro de financiamento, que RESPONDE por reduzir o
 * resultado) simplesmente não é computada, enquanto honorários de advocacia são
 * apresentados sob um rótulo que não é o deles.
 *
 * Como reproduzir: `npx vitest run src/domain/erp/__auditoria__/dre.test.ts`.
 *
 * Onde corrigir: src/domain/erp/relatorios-integrados.ts, gerarDRE E gerarDREComFiltro —
 * remover receitaJurosJuros/receitaMulta de resultado_final (já estão em total_receitas), e
 * trocar a conta de despesa_juros_financiamento/despesa_juros_mora para as reais (5.5.01
 * para juros de financiamento; não há conta dedicada a "juros de mora" hoje — 6.3.01/6.3.02
 * são honorários/custas judiciais, categoria diferente).
 */
describe("relatorios-integrados: gerarDRE conta duas vezes e usa contas erradas", () => {
  it("juros recebidos e outras receitas não deveriam ser somados duas vezes no resultado final", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 5, 'aberto')", [entidade_id!]);
    const periodo_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=5")[0].id;

    const lancar = (conta_id: number, debito: number | undefined, credito: number | undefined, ref: string) =>
      registrarLancamentoContabil(db, {
        entidade_id: entidade_id!, periodo_id, conta_id,
        data_lancamento: "2025-05-10", valor_debito: debito, valor_credito: credito,
        descricao: ref, origem_modulo: "manual", origem_id: 1, referencia_documento: ref,
      });

    // Aluguel R$ 1.000, juros recebidos R$ 100, outras receitas R$ 50 — nenhuma despesa.
    lancar(1101, 1150, undefined, "CAIXA-REC");
    lancar(4101, undefined, 1000, "ALUGUEL");
    lancar(4201, undefined, 100, "JUROS");
    lancar(4301, undefined, 50, "OUTRAS");

    const dre = gerarDRE(db, entidade_id!, periodo_id);
    // Resultado correto: 1000 + 100 + 50 = 1150 (nenhuma despesa no cenário).
    expect(dre.resultado_final).toBeCloseTo(1150, 2);
  });

  it("o juro real de financiamento (5.5.01) deveria reduzir o resultado da DRE, mas não aparece em lugar nenhum", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 6, 'aberto')", [entidade_id!]);
    const periodo_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=6")[0].id;

    const lancar = (conta_id: number, debito: number | undefined, credito: number | undefined, ref: string) =>
      registrarLancamentoContabil(db, {
        entidade_id: entidade_id!, periodo_id, conta_id,
        data_lancamento: "2025-06-10", valor_debito: debito, valor_credito: credito,
        descricao: ref, origem_modulo: "manual", origem_id: 1, referencia_documento: ref,
      });

    // Aluguel R$ 2.000 recebido; R$ 300 de juros de financiamento pagos (conta real 5.5.01).
    lancar(1101, 2000, undefined, "ALUGUEL-CAIXA");
    lancar(4101, undefined, 2000, "ALUGUEL");
    lancar(5501, 300, undefined, "JUROS-FINANC");
    lancar(1101, undefined, 300, "JUROS-FINANC-CAIXA");

    const dre = gerarDRE(db, entidade_id!, periodo_id);
    // Resultado correto: 2000 receita − 300 juro de financiamento = 1700.
    expect(dre.resultado_final).toBeCloseTo(1700, 2);
  });
});
