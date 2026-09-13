'use server';

// Fecha a lacuna que a revisão de ponta a ponta (docs/31) deixou em
// aberto: a tela de detalhe da OS mostrava a linha do tempo mas não
// tinha como registrar um novo andamento — só existia a função
// server/integracao/andamentosOS.ts, testada, sem UI nenhuma.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';
import { registrarAndamentoOS, type TipoAndamento } from '@/server/integracao/andamentosOS';

export interface EstadoFormularioAndamento {
  erro?: string;
}

const TIPOS: TipoAndamento[] = [
  'atribuida',
  'a_caminho',
  'iniciada',
  'pausada',
  'material_pendente',
  'retomada',
  'concluida',
  'cancelada',
  'comentario',
];

export async function criarAndamento(
  _estadoAnterior: EstadoFormularioAndamento,
  formData: FormData,
): Promise<EstadoFormularioAndamento> {
  const ordemServicoId = String(formData.get('ordem_servico_id') ?? '');
  const tipo = String(formData.get('tipo') ?? '');
  if (!ordemServicoId || !TIPOS.includes(tipo as TipoAndamento)) {
    return { erro: 'Selecione o tipo de andamento.' };
  }

  const prestadorId = String(formData.get('prestador_id') ?? '').trim();

  try {
    await registrarAndamentoOS(obterPool(), {
      ordemServicoId,
      tipo: tipo as TipoAndamento,
      descricao: String(formData.get('descricao') ?? '').trim() || undefined,
      prestadorPessoaId: prestadorId ? prestadorId : undefined,
    });
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : 'Não foi possível registrar o andamento.' };
  }

  revalidatePath(`/ordens-servico/${ordemServicoId}`);
  return {};
}
