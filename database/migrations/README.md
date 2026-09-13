# Database Migrations

This directory contains all database schema changes and migrations.

## How to Apply Migrations

### Manual Application (PostgreSQL)
```bash
# Connect to your database
psql -U username -d database_name -f add-unique-constraint-faturas.sql

# Or using Supabase CLI
supabase db push
```

### Automated (Supabase)
```bash
# Create a migration in Supabase
supabase migration new add_unique_constraint_faturas

# Apply migrations
supabase db push
```

## Migrations

### add-unique-constraint-faturas.sql
**Status:** READY FOR PRODUCTION  
**Purpose:** Prevent duplicate invoice generation

- Adds UNIQUE constraint: `(contrato_id, competencia)`
- Prevents two invoices for the same contract in the same month
- Handles race conditions in concurrent cron jobs

**When to apply:** Before enabling high-frequency cron jobs  
**Rollback:** `ALTER TABLE faturas DROP CONSTRAINT uk_faturas_contrato_competencia;`

---

## Migration Checklist

Before applying any migration:

- [ ] Test on staging environment first
- [ ] Backup production database
- [ ] Schedule deployment outside business hours
- [ ] Have rollback plan ready
- [ ] Monitor application logs after deployment
- [ ] Verify data integrity with post-deployment queries

## Testing Migrations

### 1. Test Locally
```bash
# With Docker PostgreSQL
docker run -e POSTGRES_PASSWORD=password postgres:14
```

### 2. Test on Staging
```bash
# Deploy to staging environment
npm run deploy:staging

# Run migration
supabase db push --remote staging
```

### 3. Verify Constraint
```sql
-- Check if constraint exists
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'faturas' AND constraint_type = 'UNIQUE';

-- Check for existing duplicates (should be empty)
SELECT contrato_id, competencia, COUNT(*) as cnt
FROM faturas
GROUP BY contrato_id, competencia
HAVING COUNT(*) > 1;
```

## Common Issues

### Migration Fails: Existing Duplicates
**Problem:** Unique constraint fails because duplicates already exist

**Solution:**
```sql
-- Find duplicates
SELECT contrato_id, competencia FROM faturas
GROUP BY contrato_id, competencia HAVING COUNT(*) > 1;

-- Remove duplicates (keep latest)
DELETE FROM faturas
WHERE id NOT IN (
  SELECT MAX(id) FROM faturas
  GROUP BY contrato_id, competencia
);

-- Then apply migration
```

### Migration Rollback
```sql
-- Undo the constraint addition
ALTER TABLE faturas DROP CONSTRAINT uk_faturas_contrato_competencia;
```

## Version Control

All migrations are version-controlled. Each migration should:
- Be idempotent (safe to run multiple times)
- Include comments explaining the purpose
- Include validation queries
- Include rollback instructions

## Deployment Process

1. **Development**: Test migration locally
2. **Staging**: Apply to staging database
3. **Production**: Schedule and apply during maintenance window
4. **Verification**: Run validation queries
5. **Documentation**: Update changelog

## For More Info

- [Supabase Migrations](https://supabase.com/docs/guides/database/migrations)
- [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [Database Best Practices](./BEST_PRACTICES.md)
