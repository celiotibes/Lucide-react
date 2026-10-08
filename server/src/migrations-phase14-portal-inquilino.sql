/**
 * Phase 14: Espelho de leitura do portal do inquilino
 *
 * A verdade contábil (contrato, competências, razão) continua SÓ no banco do dono (sql.js no navegador).
 * Estas tabelas são uma VITRINE somente-leitura, publicada pelo app do dono via POST /api/portal/publicar,
 * para que o inquilino consulte o que é dele sem acesso ao banco local. Nada aqui é lido de volta pelo
 * app do dono, e nenhum lançamento contábil nasce daqui.
 *
 * Minimização (LGPD): só o que o inquilino precisa ver — apelido do imóvel (não o endereço completo),
 * valor, vencimento, vigência e as cobranças. NÃO há CPF/CNPJ, e-mail, telefone, nome de terceiros,
 * valores de caução, multas/juros nem dados do dono. Valores em centavos inteiros (sem float).
 *
 * Posse: a leitura exige, além de `usuario_id`, uma concessão ativa em `acl_recursos`
 * (tipo 'contrato', recurso_id = contrato_ref). Idempotente (IF NOT EXISTS).
 */

CREATE TABLE IF NOT EXISTS portal_inquilino_contratos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT NOT NULL,
  contrato_ref TEXT NOT NULL,
  imovel_apelido TEXT NOT NULL,
  valor_aluguel_centavos INTEGER NOT NULL CHECK(valor_aluguel_centavos >= 0),
  dia_vencimento INTEGER CHECK(dia_vencimento IS NULL OR dia_vencimento BETWEEN 1 AND 31),
  data_inicio TEXT NOT NULL,
  data_fim TEXT,
  versao INTEGER NOT NULL CHECK(versao >= 1),
  conteudo_hash TEXT NOT NULL,
  publicado_por TEXT,
  publicado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  UNIQUE(contrato_ref)
);

CREATE INDEX IF NOT EXISTS idx_portal_contratos_usuario
  ON portal_inquilino_contratos(usuario_id);

CREATE TABLE IF NOT EXISTS portal_inquilino_cobrancas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contrato_ref TEXT NOT NULL,
  cobranca_ref TEXT NOT NULL,
  competencia TEXT NOT NULL,          -- YYYY-MM
  vencimento TEXT NOT NULL,           -- YYYY-MM-DD
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos >= 0),
  status TEXT NOT NULL CHECK(status IN ('pendente', 'paga', 'vencida', 'cancelada')),
  data_pagamento TEXT,
  FOREIGN KEY(contrato_ref) REFERENCES portal_inquilino_contratos(contrato_ref) ON DELETE CASCADE,
  UNIQUE(contrato_ref, cobranca_ref)
);

CREATE INDEX IF NOT EXISTS idx_portal_cobrancas_contrato_venc
  ON portal_inquilino_cobrancas(contrato_ref, vencimento);
