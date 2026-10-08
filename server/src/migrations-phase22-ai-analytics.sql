/**
 * Phase 22.20: Anthropic AI Integration — Tabela de Análises
 * Armazena resultados de análises de IA (categorização, anomalias, etc)
 * para auditoria, aprendizado e rastreamento de confiança
 *
 * Executado em todo boot (idempotente): CREATE TABLE IF NOT EXISTS
 */

CREATE TABLE IF NOT EXISTS ia_analises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identificação da transação ou recurso analisado
  transacao_id INTEGER,

  -- Tipo de análise realizada
  tipo_analise TEXT NOT NULL CHECK(tipo_analise IN (
    'categorization',      -- Sugestão de categoria contábil
    'anomaly_detection',   -- Detecção de anomalias
    'receipt_analysis',    -- Análise de recibo (OCR + IA)
    'cash_flow_analysis',  -- Análise de fluxo de caixa
    'financial_advice'     -- Recomendações financeiras
  )),

  -- Resultado da análise em JSON (estrutura varia por tipo)
  resultado JSON NOT NULL,

  -- Score de confiança (0-100)
  -- Usado para filtrar análises de baixa confiança
  confianca REAL,

  -- Tempo de execução em milissegundos
  -- Útil para monitoramento de performance
  tempo_execucao_ms INTEGER,

  -- Timestamps
  criado_em DATETIME DEFAULT (datetime('now')),
  atualizado_em DATETIME DEFAULT (datetime('now')),

  -- Constraints
  FOREIGN KEY (transacao_id) REFERENCES transacoes(id) ON DELETE CASCADE
);

-- Índices para performance nas queries comuns
CREATE INDEX IF NOT EXISTS idx_ia_analises_transacao_id
  ON ia_analises(transacao_id);

CREATE INDEX IF NOT EXISTS idx_ia_analises_tipo
  ON ia_analises(tipo_analise);

CREATE INDEX IF NOT EXISTS idx_ia_analises_confianca
  ON ia_analises(confianca);

CREATE INDEX IF NOT EXISTS idx_ia_analises_criado_em
  ON ia_analises(criado_em);

-- Índice composto para queries que filtram tipo + confiança
CREATE INDEX IF NOT EXISTS idx_ia_analises_tipo_confianca
  ON ia_analises(tipo_analise, confianca DESC);
