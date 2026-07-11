-- Migration: Create CRM Clients Table
-- Date: 2026-07-11
-- Purpose: Store client profiles with status tracking and pipeline management

CREATE TABLE IF NOT EXISTS crm_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Information
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  cpf VARCHAR(14) UNIQUE,
  cnpj VARCHAR(18) UNIQUE,

  -- Status Tracking
  status VARCHAR(50) NOT NULL DEFAULT 'prospect',
  -- prospect: Initial contact
  -- lead: Qualified potential client
  -- qualified: Ready for conversion
  -- customer: Active paying customer
  -- inactive: No longer pursuing

  -- Source Tracking
  source VARCHAR(50) NOT NULL DEFAULT 'other',
  -- whatsapp, email, referral, website, phone, other

  -- Case Information
  case_type VARCHAR(100),
  document_url TEXT,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_interaction_at TIMESTAMP,

  -- Metadata
  metadata JSONB,

  CONSTRAINT valid_status CHECK (status IN ('prospect', 'lead', 'qualified', 'customer', 'inactive')),
  CONSTRAINT valid_source CHECK (source IN ('whatsapp', 'email', 'referral', 'website', 'phone', 'other'))
);

-- Indexes for fast queries
CREATE INDEX idx_crm_clients_phone ON crm_clients(phone);
CREATE INDEX idx_crm_clients_email ON crm_clients(email);
CREATE INDEX idx_crm_clients_status ON crm_clients(status);
CREATE INDEX idx_crm_clients_source ON crm_clients(source);
CREATE INDEX idx_crm_clients_created_at ON crm_clients(created_at DESC);
CREATE INDEX idx_crm_clients_last_interaction ON crm_clients(last_interaction_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_crm_clients_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_clients_update_timestamp
BEFORE UPDATE ON crm_clients
FOR EACH ROW
EXECUTE FUNCTION update_crm_clients_timestamp();

-- Comments
COMMENT ON TABLE crm_clients IS 'Stores client profiles with CRM pipeline tracking';
COMMENT ON COLUMN crm_clients.status IS 'Pipeline stage: prospect, lead, qualified, customer, inactive';
COMMENT ON COLUMN crm_clients.source IS 'How client was acquired: whatsapp, email, referral, website, phone, other';
COMMENT ON COLUMN crm_clients.metadata IS 'Additional client metadata stored as JSON';
