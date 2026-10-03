/**
 * Fase 4: inbox de códigos de vínculo de Telegram para CONTATOS EXTERNOS (locatário,
 * cliente da advocacia, prestador de serviço) — aplicada em TODO boot (idempotente,
 * mesmo padrão de migrations-phase3-integracoes.sql).
 *
 * Por que isso não é a mesma tabela que `telegram_vinculos` (fase 2/3): aquela liga
 * chat_id a um usuario_id (usuário DO SISTEMA, que o servidor conhece). Um contato
 * externo (locatário/cliente/prestador) é dado de NEGÓCIO que só existe no banco local
 * do cliente (sql.js) — o servidor não sabe, e não deve saber, a quem um código de
 * vínculo pertence. Por isso, quando o webhook do bot recebe "/vincular CODIGO" de um
 * chat que não é nenhum usuario_id conhecido, ele só enfileira {codigo, chatId} aqui,
 * sem tentar resolver — o CLIENTE, ao abrir o app e consumir este inbox, casa o código
 * com a sua própria tabela `vinculos_telegram_externos` (ver schema.sql) e then manda o
 * servidor confirmar a mensagem de volta para aquele chat_id.
 */
CREATE TABLE IF NOT EXISTS vinculos_externos_telegram_pendentes (
  id            TEXT PRIMARY KEY,
  codigo_vinculo TEXT NOT NULL,
  chat_id       TEXT NOT NULL,
  recebido_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumido     INTEGER NOT NULL DEFAULT 0 CHECK(consumido IN (0, 1)),
  consumido_em  DATETIME
);

CREATE INDEX IF NOT EXISTS idx_vinculos_externos_telegram_pendentes_consumido ON vinculos_externos_telegram_pendentes(consumido, recebido_em);
