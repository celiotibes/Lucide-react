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
