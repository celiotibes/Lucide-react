'use server';

import { createClient } from '@/lib/supabase/server';
import { AsaasClient } from '@/server/asaas/client';
import { Notificador } from '@/server/notificacao/Notificador';

/**
 * Envia PIX quando o fechamento é aprovado
 * Triggerada automaticamente via cron
 */
export async function enviarPixPorFechamento(fechamentoId: string) {
  const supabase = await createClient();

  // Buscar fechamento
  const { data: fechamento, error: fechamentoError } = await supabase
    .from('fechamentos_prestador')
    .select(
      `
      id, status, valor_liquido, pix_id, pix_status,
      prestadores_servico (
        id, nome_completo, cpf_cnpj, chave_pix,
        pessoas (email, telefone, nome)
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

  // Validar que fechamento está aprovado
  if (fechamento.status !== 'aprovado') {
    return {
      erro: `Apenas fechamentos aprovados podem receber PIX (status atual: ${fechamento.status})`,
      sucesso: false,
    };
  }

  // Validar que já não tem PIX enviado
  if (fechamento.pix_id && fechamento.pix_status !== 'devolvido' && fechamento.pix_status !== 'expirado') {
    return {
      erro: 'Este fechamento já possui um PIX enviado',
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

  // Validar que tem chave PIX
  if (!prestador.chave_pix) {
    return {
      erro: 'Prestador não tem chave PIX cadastrada. Favor atualizar perfil.',
      sucesso: false,
    };
  }

  try {
    // Inicializar Asaas
    const asaas = new AsaasClient({
      apiKey: process.env.ASAAS_API_KEY || '',
    });

    // Validar chave PIX
    const [tipo, valor] = prestador.chave_pix.split(':');
    const tiposValidos = ['cpf', 'email', 'telefone', 'aleatoria'];

    if (!tiposValidos.includes(tipo)) {
      return {
        erro: `Formato de chave PIX inválido: ${prestador.chave_pix}`,
        sucesso: false,
      };
    }

    // Enviar PIX
    const pix = await asaas.enviarPix({
      prestador: {
        nome: prestador.nome_completo,
        cpfCnpj: prestador.cpf_cnpj,
      },
      chavePix: {
        tipo: tipo as 'cpf' | 'email' | 'telefone' | 'aleatoria',
        valor,
      },
      valor: fechamento.valor_liquido,
      descricao: `Fechamento de serviços prestados`,
      referenciaExterna: fechamentoId,
    });

    // Atualizar fechamento com dados do PIX
    const { error: updateError } = await supabase
      .from('fechamentos_prestador')
      .update({
        pix_id: pix.id,
        pix_status: 'enviado',
        pix_enviado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', fechamentoId);

    if (updateError) {
      throw updateError;
    }

    // Notificar prestador
    const notificador = new Notificador();
    const canais: Array<'email' | 'whatsapp' | 'sms'> = ['email'];
    if (prestador.pessoas?.telefone) {
      canais.push('whatsapp');
    }

    await notificador.enviar({
      canais: canais as Array<'email' | 'whatsapp' | 'sms'>,
      destinatario: {
        email: prestador.pessoas?.email || '',
        telefone: prestador.pessoas?.telefone,
        nome: prestador.nome_completo,
      },
      template: {
        titulo: 'PIX Enviado com Sucesso!',
        corpo: `Enviamos PIX de R$ {{valor}} para sua chave registrada.\n\nAguarde a confirmação (geralmente em segundos).`,
      },
      variaveis: {
        valor: fechamento.valor_liquido.toFixed(2),
        prestador: prestador.nome_completo,
      },
    });

    return {
      sucesso: true,
      pixId: pix.id,
      valor: fechamento.valor_liquido,
    };
  } catch (erro) {
    console.error('Erro ao enviar PIX:', erro);

    // Notificar admin sobre erro
    const notificador = new Notificador();
    await notificador.enviar({
      canais: ['email'],
      destinatario: {
        email: process.env.ADMIN_EMAIL || 'admin@crmt.dev',
        nome: 'Administrador',
      },
      template: {
        titulo: 'Erro ao Enviar PIX',
        corpo: `Falha ao enviar PIX para fechamento {{fechamento_id}}.\nPrestador: {{prestador}}\nErro: {{erro}}`,
      },
      variaveis: {
        fechamento_id: fechamentoId,
        prestador: prestador.nome_completo,
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
 * Rastreia confirmação de PIX (chamado pelo cron)
 */
export async function rastrearConfirmacaoPix(fechamentoId: string) {
  const supabase = await createClient();

  // Buscar fechamento
  const { data: fechamento, error: fechamentoError } = await supabase
    .from('fechamentos_prestador')
    .select(
      `
      id, pix_id, pix_status,
      prestadores_servico (
        nome_completo,
        pessoas (email, telefone)
      )
    `
    )
    .eq('id', fechamentoId)
    .single();

  if (fechamentoError || !fechamento?.pix_id) {
    return {
      erro: 'Fechamento ou PIX não encontrado',
      sucesso: false,
    };
  }

  // Se já confirmado, não fazer nada
  if (fechamento.pix_status === 'confirmado') {
    return {
      sucesso: true,
      mensagem: 'PIX já confirmado',
    };
  }

  try {
    const asaas = new AsaasClient({
      apiKey: process.env.ASAAS_API_KEY || '',
    });

    // Consultar status do PIX
    const pixAtualizado = await asaas.consultarPix(fechamento.pix_id);

    // Atualizar status
    let novoStatusFechamento = 'aprovado'; // Padrão
    if (pixAtualizado.status === 'confirmado') {
      novoStatusFechamento = 'pago';
    } else if (pixAtualizado.status === 'devolvido') {
      novoStatusFechamento = 'devolvido'; // Volta para revisar
    }

    const { error: updateError } = await supabase
      .from('fechamentos_prestador')
      .update({
        pix_status: pixAtualizado.status,
        pix_confirmado_em: pixAtualizado.dataConfirmacao || null,
        pix_motivo_devolucao: pixAtualizado.motivoDevolucao || null,
        status: novoStatusFechamento,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', fechamentoId);

    if (updateError) {
      throw updateError;
    }

    // Notificar se houve mudança de status
    if (pixAtualizado.status === 'confirmado' || pixAtualizado.status === 'devolvido') {
      const prestador = fechamento.prestadores_servico as any;
      const notificador = new Notificador();

      await notificador.enviar({
        canais: ['email'],
        destinatario: {
          email: prestador.pessoas?.email || '',
          telefone: prestador.pessoas?.telefone,
          nome: prestador.nome_completo,
        },
        template: {
          titulo:
            pixAtualizado.status === 'confirmado' ? 'PIX Recebido com Sucesso! 🎉' : 'PIX Devolvido',
          corpo:
            pixAtualizado.status === 'confirmado'
              ? 'Recebemos seu PIX com sucesso!'
              : `Seu PIX foi devolvido: ${pixAtualizado.motivoDevolucao}\n\nEm breve tentaremos novamente.`,
        },
      });
    }

    return {
      sucesso: true,
      status: pixAtualizado.status,
    };
  } catch (erro) {
    console.error('Erro ao rastrear PIX:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}
