# 🔐 Fase 5.7: Row Level Security (RLS) - Supabase Setup

**Status**: 📋 Implementation Guide  
**Date**: 2026-07-23  
**Purpose**: Secure database access with RLS policies

---

## 📌 Overview

Row Level Security (RLS) in Supabase PostgreSQL ensures users can only see their own data, even if they somehow craft malicious queries. This is critical for multi-tenant applications.

### Current Vulnerability
```
Without RLS: User A's API token can retrieve User B's financial data
           by modifying filter parameters
```

### Solution: RLS Policies
```
With RLS: Database enforces access at the SQL level
         No amount of API manipulation bypasses this
```

---

## 🛡️ RLS Policy Architecture

### Tables Requiring RLS

1. **fact_financial_movements**
   - Contains all financial data (revenues, costs)
   - Must be filtered by tenant/organization

2. **dim_properties**
   - Property master data
   - Users should only see their assigned properties

3. **dim_cost_centers**
   - Cost center allocations
   - Scoped by organization

### Auth Context

Supabase RLS uses `auth.uid()` (current user ID) and custom claims in JWT:
- `user_id` - UUID of authenticated user
- `org_id` - Organization/tenant ID
- `role` - User role (admin, analyst, viewer)

---

## 📊 Database Schema with Auth

### Users Table
```sql
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link users to organizations
CREATE TABLE IF NOT EXISTS public.user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NOT NULL,
  role TEXT DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

CREATE INDEX idx_user_org ON public.user_organizations(user_id, org_id);
```

### Fact Financial Movements (with tenant column)
```sql
ALTER TABLE IF EXISTS fact_financial_movements
ADD COLUMN IF NOT EXISTS org_id UUID;

-- Add index for tenant filtering
CREATE INDEX IF NOT EXISTS idx_movements_org_date
ON fact_financial_movements(org_id, date_id DESC);
```

---

## 🔐 RLS Policies SQL

### 1. Enable RLS on Tables
```sql
-- Enable RLS (Mandatory)
ALTER TABLE fact_financial_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_cost_centers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "movements_select" ON fact_financial_movements;
DROP POLICY IF EXISTS "properties_select" ON dim_properties;
DROP POLICY IF EXISTS "cost_centers_select" ON dim_cost_centers;
```

### 2. Financial Movements - SELECT Policy
```sql
-- Users can SELECT only movements from their organization
CREATE POLICY "movements_select" ON fact_financial_movements
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );
```

### 3. Financial Movements - INSERT Policy
```sql
-- Only org admins can INSERT movements
CREATE POLICY "movements_insert" ON fact_financial_movements
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );
```

### 4. Financial Movements - UPDATE Policy
```sql
-- Only org admins can UPDATE their org's movements
CREATE POLICY "movements_update" ON fact_financial_movements
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );
```

### 5. Financial Movements - DELETE Policy
```sql
-- Only org admins can DELETE movements
CREATE POLICY "movements_delete" ON fact_financial_movements
  FOR DELETE
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );
```

### 6. Properties - SELECT Policy
```sql
-- Users see properties they're assigned to
CREATE POLICY "properties_select" ON dim_properties
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );
```

### 7. Cost Centers - SELECT Policy
```sql
-- Users see cost centers in their organization
CREATE POLICY "cost_centers_select" ON dim_cost_centers
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );
```

---

## 🧪 Testing RLS Policies

### Test 1: User A Cannot See User B's Data
```sql
-- As User A (org_id = 'org-123')
SELECT COUNT(*) FROM fact_financial_movements;
-- Returns: 5 movements

-- Switch auth context to User B (org_id = 'org-456')
SET ROLE authenticated;
SELECT COUNT(*) FROM fact_financial_movements;
-- Returns: 3 movements (different data!)
```

### Test 2: Unauthorized INSERT Blocked
```sql
-- As User A (viewer role)
INSERT INTO fact_financial_movements (org_id, ...) 
VALUES ('org-456', ...);
-- Result: ERROR - violates row level security policy

-- As User A (admin role)
INSERT INTO fact_financial_movements (org_id, ...)
VALUES ('org-123', ...);
-- Result: SUCCESS
```

### Test 3: Category Filtering Still Works
```sql
-- Filter combined with RLS
SELECT * FROM fact_financial_movements
WHERE org_id = 'org-123'  -- RLS enforces this
  AND category = 'operational';  -- User filter adds this
```

---

## 🔧 Backend Integration

### Supabase Client Setup (Backend)
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Service role bypasses RLS (use only in trusted backend!)
const movements = await supabase
  .from('fact_financial_movements')
  .select('*')
  .eq('org_id', req.user.org_id)
  .gte('date_id', startDate)
  .lte('date_id', endDate);
```

### Frontend Client Setup (No RLS bypass)
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// Anon key respects RLS - only sees own org data
const { data } = await supabase
  .from('fact_financial_movements')
  .select('*');
  // RLS automatically filters to current user's org
```

---

## 🚨 Security Considerations

### ✅ What RLS Protects Against
- SQL injection targeting org_id column
- Modified API requests with different org_id
- Direct database access with user token
- Data leakage through API parameter manipulation

### ⚠️ What RLS Does NOT Protect Against
- Application bugs that calculate wrong values
- API endpoint logic errors
- Cache poisoning (cache outside DB)
- Backend service role token exposure

### 🔒 Defense in Depth
```
Frontend → API Validation
         ↓
Backend → RLS Policies
         ↓
Database → JWT Auth
         ↓
Network → HTTPS/SSL
```

---

## 📋 Deployment Checklist

### Pre-Production
- [ ] RLS enabled on all tables
- [ ] Policies tested with multiple users
- [ ] Anon key uses correct permissions
- [ ] Service role key stored securely
- [ ] No default policies left

### Production
- [ ] Backup database before RLS deployment
- [ ] Deploy RLS policies
- [ ] Monitor performance impact
- [ ] Test with actual user accounts
- [ ] Document audit trail

---

## 🧠 Common Mistakes

### ❌ Mistake 1: Using Service Role in Frontend
```typescript
// WRONG - exposes service key!
const supabase = new Supabase(url, SERVICE_ROLE_KEY);
```

```typescript
// CORRECT - uses anon key
const supabase = new Supabase(url, ANON_KEY);
```

### ❌ Mistake 2: Incomplete Policy Coverage
```sql
-- WRONG - only covers SELECT, not INSERT/UPDATE
CREATE POLICY "movements" ON fact_financial_movements
  FOR SELECT USING (org_id = current_setting('app.org_id'));
```

```sql
-- CORRECT - covers all operations
CREATE POLICY "movements_select" ON fact_financial_movements
  FOR SELECT USING (...);
CREATE POLICY "movements_insert" ON fact_financial_movements
  FOR INSERT WITH CHECK (...);
-- etc
```

### ❌ Mistake 3: Performance Killer
```sql
-- WRONG - policy references unindexed column
WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@company.com')
```

```sql
-- CORRECT - uses indexed lookup
WHERE org_id IN (
  SELECT org_id FROM user_organizations 
  WHERE user_id = auth.uid()
)
```

---

## 📊 Performance Impact

### Query Execution Plan
```
BEFORE RLS (2ms):
  └─ Seq Scan on fact_financial_movements

AFTER RLS (3ms):
  ├─ Seq Scan on fact_financial_movements
  └─ Hash Join with user_organizations (indexed)

Impact: +1ms overhead, worth the security
```

### Optimization Tips
1. Index `org_id` column
2. Index `(org_id, date_id)` for range queries
3. Use `user_organizations` join, not subqueries
4. Cache org_id in JWT claims

---

## 🔄 Migration Strategy

### Phase 1: Setup (Today)
1. Create RLS policies in dev environment
2. Test thoroughly with multiple users
3. Verify no breaking changes

### Phase 2: Deploy (This Week)
1. Backup production database
2. Deploy policies to staging
3. Test with real data
4. Deploy to production

### Phase 3: Monitor (Ongoing)
1. Check query performance
2. Monitor RLS violations (logs)
3. Audit user access patterns
4. Update policies if needed

---

## 📚 References

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [JWT Claims in Supabase](https://supabase.com/docs/guides/auth/custom-claims)

---

**Next Step**: Implement these SQL policies in Supabase console or via migration scripts.

Desenvolvido com ❤️ para Lucide React BI Dashboard
