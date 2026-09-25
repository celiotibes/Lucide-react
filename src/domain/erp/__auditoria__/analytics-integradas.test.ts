import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarLancamentoContabil } from "../ledger";
import {
  calcularComposicaoPatrimonio,
  calcularKPIRentabilidade,
  calcularOcupacao,
} from "../analytics-integradas";

/**
 * ACHADO (gravidade CRÍTICA): três indicadores de Analytics Integradas leem contas que não
 * existem no plano de contas real, ou a conta errada — todos silenciosamente saem R$ 0,00
 * ou com valor sem sentido em vez de acusar erro.
 *
 *   1. calcularOcupacao(): `receita_realizada` vem de `cp.codigo = '5.1.01'`. Essa conta
 *      NÃO EXISTE em PLANO_DE_CONTAS_ERP (planoDeContasErp.ts) — a receita de aluguel real
 *      é 4.1.01. Resultado: receita_realizada é sempre R$ 0,00 e gap_receita (potencial −
 *      realizada) sempre aparenta 100% de vacância, mesmo com o imóvel alugado e o aluguel
 *      pago em dia.
 *   2. calcularComposicaoPatrimonio(): "Depreciação Acumulada" vem de `cp.codigo = '2.2.01'`
 *      — também inexistente (a depreciação real, 5.3.01, é grupo 'despesa', não fica na
 *      faixa 2). valor_liquido_imoveis nunca desconta depreciação nenhuma, por mais que o
 *      razão tenha lançamentos reais de depreciação.
 *   3. calcularKPIRentabilidade(): `roi_patrimonio` divide o resultado do período pela soma
 *      das contas 2.1.01/2.1.02 — que são Capital Social e Lucros Acumulados (patrimônio
 *      líquido), não o valor investido em imóveis (1.2.05, ativo imobilizado). O indicador
 *      rotulado "ROI sobre patrimônio (imóveis)" na prática mede ROI sobre capital social.
 *
 * Efeito para um laudo pericial: os três indicadores parecem números válidos (não são nulos
 * nem NaN) mas medem a coisa errada ou nada. Um perito que os citasse estaria citando ruído
 * apresentado como métrica.
 *
 * Como reproduzir: `npx vitest run src/domain/erp/__auditoria__/analytics-integradas.test.ts`.
 *
 * Onde corrigir: src/domain/erp/analytics-integradas.ts —
 *   calcularOcupacao: trocar '5.1.01' por '4.1.01' (e AND cp.entidade_id/período, que a
 *     query atual também não filtra — lê de TODAS as entidades e períodos);
 *   calcularComposicaoPatrimonio: trocar '2.2.01' por '5.3.01';
 *   calcularKPIRentabilidade: trocar ('2.1.01','2.1.02') por ('1.2.05') para refletir
 *     imóveis, não patrimônio líquido.
 */
describe("analytics-integradas: contas fantasma nos indicadores", () => {
  it("calcularOcupacao deveria contar o aluguel recebido, mas usa uma conta inexistente (5.1.01)", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, financiado, uso_pessoal) VALUES (1, 'Kitnet 1', 'kitnet', 0, 0)`,
    );
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
       VALUES (1, 1, 'Fulano', 'residencial_fixo', 1200, '2025-01-01', NULL)`,
    );
    executar(
      db,
      "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 6, 'aberto')",
      [entidade_id!],
    );
    const periodo_id = 1;

    // Aluguel de R$ 1.200 efetivamente recebido — a mesma conta 4.1.01 que
    // mapeamentoPlanoApp.ts e o resto do sistema usam para receita de aluguel.
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!,
      periodo_id,
      conta_id: 1101,
      data_lancamento: "2025-06-05",
      valor_debito: 1200,
      descricao: "Aluguel recebido",
      origem_modulo: "manual",
      origem_id: 1,
      referencia_documento: "T1",
    });
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!,
      periodo_id,
      conta_id: 4101,
      data_lancamento: "2025-06-05",
      valor_credito: 1200,
      descricao: "Aluguel recebido",
      origem_modulo: "manual",
      origem_id: 1,
      referencia_documento: "T1",
    });

    const ocupacao = calcularOcupacao(db);
    expect(ocupacao.receita_realizada).toBeCloseTo(1200, 2);
  });

  it("calcularComposicaoPatrimonio deveria descontar a depreciação lançada, mas usa a conta errada (2.2.01)", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, financiado, uso_pessoal, valor_aquisicao) VALUES (1, 'Kitnet 1', 'kitnet', 0, 0, 300000)`,
    );
    executar(
      db,
      "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 6, 'aberto')",
      [entidade_id!],
    );
    const periodo_id = 1;

    // Depreciação de R$ 1.000 do mês, lançada na conta real de depreciação (5.3.01).
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!,
      periodo_id,
      conta_id: 5301, // Depreciação
      data_lancamento: "2025-06-30",
      valor_debito: 1000,
      descricao: "Depreciação — junho",
      origem_modulo: "manual",
      origem_id: 1,
      referencia_documento: "T2",
    });
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!,
      periodo_id,
      conta_id: 1205, // Imóveis — contrapartida da depreciação acumulada
      data_lancamento: "2025-06-30",
      valor_credito: 1000,
      descricao: "Depreciação — junho",
      origem_modulo: "manual",
      origem_id: 1,
      referencia_documento: "T2",
    });

    const patrimonio = calcularComposicaoPatrimonio(db);
    expect(patrimonio.valor_liquido_imoveis).toBeCloseTo(300000 - 1000, 2);
  });

  it("roi_patrimonio deveria usar o valor investido em imóveis (1.2.05), não capital social/lucros (2.1.01/02)", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    executar(
      db,
      "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 6, 'aberto')",
      [entidade_id!],
    );
    const periodo_id = 1;

    // Imóvel de R$ 200.000 no ativo, SEM nenhum lançamento em capital social/lucros
    // acumulados (2.1.01/2.1.02) — cenário plausível para uma pessoa física.
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!,
      periodo_id,
      conta_id: 1205,
      data_lancamento: "2025-06-01",
      valor_debito: 200000,
      descricao: "Imóvel",
      origem_modulo: "manual",
      origem_id: 1,
      referencia_documento: "T3",
    });
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!,
      periodo_id,
      conta_id: 1101,
      data_lancamento: "2025-06-01",
      valor_credito: 200000,
      descricao: "Imóvel",
      origem_modulo: "manual",
      origem_id: 1,
      referencia_documento: "T3",
    });
    // Resultado do período: receita de aluguel de R$ 2.000.
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!,
      periodo_id,
      conta_id: 1101,
      data_lancamento: "2025-06-10",
      valor_debito: 2000,
      descricao: "Aluguel",
      origem_modulo: "manual",
      origem_id: 2,
      referencia_documento: "T4",
    });
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!,
      periodo_id,
      conta_id: 4101,
      data_lancamento: "2025-06-10",
      valor_credito: 2000,
      descricao: "Aluguel",
      origem_modulo: "manual",
      origem_id: 2,
      referencia_documento: "T4",
    });

    const kpi = calcularKPIRentabilidade(db, entidade_id!, periodo_id);
    // Como não há nada em 2.1.01/2.1.02, o código hoje devolve roi_patrimonio = 0 (divisão
    // por zero tratada como 0) mesmo havendo R$ 200.000 investidos em imóvel e resultado
    // positivo no período — o indicador não reflete o patrimônio real.
    const roiEsperado = (kpi.resultado_liquido / 200000) * 100;
    expect(kpi.roi_patrimonio).toBeCloseTo(roiEsperado, 2);
  });
});
