-- ============================================================================
-- Migration: View/Function to list usuarios with pessoa details (Admin UI)
-- ============================================================================
-- Provides a convenient RPC function for admin interface to see all usuarios
-- joined with their associated pessoas. Returns all fields needed for user
-- management (link/unlink pessoa, change papel, etc.).

create or replace function fn_usuarios_com_pessoa()
returns table (
  id uuid,
  email text,
  pessoa_id uuid,
  pessoa_nome text,
  papel text,
  criado_em timestamptz
) as $$
begin
  return query
  select
    u.id,
    au.email,
    u.pessoa_id,
    p.nome as pessoa_nome,
    u.papel,
    u.criado_em
  from usuarios u
  join auth.users au on au.id = u.id
  left join pessoas p on p.id = u.pessoa_id
  order by au.email asc;
end;
$$ language plpgsql security definer;
