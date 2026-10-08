/**
 * Fase 6: Sistema de DRE (Demonstração de Resultado do Exercício)
 * Opção B: Histórico gravado diariamente (1x/dia às 23:55)
 *
 * Tabela dre_periodos: armazena resultado do DRE calculado ao final de cada período
 * (mês/ano). Permite visualizar histórico de lucratividade e comparativos de períodos.
 *
 * Estrutura DRE:
 * - Receita Operacional: aluguel + honorário advocatício
 * - Receita Extraordinária: outras rendas
 * - Despesa Variável: comissões, tributos sobre receita
 * - Despesa Fixa: folha de pagamento, condomínio, manutenção, juros
 * - Lucro Bruto = Receita Operacional - Despesa Variável
 * - Lucro Líquido = Lucro Bruto - Despesa Fixa + Receita Extraordinária
 *
 * Idempotente em boot (mesmo padrão das fases anteriores).
 */
CREATE TABLE IF NOT EXISTS dre_periodos (
  id                        TEXT PRIMARY KEY,
  ano                       INTEGER NOT NULL,
  mes                       INTEGER NOT NULL CHECK(mes >= 1 AND mes <= 12),

  -- Receitas
  receita_aluguel           REAL DEFAULT 0 NOT NULL,
  receita_honorario         REAL DEFAULT 0 NOT NULL,
  receita_extraordinaria    REAL DEFAULT 0 NOT NULL,
  receita_total             REAL DEFAULT 0 NOT NULL,

  -- Despesas Variáveis (proporcionais à receita)
  despesa_comissoes         REAL DEFAULT 0 NOT NULL,
  despesa_impostos_receita  REAL DEFAULT 0 NOT NULL,
  despesa_variavel_total    REAL DEFAULT 0 NOT NULL,

  -- Lucro Bruto
  lucro_bruto               REAL DEFAULT 0 NOT NULL,

  -- Despesas Fixas (independentes de receita)
  despesa_folha_pagamento   REAL DEFAULT 0 NOT NULL,
  despesa_condominio        REAL DEFAULT 0 NOT NULL,
  despesa_manutencao        REAL DEFAULT 0 NOT NULL,
  despesa_juros             REAL DEFAULT 0 NOT NULL,
  despesa_fixa_total        REAL DEFAULT 0 NOT NULL,

  -- Resultado Final
  lucro_liquido             REAL DEFAULT 0 NOT NULL,

  -- Metadata
  calculado_em              DATETIME NOT NULL DEFAULT (datetime('now')),
  criado_em                 DATETIME NOT NULL DEFAULT (datetime('now')),
  atualizado_em             DATETIME NOT NULL DEFAULT (datetime('now')),

  UNIQUE (ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_dre_periodos_ano_mes ON dre_periodos(ano, mes DESC);
CREATE INDEX IF NOT EXISTS idx_dre_periodos_calculado ON dre_periodos(calculado_em DESC);
