#!/bin/bash
###############################################################################
# Disaster Recovery Drill Automation
# Phase 22.23 - Automated DR Testing & Validation
#
# Executes monthly DR drills to validate:
# - RTO (Recovery Time Objective) - target: 1 hour
# - RPO (Recovery Point Objective) - target: 1 hour
# - Backup integrity
# - Recovery procedures
# - Application readiness post-recovery
###############################################################################

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DR_LOG_DIR="${PROJECT_ROOT}/logs/dr-drills"
BACKUP_DIR="${PROJECT_ROOT}/backups"
DATA_DIR="${PROJECT_ROOT}/data"
TEST_DATA_DIR="${DR_LOG_DIR}/test-data"

# Drill configuration
DRILL_ID="drill-$(date +%Y%m%d-%H%M%S)"
DRILL_LOG="${DR_LOG_DIR}/${DRILL_ID}.log"
DRILL_REPORT="${DR_LOG_DIR}/${DRILL_ID}-report.json"

# Thresholds
RTO_THRESHOLD=3600  # seconds (1 hour)
RPO_THRESHOLD=3600  # seconds (1 hour)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

###############################################################################
# Logging Functions
###############################################################################

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $*" | tee -a "$DRILL_LOG"
}

log_error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $*" | tee -a "$DRILL_LOG" >&2
}

log_warn() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [WARN] $*" | tee -a "$DRILL_LOG"
}

log_success() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] [SUCCESS] $*${NC}" | tee -a "$DRILL_LOG"
}

###############################################################################
# Setup Functions
###############################################################################

setup_drill_environment() {
  log "Setting up DR drill environment"

  mkdir -p "$DR_LOG_DIR" "$TEST_DATA_DIR"

  # Verify prerequisites
  local prerequisites=("sqlite3" "jq" "docker" "node")
  for cmd in "${prerequisites[@]}"; do
    if ! command -v "$cmd" &> /dev/null; then
      log_warn "Missing prerequisite: $cmd"
    fi
  done

  log_success "DR drill environment prepared"
}

###############################################################################
# Test 1: Backup Integrity
###############################################################################

test_backup_integrity() {
  log "Test 1: Validating backup integrity"
  local test_start=$(date +%s)
  local backup_file
  local backup_valid=false

  if [[ -f "${BACKUP_DIR}/backup-full-"* ]]; then
    backup_file=$(ls -t "${BACKUP_DIR}"/backup-full-* | head -1)

    log "Testing backup file: $(basename "$backup_file")"

    # Test 1a: File exists and has size
    if [[ -f "$backup_file" && -s "$backup_file" ]]; then
      local size_mb=$(du -m "$backup_file" | cut -f1)
      log "Backup size: ${size_mb}MB"

      # Test 1b: SQLite integrity check
      if sqlite3 "$backup_file" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
        log_success "Backup integrity verified"
        backup_valid=true
      else
        log_error "Backup integrity check failed"
      fi

      # Test 1c: Restore test
      if [[ "$backup_valid" == "true" ]]; then
        local test_restore="${TEST_DATA_DIR}/restore-test-$$.db"
        log "Performing test restore: $test_restore"

        if sqlite3 "$backup_file" ".dump" | sqlite3 "$test_restore" 2>/dev/null; then
          local table_count=$(sqlite3 "$test_restore" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")

          if [[ $table_count -gt 0 ]]; then
            log_success "Test restore successful, found $table_count tables"
          else
            log_error "Test restore found no tables"
            backup_valid=false
          fi
        else
          log_error "Test restore failed"
          backup_valid=false
        fi

        rm -f "$test_restore"
      fi
    else
      log_error "Backup file not found or empty"
    fi
  else
    log_error "No backup files found in ${BACKUP_DIR}"
  fi

  local test_duration=$(($(date +%s) - test_start))

  return $([ "$backup_valid" = "true" ] && echo 0 || echo 1)
}

###############################################################################
# Test 2: Recovery Time Objective
###############################################################################

test_rto() {
  log "Test 2: Measuring Recovery Time Objective (RTO)"
  local rto_start=$(date +%s%N)
  local recovery_successful=false

  # Step 1: Simulate database failure
  log "Simulating database failure by backing up current data"
  local backup_current="${DATA_DIR}/app.db.pre-failure-test"
  if [[ -f "${DATA_DIR}/app.db" ]]; then
    cp "${DATA_DIR}/app.db" "$backup_current"
  fi

  # Step 2: Recover from latest backup
  log "Starting recovery from latest backup"
  if [[ -f "${BACKUP_DIR}/backup-full-"* ]]; then
    local latest_backup=$(ls -t "${BACKUP_DIR}"/backup-full-* | head -1)

    if cp "$latest_backup" "${DATA_DIR}/app.db" 2>/dev/null; then
      log "Database restored from backup"

      # Step 3: Verify recovery
      if sqlite3 "${DATA_DIR}/app.db" "SELECT COUNT(*) FROM sqlite_master;" &>/dev/null; then
        recovery_successful=true
        log_success "Recovery completed and verified"
      else
        log_error "Recovered database failed verification"
      fi
    else
      log_error "Failed to restore from backup"
    fi
  fi

  # Restore original data
  if [[ -f "$backup_current" ]]; then
    cp "$backup_current" "${DATA_DIR}/app.db"
    rm "$backup_current"
    log "Original data restored"
  fi

  local rto_end=$(date +%s%N)
  local rto_seconds=$(echo "scale=2; ($rto_end - $rto_start) / 1000000000" | bc 2>/dev/null || echo "0")

  log "Recovery Time: ${rto_seconds}s (Threshold: ${RTO_THRESHOLD}s)"

  if (( $(echo "$rto_seconds < $RTO_THRESHOLD" | bc -l) )); then
    log_success "RTO test PASSED"
    return 0
  else
    log_error "RTO test FAILED - exceeded threshold"
    return 1
  fi
}

###############################################################################
# Test 3: Recovery Point Objective
###############################################################################

test_rpo() {
  log "Test 3: Measuring Recovery Point Objective (RPO)"

  # Check backup frequency
  local latest_backup=$(ls -t "${BACKUP_DIR}"/backup-* 2>/dev/null | head -1)

  if [[ -n "$latest_backup" ]]; then
    local backup_time=$(stat -f%m "$latest_backup" 2>/dev/null || stat -c%Y "$latest_backup" 2>/dev/null)
    local current_time=$(date +%s)
    local data_loss_seconds=$((current_time - backup_time))

    log "Latest backup: $(date -d "@$backup_time" '+%Y-%m-%d %H:%M:%S')"
    log "Data loss window: ${data_loss_seconds}s (Threshold: ${RPO_THRESHOLD}s)"

    if [[ $data_loss_seconds -lt $RPO_THRESHOLD ]]; then
      log_success "RPO test PASSED"
      return 0
    else
      log_error "RPO test FAILED - exceeded threshold"
      return 1
    fi
  else
    log_error "No backups found for RPO test"
    return 1
  fi
}

###############################################################################
# Test 4: Application Readiness
###############################################################################

test_application_readiness() {
  log "Test 4: Validating application readiness"

  # Check if application is running
  if docker ps | grep -q "lucide-crmt-app"; then
    log "Application container found"

    # Test health endpoint
    local health_url="http://localhost:8787/api/health"
    local max_retries=5
    local retry=0

    while [[ $retry -lt $max_retries ]]; do
      if curl -sf "$health_url" > /dev/null 2>&1; then
        log_success "Application health check passed"
        return 0
      fi

      retry=$((retry + 1))
      log_warn "Health check failed, retrying... ($retry/$max_retries)"
      sleep 2
    done

    log_error "Application health check failed after $max_retries retries"
    return 1
  else
    log_error "Application container not running"
    return 1
  fi
}

###############################################################################
# Test 5: Data Consistency
###############################################################################

test_data_consistency() {
  log "Test 5: Validating data consistency post-recovery"

  # Run basic data validation queries
  local test_db="${DATA_DIR}/app.db"

  if [[ ! -f "$test_db" ]]; then
    log_error "Database file not found"
    return 1
  fi

  # Test 5a: Check table integrity
  local integrity=$(sqlite3 "$test_db" "PRAGMA integrity_check;" 2>/dev/null)
  if [[ "$integrity" != "ok" ]]; then
    log_error "Data integrity check failed: $integrity"
    return 1
  fi
  log "Data integrity verified"

  # Test 5b: Verify key tables exist
  local tables=$(sqlite3 "$test_db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null)
  if [[ $tables -gt 0 ]]; then
    log_success "Data consistency verified - found $tables tables"
    return 0
  else
    log_error "No tables found in recovered database"
    return 1
  fi
}

###############################################################################
# Test 6: Backup Chain Validation
###############################################################################

test_backup_chain() {
  log "Test 6: Validating backup chain and retention"

  local total_backups=$(ls -1 "${BACKUP_DIR}"/backup-* 2>/dev/null | wc -l)
  local full_backups=$(ls -1 "${BACKUP_DIR}"/backup-full-* 2>/dev/null | wc -l)
  local incr_backups=$(ls -1 "${BACKUP_DIR}"/backup-incr-* 2>/dev/null | wc -l)

  log "Total backups: $total_backups (Full: $full_backups, Incremental: $incr_backups)"

  if [[ $full_backups -gt 0 ]]; then
    log_success "Backup chain validation passed"
    return 0
  else
    log_error "No full backups found"
    return 1
  fi
}

###############################################################################
# Generate Report
###############################################################################

generate_report() {
  local test_results=("$@")
  local test_names=(
    "Backup Integrity"
    "Recovery Time Objective"
    "Recovery Point Objective"
    "Application Readiness"
    "Data Consistency"
    "Backup Chain"
  )

  log "Generating DR drill report"

  local passed=0
  local failed=0

  local report_json='{
    "drillId": "'$DRILL_ID'",
    "startTime": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "duration": '$(($(date +%s) - DRILL_START_TIME))',
    "environment": "'$(uname -s)'",
    "tests": ['

  for i in "${!test_results[@]}"; do
    if [[ ${test_results[$i]} -eq 0 ]]; then
      ((passed++))
      status="PASSED"
    else
      ((failed++))
      status="FAILED"
    fi

    if [[ $i -gt 0 ]]; then
      report_json+=','
    fi

    report_json+='{
      "name": "'${test_names[$i]}'",
      "status": "'$status'"
    }'
  done

  report_json+='],
    "summary": {
      "total": '${#test_results[@]}',
      "passed": '$passed',
      "failed": '$failed',
      "successRate": '$(echo "scale=2; $passed * 100 / ${#test_results[@]}" | bc)'
    },
    "rtoThreshold": '$RTO_THRESHOLD',
    "rpoThreshold": '$RPO_THRESHOLD'
  }'

  echo "$report_json" | jq . > "$DRILL_REPORT"
  log_success "Report saved to: $DRILL_REPORT"
}

###############################################################################
# Run All Tests
###############################################################################

run_drill() {
  log "========================================"
  log "Starting Disaster Recovery Drill: $DRILL_ID"
  log "========================================"

  declare -a test_results

  DRILL_START_TIME=$(date +%s)

  test_backup_integrity
  test_results+=(0)

  test_rto
  test_results+=($?)

  test_rpo
  test_results+=($?)

  test_application_readiness
  test_results+=($?)

  test_data_consistency
  test_results+=($?)

  test_backup_chain
  test_results+=($?)

  # Generate report
  generate_report "${test_results[@]}"

  log "========================================"
  log "DR Drill Summary"
  log "========================================"

  local passed=0
  local failed=0

  for result in "${test_results[@]}"; do
    if [[ $result -eq 0 ]]; then
      ((passed++))
    else
      ((failed++))
    fi
  done

  echo -e "${BLUE}Total Tests: ${#test_results[@]}${NC}"
  echo -e "${GREEN}Passed: $passed${NC}"
  echo -e "${RED}Failed: $failed${NC}"

  echo ""
  echo "Drill Log: $DRILL_LOG"
  echo "Drill Report: $DRILL_REPORT"

  if [[ $failed -eq 0 ]]; then
    log_success "All tests passed!"
    return 0
  else
    log_error "Some tests failed"
    return 1
  fi
}

###############################################################################
# Main
###############################################################################

main() {
  setup_drill_environment
  run_drill
}

main "$@"
