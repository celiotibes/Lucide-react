#!/bin/bash
# Backup & restore utilities for CRMT PostgreSQL via Supabase
# Usage:
#   ./scripts/backup-restore.sh backup-status
#   ./scripts/backup-restore.sh backup-manual <label>
#   ./scripts/backup-restore.sh restore-staging <backup-id>
#   ./scripts/backup-restore.sh test-connection <env>
#
# Prerequisites:
#   - SUPABASE_PROJECT_ID env var
#   - SUPABASE_ACCESS_TOKEN (from https://app.supabase.com/account/tokens)
#   - Supabase Pro plan active

set -euo pipefail

SUPABASE_PROJECT_ID="${SUPABASE_PROJECT_ID:-}"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
SUPABASE_API_URL="https://api.supabase.com/v1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function log_error() {
  echo -e "${RED}ERROR: $1${NC}" >&2
  exit 1
}

function log_info() {
  echo -e "${GREEN}INFO: $1${NC}"
}

function log_warn() {
  echo -e "${YELLOW}WARN: $1${NC}"
}

function check_credentials() {
  if [ -z "$SUPABASE_PROJECT_ID" ]; then
    log_error "SUPABASE_PROJECT_ID not set"
  fi
  if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    log_error "SUPABASE_ACCESS_TOKEN not set"
  fi
}

function backup_status() {
  check_credentials
  log_info "Fetching backup status for project: $SUPABASE_PROJECT_ID"

  curl -s -X GET \
    "$SUPABASE_API_URL/projects/$SUPABASE_PROJECT_ID/backups" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" | jq '.'
}

function backup_manual() {
  check_credentials
  local label="${1:-backup-$(date +%Y%m%d-%H%M%S)}"

  log_info "Creating manual backup with label: $label"

  curl -s -X POST \
    "$SUPABASE_API_URL/projects/$SUPABASE_PROJECT_ID/backups" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$label\"}" | jq '.'

  log_info "Backup initiated. Monitor progress in Supabase Dashboard → Settings → Backups"
}

function restore_staging() {
  check_credentials
  local backup_id="${1:-}"

  if [ -z "$backup_id" ]; then
    log_error "Usage: restore-staging <backup-id>"
  fi

  log_warn "⚠️  DESTRUCTIVE OPERATION: This will overwrite staging database"
  log_warn "Backup ID: $backup_id"
  read -p "Type 'confirm' to proceed: " confirmation

  if [ "$confirmation" != "confirm" ]; then
    log_info "Cancelled."
    exit 0
  fi

  log_info "Restoring backup to staging database..."

  # Note: Supabase API doesn't support direct restore yet.
  # This is a placeholder for when API support is added.
  # For now, use Supabase Dashboard UI:
  # Settings → Backups → [Select backup] → "Restore to staging database"

  log_error "API restore not yet available. Use Supabase Dashboard UI instead."
}

function test_connection() {
  local env="${1:-production}"
  local db_url=""

  case "$env" in
    production|prod)
      db_url="${DATABASE_URL}"
      ;;
    staging)
      db_url="${DATABASE_URL_STAGING:-}"
      ;;
    *)
      log_error "Unknown environment: $env"
      ;;
  esac

  if [ -z "$db_url" ]; then
    log_error "DATABASE_URL not set for environment: $env"
  fi

  log_info "Testing connection to $env database..."

  # Extract host from connection string
  local host=$(echo "$db_url" | sed -E 's|.*@([^:/]+).*|\1|')

  if psql "$db_url" -c "SELECT NOW();" > /dev/null 2>&1; then
    log_info "✓ Connection successful to $env ($host)"
  else
    log_error "✗ Connection failed to $env"
  fi
}

function show_usage() {
  cat <<EOF
CRMT Backup & Restore Utility

Usage: $0 <command> [options]

Commands:
  backup-status              Show backup status and list
  backup-manual <label>      Create manual backup with optional label
  restore-staging <id>       Restore backup to staging database
  test-connection <env>      Test database connection (production|staging)

Examples:
  $0 backup-status
  $0 backup-manual "pre-payment-pipeline"
  $0 test-connection production
  $0 test-connection staging

Environment Variables:
  SUPABASE_PROJECT_ID        Project ID (required for API calls)
  SUPABASE_ACCESS_TOKEN      API token from account/tokens (required)
  DATABASE_URL               Production database URL (for test-connection)
  DATABASE_URL_STAGING       Staging database URL (optional)

Get access token: https://app.supabase.com/account/tokens
EOF
}

# Main
case "${1:-}" in
  backup-status)
    backup_status
    ;;
  backup-manual)
    backup_manual "${2:-}"
    ;;
  restore-staging)
    restore_staging "${2:-}"
    ;;
  test-connection)
    test_connection "${2:-production}"
    ;;
  --help|-h|help)
    show_usage
    ;;
  *)
    if [ -n "${1:-}" ]; then
      log_error "Unknown command: $1"
    fi
    show_usage
    ;;
esac
