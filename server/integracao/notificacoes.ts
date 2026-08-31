// Notificações por email via Resend para eventos críticos do sistema
// Suporta:
// - Alertas de vencimento de seguro-incêndio (60 dias antes)
// - Notificação de direito de preferência ao locatário
// - Confirmações de ticket de suporte

import { Resend } from 'resend';
import type { Pool } from 'pg';

const resend = new Resend(process.env.RESEND_API_KEY);

interface PessoaComEmail {
  email: string | null;
  nome: string;
}

interface ContratoComImovel {
  contratoId: string;
  imovelIdentificacao: string;
  imovelEndereco: string;
}

export async function notificarVencimentoSeguroIncendio(
  pool: Pool,
  input: {
    contratoId: string;
    pessoaEmail: string;
    pessoaNome: string;
    imovelIdentificacao: string;
    dataVencimento: string; // ISO format
    diasAteVencimento: number;
  }
): Promise<{ id: string; enviado_em: string }> {
  const dataVencimentoFormatada = new Date(input.dataVencimento).toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const resultado = await resend.emails.send({
    from: 'CRMT <noreply@crmt.imobiliaria.com>',
    to: input.pessoaEmail,
    subject: `⚠️ Seguro-incêndio vence em ${input.diasAteVencimento} dias`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Alerta: Vencimento de Seguro-Incêndio</h2>
        <p>Olá <strong>${input.pessoaNome}</strong>,</p>

        <p>O seguro-incêndio para o imóvel <strong>${input.imovelIdentificacao}</strong>
        vence em <strong>${input.diasAteVencimento} dias</strong> (${dataVencimentoFormatada}).</p>

        <p>De acordo com a Lei de Inquilinato (Lei 8.245/91, Art. 22, VII), o seguro-incêndio
        é obrigatório para contratos de aluguel.</p>

        <div style="background: #FFF3CD; border-left: 4px solid #FFC107; padding: 16px; margin: 20px 0;">
          <p style="margin: 0;"><strong>⏰ Ação necessária:</strong> Renove o seguro antes do vencimento
          para evitar interrupção de cobertura.</p>
        </div>

        <p>Contato: suporte@crmt.imobiliaria.com</p>
      </div>
    `,
  });

  const messageId = (resultado as any).id;
  if (!messageId) {
    const error = (resultado as any).error;
    throw new Error(`Falha ao enviar email de vencimento de seguro: ${error?.message || 'Erro desconhecido'}`);
  }

  // Registrar no banco de dados
  const { rows } = await pool.query<{ id: string; enviado_em: string }>(
    `insert into auditoria_emails (tipo, destinatario, assunto, contrato_id, resend_message_id, enviado_em)
     values ('seguro_vencimento', $1, $2, $3, $4, current_timestamp)
     returning id, enviado_em`,
    [input.pessoaEmail, `Vencimento seguro em ${input.diasAteVencimento} dias`, input.contratoId, messageId]
  );

  if (rows.length === 0) {
    throw new Error('Falha ao registrar envio de email');
  }

  return { id: rows[0].id, enviado_em: rows[0].enviado_em };
}

export async function notificarDireitoPreferenciaLocatario(
  pool: Pool,
  input: {
    notificacaoId: string;
    contratoId: string;
    pessoaEmail: string;
    pessoaNome: string;
    imovelIdentificacao: string;
    valorOferta: number;
    prazoResposta: number; // dias
  }
): Promise<{ id: string; enviado_em: string }> {
  const dataResposta = new Date();
  dataResposta.setDate(dataResposta.getDate() + input.prazoResposta);
  const dataRespostaFormatada = dataResposta.toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const resultado = await resend.emails.send({
    from: 'CRMT <noreply@crmt.imobiliaria.com>',
    to: input.pessoaEmail,
    subject: `Direito de Preferência: ${input.imovelIdentificacao}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Direito de Preferência à Compra</h2>
        <p>Prezado(a) <strong>${input.pessoaNome}</strong>,</p>

        <p>Você tem o <strong>direito legal de preferência</strong> (Lei de Inquilinato, Art. 27) para
        adquirir o imóvel <strong>${input.imovelIdentificacao}</strong> antes de terceiros.</p>

        <div style="background: #E3F2FD; border-left: 4px solid #2196F3; padding: 16px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Detalhes da Oferta:</strong></p>
          <p style="margin: 8px 0;">Valor: <strong>R$ ${input.valorOferta.toFixed(2)}</strong></p>
          <p style="margin: 8px 0;">Prazo para resposta: <strong>${input.prazoResposta} dias</strong></p>
          <p style="margin: 8px 0;">Vencimento: <strong>${dataRespostaFormatada}</strong></p>
        </div>

        <p><strong>Opções disponíveis:</strong></p>
        <ul>
          <li>Exercer o direito: responda que deseja adquirir a propriedade</li>
          <li>Recusar: comunique a recusa por escrito</li>
        </ul>

        <p>Após expirado o prazo, você perderá o direito de preferência sobre este imóvel.</p>

        <p>Para responder, entre em contato: suporte@crmt.imobiliaria.com</p>
      </div>
    `,
  });

  const messageId = (resultado as any).id;
  if (!messageId) {
    const error = (resultado as any).error;
    throw new Error(`Falha ao enviar notificação de direito de preferência: ${error?.message || 'Erro desconhecido'}`);
  }

  // Registrar no banco de dados
  const { rows } = await pool.query<{ id: string; enviado_em: string }>(
    `insert into auditoria_emails (tipo, destinatario, assunto, contrato_id, notificacao_preferencia_id, resend_message_id, enviado_em)
     values ('direito_preferencia', $1, $2, $3, $4, $5, current_timestamp)
     returning id, enviado_em`,
    [
      input.pessoaEmail,
      `Direito de preferência para ${input.imovelIdentificacao}`,
      input.contratoId,
      input.notificacaoId,
      messageId,
    ]
  );

  if (rows.length === 0) {
    throw new Error('Falha ao registrar notificação de preferência');
  }

  return { id: rows[0].id, enviado_em: rows[0].enviado_em };
}

export async function notificarChamadoSuporte(
  pool: Pool,
  input: {
    chamadoId: string;
    pessoaEmail: string;
    pessoaNome: string;
    assunto: string;
    descricao: string;
  }
): Promise<{ id: string; enviado_em: string }> {
  const resultado = await resend.emails.send({
    from: 'CRMT <suporte@crmt.imobiliaria.com>',
    to: input.pessoaEmail,
    subject: `Chamado registrado: #${input.chamadoId.slice(0, 8)}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Seu chamado foi registrado</h2>
        <p>Olá <strong>${input.pessoaNome}</strong>,</p>

        <p>Recebemos seu chamado de suporte. Nosso time está analisando e entrará em contato em breve.</p>

        <div style="background: #F5F5F5; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0;"><strong>Número do chamado:</strong> ${input.chamadoId.slice(0, 8)}</p>
          <p style="margin: 0 0 8px 0;"><strong>Assunto:</strong> ${input.assunto}</p>
          <p style="margin: 0;"><strong>Descrição:</strong></p>
          <p style="margin: 8px 0 0 0; white-space: pre-wrap;">${input.descricao}</p>
        </div>

        <p>Tempo estimado de resposta: até 24 horas.</p>
        <p>Contato: suporte@crmt.imobiliaria.com</p>
      </div>
    `,
  });

  const messageId = (resultado as any).id;
  if (!messageId) {
    const error = (resultado as any).error;
    throw new Error(`Falha ao enviar confirmação de chamado: ${error?.message || 'Erro desconhecido'}`);
  }

  // Registrar no banco de dados
  const { rows } = await pool.query<{ id: string; enviado_em: string }>(
    `insert into auditoria_emails (tipo, destinatario, assunto, chamado_id, resend_message_id, enviado_em)
     values ('chamado_confirmacao', $1, $2, $3, $4, current_timestamp)
     returning id, enviado_em`,
    [input.pessoaEmail, `Confirmação chamado: ${input.assunto}`, input.chamadoId, messageId]
  );

  if (rows.length === 0) {
    throw new Error('Falha ao registrar confirmação de chamado');
  }

  return { id: rows[0].id, enviado_em: rows[0].enviado_em };
}
