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
-- Histórico de DRE (Demonstração de Resultado) por período (mês/ano)
-- =====================================================================
CREATE TABLE IF NOT EXISTS dre_periodos (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Período de referência
  ano                         INTEGER NOT NULL,
  periodo_mes                 DATE NOT NULL,

  -- Receitas (valores em R$)
  receita_total               REAL NOT NULL DEFAULT 0.0,
  receita_aluguel             REAL NOT NULL DEFAULT 0.0,
  receita_honorario           REAL NOT NULL DEFAULT 0.0,
  receita_extraordinaria      REAL NOT NULL DEFAULT 0.0,

  -- Despesas (valores em R$)
  despesa_total               REAL NOT NULL DEFAULT 0.0,
  despesa_folha               REAL NOT NULL DEFAULT 0.0,      -- Salários, encargos
  despesa_impostos            REAL NOT NULL DEFAULT 0.0,      -- IR, INSS, etc.
  despesa_condominio          REAL NOT NULL DEFAULT 0.0,
  despesa_manutencao          REAL NOT NULL DEFAULT 0.0,
  despesa_juros               REAL NOT NULL DEFAULT 0.0,
  despesa_outras              REAL NOT NULL DEFAULT 0.0,

  -- Resultado
  lucro_liquido               REAL NOT NULL DEFAULT 0.0,      -- receita_total - despesa_total

  -- Auditoria
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Unicidade: um registro por período (ano/mês)
  UNIQUE(ano, periodo_mes)
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_dre_periodos_ano_mes
  ON dre_periodos(ano, periodo_mes);
CREATE INDEX IF NOT EXISTS idx_dre_periodos_atualizado
  ON dre_periodos(atualizado_em DESC);


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
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
-- Rentabilidade por imóvel e período
-- =====================================================================
CREATE TABLE IF NOT EXISTS margens_propriedades_periodo (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Referência
  imovel_id                   INTEGER NOT NULL,                -- FK conceitual (servidor não persiste o imóvel)
  periodo_mes                 DATE NOT NULL,

  -- Financeiro
  receita_aluguel             REAL NOT NULL DEFAULT 0.0,
  despesa_total               REAL NOT NULL DEFAULT 0.0,

  -- KPI
  margem_percentual           REAL NOT NULL DEFAULT 0.0,      -- (receita_aluguel - despesa_total) / receita_aluguel * 100

  -- Auditoria
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Unicidade: um registro por (imóvel, período)
  UNIQUE(imovel_id, periodo_mes)
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_margens_propriedades_imovel
  ON margens_propriedades_periodo(imovel_id);
CREATE INDEX IF NOT EXISTS idx_margens_propriedades_periodo
  ON margens_propriedades_periodo(periodo_mes);
CREATE INDEX IF NOT EXISTS idx_margens_propriedades_margem
  ON margens_propriedades_periodo(margem_percentual);


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
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
-- Auditoria de alertas de anomalias detectadas
-- =====================================================================
CREATE TABLE IF NOT EXISTS alertas_anomalias_registrados (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Data e categoria
  data_alerta                 DATE NOT NULL,
  categoria                   TEXT NOT NULL,                  -- 'receita_aluguel', 'despesa_folha', 'fluxo_caixa', etc.

  -- Valor observado e limites
  valor                       REAL NOT NULL,
  limite_inferior             REAL,                           -- Limite inferior do intervalo de confiança
  limite_superior             REAL,                           -- Limite superior do intervalo de confiança

  -- Método de detecção
  metodo_deteccao             TEXT NOT NULL,                  -- '2sigma', 'iqr', 'p90', etc.
  descricao                   TEXT,                           -- Descrição legível para o usuário

  -- Status de resolução
  resolvido                   INTEGER NOT NULL DEFAULT 0,     -- 0=pendente, 1=resolvido
  resolvido_em                DATETIME,
  observacoes_resolucao       TEXT,

  -- Auditoria
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_alertas_data
  ON alertas_anomalias_registrados(data_alerta DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_categoria
  ON alertas_anomalias_registrados(categoria);
CREATE INDEX IF NOT EXISTS idx_alertas_status
  ON alertas_anomalias_registrados(resolvido);
CREATE INDEX IF NOT EXISTS idx_alertas_data_categoria
  ON alertas_anomalias_registrados(data_alerta DESC, categoria);


-- =====================================================================
-- Tabela 6: PAGAMENTOS_PIX_SOLICITADOS
-- Fase 2: PIX proativo (solicitar pagamento via QR code)
-- =====================================================================
CREATE TABLE IF NOT EXISTS pagamentos_pix_solicitados (
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
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmado_em               DATETIME,
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Unicidade: evita duplicação por retry do mesmo contrato no mesmo dia
  -- (um débito por contrato por data de criação)
  UNIQUE(usuario_id, contrato_id, criado_em)
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_usuario
  ON pagamentos_pix_solicitados(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_contrato
  ON pagamentos_pix_solicitados(contrato_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_status
  ON pagamentos_pix_solicitados(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_asaas_id
  ON pagamentos_pix_solicitados(asaas_charge_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pix_criado
  ON pagamentos_pix_solicitados(criado_em DESC);


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
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
