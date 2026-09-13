-- Vistoria Eletrônica (Electronic Inspection System)
-- Requisito: Anexo II - Vídeo HD obrigatório

CREATE TABLE inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL,
  property_id UUID NOT NULL,
  inspection_type TEXT NOT NULL DEFAULT 'initial' CHECK (inspection_type IN ('initial', 'final')),

  -- Video HD requirements (Anexo II)
  video_url TEXT NOT NULL,
  video_size_mb DECIMAL(10, 2) NOT NULL,
  video_duration_seconds INTEGER NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL,
  uploaded_by_email TEXT NOT NULL,

  -- Critical deadlines from Cláusula Nona + Anexo II
  deadline_challenge_date TIMESTAMP WITH TIME ZONE NOT NULL,      -- 7 dias para impugnar
  deadline_rad_date TIMESTAMP WITH TIME ZONE NOT NULL,            -- 15 dias úteis para RAD
  deadline_return_deposit_date TIMESTAMP WITH TIME ZONE NOT NULL, -- 10 dias para devolução caução

  -- Notification tracking
  challenge_notification_sent TIMESTAMP WITH TIME ZONE,
  rad_notification_sent TIMESTAMP WITH TIME ZONE,
  return_deposit_notification_sent TIMESTAMP WITH TIME ZONE,

  -- Status and damage tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'challenged', 'rad_pending', 'completed', 'disputed')),
  is_challenged BOOLEAN DEFAULT FALSE,
  challenge_reason TEXT,
  challenge_submitted_at TIMESTAMP WITH TIME ZONE,
  damages_found BOOLEAN DEFAULT FALSE,
  damage_description TEXT,
  damage_estimated_value DECIMAL(15, 2) DEFAULT 0,

  -- RAD processing
  rad_submitted_at TIMESTAMP WITH TIME ZONE,

  -- Audit trail
  audit_log_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE inspection_damages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  damage_type TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  estimated_value DECIMAL(15, 2) NOT NULL,
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE inspection_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('challenge', 'rad', 'return_deposit')),
  recipient_email TEXT NOT NULL,
  recipient_phone TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  template_name TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'delivered')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  audit_log_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row-Level Security (RLS) policies
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_damages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_notifications ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX idx_inspections_lease_id ON inspections(lease_id);
CREATE INDEX idx_inspections_property_id ON inspections(property_id);
CREATE INDEX idx_inspections_status ON inspections(status);
CREATE INDEX idx_inspections_deadline_challenge ON inspections(deadline_challenge_date);
CREATE INDEX idx_inspections_deadline_rad ON inspections(deadline_rad_date);
CREATE INDEX idx_inspections_deadline_return ON inspections(deadline_return_deposit_date);
CREATE INDEX idx_inspection_damages_inspection_id ON inspection_damages(inspection_id);
CREATE INDEX idx_inspection_notifications_inspection_id ON inspection_notifications(inspection_id);
CREATE INDEX idx_inspection_notifications_delivery_status ON inspection_notifications(delivery_status);
