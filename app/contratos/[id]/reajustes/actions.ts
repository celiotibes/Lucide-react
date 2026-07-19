'use server';

// Mesmo padrão de app/conciliacao-bancaria/actions.ts: aprovar/rejeitar é
// sempre uma ação humana explícita. A lógica de decisão vive em
// server/integracao/decidirReajuste.ts (testável) — esta action só valida
// o formulário e delega.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';
import { aprovarReajuste as aprovarReajusteLogica, rejeitarReajuste as rejeitarReajusteLogica } from '@/server/integracao/decidirReajuste';

export async function aprovarReajuste(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  if (!id || !contratoId) {
    throw new Error('id ou contrato_id ausente');
  }

  const resultado = await aprovarReajusteLogica(obterPool(), id, contratoId);
  if (!resultado.sucesso) {
    throw new Error(resultado.erro);
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

  const resultado = await rejeitarReajusteLogica(obterPool(), id, contratoId);
  if (!resultado.sucesso) {
    throw new Error(resultado.erro);
  }

  revalidatePath(`/contratos/${contratoId}/reajustes`);
}
