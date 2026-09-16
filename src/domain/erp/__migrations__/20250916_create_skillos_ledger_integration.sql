-- Migration: Skillos Habilidades → Ledger Integration
-- Data: 2025-09-16
-- Descrição: Criar tabelas de rastreamento bidirecional entre skillos e ledger central
-- Objetivo: Rastreamento de ciclo de vida de habilidades, ROI, depreciação de ativos intangíveis

-- ============================================================================
-- TABELA: skillos_ledger_entries
-- Rastreamento bidirecional habilidade ↔ ledger
-- Persiste aquisição, manutenção, certificação e depreciação de habilidades
-- ============================================================================
CREATE TABLE IF NOT EXISTS skillos_ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Referência à habilidade original
  habilidade_id INTEGER NOT NULL,
  tipo_habilidade VARCHAR(20) NOT NULL CHECK(tipo_habilidade IN ('aquisicao', 'manutencao', 'certificacao')),

  -- Referência ao ledger (lançamento contábil duplo)
  ledger_entry_id INTEGER NOT NULL, -- Lançamento de débito
  ledger_entry_id_contrapartida INTEGER, -- Lançamento de crédito

  -- Metadados da habilidade
  pessoa_id INTEGER NOT NULL,
  entidade_id INTEGER NOT NULL,
  periodo_id INTEGER NOT NULL,

  -- Detalhes do lançamento
  valor DECIMAL(12, 2) NOT NULL CHECK(valor > 0),
  conta_debito_id INTEGER NOT NULL,
  conta_credito_id INTEGER NOT NULL,
  descricao TEXT NOT NULL,

  -- Ciclo de vida da habilidade
  status_ciclo_vida VARCHAR(20) NOT NULL DEFAULT 'ativa' CHECK(status_ciclo_vida IN ('ativa', 'depreciadaTotal', 'obsoleta')),

  -- Auditoria
  data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys (soft references - não usar FK para manter integridade referencial mínima)
  -- FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id)
  -- FOREIGN KEY (pessoa_id) REFERENCES pessoas(id)
  -- FOREIGN KEY (entidade_id) REFERENCES entidades(id)
  -- FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id)

  CONSTRAINT unique_habilidade_ledger UNIQUE(habilidade_id, ledger_entry_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_skillos_ledger_habilidade_id ON skillos_ledger_entries(habilidade_id);
CREATE INDEX IF NOT EXISTS idx_skillos_ledger_pessoa_id ON skillos_ledger_entries(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_skillos_ledger_periodo ON skillos_ledger_entries(entidade_id, periodo_id);
CREATE INDEX IF NOT EXISTS idx_skillos_ledger_tipo ON skillos_ledger_entries(tipo_habilidade);
CREATE INDEX IF NOT EXISTS idx_skillos_ledger_data ON skillos_ledger_entries(data_criacao);
CREATE INDEX IF NOT EXISTS idx_skillos_ledger_status ON skillos_ledger_entries(status_ciclo_vida);

-- ============================================================================
-- TABELA: skillos_ledger_mapping
-- Mapeamento explícito de tipos de habilidade → contas contábeis
-- Permite auditoria e rastreamento de mudanças na política contábil
-- ============================================================================
CREATE TABLE IF NOT EXISTS skillos_ledger_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  habilidade_id INTEGER NOT NULL,
  tipo VARCHAR(50) NOT NULL CHECK(tipo IN ('aquisicao', 'manutencao', 'certificacao', 'depreciacao')),

  conta_debito_id INTEGER NOT NULL,
  conta_debito_descricao TEXT,

  conta_credito_id INTEGER NOT NULL,
  conta_credito_descricao TEXT,

  -- Vigência do mapeamento
  data_vigencia_inicio DATE DEFAULT CURRENT_DATE,
  data_vigencia_fim DATE,
  ativo BOOLEAN DEFAULT 1,

  -- Auditoria
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  criado_por INTEGER,
  motivo_criacao TEXT,

  CONSTRAINT unique_mapping UNIQUE(habilidade_id, tipo, data_vigencia_inicio)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_skillos_mapping_habilidade ON skillos_ledger_mapping(habilidade_id);
CREATE INDEX IF NOT EXISTS idx_skillos_mapping_tipo ON skillos_ledger_mapping(tipo);
CREATE INDEX IF NOT EXISTS idx_skillos_mapping_ativo ON skillos_ledger_mapping(ativo, data_vigencia_inicio);

-- ============================================================================
-- TABELA: skillos_ledger_logs
-- Registro detalhado de cada operação de persistência de habilidades
-- Útil para debugging e auditoria de mudanças no ledger
-- ============================================================================
CREATE TABLE IF NOT EXISTS skillos_ledger_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  habilidade_id INTEGER,
  pessoa_id INTEGER,
  tipo_operacao VARCHAR(20) NOT NULL CHECK(tipo_operacao IN ('registro', 'reversao', 'ajuste', 'validacao', 'depreciacao')),
  status VARCHAR(20) NOT NULL CHECK(status IN ('sucesso', 'erro', 'aviso')),

  -- Detalhes da operação
  modulo_origem VARCHAR(50),
  funcao_origem VARCHAR(100),
  mensagem TEXT,

  -- Contexto
  ledger_entries_afetadas INTEGER DEFAULT 0,
  valor_total DECIMAL(12, 2),

  -- Stack trace / debug info
  erro_detalhes TEXT,
  parametros_json TEXT, -- JSON com parâmetros da chamada

  -- Auditoria
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  criado_por INTEGER,

  CONSTRAINT fk_habilidade CHECK(habilidade_id IS NULL OR habilidade_id > 0)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_skillos_ledger_logs_habilidade ON skillos_ledger_logs(habilidade_id);
CREATE INDEX IF NOT EXISTS idx_skillos_ledger_logs_pessoa ON skillos_ledger_logs(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_skillos_ledger_logs_status ON skillos_ledger_logs(status);
CREATE INDEX IF NOT EXISTS idx_skillos_ledger_logs_data ON skillos_ledger_logs(criado_em);

-- ============================================================================
-- TABELA: habilidades_aquisicoes
-- Registro de habilidades para rastreamento de persistência
-- ============================================================================
CREATE TABLE IF NOT EXISTS habilidades_aquisicoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  pessoa_id INTEGER NOT NULL,
  entidade_id INTEGER NOT NULL,
  descricao TEXT NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK(tipo IN ('aquisicao', 'certificacao', 'manutencao')),
  valor_investimento DECIMAL(12, 2) NOT NULL CHECK(valor_investimento > 0),
  data_evento DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pendente' CHECK(status IN ('pendente', 'sincronizado', 'erro', 'cancelado', 'obsoleta')),
  status_persistencia VARCHAR(20) DEFAULT 'pendente' CHECK(status_persistencia IN ('pendente', 'sincronizado', 'erro')),
  motivo_obsoleto TEXT,

  -- Auditoria
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_pessoa CHECK(pessoa_id > 0),
  CONSTRAINT fk_entidade CHECK(entidade_id > 0)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_habilidades_pessoa ON habilidades_aquisicoes(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_habilidades_entidade ON habilidades_aquisicoes(entidade_id);
CREATE INDEX IF NOT EXISTS idx_habilidades_tipo ON habilidades_aquisicoes(tipo);
CREATE INDEX IF NOT EXISTS idx_habilidades_status ON habilidades_aquisicoes(status);
CREATE INDEX IF NOT EXISTS idx_habilidades_status_persistencia ON habilidades_aquisicoes(status_persistencia);

-- ============================================================================
-- INSERÇÕES: Mapeamento padrão de contas para skillos
-- Segue plano de contas: 5.x = Despesas, 1.x = Ativos, 3.x/4.x = Passivos
-- ============================================================================

-- Aquisição/Treinamento
-- Débito: 5.3.05 Despesa de Desenvolvimento
-- Crédito: 3.1.02 Contas a Pagar
INSERT OR IGNORE INTO skillos_ledger_mapping
(habilidade_id, tipo, conta_debito_id, conta_debito_descricao, conta_credito_id, conta_credito_descricao, motivo_criacao)
VALUES
(0, 'aquisicao', 45, '5.3.05 Despesa de Desenvolvimento', 13, '3.1.02 Contas a Pagar', 'Mapeamento padrão - Aquisição de Habilidade');

-- Certificação (Capitalização como Ativo)
-- Débito: 1.2.10 Ativos Intangíveis
-- Crédito: 3.1.02 Contas a Pagar
INSERT OR IGNORE INTO skillos_ledger_mapping
(habilidade_id, tipo, conta_debito_id, conta_debito_descricao, conta_credito_id, conta_credito_descricao, motivo_criacao)
VALUES
(0, 'certificacao', 20, '1.2.10 Ativos Intangíveis', 13, '3.1.02 Contas a Pagar', 'Mapeamento padrão - Certificação de Habilidade');

-- Manutenção (Refresh anual)
-- Débito: 5.3.06 Despesa Manutenção Habilidades
-- Crédito: 3.1.02 Contas a Pagar
INSERT OR IGNORE INTO skillos_ledger_mapping
(habilidade_id, tipo, conta_debito_id, conta_debito_descricao, conta_credito_id, conta_credito_descricao, motivo_criacao)
VALUES
(0, 'manutencao', 46, '5.3.06 Despesa Manutenção Habilidades', 13, '3.1.02 Contas a Pagar', 'Mapeamento padrão - Manutenção de Habilidade');

-- Depreciação (Mensal)
-- Débito: 5.3.07 Depreciação Habilidades
-- Crédito: 1.2.10 Ativos Intangíveis
INSERT OR IGNORE INTO skillos_ledger_mapping
(habilidade_id, tipo, conta_debito_id, conta_debito_descricao, conta_credito_id, conta_credito_descricao, motivo_criacao)
VALUES
(0, 'depreciacao', 47, '5.3.07 Depreciação Habilidades', 20, '1.2.10 Ativos Intangíveis', 'Mapeamento padrão - Depreciação de Habilidade');

-- ============================================================================
-- VIEWS: Relatórios de apoio
-- ============================================================================

-- View: Resumo de habilidades por pessoa e período
CREATE VIEW IF NOT EXISTS vw_skillos_resumo_pessoa_periodo AS
SELECT
  sle.entidade_id,
  sle.periodo_id,
  sle.pessoa_id,
  sle.tipo_habilidade,
  sle.status_ciclo_vida,
  COUNT(DISTINCT sle.habilidade_id) as total_habilidades,
  SUM(sle.valor) as valor_total,
  AVG(sle.valor) as valor_medio,
  MIN(sle.data_criacao) as primeira_data,
  MAX(sle.data_criacao) as ultima_data
FROM skillos_ledger_entries sle
GROUP BY sle.entidade_id, sle.periodo_id, sle.pessoa_id, sle.tipo_habilidade, sle.status_ciclo_vida;

-- View: Investimento total em habilidades por pessoa
CREATE VIEW IF NOT EXISTS vw_skillos_investimento_total AS
SELECT
  sle.pessoa_id,
  sle.entidade_id,
  COUNT(DISTINCT sle.habilidade_id) as total_habilidades_ativas,
  SUM(CASE WHEN sle.tipo_habilidade IN ('aquisicao', 'manutencao') THEN sle.valor ELSE 0 END) as investimento_total,
  SUM(CASE WHEN sle.tipo_habilidade = 'certificacao' THEN sle.valor ELSE 0 END) as valor_assets_intangibles,
  SUM(sle.valor) as valor_total
FROM skillos_ledger_entries sle
WHERE sle.status_ciclo_vida = 'ativa'
GROUP BY sle.pessoa_id, sle.entidade_id;

-- View: Auditoria de operações recentes
CREATE VIEW IF NOT EXISTS vw_skillos_operacoes_recentes AS
SELECT
  habilidade_id,
  pessoa_id,
  tipo_operacao,
  status,
  mensagem,
  ledger_entries_afetadas,
  valor_total,
  criado_em
FROM skillos_ledger_logs
ORDER BY criado_em DESC
LIMIT 100;

-- ============================================================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================================================

/*
TABELAS CRIADAS:

1. skillos_ledger_entries
   - Rastreamento bidirecional entre habilidade e ledger
   - Permite auditoria completa e reversão
   - Ciclo de vida: ativa → depreciadaTotal → obsoleta
   - Dois lançamentos por habilidade (débito + crédito)

2. skillos_ledger_mapping
   - Política contábil explícita por tipo de habilidade
   - Histórico de mudanças (data_vigencia_inicio/fim)
   - Permite auditoria de mudanças de política

3. skillos_ledger_logs
   - Registro de operações (registro, reversão, ajuste, validação, depreciacao)
   - Debugging e investigação de problemas
   - Status: sucesso, erro, aviso

4. habilidades_aquisicoes
   - Registro de habilidades para rastreamento de persistência
   - Conecta com skillos_ledger_entries via habilidade_id
   - Status de persistência: pendente, sincronizado, erro

FLUXO:

  1. validarHabilidade() → HabilidadeValidada
  2. registrarHabilidadeParaAquisicao() / registrarHabilidadeAdquirida()
  3. Cria 2 lançamentos: débito + crédito
  4. Registra em skillos_ledger_entries com ciclo_vida='ativa'
  5. DRE fica completo com origem_modulo='skillos'

CONTAS UTILIZADAS (Plano de Contas):

  Desenvolvimento/Aquisição:
    - 5.3.05 Despesa de Desenvolvimento (conta_id=45) [DÉBITO]
    - 3.1.02 Contas a Pagar (conta_id=13) [CRÉDITO]

  Certificação (Capitalização):
    - 1.2.10 Ativos Intangíveis (conta_id=20) [DÉBITO]
    - 3.1.02 Contas a Pagar (conta_id=13) [CRÉDITO]

  Manutenção (Refresh Anual):
    - 5.3.06 Despesa Manutenção Habilidades (conta_id=46) [DÉBITO]
    - 3.1.02 Contas a Pagar (conta_id=13) [CRÉDITO]

  Depreciação (Mensal):
    - 5.3.07 Depreciação Habilidades (conta_id=47) [DÉBITO]
    - 1.2.10 Ativos Intangíveis (conta_id=20) [CRÉDITO]

RELATÓRIOS:

  - vw_skillos_resumo_pessoa_periodo: Análise por pessoa e período
  - vw_skillos_investimento_total: ROI por pessoa
  - vw_skillos_operacoes_recentes: Auditoria de operações
*/
