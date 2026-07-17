// ============================================================================
// Webhook: NFS-e (Nota Fiscal de Serviço Eletrônica)
// ============================================================================
// Rastreia eventos de NFS-e: emitida, processada, cancelada.
// Atualiza banco de dados e notifica prestador.

import { NextRequest, NextResponse } from 'next/server';
import type { Pool } from 'pg';
import { obterPool } from '@/server/integracao/db';
import { Notificador } from '@/server/notificacao/Notificador';

export const dynamic = 'force-dynamic';

interface EventoNfseAsaas {
  eventType: string; // 'nfse.issued', 'nfse.processed', 'nfse.cancelled'
  nfseId: string;
  serviceProviderId: string;
  externalReference: string; // fechamento_id
  status: 'emitted' | 'processed' | 'cancelled';
  issueDate?: string;
  url?: string;
  protocol?: string;
  cancelReason?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validar token de segurança
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

  const evento = payload as EventoNfseAsaas;

  if (!evento.eventType || !evento.nfseId || !evento.externalReference) {
    return NextResponse.json(
      { erro: 'Campos obrigatórios faltando: eventType, nfseId, externalReference' },
      { status: 400 }
    );
  }

  const pool = obterPool();

  try {
    // Atualizar fechamento com status da NFS-e
    const { rows: fechamentos } = await pool.query<{ id: string; prestador_id: string }>(
      `select id, prestador_id from fechamentos_prestador where id = $1`,
      [evento.externalReference]
    );

    if (fechamentos.length === 0) {
      return NextResponse.json(
        { processado: false, motivo: 'Fechamento não encontrado' },
        { status: 404 }
      );
    }

    const fechamento = fechamentos[0];

    // Mapear status Asaas para nosso formato
    const statusMap: Record<string, string> = {
      emitted: 'emitida',
      processed: 'processada',
      cancelled: 'cancelada',
    };

    const statusNosso = statusMap[evento.status] || evento.status;

    await pool.query(
      `update fechamentos_prestador
       set nfse_id = $1, nfse_status = $2, nfse_url = $3, nfse_protocolo = $4, atualizado_em = now()
       where id = $5`,
      [evento.nfseId, statusNosso, evento.url || null, evento.protocol || null, fechamento.id]
    );

    // Buscar dados do prestador para notificação
    const { rows: prestadores } = await pool.query<{ nome_completo: string; email: string }>(
      `select ps.nome_completo, p.email
       from prestadores_servico ps
       join pessoas p on ps.pessoa_id = p.id
       where ps.id = $1`,
      [fechamento.prestador_id]
    );

    const prestador = prestadores[0];

    // Notificar prestador
    if (prestador?.email) {
      const notificador = new Notificador();
      await notificador.enviar({
        canais: ['email'],
        destinatario: {
          email: prestador.email,
          nome: prestador.nome_completo,
        },
        template: {
          titulo: 'NFS-e Gerada com Sucesso',
          corpo:
            statusNosso === 'processada'
              ? `Sua NFS-e foi processada com sucesso pela prefeitura. Protocolo: ${evento.protocol}`
              : `Sua NFS-e foi emitida. Aguarde o processamento pela prefeitura.`,
          acaoUrl: evento.url,
          acaoTexto: 'Ver NFS-e',
        },
        variaveis: {
          prestador: prestador.nome_completo,
          protocolo: evento.protocol || '-',
          status: statusNosso,
        },
      });
    }

    return NextResponse.json({
      processado: true,
      nfseId: evento.nfseId,
      status: statusNosso,
      fechamentoId: fechamento.id,
    });
  } catch (erro) {
    console.error('Erro ao processar webhook NFS-e:', erro);
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : 'Erro desconhecido' },
      { status: 500 }
    );
  }
}
