/**
 * ============================================================================
 * Handler Centralizado: Webhooks do Asaas
 * ============================================================================
 * Contém toda a lógica de processamento de webhooks do Asaas.
 *
 * Funções:
 * - validarWebhookAsaas() -> verifica token e timestamp
 * - processarWebhookAsaas() -> roteia para handler correto
 * - processarPagamentoConfirmado()
 * - processarEstorno()
 */

import type { Pool } from 'pg';
import { NextResponse } from 'next/server';
import {
  interpretarWebhook,
  verificarTokenWebhook,
  WebhookInvalidoError,
  type EventoAsaasNormalizado,
} from '@/server/asaas/webhook';
import { logError } from '@/server/api/middleware';

/**
 * Valida o webhook do Asaas: token e timestamp
 */
export function validarWebhookAsaas(
  tokenRecebido: string | null,
  payload: unknown
): {
  valid: boolean;
  error?: string;
} {
  const tokenConfigurado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!tokenConfigurado) {
    return { valid: false, error: 'ASAAS_WEBHOOK_TOKEN não configurado' };
  }

  if (!verificarTokenWebhook(tokenRecebido, tokenConfigurado)) {
    return { valid: false, error: 'Token de webhook inválido' };
  }

  // Validar timestamp (máximo 5 minutos)
  if (typeof payload === 'object' && payload !== null) {
    const payloadObj = payload as Record<string, unknown>;
    const timestamp = payloadObj.timestamp;
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
      const agora = Math.floor(Date.now() / 1000);
      const diferenca = Math.abs(agora - ts);

      if (diferenca > 300) {
        return {
          valid: false,
          error: 'Webhook fora da janela de tempo permitida',
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Interpreta o payload do webhook e roteia para handler correto
 */
export async function processarWebhookAsaas(
  pool: Pool,
  payload: unknown
): Promise<{
  processado: boolean;
  motivo: string;
  [key: string]: unknown;
}> {
  let evento: EventoAsaasNormalizado;
  try {
    evento = interpretarWebhook(payload);
  } catch (erro) {
    if (erro instanceof WebhookInvalidoError) {
      return { processado: false, motivo: erro.message };
    }
    logError('Erro ao interpretar webhook do Asaas', erro);
    throw erro;
  }

  if (evento.tipo === 'pagamento_confirmado') {
    return processarPagamentoConfirmado(pool, evento);
  }

  if (evento.tipo === 'pagamento_estornado') {
    return processarEstorno(pool, evento);
  }

  if (evento.tipo === 'pagamento_atrasado') {
    // A régua de cobrança já detecta atraso
    return {
      processado: false,
      motivo: 'atraso já é detectado pela régua de cobrança, não pelo webhook',
    };
  }

  return {
    processado: false,
    motivo: `evento não tratado: ${evento.eventoOriginal}`,
  };
}

/**
 * Processa pagamento confirmado
 */
async function processarPagamentoConfirmado(
  pool: Pool,
  evento: Extract<EventoAsaasNormalizado, { tipo: 'pagamento_confirmado' }>
): Promise<{
  processado: boolean;
  motivo: string;
  [key: string]: unknown;
}> {
  try {
    const { rows } = await pool.query<{
      id: string;
      fatura_id: string;
      status: string;
    }>(
      `select id, fatura_id, status from cobrancas_asaas where asaas_id = $1`,
      [evento.cobrancaId]
    );

    if (rows.length === 0) {
      return {
        processado: false,
        motivo: 'cobranca_nao_encontrada',
        cobrancaId: evento.cobrancaId,
      };
    }

    const cobranca = rows[0];
    if (cobranca.status === 'pago') {
      // Idempotência
      return {
        processado: true,
        motivo: 'ja_processado_anteriormente',
        cobrancaId: cobranca.id,
      };
    }

    await pool.query(
      `update cobrancas_asaas set status = 'pago', data_pagamento = now() where id = $1`,
      [cobranca.id]
    );
    await pool.query(
      `update faturas set status = 'paga', atualizado_em = now() where id = $1`,
      [cobranca.fatura_id]
    );

    return {
      processado: true,
      cobrancaId: cobranca.id,
      faturaId: cobranca.fatura_id,
    };
  } catch (erro) {
    logError('Erro ao processar pagamento confirmado', erro);
    throw erro;
  }
}

/**
 * Processa estorno de pagamento
 */
async function processarEstorno(
  pool: Pool,
  evento: Extract<EventoAsaasNormalizado, { tipo: 'pagamento_estornado' }>
): Promise<{
  processado: boolean;
  motivo: string;
  [key: string]: unknown;
}> {
  try {
    const { rows } = await pool.query<{ id: string }>(
      `select id from cobrancas_asaas where asaas_id = $1`,
      [evento.cobrancaId]
    );

    if (rows.length === 0) {
      return {
        processado: false,
        motivo: 'cobranca_nao_encontrada',
        cobrancaId: evento.cobrancaId,
      };
    }

    await pool.query(`update cobrancas_asaas set status = 'cancelado' where id = $1`, [
      rows[0].id,
    ]);

    return {
      processado: true,
      motivo: 'cobranca_cancelada_revisar_fatura_manualmente',
      cobrancaId: rows[0].id,
    };
  } catch (erro) {
    logError('Erro ao processar estorno', erro);
    throw erro;
  }
}
