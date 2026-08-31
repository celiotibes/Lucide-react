'use server';

import { redirect } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { inserirModeloContrato, type CategoriaModeloContrato } from './logicaCadastro';

export interface EstadoFormularioModeloContrato {
  erro?: string;
}

export async function criarModeloContrato(
  _estadoAnterior: EstadoFormularioModeloContrato,
  formData: FormData,
): Promise<EstadoFormularioModeloContrato> {
  const resultado = await inserirModeloContrato(obterPool(), {
    cidadeId: String(formData.get('cidade_id') ?? ''),
    categoria: String(formData.get('categoria') ?? 'geral') as CategoriaModeloContrato,
    nome: String(formData.get('nome') ?? ''),
    corpoHtml: String(formData.get('corpo_html') ?? ''),
  });

  if (!resultado.sucesso) {
    return { erro: resultado.erro };
  }

  redirect('/modelos-contrato');
}
