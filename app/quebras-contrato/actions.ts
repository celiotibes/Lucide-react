'use server';

// Aprovar/rejeitar uma solicitação de quebra de contrato é sempre decisão
// humana da gestão — o valor calculado (quando existe, docs/29) é insumo,
// nunca aprovação automática. `parecer_gestao` é obrigatório para as duas
// ações (constraint do próprio banco, `chk_quebra_parecer_quando_decidido`)
// — não dá para aprovar/rejeitar sem registrar o porquê.
//
// `analisado_por` fica null: mesma situação de toda tela do sistema, sem
// sessão de usuário autenticado ainda (docs/14/16).

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';

async function decidir(formData: FormData, status: 'aprovada' | 'rejeitada'): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const parecer = String(formData.get('parecer_gestao') ?? '').trim();

  if (!id) {
    throw new Error('id da solicitação ausente');
  }
  if (!parecer) {
    throw new Error('Parecer da gestão é obrigatório para aprovar ou rejeitar');
  }

  await obterPool().query(
    `update solicitacoes_quebra_contrato set status = $1, parecer_gestao = $2, analisado_em = now() where id = $3`,
    [status, parecer, id],
  );

  revalidatePath('/quebras-contrato');
}

export async function aprovarQuebra(formData: FormData): Promise<void> {
  await decidir(formData, 'aprovada');
}

export async function rejeitarQuebra(formData: FormData): Promise<void> {
  await decidir(formData, 'rejeitada');
}
