/**
 * Phase 22.20.3: Property Management System
 *
 * Implements comprehensive property management with:
 * - CRUD operations for real estate properties
 * - Cost allocation and tracking
 * - Depreciation calculations (linear and exponential)
 * - ROI (Return on Investment) analysis
 * - Audit trail integration
 *
 * Tables:
 * - propriedades: Main property registry
 * - propriedades_custos: Cost allocation per property
 * - propriedades_depreciacao: Depreciation history
 * - propriedades_roi: ROI calculations and history
 *
 * Applied on every boot (idempotent).
 */

-- =====================================================================
-- Table: PROPRIEDADES - Main property registry
-- =====================================================================

CREATE TABLE IF NOT EXISTS propriedades (
  id TEXT PRIMARY KEY,

  -- Property identification
  nome TEXT NOT NULL,
  endereco TEXT NOT NULL,
  numero TEXT NOT NULL,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  cep TEXT,
  pais TEXT DEFAULT 'BR',

  -- Property details
  tipo_imovel TEXT NOT NULL CHECK (tipo_imovel IN ('residencial', 'comercial', 'industrial', 'rural', 'misto')),
  area_total REAL NOT NULL,
  area_construida REAL,
  numero_dormitorios INTEGER,
  numero_banheiros INTEGER,
  descricao TEXT,

  -- Financial data
  valor_aquisicao REAL NOT NULL,
  data_aquisicao DATE NOT NULL,
  data_venda DATE,
  valor_venda REAL,

  -- Depreciation configuration
  metodo_depreciacao TEXT NOT NULL DEFAULT 'linear' CHECK (metodo_depreciacao IN ('linear', 'exponencial')),
  taxa_depreciacao REAL NOT NULL DEFAULT 0.05,
  vida_util_anos INTEGER DEFAULT 27,
  valor_residual REAL,

  -- Status tracking
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Audit trail
  criado_por TEXT NOT NULL,
  atualizado_por TEXT,

  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
  FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_propriedades_ativo ON propriedades(ativo);
CREATE INDEX IF NOT EXISTS idx_propriedades_tipo ON propriedades(tipo_imovel);
CREATE INDEX IF NOT EXISTS idx_propriedades_data_aquisicao ON propriedades(data_aquisicao);
CREATE INDEX IF NOT EXISTS idx_propriedades_criado_por ON propriedades(criado_por);
CREATE INDEX IF NOT EXISTS idx_propriedades_cidade ON propriedades(cidade, estado);


-- =====================================================================
-- Table: PROPRIEDADES_CUSTOS - Cost allocation per property
-- =====================================================================

CREATE TABLE IF NOT EXISTS propriedades_custos (
  id TEXT PRIMARY KEY,
  propriedade_id TEXT NOT NULL,

  -- Cost details
  descricao TEXT NOT NULL,
  tipo_custo TEXT NOT NULL CHECK (tipo_custo IN ('reforma', 'manutencao', 'imposto', 'seguro', 'administrativo', 'outro')),
  categoria_contabil TEXT,
  valor REAL NOT NULL,
  data_custo DATE NOT NULL,

  -- Allocation
  percentual_alocacao REAL NOT NULL DEFAULT 100.00,
  observacoes TEXT,

  -- Audit
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por TEXT NOT NULL,

  FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_propriedades_custos_propriedade ON propriedades_custos(propriedade_id);
CREATE INDEX IF NOT EXISTS idx_propriedades_custos_tipo ON propriedades_custos(tipo_custo);
CREATE INDEX IF NOT EXISTS idx_propriedades_custos_data ON propriedades_custos(data_custo DESC);
CREATE INDEX IF NOT EXISTS idx_propriedades_custos_periodo ON propriedades_custos(propriedade_id, data_custo);


-- =====================================================================
-- Table: PROPRIEDADES_DEPRECIACAO - Depreciation tracking
-- =====================================================================

CREATE TABLE IF NOT EXISTS propriedades_depreciacao (
  id TEXT PRIMARY KEY,
  propriedade_id TEXT NOT NULL,

  -- Calculation period
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  data_calculo DATE NOT NULL,

  -- Depreciation values
  valor_inicial REAL NOT NULL,
  valor_depreciacao REAL NOT NULL,
  valor_residual REAL NOT NULL,
  metodo_aplicado TEXT NOT NULL CHECK (metodo_aplicado IN ('linear', 'exponencial')),
  taxa_aplicada REAL NOT NULL,

  -- Accumulated
  depreciacao_acumulada REAL NOT NULL,

  -- Audit
  calculado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  calculado_por TEXT,

  FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
  FOREIGN KEY (calculado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_propriedades_depreciacao_propriedade ON propriedades_depreciacao(propriedade_id);
CREATE INDEX IF NOT EXISTS idx_propriedades_depreciacao_periodo ON propriedades_depreciacao(propriedade_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_propriedades_depreciacao_data ON propriedades_depreciacao(data_calculo DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_propriedades_depreciacao_unico ON propriedades_depreciacao(propriedade_id, ano, mes);


-- =====================================================================
-- Table: PROPRIEDADES_ROI - ROI analysis and history
-- =====================================================================

CREATE TABLE IF NOT EXISTS propriedades_roi (
  id TEXT PRIMARY KEY,
  propriedade_id TEXT NOT NULL,

  -- Period analysis
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  dias_periodo INTEGER NOT NULL,

  -- Investment & Returns
  valor_investimento_total REAL NOT NULL,
  custos_totais REAL NOT NULL,
  receitas_totais REAL NOT NULL,
  lucro_liquido REAL NOT NULL,

  -- ROI metrics
  roi_percentual REAL NOT NULL,
  roi_anualizado REAL NOT NULL,
  valor_propriedade_atual REAL NOT NULL,
  ganho_valorizacao REAL,
  ganho_valorizacao_percentual REAL,

  -- Performance
  payback_meses INTEGER,
  taxa_retorno_anual REAL,
  indice_lucratividade REAL,

  -- Audit
  calculado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  calculado_por TEXT,

  FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
  FOREIGN KEY (calculado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_propriedades_roi_propriedade ON propriedades_roi(propriedade_id);
CREATE INDEX IF NOT EXISTS idx_propriedades_roi_periodo ON propriedades_roi(propriedade_id, data_fim DESC);
CREATE INDEX IF NOT EXISTS idx_propriedades_roi_data ON propriedades_roi(calculado_em DESC);


-- =====================================================================
-- View: PROPRIEDADES_RESUMO - Summary view for listing
-- =====================================================================

DROP VIEW IF EXISTS propriedades_resumo;
CREATE VIEW propriedades_resumo AS
SELECT
  p.id,
  p.nome,
  p.endereco,
  p.tipo_imovel,
  p.area_total,
  p.valor_aquisicao,
  p.data_aquisicao,
  p.data_venda,
  p.ativo,
  p.criado_em,
  COALESCE(SUM(CASE WHEN pc.id IS NOT NULL THEN pc.valor * pc.percentual_alocacao / 100 ELSE 0 END), 0) as custos_totais,
  COUNT(DISTINCT pc.id) as total_custos,
  MAX(pr.roi_percentual) as ultimo_roi,
  MAX(pr.calculado_em) as ultima_analise_roi
FROM propriedades p
LEFT JOIN propriedades_custos pc ON p.id = pc.propriedade_id
LEFT JOIN propriedades_roi pr ON p.id = pr.propriedade_id
WHERE p.ativo = 1
GROUP BY p.id, p.nome, p.endereco, p.tipo_imovel, p.area_total, p.valor_aquisicao,
         p.data_aquisicao, p.data_venda, p.ativo, p.criado_em;


-- =====================================================================
-- View: PROPRIEDADES_ANALISE - Analysis view with depreciation
-- =====================================================================

DROP VIEW IF EXISTS propriedades_analise;
CREATE VIEW propriedades_analise AS
SELECT
  p.id,
  p.nome,
  p.valor_aquisicao,
  p.data_aquisicao,
  p.metodo_depreciacao,
  p.taxa_depreciacao,
  (SELECT valor_inicial FROM propriedades_depreciacao
   WHERE propriedade_id = p.id
   ORDER BY data_calculo DESC LIMIT 1) as valor_corrente,
  (SELECT depreciacao_acumulada FROM propriedades_depreciacao
   WHERE propriedade_id = p.id
   ORDER BY data_calculo DESC LIMIT 1) as depreciacao_acumulada,
  (SELECT valor_residual FROM propriedades_depreciacao
   WHERE propriedade_id = p.id
   ORDER BY data_calculo DESC LIMIT 1) as valor_residual_calculado,
  COALESCE((SELECT SUM(valor * percentual_alocacao / 100)
           FROM propriedades_custos WHERE propriedade_id = p.id), 0) as custos_acumulados
FROM propriedades p
WHERE p.ativo = 1;
