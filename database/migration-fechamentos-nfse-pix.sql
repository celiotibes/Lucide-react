-- Migração incremental: colunas de NFS-e/PIX em fechamentos_prestador.
--
-- Contexto: app/actions/prestador/nfse.ts, app/actions/prestador/pix.ts,
-- app/api/webhooks/asaas/nfse/route.ts, app/api/webhooks/asaas/pix/route.ts
-- e as telas de gestão de fechamentos (app/painel-gestao/fechamentos/*,
-- app/admin/prestadores/*) leem/gravam estas colunas, mas elas nunca
-- tinham sido adicionadas à tabela — só existiam em views-analytics.sql
-- (que já cria os índices de pix_status/nfse_status com "if not exists",
-- então falhava silenciosamente sem as colunas por trás).
--
-- Rode este script uma vez em qualquer banco cuja tabela
-- fechamentos_prestador já exista sem estas colunas (bancos criados antes
-- desta correção). Em uma criação nova a partir de schema.sql, elas já
-- vêm na definição da tabela e este script não tem efeito (idempotente).

alter table fechamentos_prestador
  add column if not exists motivo_devolucao text,
  add column if not exists nfse_id text,
  add column if not exists nfse_url text,
  add column if not exists nfse_protocolo text,
  add column if not exists pix_id text,
  add column if not exists pix_enviado_em timestamptz,
  add column if not exists pix_confirmado_em timestamptz,
  add column if not exists pix_motivo_devolucao text;

-- nfse_status/pix_status via bloco DO: "add column if not exists" não
-- aceita "check" inline sem risco de erro se a coluna já existir sem a
-- constraint; adicionamos a coluna e a constraint em passos separados,
-- cada um idempotente.
alter table fechamentos_prestador
  add column if not exists nfse_status text;

alter table fechamentos_prestador
  add column if not exists pix_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fechamentos_prestador_nfse_status_check'
  ) then
    alter table fechamentos_prestador
      add constraint fechamentos_prestador_nfse_status_check
      check (nfse_status in ('emitida', 'processada', 'cancelada'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fechamentos_prestador_pix_status_check'
  ) then
    alter table fechamentos_prestador
      add constraint fechamentos_prestador_pix_status_check
      check (pix_status in ('enviado', 'confirmado', 'devolvido', 'expirado'));
  end if;
end $$;
