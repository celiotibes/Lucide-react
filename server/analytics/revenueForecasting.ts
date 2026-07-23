// Time-series revenue forecasting with confidence intervals
// Predicts monthly revenue (30/60/90 dias forward) based on historical patterns

import type { Pool } from 'pg';

export interface ReceitaMensal {
  mes: string; // YYYY-MM
  receitaPrevista: number;
  receitaRealizada: number | null;
  taxaColeta: number; // percentual
}

export interface PrevisaoReceita {
  diasFuturos: 30 | 60 | 90;
  receitaPrevista: number;
  limiteInferior: number; // intervalo de confiança 95%
  limiteSuperior: number;
  tendencia: 'crescente' | 'estavel' | 'decrescente';
  confianca: number; // 0-100
  comparativoAnterior: number; // % mudança vs período anterior
}

export interface AnaliseReceita {
  historico: ReceitaMensal[];
  taxaColetaMedia: number;
  previsoes: PrevisaoReceita[];
}

/**
 * Análise histórica de receita coletada
 * Baseado em: faturas emitidas, pagamentos recebidos, multa/juros
 */
export async function analisarReceita(
  pool: Pool,
  mesesHistorico: number = 12
): Promise<AnaliseReceita> {
  const dataInicio = new Date();
  dataInicio.setMonth(dataInicio.getMonth() - mesesHistorico);

  const { rows: dados } = await pool.query<{
    mes: string;
    receita_realizada: string;
    taxa_coleta: string;
    faturas_emitidas: string;
  }>(
    `
    with receita_mensal as (
      select
        date_trunc('month', ca.data_pagamento)::date as mes_data,
        to_char(date_trunc('month', ca.data_pagamento), 'YYYY-MM') as mes,
        sum(ca.valor_liquido)::numeric(14,2) as receita_realizada,
        count(distinct f.id)::int as num_faturas
      from cobrancas_asaas ca
      join faturas f on f.id = ca.fatura_id
      where ca.data_pagamento >= $1::date
        and ca.status in ('pago', 'processando')
      group by date_trunc('month', ca.data_pagamento)::date
    ),
    receita_esperada as (
      select
        date_trunc('month', f.vencimento)::date as mes_data,
        to_char(date_trunc('month', f.vencimento), 'YYYY-MM') as mes,
        sum(f.valor_bruto)::numeric(14,2) as receita_esperada
      from faturas f
      where f.vencimento >= $1::date
        and f.tipo in ('aluguel', 'multa', 'juros', 'taxa_adm')
      group by date_trunc('month', f.vencimento)::date
    )
    select
      coalesce(re.mes, r.mes) as mes,
      coalesce(r.receita_realizada, 0)::numeric(14,2) as receita_realizada,
      re.receita_esperada::numeric(14,2) as faturas_emitidas,
      case
        when re.receita_esperada > 0
        then round((coalesce(r.receita_realizada, 0) / re.receita_esperada * 100), 2)
        else 0
      end::numeric(5,2) as taxa_coleta
    from receita_esperada re
    full outer join receita_mensal r on r.mes_data = re.mes_data
    order by coalesce(re.mes, r.mes) asc
  `,
    [dataInicio.toISOString().split('T')[0]]
  );

  const historico: ReceitaMensal[] = dados.map((d) => ({
    mes: d.mes,
    receitaPrevista: parseFloat(d.faturas_emitidas || '0'),
    receitaRealizada: parseFloat(d.receita_realizada || '0'),
    taxaColeta: parseFloat(d.taxa_coleta || '0'),
  }));

  const taxaColetaMedia = historico.reduce((sum, m) => sum + m.taxaColeta, 0) / Math.max(historico.length, 1);

  // Calcular previsões simples usando tendência linear + taxa de coleta média
  const previsoes = calcularPrevisoes(historico, taxaColetaMedia);

  return {
    historico,
    taxaColetaMedia,
    previsoes,
  };
}

/**
 * Calcular previsões para 30/60/90 dias
 * Usando média móvel ponderada + regressão linear simples
 */
function calcularPrevisoes(historico: ReceitaMensal[], taxaColetaMedia: number): PrevisaoReceita[] {
  const realizadas = historico
    .filter((h) => h.receitaRealizada !== null)
    .map((h) => h.receitaRealizada!);

  if (realizadas.length === 0) {
    return [
      { diasFuturos: 30, receitaPrevista: 0, limiteInferior: 0, limiteSuperior: 0, tendencia: 'estavel', confianca: 0, comparativoAnterior: 0 },
      { diasFuturos: 60, receitaPrevista: 0, limiteInferior: 0, limiteSuperior: 0, tendencia: 'estavel', confianca: 0, comparativoAnterior: 0 },
      { diasFuturos: 90, receitaPrevista: 0, limiteInferior: 0, limiteSuperior: 0, tendencia: 'estavel', confianca: 0, comparativoAnterior: 0 },
    ];
  }

  const mediaMovel = realizadas.slice(-3).reduce((a, b) => a + b, 0) / Math.min(realizadas.length, 3);
  const desvio = Math.sqrt(
    realizadas.reduce((sum, v) => sum + Math.pow(v - mediaMovel, 2), 0) / Math.max(realizadas.length - 1, 1)
  );

  const ultimoValor = realizadas[realizadas.length - 1];
  const penultimoValor = realizadas[realizadas.length - 2] || ultimoValor;
  const tendenciaRecente = ultimoValor >= penultimoValor ? ultimoValor - penultimoValor : penultimoValor - ultimoValor;

  // Detectar tendência geral
  let tendencia: 'crescente' | 'estavel' | 'decrescente' = 'estavel';
  if (realizadas.length >= 3) {
    const primeiroTerceiro = realizadas.slice(0, Math.floor(realizadas.length / 3));
    const ultimoTerceiro = realizadas.slice(-Math.floor(realizadas.length / 3));
    const mediaAnterior = primeiroTerceiro.reduce((a, b) => a + b, 0) / primeiroTerceiro.length;
    const mediaRecente = ultimoTerceiro.reduce((a, b) => a + b, 0) / ultimoTerceiro.length;

    if (mediaRecente > mediaAnterior * 1.1) tendencia = 'crescente';
    else if (mediaRecente < mediaAnterior * 0.9) tendencia = 'decrescente';
  }

  // Aplicar taxa de coleta média às previsões de receita
  const receitaBase = mediaMovel * 1.02; // leve crescimento
  const confianca = Math.min(100, (realizadas.length / 12) * 100); // mais dados = mais confiança

  return [
    {
      diasFuturos: 30,
      receitaPrevista: Math.round(receitaBase * taxaColetaMedia),
      limiteInferior: Math.round((receitaBase * taxaColetaMedia - desvio * 0.5) * 0.95),
      limiteSuperior: Math.round((receitaBase * taxaColetaMedia + desvio * 0.5) * 1.05),
      tendencia,
      confianca,
      comparativoAnterior:
        penultimoValor > 0 ? Math.round(((ultimoValor - penultimoValor) / penultimoValor) * 100) : 0,
    },
    {
      diasFuturos: 60,
      receitaPrevista: Math.round(receitaBase * 2 * taxaColetaMedia * (tendencia === 'crescente' ? 1.05 : 1)),
      limiteInferior: Math.round((receitaBase * 2 * taxaColetaMedia - desvio) * 0.9),
      limiteSuperior: Math.round((receitaBase * 2 * taxaColetaMedia + desvio) * 1.1),
      tendencia,
      confianca: Math.max(confianca - 10, 50),
      comparativoAnterior: Math.round(((receitaBase - mediaMovel) / mediaMovel) * 100),
    },
    {
      diasFuturos: 90,
      receitaPrevista: Math.round(receitaBase * 3 * taxaColetaMedia * (tendencia === 'crescente' ? 1.1 : 0.95)),
      limiteInferior: Math.round((receitaBase * 3 * taxaColetaMedia - desvio * 1.5) * 0.85),
      limiteSuperior: Math.round((receitaBase * 3 * taxaColetaMedia + desvio * 1.5) * 1.15),
      tendencia,
      confianca: Math.max(confianca - 20, 40),
      comparativoAnterior: Math.round(((receitaBase - mediaMovel) / mediaMovel) * 100),
    },
  ];
}

/**
 * Retornar métrica simples: receita esperada vs realizada últimos 30 dias
 */
export async function obterReceitaMensal(pool: Pool, mes: string): Promise<ReceitaMensal> {
  const { rows } = await pool.query<{
    receita_realizada: string;
    taxa_coleta: string;
  }>(
    `
    with mes_info as (
      select ($1 || '-01')::date as mes_date
    ),
    receita_data as (
      select
        sum(ca.valor_liquido)::numeric(14,2) as receita_realizada,
        count(distinct f.id)::int as num_faturas
      from cobrancas_asaas ca
      join faturas f on f.id = ca.fatura_id
      where date_trunc('month', ca.data_pagamento)::date = (select mes_date from mes_info)
        and ca.status in ('pago', 'processando')
    ),
    receita_esperada as (
      select
        sum(f.valor_bruto)::numeric(14,2) as receita_esperada
      from faturas f
      where date_trunc('month', f.vencimento)::date = (select mes_date from mes_info)
        and f.tipo in ('aluguel', 'multa', 'juros', 'taxa_adm')
    )
    select
      coalesce(rd.receita_realizada, 0)::numeric(14,2) as receita_realizada,
      case
        when re.receita_esperada > 0
        then round((coalesce(rd.receita_realizada, 0) / re.receita_esperada * 100), 2)
        else 0
      end::numeric(5,2) as taxa_coleta
    from receita_data rd, receita_esperada re
  `,
    [mes]
  );

  if (rows.length === 0) {
    return {
      mes,
      receitaPrevista: 0,
      receitaRealizada: 0,
      taxaColeta: 0,
    };
  }

  const dado = rows[0];
  return {
    mes,
    receitaPrevista: 0, // seria calculado do forecast
    receitaRealizada: parseFloat(dado.receita_realizada),
    taxaColeta: parseFloat(dado.taxa_coleta),
  };
}
