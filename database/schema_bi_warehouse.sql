/**
 * Data Warehouse Schema para Business Intelligence
 * Star Schema: Fact tables com dimensões para análise multi-dimensional
 * Task: BI System Implementation
 */

-- Dimensão: Prestador
CREATE TABLE IF NOT EXISTS dim_prestador (
  prestador_sk BIGSERIAL PRIMARY KEY,
  prestador_id UUID UNIQUE NOT NULL,
  nome_completo TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  cpf TEXT,
  status TEXT, -- ativo, inativo
  data_inicio DATE,
  data_fim DATE,
  is_current BOOLEAN DEFAULT true,
  data_carga TIMESTAMP DEFAULT NOW()
);

-- Dimensão: Contrato
CREATE TABLE IF NOT EXISTS dim_contrato (
  contrato_sk BIGSERIAL PRIMARY KEY,
  contrato_id UUID UNIQUE NOT NULL,
  prestador_sk BIGINT REFERENCES dim_prestador(prestador_sk),
  tipo_contrato TEXT, -- CLT, PJ, Terceirizado
  status TEXT,
  data_inicio DATE,
  data_fim DATE,
  valor_hora DECIMAL(10, 2),
  is_current BOOLEAN DEFAULT true,
  data_carga TIMESTAMP DEFAULT NOW()
);

-- Dimensão: Residencial/Imóvel
CREATE TABLE IF NOT EXISTS dim_residencial (
  residencial_sk BIGSERIAL PRIMARY KEY,
  residencial_id UUID UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  locatario_id UUID,
  locatario_nome TEXT,
  tipo_propriedade TEXT, -- residencial, comercial, misto
  is_current BOOLEAN DEFAULT true,
  data_carga TIMESTAMP DEFAULT NOW()
);

-- Dimensão: Data
CREATE TABLE IF NOT EXISTS dim_data (
  data_sk BIGSERIAL PRIMARY KEY,
  data_completa DATE UNIQUE NOT NULL,
  ano SMALLINT,
  mes SMALLINT,
  dia SMALLINT,
  trimestre SMALLINT,
  semana_ano SMALLINT,
  dia_semana SMALLINT,
  nome_mes TEXT,
  nome_dia_semana TEXT,
  eh_fim_de_semana BOOLEAN,
  eh_feriado BOOLEAN,
  data_inicio_mes DATE,
  data_fim_mes DATE
);

-- Dimensão: Categoria de Despesa
CREATE TABLE IF NOT EXISTS dim_categoria_despesa (
  categoria_sk BIGSERIAL PRIMARY KEY,
  categoria_id SERIAL UNIQUE,
  nome_categoria TEXT NOT NULL UNIQUE, -- Combustível, Limpeza, Manutenção, etc
  tipo_despesa TEXT, -- Operacional, Capital, Admin
  codigo_contabil TEXT,
  data_carga TIMESTAMP DEFAULT NOW()
);

-- Tabela de Fatos: Apontamentos
CREATE TABLE IF NOT EXISTS fact_apontamento (
  apontamento_sk BIGSERIAL PRIMARY KEY,
  apontamento_id UUID,
  prestador_sk BIGINT REFERENCES dim_prestador(prestador_sk),
  contrato_sk BIGINT REFERENCES dim_contrato(contrato_sk),
  residencial_sk BIGINT REFERENCES dim_residencial(residencial_sk),
  data_sk BIGINT REFERENCES dim_data(data_sk),
  horas_trabalhadas DECIMAL(10, 2),
  valor_hora DECIMAL(10, 2),
  valor_total DECIMAL(12, 2),
  foi_rateado BOOLEAN,
  foi_anomalia BOOLEAN,
  score_anomalia SMALLINT,
  status TEXT,
  foi_importado_retroativo BOOLEAN,
  data_carga TIMESTAMP DEFAULT NOW(),
  UNIQUE(apontamento_id)
);

-- Índices para performance
CREATE INDEX idx_fact_apontamento_data_sk ON fact_apontamento(data_sk);
CREATE INDEX idx_fact_apontamento_prestador_sk ON fact_apontamento(prestador_sk);
CREATE INDEX idx_fact_apontamento_residencial_sk ON fact_apontamento(residencial_sk);
CREATE INDEX idx_fact_apontamento_contrato_sk ON fact_apontamento(contrato_sk);

-- Tabela de Fatos: Faturamento
CREATE TABLE IF NOT EXISTS fact_faturamento (
  faturamento_sk BIGSERIAL PRIMARY KEY,
  fatura_id UUID,
  residencial_sk BIGINT REFERENCES dim_residencial(residencial_sk),
  contrato_sk BIGINT REFERENCES dim_contrato(contrato_sk),
  data_sk BIGINT REFERENCES dim_data(data_sk),
  competencia_mes SMALLINT,
  competencia_ano SMALLINT,
  valor_bruto DECIMAL(12, 2),
  total_deducoes DECIMAL(12, 2),
  valor_liquido DECIMAL(12, 2),
  status_fatura TEXT, -- rascunho, emitida, paga
  data_emissao DATE,
  data_vencimento DATE,
  data_pagamento DATE,
  apontamentos_count SMALLINT,
  horas_totais DECIMAL(10, 2),
  data_carga TIMESTAMP DEFAULT NOW(),
  UNIQUE(fatura_id)
);

CREATE INDEX idx_fact_faturamento_data_sk ON fact_faturamento(data_sk);
CREATE INDEX idx_fact_faturamento_residencial_sk ON fact_faturamento(residencial_sk);
CREATE INDEX idx_fact_faturamento_competencia ON fact_faturamento(competencia_ano, competencia_mes);

-- Tabela de Fatos: Despesas
CREATE TABLE IF NOT EXISTS fact_despesa (
  despesa_sk BIGSERIAL PRIMARY KEY,
  despesa_id UUID,
  prestador_sk BIGINT REFERENCES dim_prestador(prestador_sk),
  categoria_sk BIGINT REFERENCES dim_categoria_despesa(categoria_sk),
  data_sk BIGINT REFERENCES dim_data(data_sk),
  tipo_despesa TEXT, -- gasto_ressarcimento, combustivel, etc
  descricao TEXT,
  valor_total DECIMAL(12, 2),
  status TEXT, -- ativo, quitado, suspenso
  foi_aprovada BOOLEAN,
  confianca_ocr SMALLINT,
  data_carga TIMESTAMP DEFAULT NOW(),
  UNIQUE(despesa_id)
);

CREATE INDEX idx_fact_despesa_data_sk ON fact_despesa(data_sk);
CREATE INDEX idx_fact_despesa_prestador_sk ON fact_despesa(prestador_sk);
CREATE INDEX idx_fact_despesa_categoria_sk ON fact_despesa(categoria_sk);

-- Tabela de Fatos: Recebimento
CREATE TABLE IF NOT EXISTS fact_recebimento (
  recebimento_sk BIGSERIAL PRIMARY KEY,
  recebimento_id UUID,
  fatura_sk BIGINT REFERENCES fact_faturamento(faturamento_sk),
  residencial_sk BIGINT REFERENCES dim_residencial(residencial_sk),
  data_sk BIGINT REFERENCES dim_data(data_sk),
  valor_recebido DECIMAL(12, 2),
  valor_descontado DECIMAL(12, 2),
  valor_liquido DECIMAL(12, 2),
  metodo_pagamento TEXT, -- pix, ted, boleto
  status TEXT, -- pendente, recebido, reembolsado
  dias_atraso SMALLINT,
  data_carga TIMESTAMP DEFAULT NOW(),
  UNIQUE(recebimento_id)
);

CREATE INDEX idx_fact_recebimento_data_sk ON fact_recebimento(data_sk);
CREATE INDEX idx_fact_recebimento_residencial_sk ON fact_recebimento(residencial_sk);

-- Tabela de Fatos: Fluxo de Caixa
CREATE TABLE IF NOT EXISTS fact_fluxo_caixa (
  fluxo_sk BIGSERIAL PRIMARY KEY,
  residencial_sk BIGINT REFERENCES dim_residencial(residencial_sk),
  data_sk BIGINT REFERENCES dim_data(data_sk),
  saldo_inicial DECIMAL(12, 2),
  entradas_faturamento DECIMAL(12, 2),
  entradas_recebimento DECIMAL(12, 2),
  saidas_despesas DECIMAL(12, 2),
  saidas_reembolsos DECIMAL(12, 2),
  saidas_outras DECIMAL(12, 2),
  saldo_final DECIMAL(12, 2),
  fluxo_liquido DECIMAL(12, 2),
  data_carga TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fact_fluxo_caixa_data_sk ON fact_fluxo_caixa(data_sk);
CREATE INDEX idx_fact_fluxo_caixa_residencial_sk ON fact_fluxo_caixa(residencial_sk);

-- Tabela de Fatos: Custo Centro
CREATE TABLE IF NOT EXISTS fact_custo_centro (
  custo_centro_sk BIGSERIAL PRIMARY KEY,
  residencial_sk BIGINT REFERENCES dim_residencial(residencial_sk),
  data_sk BIGINT REFERENCES dim_data(data_sk),
  categoria_custo TEXT, -- mao_de_obra, combustivel, materiais, etc
  valor_custo DECIMAL(12, 2),
  quantidade_unidade DECIMAL(10, 2),
  custo_unitario DECIMAL(12, 2),
  percentual_total DECIMAL(5, 2),
  data_carga TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fact_custo_centro_data_sk ON fact_custo_centro(data_sk);
CREATE INDEX idx_fact_custo_centro_residencial_sk ON fact_custo_centro(residencial_sk);

-- View: Resumo Mensal por Residencial
CREATE VIEW vw_resumo_mensal_residencial AS
SELECT
  r.nome,
  d.ano,
  d.mes,
  d.nome_mes,
  COUNT(DISTINCT a.apontamento_sk) as total_apontamentos,
  SUM(a.horas_trabalhadas) as total_horas,
  SUM(a.valor_total) as custo_total,
  COUNT(DISTINCT CASE WHEN a.foi_anomalia THEN 1 END) as anomalias_detectadas,
  SUM(CASE WHEN f.fatura_id IS NOT NULL THEN f.valor_bruto ELSE 0 END) as faturamento,
  SUM(CASE WHEN f.fatura_id IS NOT NULL THEN f.valor_liquido ELSE 0 END) as faturamento_liquido,
  SUM(CASE WHEN r_fact.recebimento_id IS NOT NULL THEN r_fact.valor_recebido ELSE 0 END) as recebimento
FROM
  dim_residencial r
  LEFT JOIN fact_apontamento a ON r.residencial_sk = a.residencial_sk
  LEFT JOIN dim_data d ON a.data_sk = d.data_sk
  LEFT JOIN fact_faturamento f ON r.residencial_sk = f.residencial_sk
    AND d.ano = f.competencia_ano AND d.mes = f.competencia_mes
  LEFT JOIN fact_recebimento r_fact ON f.faturamento_sk = r_fact.fatura_sk
WHERE
  r.is_current = true
GROUP BY
  r.residencial_sk, r.nome, d.ano, d.mes, d.nome_mes
ORDER BY
  d.ano DESC, d.mes DESC, r.nome;

-- View: KPIs Financeiros
CREATE VIEW vw_kpi_financeiro AS
SELECT
  d.ano,
  d.mes,
  d.nome_mes,
  SUM(f.valor_bruto) as faturamento_total,
  SUM(f.total_deducoes) as deducoes_total,
  SUM(f.valor_liquido) as receita_liquida,
  SUM(a.valor_total) as custo_operacional,
  SUM(de.valor_total) as custo_despesas,
  (SUM(f.valor_liquido) - SUM(a.valor_total) - SUM(de.valor_total)) as margem_bruta,
  ROUND(
    CASE
      WHEN SUM(f.valor_bruto) > 0
      THEN ((SUM(f.valor_liquido) - SUM(a.valor_total) - SUM(de.valor_total)) / SUM(f.valor_bruto) * 100)
      ELSE 0
    END, 2
  ) as margem_percentual,
  SUM(CASE WHEN r.recebimento_id IS NOT NULL THEN r.valor_recebido ELSE 0 END) as total_recebido,
  COUNT(DISTINCT f.fatura_id) as quantidade_faturas
FROM
  dim_data d
  LEFT JOIN fact_faturamento f ON d.data_sk = f.data_sk
  LEFT JOIN fact_apontamento a ON d.data_sk = a.data_sk
  LEFT JOIN fact_despesa de ON d.data_sk = de.data_sk
  LEFT JOIN fact_recebimento r ON f.faturamento_sk = r.fatura_sk
GROUP BY
  d.data_sk, d.ano, d.mes, d.nome_mes
ORDER BY
  d.ano DESC, d.mes DESC;

-- View: Performance por Prestador
CREATE VIEW vw_performance_prestador AS
SELECT
  p.nome_completo,
  d.ano,
  d.mes,
  COUNT(DISTINCT a.apontamento_sk) as apontamentos,
  SUM(a.horas_trabalhadas) as horas_totais,
  ROUND(AVG(a.horas_trabalhadas), 2) as media_horas_dia,
  SUM(a.valor_total) as valor_total,
  ROUND(SUM(a.valor_total) / NULLIF(SUM(a.horas_trabalhadas), 0), 2) as valor_hora_efetivo,
  COUNT(DISTINCT CASE WHEN a.foi_anomalia THEN 1 END) as anomalias,
  ROUND(
    COUNT(DISTINCT CASE WHEN a.foi_anomalia THEN 1 END)::NUMERIC /
    COUNT(DISTINCT a.apontamento_sk) * 100, 2
  ) as taxa_anomalia
FROM
  dim_prestador p
  LEFT JOIN fact_apontamento a ON p.prestador_sk = a.prestador_sk
  LEFT JOIN dim_data d ON a.data_sk = d.data_sk
WHERE
  p.is_current = true
GROUP BY
  p.prestador_sk, p.nome_completo, d.ano, d.mes
ORDER BY
  d.ano DESC, d.mes DESC, p.nome_completo;

-- RLS Policies para BI
ALTER TABLE fact_apontamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE fact_faturamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE fact_despesa ENABLE ROW LEVEL SECURITY;
ALTER TABLE fact_recebimento ENABLE ROW LEVEL SECURITY;

-- Policy: Admin vê tudo, prestador vê apenas seus dados
CREATE POLICY "admin_full_access" ON fact_apontamento
  USING (auth.jwt() ->> 'role' = 'admin' OR auth.jwt() ->> 'role' = 'economista');

CREATE POLICY "prestador_see_own" ON fact_apontamento
  USING (
    prestador_sk IN (
      SELECT p.prestador_sk
      FROM dim_prestador p
      WHERE p.prestador_id = auth.jwt() ->> 'sub'
    )
  );

-- Trigger para atualizar dim_prestador quando mudar
CREATE OR REPLACE FUNCTION update_dim_prestador()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM dim_prestador
    WHERE prestador_id = NEW.id AND is_current = true
  ) THEN
    UPDATE dim_prestador
    SET is_current = false, data_carga = NOW()
    WHERE prestador_id = NEW.id AND is_current = true;
  END IF;

  INSERT INTO dim_prestador (prestador_id, nome_completo, email, telefone, status, data_inicio)
  VALUES (NEW.id, NEW.nome_completo, NEW.email, NEW.telefone, 'ativo', NOW());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para nova tabela de apontamentos
CREATE TRIGGER trigger_update_dim_prestador
  AFTER UPDATE ON prestadores_servico
  FOR EACH ROW
  EXECUTE FUNCTION update_dim_prestador();

GRANT SELECT ON fact_apontamento TO authenticated;
GRANT SELECT ON fact_faturamento TO authenticated;
GRANT SELECT ON fact_despesa TO authenticated;
GRANT SELECT ON fact_recebimento TO authenticated;
GRANT SELECT ON dim_prestador TO authenticated;
GRANT SELECT ON dim_residencial TO authenticated;
GRANT SELECT ON dim_data TO authenticated;
GRANT SELECT ON vw_resumo_mensal_residencial TO authenticated;
GRANT SELECT ON vw_kpi_financeiro TO authenticated;
GRANT SELECT ON vw_performance_prestador TO authenticated;
