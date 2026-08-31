# Row-Level Security (RLS) Implementation — Phase 0

## Overview

This document describes the RLS (Row-Level Security) implementation for CRMT, enabling multi-tenant data isolation by user role. The implementation links Supabase Auth to the domain model via a `usuarios` bridge table.

**Status:** Implemented for Phase 0 | Critical for production deployment

---

## Architecture

### The Bridge Pattern

```
auth.users (Supabase Auth)
    ↓
usuarios (Bridge table)
    ↓
pessoas + papéis (Domain model)
```

1. **auth.users**: Managed by Supabase Auth (email + password/magic link)
2. **usuarios**: Created after login, links auth.users.id → pessoas.id + assigns papel
3. **RLS Policies**: Query `usuarios` table to determine access to all other tables

### User Roles (papéis)

- **admin**: Full access to all data (via `fn_eh_admin_ou_economista()`)
- **economista**: Full access to all data (via `fn_eh_admin_ou_economista()`)
- **inquilino**: See only own contracts, faturas, garantias, vistorias, energy readings
- **investidor**: See own properties, ledger, extratos, splits
- **prestador**: See own service orders, lançamentos, folha

---

## Implementation Files

### Database Migrations

**`database/migration-rls-usuarios-sync.sql`**
- Creates `usuarios` table (if not exists — idempotent)
- Implements `fn_upsert_usuario()` — auto-creates usuario entry on first auth check
- Implements `fn_vincular_usuario_a_pessoa()` — links user to pessoa with role
- Enables RLS on `usuarios` table with admin/user-only policies

### API Routes

**`app/api/auth/usuario/route.ts`**

`GET /api/auth/usuario`
- Returns authenticated user's id, email, user_metadata
- **Automatically calls `fn_upsert_usuario()`** to ensure bridge entry exists
- Safe to call repeatedly; creates entry only if missing

`POST /api/auth/usuario`
- Body: `{ pessoa_id: "uuid", papel?: "inquilino"|"investidor"|"prestador" }`
- Links authenticated user to a pessoa
- Returns updated usuario entry: `{ id, pessoa_id, papel }`
- Errors if pessoa_id is invalid or if non-admin tries to change someone else's role

### Auth Flow Pages

**`app/auth/callback/route.ts`**
- Exchanges OAuth code for session
- Calls `fn_upsert_usuario()` to create bridge entry
- **If pessoa_id is null → redirects to `/auth/setup`** (incomplete onboarding)
- If pessoa_id is set → redirects to dashboard (complete)

**`app/auth/setup/page.tsx`**
- Displayed after first login if user is not linked to a pessoa
- Lists all pessoas from database
- User selects which pessoa they are + confirms their role
- Calls `POST /api/auth/usuario` to finalize link
- Redirects to `/dashboard` on success

### Middleware

**`middleware.ts`**
- Checks authentication before allowing access to protected routes
- Protected routes now include: `/dashboard`, `/contratos`, `/imoveis`, `/pessoas`, `/portal`, etc.
- Redirects unauthenticated users to `/auth/login`
- Note: RLS enforcement happens at DB level (Supabase), not in middleware

---

## Database Schema: RLS Policies

The schema already has comprehensive RLS policies enabled. Key patterns:

### Admin Bypass
```sql
create policy admin_full_access_<table> on <table>
  for all using (fn_eh_admin_ou_economista()) 
  with check (fn_eh_admin_ou_economista());
```

### Role-Specific Access
```sql
-- Inquilino sees only their own contracts
create policy inquilino_ve_proprio_contrato on contratos
  for select using (
    exists (
      select 1 from usuarios u
      join contrato_partes cp on cp.pessoa_id = u.pessoa_id
      where u.id = auth.uid() and u.papel = 'inquilino' and cp.contrato_id = contratos.id
    )
  );
```

### Tables with RLS Enabled (non-exhaustive)
- `pessoas` — user sees only own record
- `usuarios` — user sees only own entry (admin bypass)
- `contratos`, `faturas`, `garantias` — inquilino sees own; admin/investidor see all
- `investidor_ledger`, `extratos_mensais_proprietario` — investidor sees own
- `ordens_servico` — prestador sees own assignments; inquilino sees own tickets
- `imoveis` — public sees "disponivel" status; inquilino/investidor see own
- `documentos_gerados`, `vistorias`, `assinaturas` — user sees own or linked docs
- And 30+ more tables with similar patterns

---

## Testing Checklist

### 1. Manual Setup (One-Time)

```bash
# Apply migration to Supabase
# Via Supabase dashboard: SQL Editor
# Copy contents of database/migration-rls-usuarios-sync.sql
# Execute (idempotent: safe to re-run)
```

### 2. Test Login Flow

**Step 1: Create admin pessoa**
```sql
-- In Supabase SQL Editor
INSERT INTO pessoas (nome, email) VALUES ('Admin User', 'admin@localhost');
-- Copy the UUID of the new pessoa

INSERT INTO usuarios (id, pessoa_id, papel) 
SELECT auth.users.id, '<pessoa_uuid_from_above>', 'admin'
FROM auth.users WHERE email = 'admin@localhost'
ON CONFLICT (id) DO UPDATE SET papel = 'admin', pessoa_id = '<pessoa_uuid>';
```

**Step 2: Test login**
- Open `http://localhost:3000/auth/login`
- Enter an email (e.g., `tenant@example.com`)
- Supabase sends magic link (in dev, check console or email)
- Click link → redirected to callback → should go to `/auth/setup`

**Step 3: Complete setup**
- At `/auth/setup`, select a pessoa from dropdown
- Choose role (`inquilino`, `investidor`, or `prestador`)
- Submit → should redirect to `/dashboard`

### 3. Test RLS Policies

**As Inquilino User**
```sql
-- Via Supabase dashboard or PostgREST API with user's JWT token

-- Should work (own pessoa)
SELECT * FROM pessoas WHERE id = fn_minha_pessoa_id();
-- Result: 1 row (own record)

-- Should fail (other person's record)
SELECT * FROM pessoas;
-- Error: new row violates row-level security policy

-- Should work (own contracts only)
SELECT * FROM contratos WHERE EXISTS (
  select 1 from contrato_partes cp 
  where cp.contrato_id = contratos.id 
  and cp.pessoa_id = fn_minha_pessoa_id()
);
-- Result: only inquilino's contracts
```

**As Admin User**
```sql
-- Should work (full access)
SELECT * FROM pessoas;
SELECT * FROM usuarios;
SELECT * FROM contratos;
-- All return complete data
```

### 4. Test Permission Denial

**Non-admin trying to see other user's data**
```bash
# Login as tenant1@example.com
curl -H "Authorization: Bearer <tenant1_jwt>" \
  https://your-project.supabase.co/rest/v1/pessoas \
  -H "apikey: <ANON_KEY>"
# Returns: empty array (RLS blocks access)

# Try to see tenant2's contracts
curl -H "Authorization: Bearer <tenant1_jwt>" \
  https://your-project.supabase.co/rest/v1/contratos \
  -H "apikey: <ANON_KEY>"
# Returns: empty array (RLS blocks access)
```

### 5. Test Role-Based UI

**Inquilino Portal**
- Login as inquilino → `/portal` should show **only own contracts**
- Click contract detail → should show **own contract info**
- Cannot see `/dashboard` (no investidor role)

**Investidor Dashboard**
- Login as investidor → `/dashboard` should show **own properties + contracts**
- Can see `/extratos` (investor statements)
- Can see `/imoveis` (own properties)
- Cannot see other investors' data

**Admin Back-office**
- Login as admin → `/dashboard` shows **all statistics**
- Can see `/pessoas`, `/contratos`, `/imoveis` (all data)
- Can see `/usuarios` table for user management

---

## Troubleshooting

### "RLS error: new row violates row-level security policy"

**Cause:** User trying to INSERT/UPDATE a row they don't have permission to access.

**Solution:**
- Check if user has correct papel in `usuarios` table
- Verify RLS policy covers the action (SELECT, INSERT, UPDATE, DELETE)
- Admin should bypass with `fn_eh_admin_ou_economista()` check

```sql
-- Debug: what papel does this user have?
SELECT id, pessoa_id, papel FROM usuarios WHERE id = auth.uid();
```

### "User cannot see their own data"

**Cause:** Missing `usuarios` entry OR pessoa_id is NULL.

**Solution:**
1. Verify `usuarios` entry exists:
   ```sql
   SELECT * FROM usuarios WHERE id = '<user_id>';
   ```
2. If missing, call:
   ```sql
   SELECT fn_upsert_usuario();
   ```
3. If pessoa_id is NULL, call:
   ```sql
   SELECT fn_vincular_usuario_a_pessoa('<pessoa_uuid>', 'inquilino');
   ```

### "RLS policies not working in production"

**Cause:** RLS policies are only enforced when:
1. Request uses anon/user JWT (not service_role)
2. Table has RLS enabled (`ALTER TABLE ... ENABLE RLS`)
3. At least one policy is defined for the role

**Solution:**
- Check that table has RLS enabled:
  ```sql
  SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='<table>';
  SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='<table>';
  ```
- For debugging, temporarily query as `authenticated` role to verify policies work

---

## Admin Bootstrap

When deploying to production, bootstrap an admin user:

```sql
-- 1. Create admin pessoa
INSERT INTO pessoas (nome, email) VALUES ('Administrator', 'admin@crmt.local');

-- 2. Manually create auth.users entry (via Supabase dashboard or API)

-- 3. Link to admin papel
INSERT INTO usuarios (id, pessoa_id, papel)
VALUES (
  '<auth_users.id>',
  (SELECT id FROM pessoas WHERE email = 'admin@crmt.local'),
  'admin'
);
```

---

## Next Steps

### For Phase 0 Completion
1. ✅ Schema: RLS policies already defined
2. ✅ Auth: Login + setup flow implemented
3. ✅ Bridge: `usuarios` table + sync functions created
4. ⏳ Testing: Manual test checklist (run before production)

### For Phase 1+
1. **Restrict Admin Panel Access** — Add row-level ACL check to admin pages
2. **Audit Trail** — Log all access denied errors for security review
3. **Email Notifications** — Notify investidor of new faturas only for their properties
4. **Mobile Portal** — PWA with offline-first que respects RLS at sync time
5. **Multi-Organization** — Extend RLS to support > 1 empresa (gestora imobiliária)

---

## References

- **Supabase RLS Docs**: https://supabase.com/docs/guides/database/postgres/row-level-security
- **PostgreSQL Security**: https://www.postgresql.org/docs/current/sql-createpolicy.html
- **CRMT Schema**: `database/schema.sql` (section 16: RLS policies)
- **Auth Flow**: `app/auth/callback/route.ts`, `app/auth/setup/page.tsx`

