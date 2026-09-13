// Lógica de aprovação/rejeição de uma proposta de reajuste, separada da
// action 'use server' (app/contratos/[id]/reajustes/actions.ts) para ser
// testável — mesmo padrão de concluirVistoria.ts. Só ao aprovar o valor é
// copiado para contratos.valor_aluguel; rejeitar não altera o contrato.
//
// Também atualiza `data_proximo_reajuste` (contrato + 1 ano a partir de
// hoje) ao aprovar — campo que existia no schema desde antes desta
// auditoria mas nunca era escrito por nenhum código, o que deixava o motor
// de reajuste anual (server/juridico/reajusteAnual.ts) sem uma âncora
// atualizada depois de cada reajuste aplicado.

import type { Pool } from 'pg';

export interface ResultadoDecisaoReajuste {
  sucesso: boolean;
  erro?: string;
}

export async function aprovarReajuste(pool: Pool, reajusteId: string, contratoId: string): Promise<ResultadoDecisaoReajuste> {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows } = await client.query<{ valor_novo: string; status: string }>(
      `select valor_novo, status from reajustes_contrato where id = $1 and contrato_id = $2`,
      [reajusteId, contratoId],
    );
    const reajuste = rows[0];
    if (!reajuste) {
      await client.query('rollback');
      return { sucesso: false, erro: 'Reajuste não encontrado' };
    }
    if (reajuste.status !== 'proposto') {
      await client.query('rollback');
      return { sucesso: false, erro: 'Este reajuste já foi revisado' };
    }

    await client.query(
      `update reajustes_contrato set status = 'aprovado', aprovado_por = $1, data_aprovacao = current_date where id = $2`,
      [null, reajusteId],
    );
    await client.query(
      `update contratos
       set valor_aluguel = $1, data_ultimo_reajuste = current_date,
           data_proximo_reajuste = current_date + interval '1 year', atualizado_em = now()
       where id = $2`,
      [reajuste.valor_novo, contratoId],
    );

    await client.query('commit');
    return { sucesso: true };
  } catch (erro) {
    await client.query('rollback');
    return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro ao aprovar reajuste' };
  } finally {
    client.release();
  }
}

export async function rejeitarReajuste(pool: Pool, reajusteId: string, contratoId: string): Promise<ResultadoDecisaoReajuste> {
  const { rowCount } = await pool.query(
    `update reajustes_contrato set status = 'rejeitado', aprovado_por = $1, data_aprovacao = current_date
     where id = $2 and contrato_id = $3 and status = 'proposto'`,
    [null, reajusteId, contratoId],
  );
  if (!rowCount) {
    return { sucesso: false, erro: 'Reajuste não encontrado ou já revisado' };
  }
  return { sucesso: true };
}
