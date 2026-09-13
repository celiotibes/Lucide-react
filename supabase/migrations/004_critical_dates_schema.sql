-- Prazos Críticos Automatizados (Automated Critical Dates System)
-- Requisito: Cláusula Terceira (dia 10), Quinta (1% multa), Nona (7-day challenge), Décima Terceira (ação de execução)

CREATE TABLE payment_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL,
  property_id UUID NOT NULL,

  -- Billing period
  billing_month INTEGER NOT NULL,
  billing_year INTEGER NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Split payment (55% aluguel + 45% custeio)
  value_brl DECIMAL(15, 2) NOT NULL,
  aluguel_efetivo DECIMAL(15, 2) NOT NULL,
  cota_custeio DECIMAL(15, 2) NOT NULL,

  -- Payment status
  payment_status TEXT NOT NULL DEFAULT 'on_time' CHECK (payment_status IN ('on_time', 'late_10d', 'late_30d', 'serasa_included', 'collected')),
  days_late INTEGER DEFAULT 0,
  payment_received_date TIMESTAMP WITH TIME ZONE,
  payment_amount_received DECIMAL(15, 2),

  -- Notification tracking
  day_10_notification_sent BOOLEAN DEFAULT FALSE,
  day_30_notification_sent BOOLEAN DEFAULT FALSE,
  day_30_serasa_registered BOOLEAN DEFAULT FALSE,
  day_30_serasa_registration_date TIMESTAMP WITH TIME ZONE,
  day_40_notification_sent BOOLEAN DEFAULT FALSE,
  day_40_collection_action_initiated BOOLEAN DEFAULT FALSE,
  day_40_collection_action_date TIMESTAMP WITH TIME ZONE,

  -- Late fee (Cláusula Quinta - 1% ao mês)
  late_fee_percentage DECIMAL(5, 2) DEFAULT 1.0,
  late_fee_amount DECIMAL(15, 2) DEFAULT 0,
  late_fee_applied BOOLEAN DEFAULT FALSE,

  -- Audit trail
  audit_log_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE critical_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_cycle_id UUID REFERENCES payment_cycles(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL,

  -- Date type and status
  date_type TEXT NOT NULL CHECK (date_type IN ('due_date', 'late_30d', 'late_40d', 'renewal_notice')),
  critical_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_past_due BOOLEAN DEFAULT FALSE,
  days_until_due INTEGER,

  -- Action tracking
  action_triggered BOOLEAN DEFAULT FALSE,
  action_triggered_at TIMESTAMP WITH TIME ZONE,
  action_completed BOOLEAN DEFAULT FALSE,
  action_completed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE critical_date_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_cycle_id UUID NOT NULL REFERENCES payment_cycles(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL,
  critical_date_id UUID NOT NULL,

  -- Notification details
  notification_type TEXT NOT NULL CHECK (notification_type IN ('due_date', 'late_30d_serasa', 'late_40d_execution', 'renewal_notice')),
  recipient_email TEXT NOT NULL,
  recipient_phone TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),

  -- Template
  template_name TEXT NOT NULL,
  template_variables JSONB,

  -- Delivery tracking
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'delivered')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Audit trail
  audit_log_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE serasa_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL,
  payment_cycle_id UUID NOT NULL REFERENCES payment_cycles(id) ON DELETE CASCADE,

  -- Debtor information
  debtor_cpf TEXT NOT NULL,
  debtor_name TEXT NOT NULL,

  -- Debt details
  debt_amount DECIMAL(15, 2) NOT NULL,
  debt_description TEXT NOT NULL,

  -- Registration status (placeholder for real API integration)
  registration_status TEXT DEFAULT 'pending' CHECK (registration_status IN ('pending', 'registered', 'failed', 'resolved')),
  registration_date TIMESTAMP WITH TIME ZONE NOT NULL,
  registration_reference TEXT,

  -- Cleanup after payment
  resolved_date TIMESTAMP WITH TIME ZONE,

  -- Audit trail
  audit_log_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE collection_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL,
  payment_cycle_id UUID NOT NULL REFERENCES payment_cycles(id) ON DELETE CASCADE,

  -- Action details (Cláusula Décima Terceira)
  action_initiated_date TIMESTAMP WITH TIME ZONE NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('administrative', 'judicial')),

  -- Notary details
  notification_sent_date TIMESTAMP WITH TIME ZONE,
  notification_method TEXT CHECK (notification_method IN ('notary', 'bailiff', 'registered_mail')),
  notary_name TEXT,
  notary_contact TEXT,

  -- Collection status
  collection_status TEXT DEFAULT 'initiated' CHECK (collection_status IN ('initiated', 'notified', 'in_court', 'resolved', 'abandoned')),

  -- Audit trail
  audit_log_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE lease_renewal_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL,
  property_id UUID NOT NULL,

  -- Lease end details
  current_lease_end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notice_scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL, -- 60 days before end

  -- Renewal decision
  will_renew BOOLEAN,
  non_renewal_reason TEXT,

  -- Notification tracking
  notice_sent_date TIMESTAMP WITH TIME ZONE,
  recipient_email TEXT NOT NULL,
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'delivered')),

  -- Audit trail
  audit_log_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row-Level Security (RLS) policies
ALTER TABLE payment_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE critical_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE critical_date_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE serasa_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_renewal_notices ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX idx_payment_cycles_lease_id ON payment_cycles(lease_id);
CREATE INDEX idx_payment_cycles_property_id ON payment_cycles(property_id);
CREATE INDEX idx_payment_cycles_due_date ON payment_cycles(due_date);
CREATE INDEX idx_payment_cycles_payment_status ON payment_cycles(payment_status);
CREATE INDEX idx_payment_cycles_billing_period ON payment_cycles(billing_year, billing_month);
CREATE INDEX idx_critical_dates_payment_cycle_id ON critical_dates(payment_cycle_id);
CREATE INDEX idx_critical_dates_lease_id ON critical_dates(lease_id);
CREATE INDEX idx_critical_dates_critical_date ON critical_dates(critical_date);
CREATE INDEX idx_critical_date_notifications_payment_cycle_id ON critical_date_notifications(payment_cycle_id);
CREATE INDEX idx_critical_date_notifications_delivery_status ON critical_date_notifications(delivery_status);
CREATE INDEX idx_serasa_registrations_payment_cycle_id ON serasa_registrations(payment_cycle_id);
CREATE INDEX idx_serasa_registrations_debtor_cpf ON serasa_registrations(debtor_cpf);
CREATE INDEX idx_serasa_registrations_registration_status ON serasa_registrations(registration_status);
CREATE INDEX idx_collection_actions_payment_cycle_id ON collection_actions(payment_cycle_id);
CREATE INDEX idx_collection_actions_collection_status ON collection_actions(collection_status);
CREATE INDEX idx_lease_renewal_notices_lease_id ON lease_renewal_notices(lease_id);
CREATE INDEX idx_lease_renewal_notices_notice_scheduled_date ON lease_renewal_notices(notice_scheduled_date);

-- Unique constraints
CREATE UNIQUE INDEX unique_payment_cycle_per_period ON payment_cycles(lease_id, billing_year, billing_month);
