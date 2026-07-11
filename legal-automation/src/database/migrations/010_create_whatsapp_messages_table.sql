-- Migration: Create WhatsApp Messages Table
-- Date: 2026-07-11
-- Purpose: Store WhatsApp bot messages and conversation state

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Message Details
  message_id VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  sender_name VARCHAR(255),
  message_text TEXT NOT NULL,
  message_type VARCHAR(50) NOT NULL,
  -- text: simple text message
  -- document: file attachment
  -- image: image attachment
  -- audio: audio attachment

  attachment_url TEXT,
  attachment_type VARCHAR(50),

  -- Processing Details
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  bot_response TEXT,

  -- Conversation State
  conversation_stage VARCHAR(50),
  -- greeting, qualification, document_collection, payment, completed, handoff

  conversation_metadata JSONB,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Metadata
  metadata JSONB,

  CONSTRAINT valid_message_type CHECK (message_type IN ('text', 'document', 'image', 'audio'))
);

-- Indexes for fast queries
CREATE INDEX idx_whatsapp_messages_phone ON whatsapp_messages(phone_number);
CREATE INDEX idx_whatsapp_messages_message_id ON whatsapp_messages(message_id);
CREATE INDEX idx_whatsapp_messages_processed ON whatsapp_messages(processed);
CREATE INDEX idx_whatsapp_messages_stage ON whatsapp_messages(conversation_stage);
CREATE INDEX idx_whatsapp_messages_created_at ON whatsapp_messages(created_at DESC);
CREATE INDEX idx_whatsapp_messages_phone_created ON whatsapp_messages(phone_number, created_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_whatsapp_messages_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER whatsapp_messages_update_timestamp
BEFORE UPDATE ON whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION update_whatsapp_messages_timestamp();

-- Retention Policy: Delete messages older than 90 days (optional)
-- Uncomment if implementing auto-cleanup
-- CREATE OR REPLACE FUNCTION cleanup_old_whatsapp_messages()
-- RETURNS void AS $$
-- BEGIN
--   DELETE FROM whatsapp_messages
--   WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
--   AND processed = TRUE;
-- END;
-- $$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE whatsapp_messages IS 'Stores WhatsApp bot messages and conversation tracking';
COMMENT ON COLUMN whatsapp_messages.message_type IS 'Type of message: text, document, image, audio';
COMMENT ON COLUMN whatsapp_messages.processed IS 'Whether message has been processed by bot';
COMMENT ON COLUMN whatsapp_messages.conversation_stage IS 'Current stage in bot conversation flow';
COMMENT ON COLUMN whatsapp_messages.conversation_metadata IS 'JSON metadata for conversation state tracking';
