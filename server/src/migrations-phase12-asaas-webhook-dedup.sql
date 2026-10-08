/**
 * Phase 12: Webhook Asaas Idempotência e Segurança
 *
 * Adiciona:
 * 1. Tabela `asaas_webhook_eventos` para deduplicação de webhooks
 *    - Rastreia cada evento único (por ID da Asaas)
 *    - Evita reprocessamento em reentregas
 *    - Hash do payload para auditoria
 * 2. Índice para busca rápida por ID do evento
 * 3. Índice temporal para limpeza de eventos antigos
 *
 * Segurança (SEC-011B):
 * - Token de webhook validado com timing-safe comparison (validateTokenSafely)
 * - Validação obrigatória de campos: event e payment.id
 * - INSERT OR IGNORE garante idempotência mesmo com concorrência
 *
 * Migração idempotente — usa IF NOT EXISTS.
 */

-- ============================================================
-- TABELA DE DEDUPLICAÇÃO WEBHOOK ASAAS
-- ============================================================

CREATE TABLE IF NOT EXISTS asaas_webhook_eventos (
  id TEXT PRIMARY KEY,                      -- ID da linha (gerado no código)
  id_evento_asaas TEXT NOT NULL UNIQUE,    -- ID único do evento na Asaas (payment.id)
  tipo TEXT NOT NULL,                       -- Tipo do evento (PAYMENT_RECEIVED, PAYMENT_CONFIRMED, etc.)
  payment_id TEXT NOT NULL,                 -- ID da cobrança no Asaas
  payload_hash TEXT,                        -- SHA256 do payload para auditoria
  recebido_em TEXT NOT NULL DEFAULT (datetime('now')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índice para busca rápida por ID do evento (chave de deduplicação)
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_eventos_id_asaas
  ON asaas_webhook_eventos(id_evento_asaas);

-- Índice para limpeza temporal de eventos antigos
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_eventos_criado
  ON asaas_webhook_eventos(criado_em DESC);

-- Índice para buscar eventos por tipo (útil para debugging)
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_eventos_tipo
  ON asaas_webhook_eventos(tipo);
