-- Migração incremental: documentos anexados, análise por IA, vistorias
-- (camada de aplicação), motor de reajuste, reequilíbrio trienal (Art. 19
-- da Lei 8.245/91) e notificação antecipada de renovação.
--
-- Rode este script uma vez em qualquer banco criado ANTES desta feature.
-- Cada bloco usa "if not exists" / checagem de pg_constraint, então rodar
-- de novo (ou rodar num banco criado do zero a partir do schema.sql atual,
-- que já inclui todas essas tabelas) não tem efeito — é seguro repetir.

-- ============================================================================
-- Fase 1: documentos_anexados
-- ============================================================================
create table if not exists documentos_anexados (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid references contratos(id),
  tipo text not null check (tipo in
    ('contrato_assinado','aditivo','comunicacao_renovacao','comunicacao_negociacao','outro')),
  nome_arquivo text not null,
  mime_type text not null,
  tamanho_bytes bigint not null check (tamanho_bytes > 0),
  hash_sha256 text not null unique,
  storage_path text not null,
  texto_extraido_md text,
  status_extracao text not null default 'pendente'
    check (status_extracao in ('pendente','processando','concluida','falhou')),
  erro_extracao text,
  enviado_por uuid references pessoas(id),
  criado_em timestamptz not null default now()
);

create index if not exists idx_documentos_anexados_contrato on documentos_anexados(contrato_id);

alter table documentos_anexados enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'documentos_anexados' and policyname = 'admin_full_access_documentos_anexados') then
    create policy admin_full_access_documentos_anexados on documentos_anexados
      for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_documentos_anexados') then
    create trigger trg_audit_documentos_anexados after insert or update or delete on documentos_anexados
      for each row execute function fn_audit_trigger();
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos',
  'documentos',
  false,
  26214400,
  array['application/pdf','image/jpeg','image/png','image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'admin_upload_documentos') then
    create policy admin_upload_documentos on storage.objects
      for insert to authenticated
      with check (bucket_id = 'documentos' and fn_eh_admin_ou_economista());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'admin_leitura_documentos') then
    create policy admin_leitura_documentos on storage.objects
      for select to authenticated
      using (bucket_id = 'documentos' and fn_eh_admin_ou_economista());
  end if;
end $$;

-- ============================================================================
-- Fase 4: extracoes_documento_ia
-- ============================================================================
create table if not exists extracoes_documento_ia (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos_anexados(id) on delete cascade,
  contrato_id uuid references contratos(id),
  modelo_ia text not null,
  dados_extraidos jsonb,
  erro_ia text,
  status text not null default 'pendente_revisao'
    check (status in ('pendente_revisao','aprovada','rejeitada','falhou')),
  campos_aplicados jsonb,
  revisado_por uuid references pessoas(id),
  revisado_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists idx_extracoes_documento_ia_documento on extracoes_documento_ia(documento_id);
create index if not exists idx_extracoes_documento_ia_contrato on extracoes_documento_ia(contrato_id);

alter table extracoes_documento_ia enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'extracoes_documento_ia' and policyname = 'admin_full_access_extracoes_documento_ia') then
    create policy admin_full_access_extracoes_documento_ia on extracoes_documento_ia
      for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_extracoes_documento_ia') then
    create trigger trg_audit_extracoes_documento_ia after insert or update or delete on extracoes_documento_ia
      for each row execute function fn_audit_trigger();
  end if;
end $$;

-- ============================================================================
-- Fase 5: reequilíbrio trienal (Art. 19 Lei 8.245/91) + renovação
-- ============================================================================
create table if not exists configuracoes_sistema (
  chave text primary key,
  valor text not null,
  descricao text,
  atualizado_em timestamptz not null default now()
);

insert into configuracoes_sistema (chave, valor, descricao) values
  ('indice_reajuste_padrao', 'IPCA',
   'Índice usado para propor reajuste de renovação quando o contrato não define indice_reajuste (IPCA ou IGPM).')
on conflict (chave) do nothing;

alter table configuracoes_sistema enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'configuracoes_sistema' and policyname = 'admin_full_access_configuracoes_sistema') then
    create policy admin_full_access_configuracoes_sistema on configuracoes_sistema
      for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_configuracoes_sistema') then
    create trigger trg_audit_configuracoes_sistema after insert or update or delete on configuracoes_sistema
      for each row execute function fn_audit_trigger();
  end if;
end $$;

create table if not exists indices_economicos (
  id uuid primary key default gen_random_uuid(),
  indice text not null check (indice in ('IGPM','IPCA','INPC')),
  competencia date not null,
  percentual_acumulado_12m numeric(8,5) not null,
  criado_em timestamptz not null default now(),
  unique (indice, competencia)
);

alter table indices_economicos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'indices_economicos' and policyname = 'admin_full_access_indices_economicos') then
    create policy admin_full_access_indices_economicos on indices_economicos
      for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_indices_economicos') then
    create trigger trg_audit_indices_economicos after insert or update or delete on indices_economicos
      for each row execute function fn_audit_trigger();
  end if;
end $$;

create table if not exists reequilibrios_contratuais (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  marco_data date not null,
  status text not null default 'aguardando_criterios'
    check (status in ('aguardando_criterios','criterios_definidos','descartado')),
  criterios text,
  valor_proposto numeric(14,2),
  definido_por uuid references pessoas(id),
  definido_em timestamptz,
  notificacao_planejamento_enviada_em timestamptz,
  notificacao_oficial_enviada_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (contrato_id, marco_data)
);

create index if not exists idx_reequilibrios_contratuais_contrato on reequilibrios_contratuais(contrato_id);

alter table reequilibrios_contratuais enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'reequilibrios_contratuais' and policyname = 'admin_full_access_reequilibrios_contratuais') then
    create policy admin_full_access_reequilibrios_contratuais on reequilibrios_contratuais
      for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_reequilibrios_contratuais') then
    create trigger trg_audit_reequilibrios_contratuais after insert or update or delete on reequilibrios_contratuais
      for each row execute function fn_audit_trigger();
  end if;
end $$;

create table if not exists renovacoes_contratuais_notificacoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  data_fim_referencia date not null,
  notificacao_planejamento_enviada_em timestamptz,
  notificacao_ajuste_enviada_em timestamptz,
  reajuste_id uuid references reajustes_contrato(id),
  criado_em timestamptz not null default now(),
  unique (contrato_id, data_fim_referencia)
);

create index if not exists idx_renovacoes_notificacoes_contrato on renovacoes_contratuais_notificacoes(contrato_id);

alter table renovacoes_contratuais_notificacoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'renovacoes_contratuais_notificacoes' and policyname = 'admin_full_access_renovacoes_notificacoes') then
    create policy admin_full_access_renovacoes_notificacoes on renovacoes_contratuais_notificacoes
      for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_renovacoes_notificacoes') then
    create trigger trg_audit_renovacoes_notificacoes after insert or update or delete on renovacoes_contratuais_notificacoes
      for each row execute function fn_audit_trigger();
  end if;
end $$;

-- ============================================================================
-- Fase 7: pergunta livre para análise de documento por IA
-- ============================================================================
create table if not exists perguntas_analise_documento (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos_anexados(id) on delete cascade,
  pergunta text not null,
  resposta text,
  modelo_ia text,
  status text not null default 'pendente' check (status in ('pendente','respondida','falhou')),
  erro_ia text,
  perguntado_por uuid references pessoas(id),
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);

create index if not exists idx_perguntas_analise_documento on perguntas_analise_documento(documento_id);

alter table perguntas_analise_documento enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'perguntas_analise_documento' and policyname = 'admin_full_access_perguntas_analise_documento') then
    create policy admin_full_access_perguntas_analise_documento on perguntas_analise_documento
      for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_perguntas_analise_documento') then
    create trigger trg_audit_perguntas_analise_documento after insert or update or delete on perguntas_analise_documento
      for each row execute function fn_audit_trigger();
  end if;
end $$;
