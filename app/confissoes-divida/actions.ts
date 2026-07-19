'use server';

// Mesmo padrão de app/quebras-contrato/actions.ts: mudança de status é
// sempre decisão humana explícita, nunca em lote. `pago` é terminal —
// nenhuma transição sai dele; as demais (pendente -> acordado ->
// judicializado, ou pendente -> judicializado direto, ou judicializado ->
// pago após recuperação judicial) são todas decisões legítimas de gestão,
// por isso não há uma máquina de estados mais restritiva aqui.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';

async function atualizarStatus(formData: FormData, novoStatus: 'acordado' | 'pago' | 'judicializado'): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) {
    throw new Error('id da confissão de dívida ausente');
  }

  const { rowCount } = await obterPool().query(
    `update confissoes_divida set status = $1 where id = $2 and status != 'pago'`,
    [novoStatus, id],
  );
  if (!rowCount) {
    throw new Error('Confissão de dívida não encontrada ou já está paga (status final)');
  }

  revalidatePath('/confissoes-divida');
}

export async function marcarAcordado(formData: FormData): Promise<void> {
  await atualizarStatus(formData, 'acordado');
}

export async function marcarPago(formData: FormData): Promise<void> {
  await atualizarStatus(formData, 'pago');
}

export async function marcarJudicializado(formData: FormData): Promise<void> {
  await atualizarStatus(formData, 'judicializado');
}
