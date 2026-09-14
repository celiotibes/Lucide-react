/**
 * Budget vs Realizado (Variance Analysis)
 * Planejamento orçamentário e análise de variações
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface LinhaBudget {
  codigo: string;
  descricao: string;
  grupo: string;
  tipo: "receita" | "despesa";
  orcado: number;
  realizado: number;
  variacao: number;
  variacao_percentual: number;
  status: "ok" | "alerta" | "critico";
}

export interface ResumoBudget {
  periodo: string;
  receitas_orcadas: number;
  receitas_realizadas: number;
  receitas_variacao: number;
  despesas_orcadas: number;
  despesas_realizadas: number;
  despesas_variacao: number;
  resultado_orcado: number;
  resultado_realizado: number;
  resultado_variacao: number;
  linhas: LinhaBudget[];
}

export function calcularBudgetVariance(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): ResumoBudget {
  // Obter período para exibição
  const [periodo] = consultar<{ ano: number; mes: number }>(
    db,
    "SELECT ano, mes FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );

  const linhas: LinhaBudget[] = [];

  // Orçamentos por conta (valores planejados - este é um modelo simplificado)
  // Em uma implementação completa, teria uma tabela de budgets
  const orcadoPorConta = new Map<string, number>();

  // Exemplo de orçamentos defaults (75% das receitas do mês anterior, mesmas despesas)
  const [receitasAnterior] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_credito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     INNER JOIN periodos_contabeis p ON le.periodo_id = p.id
     WHERE le.entidade_id = ? AND cp.grupo = 'receita'
       AND p.id < ?
     ORDER BY p.id DESC LIMIT 1`,
    [entidade_id, periodo_id],
  );

  const receitasOrcada = (receitasAnterior?.total || 0) * 0.75;
  orcadoPorConta.set("5.TOTAL", receitasOrcada);

  const [despesasAnterior] = consultar<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(le.valor_debito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     INNER JOIN periodos_contabeis p ON le.periodo_id = p.id
     WHERE le.entidade_id = ? AND cp.grupo = 'despesa'
       AND p.id < ?
     ORDER BY p.id DESC LIMIT 1`,
    [entidade_id, periodo_id],
  );

  const despesasOrcada = despesasAnterior?.total || 0;
  orcadoPorConta.set("6.TOTAL", despesasOrcada);

  // Construir linhas de receita
  const receitas = consultar<{
    codigo: string;
    descricao: string;
    realizado: number;
  }>(
    db,
    `SELECT cp.codigo, cp.descricao,
            COALESCE(SUM(le.valor_credito), 0) as realizado
     FROM contas_plano_contas cp
     LEFT JOIN ledger_entries le ON le.conta_id = cp.id
       AND le.entidade_id = ? AND le.periodo_id = ?
     WHERE cp.grupo = 'receita' AND cp.codigo LIKE '5.1%'
     GROUP BY cp.id, cp.codigo, cp.descricao
     ORDER BY cp.codigo`,
    [entidade_id, periodo_id],
  );

  let totalReceitasOrcadas = 0;
  let totalReceitasRealizadas = 0;

  for (const r of receitas) {
    const orcado = orcadoPorConta.get(r.codigo) || (receitasOrcada / 3);
    const variacao = r.realizado - orcado;
    const variacao_pct =
      orcado > 0 ? (variacao / orcado) * 100 : r.realizado > 0 ? 100 : 0;

    totalReceitasOrcadas += orcado;
    totalReceitasRealizadas += r.realizado;

    linhas.push({
      codigo: r.codigo,
      descricao: r.descricao || "",
      grupo: "receita",
      tipo: "receita",
      orcado,
      realizado: r.realizado,
      variacao,
      variacao_percentual: variacao_pct,
      status:
        variacao_pct >= -5
          ? "ok"
          : variacao_pct >= -15
            ? "alerta"
            : "critico",
    });
  }

  // Construir linhas de despesa
  const despesas = consultar<{
    codigo: string;
    descricao: string;
    realizado: number;
  }>(
    db,
    `SELECT cp.codigo, cp.descricao,
            COALESCE(SUM(le.valor_debito), 0) as realizado
     FROM contas_plano_contas cp
     LEFT JOIN ledger_entries le ON le.conta_id = cp.id
       AND le.entidade_id = ? AND le.periodo_id = ?
     WHERE cp.grupo = 'despesa' AND cp.codigo LIKE '6.1%'
     GROUP BY cp.id, cp.codigo, cp.descricao
     ORDER BY cp.codigo`,
    [entidade_id, periodo_id],
  );

  let totalDespesasOrcadas = 0;
  let totalDespesasRealizadas = 0;

  for (const d of despesas) {
    const orcado = orcadoPorConta.get(d.codigo) || (despesasOrcada / 5);
    const variacao = d.realizado - orcado;
    const variacao_pct =
      orcado > 0 ? (variacao / orcado) * 100 : d.realizado > 0 ? 100 : 0;

    totalDespesasOrcadas += orcado;
    totalDespesasRealizadas += d.realizado;

    linhas.push({
      codigo: d.codigo,
      descricao: d.descricao || "",
      grupo: "despesa",
      tipo: "despesa",
      orcado,
      realizado: d.realizado,
      variacao,
      variacao_percentual: variacao_pct,
      status:
        variacao_pct <= 5
          ? "ok"
          : variacao_pct <= 15
            ? "alerta"
            : "critico",
    });
  }

  const resultado_orcado = totalReceitasOrcadas - totalDespesasOrcadas;
  const resultado_realizado = totalReceitasRealizadas - totalDespesasRealizadas;
  const resultado_variacao = resultado_realizado - resultado_orcado;

  return {
    periodo: periodo ? `${periodo.ano}/${String(periodo.mes).padStart(2, "0")}` : "N/A",
    receitas_orcadas: totalReceitasOrcadas,
    receitas_realizadas: totalReceitasRealizadas,
    receitas_variacao: totalReceitasRealizadas - totalReceitasOrcadas,
    despesas_orcadas: totalDespesasOrcadas,
    despesas_realizadas: totalDespesasRealizadas,
    despesas_variacao: totalDespesasRealizadas - totalDespesasOrcadas,
    resultado_orcado,
    resultado_realizado,
    resultado_variacao,
    linhas,
  };
}
