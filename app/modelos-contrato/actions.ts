'use server';

import { redirect } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { inserirModeloContrato } from './logicaCadastro';

export interface EstadoFormularioModeloContrato {
  erro?: string;
}

export async function criarModeloContrato(
  _estadoAnterior: EstadoFormularioModeloContrato,
  formData: FormData,
): Promise<EstadoFormularioModeloContrato> {
  const resultado = await inserirModeloContrato(obterPool(), {
    cidadeId: String(formData.get('cidade_id') ?? ''),
    nome: String(formData.get('nome') ?? ''),
    corpoHtml: String(formData.get('corpo_html') ?? ''),
  });

  if (!resultado.sucesso) {
    return { erro: resultado.erro };
  }

  redirect('/modelos-contrato');
}
