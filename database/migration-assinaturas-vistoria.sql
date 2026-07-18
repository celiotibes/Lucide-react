-- Tabela para rastreamento de assinaturas eletrônicas de vistorias (ZapSign)
-- Adiciona suporte a assinaturas ICP-Brasil com trilha de auditoria

create table if not exists assinaturas_vistoria (
  id text primary key,
  vistoria_id text not null references vistorias(id),
  documento_zapsign_uuid text not null unique,
  status text not null default 'criado' check (status in (
    'criado',
    'enviado',
    'aberto_por_vistoriador',
    'assinado_por_vistoriador',
    'aberto_por_inquilino',
    'assinado_por_inquilino',
    'assinado_por_testemunha_1',
    'assinado_por_testemunha_2',
    'completado',
    'cancelado'
  )),
  link_assinatura_vistoriador text,
  link_assinatura_inquilino text,
  data_envio timestamp,
  data_abertura_vistoriador timestamp,
  data_assinatura_vistoriador timestamp,
  data_abertura_inquilino timestamp,
  data_assinatura_inquilino timestamp,
  data_conclusao timestamp,
  motivo_cancelamento text,
  criado_em timestamp not null default now(),
  atualizado_em timestamp not null default now(),

  -- Metadados do certificado
  certificado_metadados jsonb default '{}'::jsonb
);

create index idx_assinaturas_vistoria_vistoria_id on assinaturas_vistoria(vistoria_id);
create index idx_assinaturas_vistoria_status on assinaturas_vistoria(status);
create index idx_assinaturas_vistoria_data_conclusao on assinaturas_vistoria(data_conclusao);

-- Tabela para auditoria de acessos aos documentos de assinatura
create table if not exists auditoria_assinatura_vistoria (
  id uuid primary key default gen_random_uuid(),
  assinatura_id text not null references assinaturas_vistoria(id),
  acao text not null,
  signatario text,
  ip_address inet,
  user_agent text,
  detalhes text,
  criado_em timestamp not null default now()
);

create index idx_auditoria_assinatura_id on auditoria_assinatura_vistoria(assinatura_id);
create index idx_auditoria_criado_em on auditoria_assinatura_vistoria(criado_em);

-- RLS para assinaturas_vistoria
alter table assinaturas_vistoria enable row level security;

create policy "Vistoriador pode ver assinatura da própria vistoria"
  on assinaturas_vistoria
  for select
  using (
    vistoria_id in (
      select id from vistorias where vistoriador_id = auth.uid()
    )
  );

create policy "Inquilino pode ver assinatura do próprio contrato"
  on assinaturas_vistoria
  for select
  using (
    vistoria_id in (
      select v.id from vistorias v
      join contratos c on c.id = v.contrato_id
      where c.inquilino_id = auth.uid()
    )
  );

create policy "Admin pode ver todas as assinaturas"
  on assinaturas_vistoria
  for all
  using (
    (select role from pessoas where id = auth.uid()) = 'admin'
  );

-- RLS para auditoria
alter table auditoria_assinatura_vistoria enable row level security;

create policy "Usuários podem ver auditoria de documentos que acessam"
  on auditoria_assinatura_vistoria
  for select
  using (
    assinatura_id in (
      select id from assinaturas_vistoria
      where vistoria_id in (
        select id from vistorias where vistoriador_id = auth.uid()
      )
      or vistoria_id in (
        select v.id from vistorias v
        join contratos c on c.id = v.contrato_id
        where c.inquilino_id = auth.uid()
      )
    )
  );

create policy "Admin pode ver toda a auditoria"
  on auditoria_assinatura_vistoria
  for all
  using (
    (select role from pessoas where id = auth.uid()) = 'admin'
  );

-- Webhook para atualizar status de assinatura (triggers)
create or replace function atualizar_assinatura_ao_mudar_vistoria()
returns trigger as $$
begin
  if new.modo != old.modo and new.modo = 'saida' then
    insert into assinaturas_vistoria (
      id, vistoria_id, documento_zapsign_uuid, status, criado_em, atualizado_em
    ) values (
      'sig-auto-' || new.id || '-' || extract(epoch from now())::text,
      new.id,
      'pending-' || new.id,
      'criado',
      now(),
      now()
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_criar_assinatura_vistoria
after update of modo on vistorias
for each row
execute function atualizar_assinatura_ao_mudar_vistoria();
