-- ============================================================================
-- SCHEMA PARA INTEGRAÇÃO ASAAS - REEMBOLSOS E COBRANCAS
-- ============================================================================

-- ============================================================================
-- TABELAS DE REEMBOLSOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS asaas_reembolsos (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  valor DECIMAL(12, 2) NOT NULL CHECK(valor > 0),
  status TEXT NOT NULL CHECK(status IN ('pendente', 'processando', 'confirmado', 'rejeitado', 'cancelado')),
  data_solicitacao TEXT NOT NULL, -- ISO 8601 format
  data_confirmacao TEXT, -- ISO 8601 format, null se não confirmado
  motivo TEXT NOT NULL,
  numero_transacao_original TEXT NOT NULL,
  asaas_reembolso_id TEXT UNIQUE, -- ID retornado pelo Asaas
  descricao_erro TEXT, -- Descrição do erro se rejeitado

  CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asaas_reembolsos_usuario_id
  ON asaas_reembolsos(usuario_id);

CREATE INDEX IF NOT EXISTS idx_asaas_reembolsos_status
  ON asaas_reembolsos(status);

CREATE INDEX IF NOT EXISTS idx_asaas_reembolsos_data_solicitacao
  ON asaas_reembolsos(data_solicitacao);

CREATE INDEX IF NOT EXISTS idx_asaas_reembolsos_numero_transacao
  ON asaas_reembolsos(numero_transacao_original);

CREATE INDEX IF NOT EXISTS idx_asaas_reembolsos_asaas_id
  ON asaas_reembolsos(asaas_reembolso_id);


-- ============================================================================
-- TABELA DE AUDITORIA DE REEMBOLSOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS asaas_reembolsos_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reembolso_id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  acao TEXT NOT NULL, -- CRIACAO, ATUALIZACAO_STATUS, CANCELAMENTO, etc
  status_anterior TEXT, -- null se criação
  status_novo TEXT NOT NULL,
  data_acao TEXT NOT NULL, -- ISO 8601 format
  descricao TEXT,

  CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reembolso_id) REFERENCES asaas_reembolsos(id)
);

CREATE INDEX IF NOT EXISTS idx_asaas_reembolsos_historico_reembolso_id
  ON asaas_reembolsos_historico(reembolso_id);

CREATE INDEX IF NOT EXISTS idx_asaas_reembolsos_historico_data_acao
  ON asaas_reembolsos_historico(data_acao);


-- ============================================================================
-- TABELAS DE COBRANCA/BOLETOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS asaas_cobrancas (
  id TEXT PRIMARY KEY,
  aluguel_id TEXT NOT NULL,
  imovel_id TEXT NOT NULL,
  valor DECIMAL(12, 2) NOT NULL CHECK(valor > 0),
  data_vencimento TEXT NOT NULL, -- YYYY-MM-DD format
  status TEXT NOT NULL CHECK(status IN ('pendente', 'processando', 'aberta', 'paga', 'vencida', 'cancelada')),

  -- Dados do boleto
  numero_boleto TEXT,
  linha_digitavel TEXT,
  qr_code_pix TEXT,

  -- ID do Asaas
  asaas_cobranca_id TEXT UNIQUE, -- ID retornado pelo Asaas

  -- Dados de pagamento
  data_criacao TEXT NOT NULL, -- ISO 8601 format
  data_pagamento TEXT, -- ISO 8601 format, null se não pago
  valor_pago DECIMAL(12, 2), -- null se não pago
  tipo_pagamento TEXT CHECK(tipo_pagamento IS NULL OR tipo_pagamento IN ('boleto', 'pix', 'transferencia', 'cartao', 'dinheiro')),

  -- Referência externa para rastreamento
  referencia_externa TEXT,

  CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asaas_cobrancas_aluguel_id
  ON asaas_cobrancas(aluguel_id);

CREATE INDEX IF NOT EXISTS idx_asaas_cobrancas_imovel_id
  ON asaas_cobrancas(imovel_id);

CREATE INDEX IF NOT EXISTS idx_asaas_cobrancas_status
  ON asaas_cobrancas(status);

CREATE INDEX IF NOT EXISTS idx_asaas_cobrancas_data_vencimento
  ON asaas_cobrancas(data_vencimento);

CREATE INDEX IF NOT EXISTS idx_asaas_cobrancas_data_pagamento
  ON asaas_cobrancas(data_pagamento);

CREATE INDEX IF NOT EXISTS idx_asaas_cobrancas_asaas_id
  ON asaas_cobrancas(asaas_cobranca_id);

CREATE INDEX IF NOT EXISTS idx_asaas_cobrancas_referencia_externa
  ON asaas_cobrancas(referencia_externa);

-- Constraint: um boleto aberto por aluguel máximo
CREATE UNIQUE INDEX IF NOT EXISTS idx_asaas_cobrancas_aluguel_status
  ON asaas_cobrancas(aluguel_id, status)
  WHERE status IN ('pendente', 'processando', 'aberta');


-- ============================================================================
-- TABELA DE AUDITORIA DE COBRANCAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS asaas_cobrancas_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cobranca_id TEXT NOT NULL,
  aluguel_id TEXT NOT NULL,
  acao TEXT NOT NULL, -- CRIACAO, GERACAO_BOLETO, ATUALIZACAO_STATUS, PAGAMENTO_RECEBIDO, etc
  status_anterior TEXT, -- null se criação
  status_novo TEXT NOT NULL,
  data_acao TEXT NOT NULL, -- ISO 8601 format
  descricao TEXT,

  CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cobranca_id) REFERENCES asaas_cobrancas(id)
);

CREATE INDEX IF NOT EXISTS idx_asaas_cobrancas_historico_cobranca_id
  ON asaas_cobrancas_historico(cobranca_id);

CREATE INDEX IF NOT EXISTS idx_asaas_cobrancas_historico_aluguel_id
  ON asaas_cobrancas_historico(aluguel_id);

CREATE INDEX IF NOT EXISTS idx_asaas_cobrancas_historico_data_acao
  ON asaas_cobrancas_historico(data_acao);


-- ============================================================================
-- TABELA DE RECONCILIAÇÃO DE WEBHOOKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS asaas_webhooks_recebidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL, -- TRANSFER_RECEIVED, REFUND_PROCESSED, PAYMENT_RECEIVED, INVOICE_PAID, etc
  asaas_id TEXT, -- ID do recurso no Asaas
  payload TEXT NOT NULL, -- JSON com dados do webhook
  processado INTEGER DEFAULT 0, -- 1 se foi processado com sucesso
  erro TEXT, -- Descrição do erro se falhar
  tentativas INTEGER DEFAULT 1,

  CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
  PROCESSED_AT TEXT
);

CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_tipo
  ON asaas_webhooks_recebidos(tipo);

CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_asaas_id
  ON asaas_webhooks_recebidos(asaas_id);

CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_processado
  ON asaas_webhooks_recebidos(processado);


-- ============================================================================
-- VIEWS ÚTEIS
-- ============================================================================

-- View: Reembolsos com status detalhado
CREATE VIEW IF NOT EXISTS vw_asaas_reembolsos_resumo AS
SELECT
  r.id,
  r.usuario_id,
  r.valor,
  r.status,
  r.data_solicitacao,
  r.data_confirmacao,
  r.motivo,
  r.numero_transacao_original,
  CASE
    WHEN r.status = 'pendente' THEN 'Aguardando processamento'
    WHEN r.status = 'processando' THEN 'Sendo processado'
    WHEN r.status = 'confirmado' THEN 'Reembolso confirmado'
    WHEN r.status = 'rejeitado' THEN 'Reembolso rejeitado'
    WHEN r.status = 'cancelado' THEN 'Reembolso cancelado'
  END as status_descricao,
  CAST((julianday(COALESCE(r.data_confirmacao, 'now')) - julianday(r.data_solicitacao)) AS INTEGER) as dias_processamento
FROM asaas_reembolsos r;


-- View: Cobrancas com status detalhado
CREATE VIEW IF NOT EXISTS vw_asaas_cobrancas_resumo AS
SELECT
  c.id,
  c.aluguel_id,
  c.imovel_id,
  c.valor,
  c.data_vencimento,
  c.status,
  c.data_pagamento,
  c.valor_pago,
  CASE
    WHEN c.status = 'pendente' THEN 'Aguardando emissão de boleto'
    WHEN c.status = 'processando' THEN 'Gerando boleto'
    WHEN c.status = 'aberta' THEN 'Boleto aberto para pagamento'
    WHEN c.status = 'paga' THEN 'Pagamento recebido'
    WHEN c.status = 'vencida' THEN 'Boleto vencido'
    WHEN c.status = 'cancelada' THEN 'Boleto cancelado'
  END as status_descricao,
  CASE
    WHEN DATE(c.data_vencimento) < DATE('now') AND c.status != 'paga' AND c.status != 'cancelada' THEN 'VENCIDO'
    WHEN DATE(c.data_vencimento) = DATE('now') THEN 'HOJE'
    WHEN DATE(c.data_vencimento) BETWEEN DATE('now') AND DATE('now', '+7 days') THEN 'PROXIMO'
    ELSE 'FUTURO'
  END as tipo_prazo,
  CAST((julianday(c.data_vencimento) - julianday('now')) AS INTEGER) as dias_restantes
FROM asaas_cobrancas c;


-- View: Resumo financeiro por imóvel
CREATE VIEW IF NOT EXISTS vw_asaas_resumo_imovel AS
SELECT
  c.imovel_id,
  COUNT(CASE WHEN c.status IN ('pendente', 'processando', 'aberta') THEN 1 END) as cobrancas_abertas,
  COUNT(CASE WHEN c.status = 'paga' THEN 1 END) as cobrancas_pagas,
  COUNT(CASE WHEN c.status = 'vencida' THEN 1 END) as cobrancas_vencidas,
  COUNT(CASE WHEN c.status = 'cancelada' THEN 1 END) as cobrancas_canceladas,
  SUM(CASE WHEN c.status IN ('pendente', 'processando', 'aberta') THEN c.valor ELSE 0 END) as valor_aberto,
  SUM(CASE WHEN c.status = 'paga' THEN c.valor_pago ELSE 0 END) as valor_pago,
  SUM(CASE WHEN c.status = 'vencida' THEN c.valor ELSE 0 END) as valor_vencido
FROM asaas_cobrancas c
GROUP BY c.imovel_id;
