import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface CelulaHeatmap {
  categoria: string;
  codigo: string;
  mes: string; // YYYY-MM
  valor: number;
}

export interface HeatmapDespesas {
  categorias: string[]; // até MAX_CATEGORIAS, ordenadas por soma total decrescente
  meses: string[]; // YYYY-MM, ordem cronológica
  celulas: CelulaHeatmap[];
  valorMaximo: number; // maior valor de uma única célula — usado para normalizar a intensidade de cor
}

const MAX_CATEGORIAS = 10;

/** Matriz categoria de despesa × mês, para o mapa de calor do Painel — identifica visualmente
 * em qual mês cada categoria (centro de custo) pesou mais, sem precisar ler linha a linha uma
 * tabela. Mesma convenção de natureza usada em fluxoFinanceiro.ts (débito real, exclui
 * transferência) para não misturar despesa de fato com movimentação entre contas próprias.
 * Limita às MAX_CATEGORIAS maiores por soma total no período — categorias menores ficam de
 * fora da matriz (o objetivo é achar o que pesa mais, não listar tudo; a tabela "Resultado por
 * imóvel/cidade" já cobre o total completo). */
export function gerarHeatmapDespesas(db: Database, dataInicio: string, dataFim: string): HeatmapDespesas {
  const linhas = consultar<{ categoria: string; codigo: string; mes: string; valor: number }>(
    db,
    `SELECT p.descricao AS categoria, p.codigo AS codigo, substr(t.data, 1, 7) AS mes, SUM(ABS(t.valor)) AS valor
     FROM transacoes t
     JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
     WHERE p.natureza = 'debito' AND p.grupo != 'transferencia' AND t.data BETWEEN ? AND ?
     GROUP BY categoria, codigo, mes
     HAVING SUM(ABS(t.valor)) > 0
     ORDER BY mes`,
    [dataInicio, dataFim],
  );

  const totalPorCategoria = new Map<string, number>();
  for (const l of linhas) totalPorCategoria.set(l.categoria, (totalPorCategoria.get(l.categoria) ?? 0) + l.valor);
  const categorias = Array.from(totalPorCategoria.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CATEGORIAS)
    .map(([categoria]) => categoria);
  const categoriasPermitidas = new Set(categorias);

  const meses = Array.from(new Set(linhas.map((l) => l.mes))).sort();
  const celulas = linhas.filter((l) => categoriasPermitidas.has(l.categoria));
  const valorMaximo = celulas.reduce((acc, c) => Math.max(acc, c.valor), 0);

  return { categorias, meses, celulas, valorMaximo };
}
