/**
 * Analytics e Dashboards Integrados
 * Insights consolidados de todos os módulos
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

/** KPI: Indicador de Desempenho de Rentabilidade */
export interface KPIRentabilidade {
  periodo: string;
  receita_total: number;
  despesa_total: number;
  resultado_liquido: number;
  margem_operacional: number;
  roi_patrimonio: number;
  taxa_inadimplencia: number;
}

export function calcularKPIRentabilidade(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): KPIRentabilidade {
  // Receita Total: contas 5.x.xx
  const [receita] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_credito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.grupo = 'receita'`,
    [entidade_id, periodo_id],
  );

  // Despesa Total: contas 6.x.xx
  const [despesa] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_debito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.grupo = 'despesa'`,
    [entidade_id, periodo_id],
  );

  const receita_total = receita?.total || 0;
  const despesa_total = despesa?.total || 0;
  const resultado_liquido = receita_total - despesa_total;
  const margem_operacional = receita_total > 0 ? (resultado_liquido / receita_total) * 100 : 0;

  // ROI: Resultado / Patrimônio Investido (imóveis)
  const [patrimonio] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(
      CASE WHEN cp.natureza = 'debito' THEN le.valor_debito
           ELSE le.valor_credito END), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo IN ('1.2.05')`,
    [entidade_id, periodo_id],
  );

  const roi = patrimonio?.total ? (resultado_liquido / patrimonio.total) * 100 : 0;

  // Taxa de Inadimplência.
  // contratos_locacao NÃO tem coluna status: a vigência é data_fim (nulo = vigente, ver
  // schema.sql), e inadimplência não é atributo do contrato — é calculada a partir das
  // competências versus os recebimentos, em domain/reconcile/inadimplencia.ts. As
  // consultas antigas filtravam por status IN ('com_atraso',...) e por status IN
  // ('ativo','pendente'), colunas inexistentes, e derrubavam a tela inteira com
  // "no such column: status".
  // FIXME: ligar em calcularInadimplencia() para este indicador deixar de ser zero; hoje
  // não há como derivá-lo só de contratos_locacao, e inventar um número seria pior.
  const inadimplentes = { valor: 0 };

  const [contratosTodos] = consultar<{ valor: number }>(
    db,
    `SELECT COALESCE(SUM(valor_referencia), 0) as valor FROM contratos_locacao
     WHERE data_fim IS NULL OR data_fim >= DATE('now')`,
    [],
  );

  const taxa_inadimplencia =
    (contratosTodos?.valor || 0) > 0
      ? ((inadimplentes?.valor || 0) / (contratosTodos?.valor || 0)) * 100
      : 0;

  const [periodo] = consultar<{ ano: number; mes: number }>(
    db,
    "SELECT ano, mes FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );

  return {
    periodo: `${periodo?.ano}/${String(periodo?.mes || 1).padStart(2, "0")}`,
    receita_total,
    despesa_total,
    resultado_liquido,
    margem_operacional,
    roi_patrimonio: roi,
    taxa_inadimplencia,
  };
}

/** Análise Comparativa: Períodos vs Benchmark */
export interface AnaliseTendencia {
  periodo_atual: KPIRentabilidade;
  periodo_anterior: KPIRentabilidade;
  variacao_receita_pct: number;
  variacao_despesa_pct: number;
  variacao_lucro_pct: number;
  tendencia: "crescente" | "estavel" | "decrescente";
}

export function calcularTendencia(
  db: Database,
  entidade_id: number,
  periodo_atual_id: number,
  periodo_anterior_id: number,
): AnaliseTendencia {
  const atual = calcularKPIRentabilidade(db, entidade_id, periodo_atual_id);
  const anterior = calcularKPIRentabilidade(db, entidade_id, periodo_anterior_id);

  const variacao_receita_pct =
    anterior.receita_total > 0
      ? ((atual.receita_total - anterior.receita_total) / anterior.receita_total) * 100
      : 0;

  const variacao_despesa_pct =
    anterior.despesa_total > 0
      ? ((atual.despesa_total - anterior.despesa_total) / anterior.despesa_total) * 100
      : 0;

  const variacao_lucro_pct =
    anterior.resultado_liquido !== 0
      ? ((atual.resultado_liquido - anterior.resultado_liquido) / Math.abs(anterior.resultado_liquido)) * 100
      : 0;

  let tendencia: "crescente" | "estavel" | "decrescente" = "estavel";
  if (variacao_lucro_pct > 5) tendencia = "crescente";
  else if (variacao_lucro_pct < -5) tendencia = "decrescente";

  return {
    periodo_atual: atual,
    periodo_anterior: anterior,
    variacao_receita_pct,
    variacao_despesa_pct,
    variacao_lucro_pct,
    tendencia,
  };
}

/** Análise de Ocupação e Imóveis */
export interface AnaliseOcupacao {
  total_imoveis: number;
  imoveis_alugados: number;
  imoveis_vagos: number;
  taxa_ocupacao_pct: number;
  receita_potencial: number;
  receita_realizada: number;
  gap_receita: number;
}

export function calcularOcupacao(db: Database): AnaliseOcupacao {
  const [imoveis] = consultar<{ total: number }>(
    db,
    "SELECT COUNT(*) as total FROM imoveis WHERE uso_pessoal = 0 AND financiado = 0",
    [],
  );

  const [alugados] = consultar<{ count: number; receita: number }>(
    db,
    `SELECT COUNT(DISTINCT c.imovel_id) as count, COALESCE(SUM(c.valor_referencia), 0) as receita
     FROM contratos_locacao c
     WHERE c.data_fim IS NULL OR c.data_fim >= DATE('now')`,
    [],
  );

  const [receitaRealizada] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_credito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE cp.codigo = '4.1.01'`,
    [],
  );

  const total = imoveis?.total || 0;
  const alugados_count = alugados?.count || 0;
  const vagos = total - alugados_count;
  const taxa_ocupacao = total > 0 ? (alugados_count / total) * 100 : 0;
  const potencial = alugados?.receita || 0;
  const realizada = receitaRealizada?.total || 0;
  const gap = potencial - realizada;

  return {
    total_imoveis: total,
    imoveis_alugados: alugados_count,
    imoveis_vagos: vagos,
    taxa_ocupacao_pct: taxa_ocupacao,
    receita_potencial: potencial,
    receita_realizada: realizada,
    gap_receita: gap,
  };
}

/** Análise de Patrimônio: Composição de Ativos */
export interface AnalisePatrimonio {
  valor_total_imoveis: number;
  valor_depreciacao_acumulada: number;
  valor_liquido_imoveis: number;
  proporção_financiado_pct: number;
  valor_financiado: number;
  valor_proprio: number;
}

export function calcularComposicaoPatrimonio(
  db: Database,
): AnalisePatrimonio {
  // Imóveis para Locação + Uso Pessoal
  const [imoveis] = consultar<{ valor_total: number }>(
    db,
    `SELECT COALESCE(SUM(i.valor_aquisicao), 0) as valor_total
     FROM imoveis i`,
    [],
  );

  // Financiamentos LP (3.2.01)
  const [financiamentos] = consultar<{ valor_financiado: number }>(
    db,
    `SELECT COALESCE(SUM(
      CASE WHEN cp.natureza = 'credito' THEN le.valor_credito
           ELSE le.valor_debito END), 0) as valor_financiado
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE cp.codigo = '3.2.01'`,
    [],
  );

  // Depreciação Acumulada (2.2.01)
  const [depreciacaoAcumulada] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(
      CASE WHEN cp.natureza = 'credito' THEN le.valor_credito
           ELSE le.valor_debito END), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE cp.codigo = '5.3.01'`,
    [],
  );

  const valor_total = imoveis?.valor_total || 0;
  const valor_financiado = financiamentos?.valor_financiado || 0;
  const valor_proprio = valor_total - valor_financiado;
  const depreciacao = depreciacaoAcumulada?.total || 0;
  const valor_liquido = valor_total - depreciacao;
  const proporcao = valor_total > 0 ? (valor_financiado / valor_total) * 100 : 0;

  return {
    valor_total_imoveis: valor_total,
    valor_depreciacao_acumulada: depreciacao,
    valor_liquido_imoveis: valor_liquido,
    proporção_financiado_pct: proporcao,
    valor_financiado,
    valor_proprio,
  };
}

/** Ranking de Performance: Imóveis por Rentabilidade */
export interface RankingImovelPerformance {
  imovel_id: number;
  apelido: string;
  receita_mensal: number;
  despesa_mensal: number;
  resultado_liquido: number;
  taxa_rentabilidade_pct: number;
}

export function calcularRankingImoveisPerformance(
  db: Database,
): RankingImovelPerformance[] {
  return consultar<RankingImovelPerformance>(
    db,
    `SELECT
      i.id as imovel_id,
      i.apelido,
      COALESCE(SUM(CASE WHEN le.origem_modulo = 'contratos' THEN le.valor_credito ELSE 0 END), 0) as receita_mensal,
      COALESCE(SUM(CASE WHEN le.origem_modulo IN ('rateios', 'vistorias') THEN le.valor_debito ELSE 0 END), 0) as despesa_mensal,
      (COALESCE(SUM(CASE WHEN le.origem_modulo = 'contratos' THEN le.valor_credito ELSE 0 END), 0) -
       COALESCE(SUM(CASE WHEN le.origem_modulo IN ('rateios', 'vistorias') THEN le.valor_debito ELSE 0 END), 0)) as resultado_liquido,
      CASE WHEN i.valor_aquisicao > 0
        THEN (((COALESCE(SUM(CASE WHEN le.origem_modulo = 'contratos' THEN le.valor_credito ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN le.origem_modulo IN ('rateios', 'vistorias') THEN le.valor_debito ELSE 0 END), 0)) / i.valor_aquisicao) * 100)
        ELSE 0 END as taxa_rentabilidade_pct
     FROM imoveis i
     LEFT JOIN ledger_entries le ON i.id = le.origem_id AND le.origem_modulo IN ('contratos', 'rateios', 'vistorias')
     WHERE i.uso_pessoal = 0 AND i.financiado = 0
     GROUP BY i.id
     ORDER BY resultado_liquido DESC`,
    [],
  );
}
