/**
 * Relatórios Integrados ERP
 * DRE (Demonstração de Resultado), Balanço Patrimonial, Fluxo de Caixa
 * Baseado em ledger_entries com novo plano de contas integrado
 *
 * Suporte a filtro por origem_modulo para análise de receitas/despesas por módulo
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export type OrigemModulo =
  | "transacoes"
  | "contratos"
  | "patrimonio"
  | "caucao"
  | "financiamento"
  | "rateio"
  | "vistorias"
  | "advocacia"
  | "contas-pessoais"
  | "imovel-gestao"
  | "apontamento-prestador"
  | "pagamentos"
  | "manual";

export interface LancamentoPorModulo {
  conta_id: number;
  conta_codigo: string;
  conta_descricao: string;
  origem_modulo: OrigemModulo;
  valor_debito: number;
  valor_credito: number;
  saldo: number;
  descricao: string;
  data_lancamento: string;
  referencia_documento: string;
}

export interface RelatorioAuditoriaModulo {
  origem_modulo: OrigemModulo;
  total_lancamentos: number;
  total_debito: number;
  total_credito: number;
  saldo_liquido: number;
  linhas: LancamentoPorModulo[];
}

export interface LinhasDRE {
  receitas: {
    aluguel: number;
    reajustes: number;
    rateios: number;
    juros: number;
    outras_receitas: number;
    total_receitas: number;
  };
  custos: {
    condominio: number;
    agua_esgoto: number;
    eletricidade: number;
    internet: number;
    manutencao: number;
    limpeza: number;
    seguros: number;
    depreciacao: number;
    total_custos: number;
  };
  resultado_operacional: number;
  juros_e_multas: {
    despesa_juros_financiamento: number;
    despesa_juros_mora: number;
    receita_juros: number;
    receita_multa: number;
    resultado_juros: number;
  };
  provisoes: {
    provisao_devedora: number;
  };
  resultado_final: number;
}

/**
 * Obtém lançamentos brutos de um módulo específico
 * @param db Database
 * @param entidade_id ID da entidade legal
 * @param periodo_id ID do período contábil
 * @param origem_modulo Módulo de origem (opcional)
 * @returns Array de lançamentos com detalhes de conta
 */
export function obterLancamentosParModulo(
  db: Database,
  entidade_id: number,
  periodo_id: number,
  origem_modulo?: string,
): LancamentoPorModulo[] {
  let query = `
    SELECT
      le.conta_id,
      cp.codigo as conta_codigo,
      cp.descricao as conta_descricao,
      le.origem_modulo,
      COALESCE(le.valor_debito, 0) as valor_debito,
      COALESCE(le.valor_credito, 0) as valor_credito,
      (COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0)) as saldo,
      le.descricao,
      le.data_lancamento,
      le.referencia_documento
    FROM ledger_entries le
    INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
    WHERE le.entidade_id = ? AND le.periodo_id = ?
  `;

  const params: (number | string)[] = [entidade_id, periodo_id];

  if (origem_modulo) {
    query += ` AND le.origem_modulo = ?`;
    params.push(origem_modulo);
  }

  query += ` ORDER BY le.data_lancamento, le.conta_id`;

  return consultar<LancamentoPorModulo>(db, query, params);
}

/**
 * Gera relatório de auditoria agrupado por módulo de origem
 * @param db Database
 * @param entidade_id ID da entidade legal
 * @param periodo_id ID do período contábil
 * @returns Array de relatórios por módulo
 */
export function gerarRelatorioAuditoriaParModulo(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): RelatorioAuditoriaModulo[] {
  const query = `
    SELECT
      le.origem_modulo,
      COUNT(*) as total_lancamentos,
      COALESCE(SUM(le.valor_debito), 0) as total_debito,
      COALESCE(SUM(le.valor_credito), 0) as total_credito,
      COALESCE(SUM(le.valor_debito), 0) - COALESCE(SUM(le.valor_credito), 0) as saldo_liquido
    FROM ledger_entries le
    WHERE le.entidade_id = ? AND le.periodo_id = ?
    GROUP BY le.origem_modulo
    ORDER BY le.origem_modulo
  `;

  const results = consultar<any>(db, query, [entidade_id, periodo_id]);

  return results.map((row) => ({
    origem_modulo: row.origem_modulo as OrigemModulo,
    total_lancamentos: row.total_lancamentos,
    total_debito: row.total_debito,
    total_credito: row.total_credito,
    saldo_liquido: row.saldo_liquido,
    linhas: obterLancamentosParModulo(db, entidade_id, periodo_id, row.origem_modulo),
  }));
}

/* Os códigos de conta deste módulo seguem planoDeContasErp.ts, a fonte única.
 * Até esta mudança ele lia receita em 5.1.0x e despesa em 6.1.0x, enquanto
 * imovel-gestao-ledger-integration.ts lançava receita em 4.1.01 e despesa em 5.2.xx no
 * MESMO razão. O resultado é que uma despesa de condomínio lançada por um módulo ficava
 * invisível para a DRE do outro, e a receita de aluguel não aparecia em relatório
 * nenhum — os dois escreviam e liam a mesma tabela com planos incompatíveis.
 */
export function gerarDRE(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): LinhasDRE {
  // Líquido, não bruto: uma reclassificação (reclassificarTransacao.ts) estorna a perna
  // antiga NA MESMA CONTA (débito original + crédito de estorno de mesmo valor) e lança a
  // nova numa conta diferente. Somar só valor_credito (receita) ou só valor_debito
  // (despesa) ignora o estorno por completo — a conta antiga nunca desconta, e a despesa
  // é contada duas vezes (achado C do teste golden-path: R$500 reclassificados de
  // Condomínio para Manutenção ficavam R$500 em Manutenção E R$800 em Condomínio, em vez
  // de R$300). COALESCE por lado é necessário porque valor_debito/valor_credito são
  // mutuamente exclusivos (CHECK do schema) — sem isso, `valor_credito - valor_debito`
  // vira NULL sempre que um dos dois é NULL, que é a norma, não a exceção.
  // ENCERRAMENTO-% exclui o lançamento de encerramento de encerrarPeriodo() (ledger.ts):
  // ele zera as próprias contas de receita/despesa do período contra 2.1.02 (Lucros
  // Acumulados) para que o Balanço passe a mostrar o resultado no PL. Sem esse filtro, a
  // DRE de um período JÁ FECHADO leria essa zeragem na mesma soma e reportaria
  // resultado 0 (a conta zerada por ela mesma) em vez do resultado real do período — a
  // DRE de janeiro deixaria de bater com a variação do PL logo depois do fechamento,
  // exatamente o problema que o encerramento deveria resolver. A DRE de um período
  // fechado precisa continuar mostrando o resultado ORIGINAL apurado nele, não o
  // trial balance pós-encerramento (que é para isso que serve gerarBalancete, não a DRE).
  const getCredito = (codigo: string) => {
    const [result] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(le.valor_credito), 0) - COALESCE(SUM(le.valor_debito), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ?
         AND le.referencia_documento NOT LIKE 'ENCERRAMENTO-%'`,
      [entidade_id, periodo_id, codigo],
    );
    return result?.total || 0;
  };

  const getDebito = (codigo: string) => {
    const [result] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(le.valor_debito), 0) - COALESCE(SUM(le.valor_credito), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ?
         AND le.referencia_documento NOT LIKE 'ENCERRAMENTO-%'`,
      [entidade_id, periodo_id, codigo],
    );
    return result?.total || 0;
  };

  // Receitas: contas 5.x.xx
  const receitasAluguel = getCredito("4.1.01");
  const receitasReajustes = getCredito("4.1.02");
  const receitasRateios = getCredito("4.1.03");
  const receitasJuros = getCredito("4.2.01");
  const outrasReceitas = getCredito("4.3.01");

  const totalReceitas =
    receitasAluguel + receitasReajustes + receitasRateios + receitasJuros + outrasReceitas;

  // Custos e Despesas: contas 6.x.xx
  const condominio = getDebito("5.2.10");
  const aguaEsgoto = getDebito("5.2.07");
  const eletricidade = getDebito("5.2.06");
  const internet = getDebito("5.2.12");
  const manutencao = getDebito("5.2.05");
  const limpeza = getDebito("5.2.11");
  const seguros = getDebito("5.2.13");
  const depreciacao = getDebito("5.3.01");

  const totalCustos =
    condominio + aguaEsgoto + eletricidade + internet + manutencao + limpeza + seguros + depreciacao;

  const resultadoOperacional = totalReceitas - totalCustos;

  // Juros e Multas. "receita_juros"/"receita_multa" aqui são só a ABERTURA informativa das
  // mesmas contas 4.2.01/4.3.01 já somadas em total_receitas acima — NÃO entram de novo em
  // resultado_final, senão dobra a contagem (ACHADO #1 do teste de auditoria).
  // despesa_juros_financiamento lê a conta REAL de juros de financiamento (5.5.01) — 6.3.01
  // é Honorários Advocatícios, categoria diferente (ACHADO #2). Não existe hoje conta
  // dedicada a "juros de mora" (6.3.01/6.3.02 são honorários/custas judiciais).
  const despesaJurosFinanciamento = getDebito("5.5.01");
  const despesaJurosMora = 0;
  const receitaJurosJuros = getCredito("4.2.01");
  const receitaMulta = getCredito("4.3.01");

  // Provisões
  const provisaoDevedora = getDebito("6.4.01");

  const resultadoFinal =
    resultadoOperacional - despesaJurosFinanciamento - despesaJurosMora - provisaoDevedora;

  return {
    receitas: {
      aluguel: receitasAluguel,
      reajustes: receitasReajustes,
      rateios: receitasRateios,
      juros: receitasJuros,
      outras_receitas: outrasReceitas,
      total_receitas: totalReceitas,
    },
    custos: {
      condominio,
      agua_esgoto: aguaEsgoto,
      eletricidade,
      internet,
      manutencao,
      limpeza,
      seguros,
      depreciacao,
      total_custos: totalCustos,
    },
    resultado_operacional: resultadoOperacional,
    juros_e_multas: {
      despesa_juros_financiamento: despesaJurosFinanciamento,
      despesa_juros_mora: despesaJurosMora,
      receita_juros: receitaJurosJuros,
      receita_multa: receitaMulta,
      resultado_juros:
        receitaJurosJuros + receitaMulta - despesaJurosFinanciamento - despesaJurosMora,
    },
    provisoes: {
      provisao_devedora: provisaoDevedora,
    },
    resultado_final: resultadoFinal,
  };
}

export interface LinhasBalancete {
  ativo: {
    circulante_total: number;
    nao_circulante_total: number;
    total_ativo: number;
  };
  passivo: {
    circulante_total: number;
    nao_circulante_total: number;
    total_passivo: number;
  };
  patrimonio_liquido: number;
}

/* O plano real (planoDeContasErp.ts) usa: 1 = ativo (não existe "2.x" de ativo — a faixa
 * 2 é patrimônio líquido) · 2 = patrimônio líquido · 3 = passivo (inclui caução, 3.3.01).
 * Um Balanço Patrimonial é uma fotografia acumulada até o fim do período, não o movimento
 * do mês — por isso as consultas abaixo somam todo período contábil da entidade cujo
 * (ano, mês) seja <= ao período pedido, em vez de filtrar só `periodo_id = ?`. */
export function gerarBalanco(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): LinhasBalancete {
  const condicaoAcumulada = `
       le.periodo_id IN (
         SELECT pc2.id FROM periodos_contabeis pc2
         INNER JOIN periodos_contabeis pc_alvo ON pc_alvo.id = ?
         WHERE pc2.entidade_id = pc_alvo.entidade_id
           AND (pc2.ano < pc_alvo.ano OR (pc2.ano = pc_alvo.ano AND pc2.mes <= pc_alvo.mes))
       )`;

  const getAtivoConta = (codigo: string) => {
    const [result] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'debito' THEN COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0)
             ELSE COALESCE(le.valor_credito, 0) - COALESCE(le.valor_debito, 0) END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND ${condicaoAcumulada} AND cp.codigo LIKE ? AND cp.grupo = 'ativo'`,
      [entidade_id, periodo_id, codigo],
    );
    return result?.total || 0;
  };

  const getPassivoConta = (codigo: string) => {
    const [result] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'credito' THEN COALESCE(le.valor_credito, 0) - COALESCE(le.valor_debito, 0)
             ELSE COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0) END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND ${condicaoAcumulada} AND cp.codigo LIKE ? AND cp.grupo = 'passivo'`,
      [entidade_id, periodo_id, codigo],
    );
    return result?.total || 0;
  };

  const getPatrimonioLiquidoConta = (codigo: string) => {
    const [result] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'credito' THEN COALESCE(le.valor_credito, 0) - COALESCE(le.valor_debito, 0)
             ELSE COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0) END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND ${condicaoAcumulada} AND cp.codigo LIKE ? AND cp.grupo = 'patrimonio_liquido'`,
      [entidade_id, periodo_id, codigo],
    );
    return result?.total || 0;
  };

  // Ativo Circulante (1.1%) — caixa, bancos, aplicações
  const ativoCirculante = getAtivoConta("1.1%");

  // Ativo Não-Circulante (1.2%, imobilizado, e 1.9%, transitório)
  const ativoNaoCirculante = getAtivoConta("1.2%") + getAtivoConta("1.9%");

  const totalAtivo = ativoCirculante + ativoNaoCirculante;

  // Passivo Circulante (3.1%)
  const passivoCirculante = getPassivoConta("3.1%");

  // Passivo Não-Circulante (3.2%, empréstimos de longo prazo) e outros passivos de
  // terceiros (3.3%, ex.: depósitos de caução recebidos)
  const passivoNaoCirculante = getPassivoConta("3.2%") + getPassivoConta("3.3%");

  const totalPassivo = passivoCirculante + passivoNaoCirculante;

  // Patrimônio Líquido (2.%, não "4.%" — a faixa 4 é receita)
  const patrimonioLiquido = getPatrimonioLiquidoConta("2.%");

  return {
    ativo: {
      circulante_total: ativoCirculante,
      nao_circulante_total: ativoNaoCirculante,
      total_ativo: totalAtivo,
    },
    passivo: {
      circulante_total: passivoCirculante,
      nao_circulante_total: passivoNaoCirculante,
      total_passivo: totalPassivo,
    },
    patrimonio_liquido: patrimonioLiquido,
  };
}

export interface FluxoCaixaResultado {
  saldo_inicial: number;
  operacional: {
    entradas: number;
    saidas: number;
    liquido: number;
  };
  investimento: {
    aquisicoes: number;
    liquido: number;
  };
  financiamento: {
    emprestimos: number;
    amortizacoes: number;
    liquido: number;
  };
  saldo_final: number;
}

export function gerarFluxoCaixa(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): FluxoCaixaResultado {
  // Saldo inicial = saldo ACUMULADO de caixa em TODOS os períodos anteriores a este, não
  // o movimento de um único período. Achado B do teste golden-path: a versão anterior (1)
  // só olhava o período IMEDIATAMENTE anterior — um saldo de 3+ meses atrás desaparecia a
  // partir do 2º mês migrado — e (2) somava só valor_debito (entradas), nunca descontando
  // valor_credito (saídas), o mesmo defeito de A. COALESCE por lado pelo mesmo motivo
  // documentado em gerarBalanco: valor_debito/valor_credito são mutuamente exclusivos.
  let saldo_inicial = 0;
  const [periodo] = consultar<{ ano: number; mes: number }>(
    db,
    `SELECT ano, mes FROM periodos_contabeis WHERE id = ?`,
    [periodo_id],
  );

  if (periodo) {
    const [saldo] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0)), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       INNER JOIN periodos_contabeis pc ON le.periodo_id = pc.id
       WHERE le.entidade_id = ? AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')
         AND pc.entidade_id = ? AND (pc.ano < ? OR (pc.ano = ? AND pc.mes < ?))`,
      [entidade_id, entidade_id, periodo.ano, periodo.ano, periodo.mes],
    );
    saldo_inicial = saldo?.total || 0;
  }

  // Entradas: Débitos em contas de caixa (1.1.01, 1.1.02, 1.1.03)
  const [entradas] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_debito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ?
       AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')`,
    [entidade_id, periodo_id],
  );

  // Saídas: Créditos em contas de caixa (1.1.01, 1.1.02, 1.1.03)
  const [saidas] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_credito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ?
       AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')`,
    [entidade_id, periodo_id],
  );

  // Investimento: Aquisição de Imóvel (1.2.05 — imóveis/ativo imobilizado; "2.1.01" é
  // Capital Social, patrimônio líquido, não imóvel)
  const [aquisicoes] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_debito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo = '1.2.05'`,
    [entidade_id, periodo_id],
  );

  // Financiamento: Empréstimos (3.2.01)
  const [emprestimos] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_credito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo = '3.2.01'`,
    [entidade_id, periodo_id],
  );

  // Amortizações (3.2.01)
  const [amortizacoes] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_debito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo = '3.2.01'`,
    [entidade_id, periodo_id],
  );

  const ent = entradas?.total || 0;
  const sai = saidas?.total || 0;
  const fluxoOperacional = ent - sai;
  const fluxoInvestimento = -(aquisicoes?.total || 0);
  const fluxoFinanciamento = (emprestimos?.total || 0) - (amortizacoes?.total || 0);
  const saldo_final = saldo_inicial + fluxoOperacional + fluxoInvestimento + fluxoFinanciamento;

  return {
    saldo_inicial,
    operacional: {
      entradas: ent,
      saidas: sai,
      liquido: fluxoOperacional,
    },
    investimento: {
      aquisicoes: aquisicoes?.total || 0,
      liquido: fluxoInvestimento,
    },
    financiamento: {
      emprestimos: emprestimos?.total || 0,
      amortizacoes: amortizacoes?.total || 0,
      liquido: fluxoFinanciamento,
    },
    // Saldo negativo real (descoberto/dívida) é informação crítica para um laudo pericial
    // — apresentá-lo como R$ 0,00 (Math.max(0, ...)) escondia exatamente o dado mais
    // relevante em caso de problema de liquidez.
    saldo_final,
  };
}

export interface RelatorioIntegrado {
  dre: LinhasDRE;
  balanço: LinhasBalancete;
  fluxo_caixa: FluxoCaixaResultado;
  resultado_liquido: number;
  margem_operacional: number;
}

export function gerarRelatorioIntegrado(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): RelatorioIntegrado {
  const dre = gerarDRE(db, entidade_id, periodo_id);
  const balanço = gerarBalanco(db, entidade_id, periodo_id);
  const fluxo_caixa = gerarFluxoCaixa(db, entidade_id, periodo_id);

  const resultado_liquido = dre.resultado_final;
  const receita_total = dre.receitas.total_receitas;
  const margem_operacional = receita_total > 0 ? (resultado_liquido / receita_total) * 100 : 0;

  return {
    dre,
    balanço,
    fluxo_caixa,
    resultado_liquido,
    margem_operacional,
  };
}

/**
 * Gera DRE filtrada por origem_modulo(s) específico(s)
 * @param db Database
 * @param entidade_id ID da entidade legal
 * @param periodo_id ID do período contábil
 * @param origem_modulos Lista de módulos de origem (opcional)
 * @returns DRE filtrada
 */
export function gerarDREComFiltro(
  db: Database,
  entidade_id: number,
  periodo_id: number,
  origem_modulos?: string[],
): LinhasDRE {
  // Líquido, não bruto — mesmo motivo documentado em gerarDRE acima (estorno de
  // reclassificação não descontava, dobrando a despesa).
  // ENCERRAMENTO-% exclui a zeragem de encerrarPeriodo() (ledger.ts) — ver o comentário
  // equivalente em gerarDRE() acima sobre por que a DRE de um período fechado não pode
  // somar seu próprio lançamento de encerramento.
  const getCredito = (codigo: string) => {
    let query = `SELECT COALESCE(SUM(le.valor_credito), 0) - COALESCE(SUM(le.valor_debito), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ?
         AND le.referencia_documento NOT LIKE 'ENCERRAMENTO-%'`;

    const params: (number | string)[] = [entidade_id, periodo_id, codigo];

    if (origem_modulos && origem_modulos.length > 0) {
      const placeholders = origem_modulos.map(() => "?").join(",");
      query += ` AND le.origem_modulo IN (${placeholders})`;
      params.push(...origem_modulos);
    }

    const [result] = consultar<{ total: number }>(db, query, params);
    return result?.total || 0;
  };

  const getDebito = (codigo: string) => {
    let query = `SELECT COALESCE(SUM(le.valor_debito), 0) - COALESCE(SUM(le.valor_credito), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ?
         AND le.referencia_documento NOT LIKE 'ENCERRAMENTO-%'`;

    const params: (number | string)[] = [entidade_id, periodo_id, codigo];

    if (origem_modulos && origem_modulos.length > 0) {
      const placeholders = origem_modulos.map(() => "?").join(",");
      query += ` AND le.origem_modulo IN (${placeholders})`;
      params.push(...origem_modulos);
    }

    const [result] = consultar<{ total: number }>(db, query, params);
    return result?.total || 0;
  };

  // Receitas: contas 5.x.xx
  const receitasAluguel = getCredito("4.1.01");
  const receitasReajustes = getCredito("4.1.02");
  const receitasRateios = getCredito("4.1.03");
  const receitasJuros = getCredito("4.2.01");
  const outrasReceitas = getCredito("4.3.01");

  const totalReceitas =
    receitasAluguel + receitasReajustes + receitasRateios + receitasJuros + outrasReceitas;

  // Custos e Despesas: contas 6.x.xx
  const condominio = getDebito("5.2.10");
  const aguaEsgoto = getDebito("5.2.07");
  const eletricidade = getDebito("5.2.06");
  const internet = getDebito("5.2.12");
  const manutencao = getDebito("5.2.05");
  const limpeza = getDebito("5.2.11");
  const seguros = getDebito("5.2.13");
  const depreciacao = getDebito("5.3.01");

  const totalCustos =
    condominio + aguaEsgoto + eletricidade + internet + manutencao + limpeza + seguros + depreciacao;

  const resultadoOperacional = totalReceitas - totalCustos;

  // Juros e Multas — ver comentário equivalente em gerarDRE() sobre dupla contagem e as
  // contas reais de juros de financiamento/mora.
  const despesaJurosFinanciamento = getDebito("5.5.01");
  const despesaJurosMora = 0;
  const receitaJurosJuros = getCredito("4.2.01");
  const receitaMulta = getCredito("4.3.01");

  // Provisões
  const provisaoDevedora = getDebito("6.4.01");

  const resultadoFinal =
    resultadoOperacional - despesaJurosFinanciamento - despesaJurosMora - provisaoDevedora;

  return {
    receitas: {
      aluguel: receitasAluguel,
      reajustes: receitasReajustes,
      rateios: receitasRateios,
      juros: receitasJuros,
      outras_receitas: outrasReceitas,
      total_receitas: totalReceitas,
    },
    custos: {
      condominio,
      agua_esgoto: aguaEsgoto,
      eletricidade,
      internet,
      manutencao,
      limpeza,
      seguros,
      depreciacao,
      total_custos: totalCustos,
    },
    resultado_operacional: resultadoOperacional,
    juros_e_multas: {
      despesa_juros_financiamento: despesaJurosFinanciamento,
      despesa_juros_mora: despesaJurosMora,
      receita_juros: receitaJurosJuros,
      receita_multa: receitaMulta,
      resultado_juros:
        receitaJurosJuros + receitaMulta - despesaJurosFinanciamento - despesaJurosMora,
    },
    provisoes: {
      provisao_devedora: provisaoDevedora,
    },
    resultado_final: resultadoFinal,
  };
}

/**
 * Gera Balanço filtrado por origem_modulo(s) específico(s)
 * @param db Database
 * @param entidade_id ID da entidade legal
 * @param periodo_id ID do período contábil
 * @param origem_modulos Lista de módulos de origem (opcional)
 * @returns Balanço filtrado
 */
export function gerarBalancoComFiltro(
  db: Database,
  entidade_id: number,
  periodo_id: number,
  origem_modulos?: string[],
): LinhasBalancete {
  const condicaoAcumulada = `
       le.periodo_id IN (
         SELECT pc2.id FROM periodos_contabeis pc2
         INNER JOIN periodos_contabeis pc_alvo ON pc_alvo.id = ?
         WHERE pc2.entidade_id = pc_alvo.entidade_id
           AND (pc2.ano < pc_alvo.ano OR (pc2.ano = pc_alvo.ano AND pc2.mes <= pc_alvo.mes))
       )`;

  const getAtivoConta = (codigo: string) => {
    let query = `SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'debito' THEN COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0)
             ELSE COALESCE(le.valor_credito, 0) - COALESCE(le.valor_debito, 0) END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND ${condicaoAcumulada} AND cp.codigo LIKE ? AND cp.grupo = 'ativo'`;

    const params: (number | string)[] = [entidade_id, periodo_id, codigo];

    if (origem_modulos && origem_modulos.length > 0) {
      const placeholders = origem_modulos.map(() => "?").join(",");
      query += ` AND le.origem_modulo IN (${placeholders})`;
      params.push(...origem_modulos);
    }

    const [result] = consultar<{ total: number }>(db, query, params);
    return result?.total || 0;
  };

  const getPassivoConta = (codigo: string) => {
    let query = `SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'credito' THEN COALESCE(le.valor_credito, 0) - COALESCE(le.valor_debito, 0)
             ELSE COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0) END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND ${condicaoAcumulada} AND cp.codigo LIKE ? AND cp.grupo = 'passivo'`;

    const params: (number | string)[] = [entidade_id, periodo_id, codigo];

    if (origem_modulos && origem_modulos.length > 0) {
      const placeholders = origem_modulos.map(() => "?").join(",");
      query += ` AND le.origem_modulo IN (${placeholders})`;
      params.push(...origem_modulos);
    }

    const [result] = consultar<{ total: number }>(db, query, params);
    return result?.total || 0;
  };

  const getPatrimonioLiquidoConta = (codigo: string) => {
    let query = `SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'credito' THEN COALESCE(le.valor_credito, 0) - COALESCE(le.valor_debito, 0)
             ELSE COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0) END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND ${condicaoAcumulada} AND cp.codigo LIKE ? AND cp.grupo = 'patrimonio_liquido'`;

    const params: (number | string)[] = [entidade_id, periodo_id, codigo];

    if (origem_modulos && origem_modulos.length > 0) {
      const placeholders = origem_modulos.map(() => "?").join(",");
      query += ` AND le.origem_modulo IN (${placeholders})`;
      params.push(...origem_modulos);
    }

    const [result] = consultar<{ total: number }>(db, query, params);
    return result?.total || 0;
  };

  // Ativo Circulante (1.1%) — caixa, bancos, aplicações
  const ativoCirculante = getAtivoConta("1.1%");

  // Ativo Não-Circulante (1.2%, imobilizado, e 1.9%, transitório)
  const ativoNaoCirculante = getAtivoConta("1.2%") + getAtivoConta("1.9%");

  const totalAtivo = ativoCirculante + ativoNaoCirculante;

  // Passivo Circulante (3.1%)
  const passivoCirculante = getPassivoConta("3.1%");

  // Passivo Não-Circulante (3.2%) e outros passivos de terceiros (3.3%, ex.: caução)
  const passivoNaoCirculante = getPassivoConta("3.2%") + getPassivoConta("3.3%");

  const totalPassivo = passivoCirculante + passivoNaoCirculante;

  // Patrimônio Líquido (2.%, não "4.%" — a faixa 4 é receita)
  const patrimonioLiquido = getPatrimonioLiquidoConta("2.%");

  return {
    ativo: {
      circulante_total: ativoCirculante,
      nao_circulante_total: ativoNaoCirculante,
      total_ativo: totalAtivo,
    },
    passivo: {
      circulante_total: passivoCirculante,
      nao_circulante_total: passivoNaoCirculante,
      total_passivo: totalPassivo,
    },
    patrimonio_liquido: patrimonioLiquido,
  };
}

/**
 * Gera Fluxo de Caixa filtrado por origem_modulo(s) específico(s)
 * @param db Database
 * @param entidade_id ID da entidade legal
 * @param periodo_id ID do período contábil
 * @param origem_modulos Lista de módulos de origem (opcional)
 * @returns Fluxo de Caixa filtrado
 */
export function gerarFluxoCaixaComFiltro(
  db: Database,
  entidade_id: number,
  periodo_id: number,
  origem_modulos?: string[],
): FluxoCaixaResultado {
  // Saldo acumulado de TODOS os períodos anteriores, líquido — ver o comentário completo
  // em gerarFluxoCaixa (achado B do teste golden-path) para o porquê.
  let saldo_inicial = 0;
  const [periodo] = consultar<{ ano: number; mes: number }>(
    db,
    `SELECT ano, mes FROM periodos_contabeis WHERE id = ?`,
    [periodo_id],
  );

  if (periodo) {
    let query = `SELECT COALESCE(SUM(COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0)), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       INNER JOIN periodos_contabeis pc ON le.periodo_id = pc.id
       WHERE le.entidade_id = ? AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')
         AND pc.entidade_id = ? AND (pc.ano < ? OR (pc.ano = ? AND pc.mes < ?))`;

    const params: (number | string)[] = [entidade_id, entidade_id, periodo.ano, periodo.ano, periodo.mes];

    if (origem_modulos && origem_modulos.length > 0) {
      const placeholders = origem_modulos.map(() => "?").join(",");
      query += ` AND le.origem_modulo IN (${placeholders})`;
      params.push(...origem_modulos);
    }

    const [saldo] = consultar<{ total: number }>(db, query, params);
    saldo_inicial = saldo?.total || 0;
  }

  const getFluxoDeCaixa = (codigosConta: string[], tipo: "debito" | "credito") => {
    const codigosPlaceholders = codigosConta.map(() => "?").join(",");
    let query = `SELECT COALESCE(SUM(le.valor_${tipo}), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ?
       AND cp.codigo IN (${codigosPlaceholders})`;

    const params: (number | string)[] = [entidade_id, periodo_id, ...codigosConta];

    if (origem_modulos && origem_modulos.length > 0) {
      const placeholders = origem_modulos.map(() => "?").join(",");
      query += ` AND le.origem_modulo IN (${placeholders})`;
      params.push(...origem_modulos);
    }

    const [result] = consultar<{ total: number }>(db, query, params);
    return result?.total || 0;
  };

  // Entradas: Débitos em contas de caixa (1.1.01, 1.1.02, 1.1.03)
  const ent = getFluxoDeCaixa(["1.1.01", "1.1.02", "1.1.03"], "debito");

  // Saídas: Créditos em contas de caixa (1.1.01, 1.1.02, 1.1.03)
  const sai = getFluxoDeCaixa(["1.1.01", "1.1.02", "1.1.03"], "credito");

  // Investimento: Aquisição de Imóvel (2.1.01)
  const aquisicoes = getFluxoDeCaixa(["1.2.05"], "debito"); // imóveis: ativo imobilizado

  // Financiamento: Empréstimos (3.2.01)
  const emprestimos = getFluxoDeCaixa(["3.2.01"], "credito");

  // Amortizações (3.2.01)
  const amortizacoes = getFluxoDeCaixa(["3.2.01"], "debito");

  const fluxoOperacional = ent - sai;
  const fluxoInvestimento = -aquisicoes;
  const fluxoFinanciamento = emprestimos - amortizacoes;
  const saldo_final = saldo_inicial + fluxoOperacional + fluxoInvestimento + fluxoFinanciamento;

  return {
    saldo_inicial,
    operacional: {
      entradas: ent,
      saidas: sai,
      liquido: fluxoOperacional,
    },
    investimento: {
      aquisicoes,
      liquido: fluxoInvestimento,
    },
    financiamento: {
      emprestimos,
      amortizacoes,
      liquido: fluxoFinanciamento,
    },
    // Ver comentário equivalente em gerarFluxoCaixa() — não esconder saldo negativo.
    saldo_final,
  };
}
