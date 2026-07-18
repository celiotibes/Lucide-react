'use server';

import { obterPool } from '@/server/integracao/db';
import { Resend } from 'resend';

let resend: Resend | null = null;

function obterResend(): Resend {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend || new Resend('dummy-key');
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

/**
 * Disparador de notificações de preclusão (cron job)
 * Executar a cada hora ou diariamente
 */
export async function dispararNotificacoesPreclusao() {
  try {
    const pool = obterPool();

    // 1. Contestações abertas com dias restantes
    const contestacoes = await pool.query<ContestacaoComPrazo>(
      `select c.id, c.vistoria_saida_id, c.motivo, c.dias_uteis_restantes,
              c.preclusao_data_limite, c.contato_inquilino, c.status
       from contestacoes c
       where c.status = 'aberta' and c.dias_uteis_restantes > 0
       order by c.dias_uteis_restantes asc`
    );

    let enviadas = 0;
    let erros = 0;

    for (const contestacao of contestacoes.rows) {
      try {
        // Evitar envio duplicado
        const jáEnviada = await pool.query(
          `select id from notificacoes_preclusao
           where contestacao_id = $1 and tipo = $2`,
          [contestacao.id, obterTipoNotificacao(contestacao.dias_uteis_restantes)]
        );

        if (jáEnviada.rows.length > 0) {
          continue; // Skip se já foi enviada
        }

        // Determinar tipo de notificação
        let tipo: 'abertura_contestacao' | 'aviso_3_dias' | 'aviso_1_dia' = 'abertura_contestacao';
        let assunto = '';
        let corpo = '';

        if (contestacao.dias_uteis_restantes === 3) {
          tipo = 'aviso_3_dias';
          assunto = '⏰ Prazo de 3 dias úteis - Contestação de danos';
          corpo = criarCorpoEmail(contestacao, 3);
        } else if (contestacao.dias_uteis_restantes === 1) {
          tipo = 'aviso_1_dia';
          assunto = '🚨 URGENTE: 1 dia útil restante - Contestação de danos';
          corpo = criarCorpoEmail(contestacao, 1);
        } else if (contestacao.dias_uteis_restantes <= 0) {
          continue; // Preclusão expirada, não enviar mais
        } else {
          // Abertura de contestação (apenas um envio)
          assunto = '📋 Nova contestação registrada - Lei 8.245/91';
          corpo = criarCorpoEmailAbertura(contestacao);
        }

        // Enviar email via Resend
        const resultado = await obterResend().emails.send({
          from: 'vistorias@crmt-imobiliaria.com.br',
          to: contestacao.contato_inquilino,
          subject: assunto,
          html: corpo,
        });

        if (resultado.error) {
          throw new Error(`Resend error: ${resultado.error.message}`);
        }

        // Registrar notificação enviada
        await pool.query(
          `insert into notificacoes_preclusao (id, contestacao_id, tipo, enviado_para, canal, status_entrega)
           values (gen_random_uuid(), $1, $2, $3, $4, $5)`,
          [contestacao.id, tipo, contestacao.contato_inquilino, 'email', 'entregue']
        );

        enviadas++;
      } catch (erro) {
        console.error(`Erro ao notificar contestação ${contestacao.id}:`, erro);
        erros++;
      }
    }

    // 2. Verificar preclusões que venceram
    const preclusoeVencidas = await pool.query(
      `select c.id, c.contato_inquilino, c.motivo, c.preclusao_data_limite
       from contestacoes c
       where c.status = 'aberta' and now() > c.preclusao_data_limite`
    );

    for (const contestacao of preclusoeVencidas.rows) {
      try {
        // Atualizar status
        await pool.query(
          `update contestacoes set status = $1 where id = $2`,
          ['preclusao_expirada', contestacao.id]
        );

        // Enviar notificação de expiração (apenas uma vez)
        const jaEnviada = await pool.query(
          `select id from notificacoes_preclusao
           where contestacao_id = $1 and tipo = $2`,
          [contestacao.id, 'preclusao_expirada']
        );

        if (jaEnviada.rows.length === 0) {
          await obterResend().emails.send({
            from: 'vistorias@crmt-imobiliaria.com.br',
            to: contestacao.contato_inquilino,
            subject: '⏰ Preclusão expirada - Contestação encerrada',
            html: criarCorpoEmailExpirada(contestacao),
          });

          await pool.query(
            `insert into notificacoes_preclusao (id, contestacao_id, tipo, enviado_para, canal, status_entrega)
             values (gen_random_uuid(), $1, $2, $3, $4, $5)`,
            [contestacao.id, 'preclusao_expirada', contestacao.contato_inquilino, 'email', 'entregue']
          );
        }
      } catch (erro) {
        console.error(`Erro ao processar preclusão vencida ${contestacao.id}:`, erro);
      }
    }

    return {
      success: true,
      notificacoesEnviadas: enviadas,
      erros,
      preclusoeVencidas: preclusoeVencidas.rows.length,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao disparar notificações de preclusão:', mensagem);
    return {
      success: false,
      erro: mensagem,
      notificacoesEnviadas: 0,
      erros: 0,
      preclusoeVencidas: 0,
    };
  }
}

function obterTipoNotificacao(
  diasUteis: number
): 'abertura_contestacao' | 'aviso_3_dias' | 'aviso_1_dia' | null {
  if (diasUteis === 3) return 'aviso_3_dias';
  if (diasUteis === 1) return 'aviso_1_dia';
  return null;
}

function criarCorpoEmail(contestacao: ContestacaoComPrazo, diasRestantes: number): string {
  const dataVencimento = new Date(contestacao.preclusao_data_limite);
  const dataFormatada = dataVencimento.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ff9800; color: white; padding: 20px; border-radius: 4px; }
    .content { background: #f5f5f5; padding: 20px; border-radius: 4px; margin: 20px 0; }
    .alert { background: ${diasRestantes === 1 ? '#ffebee' : '#fff3e0'};
             border-left: 4px solid ${diasRestantes === 1 ? '#f44336' : '#ff9800'};
             padding: 15px; margin: 15px 0; }
    .button { background: #ff9800; color: white; padding: 12px 24px;
              text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
    .footer { color: #999; font-size: 12px; text-align: center; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ Aviso de Prazo - Contestação de Danos</h1>
    </div>

    <div class="content">
      <p>Prezado Inquilino,</p>

      <p>Você tem uma contestação registrada que está <strong>vencendo em ${diasRestantes} dia(s) útil(is)</strong>.</p>

      <div class="alert">
        <strong>Motivo da contestação:</strong> ${contestacao.motivo}
        <br><br>
        <strong>Vencimento:</strong> ${dataFormatada} (às 23h59m59s)
      </div>

      <p>Conforme a Lei 8.245/91 (Lei do Inquilinato), você tem um prazo de <strong>5 dias úteis</strong>
      a partir da abertura da contestação para enviar evidências e argumentos adicionais.</p>

      <p>Caso não haja manifestação até o vencimento do prazo, presume-se verdadeiro o laudo de vistoria
      conforme a legislação aplicável.</p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/vistorias/[id]/contestacao" class="button">
        Visualizar Contestação
      </a>

      <p style="color: #666; font-size: 14px;">
        Se você não tem uma contestação aberta, ignore este email.
      </p>
    </div>

    <div class="footer">
      <p>© 2026 CRMT Gestão Imobiliária | Este é um email automático, não responda</p>
      <p>Lei 8.245/91 - Lei do Inquilinato - Seção 1-B, Artigos 22-24</p>
    </div>
  </div>
</body>
</html>
  `;
}

function criarCorpoEmailAbertura(contestacao: ContestacaoComPrazo): string {
  const dataVencimento = new Date(contestacao.preclusao_data_limite);
  const dataFormatada = dataVencimento.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4caf50; color: white; padding: 20px; border-radius: 4px; }
    .content { background: #f5f5f5; padding: 20px; border-radius: 4px; margin: 20px 0; }
    .timeline { background: white; padding: 15px; border-left: 4px solid #2196f3; margin: 15px 0; }
    .button { background: #ff9800; color: white; padding: 12px 24px;
              text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
    .footer { color: #999; font-size: 12px; text-align: center; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✓ Contestação Registrada com Sucesso</h1>
    </div>

    <div class="content">
      <p>Prezado Inquilino,</p>

      <p>Sua contestação foi registrada com sucesso no sistema. Abaixo estão os detalhes:</p>

      <div class="timeline">
        <p><strong>Motivo:</strong> ${contestacao.motivo}</p>
        <p><strong>Status:</strong> Aberta e aguardando análise</p>
        <p><strong>Prazo para evidências:</strong> 5 dias úteis</p>
        <p><strong>Vencimento:</strong> ${dataFormatada}</p>
      </div>

      <p>A partir desta data, você tem <strong>5 dias úteis</strong> (segunda a sexta-feira) para enviar
      documentos e fotos que comprovem seu argumento, conforme a Lei 8.245/91.</p>

      <p style="background: #e8f5e9; padding: 15px; border-radius: 4px;">
        <strong>💡 Dica:</strong> Tire fotos claras da área em questão, colete depoimentos de testemunhas
        se houver, e documente qualquer evidência que contradiga o laudo.
      </p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/vistorias/[id]/contestacao" class="button">
        Acompanhar Contestação
      </a>

      <p style="color: #666; font-size: 14px;">
        Você receberá notificações automáticas quando o prazo estiver vencendo (3 dias e 1 dia antes do vencimento).
      </p>
    </div>

    <div class="footer">
      <p>© 2026 CRMT Gestão Imobiliária | Este é um email automático, não responda</p>
      <p>Lei 8.245/91 - Lei do Inquilinato - Seção 1-B, Artigos 22-24</p>
    </div>
  </div>
</body>
</html>
  `;
}

function criarCorpoEmailExpirada(contestacao: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #9c27b0; color: white; padding: 20px; border-radius: 4px; }
    .content { background: #f5f5f5; padding: 20px; border-radius: 4px; margin: 20px 0; }
    .alert { background: #f3e5f5; border-left: 4px solid #9c27b0; padding: 15px; margin: 15px 0; }
    .button { background: #ff9800; color: white; padding: 12px 24px;
              text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
    .footer { color: #999; font-size: 12px; text-align: center; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ Preclusão Expirada</h1>
    </div>

    <div class="content">
      <p>Prezado Inquilino,</p>

      <p>O prazo de <strong>5 dias úteis</strong> para contestação do item abaixo <strong>expirou</strong>.</p>

      <div class="alert">
        <strong>Motivo:</strong> ${contestacao.motivo}
        <br><br>
        <strong>Status:</strong> Preclusão expirada (presunção de veracidade do laudo)
      </div>

      <p>Conforme a Lei 8.245/91 (Lei do Inquilinato), a ausência de contestação dentro do prazo
      legal implica na presunção de veracidade dos danos registrados no laudo de vistoria.</p>

      <p>Caso você acredite que houve erro no processamento do seu prazo, entre em contato com o
      gestor do imóvel imediatamente.</p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/vistorias/[id]/contestacao" class="button">
        Visualizar Detalhes
      </a>
    </div>

    <div class="footer">
      <p>© 2026 CRMT Gestão Imobiliária | Este é um email automático, não responda</p>
      <p>Lei 8.245/91 - Lei do Inquilinato - Seção 1-B, Artigos 22-24</p>
    </div>
  </div>
</body>
</html>
  `;
}
