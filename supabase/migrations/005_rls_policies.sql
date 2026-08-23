-- Row-Level Security (RLS) Policies for Multi-Tenant Data Isolation
-- Assumes auth.uid() returns user UUID and a junction table maps users to leases/properties

-- Helper table to map users to leases (if not already exists)
CREATE TABLE IF NOT EXISTS user_lease_access (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL,
  role TEXT DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
  PRIMARY KEY (user_id, lease_id)
);

-- Inspection RLS Policies
CREATE POLICY "Users can view inspections for their leases"
  ON inspections FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create inspections for their leases"
  ON inspections FOR INSERT
  WITH CHECK (
    lease_id IN (
      SELECT lease_id FROM user_lease_access
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

CREATE POLICY "Users can update inspections for their leases"
  ON inspections FOR UPDATE
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Inspection Damages RLS Policies
CREATE POLICY "Users can view damages for their inspections"
  ON inspection_damages FOR SELECT
  USING (
    inspection_id IN (
      SELECT id FROM inspections
      WHERE lease_id IN (
        SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create damages for their inspections"
  ON inspection_damages FOR INSERT
  WITH CHECK (
    inspection_id IN (
      SELECT id FROM inspections
      WHERE lease_id IN (
        SELECT lease_id FROM user_lease_access
        WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
      )
    )
  );

-- Inspection Notifications RLS Policies
CREATE POLICY "Users can view notifications for their inspections"
  ON inspection_notifications FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

-- Laundry Franchises RLS Policies
CREATE POLICY "Users can view laundry franchises for their leases"
  ON laundry_franchises FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create laundry franchises for their leases"
  ON laundry_franchises FOR INSERT
  WITH CHECK (
    lease_id IN (
      SELECT lease_id FROM user_lease_access
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

CREATE POLICY "Users can update laundry franchises for their leases"
  ON laundry_franchises FOR UPDATE
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Laundry Cycles RLS Policies
CREATE POLICY "Users can view laundry cycles for their franchises"
  ON laundry_cycles FOR SELECT
  USING (
    franchise_id IN (
      SELECT id FROM laundry_franchises
      WHERE lease_id IN (
        SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can record laundry cycles for their franchises"
  ON laundry_cycles FOR INSERT
  WITH CHECK (
    franchise_id IN (
      SELECT id FROM laundry_franchises
      WHERE lease_id IN (
        SELECT lease_id FROM user_lease_access
        WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
      )
    )
  );

-- Laundry Packages RLS Policies
CREATE POLICY "Users can view laundry packages for their franchises"
  ON laundry_packages FOR SELECT
  USING (
    franchise_id IN (
      SELECT id FROM laundry_franchises
      WHERE lease_id IN (
        SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can purchase laundry packages for their franchises"
  ON laundry_packages FOR INSERT
  WITH CHECK (
    franchise_id IN (
      SELECT id FROM laundry_franchises
      WHERE lease_id IN (
        SELECT lease_id FROM user_lease_access
        WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
      )
    )
  );

-- Laundry Violations RLS Policies
CREATE POLICY "Users can view laundry violations for their franchises"
  ON laundry_violations FOR SELECT
  USING (
    franchise_id IN (
      SELECT id FROM laundry_franchises
      WHERE lease_id IN (
        SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
      )
    )
  );

-- Laundry Monthly Reports RLS Policies
CREATE POLICY "Users can view laundry reports for their franchises"
  ON laundry_monthly_reports FOR SELECT
  USING (
    franchise_id IN (
      SELECT id FROM laundry_franchises
      WHERE lease_id IN (
        SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
      )
    )
  );

-- Occupancy Rules RLS Policies
CREATE POLICY "Users can view occupancy rules for their properties"
  ON occupancy_rules FOR SELECT
  USING (
    property_id IN (
      SELECT DISTINCT property_id FROM payment_cycles
      WHERE lease_id IN (
        SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
      )
    )
  );

-- Registered Occupants RLS Policies
CREATE POLICY "Users can view occupants for their leases"
  ON registered_occupants FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can register occupants for their leases"
  ON registered_occupants FOR INSERT
  WITH CHECK (
    lease_id IN (
      SELECT lease_id FROM user_lease_access
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Occupancy Violations RLS Policies
CREATE POLICY "Users can view occupancy violations for their leases"
  ON occupancy_violations FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can report occupancy violations for their leases"
  ON occupancy_violations FOR INSERT
  WITH CHECK (
    lease_id IN (
      SELECT lease_id FROM user_lease_access
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Occupancy Monitoring RLS Policies
CREATE POLICY "Users can view occupancy monitoring for their leases"
  ON occupancy_monitoring FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

-- Occupancy Reports RLS Policies
CREATE POLICY "Users can view occupancy reports for their leases"
  ON occupancy_reports FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

-- Payment Cycles RLS Policies
CREATE POLICY "Users can view payment cycles for their leases"
  ON payment_cycles FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create payment cycles for their leases"
  ON payment_cycles FOR INSERT
  WITH CHECK (
    lease_id IN (
      SELECT lease_id FROM user_lease_access
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

CREATE POLICY "Users can update payment cycles for their leases"
  ON payment_cycles FOR UPDATE
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Critical Dates RLS Policies
CREATE POLICY "Users can view critical dates for their leases"
  ON critical_dates FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

-- Critical Date Notifications RLS Policies
CREATE POLICY "Users can view critical date notifications for their leases"
  ON critical_date_notifications FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

-- SERASA Registrations RLS Policies
CREATE POLICY "Users can view SERASA registrations for their leases"
  ON serasa_registrations FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create SERASA registrations for their leases"
  ON serasa_registrations FOR INSERT
  WITH CHECK (
    lease_id IN (
      SELECT lease_id FROM user_lease_access
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Collection Actions RLS Policies
CREATE POLICY "Users can view collection actions for their leases"
  ON collection_actions FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create collection actions for their leases"
  ON collection_actions FOR INSERT
  WITH CHECK (
    lease_id IN (
      SELECT lease_id FROM user_lease_access
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Lease Renewal Notices RLS Policies
CREATE POLICY "Users can view lease renewal notices for their leases"
  ON lease_renewal_notices FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create lease renewal notices for their leases"
  ON lease_renewal_notices FOR INSERT
  WITH CHECK (
    lease_id IN (
      SELECT lease_id FROM user_lease_access
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- User Lease Access RLS Policies (Admins only)
CREATE POLICY "Users can view their own lease access"
  ON user_lease_access FOR SELECT
  USING (
    user_id = auth.uid()
  );

CREATE POLICY "Only admins can grant lease access"
  ON user_lease_access FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM user_lease_access
      WHERE role = 'admin' AND lease_id = NEW.lease_id
    )
  );
