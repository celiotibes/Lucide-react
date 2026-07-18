'use server';

// Fecha o pedido do cliente ao revisar a cobertura do portfólio de
// Curitiba (docs/33): financiamento/hipoteca por imóvel, alimentando o
// patrimônio líquido mensal e a despesa fixa recorrente do negócio.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';
import { registrarFinanciamentoImovel, marcarFinanciamentoQuitado } from '@/server/integracao/patrimonioImoveis';

export interface EstadoFormularioFinanciamento {
  erro?: string;
}

export async function criarFinanciamento(
  _estadoAnterior: EstadoFormularioFinanciamento,
  formData: FormData,
): Promise<EstadoFormularioFinanciamento> {
  const tipo = String(formData.get('tipo') ?? '');
  if (tipo !== 'financiamento_bancario' && tipo !== 'consorcio_hipoteca') {
    return { erro: 'Selecione o tipo de financiamento.' };
  }

  const resultado = await registrarFinanciamentoImovel(obterPool(), {
    imovelId: String(formData.get('imovel_id') ?? ''),
    tipo,
    instituicao: String(formData.get('instituicao') ?? '').trim() || null,
    valorFinanciado: Number(formData.get('valor_financiado') ?? '') || null,
    valorParcela: Number(formData.get('valor_parcela')),
    saldoDevedor: Number(formData.get('saldo_devedor') ?? '') || null,
    dataInicio: String(formData.get('data_inicio') ?? '').trim() || null,
    numeroParcelas: Number(formData.get('numero_parcelas') ?? '') || null,
    observacao: String(formData.get('observacao') ?? '').trim() || null,
  });

  if (!resultado.sucesso) {
    return { erro: resultado.erro };
  }

  revalidatePath('/patrimonio');
  return {};
}

export async function quitarFinanciamento(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('id do financiamento ausente');
  await marcarFinanciamentoQuitado(obterPool(), id);
  revalidatePath('/patrimonio');
}

export interface EstadoFormularioAvaliacao {
  erro?: string;
}

export async function atualizarValorAvaliacao(
  _estadoAnterior: EstadoFormularioAvaliacao,
  formData: FormData,
): Promise<EstadoFormularioAvaliacao> {
  const imovelId = String(formData.get('imovel_id') ?? '');
  const valorTexto = String(formData.get('valor_avaliacao') ?? '').trim();
  if (!imovelId) {
    return { erro: 'Imóvel ausente.' };
  }
  const valor = valorTexto ? Number(valorTexto) : null;
  if (valor !== null && !(valor >= 0)) {
    return { erro: 'Valor de avaliação deve ser zero ou positivo.' };
  }

  await obterPool().query(`update imoveis set valor_avaliacao = $1, atualizado_em = now() where id = $2`, [valor, imovelId]);

  revalidatePath('/patrimonio');
  return {};
}
