'use server';

// Decisão da gestão sobre uma comparação de compatibilidade — sempre
// explícita, sempre com parecer (mesmo padrão de app/quebras-contrato e
// app/confissoes-divida). A lógica vive em
// server/integracao/decidirCompatibilidadeColiving.ts.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';
import { decidirCompatibilidadeColiving, type DecisaoCompatibilidade } from '@/server/integracao/decidirCompatibilidadeColiving';

async function decidir(formData: FormData, decisao: DecisaoCompatibilidade): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const parecer = String(formData.get('parecer') ?? '');
  if (!id) {
    throw new Error('id da comparação ausente');
  }

  const resultado = await decidirCompatibilidadeColiving(obterPool(), id, decisao, parecer);
  if (!resultado.sucesso) {
    throw new Error(resultado.erro);
  }

  revalidatePath('/coliving');
}

export async function aprovarCompatibilidade(formData: FormData): Promise<void> {
  await decidir(formData, 'aprovado');
}

export async function reprovarCompatibilidade(formData: FormData): Promise<void> {
  await decidir(formData, 'reprovado');
}

export async function marcarEntrevistaRequerida(formData: FormData): Promise<void> {
  await decidir(formData, 'entrevista_requerida');
}
