'use server';

// Conteúdo de gestão, não código: o índice padrão e os percentuais de
// IPCA/IGPM/INPC ficam em tabela editável pelo admin (configuracoes_sistema,
// indices_economicos) em vez de hardcoded — ver comentário no schema, seção
// 39. Não há integração com IBGE/FGV; o admin cadastra o percentual
// acumulado em 12 meses manualmente todo mês.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';

export async function atualizarIndicePadrao(formData: FormData): Promise<void> {
  const valor = String(formData.get('indice_reajuste_padrao') ?? '');
  if (!['IPCA', 'IGPM'].includes(valor)) {
    throw new Error('Índice inválido');
  }

  await obterPool().query(
    `update configuracoes_sistema set valor = $1, atualizado_em = now() where chave = 'indice_reajuste_padrao'`,
    [valor],
  );

  revalidatePath('/configuracoes');
}

export async function cadastrarIndiceEconomico(formData: FormData): Promise<void> {
  const indice = String(formData.get('indice') ?? '');
  const competencia = String(formData.get('competencia') ?? '');
  const percentualRaw = String(formData.get('percentual_acumulado_12m') ?? '');

  if (!['IGPM', 'IPCA', 'INPC'].includes(indice)) {
    throw new Error('Índice inválido');
  }
  if (!competencia) {
    throw new Error('Competência é obrigatória');
  }
  const percentual = Number(percentualRaw);
  if (Number.isNaN(percentual)) {
    throw new Error('Percentual inválido');
  }

  await obterPool().query(
    `insert into indices_economicos (indice, competencia, percentual_acumulado_12m)
     values ($1, $2, $3)
     on conflict (indice, competencia) do update set percentual_acumulado_12m = excluded.percentual_acumulado_12m`,
    [indice, `${competencia}-01`, percentual / 100],
  );

  revalidatePath('/configuracoes');
}
