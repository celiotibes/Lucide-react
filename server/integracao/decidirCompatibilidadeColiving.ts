// Decisão humana sobre uma comparação de compatibilidade de coliving —
// separada da action 'use server' para ser testável, mesmo padrão de
// decidirReajuste.ts/decidirExtracao.ts. O score e os pontos de atrito são
// sempre insumo; aprovar/reprovar/marcar entrevista é sempre uma escolha
// explícita da gestão, nunca decidida pela faixa do score sozinha.

import type { Pool } from 'pg';

export type DecisaoCompatibilidade = 'aprovado' | 'reprovado' | 'entrevista_requerida';

export interface ResultadoDecisaoCompatibilidade {
  sucesso: boolean;
  erro?: string;
}

export async function decidirCompatibilidadeColiving(
  pool: Pool,
  compatibilidadeId: string,
  decisao: DecisaoCompatibilidade,
  parecer: string,
): Promise<ResultadoDecisaoCompatibilidade> {
  if (!parecer.trim()) {
    return { sucesso: false, erro: 'Parecer é obrigatório para registrar a decisão' };
  }

  const { rowCount } = await pool.query(
    `update compatibilidades_coliving
     set status = $1, parecer = $2, decidido_por = $3, decidido_em = now()
     where id = $4 and status = 'calculado'`,
    [decisao, parecer, null, compatibilidadeId],
  );
  if (!rowCount) {
    return { sucesso: false, erro: 'Comparação não encontrada ou já revisada' };
  }
  return { sucesso: true };
}
