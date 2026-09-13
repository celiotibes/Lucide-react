// Predição de risco de falta de pagamento
// Score baseado em comportamento de pagamento histórico

import type { Pool } from 'pg';

export interface RiscoContrato {
  contratoId: string;
  imovelIdentificacao: string;
  locatarioNome: string;
  scoreRisco: number; // 0-100 (0=baixo risco, 100=alto risco)
  motivoRisco: string[];
  diasAtrasoMedio: number;
  taxaPagamentoAdia: number;
  ultimoPagamento: string | null;
  recomenacao: 'baixo' | 'medio' | 'alto' | 'critico';
}

/**
 * Calcular score de risco para cada contrato
 * Baseado em:
 * - Frequência de atrasos
 * - Dias de atraso médio
 * - Tendência recente
 * - Histórico de pagamento
 */
export async function analisarRiscoContratos(
  pool: Pool,
  limite?: number // limitar quantidade de resultados
): Promise<RiscoContrato[]> {
  const { rows: dados } = await pool.query<{
    contrato_id: string;
    imovel_identificacao: string;
    locatario_nome: string;
    dias_atraso_medio: string;
    taxa_pagamento_adia: string;
    numero_atrasos: number;
    dias_desde_ultimo_pagamento: string | null;
    valor_minimo_30_dias: string | null;
  }>(
    `
    with pagamentos_contrato as (
      select
        c.id as contrato_id,
        i.identificacao as imovel_identificacao,
        p.nome as locatario_nome,
        extract(epoch from (current_date - max(f.vencimento))) / 86400 as dias_desde_vencimento,
        floor(extract(epoch from (current_date - max(f.vencimento))) / 86400)::int as dias_atraso,
        count(*) as total_faturas,
        count(case when extract(epoch from (current_date - f.vencimento)) / 86400 > 0 then 1 end)::int as num_atrasos,
        max(ca.data_pagamento) as ultimo_pagamento,
        min(f.valor_bruto) as valor_minimo_30d
      from contratos c
      join imoveis i on i.id = c.imovel_id
      join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
      join pessoas p on p.id = cp.pessoa_id
      left join faturas f on f.contrato_id = c.id
      left join cobrancas_asaas ca on ca.fatura_id = f.id and ca.status = 'pago'
      where c.tipo = 'locacao_padrao' and c.status in ('ativo', 'aviso_previo')
      group by c.id, i.identificacao, p.nome
    )
    select
      contrato_id,
      imovel_identificacao,
      locatario_nome,
      round(avg(greatest(dias_atraso, 0)), 1)::numeric(5,1) as dias_atraso_medio,
      round((
        count(case when dias_atraso > 0 then 1 end)::numeric / nullif(total_faturas, 0) * 100
      ), 2)::numeric(5,2) as taxa_pagamento_adia,
      num_atrasos as numero_atrasos,
      to_char(ultimo_pagamento, 'YYYY-MM-DD') as dias_desde_ultimo_pagamento,
      to_char(valor_minimo_30d, '99999.99') as valor_minimo_30_dias
    from pagamentos_contrato
    where total_faturas > 0
    order by dias_atraso_medio desc
    limit $1
  `,
    [limite || 1000]
  );

  return dados.map((d) => {
    const diasAtrasoMedio = parseFloat(d.dias_atraso_medio || '0');
    const taxaPagamento = 100 - parseFloat(d.taxa_pagamento_adia || '0');
    const numAtrasos = d.numero_atrasos;

    // Calcular score (0-100)
    let score = 0;
    const motivos: string[] = [];

    // Fator 1: dias de atraso médio (max 40 pontos)
    if (diasAtrasoMedio > 30) {
      score += 40;
      motivos.push(`Atraso médio: ${diasAtrasoMedio.toFixed(1)} dias`);
    } else if (diasAtrasoMedio > 15) {
      score += 25;
      motivos.push(`Atraso médio: ${diasAtrasoMedio.toFixed(1)} dias`);
    } else if (diasAtrasoMedio > 5) {
      score += 10;
    }

    // Fator 2: frequência de atrasos (max 35 pontos)
    const taxaAtraso = 100 - taxaPagamento;
    if (taxaAtraso > 50) {
      score += 35;
      motivos.push(`${taxaAtraso.toFixed(1)}% das faturas atrasadas`);
    } else if (taxaAtraso > 30) {
      score += 20;
      motivos.push(`${taxaAtraso.toFixed(1)}% das faturas atrasadas`);
    } else if (taxaAtraso > 10) {
      score += 10;
    }

    // Fator 3: número absoluto de atrasos (max 15 pontos)
    if (numAtrasos > 6) {
      score += 15;
      motivos.push(`${numAtrasos} atrasos registrados`);
    } else if (numAtrasos > 3) {
      score += 8;
    }

    // Fator 4: recência (último pagamento muito antigo) (max 15 pontos)
    if (d.dias_desde_ultimo_pagamento) {
      const diasDesdeUltimo = Math.floor(
        (new Date().getTime() - new Date(d.dias_desde_ultimo_pagamento).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diasDesdeUltimo > 60) {
        score += 15;
        motivos.push(`Último pagamento há ${diasDesdeUltimo} dias`);
      } else if (diasDesdeUltimo > 30) {
        score += 8;
      }
    }

    // Limitar score entre 0-100
    score = Math.min(100, Math.max(0, score));

    // Determinar recomendação
    let recomendacao: 'baixo' | 'medio' | 'alto' | 'critico' = 'baixo';
    if (score >= 80) recomendacao = 'critico';
    else if (score >= 60) recomendacao = 'alto';
    else if (score >= 40) recomendacao = 'medio';

    return {
      contratoId: d.contrato_id,
      imovelIdentificacao: d.imovel_identificacao,
      locatarioNome: d.locatario_nome,
      scoreRisco: score,
      motivoRisco: motivos,
      diasAtrasoMedio: parseFloat(d.dias_atraso_medio || '0'),
      taxaPagamentoAdia: taxaPagamento,
      ultimoPagamento: d.dias_desde_ultimo_pagamento,
      recomenacao,
    };
  });
}

/**
 * Obter lista de contratos em risco crítico (score >= 80)
 */
export async function obterContratosRiscoCritico(pool: Pool): Promise<RiscoContrato[]> {
  const todos = await analisarRiscoContratos(pool);
  return todos.filter((c) => c.scoreRisco >= 80).sort((a, b) => b.scoreRisco - a.scoreRisco);
}

/**
 * Calcular probabilidade de churn (30/60/90 dias)
 */
export async function estimarChurnProbabilidade(
  pool: Pool,
  dias: 30 | 60 | 90 = 30
): Promise<{
  diasFuturos: number;
  probabilidadeChurn: number;
  contratosEmRisco: number;
}> {
  const { rows } = await pool.query<{
    contratos_total: number;
    contratos_em_risco: number;
  }>(
    `
    select
      count(distinct c.id)::int as contratos_total,
      count(distinct case when scoreRisco >= 60 then c.id end)::int as contratos_em_risco
    from contratos c
    where c.tipo = 'locacao_padrao' and c.status in ('ativo', 'aviso_previo')
  `
  );

  if (rows.length === 0 || rows[0].contratos_total === 0) {
    return {
      diasFuturos: dias,
      probabilidadeChurn: 0,
      contratosEmRisco: 0,
    };
  }

  const totalContratos = rows[0].contratos_total;
  const contratosEmRisco = rows[0].contratos_em_risco;

  // Estimativa simples: probabilidade proporcional ao número de contratos em risco
  const probabilidade = (contratosEmRisco / totalContratos) * 100;

  return {
    diasFuturos: dias,
    probabilidadeChurn: Math.min(100, probabilidade),
    contratosEmRisco,
  };
}
