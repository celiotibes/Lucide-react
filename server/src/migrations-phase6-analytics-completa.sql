/**
 * Fase 6: tabelas de analytics + relatórios do Lucide-React
 *
 * Complementa o banco com históricos e auditoria para:
 * - DRE (Demonstração de Resultado do Exercício)
 * - Fluxo de caixa
 * - Rentabilidade por imóvel
 * - Categorização automática de transações
 * - Detecção de anomalias
 * - PIX proativo (Fase 2)
 * - Auditoria de conciliação automática
 *
 * Aplicada em TODO boot (idempotente — todas as tabelas usam IF NOT EXISTS).
 * Cada tabela é independente; FOREIGN KEYs opcionais respeitam a arquitetura
 * "servidor não persiste dados de negócio do cliente", só metadados/auditoria.
 */

-- =====================================================================
-- Tabela 1: DRE_PERIODOS
-- NOTA: Definição movida para migrations-phase6-relatorios-dre.sql
-- Ela está em arquivo separado com a estrutura correta (ano, mes)
-- =====================================================================
-- (Tabela criada por migrations-phase6-relatorios-dre.sql)


-- =====================================================================
-- Tabela 2: FLUXO_PERIODOS
-- Histórico de fluxo de caixa por data/categoria
-- =====================================================================
CREATE TABLE IF NOT EXISTS fluxo_periodos (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Período
  data                        DATE NOT NULL,
  categoria                   TEXT NOT NULL,                   -- 'aluguel', 'honorario', 'extraordinaria', 'despesa_operacional', etc.

  -- Saldos
  saldo_anterior              REAL NOT NULL DEFAULT 0.0,
  saldo_atual                 REAL NOT NULL DEFAULT 0.0,

  -- Movimentação do dia
  entradas_dia                REAL NOT NULL DEFAULT 0.0,
  saidas_dia                  REAL NOT NULL DEFAULT 0.0,

  -- Auditoria
  atualizado_em               DATETIME NOT NULL DEFAULT (datetime('now')),
  criado_em                   DATETIME NOT NULL DEFAULT (datetime('now')),

  -- Unicidade: um registro por (data, categoria)
  UNIQUE(data, categoria)
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_fluxo_periodos_data
  ON fluxo_periodos(data DESC);
CREATE INDEX IF NOT EXISTS idx_fluxo_periodos_categoria
  ON fluxo_periodos(categoria);
CREATE INDEX IF NOT EXISTS idx_fluxo_periodos_data_categoria
  ON fluxo_periodos(data DESC, categoria);


-- =====================================================================
-- Tabela 3: MARGENS_PROPRIEDADES_PERIODO
-- NOTA: Definição movida para migrations-phase7-margens-propriedades.sql
-- Ela está em arquivo separado com a estrutura correta (periodo, ano, mes, imovel_id)
-- =====================================================================
-- (Tabela criada por migrations-phase7-margens-propriedades.sql)


-- =====================================================================
-- Tabela 4: CATEGORIAS_TRANSACOES_ASAAS
-- Mapeamento de descrições de transação → categoria (ML/banco de dados)
-- =====================================================================
CREATE TABLE IF NOT EXISTS categorias_transacoes_asaas (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Descrição original (chave)
  descricao_original          TEXT NOT NULL UNIQUE,           -- ex: "PAGTO AGUA - CPFL ENERGIA"

  -- Classificação
  categoria_sugerida          TEXT NOT NULL,                  -- 'aluguel', 'honorario', 'despesa_agua', 'despesa_energia', etc.
  confianca_percentual        INTEGER NOT NULL DEFAULT 0,     -- 0-100: grau de certeza da sugestão

  -- Feedback do usuário (audit trail)
  categoria_confirmada        TEXT,                           -- Pode diferir de `categoria_sugerida` se usuário corrigiu
  confirmado_em               DATETIME,

  -- Estatísticas
  uso_count                   INTEGER NOT NULL DEFAULT 1,     -- Quantas vezes esta regra foi usada

  -- Auditoria
  atualizado_em               DATETIME NOT NULL DEFAULT (datetime('now')),
  criado_em                   DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_categorias_descricao
  ON categorias_transacoes_asaas(descricao_original);
CREATE INDEX IF NOT EXISTS idx_categorias_sugerida
  ON categorias_transacoes_asaas(categoria_sugerida);
CREATE INDEX IF NOT EXISTS idx_categorias_confianca
  ON categorias_transacoes_asaas(confianca_percentual DESC);


-- =====================================================================
-- Tabela 5: ALERTAS_ANOMALIAS_REGISTRADOS
-- NOTA: Definição já existe em migrations-phase4.1-anomalias.sql
-- com estrutura diferente (transacao_id, severidade, etc.)
-- =====================================================================
-- (Tabela criada por migrations-phase4.1-anomalias.sql)
-- Removido: conflito de esquema — a versão em phase4.1 é a correta


-- =====================================================================
-- Tabela 6: PAGAMENTOS_PIX_RECEBIDOS (Incoming PIX)
-- Fase 6: PIX recebido do cliente (pagamento de contrato)
-- NOTA: Tabela renomeada de pagamentos_pix_solicitados para evitar conflito
-- com a tabela de pagamentos ENVIADOS (fase 9: pagamentos_pix_solicitados outgoing)
-- =====================================================================
CREATE TABLE IF NOT EXISTS pagamentos_pix_recebidos (
  id                          TEXT PRIMARY KEY,                -- UUID gerado pelo cliente/servidor

  -- Referência
  usuario_id                  INTEGER NOT NULL,                -- FK conceitual
  contrato_id                 INTEGER NOT NULL,                -- FK conceitual

  -- Valor e status
  valor                       REAL NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'confirmado', 'falha', 'expirado'

  -- Integração Asaas
  asaas_charge_id             TEXT,                           -- ID da cobrança no Asaas
  asaas_payment_id            TEXT,                           -- ID do pagamento (se confirmado)

  -- PIX
  pix_qrcode                  TEXT,                           -- QR code dinâmico (string ou base64)
  pix_txid                    TEXT,                           -- TxId do Pix (transação única)

  -- Webhook
  webhook_recebido_em         DATETIME,                       -- Timestamp do webhook de confirmação

  -- Auditoria
  criado_em                   DATETIME NOT NULL DEFAULT (datetime('now')),
  confirmado_em               DATETIME,
  atualizado_em               DATETIME NOT NULL DEFAULT (datetime('now')),

  -- Unicidade: evita duplicação por retry do mesmo contrato no mesmo dia
  -- (um débito por contrato por data de criação)
  UNIQUE(usuario_id, contrato_id, criado_em)
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_recebidos_usuario
  ON pagamentos_pix_recebidos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_recebidos_contrato
  ON pagamentos_pix_recebidos(contrato_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_recebidos_status
  ON pagamentos_pix_recebidos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_recebidos_asaas_id
  ON pagamentos_pix_recebidos(asaas_charge_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_recebidos_criado
  ON pagamentos_pix_recebidos(criado_em DESC);


-- =====================================================================
-- Tabela 7: AUDIT_RECONCILIACAO_PIX
-- Auditoria de conciliação automática: Asaas ↔ OFX
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_reconciliacao_pix (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Referências
  asaas_charge_id             TEXT NOT NULL UNIQUE,           -- ID da cobrança no Asaas
  transacao_ofx_id            INTEGER,                        -- FK conceitual (transação no banco)

  -- Status da compatibilidade
  status_compatibilidade      TEXT NOT NULL DEFAULT 'pendente_aprovacao', -- 'casado' (matched), 'discrepancia', 'pendente_aprovacao'

  -- Valores
  valor_asaas                 REAL NOT NULL,
  valor_ofx                   REAL,
  diferenca                   REAL,                           -- valor_asaas - valor_ofx (para 'discrepancia')

  -- Datas de transação (auxiliar para matching)
  data_asaas                  DATE NOT NULL,
  data_ofx                    DATE,

  -- Resultado
  reconciliado_em             DATETIME,
  observacoes                 TEXT,                           -- Notas sobre discrepâncias ou razão do casamento

  -- Auditoria
  atualizado_em               DATETIME NOT NULL DEFAULT (datetime('now')),
  criado_em                   DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_reconciliacao_asaas_id
  ON audit_reconciliacao_pix(asaas_charge_id);
CREATE INDEX IF NOT EXISTS idx_reconciliacao_status
  ON audit_reconciliacao_pix(status_compatibilidade);
CREATE INDEX IF NOT EXISTS idx_reconciliacao_data
  ON audit_reconciliacao_pix(data_asaas DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliacao_reconciliado
  ON audit_reconciliacao_pix(reconciliado_em DESC);
