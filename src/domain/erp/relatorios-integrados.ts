/**
 * Relatórios Integrados ERP
 * DRE (Demonstração de Resultado), Balanço Patrimonial, Fluxo de Caixa
 * Consolidando dados de todos os módulos
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

/** Demonstração de Resultado do Exercício (DRE) */
export interface LinhasDRE {
  receitas: {
    aluguel: number;
    reajustes: number;
    outras_receitas: number;
    total_receitas: number;
  };
  custos: {
    condominio: number;
    manutencao: number;
    agua_energia: number;
    impostos: number;
    depreciacao: number;
    total_custos: number;
  };
  resultado_operacional: number;
  juros: {
    despesa_juros_financiamento: number;
    receita_juros: number;
    resultado_juros: number;
  };
  resultado_final: number;
}

export function gerarDRE(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): LinhasDRE {
  // Receitas
  const [receitasAluguel] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 1 AND tipo = 'credit'`,
    [entidade_id, periodo_id],
  );

  const [receitasReajustes] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 3 AND tipo = 'credit'`,
    [entidade_id, periodo_id],
  );

  const [outrasReceitas] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND tipo = 'credit' AND conta_id NOT IN (1, 3, 4)`,
    [entidade_id, periodo_id],
  );

  const totalReceitas =
    (receitasAluguel?.total || 0) + (receitasReajustes?.total || 0) + (outrasReceitas?.total || 0);

  // Custos e Despesas
  const [condominio] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 20 AND tipo = 'debit'`,
    [entidade_id, periodo_id],
  );

  const [manutencao] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id IN (5, 24) AND tipo = 'debit'`,
    [entidade_id, periodo_id],
  );

  const [aguaEnergia] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id IN (21, 22, 23) AND tipo = 'debit'`,
    [entidade_id, periodo_id],
  );

  const [impostos] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 28 AND tipo = 'debit'`,
    [entidade_id, periodo_id],
  );

  const [depreciacao] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 13 AND tipo = 'debit'`,
    [entidade_id, periodo_id],
  );

  const totalCustos =
    (condominio?.total || 0) +
    (manutencao?.total || 0) +
    (aguaEnergia?.total || 0) +
    (impostos?.total || 0) +
    (depreciacao?.total || 0);

  const resultadoOperacional = totalReceitas - totalCustos;

  // Juros
  const [despesaJuros] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 17 AND tipo = 'debit'`,
    [entidade_id, periodo_id],
  );

  const [receitaJuros] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 29 AND tipo = 'credit'`,
    [entidade_id, periodo_id],
  );

  const resultadoFinal =
    resultadoOperacional - (despesaJuros?.total || 0) + (receitaJuros?.total || 0);

  return {
    receitas: {
      aluguel: receitasAluguel?.total || 0,
      reajustes: receitasReajustes?.total || 0,
      outras_receitas: outrasReceitas?.total || 0,
      total_receitas: totalReceitas,
    },
    custos: {
      condominio: condominio?.total || 0,
      manutencao: manutencao?.total || 0,
      agua_energia: aguaEnergia?.total || 0,
      impostos: impostos?.total || 0,
      depreciacao: depreciacao?.total || 0,
      total_custos: totalCustos,
    },
    resultado_operacional: resultadoOperacional,
    juros: {
      despesa_juros_financiamento: despesaJuros?.total || 0,
      receita_juros: receitaJuros?.total || 0,
      resultado_juros: (receitaJuros?.total || 0) - (despesaJuros?.total || 0),
    },
    resultado_final: resultadoFinal,
  };
}

/** Balanço Patrimonial */
export interface LinhasBalancete {
  ativo: {
    circulante: number;
    imovel: number;
    depreciacaoAcumulada: number;
    total_ativo: number;
  };
  passivo: {
    circulante: number;
    financiamentos: number;
    total_passivo: number;
  };
  patrimonio_liquido: number;
}

export function gerarBalanco(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): LinhasBalancete {
  // Ativo Circulante (Contas Correntes)
  const [ativoCirculante] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(CASE WHEN tipo = 'debit' THEN valor ELSE -valor END), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 2`,
    [entidade_id, periodo_id],
  );

  // Imóvel (Ativo Imobilizado)
  const [imovel] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 10 AND tipo = 'debit'`,
    [entidade_id, periodo_id],
  );

  // Depreciação Acumulada
  const [depreciacaoAcumulada] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 14 AND tipo = 'credit'`,
    [entidade_id, periodo_id],
  );

  const totalAtivo =
    (ativoCirculante?.total || 0) + (imovel?.total || 0) - (depreciacaoAcumulada?.total || 0);

  // Passivo Circulante
  const [passivoCirculante] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 4 AND tipo = 'credit'`,
    [entidade_id, periodo_id],
  );

  // Financiamentos a Pagar
  const [financiamentos] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(CASE WHEN tipo = 'credit' THEN valor ELSE -valor END), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 11`,
    [entidade_id, periodo_id],
  );

  const totalPassivo = (passivoCirculante?.total || 0) + (financiamentos?.total || 0);

  // Patrimônio Líquido
  const patrimonioLiquido = totalAtivo - totalPassivo;

  return {
    ativo: {
      circulante: ativoCirculante?.total || 0,
      imovel: imovel?.total || 0,
      depreciacaoAcumulada: depreciacaoAcumulada?.total || 0,
      total_ativo: totalAtivo,
    },
    passivo: {
      circulante: passivoCirculante?.total || 0,
      financiamentos: financiamentos?.total || 0,
      total_passivo: totalPassivo,
    },
    patrimonio_liquido: patrimonioLiquido,
  };
}

/** Fluxo de Caixa */
export interface FluxoCaixaResultado {
  operacional: {
    entradas: number;
    saidas: number;
    liquido: number;
  };
  investimento: {
    aquisicoes: number;
    depreciacao: number;
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
  // Operacional: Entradas (Aluguel, Rateios, etc)
  const [entradasOperacional] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND tipo = 'debit' AND conta_id IN (1, 2, 25, 26)`,
    [entidade_id, periodo_id],
  );

  // Operacional: Saídas (Despesas com Condomínio, Manutenção, etc)
  const [saidasOperacional] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND tipo = 'credit' AND conta_id IN (20, 21, 22, 23, 24, 28)`,
    [entidade_id, periodo_id],
  );

  // Investimento: Aquisição de Imóvel
  const [aquisicoes] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 10 AND tipo = 'debit'`,
    [entidade_id, periodo_id],
  );

  // Financiamento: Novos Empréstimos
  const [emprestimos] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 11 AND tipo = 'credit'`,
    [entidade_id, periodo_id],
  );

  // Financiamento: Amortizações
  const [amortizacoes] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(valor), 0) as total
     FROM transacoes_integradas
     WHERE entidade_id = ? AND periodo_id = ? AND conta_id = 11 AND tipo = 'debit'`,
    [entidade_id, periodo_id],
  );

  const fluxoOperacional = (entradasOperacional?.total || 0) - (saidasOperacional?.total || 0);
  const fluxoInvestimento = -(aquisicoes?.total || 0);
  const fluxoFinanciamento =
    (emprestimos?.total || 0) - (amortizacoes?.total || 0);

  const saldoFinal = fluxoOperacional + fluxoInvestimento + fluxoFinanciamento;

  return {
    operacional: {
      entradas: entradasOperacional?.total || 0,
      saidas: saidasOperacional?.total || 0,
      liquido: fluxoOperacional,
    },
    investimento: {
      aquisicoes: aquisicoes?.total || 0,
      depreciacao: 0, // Não gera fluxo de caixa
      liquido: fluxoInvestimento,
    },
    financiamento: {
      emprestimos: emprestimos?.total || 0,
      amortizacoes: amortizacoes?.total || 0,
      liquido: fluxoFinanciamento,
    },
    saldo_final: saldoFinal,
  };
}
