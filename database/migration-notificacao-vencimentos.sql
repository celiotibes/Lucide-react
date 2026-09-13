-- ============================================================================
-- Migration: Add contract expiry notification tracking
-- ============================================================================
-- Adds tracking field for contract expiry notifications to prevent duplicate
-- sends while allowing re-notification for future contract cycles.

alter table contratos
  add column if not exists notificacao_vencimento_enviada_em timestamptz;

-- Index for querying pending notifications efficiently
create index if not exists idx_contratos_notificacao_vencimento_pendente
  on contratos(data_fim)
  where status = 'ativo' and notificacao_vencimento_enviada_em is null;

-- Resets notification flag when contract is manually re-opened (status change from encerrado)
-- This allows re-notification for renewed contracts
create or replace function fn_reset_notificacao_vencimento()
returns trigger as $$
begin
  if old.status in ('encerrado', 'extrajudicial', 'em_despejo')
     and new.status = 'ativo' then
    new.notificacao_vencimento_enviada_em := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_reset_notificacao_vencimento on contratos;
create trigger trigger_reset_notificacao_vencimento
  before update on contratos
  for each row
  execute function fn_reset_notificacao_vencimento();
