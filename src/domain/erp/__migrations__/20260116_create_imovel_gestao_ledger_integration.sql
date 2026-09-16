-- Migration: Imovel Gestao → Ledger Integration
-- Data: 2026-01-16
-- Descrição: Criar tabela de rastreamento bidirecional entre imóveis e ledger central
-- Objetivo: Sincronizar despesas operacionais e receitas de aluguel para o ledger centralizado

-- ============================================================================
-- TABELA: sincronizacoes_imovel_ledger
-- Rastreamento bidirecional imovel ↔ ledger
-- ============================================================================
CREATE TABLE IF NOT EXISTS sincronizacoes_imovel_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Referência ao imóvel e tipo de movimento
  imovel_id INTEGER NOT NULL,
  tipo_movimento VARCHAR(20) NOT NULL CHECK(tipo_movimento IN ('despesa', 'receita', 'arrecadacao')),
  subtipo VARCHAR(50) NOT NULL, -- 'condominio', 'aluguel', 'taxa_condominial', etc.

  -- Referência ao ledger (lançamento contábil duplo)
  ledger_entry_id INTEGER,
  ledger_entry_id_contrapartida INTEGER,

  -- Metadados
  origem_modulo VARCHAR(50) NOT NULL CHECK(origem_modulo = 'imovel-gestao'),
  status VARCHAR(20) NOT NULL CHECK(status IN ('sucesso', 'erro', 'duplicado')),

  -- Rastreamento de provenance para evitar duplicação
  hash_provenance VARCHAR(64),

  -- Log de erro e tentativas
  mensagem_erro TEXT,
  tentativas INTEGER DEFAULT 1,

  -- Auditoria
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys (soft references para manter integridade mínima)
  -- FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id)
  -- FOREIGN KEY (imovel_id) REFERENCES imoveis(id)

  CONSTRAINT unique_imovel_ledger_hash UNIQUE(hash_provenance)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_imovel_ledger_imovel_id ON sincronizacoes_imovel_ledger(imovel_id);
CREATE INDEX IF NOT EXISTS idx_imovel_ledger_tipo ON sincronizacoes_imovel_ledger(tipo_movimento);
CREATE INDEX IF NOT EXISTS idx_imovel_ledger_subtipo ON sincronizacoes_imovel_ledger(subtipo);
CREATE INDEX IF NOT EXISTS idx_imovel_ledger_status ON sincronizacoes_imovel_ledger(status);
CREATE INDEX IF NOT EXISTS idx_imovel_ledger_data ON sincronizacoes_imovel_ledger(criado_em);
CREATE INDEX IF NOT EXISTS idx_imovel_ledger_imovel_tipo ON sincronizacoes_imovel_ledger(imovel_id, tipo_movimento, subtipo);

-- ============================================================================
-- TABELA: imovel_gestao_ledger_mapping
-- Mapeamento explícito de tipos de despesa → contas contábeis + centro de custo
-- Permite auditoria e rastreamento de mudanças na política contábil
-- ============================================================================
CREATE TABLE IF NOT EXISTS imovel_gestao_ledger_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Referência ao imóvel (opcional para mapeamento global)
  imovel_id INTEGER,

  -- Tipo de despesa/receita
  tipo_despesa VARCHAR(50) NOT NULL, -- 'condominio', 'agua', 'energia', 'aluguel', etc.

  -- Mapeamento contábil
  conta_id_debito INTEGER NOT NULL,
  conta_id_debito_descricao TEXT,

  conta_id_credito INTEGER NOT NULL,
  conta_id_credito_descricao TEXT,

  -- Centro de custo (opcional)
  centro_custo_id INTEGER,
  centro_custo_descricao TEXT,

  -- Vigência do mapeamento
  data_vigencia_inicio DATE DEFAULT CURRENT_DATE,
  data_vigencia_fim DATE,
  ativo BOOLEAN DEFAULT 1,

  -- Auditoria
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  criado_por INTEGER,
  motivo_criacao TEXT,

  CONSTRAINT unique_mapeamento UNIQUE(imovel_id, tipo_despesa, data_vigencia_inicio)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mapping_imovel ON imovel_gestao_ledger_mapping(imovel_id);
CREATE INDEX IF NOT EXISTS idx_mapping_tipo_despesa ON imovel_gestao_ledger_mapping(tipo_despesa);
CREATE INDEX IF NOT EXISTS idx_mapping_ativo ON imovel_gestao_ledger_mapping(ativo, data_vigencia_inicio);
CREATE INDEX IF NOT EXISTS idx_mapping_conta_debito ON imovel_gestao_ledger_mapping(conta_id_debito);

-- ============================================================================
-- TABELA: imovel_gestao_ledger_logs
-- Registro detalhado de cada operação de persistência
-- Útil para debugging e auditoria de mudanças no ledger
-- ============================================================================
CREATE TABLE IF NOT EXISTS imovel_gestao_ledger_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  imovel_id INTEGER NOT NULL,
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

  CONSTRAINT fk_imovel CHECK(imovel_id > 0)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_logs_imovel ON imovel_gestao_ledger_logs(imovel_id);
CREATE INDEX IF NOT EXISTS idx_logs_status ON imovel_gestao_ledger_logs(status);
CREATE INDEX IF NOT EXISTS idx_logs_data ON imovel_gestao_ledger_logs(criado_em);
CREATE INDEX IF NOT EXISTS idx_logs_operacao ON imovel_gestao_ledger_logs(tipo_operacao);

-- ============================================================================
-- INSERÇÕES: Mapeamento padrão de contas
-- Segue plano de contas: 5.x = Despesas, 3.x/4.x = Passivos/Receitas
-- ============================================================================

-- Condominial
INSERT OR IGNORE INTO imovel_gestao_ledger_mapping
(tipo_despesa, conta_id_debito, conta_id_debito_descricao, conta_id_credito, conta_id_credito_descricao, motivo_criacao)
VALUES
('condominio', 5210, '5.2.10 Despesa com Condomínio', 3102, '3.1.02 Contas a Pagar', 'Mapeamento inicial - Condominial');

-- Água
INSERT OR IGNORE INTO imovel_gestao_ledger_mapping
(tipo_despesa, conta_id_debito, conta_id_debito_descricao, conta_id_credito, conta_id_credito_descricao, motivo_criacao)
VALUES
('agua', 5207, '5.2.07 Despesa com Água', 3102, '3.1.02 Contas a Pagar', 'Mapeamento inicial - Água');

-- Energia
INSERT OR IGNORE INTO imovel_gestao_ledger_mapping
(tipo_despesa, conta_id_debito, conta_id_debito_descricao, conta_id_credito, conta_id_credito_descricao, motivo_criacao)
VALUES
('energia', 5206, '5.2.06 Despesa com Energia Elétrica', 3102, '3.1.02 Contas a Pagar', 'Mapeamento inicial - Energia');

-- Internet
INSERT OR IGNORE INTO imovel_gestao_ledger_mapping
(tipo_despesa, conta_id_debito, conta_id_debito_descricao, conta_id_credito, conta_id_credito_descricao, motivo_criacao)
VALUES
('internet', 5212, '5.2.12 Despesa com Internet/Telecomunicações', 3102, '3.1.02 Contas a Pagar', 'Mapeamento inicial - Internet');

-- Seguros
INSERT OR IGNORE INTO imovel_gestao_ledger_mapping
(tipo_despesa, conta_id_debito, conta_id_debito_descricao, conta_id_credito, conta_id_credito_descricao, motivo_criacao)
VALUES
('seguros', 5213, '5.2.13 Despesa com Seguros', 3102, '3.1.02 Contas a Pagar', 'Mapeamento inicial - Seguros');

-- Manutenção
INSERT OR IGNORE INTO imovel_gestao_ledger_mapping
(tipo_despesa, conta_id_debito, conta_id_debito_descricao, conta_id_credito, conta_id_credito_descricao, motivo_criacao)
VALUES
('manutencao', 5205, '5.2.05 Despesa com Manutenção', 3102, '3.1.02 Contas a Pagar', 'Mapeamento inicial - Manutenção');

-- Reforma
INSERT OR IGNORE INTO imovel_gestao_ledger_mapping
(tipo_despesa, conta_id_debito, conta_id_debito_descricao, conta_id_credito, conta_id_credito_descricao, motivo_criacao)
VALUES
('reforma', 1205, '1.2.05 Imóveis (Ativo Imobilizado)', 3102, '3.1.02 Contas a Pagar', 'Mapeamento inicial - Reforma');

-- Aluguel (Entrada de caixa)
INSERT OR IGNORE INTO imovel_gestao_ledger_mapping
(tipo_despesa, conta_id_debito, conta_id_debito_descricao, conta_id_credito, conta_id_credito_descricao, motivo_criacao)
VALUES
('aluguel_entrada', 1101, '1.1.01 Caixa', 4101, '4.1.01 Receita de Aluguel', 'Mapeamento inicial - Aluguel Entrada');

-- Aluguel (Despesa alocada)
INSERT OR IGNORE INTO imovel_gestao_ledger_mapping
(tipo_despesa, conta_id_debito, conta_id_debito_descricao, conta_id_credito, conta_id_credito_descricao, motivo_criacao)
VALUES
('aluguel_despesa', 5105, '5.1.05 Aluguel (Despesa Alocada)', 4101, '4.1.01 Receita de Aluguel', 'Mapeamento inicial - Aluguel Despesa');

-- Arrecadação de Taxa
INSERT OR IGNORE INTO imovel_gestao_ledger_mapping
(tipo_despesa, conta_id_debito, conta_id_debito_descricao, conta_id_credito, conta_id_credito_descricao, motivo_criacao)
VALUES
('arrecadacao_taxa', 1101, '1.1.01 Caixa', 3102, '3.1.02 Contas a Pagar', 'Mapeamento inicial - Arrecadação de Taxa');

-- ============================================================================
-- VIEWS: Relatórios de apoio
-- ============================================================================

-- View: Resumo de imóveis por período
CREATE VIEW IF NOT EXISTS vw_imovel_resumo_periodo AS
SELECT
  sil.imovel_id,
  sil.tipo_movimento,
  sil.subtipo,
  COUNT(DISTINCT sil.imovel_id) as total_registros,
  COUNT(CASE WHEN sil.status = 'sucesso' THEN 1 END) as sucessos,
  COUNT(CASE WHEN sil.status = 'erro' THEN 1 END) as erros,
  COUNT(CASE WHEN sil.status = 'duplicado' THEN 1 END) as duplicados,
  MIN(sil.criado_em) as primeira_data,
  MAX(sil.criado_em) as ultima_data
FROM sincronizacoes_imovel_ledger sil
GROUP BY sil.imovel_id, sil.tipo_movimento, sil.subtipo;

-- View: Saldos consolidados por imóvel
CREATE VIEW IF NOT EXISTS vw_imovel_saldos_consolidados AS
SELECT
  le.origem_id as imovel_id,
  le.conta_id,
  CASE
    WHEN le.conta_id = 5210 THEN 'condominio'
    WHEN le.conta_id = 5207 THEN 'agua'
    WHEN le.conta_id = 5206 THEN 'energia'
    WHEN le.conta_id = 5212 THEN 'internet'
    WHEN le.conta_id = 5213 THEN 'seguros'
    WHEN le.conta_id = 5205 THEN 'manutencao'
    WHEN le.conta_id = 1205 THEN 'reforma'
    WHEN le.conta_id = 4101 THEN 'receita_aluguel'
    ELSE 'outro'
  END as tipo_despesa,
  le.periodo_id,
  SUM(COALESCE(le.valor_debito, 0)) as total_debito,
  SUM(COALESCE(le.valor_credito, 0)) as total_credito,
  SUM(COALESCE(le.valor_debito, 0)) - SUM(COALESCE(le.valor_credito, 0)) as saldo_liquido
FROM ledger_entries le
WHERE le.origem_modulo = 'imovel-gestao'
GROUP BY le.origem_id, le.conta_id, le.periodo_id;

-- ============================================================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================================================

/*
TABELAS CRIADAS:

1. sincronizacoes_imovel_ledger
   - Rastreamento bidirecional entre imóvel e ledger
   - Permite auditoria completa e reversão
   - Dois lançamentos por movimento (débito + crédito)
   - Status: sucesso, erro, duplicado

2. imovel_gestao_ledger_mapping
   - Política contábil explícita por tipo de despesa/receita
   - Histórico de mudanças (data_vigencia_inicio/fim)
   - Permite auditoria de mudanças nas políticas contábeis
   - Suporta mapeamento global ou por imóvel

3. imovel_gestao_ledger_logs
   - Registro de operações (registro, reversão, ajuste)
   - Debugging e investigação de problemas
   - Status: sucesso, erro, aviso

FLUXO DE DESPESAS OPERACIONAIS:
  1. DespesaOperacional (despesas_operacionais_agendadas)
  2. registrarDespesaImovelNoLedger() (imovel-gestao-ledger-integration.ts)
  3. Cria 2 lançamentos: débito (conta de despesa) + crédito (contas a pagar)
  4. Registra em sincronizacoes_imovel_ledger
  5. DRE fica completo com origem_modulo='imovel-gestao'

FLUXO DE RECEITAS DE ALUGUEL:
  1. ReceitaAluguel
  2. registrarReceitaAluguelNoLedger() (imovel-gestao-ledger-integration.ts)
  3. Cria 2 lançamentos: débito (caixa) + crédito (receita de aluguel)
  4. Registra em sincronizacoes_imovel_ledger

FLUXO DE ARRECADAÇÃO DE TAXA:
  1. ArrecadacaoTaxa
  2. registrarArrecadacaoTaxaNoLedger() (imovel-gestao-ledger-integration.ts)
  3. Cria 2 lançamentos: débito (caixa) + crédito (contas a pagar)
  4. Registra em sincronizacoes_imovel_ledger

CONTAS UTILIZADAS (Plano de Contas - Versão 2026):
  DESPESAS:
  - 5.2.05 Despesa com Manutenção (conta_id=5205)
  - 5.2.06 Despesa com Energia Elétrica (conta_id=5206)
  - 5.2.07 Despesa com Água (conta_id=5207)
  - 5.2.10 Despesa com Condomínio (conta_id=5210)
  - 5.2.12 Despesa com Internet/Telecomunicações (conta_id=5212)
  - 5.2.13 Despesa com Seguros (conta_id=5213)
  - 5.2.14 Outras Despesas com Imóveis (conta_id=5214)

  ATIVO:
  - 1.1.01 Caixa (conta_id=1101)
  - 1.2.05 Imóveis (conta_id=1205)

  RECEITAS:
  - 4.1.01 Receita de Aluguel (conta_id=4101)

  PASSIVOS:
  - 3.1.02 Contas a Pagar (conta_id=3102)

  DESPESAS ALOCADAS:
  - 5.1.05 Aluguel (conta_id=5105)
*/
