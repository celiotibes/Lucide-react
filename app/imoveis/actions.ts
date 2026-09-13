'use server';

import { redirect } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { inserirImovel } from './logicaCadastro';

export interface EstadoFormularioImovel {
  erro?: string;
}

export async function criarImovel(
  _estadoAnterior: EstadoFormularioImovel,
  formData: FormData,
): Promise<EstadoFormularioImovel> {
  const valorAvaliacaoTexto = String(formData.get('valor_avaliacao') ?? '').trim();

  const resultado = await inserirImovel(obterPool(), {
    identificacao: String(formData.get('identificacao') ?? ''),
    tipo: String(formData.get('tipo') ?? ''),
    cidadeId: String(formData.get('cidade_id') ?? ''),
    residencialId: String(formData.get('residencial_id') ?? '').trim() || null,
    endereco: String(formData.get('endereco') ?? '').trim() || null,
    permiteColiving: formData.get('permite_coliving') === 'on',
    valorAvaliacao: valorAvaliacaoTexto ? Number(valorAvaliacaoTexto) : null,
  });

  if (!resultado.sucesso) {
    return { erro: resultado.erro };
  }

  redirect('/imoveis');
}
