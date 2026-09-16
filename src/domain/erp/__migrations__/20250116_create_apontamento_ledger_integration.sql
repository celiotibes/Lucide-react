-- Migration: Apontamento Prestador → Ledger Integration
-- Data: 2025-01-16
-- Descrição: Criar tabela de rastreamento bidirecional entre apontamentos e ledger central
-- Objetivo: Auditoria completa, reversão de lançamentos, DRE corrigida

-- ============================================================================
-- TABELA: apontamento_ledger_entries
-- Rastreamento bidirecional apontamento ↔ ledger
-- ============================================================================
CREATE TABLE IF NOT EXISTS apontamento_ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Referência ao apontamento original
  apontamento_id INTEGER NOT NULL,
  tipo_apontamento VARCHAR(20) NOT NULL CHECK(tipo_apontamento IN ('urgencia', 'airbnb', 'combustivel', 'horas', 'emprestimo')),

  -- Referência ao ledger (lançamento contábil duplo)
  ledger_entry_id INTEGER NOT NULL, -- Lançamento de débito
  ledger_entry_id_contrapartida INTEGER, -- Lançamento de crédito (pode ser NULL para single-side)

  -- Metadados do apontamento
  prestador_id INTEGER NOT NULL,
  entidade_id INTEGER NOT NULL,
  periodo_id INTEGER NOT NULL,

  -- Detalhes do lançamento
  valor DECIMAL(12, 2) NOT NULL CHECK(valor > 0),
  conta_debito_id INTEGER NOT NULL,
  conta_credito_id INTEGER NOT NULL,
  descricao TEXT NOT NULL,

  -- Auditoria
  data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys (soft references - não usar FK para manter integridade referencial mínima)
  -- FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id)
  -- FOREIGN KEY (prestador_id) REFERENCES prestadores(id)
  -- FOREIGN KEY (entidade_id) REFERENCES entidades(id)
  -- FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id)

  CONSTRAINT unique_apontamento_ledger UNIQUE(apontamento_id, ledger_entry_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_apontamento_ledger_apontamento_id ON apontamento_ledger_entries(apontamento_id);
CREATE INDEX IF NOT EXISTS idx_apontamento_ledger_prestador ON apontamento_ledger_entries(prestador_id);
CREATE INDEX IF NOT EXISTS idx_apontamento_ledger_periodo ON apontamento_ledger_entries(entidade_id, periodo_id);
CREATE INDEX IF NOT EXISTS idx_apontamento_ledger_tipo ON apontamento_ledger_entries(tipo_apontamento);
CREATE INDEX IF NOT EXISTS idx_apontamento_ledger_data ON apontamento_ledger_entries(data_criacao);

-- ============================================================================
-- TABELA: contas_mapeamento_apontamentos
-- Mapeamento explícito de tipos de apontamento → contas contábeis
-- Permite auditoria e rastreamento de mudanças na política contábil
-- ============================================================================
CREATE TABLE IF NOT EXISTS contas_mapeamento_apontamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  tipo_apontamento VARCHAR(20) NOT NULL CHECK(tipo_apontamento IN ('urgencia', 'airbnb', 'combustivel', 'horas', 'emprestimo')),
  subcategoria VARCHAR(50), -- 'principal', 'juros', 'deslocamento', etc.

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

  CONSTRAINT unique_mapeamento UNIQUE(tipo_apontamento, subcategoria, data_vigencia_inicio)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mapeamento_tipo ON contas_mapeamento_apontamentos(tipo_apontamento);
CREATE INDEX IF NOT EXISTS idx_mapeamento_ativo ON contas_mapeamento_apontamentos(ativo, data_vigencia_inicio);

-- ============================================================================
-- TABELA: apontamento_ledger_logs
-- Registro detalhado de cada operação de persistência
-- Útil para debugging e auditoria de mudanças no ledger
-- ============================================================================
CREATE TABLE IF NOT EXISTS apontamento_ledger_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  apontamento_id INTEGER,
  tipo_operacao VARCHAR(20) NOT NULL CHECK(tipo_operacao IN ('registro', 'reversao', 'ajuste', 'validacao')),
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

  CONSTRAINT fk_apontamento CHECK(apontamento_id IS NULL OR apontamento_id > 0)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ledger_logs_apontamento ON apontamento_ledger_logs(apontamento_id);
CREATE INDEX IF NOT EXISTS idx_ledger_logs_status ON apontamento_ledger_logs(status);
CREATE INDEX IF NOT EXISTS idx_ledger_logs_data ON apontamento_ledger_logs(criado_em);

-- ============================================================================
-- INSERÇÕES: Mapeamento padrão de contas
-- Segue plano de contas: 5.x = Despesas, 3.x/4.x = Ativos/Passivos
-- ============================================================================

-- Urgência
INSERT OR IGNORE INTO contas_mapeamento_apontamentos
(tipo_apontamento, subcategoria, conta_debito_id, conta_debito_descricao, conta_credito_id, conta_credito_descricao, motivo_criacao)
VALUES
('urgencia', NULL, 27, '5.1.01 Despesa com Remuneração - Urgência', 11, '3.1.05 Adiantamentos a Prestadores', 'Mapeamento inicial - Urgência'),
('urgencia', 'deslocamento', 30, '5.2.01 Despesa com Deslocamento', 11, '3.1.05 Adiantamentos a Prestadores', 'Mapeamento inicial - Deslocamento Urgência');

-- Airbnb
INSERT OR IGNORE INTO contas_mapeamento_apontamentos
(tipo_apontamento, subcategoria, conta_debito_id, conta_debito_descricao, conta_credito_id, conta_credito_descricao, motivo_criacao)
VALUES
('airbnb', NULL, 28, '5.1.02 Despesa com Remuneração - Airbnb', 11, '3.1.05 Adiantamentos a Prestadores', 'Mapeamento inicial - Airbnb');

-- Combustível
INSERT OR IGNORE INTO contas_mapeamento_apontamentos
(tipo_apontamento, subcategoria, conta_debito_id, conta_debito_descricao, conta_credito_id, conta_credito_descricao, motivo_criacao)
VALUES
('combustivel', NULL, 30, '5.2.01 Despesa com Combustível', 11, '3.1.05 Adiantamentos a Prestadores', 'Mapeamento inicial - Combustível');

-- Horas
INSERT OR IGNORE INTO contas_mapeamento_apontamentos
(tipo_apontamento, subcategoria, conta_debito_id, conta_debito_descricao, conta_credito_id, conta_credito_descricao, motivo_criacao)
VALUES
('horas', NULL, 29, '5.1.03 Despesa com Remuneração - Horas', 11, '3.1.05 Adiantamentos a Prestadores', 'Mapeamento inicial - Horas');

-- Empréstimo - Principal
INSERT OR IGNORE INTO contas_mapeamento_apontamentos
(tipo_apontamento, subcategoria, conta_debito_id, conta_debito_descricao, conta_credito_id, conta_credito_descricao, motivo_criacao)
VALUES
('emprestimo', 'principal', 32, '5.3.02 Despesa com Empréstimos Concedidos', 11, '3.1.05 Adiantamentos a Prestadores', 'Mapeamento inicial - Empréstimo Principal');

-- Empréstimo - Juros
INSERT OR IGNORE INTO contas_mapeamento_apontamentos
(tipo_apontamento, subcategoria, conta_debito_id, conta_debito_descricao, conta_credito_id, conta_credito_descricao, motivo_criacao)
VALUES
('emprestimo', 'juros', 31, '5.3.01 Despesa com Juros de Empréstimo', 11, '3.1.05 Adiantamentos a Prestadores', 'Mapeamento inicial - Empréstimo Juros');

-- ============================================================================
-- VIEWS: Relatórios de apoio
-- ============================================================================

-- View: Resumo de apontamentos por período
CREATE VIEW IF NOT EXISTS vw_apontamentos_resumo_periodo AS
SELECT
  ale.entidade_id,
  ale.periodo_id,
  ale.tipo_apontamento,
  COUNT(DISTINCT ale.apontamento_id) as total_apontamentos,
  COUNT(DISTINCT ale.prestador_id) as total_prestadores,
  SUM(ale.valor) as valor_total,
  MIN(ale.data_criacao) as primeira_data,
  MAX(ale.data_criacao) as ultima_data
FROM apontamento_ledger_entries ale
GROUP BY ale.entidade_id, ale.periodo_id, ale.tipo_apontamento;

-- View: Auditoria de operações recentes
CREATE VIEW IF NOT EXISTS vw_ledger_operacoes_recentes AS
SELECT
  all_timestamp,
  apontamento_id,
  tipo_operacao,
  status,
  mensagem,
  ledger_entries_afetadas,
  valor_total
FROM apontamento_ledger_logs
ORDER BY criado_em DESC
LIMIT 100;

-- ============================================================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================================================

/*
TABELAS CRIADAS:

1. apontamento_ledger_entries
   - Rastreamento bidirecional entre apontamento e ledger
   - Permite auditoria completa e reversão
   - Dois lançamentos por apontamento (débito + crédito)

2. contas_mapeamento_apontamentos
   - Política contábil explícita
   - Histórico de mudanças (data_vigencia_inicio/fim)
   - Permite auditoria de políticas mudanças

3. apontamento_ledger_logs
   - Registro de operações (registro, reversão, ajuste)
   - Debugging e investigação de problemas
   - Status: sucesso, erro, aviso

FLUXO:
  1. calcularUrgencia() → ResultadoUrgencia (apontamento-calculos.ts)
  2. registrarApontamentoUrgenciaNoLedger() (apontamento-ledger-integration.ts)
  3. Cria 2 lançamentos: débito + crédito
  4. Registra em apontamento_ledger_entries
  5. DRE fica completo com origem_modulo='apontamento-prestador'

CONTAS UTILIZADAS (Plano de Contas):
  - 5.1.01 Despesa com Remuneração - Urgência (conta_id=27)
  - 5.1.02 Despesa com Remuneração - Airbnb (conta_id=28)
  - 5.1.03 Despesa com Remuneração - Horas (conta_id=29)
  - 5.2.01 Despesa com Combustível (conta_id=30)
  - 5.3.01 Despesa com Juros de Empréstimo (conta_id=31)
  - 5.3.02 Despesa com Empréstimos Concedidos (conta_id=32)
  - 3.1.05 Adiantamentos a Prestadores (conta_id=11)
*/
