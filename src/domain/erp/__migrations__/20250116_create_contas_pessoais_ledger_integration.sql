-- Migration: Contas Pessoais Ledger Integration
-- Purpose: Map personal account movements to ledger entries with dual-entry bookkeeping
-- Date: 2026-01-16

PRAGMA foreign_keys = ON;

-- Mapeamento de tipos de movimentos pessoais para contas contábeis
-- Rastreia qual movimento pessoal foi sincronizado para qual lançamento contábil
CREATE TABLE IF NOT EXISTS contas_pessoais_ledger_mapping (
    id                      INTEGER PRIMARY KEY,
    movimento_pessoal_id    INTEGER NOT NULL,
    conta_pessoal_id        INTEGER NOT NULL,
    ledger_entry_debito_id  INTEGER,
    ledger_entry_credito_id INTEGER,
    tipo_movimento          TEXT NOT NULL CHECK (tipo_movimento IN ('deposito', 'saque', 'transferencia_origem', 'transferencia_destino')),
    origem_modulo           TEXT DEFAULT 'contas-pessoais',

    -- Mapeamento: qual conta contábil usar para débito/crédito
    conta_id_debito         INTEGER NOT NULL REFERENCES contas_plano_contas(id),
    conta_id_credito        INTEGER NOT NULL REFERENCES contas_plano_contas(id),

    -- Tracking
    hash_provenance         TEXT UNIQUE,  -- SHA-256 hash para evitar duplicação
    status                  TEXT DEFAULT 'sucesso' CHECK (status IN ('sucesso', 'erro', 'duplicado')),
    mensagem_erro           TEXT,

    -- Datas de efetividade (a conta pode mudar ao longo do tempo)
    data_efetiva_inicio     TEXT NOT NULL,
    data_efetiva_fim        TEXT,

    -- Auditoria
    criado_em               TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em           TEXT,
    criado_por              INTEGER,

    FOREIGN KEY (movimento_pessoal_id) REFERENCES movimentos_pessoais(id),
    FOREIGN KEY (conta_pessoal_id) REFERENCES contas_pessoais(id),
    FOREIGN KEY (ledger_entry_debito_id) REFERENCES ledger_entries(id),
    FOREIGN KEY (ledger_entry_credito_id) REFERENCES ledger_entries(id)
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_cpilm_movimento ON contas_pessoais_ledger_mapping(movimento_pessoal_id);
CREATE INDEX IF NOT EXISTS idx_cpilm_conta ON contas_pessoais_ledger_mapping(conta_pessoal_id);
CREATE INDEX IF NOT EXISTS idx_cpilm_status ON contas_pessoais_ledger_mapping(status);
CREATE INDEX IF NOT EXISTS idx_cpilm_hash ON contas_pessoais_ledger_mapping(hash_provenance);
CREATE INDEX IF NOT EXISTS idx_cpilm_tipo ON contas_pessoais_ledger_mapping(tipo_movimento);

-- Tabela de sincronização (log de tentativas de sincronização)
CREATE TABLE IF NOT EXISTS contas_pessoais_sincronizacao_log (
    id                      INTEGER PRIMARY KEY,
    movimento_pessoal_id    INTEGER NOT NULL,
    conta_pessoal_id        INTEGER NOT NULL,
    tipo_sincronizacao      TEXT NOT NULL CHECK (tipo_sincronizacao IN ('registrar', 'batch_sync', 'correcao')),
    status                  TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'sucesso', 'erro', 'duplicado')),
    mensagem                TEXT,
    tentativas              INTEGER DEFAULT 1,

    -- Rastreamento
    criado_em               TEXT NOT NULL DEFAULT (datetime('now')),
    processado_em           TEXT,
    criado_por              INTEGER,

    FOREIGN KEY (movimento_pessoal_id) REFERENCES movimentos_pessoais(id),
    FOREIGN KEY (conta_pessoal_id) REFERENCES contas_pessoais(id)
);

-- Índice para busca de sincronizações pendentes
CREATE INDEX IF NOT EXISTS idx_cpsl_status ON contas_pessoais_sincronizacao_log(status);
CREATE INDEX IF NOT EXISTS idx_cpsl_movimento ON contas_pessoais_sincronizacao_log(movimento_pessoal_id);
