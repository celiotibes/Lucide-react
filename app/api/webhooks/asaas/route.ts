// Recebe o webhook do Asaas e liga o parser (server/asaas/webhook.ts) ao
// banco pela primeira vez — até aqui `interpretarWebhook`/
// `verificarTokenWebhook` existiam testados isoladamente, mas nada os
// chamava de verdade (docs/17-pipeline-recebimento.md).
//
// Sempre responde 200 quando o evento foi reconhecido e processado (ou
// deliberadamente não-processado, como atraso — ver abaixo), mesmo quando
// não há ação a tomar — é assim que se evita o Asaas entrar num loop de
// retry por um caso que não é erro nosso. Só autenticação/formato inválido
// vira 401/400/500 de verdade.

import { NextRequest, NextResponse } from 'next/server';
import type { Pool } from 'pg';
import { obterPool } from '@/server/integracao/db';
import {
  interpretarWebhook,
  verificarTokenWebhook,
  WebhookInvalidoError,
  type EventoAsaasNormalizado,
} from '@/server/asaas/webhook';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const tokenConfigurado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!tokenConfigurado) {
    return NextResponse.json({ erro: 'ASAAS_WEBHOOK_TOKEN não configurado no ambiente.' }, { status: 500 });
  }

  const tokenRecebido = request.headers.get('asaas-access-token');
  if (!verificarTokenWebhook(tokenRecebido, tokenConfigurado)) {
    return NextResponse.json({ erro: 'Token de webhook inválido.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ erro: 'Corpo da requisição não é JSON válido.' }, { status: 400 });
  }

  let evento: EventoAsaasNormalizado;
  try {
    evento = interpretarWebhook(payload);
  } catch (erro) {
    if (erro instanceof WebhookInvalidoError) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    throw erro;
  }

  const pool = obterPool();

  if (evento.tipo === 'pagamento_confirmado') {
    return processarPagamentoConfirmado(pool, evento);
  }
  if (evento.tipo === 'pagamento_estornado') {
    return processarEstorno(pool, evento);
  }
  if (evento.tipo === 'pagamento_atrasado') {
    // A régua de cobrança (server/integracao/reguaCobranca.ts) já detecta
    // atraso varrendo `faturas.vencimento` — não depende do Asaas avisar.
    // Reconhecido (200), não vira "ignorado", mas não há ação aqui.
    return NextResponse.json({
      processado: false,
      motivo: 'atraso já é detectado pela régua de cobrança, não pelo webhook',
    });
  }

  return NextResponse.json({ processado: false, motivo: `evento não tratado: ${evento.eventoOriginal}` });
}

async function processarPagamentoConfirmado(
  pool: Pool,
  evento: Extract<EventoAsaasNormalizado, { tipo: 'pagamento_confirmado' }>,
): Promise<NextResponse> {
  const { rows } = await pool.query<{ id: string; fatura_id: string; status: string }>(
    `select id, fatura_id, status from cobrancas_asaas where asaas_id = $1`,
    [evento.cobrancaId],
  );

  if (rows.length === 0) {
    // Cobrança não emitida por nós (ou emitida antes deste pipeline
    // existir) — não inventa uma fatura para associar; fica sinalizado
    // para revisão manual, não falha o webhook.
    return NextResponse.json({ processado: false, motivo: 'cobranca_nao_encontrada', cobrancaId: evento.cobrancaId });
  }

  const cobranca = rows[0];
  if (cobranca.status === 'pago') {
    // Idempotência: o Asaas pode reenviar o mesmo evento (retry deles).
    return NextResponse.json({ processado: true, motivo: 'ja_processado_anteriormente', cobrancaId: cobranca.id });
  }

  await pool.query(`update cobrancas_asaas set status = 'pago', data_pagamento = now() where id = $1`, [cobranca.id]);
  await pool.query(`update faturas set status = 'paga', atualizado_em = now() where id = $1`, [cobranca.fatura_id]);

  return NextResponse.json({ processado: true, cobrancaId: cobranca.id, faturaId: cobranca.fatura_id });
}

async function processarEstorno(
  pool: Pool,
  evento: Extract<EventoAsaasNormalizado, { tipo: 'pagamento_estornado' }>,
): Promise<NextResponse> {
  const { rows } = await pool.query<{ id: string }>(`select id from cobrancas_asaas where asaas_id = $1`, [
    evento.cobrancaId,
  ]);

  if (rows.length === 0) {
    return NextResponse.json({ processado: false, motivo: 'cobranca_nao_encontrada', cobrancaId: evento.cobrancaId });
  }

  await pool.query(`update cobrancas_asaas set status = 'cancelado' where id = $1`, [rows[0].id]);

  // Deliberadamente NÃO mexe em `faturas.status`: não existe um status
  // "estornada" no enum (aberta/paga/atrasada/cancelada/renegociada), e
  // inventar um sem confirmação de como a operação trata estorno seria a
  // mesma classe de erro do pró-rata original (docs/10) — supor a regra
  // em vez de perguntar. Fica sinalizado para revisão manual.
  return NextResponse.json({
    processado: true,
    motivo: 'cobranca_cancelada_revisar_fatura_manualmente',
    cobrancaId: rows[0].id,
  });
}
