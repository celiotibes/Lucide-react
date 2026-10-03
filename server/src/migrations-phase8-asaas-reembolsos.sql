/**
 * Phase 8: Sistema de reembolsos/devoluções em Asaas com idempotência.
 *
 * Adiciona:
 * 1. Tabela `reembolsos_asaas` para rastreamento de devoluções
 * 2. Novo status 'reembolsado' em `cobrancas_asaas.status`
 * 3. UNIQUE constraint em (origem_tipo, origem_id) para idempotência
 * 4. Índices para performance
 *
 * Migração idempotente — todas as operações usam IF NOT EXISTS/IF NOT NULL.
 */

-- Estende enum de status em cobrancas_asaas para incluir 'reembolsado'
-- (SQLite não tem tipo enum; verificamos via CHECK constraint)

-- Tabela de rastreamento de reembolsos/devoluções
CREATE TABLE IF NOT EXISTS reembolsos_asaas (
  id                        INTEGER PRIMARY KEY,
  asaas_charge_id           TEXT NOT NULL UNIQUE REFERENCES cobrancas_asaas(asaas_charge_id),
  motivo                    TEXT NOT NULL,
  tipo                      TEXT NOT NULL CHECK (tipo IN ('reversao', 'devolucao')),
  status                    TEXT NOT NULL DEFAULT 'processando' CHECK (status IN ('processando', 'sucesso', 'erro')),
  data_processamento        DATE NOT NULL,
  origem_tipo               TEXT NOT NULL CHECK (origem_tipo IN ('aluguel_competencia', 'honorario_advocaticio')),
  origem_id                 INTEGER NOT NULL,
  mensagem_erro             TEXT,
  criado_em                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (origem_tipo, origem_id)  -- Idempotência: impede reemissão acidental
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_reembolsos_asaas_tipo ON reembolsos_asaas(tipo);
CREATE INDEX IF NOT EXISTS idx_reembolsos_asaas_status ON reembolsos_asaas(status);
CREATE INDEX IF NOT EXISTS idx_reembolsos_asaas_data ON reembolsos_asaas(data_processamento DESC);
CREATE INDEX IF NOT EXISTS idx_reembolsos_asaas_origem ON reembolsos_asaas(origem_tipo, origem_id);
CREATE INDEX IF NOT EXISTS idx_reembolsos_asaas_charge ON reembolsos_asaas(asaas_charge_id);

-- Atualiza constraint de status em cobrancas_asaas
-- Nota: SQLite não permite ALTER TABLE CHECK constraints facilmente,
-- então a validação 'reembolsado' é feita em código da aplicação.
-- A aplicação NUNCA deve usar trigger ou stored procedure para validação
-- (SQLite/sql.js não suporta PL/SQL); tudo fica em TypeScript.

-- Índice adicional em cobrancas_asaas para performance em queries de reembolso
CREATE INDEX IF NOT EXISTS idx_cobrancas_asaas_charge_id ON cobrancas_asaas(asaas_charge_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_asaas_status_v2 ON cobrancas_asaas(status, criado_em DESC);
