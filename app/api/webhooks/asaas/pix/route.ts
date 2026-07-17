// ============================================================================
// Webhook: PIX (Transferência Instantânea)
// ============================================================================
// Rastreia eventos de PIX: enviado, confirmado, devolvido, expirado.
// Auto-marca fechamento como pago quando confirmado.

import { NextRequest, NextResponse } from 'next/server';
import type { Pool } from 'pg';
import { obterPool } from '@/server/integracao/db';
import { Notificador } from '@/server/notificacao/Notificador';

export const dynamic = 'force-dynamic';

interface EventoPixAsaas {
  eventType: string; // 'transfer.sent', 'transfer.confirmed', 'transfer.failed', 'transfer.expired'
  transferId: string;
  externalReference: string; // fechamento_id
  status: 'PENDING' | 'TRANSFERRED' | 'FAILED' | 'EXPIRED';
  amount: number;
  sentDate?: string;
  confirmedDate?: string;
  failureReason?: string;
  beneficiary: {
    name: string;
    cpfCnpj: string;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validar token
  const tokenConfigurado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!tokenConfigurado) {
    return NextResponse.json({ erro: 'ASAAS_WEBHOOK_TOKEN não configurado' }, { status: 500 });
  }

  const tokenRecebido = request.headers.get('asaas-access-token');
  if (tokenRecebido !== tokenConfigurado) {
    return NextResponse.json({ erro: 'Token inválido' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 });
  }

  const evento = payload as EventoPixAsaas;

  if (!evento.eventType || !evento.transferId || !evento.externalReference) {
    return NextResponse.json(
      { erro: 'Campos obrigatórios faltando: eventType, transferId, externalReference' },
      { status: 400 }
    );
  }

  const pool = obterPool();

  try {
    // Buscar fechamento
    const { rows: fechamentos } = await pool.query<{
      id: string;
      prestador_id: string;
      status: string;
      valor_liquido: number;
    }>(
      `select id, prestador_id, status, valor_liquido from fechamentos_prestador where id = $1`,
      [evento.externalReference]
    );

    if (fechamentos.length === 0) {
      return NextResponse.json(
        { processado: false, motivo: 'Fechamento não encontrado' },
        { status: 404 }
      );
    }

    const fechamento = fechamentos[0];

    // Mapear status Asaas
    const statusMap: Record<string, string> = {
      PENDING: 'enviado',
      TRANSFERRED: 'confirmado',
      FAILED: 'devolvido',
      EXPIRED: 'expirado',
    };

    const statusNosso = statusMap[evento.status] || evento.status;

    // Se confirmado, marcar fechamento como pago
    let novoStatusFechamento = fechamento.status;
    if (evento.status === 'TRANSFERRED') {
      novoStatusFechamento = 'pago';
    } else if (evento.status === 'FAILED') {
      novoStatusFechamento = 'devolvido';
    }

    // Atualizar fechamento
    await pool.query(
      `update fechamentos_prestador
       set pix_id = $1, pix_status = $2,
           pix_enviado_em = $3, pix_confirmado_em = $4,
           pix_motivo_devolucao = $5,
           status = $6, atualizado_em = now()
       where id = $7`,
      [
        evento.transferId,
        statusNosso,
        evento.sentDate || new Date().toISOString(),
        evento.confirmedDate || null,
        evento.failureReason || null,
        novoStatusFechamento,
        fechamento.id,
      ]
    );

    // Buscar dados do prestador para notificação
    const { rows: prestadores } = await pool.query<{
      nome_completo: string;
      email: string;
      telefone?: string;
    }>(
      `select ps.nome_completo, p.email, p.telefone
       from prestadores_servico ps
       join pessoas p on ps.pessoa_id = p.id
       where ps.id = $1`,
      [fechamento.prestador_id]
    );

    const prestador = prestadores[0];

    // Notificar prestador
    if (prestador?.email) {
      const notificador = new Notificador();

      let titulo = '';
      let corpo = '';
      let canais: Array<'email' | 'whatsapp' | 'sms'> = ['email'];

      switch (evento.status) {
        case 'TRANSFERRED':
          titulo = 'PIX Confirmado! 🎉';
          corpo = `Recebemos seu PIX de R$ ${evento.amount.toFixed(2)} com sucesso!`;
          if (prestador.telefone) {
            canais.push('whatsapp');
          }
          break;

        case 'FAILED':
          titulo = 'PIX Devolvido';
          corpo = `Seu PIX de R$ ${evento.amount.toFixed(2)} foi devolvido.\nMotivo: ${evento.failureReason || 'Chave PIX inválida'}\n\nEm breve faremos uma nova tentativa.`;
          canais = ['email']; // Não alarmar com WhatsApp
          break;

        case 'EXPIRED':
          titulo = 'PIX Expirado';
          corpo = `Seu PIX de R$ ${evento.amount.toFixed(2)} expirou (aguardava há 30 minutos).\n\nEm breve enviaremos um novo.`;
          canais = ['email'];
          break;

        default:
          titulo = 'PIX Enviado';
          corpo = `Enviamos seu PIX de R$ ${evento.amount.toFixed(2)} para a chave registrada.\n\nAguardando confirmação...`;
          canais = ['email'];
      }

      await notificador.enviar({
        canais: canais as Array<'email' | 'whatsapp' | 'sms'>,
        destinatario: {
          email: prestador.email,
          telefone: prestador.telefone,
          nome: prestador.nome_completo,
        },
        template: {
          titulo,
          corpo,
        },
        variaveis: {
          prestador: prestador.nome_completo,
          valor: evento.amount.toFixed(2),
          status: statusNosso,
        },
      });
    }

    // Log de auditoria
    await pool.query(
      `insert into auditoria_prestador (prestador_id, acao, tabela, valores_antes, valores_depois, usuario_id, timestamp)
       values ($1, $2, $3, $4, $5, null, now())`,
      [
        fechamento.prestador_id,
        'atualizar_pix',
        'fechamentos_prestador',
        JSON.stringify({ pix_status: 'N/A', status: fechamento.status }),
        JSON.stringify({ pix_status: statusNosso, pix_id: evento.transferId, status: novoStatusFechamento }),
      ]
    );

    return NextResponse.json({
      processado: true,
      transferId: evento.transferId,
      pixStatus: statusNosso,
      fechamentoStatus: novoStatusFechamento,
      fechamentoId: fechamento.id,
    });
  } catch (erro) {
    console.error('Erro ao processar webhook PIX:', erro);
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : 'Erro desconhecido' },
      { status: 500 }
    );
  }
}
