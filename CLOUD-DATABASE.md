# Cloud Database Support Guide

## Overview

This guide covers setting up CRMT with cloud-hosted PostgreSQL databases instead of SQLite. Cloud databases provide:

- **High availability**: Managed failover and redundancy
- **Scalability**: Easy scaling up to handle growth
- **Security**: Encryption at rest and in transit, IAM-based access control
- **Backups**: Automated managed backups with point-in-time recovery
- **Multi-region**: Deploy closer to your users for lower latency
- **Monitoring**: Built-in performance monitoring and alerting

## Architecture Overview

### Local Development (SQLite)
```
Client App → SQLite File (./data/app.db)
```

### Production (PostgreSQL on Cloud)
```
Client App → Connection Pool (pgBouncer/node-postgres)
            ↓
         SSL/TLS
            ↓
        PostgreSQL Server (AWS RDS/Aurora, Azure, Google Cloud SQL)
```

## Prerequisites

- Node.js 18+
- PostgreSQL client tools (psql, pg_dump)
- Cloud provider account (AWS, Azure, or Google Cloud)
- Basic SQL knowledge

## Quick Start

### 1. Local PostgreSQL Development

Install PostgreSQL locally:

**macOS (Homebrew)**:
```bash
brew install postgresql@15
brew services start postgresql@15
createuser crmt -P      # Set password when prompted
createdb -O crmt crmt_dev
```

**Linux (Ubuntu/Debian)**:
```bash
sudo apt-get install postgresql postgresql-contrib
sudo -u postgres createuser crmt -P
sudo -u postgres createdb -O crmt crmt_dev
```

**Windows**:
Download from https://www.postgresql.org/download/windows/ and run installer.

Connection string:
```bash
DATABASE_URL=postgresql://crmt:password@localhost:5432/crmt_dev
```

### 2. Update Environment Variables

Edit `.env`:
```bash
# SQLite (default)
# DATABASE_URL=file:./data/app.db

# PostgreSQL
DATABASE_URL=postgresql://crmt:password@localhost:5432/crmt_dev

# Connection pooling
DATABASE_POOL_SIZE=10
DATABASE_POOL_IDLE_TIMEOUT=30000
DATABASE_POOL_CONNECTION_TIMEOUT=5000
DATABASE_POOL_MAX_OVERFLOW=5
```

### 3. Run Migrations

```bash
# From SQLite to PostgreSQL
npm run migrate:up

# Verify connection
npm run db:check
```

### 4. Verify Database

```bash
psql postgresql://crmt:password@localhost:5432/crmt_dev

# Inside psql:
\dt                     # List tables
SELECT COUNT(*) FROM users;  # Test query
\q                      # Exit
```

## AWS RDS Aurora PostgreSQL

Aurora PostgreSQL provides MySQL-compatible PostgreSQL with auto-scaling and high availability.

### Setup Steps

1. **Create RDS Cluster**

   AWS Console → RDS → Create Database → Aurora PostgreSQL

   - **Engine**: Aurora PostgreSQL
   - **Version**: PostgreSQL 15.2+
   - **DB Instance Class**: db.t3.small (development) or db.r5.large (production)
   - **Storage**: Aurora uses automatic storage (no allocation needed)

2. **Configure Network**

   - **VPC**: Use your application's VPC
   - **Subnet Group**: Create multi-AZ subnet group
   - **Public Accessibility**: No (use private endpoint)
   - **Security Group**: Create allowing port 5432 from app servers only

3. **Database Configuration**

   - **DB Name**: `crmt_prod`
   - **Master Username**: `crmt_admin`
   - **Master Password**: Auto-generate (save to secrets manager)
   - **Backup Retention**: 30 days (adjustable)
   - **Multi-AZ**: Enable for production

4. **Retrieve Connection Details**

   After cluster creation, find in Cluster Details:
   - **Cluster Endpoint** (writer): `crmt-db.cluster-xxx.us-east-1.rds.amazonaws.com`
   - **Reader Endpoint** (read replicas): `crmt-db.cluster-ro-xxx.us-east-1.rds.amazonaws.com`
   - **Port**: 5432

5. **Create Application User**

   Connect as admin, then run:

   ```sql
   CREATE USER crmt WITH ENCRYPTED PASSWORD 'secure-password-here';
   GRANT CONNECT ON DATABASE crmt_prod TO crmt;
   GRANT USAGE ON SCHEMA public TO crmt;
   GRANT CREATE ON SCHEMA public TO crmt;
   \c crmt_prod
   GRANT ALL ON ALL TABLES IN SCHEMA public TO crmt;
   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO crmt;
   GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO crmt;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO crmt;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO crmt;
   ```

### Connection String

**Writer Endpoint** (for writes):
```bash
postgresql://crmt:password@crmt-db.cluster-xxx.us-east-1.rds.amazonaws.com:5432/crmt_prod
```

**Reader Endpoint** (for read-only queries):
```bash
postgresql://crmt:password@crmt-db.cluster-ro-xxx.us-east-1.rds.amazonaws.com:5432/crmt_prod
```

### Environment Variables

```bash
# AWS RDS Aurora
DATABASE_URL=postgresql://crmt:password@crmt-db.cluster-xxx.us-east-1.rds.amazonaws.com:5432/crmt_prod
DATABASE_REPLICA_URL=postgresql://crmt:password@crmt-db.cluster-ro-xxx.us-east-1.rds.amazonaws.com:5432/crmt_prod

# Connection pooling (PgBouncer or node-postgres)
DATABASE_POOL_SIZE=20
DATABASE_POOL_IDLE_TIMEOUT=30000
DATABASE_POOL_CONNECTION_TIMEOUT=5000

# SSL/TLS (required for RDS)
DATABASE_SSL=require
DATABASE_SSL_REJECT_UNAUTHORIZED=true

# AWS Credentials (for backup to S3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=crmt-backups-prod
```

### Scaling

**Vertical Scaling** (larger instance):
1. RDS Console → Cluster → Modify
2. Select new DB Instance Class
3. Choose maintenance window (or immediate)
4. Update takes 5-15 minutes with brief downtime

**Horizontal Scaling** (read replicas):
1. Create Aurora replica: RDS Console → Add Reader Instance
2. Update `DATABASE_REPLICA_URL` in .env
3. Route read queries to replica for load distribution

### Monitoring

**CloudWatch Metrics**:
- CPU Utilization (target: < 75%)
- Database Connections (growing trend = need pooling)
- Storage Space (track growth)
- Read/Write Latency (target: < 5ms)

**AWS Console**:
```
RDS → Databases → crmt-db → Monitoring tab
```

**Set up CloudWatch Alarms**:
```bash
# High CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name crmt-rds-high-cpu \
  --alarm-description "Alert if CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

## Azure Database for PostgreSQL

Azure provides fully managed PostgreSQL with automatic backups and failover.

### Setup Steps

1. **Create Database Server**

   Azure Portal → Create Resource → Azure Database for PostgreSQL

   - **Deployment Option**: Single Server (or Flexible Server for newer features)
   - **Server Name**: `crmt-db-prod`
   - **Region**: Choose closest to your users
   - **Version**: PostgreSQL 13+
   - **Compute**: Standard_B2s (development) or Standard_D2s_v3 (production)
   - **Storage**: 32 GB (auto-scaling available)

2. **Configure Connectivity**

   - **Firewall Rules**: Add IP ranges for app servers
   - **SSL**: Required (default: ENFORCE)
   - **Network**: Private endpoint recommended for security

3. **Create Database**

   ```sql
   CREATE DATABASE crmt_prod;
   CREATE USER crmt WITH ENCRYPTED PASSWORD 'secure-password';
   GRANT ALL PRIVILEGES ON DATABASE crmt_prod TO crmt;
   ```

4. **Retrieve Connection Details**

   From Azure Portal → Server Details:
   - **Server Name**: `crmt-db-prod.postgres.database.azure.com`
   - **Port**: 5432
   - **Username**: `crmt@crmt-db-prod`

### Connection String

```bash
postgresql://crmt@crmt-db-prod:password@crmt-db-prod.postgres.database.azure.com:5432/crmt_prod?sslmode=require
```

### Environment Variables

```bash
# Azure Database for PostgreSQL
DATABASE_URL=postgresql://crmt@crmt-db-prod:password@crmt-db-prod.postgres.database.azure.com:5432/crmt_prod?sslmode=require

# Connection pooling
DATABASE_POOL_SIZE=20
DATABASE_POOL_IDLE_TIMEOUT=30000

# Azure Backup (to blob storage)
AZURE_STORAGE_ACCOUNT=crmtbackups
AZURE_STORAGE_KEY=...
AZURE_BACKUP_CONTAINER=backups
```

### Backup Strategy

**Automatic Backups**:
- Retention: 7-35 days (configurable)
- Automatic failover available in Business Critical tier

**Manual Backups**:
```bash
# Using Azure CLI
az postgres server backup create \
  --resource-group mygroup \
  --server-name crmt-db-prod
```

### Monitoring

**Azure Monitor**:
```
Portal → Database → Monitoring → Metrics
- Server log storage space
- CPU percent
- Memory percent
- Network In/Out
- Database connections
```

## Google Cloud SQL for PostgreSQL

Google Cloud SQL provides fully managed PostgreSQL with automatic failover and backups.

### Setup Steps

1. **Create SQL Instance**

   Google Cloud Console → SQL → Create Instance → PostgreSQL

   - **Instance ID**: `crmt-db-prod`
   - **Password**: Auto-generate (save to Secret Manager)
   - **Version**: PostgreSQL 15+
   - **Machine Type**: db-f1-micro (development) or db-n1-standard-2 (production)
   - **Storage**: 10-100 GB (auto-scaling available)
   - **Region**: Choose closest to app

2. **Configure Network**

   - **Private IP**: Enable for secure connection
   - **Public IP**: Disable for security
   - **Authorized Networks**: Add app server IP ranges

3. **Create Database and User**

   ```sql
   CREATE DATABASE crmt_prod;
   CREATE USER crmt WITH PASSWORD 'secure-password';
   GRANT CONNECT ON DATABASE crmt_prod TO crmt;
   GRANT USAGE ON SCHEMA public TO crmt;
   GRANT CREATE ON SCHEMA public TO crmt;
   \c crmt_prod
   GRANT ALL ON ALL TABLES IN SCHEMA public TO crmt;
   ```

4. **Retrieve Connection Details**

   From Cloud Console → SQL Instances → crmt-db-prod:
   - **Private IP**: `10.x.x.x` (Cloud SQL Proxy required)
   - **Public IP**: For external connections

### Connection String

**Via Cloud SQL Proxy** (recommended):
```bash
postgresql://crmt:password@localhost:5432/crmt_prod
```

**With Cloud SQL Proxy Installation**:
```bash
# Install Cloud SQL Proxy
curl -o cloud_sql_proxy https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64
chmod +x cloud_sql_proxy

# Run in background
./cloud_sql_proxy -instances=project:region:crmt-db-prod=tcp:5432 &

# Then connect locally
psql postgresql://crmt:password@localhost:5432/crmt_prod
```

### Environment Variables

```bash
# Google Cloud SQL
DATABASE_URL=postgresql://crmt:password@localhost:5432/crmt_prod
CLOUDSQL_PROXY_PATH=/usr/local/bin/cloud_sql_proxy
CLOUDSQL_INSTANCE=my-project:us-central1:crmt-db-prod

# Connection pooling
DATABASE_POOL_SIZE=20
DATABASE_POOL_IDLE_TIMEOUT=30000

# Google Cloud Storage (for backups)
GCS_BUCKET=crmt-backups-prod
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### Backup Strategy

**Automated Backups**:
- Retention: 7-35 days
- Frequency: Configurable (hourly/daily)
- Point-in-time recovery: Available

**Manual Backups**:
```bash
# Using gcloud CLI
gcloud sql backups create \
  --instance=crmt-db-prod
```

## Connection Pool Configuration

### Why Connection Pooling?

Cloud databases have connection limits (typically 100-1000 depending on tier). Without pooling:
- Each request creates new connection → slow
- Connections accumulate → hits limit → connection errors

**Pooling Solution**: Reuse connections between requests

### Option 1: Node-postgres Built-in Pool

Simplest option, works well for small-to-medium apps (< 100 concurrent users):

```typescript
// server/src/db.ts
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DATABASE_POOL_SIZE || '20'),
  idleTimeoutMillis: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DATABASE_POOL_CONNECTION_TIMEOUT || '5000'),
  max_overflow: parseInt(process.env.DATABASE_POOL_MAX_OVERFLOW || '5'),
});

// Test connection
export async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connected:', result.rows[0].now);
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

// Query helper
export async function query(sql: string, params?: any[]) {
  const start = Date.now();
  try {
    const result = await pool.query(sql, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`Slow query (${duration}ms): ${sql}`);
    }
    return result;
  } catch (error) {
    console.error('Query error:', error, { sql, params });
    throw error;
  }
}
```

**Environment Variables**:
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
DATABASE_POOL_SIZE=20              # Connections per app instance
DATABASE_POOL_IDLE_TIMEOUT=30000   # Close idle after 30s
DATABASE_POOL_CONNECTION_TIMEOUT=5000  # Fail if can't get connection in 5s
DATABASE_POOL_MAX_OVERFLOW=5       # Allow 5 extra connections under load
```

### Option 2: PgBouncer Connection Pooler

Recommended for high-traffic apps (> 100 concurrent users):

**Benefits**:
- Single connection pool shared across app instances
- Lower connection count to cloud database
- Connection limit enforcement
- Load balancing across replicas

**Installation**:

```bash
# macOS
brew install pgbouncer

# Linux
sudo apt-get install pgbouncer

# Docker
docker run -d --name pgbouncer edoburu/pgbouncer
```

**Configuration** (`pgbouncer.ini`):
```ini
[databases]
crmt_prod = host=crmt-db.cluster-xxx.us-east-1.rds.amazonaws.com port=5432 dbname=crmt_prod

[pgbouncer]
pool_mode = transaction     # Or 'session' for stickier connections
max_client_conn = 1000      # Max connections from app
default_pool_size = 25      # Connections per database
min_pool_size = 5           # Minimum idle connections
reserve_pool_size = 5       # Emergency reserve
reserve_pool_timeout = 3    # Timeout for reserve pool
max_db_connections = 100    # Max connections to actual DB
server_lifetime = 3600      # Recycle connections after 1 hour
server_idle_timeout = 600   # Close idle server connections after 10 min
```

**Start PgBouncer**:
```bash
pgbouncer -d -R pgbouncer.ini
```

**Connect App to PgBouncer**:
```bash
DATABASE_URL=postgresql://user:pass@localhost:6432/crmt_prod
```

### Connection Pool Monitoring

```typescript
// server/src/monitoring/db-pool.ts
export function monitorPoolHealth() {
  setInterval(() => {
    const poolState = {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingRequests: pool.waitingCount,
      timestamp: new Date().toISOString(),
    };
    
    if (pool.totalCount > Math.floor(pool.options.max * 0.9)) {
      console.warn('⚠️ Connection pool near capacity', poolState);
      // Send alert to monitoring service
    }
    
    logger.debug('Pool health', poolState);
  }, 60000); // Every minute
}
```

## SSL/TLS Certificate Setup

All cloud databases require SSL for security. Here's how to configure it:

### Automatic (Recommended)

Most cloud providers (AWS RDS, Azure, GCP) automatically handle certificates. Just enable in connection string:

```bash
# AWS RDS Aurora
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Azure Database for PostgreSQL
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Google Cloud SQL
DATABASE_URL=postgresql://user:pass@localhost/db?sslmode=require
```

### Manual Certificate Configuration

If you need custom certificates:

1. **Download Certificate Bundle**

   AWS RDS:
   ```bash
   wget https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
   ```

2. **Configure in Node.js**

   ```typescript
   import { readFileSync } from 'fs';
   
   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     ssl: {
       rejectUnauthorized: true,
       ca: readFileSync('/path/to/ca-bundle.pem', 'utf8'),
       cert: readFileSync('/path/to/client-cert.pem', 'utf8'),
       key: readFileSync('/path/to/client-key.pem', 'utf8'),
     },
   });
   ```

3. **Environment Variable**

   ```bash
   DATABASE_SSL_CERT_PATH=/etc/ssl/certs/ca-bundle.pem
   DATABASE_SSL_REJECT_UNAUTHORIZED=true
   ```

## Database Migration: SQLite to PostgreSQL

### Strategy

1. **Backup SQLite**: Create backup before migration
2. **Export Schema**: Extract schema from SQLite
3. **Create PostgreSQL Schema**: Apply schema to PostgreSQL
4. **Migrate Data**: Transfer data from SQLite to PostgreSQL
5. **Verify**: Check data integrity
6. **Switch Connection**: Update DATABASE_URL
7. **Monitor**: Watch for issues during rollout

### Step-by-Step

```bash
# 1. Backup SQLite
cp data/app.db data/app.db.backup.$(date +%Y%m%d)

# 2. Create PostgreSQL dump from SQLite
npx pgloader sqlite:///data/app.db postgresql://user:pass@host/crmt_prod

# Or manual approach:
# 3. Export schema
sqlite3 data/app.db .schema > schema.sql

# 4. Create tables in PostgreSQL
psql postgresql://user:pass@host/crmt_prod < schema.sql

# 5. Export data
sqlite3 -header -csv data/app.db "SELECT * FROM users;" > users.csv

# 6. Import data
psql postgresql://user:pass@host/crmt_prod -c "COPY users FROM STDIN CSV HEADER;" < users.csv

# 7. Verify record counts
sqlite3 data/app.db "SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'documents', COUNT(*) FROM documents;"

psql postgresql://user:pass@host/crmt_prod -c "
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'documents', COUNT(*) FROM documents;"

# 8. Update .env
sed -i 's/^DATABASE_URL=.*/DATABASE_URL=postgresql:\/\/user:pass@host:5432\/crmt_prod/' .env

# 9. Restart app
npm run dev
```

### Validation Queries

```sql
-- Count tables and rows
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Verify foreign keys
SELECT * FROM information_schema.table_constraints 
WHERE constraint_type = 'FOREIGN KEY';

-- Check indexes
SELECT * FROM pg_indexes WHERE schemaname = 'public';

-- Test sample queries
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM documents;
```

## Performance Tuning

### Query Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_transactions_status ON transactions(status) WHERE status != 'completed';

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM documents WHERE user_id = 1;

-- Vacuum and analyze (maintenance)
VACUUM ANALYZE;
```

### Connection Pool Tuning

```bash
# Development
DATABASE_POOL_SIZE=5
DATABASE_POOL_IDLE_TIMEOUT=30000

# Production (single instance)
DATABASE_POOL_SIZE=20
DATABASE_POOL_IDLE_TIMEOUT=10000

# Production (high-traffic, use PgBouncer)
DATABASE_POOL_SIZE=5  # Per app instance
# Use PgBouncer for central pooling
```

### Database Parameters

**AWS RDS Aurora**:
```sql
-- Increase log_min_duration_statement to find slow queries
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- Enable query planner insights
SET pg_stat_statements.track = 'all';
```

**Azure / GCP**: Check provider documentation for parameter groups

## Backup Strategy for Cloud Databases

### Managed Backups (Automated)

All major cloud providers include automated backups:

- **AWS RDS Aurora**: 35-day retention, point-in-time recovery
- **Azure**: 7-35 day retention
- **Google Cloud SQL**: 7-35 day retention

**No configuration needed** — enabled by default.

### Application-Level Backups

For additional protection, implement app-level backups:

```bash
# Daily pg_dump to S3
AWS_REGION=us-east-1 \
AWS_S3_BUCKET=crmt-backups-prod \
AWS_ACCESS_KEY_ID=... \
AWS_SECRET_ACCESS_KEY=... \
node scripts/backup-to-s3.js
```

**Script** (`scripts/backup-to-s3.js`):
```javascript
import { exec } from 'child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const timestamp = new Date().toISOString().replace(/:/g, '-');
const filename = `crmt-backup-${timestamp}.sql.gz`;

exec(`pg_dump ${process.env.DATABASE_URL} | gzip`, async (error, stdout) => {
  if (error) throw error;
  
  const uploadParams = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `backups/${filename}`,
    Body: stdout,
    ContentType: 'application/gzip',
  };
  
  const result = await s3.send(new PutObjectCommand(uploadParams));
  console.log(`Backup uploaded to S3: s3://${process.env.AWS_S3_BUCKET}/backups/${filename}`);
});
```

### Backup Verification

```bash
# Test restore from backup
pg_restore --list crmt-backup.sql | head -20

# Verify backup integrity
pg_dump --version
pg_restore --version
```

## Monitoring & Alerting

### Key Metrics to Monitor

1. **Connection Count**
   ```sql
   SELECT usename, count(*) FROM pg_stat_activity GROUP BY usename;
   ```

2. **Slow Queries**
   ```sql
   SELECT query, calls, mean_time FROM pg_stat_statements 
   ORDER BY mean_time DESC LIMIT 10;
   ```

3. **Cache Hit Ratio** (should be > 99%)
   ```sql
   SELECT 
     sum(heap_blks_read) / (sum(heap_blks_read) + sum(heap_blks_hit)) as ratio
   FROM pg_statio_user_tables;
   ```

4. **Table Sizes**
   ```sql
   SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
   FROM pg_tables
   WHERE schemaname != 'pg_catalog'
   ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
   ```

### CloudWatch Integration (AWS)

```typescript
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

const cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION });

export async function reportPoolMetrics() {
  const metrics = [
    {
      MetricName: 'DatabaseConnections',
      Value: pool.totalCount,
      Unit: 'Count',
    },
    {
      MetricName: 'DatabaseIdleConnections',
      Value: pool.idleCount,
      Unit: 'Count',
    },
    {
      MetricName: 'QueryLatency',
      Value: queryDurationMs,
      Unit: 'Milliseconds',
    },
  ];
  
  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'CRMT',
    MetricData: metrics,
  }));
}
```

## Troubleshooting

### Connection Refused

```bash
# Check cloud provider firewall
# AWS: Security Group
# Azure: Firewall Rules
# GCP: Authorized Networks

# Verify DNS resolution
nslookup crmt-db.cluster-xxx.us-east-1.rds.amazonaws.com

# Test connection
psql -h crmt-db.cluster-xxx.us-east-1.rds.amazonaws.com -U crmt -d crmt_prod
```

### Too Many Connections

```bash
# Check active connections
SELECT COUNT(*) FROM pg_stat_activity;

# Increase database max_connections (requires restart)
ALTER SYSTEM SET max_connections = 500;

# Or implement connection pooling (recommended)
# See "Connection Pool Configuration" section above
```

### Slow Queries

```bash
# Enable slow query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;

# View slow queries
SELECT query, calls, mean_time FROM pg_stat_statements 
WHERE mean_time > 1000 
ORDER BY mean_time DESC;

# Add indexes for frequently filtered columns
CREATE INDEX idx_documents_status ON documents(status);
```

### SSL Certificate Errors

```bash
# Disable certificate verification (development only!)
DATABASE_URL=postgresql://user:pass@host/db?sslmode=disable

# Or download certificate bundle and configure in connection
# See "SSL/TLS Certificate Setup" section
```

## Production Deployment Checklist

- [ ] Cloud database created with automated backups enabled
- [ ] Multi-AZ enabled for high availability
- [ ] Connection pooling configured (PgBouncer or node-postgres)
- [ ] SSL/TLS encryption enabled
- [ ] Database credentials stored in secrets manager (not .env)
- [ ] Application user created with least privilege grants
- [ ] Query performance baseline established (< 100ms p99)
- [ ] Monitoring and alerting configured
- [ ] Backup restoration tested
- [ ] Load testing completed
- [ ] Disaster recovery plan documented

## Additional Resources

- **AWS RDS Aurora PostgreSQL**: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Aurora.html
- **Azure Database for PostgreSQL**: https://learn.microsoft.com/en-us/azure/postgresql/
- **Google Cloud SQL for PostgreSQL**: https://cloud.google.com/sql/docs/postgres/
- **PgBouncer**: https://www.pgbouncer.org/
- **PostgreSQL Documentation**: https://www.postgresql.org/docs/
- **Node-postgres**: https://node-postgres.com/

---

**Last Updated**: October 2026  
**Version**: 1.0.0  
**Status**: Production Ready
