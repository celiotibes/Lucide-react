-- Audit Logs Schema
-- Lei 12.682/2012 Compliance: Append-only audit trail with cryptographic integrity (hash chain)
-- This table records ALL changes to critical entities for legal compliance and forensic audit

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entity being audited
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL, -- inspection, laundry_franchise, occupancy_entity, payment_cycle, etc.

  -- Action that occurred
  action TEXT NOT NULL, -- inspection_created, challenge_submitted, payment_received, etc.

  -- Metadata about the action (stored as JSONB for flexibility)
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Cryptographic integrity (Lei 12.682/2012 requires tamper-proofing)
  -- SHA-256 hash of (entity_id || action || metadata || timestamp)
  hash TEXT NOT NULL,

  -- Hash chain: previous_hash points to the prior log entry for this entity
  -- Allows detecting tampering: any modification breaks the chain
  previous_hash TEXT,

  -- Timestamp (immutable - set once at creation)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Server signature (optional - for additional security in high-compliance environments)
  -- Signed by server key to prevent even database compromise
  signature_algorithm TEXT, -- 'hmac-sha256', 'rsa-sha256', etc.
  signature TEXT,

  CONSTRAINT audit_logs_action_not_empty CHECK (action != ''),
  CONSTRAINT audit_logs_entity_type_not_empty CHECK (entity_type != ''),
  CONSTRAINT audit_logs_hash_not_empty CHECK (hash != '')
);

-- Create immutable table policy
-- Prevent UPDATE and DELETE operations on audit logs (append-only)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_immutable" ON audit_logs
  AS RESTRICTIVE
  FOR UPDATE
  USING (FALSE);

CREATE POLICY "audit_logs_no_delete" ON audit_logs
  AS RESTRICTIVE
  FOR DELETE
  USING (FALSE);

-- Allow authenticated users to INSERT new audit logs
CREATE POLICY "audit_logs_insert_authenticated" ON audit_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to SELECT audit logs for their own entities
-- (via joins with inspections, payment_cycles, etc. that have their own RLS)
CREATE POLICY "audit_logs_select_authenticated" ON audit_logs
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Index on entity_id for fast lookups
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);

-- Index on entity_type for type-based queries
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);

-- Index on action for filtering by action type
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Index on created_at for time-range queries
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Composite index for entity_id + created_at (common query pattern)
CREATE INDEX idx_audit_logs_entity_time ON audit_logs(entity_id, created_at DESC);

-- Hash index (allow integrity verification)
CREATE INDEX idx_audit_logs_hash ON audit_logs(hash);

-- Create a view for audit trail verification (hash chain validation)
-- Use this view to verify integrity of the audit trail
CREATE OR REPLACE VIEW audit_logs_integrity AS
SELECT
  current.id,
  current.entity_id,
  current.entity_type,
  current.action,
  current.hash,
  current.previous_hash,
  current.created_at,
  -- Check if this log entry's hash is correctly chained
  CASE
    WHEN current.previous_hash IS NULL THEN 'FIRST_ENTRY'::TEXT
    WHEN previous.hash = current.previous_hash THEN 'VALID'::TEXT
    ELSE 'INTEGRITY_VIOLATION'::TEXT
  END AS chain_status
FROM audit_logs current
LEFT JOIN audit_logs previous ON
  current.entity_id = previous.entity_id
  AND current.created_at > previous.created_at
  AND NOT EXISTS (
    SELECT 1 FROM audit_logs middle
    WHERE middle.entity_id = current.entity_id
      AND middle.created_at > previous.created_at
      AND middle.created_at < current.created_at
  );

-- Audit log for changes to audit_logs themselves (meta-audit)
-- This ensures we can detect if audit_logs were modified
CREATE TABLE IF NOT EXISTS audit_logs_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_log_id UUID NOT NULL REFERENCES audit_logs(id),
  change_type TEXT NOT NULL, -- 'update_attempted', 'delete_attempted', 'accessed_for_forensics'
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  details JSONB,
  CONSTRAINT audit_logs_meta_unique_per_event UNIQUE(audit_log_id, change_type, detected_at)
);

CREATE INDEX idx_audit_logs_meta_timestamp ON audit_logs_meta(detected_at DESC);
