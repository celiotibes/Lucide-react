'use server';

import { createClient } from '@/lib/supabase/server';
import { processarComprovanteOCR, validarComprovante } from '@/server/ocr/processarComprovante';
import { auditLogger } from '@/server/compliance/auditLogger';

export interface RegistroDespesaInput {
  contratoId: string;
  imagemUrl: string;
  tipo: 'combustivel' | 'alimentacao' | 'manutencao' | 'outro';
  valor?: number;
  data?: string;
  descricao?: string;
  placaVeiculo?: string;
}

/**
 * Registrar despesa com processamento OCR automático
 * Extrai dados do comprovante via OCR antes de salvar
 */
export async function registrarDespesaComOCR(input: RegistroDespesaInput) {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { erro: 'Não autenticado', sucesso: false };
    }

    // Buscar contrato
    const { data: contrato, error: erroContrato } = await supabase
      .from('contratos_prestador')
      .select('id, prestador_id')
      .eq('id', input.contratoId)
      .single();

    if (erroContrato || !contrato) {
      return { erro: 'Contrato não encontrado', sucesso: false };
    }

    // Processar OCR
    const dadosOCR = await processarComprovanteOCR(input.imagemUrl);

    // Validar extração
    const validacao = validarComprovante(dadosOCR);
    if (!validacao.valido && input.valor === undefined) {
      return {
        erro: `Erro na extração OCR: ${validacao.erros.join(', ')}`,
        sucesso: false,
      };
    }

    // Mesclar dados OCR com input do usuário
    const valorFinal = input.valor || dadosOCR.valor;
    const dataFinal = input.data || dadosOCR.data;
    const descricaoFinal = input.descricao || dadosOCR.descricao || `Comprovante de ${dadosOCR.tipo}`;

    // Salvar despesa
    const { data: despesa, error: erroDespesa } = await supabase
      .from('adiantamentos_prestador')
      .insert({
        contrato_id: input.contratoId,
        data_lancamento: dataFinal || new Date().toISOString().split('T')[0],
        tipo: 'gasto_ressarcimento',
        descricao: descricaoFinal,
        valor_total: valorFinal || 0,
        comprovante_url: input.imagemUrl,
        status: 'ativo',
        observacoes: `Extração OCR (confiança: ${dadosOCR.confianca_extracao}%) - Campos: ${dadosOCR.campos_reconhecidos.join(', ')}`,
      })
      .select();

    if (erroDespesa) throw erroDespesa;

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'registrar_despesa_ocr',
      tabela: 'adiantamentos_prestador',
      registro_id: despesa && despesa.length > 0 ? despesa[0].id : '',
      valores_depois: {
        tipo: input.tipo,
        valor: valorFinal,
        data: dataFinal,
        ocr_confianca: dadosOCR.confianca_extracao,
      },
      endpoint: '/api/prestador/despesa-ocr',
    });

    return {
      sucesso: true,
      mensagem: 'Despesa registrada com sucesso',
      despesaId: despesa && despesa.length > 0 ? despesa[0].id : null,
      dadosExtraidos: {
        valor: valorFinal,
        data: dataFinal,
        confianca: dadosOCR.confianca_extracao,
        campos: dadosOCR.campos_reconhecidos,
      },
    };
  } catch (erro) {
    console.error('Erro ao registrar despesa com OCR:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Reprocessar comprovante OCR (se resultado anterior foi insatisfatório)
 */
export async function reprocessarComprovanteOCR(despesaId: string) {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    // Buscar despesa
    const { data: despesa, error: erroDespesa } = await supabase
      .from('adiantamentos_prestador')
      .select('*')
      .eq('id', despesaId)
      .single();

    if (erroDespesa || !despesa || !despesa.comprovante_url) {
      return { erro: 'Despesa ou comprovante não encontrado', sucesso: false };
    }

    // Reprocessar OCR
    const dadosOCR = await processarComprovanteOCR(despesa.comprovante_url);

    // Atualizar
    const { error: erroUpdate } = await supabase
      .from('adiantamentos_prestador')
      .update({
        valor_total: dadosOCR.valor || despesa.valor_total,
        observacoes: `Reprocessado OCR (confiança: ${dadosOCR.confianca_extracao}%) - Campos: ${dadosOCR.campos_reconhecidos.join(', ')}`,
      })
      .eq('id', despesaId);

    if (erroUpdate) throw erroUpdate;

    return {
      sucesso: true,
      mensagem: 'Comprovante reprocessado com sucesso',
      dadosExtraidos: {
        valor: dadosOCR.valor,
        confianca: dadosOCR.confianca_extracao,
        campos: dadosOCR.campos_reconhecidos,
      },
    };
  } catch (erro) {
    console.error('Erro ao reprocessar OCR:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}
