'use server';

// Mesmo padrão de app/conciliacao-bancaria/actions.ts: aprovar/rejeitar é
// sempre ação humana explícita. Uma proposta de reajuste (gerada por
// server/integracao/processarRenovacaoContratual.ts, sempre status
// 'proposto') só vira 'aprovado' aqui — e só nesse momento o novo valor é
// copiado para contratos.valor_aluguel. Rejeitar não altera o contrato.
// `aprovado_por` fica null pelo mesmo motivo documentado nos outros
// actions.ts deste projeto: sem sessão de usuário autenticada no
// back-office ainda.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';

export async function aprovarReajuste(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  if (!id || !contratoId) {
    throw new Error('id ou contrato_id ausente');
  }

  const pool = obterPool();
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows } = await client.query<{ valor_novo: string; status: string }>(
      `select valor_novo, status from reajustes_contrato where id = $1 and contrato_id = $2`,
      [id, contratoId],
    );
    const reajuste = rows[0];
    if (!reajuste) {
      throw new Error('Reajuste não encontrado');
    }
    if (reajuste.status !== 'proposto') {
      throw new Error('Este reajuste já foi revisado');
    }

    await client.query(
      `update reajustes_contrato set status = 'aprovado', aprovado_por = $1, data_aprovacao = current_date where id = $2`,
      [null, id],
    );
    await client.query(
      `update contratos
       set valor_aluguel = $1, data_ultimo_reajuste = current_date, atualizado_em = now()
       where id = $2`,
      [reajuste.valor_novo, contratoId],
    );

    await client.query('commit');
  } catch (erro) {
    await client.query('rollback');
    throw erro;
  } finally {
    client.release();
  }

  revalidatePath(`/contratos/${contratoId}/reajustes`);
  revalidatePath(`/contratos/${contratoId}/contrato`);
  revalidatePath('/contratos');
}

export async function rejeitarReajuste(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  if (!id || !contratoId) {
    throw new Error('id ou contrato_id ausente');
  }

  await obterPool().query(
    `update reajustes_contrato set status = 'rejeitado', aprovado_por = $1, data_aprovacao = current_date
     where id = $2 and status = 'proposto'`,
    [null, id],
  );

  revalidatePath(`/contratos/${contratoId}/reajustes`);
}
