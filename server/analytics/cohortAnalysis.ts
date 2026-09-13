// Análise de coortes: acompanhar comportamento de pagamento por período de início

import type { Pool } from 'pg';

export interface CohortMetrica {
  cohortMes: string; // YYYY-MM
  idadeCohorte: number; // meses desde início da coorte
  numeroContratos: number;
  contractosComPagamentosAdia: number;
  taxaPagamentoAdia: number; // 0-100
  diasMedioAtraso: number;
  valorMedioAluguel: number;
}

export interface CohortMatrix {
  cohortMes: string;
  metricas: CohortMetrica[];
}

/**
 * Análise de coorte: agrupa contratos por mês de início
 * e acompanha taxa de pagamento em dia ao longo do tempo
 */
export async function analisarCohortePagamentos(
  pool: Pool,
  opcoes?: {
    dataInicioFiltro?: Date;
    dataFimFiltro?: Date;
  }
): Promise<CohortMatrix[]> {
  const dataInicio = opcoes?.dataInicioFiltro || new Date(new Date().getFullYear(), 0, 1);
  const dataFim = opcoes?.dataFimFiltro || new Date();

  const { rows: dados } = await pool.query<{
    cohort_mes: string;
    idade_cohorte: number;
    num_contratos: number;
    contratos_pago_dia: number;
    dias_medio_atraso: string;
    valor_medio_aluguel: string;
  }>(
    `
    with cohorts as (
      select
        date_trunc('month', c.data_inicio)::date as cohort_mes,
        c.id as contrato_id,
        extract(month from age(current_date, c.data_inicio))::int as idade_cohorte_meses,
        extract(year from age(current_date, c.data_inicio)) * 12 +
        extract(month from age(current_date, c.data_inicio))::int as idade_cohorte
      from contratos c
      where c.tipo = 'locacao_padrao'
        and c.data_inicio >= $1::date
        and c.data_inicio <= $2::date
    ),
    pagamentos as (
      select
        cohortes.cohort_mes,
        cohortes.idade_cohorte,
        cohortes.contrato_id,
        case
          when max(f.vencimento) <= current_date
            and count(case when ca.status = 'pago' then 1 end) = count(*)
          then 1
          else 0
        end as pago_dia,
        floor(extract(epoch from (current_date - max(f.vencimento))) / 86400)::int as dias_atraso,
        avg(f.valor_bruto)::numeric(14,2) as valor_medio
      from cohorts
      left join faturas f on f.contrato_id = cohortes.contrato_id
      left join cobrancas_asaas ca on ca.fatura_id = f.id
      group by
        cohortes.cohort_mes,
        cohortes.idade_cohorte,
        cohortes.contrato_id
    )
    select
      to_char(p.cohort_mes, 'YYYY-MM') as cohort_mes,
      p.idade_cohorte,
      count(distinct p.contrato_id)::int as num_contratos,
      sum(p.pago_dia)::int as contratos_pago_dia,
      round((sum(p.pago_dia)::numeric / count(distinct p.contrato_id) * 100), 2)::numeric(5,2) as taxa_pago_dia,
      round(avg(greatest(p.dias_atraso, 0)), 1)::numeric(5,1) as dias_medio_atraso,
      avg(p.valor_medio)::numeric(14,2) as valor_medio_aluguel
    from pagamentos p
    group by
      p.cohort_mes,
      p.idade_cohorte
    order by
      p.cohort_mes asc,
      p.idade_cohorte asc
  `,
    [
      dataInicio.toISOString().split('T')[0],
      dataFim.toISOString().split('T')[0],
    ]
  );

  // Agrupar por cohort
  const mapaCohortes: { [key: string]: CohortMetrica[] } = {};

  for (const linha of dados) {
    const cohort = linha.cohort_mes;

    if (!mapaCohortes[cohort]) {
      mapaCohortes[cohort] = [];
    }

    mapaCohortes[cohort].push({
      cohortMes: cohort,
      idadeCohorte: linha.idade_cohorte,
      numeroContratos: linha.num_contratos,
      contractosComPagamentosAdia: linha.contratos_pago_dia,
      taxaPagamentoAdia: parseFloat(linha.taxa_pago_dia),
      diasMedioAtraso: parseFloat(linha.dias_medio_atraso),
      valorMedioAluguel: parseFloat(linha.valor_medio_aluguel),
    });
  }

  // Converter para array de matrizes
  return Object.entries(mapaCohortes).map(([cohortMes, metricas]) => ({
    cohortMes,
    metricas: metricas.sort((a, b) => a.idadeCohorte - b.idadeCohorte),
  }));
}

/**
 * Resumo de saúde de uma coorte específica
 */
export async function obterSaudeCohorteMes(
  pool: Pool,
  cohortMes: string // YYYY-MM
): Promise<{
  cohortMes: string;
  numéroContratos: number;
  taxaPagamentoAdia: number;
  diasMedioAtraso: number;
  valorTotalMensal: number;
  tendencia: 'melhorando' | 'estavel' | 'piorando';
}> {
  const { rows } = await pool.query<{
    num_contratos: number;
    taxa_pago_dia: string;
    dias_medio_atraso: string;
    valor_total_mensal: string;
  }>(
    `
    with cohort_contratos as (
      select
        c.id as contrato_id,
        case
          when max(f.vencimento) <= current_date
            and count(case when ca.status = 'pago' then 1 end) = count(*)
          then 1
          else 0
        end as pago_dia,
        floor(extract(epoch from (current_date - max(f.vencimento))) / 86400)::int as dias_atraso,
        sum(f.valor_bruto)::numeric(14,2) as valor_total
      from contratos c
      left join faturas f on f.contrato_id = c.id
      left join cobrancas_asaas ca on ca.fatura_id = f.id
      where date_trunc('month', c.data_inicio)::date = $1::date
      group by c.id
    )
    select
      count(*)::int as num_contratos,
      round((sum(pago_dia)::numeric / count(*) * 100), 2)::numeric(5,2) as taxa_pago_dia,
      round(avg(greatest(dias_atraso, 0)), 1)::numeric(5,1) as dias_medio_atraso,
      sum(valor_total)::numeric(14,2) as valor_total_mensal
    from cohort_contratos
  `,
    [cohortMes + '-01']
  );

  if (rows.length === 0) {
    throw new Error(`Coorte não encontrada: ${cohortMes}`);
  }

  const dado = rows[0];
  const taxaPagamento = parseFloat(dado.taxa_pago_dia);

  // Simples heurística de tendência
  let tendencia: 'melhorando' | 'estavel' | 'piorando' = 'estavel';
  if (taxaPagamento > 85) {
    tendencia = 'melhorando';
  } else if (taxaPagamento < 70) {
    tendencia = 'piorando';
  }

  return {
    cohortMes,
    numéroContratos: dado.num_contratos,
    taxaPagamentoAdia: taxaPagamento,
    diasMedioAtraso: parseFloat(dado.dias_medio_atraso),
    valorTotalMensal: parseFloat(dado.valor_total_mensal),
    tendencia,
  };
}
