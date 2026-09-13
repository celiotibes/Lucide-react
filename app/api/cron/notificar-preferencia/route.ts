// Enviar notificações de direito de preferência que foram recém-registrados
// e ainda não foram notificados ao locatário via email

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { notificarDireitoPreferenciaLocatario } from '@/server/integracao/notificacoes';

export const dynamic = 'force-dynamic';

interface NotificacaoPendente {
  id: string;
  contrato_id: string;
  pessoa_id: string;
  pessoa_nome: string;
  pessoa_email: string;
  imovel_identificacao: string;
  valor_oferta: number;
  prazo_resposta_dias: number;
  notificado_em: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return tratarChamada(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return tratarChamada(request);
}

async function tratarChamada(request: NextRequest): Promise<NextResponse> {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado) {
    return NextResponse.json({ erro: 'CRON_SECRET não configurado no ambiente.' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const pool = obterPool();

    // Buscar notificações de preferência que ainda não foram notificadas por email
    const { rows: notificacoes } = await pool.query<NotificacaoPendente>(
      `select
         npv.id,
         npv.contrato_id,
         cp.pessoa_id,
         p.nome as pessoa_nome,
         p.email as pessoa_email,
         i.identificacao as imovel_identificacao,
         npv.valor_oferta,
         npv.prazo_resposta_dias,
         npv.notificado_em
       from notificacoes_preferencia_venda npv
       join contratos c on c.id = npv.contrato_id
       join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
       join pessoas p on p.id = cp.pessoa_id
       join imoveis i on i.id = c.imovel_id
       where npv.resposta is null
         and npv.data_notificacao_enviada is null
         and npv.notificado_em >= current_date - interval '1 day'`
    );

    const notificacoesEnviadas = [];
    const erros = [];

    for (const notif of notificacoes) {
      try {
        if (!notif.pessoa_email) {
          console.warn(`Notificação ${notif.id}: locatário sem email cadastrado`);
          continue;
        }

        await notificarDireitoPreferenciaLocatario(pool, {
          notificacaoId: notif.id,
          contratoId: notif.contrato_id,
          pessoaEmail: notif.pessoa_email,
          pessoaNome: notif.pessoa_nome,
          imovelIdentificacao: notif.imovel_identificacao,
          valorOferta: notif.valor_oferta,
          prazoResposta: notif.prazo_resposta_dias,
        });

        // Atualizar data de notificação enviada
        await pool.query(
          `update notificacoes_preferencia_venda
           set data_notificacao_enviada = current_timestamp,
               data_expiracao = current_date + ($1 || ' days')::interval
           where id = $2`,
          [notif.prazo_resposta_dias, notif.id]
        );

        notificacoesEnviadas.push({
          notificacaoId: notif.id,
          contratoId: notif.contrato_id,
          imovel: notif.imovel_identificacao,
          email: notif.pessoa_email,
          valorOferta: notif.valor_oferta,
          prazoResposta: notif.prazo_resposta_dias,
        });
      } catch (erro) {
        erros.push({
          notificacaoId: notif.id,
          imovel: notif.imovel_identificacao,
          erro: (erro as Error).message,
        });
      }
    }

    return NextResponse.json({
      notificacoesEnviadas: notificacoesEnviadas.length,
      detalhes: notificacoesEnviadas,
      erros: erros.length > 0 ? erros : undefined,
    });
  } catch (erro) {
    console.error('Erro ao enviar notificações de preferência:', erro);
    return NextResponse.json({ erro: (erro as Error).message }, { status: 500 });
  }
}
