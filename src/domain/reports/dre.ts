import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { LinhaDre } from "../types";

export function gerarDre(db: Database, dataInicio: string, dataFim: string, imovelId?: number): LinhaDre[] {
  const filtroImovel = imovelId !== undefined ? "AND t.imovel_id = ?" : "";
  const parametros: (string | number)[] = [dataInicio, dataFim];
  if (imovelId !== undefined) parametros.push(imovelId);

  return consultar<LinhaDre>(
    db,
    `SELECT p.codigo, p.descricao, p.grupo, SUM(t.valor) AS total
     FROM transacoes t
     JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
     WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa') ${filtroImovel}
     GROUP BY p.codigo, p.descricao, p.grupo
     ORDER BY p.grupo, p.codigo`,
    parametros,
  );
}

export function resultadoLiquido(linhas: LinhaDre[]): number {
  return linhas.reduce((acc, l) => acc + l.total, 0);
}

/** Série mensal de receita/despesa/resultado, para o gráfico do dashboard. */
export function gerarSerieMensal(db: Database, dataInicio: string, dataFim: string) {
  return consultar<{ mes: string; receita: number; despesa: number }>(
    db,
    `SELECT
       substr(t.data, 1, 7) AS mes,
       SUM(CASE WHEN p.grupo = 'receita' THEN t.valor ELSE 0 END) AS receita,
       SUM(CASE WHEN p.grupo = 'despesa' THEN t.valor ELSE 0 END) AS despesa
     FROM transacoes t
     JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
     WHERE t.data BETWEEN ? AND ? AND p.grupo IN ('receita', 'despesa')
     GROUP BY mes
     ORDER BY mes`,
    [dataInicio, dataFim],
  );
}
