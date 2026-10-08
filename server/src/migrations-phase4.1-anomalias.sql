/**
 * Phase 4.1: Sistema de Alertas de Anomalia em Fluxo de Caixa
 *
 * Implementa detecção automática de transações anormais usando 3 métodos estatísticos:
 * 1. 2-Sigma (Desvio Padrão) — detecta outliers extremos (z-score > 2)
 * 2. IQR (Interquartile Range) — detecta anomalias relativas (Q3 + 1.5×IQR)
 * 3. Percentile (P90/P95) — detecta comportamentos muito incomuns
 *
 * Opções mistas: votação/consenso de métodos (2+ disparados = alerta crítico)
 *
 * Tabelas:
 * - alertas_anomalias_registrados: histórico de alertas gerados
 * - cache_metricas_anomalias: cache de métricas estatísticas (recomputa 1x/dia)
 */

-- ============================================================
-- 1. TABELA DE ALERTAS DE ANOMALIA (histórico)
-- ============================================================

CREATE TABLE IF NOT EXISTS alertas_anomalias_registrados (
  id TEXT PRIMARY KEY DEFAULT lower(hex(randomblob(16))),
  transacao_id TEXT NOT NULL,
  usuario_id TEXT,                           -- FK para usuarios.id (NULL até resolvido)
  severidade TEXT NOT NULL DEFAULT 'media'
    CHECK(severidade IN ('baixa', 'media', 'critica')),
  confianca INTEGER NOT NULL CHECK(confianca >= 0 AND confianca <= 100),

  -- Quais métodos dispararam (comma-separated: "sigma_2,iqr,percentil")
  metodos_dispararam TEXT NOT NULL,

  -- Scores de cada método (usado para votação/análise)
  z_score REAL,                              -- 2-Sigma: z-score value
  z_score_limite REAL,                       -- 2-Sigma: limite (média + 2×σ)

  iqr_valor REAL,                            -- IQR: valor da transação
  iqr_limite REAL,                           -- IQR: limite (Q3 + 1.5×IQR)

  percentil_valor REAL,                      -- Percentile: valor da transação
  percentil_95 REAL,                         -- Percentile: P95

  -- Descricao legível do alerta para dashboard/email
  descricao TEXT,

  -- Auditoria: foi o alerta revisado por alguém?
  revisado INTEGER NOT NULL DEFAULT 0 CHECK(revisado IN (0, 1)),
  revisado_por TEXT,                         -- FK para usuarios.id
  revisado_em DATETIME,
  motivo_revisao TEXT,                       -- ex: "falso positivo", "confirmado fraude"

  criado_em DATETIME NOT NULL DEFAULT (datetime('now')),
  atualizado_em DATETIME,

  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY(revisado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_alertas_anomalias_transacao
  ON alertas_anomalias_registrados(transacao_id);

CREATE INDEX IF NOT EXISTS idx_alertas_anomalias_usuario
  ON alertas_anomalias_registrados(usuario_id);

CREATE INDEX IF NOT EXISTS idx_alertas_anomalias_severidade
  ON alertas_anomalias_registrados(severidade);

CREATE INDEX IF NOT EXISTS idx_alertas_anomalias_criado_desc
  ON alertas_anomalias_registrados(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_alertas_anomalias_severidade_criado
  ON alertas_anomalias_registrados(severidade, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_alertas_anomalias_revisado
  ON alertas_anomalias_registrados(revisado)
  WHERE revisado = 0;

-- ============================================================
-- 2. CACHE DE MÉTRICAS ESTATÍSTICAS (recomputa 1x/dia)
-- ============================================================

CREATE TABLE IF NOT EXISTS cache_metricas_anomalias (
  id TEXT PRIMARY KEY DEFAULT lower(hex(randomblob(16))),
  usuario_id TEXT,                           -- FK para usuarios.id (NULL = global)
  tipo_metrica TEXT NOT NULL
    CHECK(tipo_metrica IN ('desvio_padrao', 'iqr', 'percentil')),
  periodo_dias INTEGER NOT NULL DEFAULT 90,  -- Última quantos dias de histórico

  -- 2-Sigma (Desvio Padrão)
  media REAL,                                -- Média das últimas N transações
  desvio_padrao REAL,                        -- σ

  -- IQR (Interquartile Range)
  q1 REAL,                                   -- 25º percentil
  q2 REAL,                                   -- 50º percentil (mediana)
  q3 REAL,                                   -- 75º percentil
  iqr_valor REAL,                            -- Q3 - Q1

  -- Percentiles
  p5 REAL,                                   -- 5º percentil
  p90 REAL,                                  -- 90º percentil
  p95 REAL,                                  -- 95º percentil

  -- Metadata
  total_transacoes INTEGER,                  -- Quantas transações foram usadas no cálculo
  atualizado_em DATETIME NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cache_metricas_usuario
  ON cache_metricas_anomalias(usuario_id);

CREATE INDEX IF NOT EXISTS idx_cache_metricas_tipo
  ON cache_metricas_anomalias(tipo_metrica);

CREATE INDEX IF NOT EXISTS idx_cache_metricas_atualizado_desc
  ON cache_metricas_anomalias(atualizado_em DESC);

-- ============================================================
-- 3. VIEW: Alertas críticos não revisados (para dashboard)
-- ============================================================

CREATE VIEW IF NOT EXISTS v_alertas_anomalias_criticos AS
SELECT
  a.id,
  a.transacao_id,
  a.usuario_id,
  a.severidade,
  a.confianca,
  a.metodos_dispararam,
  a.descricao,
  a.criado_em,
  CASE
    WHEN a.z_score IS NOT NULL THEN ROUND(a.z_score, 2)
    ELSE NULL
  END as z_score_display,
  CASE
    WHEN a.iqr_valor IS NOT NULL AND a.iqr_limite IS NOT NULL
      THEN ROUND((a.iqr_valor / a.iqr_limite * 100), 0)
    ELSE NULL
  END as percentual_limite_iqr
FROM alertas_anomalias_registrados a
WHERE a.severidade = 'critica'
  AND a.revisado = 0
ORDER BY a.criado_em DESC;
