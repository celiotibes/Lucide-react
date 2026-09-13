'use server';

// `criterios` é texto livre — o sistema nunca calcula um valor de mercado
// sozinho (Art. 19 não é fórmula, ver comentário em reequilibrios_contratuais
// no schema). Esta ação só registra o que o operador decidiu usar como
// critério, para que a notificação oficial (30 dias) saia com informação
// real em vez de genérica.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';

export async function definirCriteriosReequilibrio(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  const criterios = String(formData.get('criterios') ?? '').trim();
  const valorPropostoRaw = String(formData.get('valor_proposto') ?? '').trim();

  if (!id || !contratoId) {
    throw new Error('id ou contrato_id ausente');
  }
  if (!criterios) {
    throw new Error('Descreva os critérios de mercado usados');
  }

  const valorProposto = valorPropostoRaw ? Number(valorPropostoRaw) : null;
  if (valorPropostoRaw && (Number.isNaN(valorProposto) || valorProposto! <= 0)) {
    throw new Error('Valor proposto inválido');
  }

  await obterPool().query(
    `update reequilibrios_contratuais
     set status = 'criterios_definidos', criterios = $1, valor_proposto = $2,
         definido_por = $3, definido_em = now()
     where id = $4`,
    [criterios, valorProposto, null, id],
  );

  revalidatePath(`/contratos/${contratoId}/reequilibrio`);
}

export async function descartarReequilibrio(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  if (!id || !contratoId) {
    throw new Error('id ou contrato_id ausente');
  }

  await obterPool().query(`update reequilibrios_contratuais set status = 'descartado' where id = $1`, [id]);

  revalidatePath(`/contratos/${contratoId}/reequilibrio`);
}
