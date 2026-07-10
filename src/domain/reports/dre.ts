import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { LinhaDre } from "../types";

export function gerarDre(db: Database, dataInicio: string, dataFim: string, imovelId?: number): LinhaDre[] {
  // Sem filtro de imóvel: soma direta, cada transação conta uma única vez (rateada ou não).
  // Exclui por padrão imóveis de uso pessoal (residência própria) — não fazem parte da
  // atividade de fato de locação; LEFT JOIN porque t.imovel_id pode ser NULL (transação
  // sem imóvel, ou rateada — nesse caso i.uso_pessoal também vem NULL e a linha não é excluída).
  if (imovelId === undefined) {
    return consultar<LinhaDre>(
      db,
      `SELECT p.codigo, p.descricao, p.grupo, SUM(t.valor) AS total
       FROM transacoes t
       JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
       LEFT JOIN imoveis i ON i.id = t.imovel_id
       WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa')
         AND (i.uso_pessoal IS NULL OR i.uso_pessoal = 0)
       GROUP BY p.codigo, p.descricao, p.grupo
       ORDER BY p.grupo, p.codigo`,
      [dataInicio, dataFim],
    );
  }

  // Com filtro de imóvel: soma transações diretas do imóvel + a fatia de transações
  // rateadas entre vários imóveis (ex.: pintura do prédio, financiamento coletivo).
  return consultar<LinhaDre>(
    db,
    `SELECT codigo, descricao, grupo, SUM(total) AS total FROM (
       SELECT p.codigo AS codigo, p.descricao AS descricao, p.grupo AS grupo, t.valor AS total
       FROM transacoes t
       JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
       WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa') AND t.imovel_id = ?
       UNION ALL
       SELECT p.codigo AS codigo, p.descricao AS descricao, p.grupo AS grupo, r.valor_rateado AS total
       FROM rateios r
       JOIN transacoes t ON t.id = r.transacao_id
       JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
       WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa') AND r.imovel_id = ?
     )
     GROUP BY codigo, descricao, grupo
     ORDER BY grupo, codigo`,
    [dataInicio, dataFim, imovelId, dataInicio, dataFim, imovelId],
  );
}

export function resultadoLiquido(linhas: LinhaDre[]): number {
  return linhas.reduce((acc, l) => acc + l.total, 0);
}

/** Série mensal de receita/despesa/resultado, para o gráfico do dashboard. Mesma exclusão
 * de imóveis de uso pessoal do DRE agregado (ver gerarDre). */
export function gerarSerieMensal(db: Database, dataInicio: string, dataFim: string) {
  return consultar<{ mes: string; receita: number; despesa: number }>(
    db,
    `SELECT
       substr(t.data, 1, 7) AS mes,
       SUM(CASE WHEN p.grupo = 'receita' THEN t.valor ELSE 0 END) AS receita,
       SUM(CASE WHEN p.grupo = 'despesa' THEN t.valor ELSE 0 END) AS despesa
     FROM transacoes t
     JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
     LEFT JOIN imoveis i ON i.id = t.imovel_id
     WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa')
       AND (i.uso_pessoal IS NULL OR i.uso_pessoal = 0)
     GROUP BY mes
     ORDER BY mes`,
    [dataInicio, dataFim],
  );
}
