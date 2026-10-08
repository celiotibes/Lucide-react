# Phase 22.2: Sync Service (Weeks 3-4)

**Status**: ✅ Complete  
**Date**: 2026-10-08  
**Deliverables**: Bidirectional sync, conflict resolution, scheduled sync, retry logic

## Overview

Phase 22.2 implements the synchronization layer that keeps the mobile app's local database in sync with the desktop backend. This enables true offline-first functionality with automatic background sync.

## Completed Components

### 1. Sync Service (`src/services/sync/SyncService.ts`)

**Purpose**: Core synchronization engine for bidirectional data sync.

**Key Features**:
- Process pending sync queue items
- Entity-type-based sync ordering (documents → transactions → properties)
- Detailed sync statistics tracking
- Automatic sync result logging
- Old log cleanup (7-day retention)

**Main Methods**:

```typescript
async syncAll(): Promise<SyncStats>
```
- Orchestrates full sync cycle
- Gets all pending items from sync queue
- Processes items by entity type
- Returns detailed statistics
- Prevents overlapping syncs

```typescript
private async syncItem(item: SyncQueue): Promise<void>
```
- Sends individual item to backend
- Hits `/api/sync/{entityType}` endpoint
- Removes item from queue on success
- Detailed logging for each sync

**Sync Stats**:
```typescript
{
  startTime: number,        // Unix timestamp
  endTime?: number,         // When sync completed
  itemsSynced: number,      // Success count
  itemsFailed: number,      // Failure count
  duration?: number,        // Total time in ms
  status: SyncStatus,       // idle | syncing | error | partial_success
  lastError?: string        // Error message if applicable
}
```

**Entity Processing Order**:
1. Documents (foundational - must exist for transactions)
2. Transactions (depend on documents)
3. Properties (independent)

**Error Handling**:
- Each item failure increments retry count
- Sync queue items retain error context
- Failed items persist for manual retry
- Exceptions don't stop the sync process

### 2. Sync Scheduler (`src/services/sync/SyncScheduler.ts`)

**Purpose**: Autonomous background sync orchestration.

**Configuration**:
```typescript
{
  intervalMs: 5 * 60 * 1000,        // Sync every 5 minutes
  retryOnFailureMs: 1 * 60 * 1000,  // Retry every 1 minute on failure
  maxConcurrentSyncs: 1             // Single sync queue
}
```

**Lifecycle**:

```
start()
  ↓
runSync() immediately
  ↓
scheduleNextSync()
  ↓
Wait for interval → runSync() → scheduleNextSync() → loop
  ↓
stop()
```

**Key Features**:
- Immediate first sync on start
- Automatic retry on failure (shorter interval)
- Prevents overlapping syncs
- Adaptive scheduling based on sync outcome
- Clean shutdown with timer cancellation

**Methods**:

```typescript
start(): Promise<void>
```
- Starts scheduler and runs first sync immediately
- Schedules periodic syncs

```typescript
stop(): void
```
- Stops scheduler gracefully
- Cleans up timers

```typescript
forceSync(): Promise<SyncStats>
```
- Triggers immediate sync
- Useful for user-initiated refresh

```typescript
getStatus()
```
Returns scheduler state:
```typescript
{
  isRunning: boolean,
  lastSyncTime: number,
  consecutiveFailures: number,
  nextSyncIn?: number
}
```

### 3. Conflict Resolver (`src/services/sync/ConflictResolver.ts`)

**Purpose**: Handle cases where same entity was modified locally and remotely.

**Conflict Strategies**:

#### Client Wins
- Local changes override server changes
- Use when app has authoritative local data
- Risk: Losing server-side changes

#### Server Wins (Default)
- Server changes override local changes
- Safe default for most cases
- Preferred for accounting data

#### Merge
- 3-way merge attempting to combine changes
- Field-level resolution
- Best effort conflict resolution

#### Manual
- User provides explicit resolution
- Registered via `registerManualResolution()`
- Falls back to server-wins if not provided

**Conflict Detection Logic**:

```typescript
interface ConflictInfo {
  entityId: string,
  entityType: string,
  clientVersion: any,           // Local state
  serverVersion: any,           // Remote state
  clientTimestamp: number,
  serverTimestamp: number,
  strategy: ConflictStrategy
}
```

**Merge Algorithm**:

1. Field-level analysis:
   - If client and server have same value → use that value
   - If only server changed → use server value
   - If only client changed → use client value
   - If both changed → use server value (conflict)

2. Field categorization:
   - **System fields** (id, created_at): Never changed
   - **User data** (description, category): Prefer client
   - **Financial** (amount, balance): Prefer server
   - **Metadata** (synced_at): Use most recent

3. 3-Way Merge (with base version):
   ```typescript
   mergeWithBase(baseVersion, clientVersion, serverVersion)
   ```
   - Compares changes from base to both versions
   - Detects true conflicts vs. non-overlapping changes
   - Preserves non-conflicting changes from both sides

**Example: Transaction Amount Conflict**
```typescript
Base:    { amount: 100 }
Client:  { amount: 120 }  // User edited locally
Server:  { amount: 110 }  // Different edit on web

Result:  { amount: 110 }  // Server wins (financial data)
```

### 4. Sync Hook (`src/hooks/useSync.ts`)

**Purpose**: React hook for UI integration with sync functionality.

**State**:
```typescript
{
  status: SyncStatus,              // Current sync state
  itemsSynced: number,             // Count of successful syncs
  itemsFailed: number,             // Count of failed syncs
  isLoading: boolean,              // UI loading indicator
  lastSyncTime: number | null,     // Unix timestamp
  error: Error | null              // Last error if any
}
```

**Methods**:

```typescript
sync(): Promise<void>
```
- Triggers full sync cycle
- Updates state on completion
- Handles errors gracefully

```typescript
retry(): Promise<void>
```
- Retries failed items
- Updates failure count

```typescript
reset(): void
```
- Resets all state to defaults
- Clear error conditions

**Usage Example**:
```typescript
function SyncButton() {
  const { status, isLoading, sync } = useSync();
  
  return (
    <Button 
      onPress={sync} 
      disabled={status === 'syncing'}
      title={isLoading ? 'Syncing...' : 'Sync Now'}
    />
  );
}
```

## Architecture Decisions

### 1. Queue-Based Sync
- **Why**: Reliable delivery, retry capability, offline support
- **Trade-off**: Requires explicit queue management

### 2. Entity-Type Ordering
- **Why**: Documents must exist before transactions
- **Trade-off**: Doesn't support circular dependencies

### 3. Server-Wins Default
- **Why**: Prevents data loss, maintains server consistency
- **Trade-off**: Local changes can be overwritten

### 4. Background Scheduler
- **Why**: Keeps data fresh without user action
- **Trade-off**: Battery/bandwidth drain (mitigated by configurable intervals)

### 5. Adaptive Retry Interval
- **Why**: Reduces server load after failures
- **Trade-off**: Slightly delayed retry on recoverable errors

## Sync Flow Diagram

```
User Action (Document Upload, Transaction Entry)
           ↓
Create Item + Add to SyncQueue (sync_pending=true)
           ↓
SyncScheduler Detects Pending Items
           ↓
SyncService.syncAll()
           ↓
  ┌─────────────────────────────────┐
  │ For Each Entity Type:            │
  │ 1. Get pending items             │
  │ 2. POST to /api/sync/{type}      │
  │ 3. On success: Remove from queue │
  │ 4. On failure: Update retry      │
  └─────────────────────────────────┘
           ↓
Log Sync Result (sync_log table)
           ↓
Schedule Next Sync (adaptive interval)
```

## Conflict Resolution Examples

### Example 1: Same Transaction Edited
```
Local:   { id: 123, amount: 100, category: 'Expense' }
Server:  { id: 123, amount: 95, category: 'Expense' }

Strategy: Server Wins
Result:   { id: 123, amount: 95, category: 'Expense' }
```

### Example 2: Different Fields Changed
```
Base:    { id: 123, amount: 100, description: 'rent' }
Local:   { id: 123, amount: 100, description: 'apartment rent' }
Server:  { id: 123, amount: 105, description: 'rent' }

Strategy: 3-Way Merge
- Local changed description (not in server change)
- Server changed amount (not in local change)
Result:  { id: 123, amount: 105, description: 'apartment rent' }
```

### Example 3: Property Deleted Locally, Updated Remotely
```
Local:   DELETE (marked for removal)
Server:  { id: 456, current_value: 250000 }

Strategy: Server Wins
Result:   Server change kept, property restored
```

## Network Resilience

**Retry Logic**:
- Max 3 attempts per item
- Exponential backoff: 1s, 2s, 4s
- Failed items logged for manual intervention

**Offline Support**:
- Queue persists in WatermelonDB
- Sync attempts on each app launch
- Scheduler retries automatically

**Error Categories**:
- **Network errors** (timeout, no connectivity) → Automatic retry
- **4xx errors** (validation, not found) → Log & escalate
- **5xx errors** (server error) → Automatic retry

## Testing Strategy

### Unit Tests (Phase 22.3)
- SyncService queue processing
- ConflictResolver merge logic
- SyncScheduler timing and retries
- useSync hook state transitions

### Integration Tests (Phase 22.3)
- End-to-end sync cycle
- Conflict detection and resolution
- Database state after sync
- Error recovery

### E2E Tests (Phase 22.3)
- Offline-online transitions
- Background sync while using app
- User-initiated vs. scheduled sync
- Conflict scenarios

## Performance Considerations

### Database
- Sync queue queries with entity_type index
- Batch updates to sync_log
- Cleanup of old logs (7-day retention)

### Network
- Batch multiple items in single request (if backend supports)
- Configurable sync interval (default: 5 minutes)
- Automatic jitter to prevent thundering herd

### Memory
- SyncService processes queue sequentially
- No in-memory batching (relies on database)
- Sync scheduler uses timers, not polling

## Monitoring & Debugging

**Sync Log Analysis**:
```typescript
const logs = await database.collections.get('sync_log').query().fetch();
// Analyze sync patterns, error rates, duration trends
```

**Failed Items Recovery**:
```typescript
const failedItems = await database.collections.get('sync_queue').query().fetch();
// Retry via useSync hook's retry() method
```

**Health Checks**:
```typescript
const health = await healthChecker.check();
// Monitor sync queue depth and error count
```

## Files Created

```
src/services/sync/
├── SyncService.ts           (220 lines) - Core sync engine
├── SyncScheduler.ts         (140 lines) - Background scheduler
└── ConflictResolver.ts      (180 lines) - Conflict handling

src/hooks/
└── useSync.ts               (110 lines) - React hook

PHASE_22_2_SYNC.md           (this file) - Documentation
```

**Total: ~650 lines of production code + documentation**

## Dependencies

### Core
- `@nozbe/watermelondb` - Database (Phase 22.1)
- `axios` - HTTP client (existing)
- React hooks (existing)

### Existing Integration Points
- `SyncQueue` model (Phase 22.1)
- `SyncLog` model (Phase 22.1)
- `credentialsStorage` (Phase 22.1)
- `logger` (Phase 22.1)

## Verification Checklist

- [x] SyncService processes queue items sequentially
- [x] Scheduler handles intervals and retries
- [x] Conflict resolver supports multiple strategies
- [x] Failed items persist for manual retry
- [x] Sync results logged to database
- [x] Old logs cleaned up automatically
- [x] useSync hook integrates with React
- [x] Error handling prevents cascade failures
- [x] Network timeouts handled gracefully
- [x] Comprehensive logging for debugging

## Known Limitations

1. **No concurrent syncs** - Single queue processed sequentially
   - Solution for Phase 23: Parallel entity-type sync
   
2. **No differential sync** - All items sent on each attempt
   - Solution for Phase 23: Timestamp-based delta sync
   
3. **Manual conflict resolution limited** - Only string-based strategies
   - Solution for Phase 24: UI for conflict resolution
   
4. **No bandwidth optimization** - No compression or delta encoding
   - Solution for Phase 24: Intelligent payload optimization

## Summary

Phase 22.2 provides:
- Robust bidirectional sync with queue persistence
- Flexible conflict resolution strategies
- Background sync scheduler with adaptive retry
- React hook for UI integration
- Comprehensive logging and error recovery

The sync layer enables offline-first functionality while maintaining data consistency with the backend. Ready for conflict detection refinement in Phase 22.3 and UI implementation in Phase 23.
