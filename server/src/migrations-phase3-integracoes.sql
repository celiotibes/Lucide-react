/**
 * Phase 3: inbox de eventos externos + vínculo de bot de captura rápida (Telegram).
 *
 * Diferente de migrations-phase2-auth.sql, este arquivo é executado em TODO boot
 * (ver database-init.ts), não só na primeira vez — todas as instruções aqui são
 * CREATE TABLE/INDEX IF NOT EXISTS, o mesmo padrão de idempotência do schema.sql
 * do cliente (garantirColunasAtualizadas). Isso permite adicionar tabelas novas sem
 * exigir apagar o banco já existente.
 *
 * Por quê isso vive no servidor e não em schema.sql: o servidor recebe eventos
 * assíncronos (webhook da Asaas, webhook/captura do bot do Telegram) mas NÃO tem
 * acesso ao banco local sql.js/IndexedDB do cliente — só o navegador do usuário tem.
 * A solução é um inbox server-side que o cliente consome (poll) quando abre o app,
 * atualizando seu próprio banco local (cobrancas_asaas.status, triagem, etc.) e then
 * marcando o evento como consumido aqui.
 */

-- Inbox genérico de eventos externos pendentes de consumo pelo cliente.
CREATE TABLE IF NOT EXISTS eventos_externos_pendentes (
  id            TEXT PRIMARY KEY,
  tipo          TEXT NOT NULL CHECK(tipo IN ('captura_telegram', 'webhook_asaas', 'webhook_pluggy')),
  usuario_id    TEXT REFERENCES usuarios(id),  -- NULL até resolvido (ex: captura_telegram antes do vínculo de chat_id ser identificado)
  payload_json  TEXT NOT NULL,                  -- corpo bruto do evento, serializado; o cliente decide como interpretar por `tipo`
  recebido_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumido     INTEGER NOT NULL DEFAULT 0 CHECK(consumido IN (0, 1)),
  consumido_em  DATETIME
);

CREATE INDEX IF NOT EXISTS idx_eventos_externos_usuario_consumido ON eventos_externos_pendentes(usuario_id, consumido, recebido_em);

-- Vínculo chat_id do Telegram <-> usuario_id, feito por código de uso único gerado no
-- app (fluxo: usuário pede o código na tela do bot, manda "/vincular CODIGO" pro bot,
-- o webhook do bot resolve o código e preenche chat_id + vinculado_em).
CREATE TABLE IF NOT EXISTS telegram_vinculos (
  id              TEXT PRIMARY KEY,
  usuario_id      TEXT NOT NULL REFERENCES usuarios(id),
  codigo_vinculo  TEXT NOT NULL UNIQUE,
  chat_id         TEXT UNIQUE,          -- NULL até o bot confirmar o vínculo
  vinculado_em    DATETIME,
  expira_em       DATETIME NOT NULL,    -- código não usado expira (evita vínculo por código velho/vazado)
  criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_vinculos_usuario ON telegram_vinculos(usuario_id);
