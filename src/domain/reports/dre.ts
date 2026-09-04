import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { LinhaDre } from "../types";

export function gerarDre(db: Database, dataInicio: string, dataFim: string, imovelId?: number): LinhaDre[] {
  // Sem filtro de imóvel: soma direta, cada transação conta uma única vez (rateada ou não).
  // Exclui por padrão imóveis de uso pessoal (residência própria) — não fazem parte da
  // atividade de fato de locação. Uma transação rateada tem t.imovel_id = NULL (ver
  // aplicarRateio em motorRateio.ts) — por isso a exclusão não pode ser feita com um único
  // LEFT JOIN em t.imovel_id (isso deixaria a transação rateada inteira passar direto, mesmo
  // que parte dela tenha ido para um imóvel de uso pessoal): a soma é montada em 3 fontes —
  // (1) transações com imóvel direto não-pessoal, (2) transações sem imóvel e sem rateio
  // algum (ex.: salário), e (3) só a fatia de cada rateio que caiu num imóvel não-pessoal.
  if (imovelId === undefined) {
    return consultar<LinhaDre>(
      db,
      `SELECT codigo, descricao, grupo, SUM(valor) AS total FROM (
         SELECT p.codigo AS codigo, p.descricao AS descricao, p.grupo AS grupo, t.valor AS valor
         FROM transacoes t
         JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
         JOIN imoveis i ON i.id = t.imovel_id
         WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa') AND i.uso_pessoal = 0

         UNION ALL

         SELECT p.codigo AS codigo, p.descricao AS descricao, p.grupo AS grupo, t.valor AS valor
         FROM transacoes t
         JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
         WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa')
           AND t.imovel_id IS NULL AND NOT EXISTS (SELECT 1 FROM rateios r WHERE r.transacao_id = t.id)

         UNION ALL

         SELECT p.codigo AS codigo, p.descricao AS descricao, p.grupo AS grupo, r.valor_rateado AS valor
         FROM rateios r
         JOIN transacoes t ON t.id = r.transacao_id
         JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
         JOIN imoveis i ON i.id = r.imovel_id
         WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa') AND i.uso_pessoal = 0
       )
       GROUP BY codigo, descricao, grupo
       ORDER BY grupo, codigo`,
      [dataInicio, dataFim, dataInicio, dataFim, dataInicio, dataFim],
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
 * de imóveis de uso pessoal do DRE agregado (ver gerarDre, mesmo motivo de não dar para
 * excluir com um LEFT JOIN simples em t.imovel_id quando a transação foi rateada). */
export function gerarSerieMensal(db: Database, dataInicio: string, dataFim: string) {
  return consultar<{ mes: string; receita: number; despesa: number }>(
    db,
    `SELECT mes,
       SUM(CASE WHEN grupo = 'receita' THEN valor ELSE 0 END) AS receita,
       SUM(CASE WHEN grupo = 'despesa' THEN valor ELSE 0 END) AS despesa
     FROM (
       SELECT substr(t.data, 1, 7) AS mes, p.grupo AS grupo, t.valor AS valor
       FROM transacoes t
       JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
       JOIN imoveis i ON i.id = t.imovel_id
       WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa') AND i.uso_pessoal = 0

       UNION ALL

       SELECT substr(t.data, 1, 7) AS mes, p.grupo AS grupo, t.valor AS valor
       FROM transacoes t
       JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
       WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa')
         AND t.imovel_id IS NULL AND NOT EXISTS (SELECT 1 FROM rateios r WHERE r.transacao_id = t.id)

       UNION ALL

       SELECT substr(t.data, 1, 7) AS mes, p.grupo AS grupo, r.valor_rateado AS valor
       FROM rateios r
       JOIN transacoes t ON t.id = r.transacao_id
       JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
       JOIN imoveis i ON i.id = r.imovel_id
       WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa') AND i.uso_pessoal = 0
     )
     GROUP BY mes
     ORDER BY mes`,
    [dataInicio, dataFim, dataInicio, dataFim, dataInicio, dataFim],
  );
}
