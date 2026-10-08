#!/bin/bash

###############################################################################
# CRMT Cloud Database Setup & Configuration Script (Phase 21)
###############################################################################
#
# Purpose: Interactive script to validate and setup cloud database connection
# Supports: PostgreSQL (AWS RDS, Azure, Google Cloud SQL)
#
# Usage:
#   ./scripts/setup-cloud-database.sh              # Interactive mode
#   ./scripts/setup-cloud-database.sh --validate   # Validate existing connection
#   ./scripts/setup-cloud-database.sh --migrate    # Migrate from SQLite to PostgreSQL
#   ./scripts/setup-cloud-database.sh --health     # Check database health
#
###############################################################################

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV_LOCAL="$PROJECT_DIR/.env.local"

###############################################################################
# Utility Functions
###############################################################################

log_info() {
  echo -e "${BLUE}ℹ ${1}${NC}"
}

log_success() {
  echo -e "${GREEN}✓ ${1}${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠ ${1}${NC}"
}

log_error() {
  echo -e "${RED}✗ ${1}${NC}"
}

log_section() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}${1}${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Load .env file
load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
  fi
  if [ -f "$ENV_LOCAL" ]; then
    set -a
    source "$ENV_LOCAL"
    set +a
  fi
}

###############################################################################
# Database Connection Functions
###############################################################################

# Test PostgreSQL connection
test_postgres_connection() {
  local db_url="$1"

  log_info "Testing PostgreSQL connection..."

  if ! command_exists psql; then
    log_error "psql not found. Install PostgreSQL client: brew install postgresql"
    return 1
  fi

  # Extract connection details from DATABASE_URL
  # Format: postgresql://user:password@host:port/dbname
  if psql "$db_url" -c "SELECT VERSION();" >/dev/null 2>&1; then
    log_success "PostgreSQL connection successful"
    psql "$db_url" -c "SELECT VERSION();" | head -1
    return 0
  else
    log_error "PostgreSQL connection failed"
    echo "  Check your connection string and credentials"
    return 1
  fi
}

# Test connection pool
test_connection_pool() {
  local db_url="$1"

  log_info "Testing connection pool configuration..."

  if ! command_exists node; then
    log_error "Node.js not found"
    return 1
  fi

  # Create temporary test script
  cat > /tmp/test-pool.js << 'EOF'
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DATABASE_POOL_SIZE || '20'),
  idleTimeoutMillis: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DATABASE_POOL_CONNECTION_TIMEOUT || '5000'),
});

(async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✓ Connection pool working');
    console.log('✓ Current time:', result.rows[0].now);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('✗ Connection pool failed:', error.message);
    process.exit(1);
  }
})();
EOF

  DATABASE_URL="$db_url" node /tmp/test-pool.js 2>/dev/null && {
    log_success "Connection pool configuration valid"
    return 0
  } || {
    log_error "Connection pool test failed"
    return 1
  }
}

# Verify database schema exists
verify_schema() {
  local db_url="$1"

  log_info "Verifying database schema..."

  if ! command_exists psql; then
    log_error "psql not found"
    return 1
  fi

  # Check for presence of key tables
  local table_count=$(psql "$db_url" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "0")

  if [ "$table_count" -gt 0 ]; then
    log_success "Database schema found ($table_count tables)"
    psql "$db_url" -c "\dt public.*;" 2>/dev/null
    return 0
  else
    log_warning "No tables found in database schema"
    return 1
  fi
}

###############################################################################
# Database Migration Functions
###############################################################################

# Backup SQLite database
backup_sqlite() {
  local sqlite_path="${PROJECT_DIR}/data/app.db"

  if [ ! -f "$sqlite_path" ]; then
    log_warning "SQLite database not found at $sqlite_path"
    return 1
  fi

  local backup_path="${PROJECT_DIR}/data/app.db.backup.$(date +%Y%m%d_%H%M%S)"
  log_info "Backing up SQLite to $backup_path..."

  cp "$sqlite_path" "$backup_path"
  log_success "SQLite backup created: $backup_path"
}

# Migrate data from SQLite to PostgreSQL
migrate_sqlite_to_postgres() {
  local db_url="$1"
  local sqlite_path="${PROJECT_DIR}/data/app.db"

  log_section "SQLite to PostgreSQL Migration"

  if [ ! -f "$sqlite_path" ]; then
    log_error "SQLite database not found at $sqlite_path"
    return 1
  fi

  # Backup SQLite first
  if ! backup_sqlite; then
    log_error "Failed to backup SQLite database"
    return 1
  fi

  log_info "Migrating data from SQLite to PostgreSQL..."

  # Check for pgloader
  if command_exists pgloader; then
    log_info "Using pgloader for migration..."

    if pgloader sqlite:///"$sqlite_path" "$db_url" --verbose; then
      log_success "Data migration completed successfully"
      return 0
    else
      log_error "pgloader migration failed"
      return 1
    fi
  else
    log_warning "pgloader not installed. Install with: brew install pgloader"
    log_info "Using manual export/import method..."

    # Manual migration using dump
    if sqlite3 "$sqlite_path" .dump > /tmp/sqlite-dump.sql; then
      # Convert SQLite-specific SQL to PostgreSQL-compatible format
      sed -i.bak 's/INTEGER PRIMARY KEY/SERIAL PRIMARY KEY/g' /tmp/sqlite-dump.sql
      sed -i.bak 's/AUTOINCREMENT//g' /tmp/sqlite-dump.sql

      if psql "$db_url" < /tmp/sqlite-dump.sql >/dev/null 2>&1; then
        log_success "Manual migration completed"
        return 0
      else
        log_error "Manual migration failed"
        return 1
      fi
    else
      log_error "Failed to export SQLite data"
      return 1
    fi
  fi
}

###############################################################################
# Interactive Setup Functions
###############################################################################

# Show database provider options
select_provider() {
  echo ""
  echo "Select your PostgreSQL provider:"
  echo "  1) AWS RDS Aurora PostgreSQL"
  echo "  2) Azure Database for PostgreSQL"
  echo "  3) Google Cloud SQL"
  echo "  4) Other PostgreSQL host"
  echo "  5) Local PostgreSQL (development)"
  echo ""
  read -p "Enter choice (1-5): " choice

  case $choice in
    1) echo "aws_rds" ;;
    2) echo "azure" ;;
    3) echo "gcp" ;;
    4) echo "other" ;;
    5) echo "local" ;;
    *) log_error "Invalid choice"; select_provider ;;
  esac
}

# Build connection string interactively
build_connection_string() {
  local provider="$1"

  case $provider in
    aws_rds)
      log_info "AWS RDS Aurora PostgreSQL Setup"
      read -p "  Cluster endpoint (e.g., crmt-db.cluster-xxx.us-east-1.rds.amazonaws.com): " host
      read -p "  Port (default: 5432): " port
      port="${port:-5432}"
      read -p "  Database name (default: crmt_prod): " dbname
      dbname="${dbname:-crmt_prod}"
      read -p "  Username (default: crmt): " user
      user="${user:-crmt}"
      read -sp "  Password: " password
      echo ""
      echo "postgresql://${user}:${password}@${host}:${port}/${dbname}"
      ;;

    azure)
      log_info "Azure Database for PostgreSQL Setup"
      read -p "  Server name (e.g., crmt-db-prod.postgres.database.azure.com): " host
      read -p "  Database name (default: crmt_prod): " dbname
      dbname="${dbname:-crmt_prod}"
      read -p "  Username (e.g., crmt@crmt-db-prod): " user
      read -sp "  Password: " password
      echo ""
      echo "postgresql://${user}:${password}@${host}:5432/${dbname}?sslmode=require"
      ;;

    gcp)
      log_info "Google Cloud SQL for PostgreSQL Setup"
      log_info "Note: Use Cloud SQL Proxy for secure connections"
      read -p "  Instance connection name (project:region:instance): " instance
      read -p "  Database name (default: crmt_prod): " dbname
      dbname="${dbname:-crmt_prod}"
      read -p "  Username (default: crmt): " user
      user="${user:-crmt}"
      read -sp "  Password: " password
      echo ""
      log_info "Start Cloud SQL Proxy: ./cloud_sql_proxy -instances=${instance}=tcp:5432"
      echo "postgresql://${user}:${password}@localhost:5432/${dbname}"
      ;;

    other)
      log_info "Custom PostgreSQL Setup"
      read -p "  Host: " host
      read -p "  Port (default: 5432): " port
      port="${port:-5432}"
      read -p "  Database name: " dbname
      read -p "  Username: " user
      read -sp "  Password: " password
      echo ""
      echo "postgresql://${user}:${password}@${host}:${port}/${dbname}"
      ;;

    local)
      log_info "Local PostgreSQL Setup"
      echo "postgresql://crmt:password@localhost:5432/crmt_dev"
      ;;
  esac
}

# Update .env file
update_env_file() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$ENV_FILE"; then
    # Update existing line
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    fi
  else
    # Append new line
    echo "${key}=${value}" >> "$ENV_FILE"
  fi

  log_success "Updated .env: ${key}=${value:0:40}..."
}

###############################################################################
# Health Check & Monitoring Functions
###############################################################################

# Check database health
check_database_health() {
  local db_url="${DATABASE_URL:?DATABASE_URL not set}"

  log_section "Database Health Check"

  if ! command_exists psql; then
    log_error "psql not found"
    return 1
  fi

  # Server uptime
  log_info "Server Information:"
  psql "$db_url" -c "SELECT version();" 2>/dev/null | head -1

  # Database size
  log_info "Database Size:"
  psql "$db_url" -c "SELECT pg_size_pretty(pg_database_size(current_database()));" 2>/dev/null

  # Connection count
  log_info "Active Connections:"
  psql "$db_url" -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null

  # Table count
  log_info "Tables:"
  psql "$db_url" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null

  # Slow queries (if pg_stat_statements enabled)
  log_info "Query Performance (if available):"
  psql "$db_url" -c "SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 5;" 2>/dev/null || log_warning "pg_stat_statements not enabled"

  log_success "Health check completed"
}

###############################################################################
# Main Script Logic
###############################################################################

show_help() {
  cat << EOF
Usage: $0 [COMMAND]

Commands:
  (none)          Interactive setup wizard
  --validate      Validate existing DATABASE_URL connection
  --migrate       Migrate data from SQLite to PostgreSQL
  --health        Check database health and performance
  --help          Show this help message

Environment Variables:
  DATABASE_URL            PostgreSQL connection string
  DATABASE_POOL_SIZE      Connection pool size (default: 20)
  DATABASE_POOL_IDLE_TIMEOUT  Pool idle timeout in ms (default: 30000)

Examples:
  # Interactive setup
  ./scripts/setup-cloud-database.sh

  # Validate connection
  DATABASE_URL="postgresql://user:pass@host/db" ./scripts/setup-cloud-database.sh --validate

  # Migrate from SQLite
  ./scripts/setup-cloud-database.sh --migrate
EOF
}

main() {
  log_section "CRMT Cloud Database Setup (Phase 21)"

  load_env

  case "${1:-}" in
    --validate)
      test_postgres_connection "${DATABASE_URL:?DATABASE_URL not set}"
      ;;

    --migrate)
      if [ -z "$DATABASE_URL" ]; then
        log_error "DATABASE_URL not set. Run interactive setup first."
        exit 1
      fi

      read -p "This will migrate data from SQLite to PostgreSQL. Continue? (y/N): " confirm
      if [ "$confirm" = "y" ]; then
        migrate_sqlite_to_postgres "$DATABASE_URL"
      fi
      ;;

    --health)
      check_database_health
      ;;

    --help)
      show_help
      ;;

    "")
      # Interactive setup
      log_info "Starting Cloud Database Setup Wizard..."

      echo ""
      echo "This script will help you:"
      echo "  1. Validate PostgreSQL connection"
      echo "  2. Configure connection pooling"
      echo "  3. Run schema migrations"
      echo "  4. Optionally migrate data from SQLite"
      echo ""

      read -p "Continue? (y/N): " confirm
      if [ "$confirm" != "y" ]; then
        log_warning "Setup cancelled"
        exit 0
      fi

      # Step 1: Select provider
      provider=$(select_provider)

      # Step 2: Build connection string
      log_info "Building connection string for $provider..."
      db_url=$(build_connection_string "$provider")

      # Step 3: Test connection
      if test_postgres_connection "$db_url"; then
        log_success "Connection validation passed!"

        # Step 4: Update .env
        update_env_file "DATABASE_URL" "$db_url"

        # Step 5: Configure connection pool
        read -p "Configure connection pooling? (Y/n): " configure_pool
        if [ "$configure_pool" != "n" ]; then
          read -p "Pool size (default: 20): " pool_size
          pool_size="${pool_size:-20}"
          update_env_file "DATABASE_POOL_SIZE" "$pool_size"

          read -p "Idle timeout in ms (default: 30000): " idle_timeout
          idle_timeout="${idle_timeout:-30000}"
          update_env_file "DATABASE_POOL_IDLE_TIMEOUT" "$idle_timeout"
        fi

        # Step 6: Run migrations
        if [ -d "server/src/db/migrations" ]; then
          read -p "Run database migrations? (Y/n): " run_migrations
          if [ "$run_migrations" != "n" ]; then
            log_info "Running migrations..."
            npm run migrate:up || log_error "Migration failed"
          fi
        fi

        # Step 7: Optional SQLite migration
        if [ -f "data/app.db" ]; then
          read -p "Migrate data from SQLite to PostgreSQL? (y/N): " migrate_data
          if [ "$migrate_data" = "y" ]; then
            migrate_sqlite_to_postgres "$db_url"
          fi
        fi

        # Step 8: Final verification
        verify_schema "$db_url"
        check_database_health

        log_success "Cloud database setup completed!"
        log_info "Configuration saved to: $ENV_FILE"
      else
        log_error "Connection validation failed. Please check your settings."
        exit 1
      fi
      ;;

    *)
      log_error "Unknown command: $1"
      show_help
      exit 1
      ;;
  esac
}

# Run main function
main "$@"
