-- Migration: Rastreamento de Retificações no Ledger
-- Data: 2026-01-16
-- Descrição: Tabela para mapear retificações contábeis com lançamentos reverso e novo
--            Permite auditoria completa de correções de valor no ledger

CREATE TABLE IF NOT EXISTS retificacao_ledger_mapping (
    id                          INTEGER PRIMARY KEY,
    retificacao_id              INTEGER NOT NULL,
    ledger_entry_reverso_id     INTEGER NOT NULL REFERENCES ledger_entries(id),
    ledger_entry_novo_id        INTEGER NOT NULL REFERENCES ledger_entries(id),
    criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (retificacao_id, ledger_entry_reverso_id, ledger_entry_novo_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_retificacao_ledger_retificacao_id
    ON retificacao_ledger_mapping(retificacao_id);

CREATE INDEX IF NOT EXISTS idx_retificacao_ledger_reverso_id
    ON retificacao_ledger_mapping(ledger_entry_reverso_id);

CREATE INDEX IF NOT EXISTS idx_retificacao_ledger_novo_id
    ON retificacao_ledger_mapping(ledger_entry_novo_id);

-- Comentários descritivos
COMMENT ON TABLE retificacao_ledger_mapping IS
    'Rastreamento de retificações contábeis: mapeia lançamento reverso + lançamento novo para auditoria';

COMMENT ON COLUMN retificacao_ledger_mapping.retificacao_id IS
    'ID da retificação que gerou este mapeamento';

COMMENT ON COLUMN retificacao_ledger_mapping.ledger_entry_reverso_id IS
    'ID do lançamento reverso (anula o débito/crédito original)';

COMMENT ON COLUMN retificacao_ledger_mapping.ledger_entry_novo_id IS
    'ID do novo lançamento com valor corrigido';
