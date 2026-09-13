'use server';

// Fecha o loop do importador OFX (docs/18): toda transação chega como
// 'sugerido', nunca 'aprovado' automaticamente — aprovar/ignorar é sempre
// uma ação humana explícita nesta tela, nunca em lote sem revisão (regra
// já documentada no schema desde a auditoria original, item 8).
//
// `aprovado_por` fica null: não há sessão de usuário autenticado ainda
// (nenhuma tela do sistema tem login real, docs/14/docs/16) — melhor
// deixar em branco do que inventar um autor que a ação não teve.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';

export async function aprovarTransacao(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const categoriaFinalId = String(formData.get('categoria_final_id') ?? '').trim() || null;

  if (!id) {
    throw new Error('id da transação ausente');
  }

  await obterPool().query(
    `update transacoes_bancarias set status = 'aprovado', aprovado_em = now(), categoria_final = $1 where id = $2`,
    [categoriaFinalId, id],
  );

  revalidatePath('/conciliacao-bancaria');
}

export async function ignorarTransacao(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) {
    throw new Error('id da transação ausente');
  }

  await obterPool().query(`update transacoes_bancarias set status = 'ignorado' where id = $1`, [id]);

  revalidatePath('/conciliacao-bancaria');
}
