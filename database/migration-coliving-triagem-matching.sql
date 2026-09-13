-- Migração incremental: triagem e matching de compatibilidade para coliving
-- (docs/39-modulo-coliving-triagem-e-matching-proposta.md).
--
-- Rode este script uma vez em qualquer banco criado ANTES desta feature.
-- Todos os blocos usam "if not exists"/checagem de pg_policies/pg_trigger,
-- então rodar de novo (ou rodar num banco criado do zero a partir do
-- schema.sql atual, que já inclui tudo isso) não tem efeito — é seguro
-- repetir, mesmo padrão das migrações anteriores.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'comodo_interesse_id') then
    alter table leads add column comodo_interesse_id uuid references comodos(id);
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'imovel_interesse_2_id') then
    alter table leads add column imovel_interesse_2_id uuid references imoveis(id);
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'comodo_interesse_2_id') then
    alter table leads add column comodo_interesse_2_id uuid references comodos(id);
  end if;
end $$;

create table if not exists perfis_convivencia (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  pessoa_id uuid references pessoas(id),
  constraint chk_perfil_convivencia_um_dono check (
    (lead_id is not null and pessoa_id is null) or (lead_id is null and pessoa_id is not null)
  ),

  v1_limpeza smallint not null check (v1_limpeza between 1 and 3),
  v2_ruido smallint not null check (v2_ruido between 1 and 3),
  v3_rotina smallint not null check (v3_rotina between 1 and 3),
  v4_fumo smallint not null check (v4_fumo between 1 and 3),
  v5_pets smallint not null check (v5_pets between 1 and 3),
  v6_dieta smallint not null check (v6_dieta between 1 and 3),
  v7_conflito smallint not null check (v7_conflito between 1 and 3),

  tem_pet boolean not null default false,
  descricao_pet text,

  genero text,
  preferencia_genero_convivio text check (preferencia_genero_convivio in ('mesmo_genero', 'indiferente')),
  neurodivergencia text,
  pcd text,
  condicao_saude text,
  quadro_alergico text not null default 'nenhuma' check (quadro_alergico in
    ('nenhuma', 'respiratoria', 'animais', 'alimentar', 'medicamentosa_insetos', 'outras', 'prefiro_nao_responder')),
  quadro_alergico_detalhe text,

  aceite_lgpd_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (lead_id),
  unique (pessoa_id)
);

create index if not exists idx_perfis_convivencia_lead on perfis_convivencia(lead_id);
create index if not exists idx_perfis_convivencia_pessoa on perfis_convivencia(pessoa_id);

create table if not exists compatibilidades_coliving (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id),
  perfil_a_id uuid not null references perfis_convivencia(id),
  perfil_b_id uuid not null references perfis_convivencia(id),

  score_geral numeric(5, 2) not null check (score_geral between 0 and 100),
  pontos_atrito jsonb not null,
  alertas_criticos jsonb not null,

  status text not null default 'calculado'
    check (status in ('calculado', 'aprovado', 'reprovado', 'entrevista_requerida')),
  decidido_por uuid references pessoas(id),
  parecer text,
  decidido_em timestamptz,

  criado_em timestamptz not null default now(),
  constraint chk_compatibilidade_perfis_distintos check (perfil_a_id <> perfil_b_id),
  unique (perfil_a_id, perfil_b_id)
);

create index if not exists idx_compatibilidades_coliving_imovel on compatibilidades_coliving(imovel_id);
create index if not exists idx_compatibilidades_coliving_perfil_a on compatibilidades_coliving(perfil_a_id);
create index if not exists idx_compatibilidades_coliving_perfil_b on compatibilidades_coliving(perfil_b_id);

alter table perfis_convivencia enable row level security;
alter table compatibilidades_coliving enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'perfis_convivencia' and policyname = 'admin_full_access_perfis_convivencia') then
    create policy admin_full_access_perfis_convivencia on perfis_convivencia
      for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'perfis_convivencia' and policyname = 'publico_pode_cadastrar_perfil_convivencia') then
    create policy publico_pode_cadastrar_perfil_convivencia on perfis_convivencia
      for insert with check (lead_id is not null and pessoa_id is null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'compatibilidades_coliving' and policyname = 'admin_full_access_compatibilidades_coliving') then
    create policy admin_full_access_compatibilidades_coliving on compatibilidades_coliving
      for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_perfis_convivencia') then
    create trigger trg_audit_perfis_convivencia after insert or update or delete on perfis_convivencia
      for each row execute function fn_audit_trigger();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_compatibilidades_coliving') then
    create trigger trg_audit_compatibilidades_coliving after insert or update or delete on compatibilidades_coliving
      for each row execute function fn_audit_trigger();
  end if;
end $$;
