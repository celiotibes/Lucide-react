'use server';

import { createClient } from '@/lib/supabase/server';
import { AsaasClient } from '@/server/asaas/client';
import { Notificador } from '@/server/notificacao/Notificador';

/**
 * Gera uma NFS-e quando o fechamento é marcado como pago
 * Triggerada automaticamente via cron
 */
export async function gerarNfsePorFechamento(fechamentoId: string) {
  const supabase = await createClient();

  // Buscar fechamento
  const { data: fechamento, error: fechamentoError } = await supabase
    .from('fechamentos_prestador')
    .select(
      `
      id, status, total_proventos, data_inicio, data_fim, nfse_id,
      prestadores_servico (
        nome_completo, cpf_cnpj,
        pessoas (email, telefone)
      )
    `
    )
    .eq('id', fechamentoId)
    .single();

  if (fechamentoError || !fechamento) {
    return {
      erro: 'Fechamento não encontrado',
      sucesso: false,
    };
  }

  // Validar que fechamento está pago
  if (fechamento.status !== 'pago') {
    return {
      erro: `Apenas fechamentos pagos podem gerar NFS-e (status atual: ${fechamento.status})`,
      sucesso: false,
    };
  }

  // Validar que já não tem NFS-e
  if (fechamento.nfse_id) {
    return {
      erro: 'Este fechamento já possui uma NFS-e',
      sucesso: false,
    };
  }

  const prestador = fechamento.prestadores_servico as any;
  if (!prestador) {
    return {
      erro: 'Prestador não encontrado',
      sucesso: false,
    };
  }

  try {
    // Inicializar Asaas
    const asaas = new AsaasClient({
      apiKey: process.env.ASAAS_API_KEY || '',
    });

    // Descrever período
    const dataInicio = new Date(fechamento.data_inicio);
    const dataFim = new Date(fechamento.data_fim);
    const mesAno = dataInicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    // Gerar NFS-e
    const nfse = await asaas.criarNfse({
      prestador: {
        nome: prestador.nome_completo,
        cpfCnpj: prestador.cpf_cnpj,
        email: prestador.pessoas?.email || '',
        telefone: prestador.pessoas?.telefone,
      },
      servico: {
        descricao: `Serviços prestados em ${mesAno}`,
        valor: fechamento.total_proventos,
        dataExecucao: dataFim.toISOString().split('T')[0], // 'YYYY-MM-DD', último dia do período
        residencial: 'Conforme contrato',
      },
      referenciaExterna: fechamentoId,
    });

    // Atualizar fechamento com dados da NFS-e
    const { error: updateError } = await supabase
      .from('fechamentos_prestador')
      .update({
        nfse_id: nfse.nfseId,
        nfse_url: nfse.url,
        nfse_protocolo: nfse.protocolo,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', fechamentoId);

    if (updateError) {
      throw updateError;
    }

    // Notificar prestador
    const notificador = new Notificador();
    await notificador.enviar({
      canais: ['email'],
      destinatario: {
        email: prestador.pessoas?.email || '',
        nome: prestador.nome_completo,
      },
      template: {
        titulo: 'NFS-e Gerada com Sucesso',
        corpo: `Sua NFS-e referente a ${mesAno} foi gerada com sucesso.\nValor: R$ {{valor}}\nProtocolo: {{protocolo}}`,
        acaoUrl: nfse.url,
        acaoTexto: 'Ver NFS-e',
      },
      variaveis: {
        valor: fechamento.total_proventos.toFixed(2),
        protocolo: nfse.protocolo || 'Aguardando',
        mes: mesAno,
      },
    });

    return {
      sucesso: true,
      nfseId: nfse.nfseId,
      url: nfse.url,
      protocolo: nfse.protocolo,
    };
  } catch (erro) {
    console.error('Erro ao gerar NFS-e:', erro);

    // Notificar admin sobre erro
    const notificador = new Notificador();
    await notificador.enviar({
      canais: ['email'],
      destinatario: {
        email: process.env.ADMIN_EMAIL || 'admin@crmt.dev',
        nome: 'Administrador',
      },
      template: {
        titulo: 'Erro ao Gerar NFS-e',
        corpo: `Falha ao gerar NFS-e para fechamento {{fechamento_id}}.\nErro: {{erro}}`,
      },
      variaveis: {
        fechamento_id: fechamentoId,
        erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      },
    });

    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Cancelar uma NFS-e (se necessário)
 */
export async function cancelarNfse(fechamentoId: string, motivo: string) {
  const supabase = await createClient();

  // Validar admin
  const { data: user, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { erro: 'Não autenticado', sucesso: false };
  }

  const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
  if (!isAdmin) {
    return { erro: 'Sem permissão', sucesso: false };
  }

  // Buscar fechamento
  const { data: fechamento, error: fechamentoError } = await supabase
    .from('fechamentos_prestador')
    .select('id, nfse_id, nfse_status')
    .eq('id', fechamentoId)
    .single();

  if (fechamentoError || !fechamento?.nfse_id) {
    return {
      erro: 'Fechamento ou NFS-e não encontrado',
      sucesso: false,
    };
  }

  try {
    const asaas = new AsaasClient({
      apiKey: process.env.ASAAS_API_KEY || '',
    });

    // Chamar API para cancelar (quando disponível)
    // Por enquanto, apenas marcar localmente
    await supabase
      .from('fechamentos_prestador')
      .update({
        nfse_status: 'cancelada',
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', fechamentoId);

    return { sucesso: true, mensagem: 'NFS-e cancelada' };
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}
