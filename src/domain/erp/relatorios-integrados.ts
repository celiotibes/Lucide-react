/**
 * Relatórios Integrados ERP
 * DRE (Demonstração de Resultado), Balanço Patrimonial, Fluxo de Caixa
 * Baseado em ledger_entries com novo plano de contas integrado
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

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
  const receitasAluguel = getCredito("5.1.01");
  const receitasReajustes = getCredito("5.1.02");
  const receitasRateios = getCredito("5.1.03");
  const receitasJuros = getCredito("5.2.01");
  const outrasReceitas = getCredito("5.3.01");

  const totalReceitas =
    receitasAluguel + receitasReajustes + receitasRateios + receitasJuros + outrasReceitas;

  // Custos e Despesas: contas 6.x.xx
  const condominio = getDebito("6.1.01");
  const aguaEsgoto = getDebito("6.1.02");
  const eletricidade = getDebito("6.1.03");
  const internet = getDebito("6.1.04");
  const manutencao = getDebito("6.1.05");
  const limpeza = getDebito("6.1.06");
  const seguros = getDebito("6.1.07");
  const depreciacao = getDebito("6.2.01");

  const totalCustos =
    condominio + aguaEsgoto + eletricidade + internet + manutencao + limpeza + seguros + depreciacao;

  const resultadoOperacional = totalReceitas - totalCustos;

  // Juros e Multas
  const despesaJurosFinanciamento = getDebito("6.3.01");
  const despesaJurosMora = getDebito("6.3.02");
  const receitaJurosJuros = getCredito("5.2.01");
  const receitaMulta = getCredito("5.3.01");

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
