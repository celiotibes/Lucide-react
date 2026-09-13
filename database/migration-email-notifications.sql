-- Tabela de auditoria para rastrear envios de emails
-- Suporta notificações de:
-- - Vencimento de seguro-incêndio
-- - Direito de preferência
-- - Confirmações de chamado de suporte

create table if not exists auditoria_emails (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'seguro_vencimento',
    'direito_preferencia',
    'chamado_confirmacao'
  )),
  destinatario text not null,
  assunto text not null,
  corpo text,

  -- Foreign keys para rastreamento
  contrato_id uuid references contratos(id) on delete cascade,
  notificacao_preferencia_id uuid references notificacoes_preferencia_venda(id) on delete cascade,
  chamado_id uuid references chamados(id) on delete cascade,

  -- Status de entrega
  status text not null default 'enviado' check (status in ('enviado', 'falha', 'rejeitado')),
  erro_mensagem text,
  resend_message_id text,

  -- Timestamps
  enviado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

-- Índices para buscas rápidas
create index idx_auditoria_emails_tipo on auditoria_emails(tipo);
create index idx_auditoria_emails_contrato_id on auditoria_emails(contrato_id);
create index idx_auditoria_emails_notificacao_id on auditoria_emails(notificacao_preferencia_id);
create index idx_auditoria_emails_chamado_id on auditoria_emails(chamado_id);
create index idx_auditoria_emails_data on auditoria_emails(enviado_em desc);

-- RLS: Permitir leitura apenas para proprietários e admin
alter table auditoria_emails enable row level security;

create policy "admin_can_read_all_emails"
  on auditoria_emails for select
  using (auth.jwt() ->> 'role' = 'admin');

-- Adicionar colunas faltantes às tabelas de compliance se necessário
alter table notificacoes_preferencia_venda
  add column if not exists data_notificacao_enviada timestamptz,
  add column if not exists data_resposta timestamptz,
  add column if not exists data_expiracao date;

-- Adicionar índices para performance de alertas
create index if not exists idx_garantias_seguro_vencimento
  on garantias(data_vencimento_apolice)
  where tipo = 'seguro_incendio' and status = 'ativa';

create index if not exists idx_notificacoes_preferencia_pendentes
  on notificacoes_preferencia_venda(notificado_em, prazo_resposta_dias)
  where resposta is null;
