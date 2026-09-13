'use server';

// Mesmo padrão de app/contratos/[id]/reajustes/actions.ts: aprovar/rejeitar é
// sempre uma ação humana explícita (nunca em lote, nunca automático) — a
// extração da IA fica em 'pendente_revisao' até o operador decidir aqui.
// A lógica de decisão vive em server/integracao/decidirExtracao.ts
// (testável) — esta action só valida o formulário e delega.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';
import { perguntarSobreDocumento } from '@/server/documentos/perguntarDocumento';
import { aprovarExtracao as aprovarExtracaoLogica, rejeitarExtracao as rejeitarExtracaoLogica } from '@/server/integracao/decidirExtracao';

// Fase 7: pergunta livre sobre o documento — síncrona (o operador espera a
// resposta na tela), independente do status da extração estruturada acima.
export async function perguntarSobreDocumentoAction(formData: FormData): Promise<void> {
  const documentoId = String(formData.get('documento_id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  const pergunta = String(formData.get('pergunta') ?? '');
  if (!documentoId || !contratoId) {
    throw new Error('documento_id ou contrato_id ausente');
  }

  const resultado = await perguntarSobreDocumento(obterPool(), documentoId, pergunta);
  if (!resultado.sucesso) {
    throw new Error(resultado.erro ?? 'Falha ao perguntar à IA');
  }

  revalidatePath(`/contratos/${contratoId}/documentos/${documentoId}/revisao`);
}

export async function rejeitarExtracao(formData: FormData): Promise<void> {
  const extracaoId = String(formData.get('extracao_id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  if (!extracaoId || !contratoId) {
    throw new Error('extracao_id ou contrato_id ausente');
  }

  const resultado = await rejeitarExtracaoLogica(obterPool(), extracaoId);
  if (!resultado.sucesso) {
    throw new Error(resultado.erro);
  }

  revalidatePath(`/contratos/${contratoId}/documentos`);
}

export async function aprovarExtracao(formData: FormData): Promise<void> {
  const extracaoId = String(formData.get('extracao_id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  if (!extracaoId || !contratoId) {
    throw new Error('extracao_id ou contrato_id ausente');
  }

  const resultado = await aprovarExtracaoLogica(obterPool(), extracaoId, contratoId, formData);
  if (!resultado.sucesso) {
    throw new Error(resultado.erro);
  }

  revalidatePath(`/contratos/${contratoId}/documentos`);
  revalidatePath(`/contratos/${contratoId}/contrato`);
}
