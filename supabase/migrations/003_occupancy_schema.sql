-- Regras de Ocupação (Occupancy Control System)
-- Requisito: Contrato residencial proíbe AirBnB, Booking, sublocação

CREATE TABLE occupancy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL,

  -- Occupant limits
  max_occupants INTEGER NOT NULL,
  allow_guests_overnight BOOLEAN DEFAULT TRUE,
  max_guest_days_per_month INTEGER DEFAULT 30,

  -- Absolute prohibitions (Cláusula de Ocupação)
  allow_airbnb BOOLEAN NOT NULL DEFAULT FALSE,
  allow_booking BOOLEAN NOT NULL DEFAULT FALSE,
  allow_temporary_rent BOOLEAN NOT NULL DEFAULT FALSE,
  allow_sublet BOOLEAN NOT NULL DEFAULT FALSE,

  -- Penalty for violation (10% aluguel efetivo)
  violation_fine_percentage INTEGER DEFAULT 10,
  allow_termination_on_violation BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE registered_occupants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL,
  name TEXT NOT NULL,
  cpf TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('primary', 'secondary', 'dependent')),
  move_in_date TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Document verification
  id_document_url TEXT NOT NULL,

  -- Status tracking
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE occupancy_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL,
  property_id UUID NOT NULL,
  violation_type TEXT NOT NULL CHECK (violation_type IN ('airbnb', 'booking', 'sublet', 'overcrowding')),

  -- Detection
  detected_date TIMESTAMP WITH TIME ZONE NOT NULL,
  detection_method TEXT NOT NULL CHECK (detection_method IN ('neighbor_complaint', 'airbnb_api', 'booking_api', 'property_inspection', 'manual_report')),
  detection_evidence TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,

  -- Notification and fine
  notification_sent_date TIMESTAMP WITH TIME ZONE,
  fine_amount_brl DECIMAL(15, 2) NOT NULL,
  fine_status TEXT DEFAULT 'pending' CHECK (fine_status IN ('pending', 'applied')),
  fine_applied_date TIMESTAMP WITH TIME ZONE,

  -- Lease termination
  lease_termination_initiated BOOLEAN DEFAULT FALSE,
  termination_notice_date TIMESTAMP WITH TIME ZONE,
  termination_effective_date TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,

  -- Audit trail
  audit_log_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE occupancy_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL,
  lease_id UUID NOT NULL,

  -- STR (Short-term Rental) detection
  last_airbnb_check TIMESTAMP WITH TIME ZONE,
  last_booking_check TIMESTAMP WITH TIME ZONE,
  airbnb_listing_found BOOLEAN DEFAULT FALSE,
  booking_listing_found BOOLEAN DEFAULT FALSE,

  -- Occupancy verification
  last_occupancy_verification TIMESTAMP WITH TIME ZONE,
  current_occupant_count INTEGER,
  occupant_names_list TEXT,

  -- Monitoring status
  monitoring_active BOOLEAN DEFAULT TRUE,
  alert_level TEXT DEFAULT 'none' CHECK (alert_level IN ('none', 'warning', 'critical')),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE occupancy_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL,
  property_id UUID NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,

  -- Summary
  total_registered_occupants INTEGER,
  max_occupants_allowed INTEGER,
  violations_detected INTEGER DEFAULT 0,
  violations_fine_total DECIMAL(15, 2) DEFAULT 0,

  -- Status
  compliance_status TEXT DEFAULT 'compliant' CHECK (compliance_status IN ('compliant', 'warning', 'violation')),
  notes TEXT,

  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row-Level Security (RLS) policies
ALTER TABLE occupancy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE registered_occupants ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupancy_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupancy_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupancy_reports ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX idx_occupancy_rules_property_id ON occupancy_rules(property_id);
CREATE INDEX idx_registered_occupants_lease_id ON registered_occupants(lease_id);
CREATE INDEX idx_registered_occupants_cpf ON registered_occupants(cpf);
CREATE INDEX idx_occupancy_violations_lease_id ON occupancy_violations(lease_id);
CREATE INDEX idx_occupancy_violations_property_id ON occupancy_violations(property_id);
CREATE INDEX idx_occupancy_violations_violation_type ON occupancy_violations(violation_type);
CREATE INDEX idx_occupancy_violations_fine_status ON occupancy_violations(fine_status);
CREATE INDEX idx_occupancy_monitoring_property_id ON occupancy_monitoring(property_id);
CREATE INDEX idx_occupancy_monitoring_lease_id ON occupancy_monitoring(lease_id);
CREATE INDEX idx_occupancy_monitoring_alert_level ON occupancy_monitoring(alert_level);
CREATE INDEX idx_occupancy_reports_lease_id ON occupancy_reports(lease_id);
CREATE INDEX idx_occupancy_reports_property_id ON occupancy_reports(property_id);
CREATE INDEX idx_occupancy_reports_month_year ON occupancy_reports(month, year);

-- Unique constraints
ALTER TABLE registered_occupants ADD CONSTRAINT unique_occupant_cpf UNIQUE(lease_id, cpf);
