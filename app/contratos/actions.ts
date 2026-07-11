'use server';

import { redirect } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { inserirContrato } from './logicaCadastro';

export interface EstadoFormularioContrato {
  erro?: string;
}

export async function criarContrato(
  _estadoAnterior: EstadoFormularioContrato,
  formData: FormData,
): Promise<EstadoFormularioContrato> {
  const resultado = await inserirContrato(obterPool(), {
    imovelId: String(formData.get('imovel_id') ?? ''),
    tipo: String(formData.get('tipo') ?? ''),
    nomeLocatario: String(formData.get('nome_locatario') ?? ''),
    cpfLocatario: String(formData.get('cpf_locatario') ?? '').trim() || null,
    dataInicio: String(formData.get('data_inicio') ?? ''),
    diaVencimento: Number(formData.get('dia_vencimento')),
    valorAluguel: Number(formData.get('valor_aluguel')),
    clausulasAdicionais: String(formData.get('clausulas_adicionais') ?? '').trim() || null,
  });

  if (!resultado.sucesso) {
    return { erro: resultado.erro };
  }

  redirect('/contratos');
}
