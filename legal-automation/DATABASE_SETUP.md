# PostgreSQL Database Setup & Implementation

## Overview

The Legal Automation Platform now includes a complete PostgreSQL persistence layer with connection pooling, database adapters, and migration management.

## Architecture

### Components

1. **PoolManager** (`src/database/poolManager.ts`)
   - Centralized connection pool management
   - Automatic connection pooling with configurable limits
   - Transaction support
   - Health monitoring

2. **PersistenceAdapter** (`src/database/persistenceAdapter.ts`)
   - **InMemoryAdapter**: Fast development/testing (existing)
   - **PostgreSQLAdapter**: Production-grade implementation (NEW)
   - Database-agnostic interface for easy switching

3. **RepositoryFactory** (`src/database/repositoryFactory.ts`)
   - Centralized repository creation and management
   - Lazy initialization of repositories
   - Convenience methods for common queries

4. **MigrationRunner** (`src/database/migrationRunner.ts`)
   - Tracks executed migrations
   - Runs pending migrations on startup
   - Supports rollback functionality

5. **Connection Manager** (`src/database/connection.ts`)
   - Integrates pool manager and migration runner
   - Maintains backward compatibility
   - SQLite placeholder conversion for existing code

## Configuration

Set environment variables:

```bash
# Database connection
DATABASE_URL=postgres://user:password@localhost:5432/legal_automation

# Pool configuration
DB_POOL_SIZE=20                    # Maximum connections
DB_IDLE_TIMEOUT=30000             # Idle timeout (ms)
DB_CONNECTION_TIMEOUT=5000        # Connection timeout (ms)
```

## Database Setup

### 1. Create Database

```bash
createdb legal_automation
```

### 2. Create User (Optional)

```sql
CREATE USER legal_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE legal_automation TO legal_user;
```

### 3. Run Migrations

Migrations run automatically on application startup:

```typescript
await initDatabase();  // Runs all pending migrations
```

### 4. Manual Migration Management

```typescript
import { migrationRunner } from '@database/migrationRunner';

// Check migration status
const status = await migrationRunner.status();
console.log(status.executed);  // Executed migrations
console.log(status.pending);   // Pending migrations

// Run pending migrations
await migrationRunner.runPending();

// Rollback migrations (last N steps)
await migrationRunner.rollback(2);
```

## Creating Migrations

Migrations are SQL files in the `migrations/` directory, named with timestamps:

Format: `YYYYMMDDHHMMSS_description.sql`

Example: `20240115101530_create_clients_table.sql`

```sql
-- UP
CREATE TABLE IF NOT EXISTS crm_clients (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  status VARCHAR(50) DEFAULT 'prospect',
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_status (status)
);

-- DOWN
DROP TABLE IF EXISTS crm_clients;
```

**Important**: Use `-- UP` and `-- DOWN` markers to separate upgrade and rollback SQL.

## Using Repositories

### Get or Create Repository

```typescript
import { repositoryFactory } from '@database/repositoryFactory';

// Get existing or create new repository
const clientRepo = repositoryFactory.getRepository('clients');
```

### CRUD Operations

```typescript
// Create
const client = await clientRepo.save({
  id: 'client-1',
  name: 'John Doe',
  email: 'john@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Read
const retrieved = await clientRepo.find('client-1');

// Update
const updated = await clientRepo.save({
  ...retrieved,
  name: 'Jane Doe',
  updatedAt: new Date(),
});

// Delete
await clientRepo.remove('client-1');

// List
const clients = await clientRepo.findAll({ status: 'active' });

// Count
const count = await clientRepo.count({ status: 'active' });
```

### Advanced Queries

```typescript
// Find by property
const client = await clientRepo.findByProperty('email', 'john@example.com');

// Find all by property
const activeClients = await clientRepo.findAllByProperty('status', 'active');

// Check existence
const exists = await clientRepo.exists('client-1');
```

## Connection Pool

### Pool Statistics

```typescript
import { poolManager } from '@database/poolManager';

const stats = await poolManager.getStats();
console.log(stats);
// {
//   totalConnections: 5,
//   idleConnections: 3,
//   waitingRequests: 0
// }
```

### Transactions

```typescript
import { poolManager } from '@database/poolManager';

const result = await poolManager.transaction(async (client) => {
  // All queries within this callback are in a transaction
  await client.query('INSERT INTO ...');
  await client.query('UPDATE ...');

  // Automatically commits or rolls back on error
  return result;
});
```

### Direct Query Execution

```typescript
import { poolManager } from '@database/poolManager';

const result = await poolManager.query(
  'SELECT * FROM crm_clients WHERE status = $1',
  ['active']
);

console.log(result.rows);
```

## Database Tables

### Core Business Tables

- `crm_clients` - Client profiles
- `contracts` - Contract records
- `financial_invoices` - Invoice tracking
- `legal_cases` - Case management
- `intimations` - Intimation documents

### Infrastructure Tables

- `audit_logs` - Audit trail
- `event_webhooks` - Webhook registrations
- `events` - Event records
- `migrations` - Migration tracking

### Entity Schema (Common)

All entities follow this pattern:

```sql
CREATE TABLE entity_table (
  id VARCHAR(36) PRIMARY KEY,
  -- entity-specific columns
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recommended indexes
CREATE INDEX idx_created_at ON entity_table("createdAt");
CREATE INDEX idx_status ON entity_table(status);
```

## Performance Tuning

### Connection Pool Sizing

```javascript
// Development (limited resources)
DB_POOL_SIZE=5

// Production (high throughput)
DB_POOL_SIZE=20

// Calculate: 2 * CPU_CORES
```

### Query Optimization

1. **Add Indexes** on frequently queried columns
   ```sql
   CREATE INDEX idx_client_email ON crm_clients(email);
   CREATE INDEX idx_case_status ON legal_cases(status);
   ```

2. **Analyze Query Performance**
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM crm_clients WHERE status = 'active';
   ```

3. **Batch Operations**
   ```typescript
   // Good: batch inserts
   await poolManager.transaction(async (client) => {
     for (const data of items) {
       await client.query('INSERT INTO ...', [data]);
     }
   });
   ```

## Migration Strategies

### Development Workflow

```bash
# 1. Create migration file
touch migrations/20240115101530_add_phone_column.sql

# 2. Write migration with UP and DOWN sections
# -- UP
# ALTER TABLE crm_clients ADD COLUMN phone VARCHAR(20);
# -- DOWN
# ALTER TABLE crm_clients DROP COLUMN phone;

# 3. Run migrations
npm run migrate

# 4. Test migrations
npm test

# 5. Rollback if needed
npm run migrate:rollback
```

### Production Deployment

1. **Test migrations locally**
   ```bash
   npm run migrate:test
   npm run migrate:rollback
   ```

2. **Backup database**
   ```bash
   pg_dump legal_automation > backup.sql
   ```

3. **Deploy and run migrations**
   ```bash
   npm run migrate  # Runs automatically on startup
   ```

4. **Verify schema**
   ```bash
   npm run db:schema
   ```

## Switching Between Adapters

### Development (In-Memory)

```typescript
import { InMemoryAdapter } from '@database/persistenceAdapter';

const adapter = new InMemoryAdapter();
const repository = new ConcreteRepository(adapter);
```

### Production (PostgreSQL)

```typescript
import { PostgreSQLAdapter } from '@database/persistenceAdapter';
import { poolManager } from '@database/poolManager';

const pool = poolManager.getPool();
const adapter = new PostgreSQLAdapter(pool, 'table_name', pool);
const repository = new ConcreteRepository(adapter);
```

The `repositoryFactory` automatically uses PostgreSQL when initialized.

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**
1. Verify PostgreSQL is running: `pg_isready`
2. Check connection string: `DATABASE_URL`
3. Verify credentials and database exists

### Migration Errors

```
Error: duplicate key value violates unique constraint
```

**Solution:**
1. Check existing data with conflicting values
2. Create data migration to handle existing records
3. Add `IF NOT EXISTS` to idempotent migrations

### Pool Exhaustion

```
Error: Client request timeout - queue full
```

**Solution:**
1. Increase `DB_POOL_SIZE`
2. Check for connection leaks (unreleased clients)
3. Implement connection timeout handling
4. Monitor pool statistics

### Slow Queries

```
Query took 5000ms
```

**Solution:**
1. Use `EXPLAIN ANALYZE` to find bottlenecks
2. Add appropriate indexes
3. Consider query restructuring
4. Check database statistics

## Monitoring & Maintenance

### Check Database Size

```sql
SELECT 
  datname,
  pg_size_pretty(pg_database_size(datname)) as size
FROM pg_database
WHERE datname = 'legal_automation';
```

### Monitor Active Connections

```sql
SELECT pid, usename, application_name, state
FROM pg_stat_activity
WHERE datname = 'legal_automation';
```

### Vacuum & Analyze

```sql
-- Remove dead rows
VACUUM ANALYZE legal_automation;

-- Or specific table
VACUUM ANALYZE crm_clients;
```

## Backup & Recovery

### Backup Database

```bash
pg_dump -U postgres legal_automation > backup.sql
```

### Restore Database

```bash
psql -U postgres -d legal_automation < backup.sql
```

### Incremental Backups (WAL)

```bash
# Enable WAL archiving in postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'cp %p /backup/wal/%f'
```

## Future Enhancements

- [ ] Connection pooling with PgBouncer
- [ ] Read replicas for scaling
- [ ] Sharding strategy for large tables
- [ ] Full-text search integration
- [ ] Automated backup scheduling
- [ ] Query performance monitoring
- [ ] Multi-database support
- [ ] Connection health checks

## References

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Node.js pg Library](https://node-postgres.com/)
- [Database Indexes Guide](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Connection Pooling Best Practices](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections)
