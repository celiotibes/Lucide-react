-- Tabela de auditoria para notificações via WhatsApp (Twilio)
-- Rastreia envio, entrega e leitura de mensagens

create table if not exists auditoria_whatsapp (
  id uuid primary key default gen_random_uuid(),
  numero_celular varchar(20) not null,
  tipo_notificacao varchar(50) not null check (
    tipo_notificacao in ('lembrete_pagamento', 'confirmacao_pagamento', 'alerta_atraso',
                         'notificacao_preferencia', 'outro')
  ),
  mensagem text not null,
  message_sid varchar(100) not null unique, -- ID da mensagem no Twilio
  status varchar(20) default 'queued' check (
    status in ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'read')
  ),
  status_atualizado_em timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Índices
create index if not exists idx_auditoria_whatsapp_numero on auditoria_whatsapp(numero_celular);
create index if not exists idx_auditoria_whatsapp_message_sid on auditoria_whatsapp(message_sid);
create index if not exists idx_auditoria_whatsapp_tipo on auditoria_whatsapp(tipo_notificacao);
create index if not exists idx_auditoria_whatsapp_status on auditoria_whatsapp(status);
create index if not exists idx_auditoria_whatsapp_created on auditoria_whatsapp(created_at);

-- RLS
alter table auditoria_whatsapp enable row level security;

create policy "admin_can_read_whatsapp_audit" on auditoria_whatsapp
  as permissive for select
  using (
    exists (
      select 1 from auth.users
      where auth.users.id = auth.uid()
        and auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Tabela de templates de mensagem (para reutilização)
create table if not exists templates_notificacao_whatsapp (
  id uuid primary key default gen_random_uuid(),
  tipo varchar(50) not null unique,
  conteudo_template text not null,
  variaveis_esperadas text[], -- array de nomes de variáveis [{nome_contato}, {valor}, etc]
  ativo boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table templates_notificacao_whatsapp enable row level security;

create policy "admin_can_manage_templates" on templates_notificacao_whatsapp
  as permissive for all
  using (
    exists (
      select 1 from auth.users
      where auth.users.id = auth.uid()
        and auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Tabela de preferências de notificação (opt-in/opt-out)
create table if not exists preferencias_notificacao_whatsapp (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  numero_celular varchar(20) not null,
  notificacoes_ativas boolean default true,
  tipos_desejados text[], -- array de tipos de notificação aceitos
  horario_preferido_inicio time default '09:00',
  horario_preferido_fim time default '20:00',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_pref_notif_pessoa_id on preferencias_notificacao_whatsapp(pessoa_id);

alter table preferencias_notificacao_whatsapp enable row level security;

create policy "usuarios_podem_gerenciar_suas_prefs" on preferencias_notificacao_whatsapp
  as permissive for all
  using (
    pessoa_id in (
      select id from pessoas
      where auth_id = auth.uid()
    )
  )
  with check (
    pessoa_id in (
      select id from pessoas
      where auth_id = auth.uid()
    )
  );

create policy "admin_can_manage_all_prefs" on preferencias_notificacao_whatsapp
  as permissive for all
  using (
    exists (
      select 1 from auth.users
      where auth.users.id = auth.uid()
        and auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );
