-- Migration: Create CRM Interactions Table
-- Date: 2026-07-11
-- Purpose: Track all client interactions across multiple channels

CREATE TABLE IF NOT EXISTS crm_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Key
  client_id UUID NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,

  -- Interaction Details
  type VARCHAR(50) NOT NULL,
  -- message: text message
  -- call: phone call
  -- email: email communication
  -- meeting: in-person or video meeting
  -- proposal: sent legal proposal

  channel VARCHAR(50) NOT NULL,
  -- whatsapp: WhatsApp message
  -- email: email communication
  -- phone: phone call
  -- in-person: face-to-face meeting

  content TEXT NOT NULL,
  attachments TEXT[] ARRAY,
  outcome TEXT,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Metadata
  metadata JSONB,
  tags TEXT[] ARRAY,

  CONSTRAINT valid_interaction_type CHECK (type IN ('message', 'call', 'email', 'meeting', 'proposal')),
  CONSTRAINT valid_channel CHECK (channel IN ('whatsapp', 'email', 'phone', 'in-person'))
);

-- Indexes for fast queries
CREATE INDEX idx_crm_interactions_client_id ON crm_interactions(client_id);
CREATE INDEX idx_crm_interactions_type ON crm_interactions(type);
CREATE INDEX idx_crm_interactions_channel ON crm_interactions(channel);
CREATE INDEX idx_crm_interactions_created_at ON crm_interactions(created_at DESC);
CREATE INDEX idx_crm_interactions_client_created ON crm_interactions(client_id, created_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_crm_interactions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_interactions_update_timestamp
BEFORE UPDATE ON crm_interactions
FOR EACH ROW
EXECUTE FUNCTION update_crm_interactions_timestamp();

-- Comments
COMMENT ON TABLE crm_interactions IS 'Tracks all client interactions across channels for CRM history';
COMMENT ON COLUMN crm_interactions.type IS 'Type of interaction: message, call, email, meeting, proposal';
COMMENT ON COLUMN crm_interactions.channel IS 'Channel used: whatsapp, email, phone, in-person';
COMMENT ON COLUMN crm_interactions.attachments IS 'Array of attachment URLs from interaction';
COMMENT ON COLUMN crm_interactions.tags IS 'Tags for categorization and search';
