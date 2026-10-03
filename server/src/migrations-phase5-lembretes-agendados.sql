/**
 * Fase 5: agenda de lembretes de vencimento, para disparo em horário real mesmo com o
 * app fechado — aplicada em TODO boot (idempotente, mesmo padrão das fases 3/4).
 *
 * Por quê isto existe: `lembretesVencimento.ts` (cliente) só dispara quando alguém abre
 * o app (sem acesso ao banco local, o servidor não pode calcular vencimento por si só).
 * A solução: o CLIENTE sincroniza aqui, com alguma antecedência, os lembretes futuros já
 * RESOLVIDOS (destinatário + mensagem prontos, um por canal) — o servidor só precisa
 * checar periodicamente `data_disparo_prevista <= hoje AND status = 'pendente'` e enviar,
 * sem nunca tocar no banco de negócio do cliente. Isso NÃO elimina a necessidade de abrir
 * o app de vez em quando (para sincronizar o que ainda não foi sincronizado), mas faz o
 * disparo em si acontecer no dia certo, não só na próxima vez que o app abrir.
 *
 * Uma linha por (origem, tipo de lembrete, CANAL) — mesmo padrão de granularidade de
 * `notificacoes_enviadas` no cliente (uma linha por canal, não uma linha com 3 campos de
 * destinatário).
 */
CREATE TABLE IF NOT EXISTS lembretes_agendados (
  id                      TEXT PRIMARY KEY,
  origem_tipo             TEXT NOT NULL CHECK(origem_tipo IN ('lembrete_aluguel', 'lembrete_honorario')),
  origem_id               INTEGER NOT NULL,      -- id da competência/honorário NO BANCO DO CLIENTE — só informativo, o servidor nunca resolve isso de volta
  tipo_lembrete           TEXT NOT NULL CHECK(tipo_lembrete IN ('2_dias_antes', 'no_dia')),
  canal                   TEXT NOT NULL CHECK(canal IN ('email', 'whatsapp', 'telegram')),
  destinatario            TEXT NOT NULL,
  assunto                 TEXT,
  mensagem                TEXT NOT NULL,
  data_disparo_prevista   DATE NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'enviado', 'falha', 'cancelado')),
  erro_mensagem           TEXT,
  enviado_em              DATETIME,
  criado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (origem_tipo, origem_id, tipo_lembrete, canal)
);

CREATE INDEX IF NOT EXISTS idx_lembretes_agendados_disparo ON lembretes_agendados(status, data_disparo_prevista);
