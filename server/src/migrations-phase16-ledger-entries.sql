/**
 * Phase 16: Sistema de Lançamentos Contábeis (Ledger Entries)
 *
 * Tabela ledger_entries: armazena lançamentos contábeis categorizados
 * para cálculo de DRE, fluxo de caixa e análises financeiras.
 *
 * Categorias:
 * - Receitas: receita, aluguel, honorario, extraordinaria
 * - Despesas: comissao, imposto, folha_pagamento, condominio, manutencao, juros
 *
 * Tipos: 'receita' ou 'despesa'
 * Valores sempre em centavos (DECIMAL com 2 casas decimais).
 *
 * Idempotente em boot (mesmo padrão das fases anteriores).
 */

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  data DATE NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('receita', 'despesa')),
  categoria TEXT NOT NULL CHECK(
    categoria IN (
      'receita',
      'aluguel',
      'honorario',
      'extraordinaria',
      'comissao',
      'imposto',
      'folha_pagamento',
      'condominio',
      'manutencao',
      'juros'
    )
  ),
  valor DECIMAL(12, 2) NOT NULL CHECK(valor > 0),
  descricao TEXT,
  referencia_externa TEXT, -- ID externo para rastreamento (ex: cobranca_id)
  usuario_id TEXT, -- Quem lançou a entrada

  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance de queries DRE e fluxo de caixa
CREATE INDEX IF NOT EXISTS idx_ledger_entries_data
  ON ledger_entries(data DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tipo
  ON ledger_entries(tipo);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_categoria
  ON ledger_entries(categoria);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_data_tipo
  ON ledger_entries(data DESC, tipo);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_data_categoria
  ON ledger_entries(data DESC, categoria);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_referencia
  ON ledger_entries(referencia_externa);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_usuario
  ON ledger_entries(usuario_id);

-- Índice para buscar período (usado em DRE, fluxo de caixa, etc)
CREATE INDEX IF NOT EXISTS idx_ledger_entries_periodo
  ON ledger_entries(data, tipo, categoria);
