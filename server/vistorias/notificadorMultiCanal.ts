'use server';

import { obterPool } from '@/server/integracao/db';
import { Resend } from 'resend';
import twilio from 'twilio';

const resend = new Resend(process.env.RESEND_API_KEY);
const twilioClient = process.env.TWILIO_ACCOUNT_SID
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

interface ContactoInquilino {
  id: string;
  email: string;
  telefone?: string;
  whatsapp?: string;
  nome: string;
}

interface ContestacaoComPrazo {
  id: string;
  vistoria_saida_id: string;
  motivo: string;
  dias_uteis_restantes: number;
  preclusao_data_limite: Date;
  contato_inquilino: string;
  status: string;
}

type CanalNotificacao = 'email' | 'sms' | 'whatsapp';

/**
 * Disparador multi-canal de notificações (cron job)
 * Suporta: Email (Resend), SMS (Twilio), WhatsApp (Twilio)
 */
export async function dispararNotificacoesMultiCanal() {
  try {
    const pool = obterPool();

    let enviadas = 0;
    let erros = 0;
    const resultados: Array<{ contestacao: string; canal: CanalNotificacao; status: string }> = [];

    // 1. Contestações abertas com dias restantes
    const contestacoes = await pool.query<ContestacaoComPrazo>(
      `select c.id, c.vistoria_saida_id, c.motivo, c.dias_uteis_restantes,
              c.preclusao_data_limite, c.contato_inquilino, c.status
       from contestacoes c
       where c.status = 'aberta' and c.dias_uteis_restantes > 0
       order by c.dias_uteis_restantes asc`
    );

    for (const contestacao of contestacoes.rows) {
      try {
        // Buscar dados completos do inquilino
        const inquilino = await buscarContatoInquilino(pool, contestacao.contato_inquilino);
        if (!inquilino) continue;

        // Determinar tipo de notificação
        const tipo = obterTipoNotificacao(contestacao.dias_uteis_restantes);
        if (!tipo) continue;

        // Evitar duplicatas
        const jáEnviada = await verificarNotificacaoEnviada(pool, contestacao.id, tipo);
        if (jáEnviada) continue;

        // Disparar por canais configurados
        const canais = obterCanaisConfiguraados(inquilino);

        for (const canal of canais) {
          try {
            const resultado = await dispararPorCanal(canal, inquilino, contestacao, tipo);

            // Registrar notificação
            await registrarNotificacao(pool, contestacao.id, tipo, inquilino.email, canal, resultado.success);

            if (resultado.success) {
              enviadas++;
              resultados.push({
                contestacao: contestacao.id,
                canal,
                status: 'enviado',
              });
            } else {
              erros++;
              resultados.push({
                contestacao: contestacao.id,
                canal,
                status: `erro: ${resultado.erro}`,
              });
            }
          } catch (canalErro) {
            console.error(`Erro ao enviar via ${canal}:`, canalErro);
            erros++;
          }
        }
      } catch (erro) {
        console.error(`Erro ao processar contestação ${contestacao.id}:`, erro);
        erros++;
      }
    }

    // 2. Preclusões vencidas
    const preclusoeVencidas = await pool.query(
      `select c.id, c.contato_inquilino, c.motivo
       from contestacoes c
       where c.status = 'aberta' and now() > c.preclusao_data_limite`
    );

    for (const contestacao of preclusoeVencidas.rows) {
      try {
        const jáEnviada = await verificarNotificacaoEnviada(pool, contestacao.id, 'preclusao_expirada');
        if (jáEnviada) continue;

        const inquilino = await buscarContatoInquilino(pool, contestacao.contato_inquilino);
        if (!inquilino) continue;

        // Atualizar status
        await pool.query('update contestacoes set status = $1 where id = $2', [
          'preclusao_expirada',
          contestacao.id,
        ]);

        // Notificar por todos os canais
        const canais = obterCanaisConfiguraados(inquilino);
        for (const canal of canais) {
          try {
            await dispararPorCanal(canal, inquilino, contestacao, 'preclusao_expirada');
            await registrarNotificacao(
              pool,
              contestacao.id,
              'preclusao_expirada',
              inquilino.email,
              canal,
              true
            );
            enviadas++;
          } catch (err) {
            console.error(`Erro ao notificar expiração via ${canal}:`, err);
            erros++;
          }
        }
      } catch (erro) {
        console.error(`Erro ao processar preclusão vencida:`, erro);
        erros++;
      }
    }

    return {
      success: true,
      notificacoesEnviadas: enviadas,
      erros,
      detalhes: resultados,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao disparar notificações multi-canal:', mensagem);
    return {
      success: false,
      erro: mensagem,
      notificacoesEnviadas: 0,
      erros: 0,
      detalhes: [],
    };
  }
}

async function buscarContatoInquilino(pool: any, emailOuId: string): Promise<ContactoInquilino | null> {
  // Buscar na tabela pessoas/usuarios
  const result = await pool.query(
    `select id, email, telefone, whatsapp, nome
     from pessoas
     where email = $1 or id = $2`,
    [emailOuId, emailOuId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

async function verificarNotificacaoEnviada(
  pool: any,
  contestacaoId: string,
  tipo: string
): Promise<boolean> {
  const result = await pool.query(
    `select id from notificacoes_preclusao
     where contestacao_id = $1 and tipo = $2`,
    [contestacaoId, tipo]
  );

  return result.rows.length > 0;
}

function obterTipoNotificacao(
  diasUteis: number
): 'abertura_contestacao' | 'aviso_3_dias' | 'aviso_1_dia' | null {
  if (diasUteis === 5) return 'abertura_contestacao'; // Primeira vez
  if (diasUteis === 3) return 'aviso_3_dias';
  if (diasUteis === 1) return 'aviso_1_dia';
  return null;
}

function obterCanaisConfiguraados(inquilino: ContactoInquilino): CanalNotificacao[] {
  const canais: CanalNotificacao[] = [];

  if (inquilino.email) canais.push('email');
  if (inquilino.telefone) canais.push('sms');
  if (inquilino.whatsapp) canais.push('whatsapp');

  return canais.length > 0 ? canais : ['email']; // Email é fallback
}

async function dispararPorCanal(
  canal: CanalNotificacao,
  inquilino: ContactoInquilino,
  contestacao: any,
  tipo: string
): Promise<{ success: boolean; erro?: string }> {
  switch (canal) {
    case 'email':
      return await dispararEmail(inquilino, contestacao, tipo);
    case 'sms':
      return await dispararSMS(inquilino, contestacao, tipo);
    case 'whatsapp':
      return await dispararWhatsApp(inquilino, contestacao, tipo);
  }
}

async function dispararEmail(
  inquilino: ContactoInquilino,
  contestacao: any,
  tipo: string
): Promise<{ success: boolean; erro?: string }> {
  try {
    const { subject, html } = criarConteudoEmail(inquilino, contestacao, tipo);

    const resultado = await resend.emails.send({
      from: 'vistorias@crmt-imobiliaria.com.br',
      to: inquilino.email,
      subject,
      html,
    });

    if (resultado.error) {
      return { success: false, erro: resultado.error.message };
    }

    return { success: true };
  } catch (erro) {
    return {
      success: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}

async function dispararSMS(
  inquilino: ContactoInquilino,
  contestacao: any,
  tipo: string
): Promise<{ success: boolean; erro?: string }> {
  if (!twilioClient || !inquilino.telefone) {
    return {
      success: false,
      erro: 'Twilio não configurado ou telefone não disponível',
    };
  }

  try {
    const mensagem = criarConteudoSMS(inquilino, contestacao, tipo);

    const resultado = await twilioClient.messages.create({
      body: mensagem,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: inquilino.telefone,
    });

    return { success: true };
  } catch (erro) {
    return {
      success: false,
      erro: erro instanceof Error ? erro.message : 'Erro ao enviar SMS',
    };
  }
}

async function dispararWhatsApp(
  inquilino: ContactoInquilino,
  contestacao: any,
  tipo: string
): Promise<{ success: boolean; erro?: string }> {
  if (!twilioClient || !inquilino.whatsapp) {
    return {
      success: false,
      erro: 'Twilio não configurado ou WhatsApp não disponível',
    };
  }

  try {
    const mensagem = criarConteudoWhatsApp(inquilino, contestacao, tipo);

    // Formato: +5511999999999
    const whatsappNumber = `whatsapp:${inquilino.whatsapp}`;

    const resultado = await twilioClient.messages.create({
      body: mensagem,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: whatsappNumber,
    });

    return { success: true };
  } catch (erro) {
    return {
      success: false,
      erro: erro instanceof Error ? erro.message : 'Erro ao enviar WhatsApp',
    };
  }
}

async function registrarNotificacao(
  pool: any,
  contestacaoId: string,
  tipo: string,
  emailOuContato: string,
  canal: CanalNotificacao,
  sucesso: boolean
): Promise<void> {
  await pool.query(
    `insert into notificacoes_preclusao
     (id, contestacao_id, tipo, enviado_para, canal, status_entrega)
     values (gen_random_uuid(), $1, $2, $3, $4, $5)`,
    [contestacaoId, tipo, emailOuContato, canal, sucesso ? 'entregue' : 'falha']
  );
}

function criarConteudoEmail(
  inquilino: ContactoInquilino,
  contestacao: any,
  tipo: string
): { subject: string; html: string } {
  const dataVencimento = new Date(contestacao.preclusao_data_limite);
  const dataFormatada = dataVencimento.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (tipo === 'abertura_contestacao') {
    return {
      subject: '✓ Contestação Registrada com Sucesso',
      html: `
        <h2>Sua contestação foi registrada!</h2>
        <p>Motivo: ${contestacao.motivo}</p>
        <p>Prazo: 5 dias úteis até ${dataFormatada}</p>
        <p>Você receberá avisos quando faltarem 3 dias e 1 dia para vencer.</p>
      `,
    };
  } else if (tipo === 'aviso_3_dias') {
    return {
      subject: '⏰ 3 dias para contestação vencer',
      html: `
        <h2>Aviso: 3 dias úteis restantes</h2>
        <p>Sua contestação vence em ${dataFormatada}</p>
        <p>Envie suas evidências em breve!</p>
      `,
    };
  } else if (tipo === 'aviso_1_dia') {
    return {
      subject: '🚨 URGENTE: 1 dia para contestação vencer',
      html: `
        <h2>URGENTE: Último dia!</h2>
        <p>Sua contestação vence AMANHÃ (${dataFormatada})</p>
        <p>Envie suas evidências agora mesmo!</p>
      `,
    };
  } else {
    return {
      subject: '⏰ Contestação expirada',
      html: `
        <h2>Preclusão expirada</h2>
        <p>O prazo para contestação expirou.</p>
        <p>Presume-se verdadeiro o laudo da vistoria conforme Lei 8.245/91.</p>
      `,
    };
  }
}

function criarConteudoSMS(inquilino: ContactoInquilino, contestacao: any, tipo: string): string {
  if (tipo === 'abertura_contestacao') {
    return `CRMT: Contestação registrada! Prazo: 5 dias úteis. Acesse o portal para acompanhar.`;
  } else if (tipo === 'aviso_3_dias') {
    return `CRMT: ⏰ 3 dias restantes para contestação vencer. Envie suas evidências!`;
  } else if (tipo === 'aviso_1_dia') {
    return `CRMT: 🚨 URGENTE! Último dia para contestação! Envie evidências agora.`;
  } else {
    return `CRMT: Contestação expirada. Presunção de veracidade do laudo (Lei 8.245/91).`;
  }
}

function criarConteudoWhatsApp(inquilino: ContactoInquilino, contestacao: any, tipo: string): string {
  if (tipo === 'abertura_contestacao') {
    return `✓ Sua contestação foi registrada!\n\nMotivo: ${contestacao.motivo}\nPrazo: 5 dias úteis\n\nVocê receberá avisos quando faltarem 3 dias e 1 dia.`;
  } else if (tipo === 'aviso_3_dias') {
    return `⏰ *3 DIAS RESTANTES* para contestação vencer!\n\nMotivo: ${contestacao.motivo}\n\n⚠️ Envie suas evidências em breve!`;
  } else if (tipo === 'aviso_1_dia') {
    return `🚨 *URGENTE! ÚLTIMO DIA!*\n\nSua contestação vence *AMANHÃ*!\n\n❌ Envie suas evidências AGORA.`;
  } else {
    return `⏰ Sua contestação expirou.\n\nPresume-se verdadeiro o laudo conforme Lei 8.245/91.`;
  }
}
