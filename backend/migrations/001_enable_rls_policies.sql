-- Migration: Enable RLS Policies for Multi-Tenant Security
-- Date: 2026-07-23
-- Purpose: Implement row-level security to prevent unauthorized data access

-- ===== Step 1: Create Auth Support Tables =====

CREATE TABLE IF NOT EXISTS public.user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL,
  role TEXT DEFAULT 'viewer' CHECK (role IN ('admin', 'analyst', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_user_org ON public.user_organizations(user_id, org_id);

-- ===== Step 2: Add org_id to fact_financial_movements if not exists =====

ALTER TABLE IF EXISTS public.fact_financial_movements
ADD COLUMN IF NOT EXISTS org_id UUID;

-- Create index for tenant filtering and date range queries
CREATE INDEX IF NOT EXISTS idx_movements_org_date
ON public.fact_financial_movements(org_id, date_id DESC);

-- ===== Step 3: Enable RLS on Tables =====

ALTER TABLE IF EXISTS public.fact_financial_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dim_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dim_cost_centers ENABLE ROW LEVEL SECURITY;

-- ===== Step 4: Drop Existing Policies (Safe for idempotency) =====

DROP POLICY IF EXISTS "movements_select" ON public.fact_financial_movements;
DROP POLICY IF EXISTS "movements_insert" ON public.fact_financial_movements;
DROP POLICY IF EXISTS "movements_update" ON public.fact_financial_movements;
DROP POLICY IF EXISTS "movements_delete" ON public.fact_financial_movements;
DROP POLICY IF EXISTS "properties_select" ON public.dim_properties;
DROP POLICY IF EXISTS "cost_centers_select" ON public.dim_cost_centers;

-- ===== Step 5: Create RLS Policies for fact_financial_movements =====

-- SELECT Policy: Users can view movements from their organization
CREATE POLICY "movements_select" ON public.fact_financial_movements
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- INSERT Policy: Only admin users can insert movements
CREATE POLICY "movements_insert" ON public.fact_financial_movements
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- UPDATE Policy: Only admin users can update movements
CREATE POLICY "movements_update" ON public.fact_financial_movements
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- DELETE Policy: Only admin users can delete movements
CREATE POLICY "movements_delete" ON public.fact_financial_movements
  FOR DELETE
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- ===== Step 6: Create RLS Policies for dim_properties =====

-- SELECT Policy: Users can view properties from their organization
CREATE POLICY "properties_select" ON public.dim_properties
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- ===== Step 7: Create RLS Policies for dim_cost_centers =====

-- SELECT Policy: Users can view cost centers from their organization
CREATE POLICY "cost_centers_select" ON public.dim_cost_centers
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- ===== Step 8: Grant Permissions =====

-- Allow public (authenticated users) to query these tables
GRANT SELECT ON public.fact_financial_movements TO authenticated;
GRANT INSERT ON public.fact_financial_movements TO authenticated;
GRANT UPDATE ON public.fact_financial_movements TO authenticated;
GRANT DELETE ON public.fact_financial_movements TO authenticated;

GRANT SELECT ON public.dim_properties TO authenticated;
GRANT SELECT ON public.dim_cost_centers TO authenticated;
GRANT SELECT ON public.user_organizations TO authenticated;

-- Service role (backend only) can bypass RLS if needed
-- (This requires explicit service_role key, kept secure)

-- ===== Step 9: Verify RLS Status =====

-- Check that RLS is enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('fact_financial_movements', 'dim_properties', 'dim_cost_centers')
AND schemaname = 'public';

-- Check policies
SELECT policyname, tablename, permissive
FROM pg_policies
WHERE tablename IN ('fact_financial_movements', 'dim_properties', 'dim_cost_centers')
AND schemaname = 'public';
