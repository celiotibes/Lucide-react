/**
 * Phase 16: Fila de Revisão Obrigatória por IA
 *
 * Tabela para gerenciar revisões obrigatórias de relatórios, campos e lançamentos.
 *
 * Workflow:
 * 1. Sistema cria item com status='pendente' quando policy trigger (threshold, campo crítico, etc.)
 * 2. Revisor (admin/auditor) acessa fila e marca como 'revisado' ou 'rejeitado'
 * 3. Se 'revisado': permite publicação do relatório
 * 4. Se 'rejeitado': bloqueia e retorna para correção
 * 5. Audit trail completo em auditoria
 *
 * Idempotência: Evitamos duplicatas usando UNIQUE(documento_id, tipo, motivo, data_criacao).
 */

CREATE TABLE IF NOT EXISTS fila_revisao_ia (
  id TEXT PRIMARY KEY,
  documento_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('relatorio', 'campo', 'lancamento')),
  motivo TEXT NOT NULL CHECK(motivo IN (
    'threshold_exceeded',
    'campo_critico',
    'relatorio_sensivel',
    'flagged_by_user',
    'lancamento_alto_valor',
    'mudanca_drástica'
  )),

  -- Quem solicitou a revisão (pode ser o sistema ou um usuário)
  solicitante_id TEXT NOT NULL,

  -- Quem vai revisar (NULL = ainda não atribuído)
  revisor_id TEXT,

  -- Status do item
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN (
    'pendente',
    'revisado',
    'rejeitado',
    'autorizado'
  )),

  -- Descrição/contexto do item sendo revisado
  descricao TEXT,

  -- Dados adicionais em JSON (valores anteriores/novos, etc.)
  dados_adicionais TEXT,

  -- Timestamps
  data_criacao TEXT NOT NULL DEFAULT (datetime('now')),
  data_revisao TEXT,

  -- Se rejeitado, por que?
  motivo_rejeicao TEXT,

  -- Índices para query rápida
  FOREIGN KEY(solicitante_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY(revisor_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  UNIQUE(documento_id, tipo, motivo, datetime(data_criacao))
);

-- Índice para listar pendentes
CREATE INDEX IF NOT EXISTS idx_fila_revisao_status_pendente
  ON fila_revisao_ia(status, data_criacao DESC)
  WHERE status = 'pendente';

-- Índice para listar por revisor
CREATE INDEX IF NOT EXISTS idx_fila_revisao_revisor
  ON fila_revisao_ia(revisor_id, status, data_criacao DESC);

-- Índice para listar por documento
CREATE INDEX IF NOT EXISTS idx_fila_revisao_documento
  ON fila_revisao_ia(documento_id, tipo, status);

-- Índice para buscar itens antigos (limpeza)
CREATE INDEX IF NOT EXISTS idx_fila_revisao_data_criacao
  ON fila_revisao_ia(data_criacao);

-- Tabela de regras de política (configuráveis no futuro)
CREATE TABLE IF NOT EXISTS regras_revisao_ia (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  tipo TEXT NOT NULL CHECK(tipo IN ('relatorio', 'campo', 'lancamento')),
  ativa BOOLEAN NOT NULL DEFAULT 1,

  -- Campos ou relatórios aos quais se aplica (JSON array)
  alvos TEXT,

  -- Threshold (JSON: {percentualMudanca: 10, valorAbsoluto?: 50000})
  threshold TEXT,

  -- Papéis que disparam revisão
  papel_origin TEXT,

  -- Papéis que podem revisar
  papeis_revisor TEXT,

  -- Metadata
  criada_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizada_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índice para buscar regras ativas
CREATE INDEX IF NOT EXISTS idx_regras_revisao_ativas
  ON regras_revisao_ia(ativa, tipo);

-- Dados iniciais: Importar da PoliticaRevisaoIA
-- As regras serão populadas pelo seed ou na inicialização
