/**
 * Phase 7: Relatório Executivo Mensal
 *
 * Tabela para armazenar relatórios executivos gerados e enviados mensalmente
 * para gestor/executivo, contendo resumo de KPIs, DRE, Fluxo, Margens, etc.
 */

-- Tabela: relatorios_executivos_gerados
-- Armazena histórico de relatórios gerados e enviados
CREATE TABLE IF NOT EXISTS relatorios_executivos_gerados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mes INTEGER NOT NULL,                         -- Mês do relatório (1-12)
  ano INTEGER NOT NULL,                         -- Ano do relatório (2020+)
  data_geracao TEXT NOT NULL,                   -- Data/hora de geração (ISO 8601)
  conteudo_html TEXT,                           -- Conteúdo HTML do relatório (primeiros 5000 chars)
  email_enviado INTEGER NOT NULL DEFAULT 0,     -- 1 = enviado, 0 = não enviado
  destinatarios TEXT,                           -- Email(s) destinatários (separados por vírgula)
  tentativas_envio INTEGER NOT NULL DEFAULT 0,  -- Número de tentativas de envio
  ultima_tentativa TEXT,                        -- ISO 8601 da última tentativa
  erro_ultima_tentativa TEXT,                   -- Mensagem de erro da última tentativa
  criado_em TEXT NOT NULL,                      -- Data/hora de criação (ISO 8601)
  atualizado_em TEXT                            -- Data/hora da última atualização
);

-- Índices para query rápida
CREATE INDEX IF NOT EXISTS idx_relatorios_executivos_periodo ON relatorios_executivos_gerados(ano, mes);
CREATE INDEX IF NOT EXISTS idx_relatorios_executivos_email_enviado ON relatorios_executivos_gerados(email_enviado);
CREATE INDEX IF NOT EXISTS idx_relatorios_executivos_data_geracao ON relatorios_executivos_gerados(data_geracao DESC);

-- Tabela: alertas_relatorio_executivo (opcional, para histórico de alertas)
-- Armazena alertas gerados em cada relatório executivo
CREATE TABLE IF NOT EXISTS alertas_relatorio_executivo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relatorio_id INTEGER NOT NULL,                -- FK para relatorios_executivos_gerados.id
  tipo TEXT NOT NULL,                           -- 'critico', 'aviso', 'info'
  titulo TEXT NOT NULL,                         -- Título do alerta
  descricao TEXT,                               -- Descrição do alerta
  valor REAL,                                   -- Valor numérico associado (opcional)
  recomendacao TEXT,                            -- Recomendação de ação
  criado_em TEXT NOT NULL,
  FOREIGN KEY (relatorio_id) REFERENCES relatorios_executivos_gerados(id) ON DELETE CASCADE
);

-- Índice para buscar alertas de um relatório
CREATE INDEX IF NOT EXISTS idx_alertas_relatorio ON alertas_relatorio_executivo(relatorio_id);
CREATE INDEX IF NOT EXISTS idx_alertas_tipo ON alertas_relatorio_executivo(tipo);
