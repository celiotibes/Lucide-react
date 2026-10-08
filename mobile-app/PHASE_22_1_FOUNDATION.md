# Phase 22.1: Foundation (Weeks 1-2)

**Status**: ✅ Complete  
**Date**: 2026-10-08  
**Deliverables**: WatermelonDB local database, AsyncStorage credential management, error logging, health monitoring

## Overview

Phase 22.1 establishes the core infrastructure for the React Native mobile app with offline-first capabilities, secure credential storage, comprehensive logging, and health monitoring.

## Completed Components

### 1. WatermelonDB Local Database Schema (`src/database/schema.ts`)

**Purpose**: Define the offline-first database schema for all core entities.

**Tables**:
- **documents** (19 columns)
  - Core fields: `server_id`, `type`, `counterparty_name`, `file_path`, `file_size`
  - Status tracking: `status` (pending|processing|completed|failed), `confidence`
  - Sync state: `sync_pending`, `synced_at`
  - Timestamps: `created_at`, `updated_at`
  - Data: `extracted_data` (JSON stringified)

- **transactions** (16 columns)
  - Core fields: `server_id`, `document_id`, `type`, `category`, `amount`, `currency`
  - Details: `description`, `date`, `payee`, `account`, `notes`
  - Sync tracking: `sync_pending`, `synced_at`

- **properties** (16 columns)
  - Core fields: `server_id`, `name`, `type`, `address`, `city`, `state`, `postal_code`
  - Financial: `purchase_price`, `current_value`, `ownership_percentage`
  - Timeline: `acquisition_date`
  - Sync tracking: `sync_pending`, `synced_at`

- **sync_queue** (8 columns)
  - Queue items: `entity_type`, `entity_id`, `operation` (create|update|delete)
  - Retry tracking: `retry_count`, `last_error`, `attempted_at`
  - Payload: `payload` (JSON stringified)

- **sync_log** (6 columns)
  - Tracking: `status` (success|error|pending), `entity_type`
  - Metrics: `sync_duration_ms`, `items_synced`
  - Details: `error_message`, `timestamp`

### 2. WatermelonDB Models

**Document Model** (`src/database/models/Document.ts`)
- Decorators for type-safe field access
- Helper methods: `getExtractedData()`, `setExtractedData()`
- State queries: `isLocal()`, `isPending()`

**Transaction Model** (`src/database/models/Transaction.ts`)
- Date handling: `getDateAsDate()`, `setDate()`
- Local/pending checks: `isLocal()`, `isPending()`

**Property Model** (`src/database/models/Property.ts`)
- Financial calculations: `getAppreciation()`, `getAppreciationPercentage()`
- Date handling: `getAcquisitionDate()`, `setAcquisitionDate()`

**SyncQueue Model** (`src/database/models/SyncQueue.ts`)
- Retry logic: `canRetry()`, `incrementRetry()`, `getRetryDelay()`
- Error tracking: `setError()`
- Payload management: `getPayload()`, `setPayload()`

**SyncLog Model** (`src/database/models/SyncLog.ts`)
- Status queries: `isSuccess()`, `isError()`, `isPending()`
- Metrics: `getDurationSeconds()`

### 3. Database Initialization & Lifecycle (`src/database/index.ts`)

**Functions**:
- `initializeDatabase()`: Lazy initialization with singleton pattern
- `getDatabase()`: Safe getter with validation
- `closeDatabase()`: Graceful shutdown
- `resetDatabase()`: Emergency reset for testing/troubleshooting

**Features**:
- Automatic connection verification
- Error handling with detailed logging
- Initial data count reporting

### 4. Migration Manager (`src/database/migrations.ts`)

**Purpose**: Handle database schema evolution over time.

**Features**:
- Version tracking system
- Pending migration detection
- Sequential migration execution
- Status reporting and diagnostics

**Example Migration**:
```typescript
{
  version: 2,
  name: 'add_attachments_table',
  migrate: async (database: Database) => {
    // Migration logic
  },
}
```

### 5. Secure Credential Storage (`src/storage/credentials.ts`)

**Storage Keys**:
- `@crmt:api_endpoint` - Backend API server address
- `@crmt:auth_token` - Short-lived JWT token
- `@crmt:refresh_token` - Long-lived token for refresh
- `@crmt:user_id` - Current user ID
- `@crmt:user_email` - Current user email
- `@crmt:device_id` - Device identifier
- `@crmt:encryption_key` - Reserved for future encryption

**Methods**:
- Individual getters/setters for each credential type
- Bulk operations: `getAll()`, `clearAll()`, `clearAuthTokens()`
- State queries: `isAuthenticated()`

**Error Handling**:
- Try-catch with detailed logging
- Graceful fallbacks for missing values

### 6. Error Logging & Monitoring (`src/utils/logger.ts`)

**Log Levels**:
- `DEBUG` - Development diagnostics
- `INFO` - Normal operation events
- `WARN` - Recoverable issues
- `ERROR` - Failures requiring attention

**Features**:
- Persistent log storage (AsyncStorage)
- Log rotation (max 1000 entries, 7-day retention)
- Platform detection (iOS/Android)
- Export functionality for debugging

**Methods**:
- `debug()`, `info()`, `warn()`, `error()` - Logging
- `getLogs()`, `getLogsAfter()` - Retrieval
- `exportLogs()` - JSON export
- `getStats()` - Summary statistics
- `clearLogs()` - Cleanup

### 7. Health Check & Monitoring (`src/utils/health-check.ts`)

**Status Levels**:
- `healthy` - All systems operational
- `degraded` - Reduced functionality but operational
- `unhealthy` - Critical issues

**Checks**:
- **Database**: Record count verification
- **Storage**: Write/read integrity test
- **Sync Queue**: Pending and failed item counts
- **Overall**: Aggregate health determination

**Health Status Report**:
```typescript
{
  timestamp: ISO string,
  database: { status, recordCount, error? },
  storage: { status, error? },
  syncQueue: { status, pendingItems, failedItems, error? },
  overall: status
}
```

**Repair Functionality**:
- Automatic cleanup of failed sync items
- Manual `repair()` method for recovery

### 8. Database Provider (`src/providers/DatabaseProvider.tsx`)

**Purpose**: Provide database instance and lifecycle management to the app.

**Context API**:
```typescript
{
  database: Database | null,
  isInitialized: boolean,
  isLoading: boolean,
  error: Error | null,
  healthStatus: HealthStatus | null,
  refreshHealth: () => Promise<void>
}
```

**Hooks**:
- `useDatabase()` - Full context with all properties
- `useDatabaseInstance()` - Direct database instance

**Lifecycle**:
1. Initialize database on provider mount
2. Run pending migrations
3. Check health status
4. Display loading state during init
5. Show error screen if initialization fails

### 9. Document Repository (`src/database/repositories/DocumentRepository.ts`)

**Purpose**: Provide high-level CRUD operations for documents.

**Operations**:
- `create()` - Create new document with required fields
- `update()` - Update specific fields
- `getById()` - Fetch by primary key
- `getByServerId()` - Fetch by server ID
- `getAll()` - Fetch all documents
- `getByType()` - Filter by type
- `getPending()` - Get documents awaiting processing
- `getSyncPending()` - Get documents awaiting sync
- `delete()` - Permanent deletion
- `markSynced()` - Mark as synced with timestamp

**Local ID Generation**:
- Format: `local_${Date.now()}`
- Ensures no conflicts with server IDs

## Architecture Decisions

### 1. Offline-First with WatermelonDB
- **Why**: Instant UI responsiveness, works without connectivity
- **Trade-off**: Requires bidirectional sync implementation in Phase 22.2

### 2. Async Storage for Credentials
- **Why**: Built-in React Native support, sufficient for development
- **Trade-off**: Not encrypted; will be enhanced in Phase 24 with Keychain

### 3. Centralized Logger
- **Why**: Unified error tracking, easier debugging, compliance support
- **Trade-off**: Disk I/O for every log; mitigated by batching

### 4. Health Check System
- **Why**: Detect database corruption early, enable self-healing
- **Trade-off**: Periodic performance overhead; minimal in practice

### 5. Repository Pattern
- **Why**: Abstraction over WatermelonDB, easier testing, business logic separation
- **Trade-off**: One more layer of indirection; worth it at scale

## Testing Strategy

### Unit Tests (Phase 22.2)
- Schema validation
- Model methods (calculations, state checks)
- Repository CRUD operations
- Health check logic

### Integration Tests (Phase 22.2)
- Database initialization sequence
- Migration execution
- Credential storage lifecycle
- Logger persistence

### E2E Tests (Phase 22.3)
- Full app startup and data initialization
- Offline behavior
- Sync queue processing

## Performance Considerations

### Database
- Indexed columns: `server_id`, `type`, `document_id`, `sync_pending`, `entity_type`
- Query optimization: Avoid N+1 queries, use batch operations

### Storage
- Max 10 concurrent AsyncStorage operations
- Batch reads with `multiGet()` / `multiSet()`

### Logging
- Background persistence prevents UI blocking
- Max 1000 entries with automatic rotation

### Health Checks
- Run on app startup
- Optional periodic checks (every 1 hour in production)
- Manual refresh on demand

## Next Steps (Phase 22.2)

1. **Sync Service**
   - Implement bidirectional sync with desktop backend
   - Queue management and retry logic
   - Conflict resolution

2. **Data Models**
   - Implement remaining repositories (Transaction, Property)
   - Add query builders for common filters

3. **Testing**
   - Unit tests for all database operations
   - Integration tests for lifecycle
   - Mock services for API calls

4. **Error Recovery**
   - Implement rollback on sync failures
   - Manual data reset functionality
   - Error reporting dashboard

## Files Created

```
src/database/
├── schema.ts                 (100 lines) - WatermelonDB schema
├── index.ts                  (65 lines)  - Database initialization
├── migrations.ts             (75 lines)  - Migration manager
├── models/
│   ├── Document.ts           (45 lines)  - Document model
│   ├── Transaction.ts        (40 lines)  - Transaction model
│   ├── Property.ts           (50 lines)  - Property model
│   ├── SyncQueue.ts          (50 lines)  - SyncQueue model
│   └── SyncLog.ts            (30 lines)  - SyncLog model
└── repositories/
    └── DocumentRepository.ts (160 lines) - Document CRUD

src/storage/
└── credentials.ts            (140 lines) - Credential storage

src/utils/
├── logger.ts                 (200 lines) - Logging system
└── health-check.ts           (180 lines) - Health monitoring

src/providers/
└── DatabaseProvider.tsx      (110 lines) - Database context

PHASE_22_1_FOUNDATION.md      (this file) - Documentation
```

**Total: ~1,285 lines of production code**

## Dependencies

### Core
- `@nozbe/watermelondb` - Offline-first database
- `react-native-sqlite-2` - SQLite adapter (via WatermelonDB)
- `@react-native-async-storage/async-storage` - Credential storage

### Existing
- React Native
- React Context API
- TypeScript

## Verification Checklist

- [x] WatermelonDB schema defined with proper indexes
- [x] All 5 models implemented with helper methods
- [x] Database initialization with auto-migration
- [x] AsyncStorage wrapper for secure credential storage
- [x] Comprehensive logging system with persistence
- [x] Health check with repair capabilities
- [x] Database provider for React integration
- [x] DocumentRepository with full CRUD
- [x] Error handling throughout
- [x] TypeScript types and interfaces

## Known Limitations

1. **Credentials not encrypted** - Addressed in Phase 24 with native Keychain
2. **No encryption for sync data** - Will implement in Phase 22.2 with SQLCipher
3. **Manual health checks only** - Periodic checks can be added in Phase 22.3
4. **Single repository pattern** - Transaction and Property repositories in Phase 22.2

## Summary

Phase 22.1 provides a solid foundation for offline-first mobile accounting with:
- Persistent local database with 5 core entities
- Secure credential management
- Comprehensive error logging
- Proactive health monitoring
- Type-safe database access via WatermelonDB

The architecture is extensible, testable, and ready for sync implementation in Phase 22.2.
