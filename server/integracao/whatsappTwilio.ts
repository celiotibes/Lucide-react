// Integração Twilio para notificações via WhatsApp
// Suporta: lembretes de pagamento, confirmações, alertas

import type { Pool } from 'pg';

export interface ConfigTwilio {
  accountSid: string;
  authToken: string;
  fromNumber: string; // número WhatsApp Business
}

export interface NotificacaoWhatsApp {
  recipienteNumeroCelular: string;
  destinatarioNome: string;
  tipoNotificacao: 'lembrete_pagamento' | 'confirmacao_pagamento' | 'alerta_atraso' | 'notificacao_preferencia';
  conteudo: string;
  dadosRelevantes?: Record<string, any>;
}

export interface ResultadoEnvio {
  sucesso: boolean;
  messageSid?: string;
  erro?: string;
  dataEnvio: string;
}

/**
 * Enviar notificação via WhatsApp usando Twilio
 * Integração com API REST do Twilio
 */
export async function enviarNotificacaoWhatsApp(
  pool: Pool,
  notificacao: NotificacaoWhatsApp
): Promise<ResultadoEnvio> {
  try {
    // Validar configuração Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return {
        sucesso: false,
        erro: 'Configuração Twilio não encontrada nas variáveis de ambiente',
        dataEnvio: new Date().toISOString(),
      };
    }

    // Validar e formatar número de celular (deve estar com +55 no início)
    let numberFormatted = notificacao.recipienteNumeroCelular.replace(/\D/g, '');
    if (!numberFormatted.startsWith('55')) {
      numberFormatted = '55' + numberFormatted;
    }
    numberFormatted = '+' + numberFormatted;

    // Construir mensagem template conforme tipo
    const mensagem = construirMensagem(notificacao);

    // Enviar via Twilio API
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: `whatsapp:${fromNumber}`,
        To: `whatsapp:${numberFormatted}`,
        Body: mensagem,
      }).toString(),
    });

    if (!response.ok) {
      const erro = await response.json();
      return {
        sucesso: false,
        erro: erro.message || 'Erro ao enviar mensagem via Twilio',
        dataEnvio: new Date().toISOString(),
      };
    }

    const dados = await response.json();
    const messageSid = (dados as any).sid;

    // Registrar envio no banco
    await registrarEnvioWhatsApp(pool, {
      numeroCelular: notificacao.recipienteNumeroCelular,
      tipoNotificacao: notificacao.tipoNotificacao,
      mensagem,
      messageSid,
      status: 'enviado',
    });

    return {
      sucesso: true,
      messageSid,
      dataEnvio: new Date().toISOString(),
    };
  } catch (erro) {
    console.error('Erro ao enviar WhatsApp:', erro);
    return {
      sucesso: false,
      erro: (erro as Error).message,
      dataEnvio: new Date().toISOString(),
    };
  }
}

/**
 * Construir conteúdo da mensagem conforme tipo de notificação
 */
function construirMensagem(notificacao: NotificacaoWhatsApp): string {
  const { tipoNotificacao, conteudo, dadosRelevantes } = notificacao;

  switch (tipoNotificacao) {
    case 'lembrete_pagamento':
      return (
        `Olá ${notificacao.destinatarioNome}!\n\n` +
        `💳 *Lembrete de Pagamento*\n\n` +
        `Fatura: ${dadosRelevantes?.numeroFatura || ''}\n` +
        `Valor: R$ ${dadosRelevantes?.valor || '0,00'}\n` +
        `Vencimento: ${dadosRelevantes?.vencimento || ''}\n\n` +
        `Por favor, realize o pagamento em dia para evitar multas e juros.\n\n` +
        `Acesse o portal: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://seu-portal.com'}/portal/faturas`
      );

    case 'confirmacao_pagamento':
      return (
        `Olá ${notificacao.destinatarioNome}!\n\n` +
        `✅ *Pagamento Confirmado*\n\n` +
        `Fatura: ${dadosRelevantes?.numeroFatura || ''}\n` +
        `Valor: R$ ${dadosRelevantes?.valor || '0,00'}\n` +
        `Data: ${new Date().toLocaleDateString('pt-BR')}\n\n` +
        `Obrigado pelo pagamento! Seu comprovante está disponível no portal.`
      );

    case 'alerta_atraso':
      return (
        `Atenção ${notificacao.destinatarioNome}!\n\n` +
        `⚠️ *Fatura em Atraso*\n\n` +
        `Fatura: ${dadosRelevantes?.numeroFatura || ''}\n` +
        `Dias em atraso: ${dadosRelevantes?.diasAtraso || '0'}\n` +
        `Valor devido: R$ ${dadosRelevantes?.valor || '0,00'}\n\n` +
        `Para evitar problemas com seu contrato, efetue o pagamento imediatamente.\n` +
        `Contato de suporte: ${process.env.SUPORTE_WHATSAPP || '(11) 9999-9999'}`
      );

    case 'notificacao_preferencia':
      return (
        `Olá ${notificacao.destinatarioNome}!\n\n` +
        `🏠 *Notificação de Direito de Preferência*\n\n` +
        `Imóvel: ${dadosRelevantes?.imovelIdentificacao || ''}\n` +
        `Motivo: ${dadosRelevantes?.motivo || 'Venda do imóvel'}\n\n` +
        `Você tem ${dadosRelevantes?.prazoDias || '30'} dias para exercer seu direito de preferência.\n` +
        `Acesse o portal para mais detalhes: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://seu-portal.com'}/portal`
      );

    default:
      return conteudo;
  }
}

/**
 * Registrar envio de WhatsApp no banco para auditoria
 */
async function registrarEnvioWhatsApp(
  pool: Pool,
  dados: {
    numeroCelular: string;
    tipoNotificacao: string;
    mensagem: string;
    messageSid: string;
    status: string;
  }
): Promise<void> {
  await pool.query(
    `
    insert into auditoria_whatsapp
      (numero_celular, tipo_notificacao, mensagem, message_sid, status)
    values
      ($1, $2, $3, $4, $5)
  `,
    [
      dados.numeroCelular,
      dados.tipoNotificacao,
      dados.mensagem,
      dados.messageSid,
      dados.status,
    ]
  );
}

/**
 * Processar webhook de status de mensagem do Twilio
 * Atualiza status: queued, sent, delivered, undelivered, failed, read
 */
export async function processarWebhookStatusWhatsApp(
  pool: Pool,
  dados: {
    messageSid: string;
    status: string;
    timestamp?: string;
  }
): Promise<{ processado: boolean }> {
  try {
    await pool.query(
      `
      update auditoria_whatsapp
      set
        status = $1,
        status_atualizado_em = now()
      where message_sid = $2
    `,
      [dados.status, dados.messageSid]
    );

    return { processado: true };
  } catch (erro) {
    console.error('Erro ao processar webhook WhatsApp:', erro);
    return { processado: false };
  }
}

/**
 * Enviar notificação em lote para múltiplos destinatários
 * Útil para lembretes de vencimento diário/semanal
 */
export async function enviarNotificacaoEmLote(
  pool: Pool,
  notificacoes: NotificacaoWhatsApp[]
): Promise<{ sucessos: number; falhas: number }> {
  let sucessos = 0;
  let falhas = 0;

  for (const notificacao of notificacoes) {
    const resultado = await enviarNotificacaoWhatsApp(pool, notificacao);
    if (resultado.sucesso) {
      sucessos++;
    } else {
      falhas++;
      console.error(`Falha ao enviar para ${notificacao.recipienteNumeroCelular}:`, resultado.erro);
    }

    // Rate limiting: aguardar 100ms entre mensagens
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { sucessos, falhas };
}

/**
 * Obter histórico de notificações enviadas
 */
export async function obterHistoricoWhatsApp(
  pool: Pool,
  filtros?: {
    numeroCelular?: string;
    tipoNotificacao?: string;
    status?: string;
    dataInicio?: string;
    dataFim?: string;
  }
): Promise<any[]> {
  let query = 'select * from auditoria_whatsapp where 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (filtros?.numeroCelular) {
    query += ` and numero_celular = $${paramIndex}`;
    params.push(filtros.numeroCelular);
    paramIndex++;
  }

  if (filtros?.tipoNotificacao) {
    query += ` and tipo_notificacao = $${paramIndex}`;
    params.push(filtros.tipoNotificacao);
    paramIndex++;
  }

  if (filtros?.status) {
    query += ` and status = $${paramIndex}`;
    params.push(filtros.status);
    paramIndex++;
  }

  if (filtros?.dataInicio) {
    query += ` and created_at >= $${paramIndex}::timestamp`;
    params.push(filtros.dataInicio);
    paramIndex++;
  }

  if (filtros?.dataFim) {
    query += ` and created_at <= $${paramIndex}::timestamp`;
    params.push(filtros.dataFim);
    paramIndex++;
  }

  query += ` order by created_at desc limit 1000`;

  const { rows } = await pool.query<any>(query, params);
  return rows;
}
