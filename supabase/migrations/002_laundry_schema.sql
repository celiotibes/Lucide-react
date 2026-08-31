-- Franquia de Lavanderia (Laundry Franchise System)
-- Requisito: Anexo III item 6 - 2 ciclos/semana por morador

CREATE TABLE laundry_franchises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL,
  resident_count INTEGER NOT NULL,

  -- Included cycles (2 per week per resident = ~8-9 per month)
  cycles_per_week_included INTEGER NOT NULL DEFAULT 2,
  cycles_per_month_included INTEGER NOT NULL,

  -- Usage tracking
  cycles_used_this_month INTEGER DEFAULT 0,
  total_cycles_available INTEGER NOT NULL,
  remaining_cycles INTEGER NOT NULL,
  alert_80_percent_sent BOOLEAN DEFAULT FALSE,
  alert_sent_date TIMESTAMP WITH TIME ZONE,

  -- Audit trail
  audit_log_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE laundry_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id UUID NOT NULL REFERENCES laundry_franchises(id) ON DELETE CASCADE,
  cycle_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  resident_name TEXT NOT NULL,
  package_source TEXT NOT NULL CHECK (package_source IN ('included', 'extra')),
  cycle_duration_minutes INTEGER DEFAULT 40,
  machine_id TEXT,
  audit_log_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE laundry_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id UUID NOT NULL REFERENCES laundry_franchises(id) ON DELETE CASCADE,
  package_type TEXT NOT NULL CHECK (package_type IN ('p2', 'p4', 'p6', 'p10')),
  cycles_included INTEGER NOT NULL,
  price_brl DECIMAL(10, 2) NOT NULL,
  purchase_date TIMESTAMP WITH TIME ZONE NOT NULL,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  cycles_used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE laundry_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id UUID NOT NULL REFERENCES laundry_franchises(id) ON DELETE CASCADE,
  violation_type TEXT NOT NULL DEFAULT 'neighbor_laundry' CHECK (violation_type IN ('neighbor_laundry', 'unapproved_laundry')),
  violation_date TIMESTAMP WITH TIME ZONE NOT NULL,
  description TEXT NOT NULL,
  evidence_url TEXT,
  fine_amount_brl DECIMAL(10, 2) NOT NULL,
  fine_status TEXT DEFAULT 'pending' CHECK (fine_status IN ('pending', 'applied')),
  fine_applied_date TIMESTAMP WITH TIME ZONE,
  audit_log_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE laundry_monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id UUID NOT NULL REFERENCES laundry_franchises(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,

  -- Usage summary
  included_cycles_available INTEGER NOT NULL,
  included_cycles_used INTEGER NOT NULL,

  -- Extra packages
  extra_cycles_purchased INTEGER DEFAULT 0,
  extra_cycles_used INTEGER DEFAULT 0,
  extra_packages_cost DECIMAL(15, 2) DEFAULT 0,

  -- Violations
  violations_count INTEGER DEFAULT 0,
  violations_fine_total DECIMAL(15, 2) DEFAULT 0,

  -- Total charges
  total_charge DECIMAL(15, 2) NOT NULL,
  notes TEXT,

  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row-Level Security (RLS) policies
ALTER TABLE laundry_franchises ENABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_monthly_reports ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX idx_laundry_franchises_lease_id ON laundry_franchises(lease_id);
CREATE INDEX idx_laundry_cycles_franchise_id ON laundry_cycles(franchise_id);
CREATE INDEX idx_laundry_cycles_timestamp ON laundry_cycles(cycle_timestamp);
CREATE INDEX idx_laundry_packages_franchise_id ON laundry_packages(franchise_id);
CREATE INDEX idx_laundry_packages_payment_status ON laundry_packages(payment_status);
CREATE INDEX idx_laundry_violations_franchise_id ON laundry_violations(franchise_id);
CREATE INDEX idx_laundry_violations_fine_status ON laundry_violations(fine_status);
CREATE INDEX idx_laundry_monthly_reports_franchise_id ON laundry_monthly_reports(franchise_id);
CREATE INDEX idx_laundry_monthly_reports_month_year ON laundry_monthly_reports(month, year);
