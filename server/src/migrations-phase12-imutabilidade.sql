-- ============================================================================
-- IMUTABILIDADE: TRIGGERS PARA INTEGRIDADE CONTÁBIL DO RAZÃO (FASE 12)
-- ============================================================================
-- Implementa bloqueios de alteração/exclusão para garantir que lançamentos
-- contábeis (tabela razao) não sejam modificados após criação, e que
-- transições de status sejam controladas.
--
-- Problema corrigido: não havia CREATE TRIGGER no repo. A tabela razao
-- (em migrations-phase8-conciliacao-pix-ofx.sql:128) aceitava UPDATE/DELETE
-- livremente, sem controle de imutabilidade.

-- ============================================================================
-- TRIGGERS PARA RAZAO TABLE
-- ============================================================================

-- Bloqueia DELETE de linhas não-rascunho em razao
CREATE TRIGGER IF NOT EXISTS tg_razao_no_delete_confirmado
BEFORE DELETE ON razao
FOR EACH ROW
WHEN (OLD.status IS NOT NULL AND OLD.status != 'rascunho')
BEGIN
  SELECT RAISE(ABORT, 'Somente lançamentos em rascunho podem ser excluídos.');
END;

-- Bloqueia UPDATE para status IS NOT 'rascunho' que não seja transição rascunho->confirmado
CREATE TRIGGER IF NOT EXISTS tg_razao_transicao_status
BEFORE UPDATE ON razao
FOR EACH ROW
WHEN (
  -- Permite UPDATE se status atual é 'rascunho' e novo status é 'confirmado'
  NOT (OLD.status = 'rascunho' AND NEW.status = 'confirmado')
  -- Bloqueia qualquer outro UPDATE que envolva mudança de status
  AND NEW.status IS NOT OLD.status
)
BEGIN
  SELECT RAISE(ABORT, 'Transição de status inválida. Apenas rascunho->confirmado é permitida.');
END;

-- Bloqueia UPDATE de colunas de dados em lançamentos
-- (só permite UPDATE de status para transição rascunho->confirmado)
CREATE TRIGGER IF NOT EXISTS tg_razao_no_update_confirmado
BEFORE UPDATE ON razao
FOR EACH ROW
WHEN (
  -- Bloqueia mudança de dados contábeis em qualquer situação
  (
    NEW.conta_credito IS NOT OLD.conta_credito
    OR NEW.conta_debito IS NOT OLD.conta_debito
    OR NEW.valor IS NOT OLD.valor
    OR NEW.tipo IS NOT OLD.tipo
    OR NEW.referencia_id IS NOT OLD.referencia_id
    OR NEW.conciliacao_pix_ofx_id IS NOT OLD.conciliacao_pix_ofx_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'Dados de lançamento não podem ser alterados. Lançamentos são imutáveis: corrija por novo lançamento.');
END;
