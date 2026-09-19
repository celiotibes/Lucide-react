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
  const getCredito = (codigo: string) => {
    const [result] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(le.valor_credito), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ?`,
      [entidade_id, periodo_id, codigo],
    );
    return result?.total || 0;
  };

  const getDebito = (codigo: string) => {
    const [result] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(le.valor_debito), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ?`,
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

  // Juros e Multas
  const despesaJurosFinanciamento = getDebito("6.3.01");
  const despesaJurosMora = getDebito("6.3.02");
  const receitaJurosJuros = getCredito("4.2.01");
  const receitaMulta = getCredito("4.3.01");

  // Provisões
  const provisaoDevedora = getDebito("6.4.01");

  const resultadoFinal =
    resultadoOperacional - despesaJurosFinanciamento - despesaJurosMora - provisaoDevedora +
    receitaJurosJuros + receitaMulta;

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

export function gerarBalanco(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): LinhasBalancete {
  const getAtivoConta = (codigo: string) => {
    const [result] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'debito' THEN le.valor_debito
             ELSE le.valor_credito END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ? AND cp.grupo = 'ativo'`,
      [entidade_id, periodo_id, codigo],
    );
    return result?.total || 0;
  };

  const getPassivoConta = (codigo: string) => {
    const [result] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'credito' THEN le.valor_credito
             ELSE le.valor_debito END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ? AND cp.grupo = 'passivo'`,
      [entidade_id, periodo_id, codigo],
    );
    return result?.total || 0;
  };

  const getPatrimonioLiquidoConta = (codigo: string) => {
    const [result] = consultar<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'credito' THEN le.valor_credito
             ELSE le.valor_debito END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ? AND cp.grupo = 'patrimonio_liquido'`,
      [entidade_id, periodo_id, codigo],
    );
    return result?.total || 0;
  };

  // Ativo Circulante (1.%)
  const ativoCirculante = getAtivoConta("1.%");

  // Ativo Não-Circulante (2.%)
  const ativoNaoCirculante = getAtivoConta("2.%");

  const totalAtivo = ativoCirculante + ativoNaoCirculante;

  // Passivo Circulante (3.1%)
  const passivoCirculante = getPassivoConta("3.1%");

  // Passivo Não-Circulante (3.2%)
  const passivoNaoCirculante = getPassivoConta("3.2%");

  const totalPassivo = passivoCirculante + passivoNaoCirculante;

  // Patrimônio Líquido (4.%)
  const patrimonioLiquido = getPatrimonioLiquidoConta("4.%");

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
  // Saldo inicial (caixa no período anterior)
  let saldo_inicial = 0;
  const [periodo] = consultar<{ ano: number; mes: number }>(
    db,
    `SELECT ano, mes FROM periodos_contabeis WHERE id = ?`,
    [periodo_id],
  );

  if (periodo && (periodo.mes > 1 || periodo.ano > 1)) {
    const mes_ant = periodo.mes === 1 ? 12 : periodo.mes - 1;
    const ano_ant = periodo.mes === 1 ? periodo.ano - 1 : periodo.ano;

    const [periodo_anterior] = consultar<{ id: number }>(
      db,
      `SELECT id FROM periodos_contabeis
       WHERE entidade_id = ? AND ano = ? AND mes = ?`,
      [entidade_id, ano_ant, mes_ant],
    );

    if (periodo_anterior) {
      const [saldo] = consultar<{ total: number }>(
        db,
        `SELECT COALESCE(SUM(
          CASE WHEN cp.natureza = 'debito' THEN le.valor_debito
               ELSE le.valor_credito END), 0) as total
         FROM ledger_entries le
         INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
         WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')`,
        [entidade_id, periodo_anterior.id],
      );
      saldo_inicial = saldo?.total || 0;
    }
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

  // Investimento: Aquisição de Imóvel (2.1.01)
  const [aquisicoes] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_debito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo = '2.1.01'`,
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
    saldo_final: Math.max(0, saldo_final),
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
  const getCredito = (codigo: string) => {
    let query = `SELECT COALESCE(SUM(le.valor_credito), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ?`;

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
    let query = `SELECT COALESCE(SUM(le.valor_debito), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ?`;

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

  // Juros e Multas
  const despesaJurosFinanciamento = getDebito("6.3.01");
  const despesaJurosMora = getDebito("6.3.02");
  const receitaJurosJuros = getCredito("4.2.01");
  const receitaMulta = getCredito("4.3.01");

  // Provisões
  const provisaoDevedora = getDebito("6.4.01");

  const resultadoFinal =
    resultadoOperacional - despesaJurosFinanciamento - despesaJurosMora - provisaoDevedora +
    receitaJurosJuros + receitaMulta;

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
  const getAtivoConta = (codigo: string) => {
    let query = `SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'debito' THEN le.valor_debito
             ELSE le.valor_credito END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ? AND cp.grupo = 'ativo'`;

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
        CASE WHEN cp.natureza = 'credito' THEN le.valor_credito
             ELSE le.valor_debito END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ? AND cp.grupo = 'passivo'`;

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
        CASE WHEN cp.natureza = 'credito' THEN le.valor_credito
             ELSE le.valor_debito END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ? AND cp.grupo = 'patrimonio_liquido'`;

    const params: (number | string)[] = [entidade_id, periodo_id, codigo];

    if (origem_modulos && origem_modulos.length > 0) {
      const placeholders = origem_modulos.map(() => "?").join(",");
      query += ` AND le.origem_modulo IN (${placeholders})`;
      params.push(...origem_modulos);
    }

    const [result] = consultar<{ total: number }>(db, query, params);
    return result?.total || 0;
  };

  // Ativo Circulante (1.%)
  const ativoCirculante = getAtivoConta("1.%");

  // Ativo Não-Circulante (2.%)
  const ativoNaoCirculante = getAtivoConta("2.%");

  const totalAtivo = ativoCirculante + ativoNaoCirculante;

  // Passivo Circulante (3.1%)
  const passivoCirculante = getPassivoConta("3.1%");

  // Passivo Não-Circulante (3.2%)
  const passivoNaoCirculante = getPassivoConta("3.2%");

  const totalPassivo = passivoCirculante + passivoNaoCirculante;

  // Patrimônio Líquido (4.%)
  const patrimonioLiquido = getPatrimonioLiquidoConta("4.%");

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
  let saldo_inicial = 0;
  const [periodo] = consultar<{ ano: number; mes: number }>(
    db,
    `SELECT ano, mes FROM periodos_contabeis WHERE id = ?`,
    [periodo_id],
  );

  if (periodo && (periodo.mes > 1 || periodo.ano > 1)) {
    const mes_ant = periodo.mes === 1 ? 12 : periodo.mes - 1;
    const ano_ant = periodo.mes === 1 ? periodo.ano - 1 : periodo.ano;

    const [periodo_anterior] = consultar<{ id: number }>(
      db,
      `SELECT id FROM periodos_contabeis
       WHERE entidade_id = ? AND ano = ? AND mes = ?`,
      [entidade_id, ano_ant, mes_ant],
    );

    if (periodo_anterior) {
      let query = `SELECT COALESCE(SUM(
          CASE WHEN cp.natureza = 'debito' THEN le.valor_debito
               ELSE le.valor_credito END), 0) as total
         FROM ledger_entries le
         INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
         WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')`;

      const params: (number | string)[] = [entidade_id, periodo_anterior.id];

      if (origem_modulos && origem_modulos.length > 0) {
        const placeholders = origem_modulos.map(() => "?").join(",");
        query += ` AND le.origem_modulo IN (${placeholders})`;
        params.push(...origem_modulos);
      }

      const [saldo] = consultar<{ total: number }>(db, query, params);
      saldo_inicial = saldo?.total || 0;
    }
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
    saldo_final: Math.max(0, saldo_final),
  };
}
