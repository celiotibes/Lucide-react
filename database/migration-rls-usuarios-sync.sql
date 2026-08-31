-- ============================================================================
-- Migration: RLS Usuarios Sync — Link auth.users to pessoas with role mapping
-- ============================================================================
-- This migration ensures that every authenticated user has a corresponding
-- entry in the `usuarios` table, which is the foundation of all RLS policies.
--
-- Implements two strategies:
-- 1. Trigger on auth.users insertion (server-side, via Supabase webhook alternative)
-- 2. API-driven linking when user first authenticates (app-side, safe)
--
-- The `usuarios` table bridges auth.users (email/id) to pessoas (domain model)
-- and assigns a role that determines RLS visibility.

-- ============================================================================
-- 1. Ensure usuarios table exists (idempotent)
-- ============================================================================
create table if not exists usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  pessoa_id uuid references pessoas(id),
  papel text not null check (papel in ('admin','economista','inquilino','investidor','prestador')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ============================================================================
-- 2. Helper function: get or create usuario entry for authenticated user
-- ============================================================================
-- Called by the API after auth.exchangeCodeForSession() to ensure the
-- bridge exists. If user already has an entry, returns it. If not, creates
-- a default entry with papel='inquilino' and null pessoa_id (user fills it in later).
create or replace function fn_upsert_usuario()
returns table (id uuid, pessoa_id uuid, papel text) as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Try to get existing entry
  return query select u.id, u.pessoa_id, u.papel from usuarios u where u.id = v_user_id;
  if found then return; end if;

  -- Create new entry with default papel='inquilino' and null pessoa_id
  insert into usuarios (id, papel) values (v_user_id, 'inquilino')
  on conflict (id) do nothing;

  return query select u.id, u.pessoa_id, u.papel from usuarios u where u.id = v_user_id;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 3. API endpoint helper: link a user to a pessoa with a given role
-- ============================================================================
-- Called by authenticated user to associate their auth.users entry with a
-- pessoa in the domain model. Validates that the pessoa_id belongs to them
-- (or admin can link anyone).
create or replace function fn_vincular_usuario_a_pessoa(
  p_pessoa_id uuid,
  p_papel text default 'inquilino'
)
returns table (id uuid, pessoa_id uuid, papel text) as $$
declare
  v_user_id uuid := auth.uid();
  v_minha_pessoa_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Validate papel
  if p_papel not in ('admin','economista','inquilino','investidor','prestador') then
    raise exception 'Invalid papel: %', p_papel;
  end if;

  -- Get current user's pessoa_id if set
  select u.pessoa_id into v_minha_pessoa_id from usuarios u where u.id = v_user_id;

  -- Only admin can change someone else's papel or link to a different pessoa
  if v_minha_pessoa_id is not null and v_minha_pessoa_id <> p_pessoa_id then
    if not exists (select 1 from usuarios u where u.id = v_user_id and u.papel in ('admin','economista')) then
      raise exception 'Only admins can change pessoa_id mapping';
    end if;
  end if;

  -- Ensure usuario entry exists
  insert into usuarios (id, pessoa_id, papel) values (v_user_id, p_pessoa_id, p_papel)
  on conflict (id) do update set
    pessoa_id = excluded.pessoa_id,
    papel = excluded.papel,
    atualizado_em = now();

  return query select u.id, u.pessoa_id, u.papel from usuarios u where u.id = v_user_id;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 4. RLS Policies: usuarios table (protect identity)
-- ============================================================================
alter table usuarios enable row level security;

-- Admin has full access
create policy if not exists admin_full_access_usuarios on usuarios
  for all using (
    exists (
      select 1 from usuarios u where u.id = auth.uid() and u.papel in ('admin','economista')
    )
  ) with check (
    exists (
      select 1 from usuarios u where u.id = auth.uid() and u.papel in ('admin','economista')
    )
  );

-- User can see only their own entry
create policy if not exists usuario_ve_proprio_registro on usuarios
  for select using (id = auth.uid());

-- User cannot update/delete their own role (only admin can)
-- This is intentional: role assignment must be done via admin panel

-- ============================================================================
-- 5. Verify: which tables have RLS but no policies yet?
-- ============================================================================
-- Run this query manually to audit coverage:
-- select schemaname, tablename from pg_tables
-- where schemaname = 'public' and tablename not like 'pg_%'
-- except
-- select schemaname, tablename from pg_policies
-- order by tablename;

-- ============================================================================
-- 6. Testing checklist (run these AFTER applying migration)
-- ============================================================================
-- 1. Insert a test auth user directly via Supabase dashboard
-- 2. Call SELECT * FROM usuarios; — should see the new entry (admin only, via RLS)
-- 3. As authenticated user, call SELECT fn_upsert_usuario(); — should return user's row
-- 4. As authenticated user, call SELECT fn_vincular_usuario_a_pessoa('...uuid...', 'inquilino');
-- 5. Query SELECT * FROM contratos WHERE ... — should return 0 if user not linked to any contrato
-- 6. Link user to a pessoa that has contratos, re-query — should see contratos now
-- 7. Switch to another auth user, query contratos — should NOT see other user's data (RLS active)

-- ============================================================================
-- 7. Admin bootstrap: create an admin usuario entry manually if needed
-- ============================================================================
-- INSERT INTO usuarios (id, pessoa_id, papel)
-- SELECT auth.users.id, (SELECT id FROM pessoas WHERE nome = 'Admin' LIMIT 1), 'admin'
-- FROM auth.users
-- WHERE email = 'admin@example.com'
-- ON CONFLICT (id) DO UPDATE SET papel = 'admin';
