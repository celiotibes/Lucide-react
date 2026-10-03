/**
 * Fase 9: Tabelas para PAGAMENTOS PIX PROATIVOS (Outgoing)
 *
 * Implementa suporte a iniciação de pagamentos PIX via Asaas Payments API.
 * Permite enviar dinheiro a fornecedores/prestadores com rastreamento e conciliação.
 *
 * Diferente da tabela de "pagamentos_pix_recebidos" (Phase 6), estas tabelas
 * são para pagamentos SAINDO da empresa.
 *
 * Aplicada em TODO boot (idempotente — todas as tabelas usam IF NOT EXISTS).
 */

-- =====================================================================
-- Tabela 1: PAGAMENTOS_PIX_SOLICITADOS (Outgoing/Initiated)
-- Registro de pagamentos PIX que o sistema ENVIA
-- =====================================================================
CREATE TABLE IF NOT EXISTS pagamentos_pix_solicitados (
  id                          TEXT PRIMARY KEY,                -- UUID gerado

  -- Dados do beneficiário (quem RECEBE o pagamento)
  beneficiario_id             TEXT NOT NULL,                  -- ID único do fornecedor/prestador
  beneficiario_nome           TEXT NOT NULL,
  beneficiario_cpf_cnpj       TEXT NOT NULL,

  -- Pagamento
  valor                       REAL NOT NULL,                  -- em R$
  descricao                   TEXT,                           -- Ex: "Pagamento de serviços - Contrato #123"

  -- Status do pagamento
  status                      TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED

  -- Integração Asaas
  asaas_payment_id            TEXT,                           -- ID do pagamento na Asaas (recebido ao criar)

  -- Dados da chave PIX
  tipo_chave_pix              TEXT NOT NULL,                  -- CPF, CNPJ, EMAIL, TELEFONE, ALEATORIO
  chave_pix_value             TEXT,                           -- Valor da chave (ex: "12345678900", "email@example.com")
  qr_code                     TEXT,                           -- QR code para visualização (sandbox) / link

  -- Auditoria
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Índices para queries frequentes
  UNIQUE(beneficiario_id, valor, criado_em)  -- Evita duplicação por retry no mesmo dia
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_status
  ON pagamentos_pix_solicitados(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_beneficiario
  ON pagamentos_pix_solicitados(beneficiario_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_asaas_id
  ON pagamentos_pix_solicitados(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_criado
  ON pagamentos_pix_solicitados(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_status_criado
  ON pagamentos_pix_solicitados(status, criado_em DESC);


-- =====================================================================
-- Tabela 2: PAGAMENTOS_PIX_HISTORICO
-- Auditoria: todas as mudanças de status
-- =====================================================================
CREATE TABLE IF NOT EXISTS pagamentos_pix_historico (
  id                          TEXT PRIMARY KEY,                -- UUID

  -- Referência ao pagamento
  pagamento_id                TEXT NOT NULL,                  -- FK para pagamentos_pix_solicitados

  -- Mudança de status
  status_anterior             TEXT,                           -- NULL se é o primeiro registro
  status_novo                 TEXT NOT NULL,

  -- Webhook (quando aplicável)
  webhook_timestamp           DATETIME,                       -- Timestamp do evento no Asaas

  -- Auditoria
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (pagamento_id) REFERENCES pagamentos_pix_solicitados(id)
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_hist_pagamento
  ON pagamentos_pix_historico(pagamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_hist_criado
  ON pagamentos_pix_historico(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_hist_status_novo
  ON pagamentos_pix_historico(status_novo);
