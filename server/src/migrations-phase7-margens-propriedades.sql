/**
 * Fase 7: Sistema de Análise de Margens por Propriedade
 *
 * Tabela margens_propriedades_periodo: armazena resultado do cálculo de margem
 * para cada propriedade em cada período (mês/ano).
 *
 * Margem = (Receita Aluguel - Despesa da Propriedade) / Receita Aluguel * 100
 *
 * Receita: aluguel mensal cobrado
 * Despesa: IPTU + condomínio + manutenção + consertos + reformas
 *
 * Status:
 * - OK (> 70%): propriedade muito rentável
 * - ATENÇÃO (50-70%): investigar custos
 * - CRÍTICO (< 50%): rever preço aluguel ou reduzir despesas
 *
 * Atualizado 1x/dia às 23:55 para fazer análise de tendência
 */
CREATE TABLE IF NOT EXISTS margens_propriedades_periodo (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo                   TEXT NOT NULL,
  ano                       INTEGER NOT NULL CHECK(ano >= 2000 AND ano <= 2100),
  mes                       INTEGER NOT NULL CHECK(mes >= 1 AND mes <= 12),
  imovel_id                 INTEGER NOT NULL,

  -- Valores em unidades monetárias (centavos/menor unidade)
  receita                   REAL NOT NULL DEFAULT 0,
  despesa                   REAL NOT NULL DEFAULT 0,

  -- Margem percentual (0-100)
  margem                    REAL NOT NULL DEFAULT 0,

  -- Status baseado na margem
  status                    TEXT NOT NULL CHECK(status IN ('OK', 'ATENÇÃO', 'CRÍTICO')),

  -- Metadata
  calculado_em              DATETIME NOT NULL,
  criado_em                 DATETIME NOT NULL DEFAULT (datetime('now')),
  atualizado_em             DATETIME NOT NULL DEFAULT (datetime('now')),

  UNIQUE(imovel_id, ano, mes),
  FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_margens_imovel_periodo ON margens_propriedades_periodo(imovel_id, ano, mes DESC);
CREATE INDEX IF NOT EXISTS idx_margens_periodo ON margens_propriedades_periodo(ano, mes DESC);
CREATE INDEX IF NOT EXISTS idx_margens_status ON margens_propriedades_periodo(status);
CREATE INDEX IF NOT EXISTS idx_margens_calculado ON margens_propriedades_periodo(calculado_em DESC);
