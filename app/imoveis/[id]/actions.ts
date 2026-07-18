'use server';

// Fecha a lacuna registrada em docs/32 e docs/00: `comodos` (co-living
// por quarto) já era lido por server/integracao/gerarContratoHtml.ts,
// mas não havia nenhuma tela para cadastrar um cômodo — só era possível
// gravar direto no banco. Não é decisão de negócio pendente, é só a tela
// que faltava escrever (schema e motor de contrato já suportam).

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';

export interface EstadoFormularioComodo {
  erro?: string;
}

export async function criarComodo(
  _estadoAnterior: EstadoFormularioComodo,
  formData: FormData,
): Promise<EstadoFormularioComodo> {
  const imovelId = String(formData.get('imovel_id') ?? '');
  const identificacao = String(formData.get('identificacao') ?? '').trim();
  if (!imovelId || !identificacao) {
    return { erro: 'Informe a identificação do cômodo.' };
  }

  const areaTexto = String(formData.get('area_m2') ?? '').trim();
  const valorTexto = String(formData.get('valor_aluguel_referencia') ?? '').trim();

  try {
    await obterPool().query(
      `insert into comodos (imovel_id, identificacao, area_m2, valor_aluguel_referencia) values ($1, $2, $3, $4)`,
      [imovelId, identificacao, areaTexto ? Number(areaTexto) : null, valorTexto ? Number(valorTexto) : null],
    );
  } catch (e) {
    return { erro: `Não foi possível salvar: ${e instanceof Error ? e.message : 'erro desconhecido'}` };
  }

  revalidatePath(`/imoveis/${imovelId}`);
  return {};
}

export async function desativarComodo(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const imovelId = String(formData.get('imovel_id') ?? '');
  if (!id) throw new Error('id do cômodo ausente');

  await obterPool().query(`update comodos set ativo = false where id = $1`, [id]);
  revalidatePath(`/imoveis/${imovelId}`);
}
