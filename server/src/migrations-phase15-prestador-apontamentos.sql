/**
 * Phase 15: Caixa de entrada de apontamentos do prestador (lado servidor da fila offline do PWA)
 *
 * O prestador NÃO grava no razão. Esta tabela só RECEBE o apontamento enviado pelo app do campo
 * (src/domain/apontamentos/filaOffline.ts) e o dono confere depois; a integração ao ledger fica fora.
 *
 * Idempotência: UNIQUE(usuario_id, uuid_cliente). `conteudo_hash` (sha256 do conteúdo canônico) separa
 * reenvio idêntico (200, mesmo id) de conteúdo diferente para o mesmo uuid (409).
 *
 * Minimização (LGPD): sem observações livres, sem geolocalização, sem nome/documento do prestador (a
 * identidade vem da sessão: usuario_id). Valor em centavos inteiros e duração em minutos inteiros.
 * Anexos: metadados (nome sanitizado, tipo MIME, tamanho, sha256) + conteúdo em BLOB (limite de 5 MB
 * por arquivo imposto na rota e aqui por CHECK). Idempotente (IF NOT EXISTS).
 */

CREATE TABLE IF NOT EXISTS prestador_apontamentos_recebidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid_cliente TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('servico', 'vistoria')),
  imovel_ref TEXT NOT NULL,
  servico TEXT NOT NULL,
  data_servico TEXT NOT NULL,                       -- YYYY-MM-DD
  horas_minutos INTEGER CHECK(horas_minutos IS NULL OR horas_minutos BETWEEN 1 AND 1440),
  valor_centavos INTEGER CHECK(valor_centavos IS NULL OR valor_centavos >= 0),
  conteudo_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recebido' CHECK(status IN ('recebido', 'conferido', 'rejeitado')),
  recebido_em TEXT NOT NULL DEFAULT (datetime('now')),
  conferido_por TEXT,
  conferido_em TEXT,
  motivo_rejeicao TEXT,
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  UNIQUE(usuario_id, uuid_cliente)
);

CREATE INDEX IF NOT EXISTS idx_prestador_apont_usuario
  ON prestador_apontamentos_recebidos(usuario_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_prestador_apont_status
  ON prestador_apontamentos_recebidos(status, recebido_em);

CREATE TABLE IF NOT EXISTS prestador_apontamento_anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apontamento_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL CHECK(tamanho BETWEEN 1 AND 5242880),
  sha256 TEXT NOT NULL,
  conteudo BLOB NOT NULL,
  FOREIGN KEY(apontamento_id) REFERENCES prestador_apontamentos_recebidos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prestador_anexos_apont
  ON prestador_apontamento_anexos(apontamento_id);
