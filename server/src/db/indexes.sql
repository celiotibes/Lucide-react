-- Phase 22.17 — Database Performance Optimization
-- Indexes for High-Frequency Queries
--
-- These indexes optimize the most common queries in CRMT:
-- - Transaction listing by property + date
-- - Property balance lookups
-- - Report generation queries
-- - Sync operations
--
-- Created with: db.exec() in server initialization
-- Maintenance: ANALYZE after bulk operations, REINDEX after many DELETEs

-- ============================================================================
-- TRANSACTIONS TABLE INDEXES
-- ============================================================================

-- Most common: List transactions for a property, filtered by date range
-- Query: SELECT * FROM transactions WHERE property_id = ? AND created_at > ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_tx_property_date
ON transactions(property_id, created_at DESC);

-- Filter transactions by status (approved, pending, etc.)
CREATE INDEX IF NOT EXISTS idx_tx_property_status
ON transactions(property_id, status);

-- Find recent transactions across all properties (dashboard, audit trail)
CREATE INDEX IF NOT EXISTS idx_tx_created
ON transactions(created_at DESC);

-- Sync operations: Find unsync'd transactions
CREATE INDEX IF NOT EXISTS idx_tx_synced
ON transactions(synced_at);

-- Transaction type filtering (income, expense, etc.)
CREATE INDEX IF NOT EXISTS idx_tx_type
ON transactions(type);

-- ============================================================================
-- PROPERTIES TABLE INDEXES
-- ============================================================================

-- Filter properties by status (active, archived, etc.)
CREATE INDEX IF NOT EXISTS idx_prop_status
ON properties(status);

-- Filter by owner (landlord, company, etc.)
CREATE INDEX IF NOT EXISTS idx_prop_owner
ON properties(owner_id);

-- Find recently updated properties (for sync)
CREATE INDEX IF NOT EXISTS idx_prop_updated
ON properties(updated_at DESC);

-- ============================================================================
-- CONTRACTS TABLE INDEXES
-- ============================================================================

-- Find contracts for a property
CREATE INDEX IF NOT EXISTS idx_contract_property
ON contracts(property_id);

-- Find contracts by tenant
CREATE INDEX IF NOT EXISTS idx_contract_tenant
ON contracts(tenant_id);

-- Find expired or expiring contracts
CREATE INDEX IF NOT EXISTS idx_contract_end_date
ON contracts(end_date);

-- Sync operations
CREATE INDEX IF NOT EXISTS idx_contract_updated
ON contracts(updated_at DESC);

-- ============================================================================
-- ACCOUNT/BALANCE TABLES INDEXES
-- ============================================================================

-- Fast balance lookup for a property
CREATE INDEX IF NOT EXISTS idx_balance_property
ON account_balances(property_id);

-- Account type filtering
CREATE INDEX IF NOT EXISTS idx_balance_type
ON account_balances(account_type);

-- ============================================================================
-- AUDIT LOG / SYNC QUEUE INDEXES
-- ============================================================================

-- Find audit entries for a property
CREATE INDEX IF NOT EXISTS idx_audit_property_status
ON audit_log(property_id, status);

-- Find pending sync operations
CREATE INDEX IF NOT EXISTS idx_sync_status
ON sync_queue(status, created_at);

-- Cleanup old sync records
CREATE INDEX IF NOT EXISTS idx_sync_created
ON sync_queue(created_at);

-- ============================================================================
-- OPTIONAL: FULL-TEXT SEARCH (if supported)
-- ============================================================================
-- Uncomment if using SQLite with FTS enabled (full-text search)

-- CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
--   id,
--   property_id,
--   title,
--   content,
--   created_at
-- );

-- ============================================================================
-- COMPOSITE INDEXES (for common JOIN patterns)
-- ============================================================================

-- Frequently together: property + recent transactions
CREATE INDEX IF NOT EXISTS idx_tx_property_recent
ON transactions(property_id, created_at DESC, amount);

-- Frequently together: property + contract + date range
CREATE INDEX IF NOT EXISTS idx_contract_property_date
ON contracts(property_id, start_date, end_date);

-- ============================================================================
-- MAINTENANCE COMMANDS (run after bulk operations)
-- ============================================================================
-- ANALYZE;        -- Update query planner statistics
-- REINDEX;        -- Rebuild all indexes (if many DELETEs occurred)
-- VACUUM;         -- Defragment database
--
-- Example usage in TypeScript:
--
-- db.exec('ANALYZE');
-- console.log('Database analyzed');

-- ============================================================================
-- VERIFICATION: Check indexes are used
-- ============================================================================
-- EXPLAIN QUERY PLAN SELECT * FROM transactions WHERE property_id = ? AND created_at > ?;
-- Should show: "SEARCH TABLE transactions USING INDEX idx_tx_property_date ..."
-- If not using index, the query plan needs optimization
