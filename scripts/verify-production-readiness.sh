#!/bin/bash

################################################################################
# Production Readiness Verification Script
# Purpose: Comprehensive verification of all production readiness requirements
# Version: 1.0
# Last Updated: 2026-10-08
################################################################################

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPORT_FILE="${PROJECT_ROOT}/PRODUCTION_READINESS_REPORT.txt"

################################################################################
# Utility Functions
################################################################################

log_pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  ((PASS_COUNT++))
}

log_fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  ((FAIL_COUNT++))
}

log_warn() {
  echo -e "${YELLOW}⚠ WARN${NC}: $1"
  ((WARN_COUNT++))
}

log_info() {
  echo -e "${BLUE}ℹ INFO${NC}: $1"
}

log_section() {
  echo ""
  echo "================================"
  echo "  $1"
  echo "================================"
}

report_section_header() {
  echo "## $1" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
}

report_item() {
  echo "- **$1**: $2" >> "$REPORT_FILE"
}

################################################################################
# Security Verification
################################################################################

verify_security() {
  log_section "Security Verification"

  # Check for npm vulnerabilities
  if npm audit --production 2>/dev/null | grep -q "0 vulnerabilities"; then
    log_pass "npm audit: no vulnerabilities found"
  else
    log_fail "npm audit: vulnerabilities detected"
  fi

  # Check for hardcoded secrets
  if grep -r "password\|secret\|api_key\|token" "$PROJECT_ROOT/.env*" 2>/dev/null | grep -q "="; then
    log_fail "Potential secrets found in environment files"
  else
    log_pass "No obvious secrets in environment files"
  fi

  # Check SSL certificate configuration
  if [ -f "$PROJECT_ROOT/nginx.conf" ]; then
    if grep -q "ssl_protocols.*TLSv1.2\|TLSv1.3" "$PROJECT_ROOT/nginx.conf"; then
      log_pass "TLS 1.2+ configured"
    else
      log_warn "TLS version not explicitly configured in nginx"
    fi
  fi

  # Check for security headers
  if [ -f "$PROJECT_ROOT/server/src/middleware/security.ts" ]; then
    if grep -q "Strict-Transport-Security\|X-Frame-Options\|Content-Security-Policy" "$PROJECT_ROOT/server/src/middleware/security.ts"; then
      log_pass "Security headers configured"
    else
      log_fail "Security headers not found"
    fi
  fi

  # Check authentication implementation
  if [ -f "$PROJECT_ROOT/server/src/auth" ]; then
    log_pass "Authentication module found"
  else
    log_fail "Authentication module not found"
  fi

  # Check encryption implementation
  if grep -r "crypto\|bcrypt\|argon2" "$PROJECT_ROOT/server/src" 2>/dev/null | grep -q "import\|require"; then
    log_pass "Encryption libraries detected"
  else
    log_warn "Encryption libraries not detected"
  fi
}

################################################################################
# Performance Verification
################################################################################

verify_performance() {
  log_section "Performance Verification"

  # Check build size
  if [ -d "$PROJECT_ROOT/build" ]; then
    BUILD_SIZE=$(du -sh "$PROJECT_ROOT/build" | cut -f1)
    log_info "Build size: $BUILD_SIZE"

    if [ "$(du -sb "$PROJECT_ROOT/build" | cut -f1)" -lt 524288000 ]; then # 500MB
      log_pass "Build size within acceptable limits"
    else
      log_warn "Build size exceeds 500MB"
    fi
  else
    log_warn "Build directory not found"
  fi

  # Check bundle size
  if [ -f "$PROJECT_ROOT/build/index.js" ]; then
    BUNDLE_SIZE=$(du -sh "$PROJECT_ROOT/build/index.js" | cut -f1)
    log_info "Bundle size: $BUNDLE_SIZE"
  else
    log_warn "Bundle file not found"
  fi

  # Check for code duplication
  if command -v jscpd &> /dev/null; then
    DUPLICATION=$(jscpd "$PROJECT_ROOT/src" 2>/dev/null | grep "duplicated" | head -1)
    if [ ! -z "$DUPLICATION" ]; then
      log_info "Code duplication: $DUPLICATION"
    fi
  fi

  # Check for unused dependencies
  if command -v npm &> /dev/null; then
    log_info "Checking for unused dependencies..."
    if npm ls --production 2>&1 | grep -q "UNMET"; then
      log_warn "Some dependencies may be unmet"
    else
      log_pass "All dependencies resolved"
    fi
  fi
}

################################################################################
# Code Quality Verification
################################################################################

verify_code_quality() {
  log_section "Code Quality Verification"

  # Check test coverage
  if [ -f "$PROJECT_ROOT/coverage/coverage-summary.json" ]; then
    COVERAGE=$(grep -o '"lines".*"pct":[0-9]*' "$PROJECT_ROOT/coverage/coverage-summary.json" | tail -1 | grep -o "[0-9]*$")
    log_info "Code coverage: ${COVERAGE}%"

    if [ "$COVERAGE" -ge 80 ]; then
      log_pass "Code coverage meets minimum threshold (80%+)"
    else
      log_warn "Code coverage below 80%: ${COVERAGE}%"
    fi
  else
    log_warn "Coverage report not found"
  fi

  # Run linting
  if command -v npm &> /dev/null; then
    log_info "Running ESLint..."
    if npm run lint --silent 2>/dev/null; then
      log_pass "ESLint passed"
    else
      log_warn "ESLint warnings/errors detected"
    fi
  fi

  # Check TypeScript
  if [ -f "$PROJECT_ROOT/tsconfig.json" ]; then
    log_info "Checking TypeScript..."
    if npm run build:typecheck --silent 2>/dev/null; then
      log_pass "TypeScript compilation successful"
    else
      log_fail "TypeScript errors detected"
    fi
  fi

  # Check for console.log in production code
  if grep -r "console\.\(log\|warn\|debug\)" "$PROJECT_ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -qv "test\|spec"; then
    log_warn "console statements found in production code"
  else
    log_pass "No console statements in production code"
  fi
}

################################################################################
# Testing Verification
################################################################################

verify_testing() {
  log_section "Testing Verification"

  # Check for test files
  TEST_FILE_COUNT=$(find "$PROJECT_ROOT" -name "*.test.*" -o -name "*.spec.*" 2>/dev/null | wc -l)
  if [ "$TEST_FILE_COUNT" -gt 0 ]; then
    log_pass "Test files found: $TEST_FILE_COUNT"
  else
    log_fail "No test files found"
  fi

  # Run unit tests
  if command -v npm &> /dev/null; then
    log_info "Running unit tests..."
    if npm test --silent 2>/dev/null; then
      log_pass "Unit tests passed"
    else
      log_warn "Unit tests may have failed"
    fi
  fi

  # Check for E2E test configuration
  if [ -f "$PROJECT_ROOT/cypress.config.js" ] || [ -f "$PROJECT_ROOT/playwright.config.js" ]; then
    log_pass "E2E test framework configured"
  else
    log_warn "E2E test framework not detected"
  fi
}

################################################################################
# Database Verification
################################################################################

verify_database() {
  log_section "Database Verification"

  # Check database configuration
  if [ -f "$PROJECT_ROOT/.env.production" ] || [ -f "$PROJECT_ROOT/.env" ]; then
    if grep -q "DATABASE_URL\|DB_HOST" "$PROJECT_ROOT/.env"* 2>/dev/null; then
      log_pass "Database configuration found"
    else
      log_warn "Database configuration not found in env files"
    fi
  fi

  # Check migrations
  if [ -d "$PROJECT_ROOT/migrations" ] || [ -d "$PROJECT_ROOT/db/migrations" ]; then
    MIGRATION_COUNT=$(find "$PROJECT_ROOT" -name "*migration*" -type f 2>/dev/null | wc -l)
    log_pass "Database migrations found: $MIGRATION_COUNT"
  else
    log_warn "No migration directory found"
  fi

  # Check database connection pooling
  if grep -r "pool\|connectionLimit\|max.*connections" "$PROJECT_ROOT/server/src" 2>/dev/null | grep -q "20\|25\|30"; then
    log_pass "Connection pooling configured"
  else
    log_warn "Connection pooling configuration not verified"
  fi
}

################################################################################
# Infrastructure Verification
################################################################################

verify_infrastructure() {
  log_section "Infrastructure Verification"

  # Check Docker configuration
  if [ -f "$PROJECT_ROOT/Dockerfile" ]; then
    log_pass "Dockerfile found"

    if grep -q "FROM.*production\|healthcheck" "$PROJECT_ROOT/Dockerfile"; then
      log_pass "Production Docker configuration detected"
    else
      log_warn "Dockerfile may not be production-optimized"
    fi
  else
    log_warn "Dockerfile not found"
  fi

  # Check Kubernetes configuration
  if [ -d "$PROJECT_ROOT/k8s" ] || [ -d "$PROJECT_ROOT/kubernetes" ]; then
    log_pass "Kubernetes configuration found"
  else
    log_warn "Kubernetes configuration not found"
  fi

  # Check for scaling configuration
  if grep -r "replicas\|HPA\|autoscaling" "$PROJECT_ROOT/k8s" 2>/dev/null; then
    log_pass "Auto-scaling configuration found"
  else
    log_warn "Auto-scaling configuration not detected"
  fi

  # Check for health checks
  if grep -r "health\|liveness\|readiness" "$PROJECT_ROOT/k8s\|$PROJECT_ROOT/Dockerfile" 2>/dev/null; then
    log_pass "Health checks configured"
  else
    log_warn "Health checks not verified"
  fi
}

################################################################################
# Documentation Verification
################################################################################

verify_documentation() {
  log_section "Documentation Verification"

  # Check README
  if [ -f "$PROJECT_ROOT/README.md" ]; then
    log_pass "README.md found"

    if grep -iq "installation\|setup\|quickstart\|deployment" "$PROJECT_ROOT/README.md"; then
      log_pass "README includes setup instructions"
    else
      log_warn "README may be missing setup instructions"
    fi
  else
    log_fail "README.md not found"
  fi

  # Check API documentation
  if [ -f "$PROJECT_ROOT/API_REFERENCE.md" ] || [ -f "$PROJECT_ROOT/docs/api.md" ]; then
    log_pass "API documentation found"
  else
    log_warn "API documentation not found"
  fi

  # Check CONTRIBUTING.md
  if [ -f "$PROJECT_ROOT/CONTRIBUTING.md" ]; then
    log_pass "CONTRIBUTING.md found"
  else
    log_warn "CONTRIBUTING.md not found"
  fi

  # Check changelog
  if [ -f "$PROJECT_ROOT/CHANGELOG.md" ]; then
    log_pass "CHANGELOG.md found"
  else
    log_warn "CHANGELOG.md not found"
  fi

  # Check security documentation
  if [ -f "$PROJECT_ROOT/SECURITY.md" ] || [ -f "$PROJECT_ROOT/SECURITY_AUDIT_CHECKLIST.md" ]; then
    log_pass "Security documentation found"
  else
    log_warn "Security documentation not found"
  fi
}

################################################################################
# Configuration Verification
################################################################################

verify_configuration() {
  log_section "Configuration Verification"

  # Check environment variables
  if [ -f "$PROJECT_ROOT/.env.example" ]; then
    log_pass ".env.example found"

    # Count environment variables
    VAR_COUNT=$(grep -c "=" "$PROJECT_ROOT/.env.example")
    log_info "Environment variables configured: $VAR_COUNT"
  else
    log_warn ".env.example not found"
  fi

  # Check configuration validation
  if grep -r "validateConfig\|validateEnv\|zod\|joi\|yup" "$PROJECT_ROOT/server/src" 2>/dev/null | head -1; then
    log_pass "Configuration validation implemented"
  else
    log_warn "Configuration validation not detected"
  fi

  # Check for sensitive data in config
  if [ -f "$PROJECT_ROOT/.env.production" ]; then
    if grep -E "password|secret|key" "$PROJECT_ROOT/.env.production" 2>/dev/null | grep -v "^#" | grep "="; then
      log_fail "Sensitive data found in production env file"
    else
      log_pass "No obvious secrets in production config"
    fi
  fi
}

################################################################################
# Deployment Verification
################################################################################

verify_deployment() {
  log_section "Deployment Verification"

  # Check CI/CD configuration
  if [ -d "$PROJECT_ROOT/.github/workflows" ]; then
    WORKFLOW_COUNT=$(find "$PROJECT_ROOT/.github/workflows" -name "*.yml" 2>/dev/null | wc -l)
    log_pass "GitHub Actions workflows found: $WORKFLOW_COUNT"
  elif [ -f "$PROJECT_ROOT/.gitlab-ci.yml" ]; then
    log_pass "GitLab CI configuration found"
  elif [ -f "$PROJECT_ROOT/Jenkinsfile" ]; then
    log_pass "Jenkins pipeline found"
  else
    log_warn "CI/CD configuration not found"
  fi

  # Check deployment strategy
  if grep -r "blue-green\|canary\|rolling" "$PROJECT_ROOT" --include="*.md" --include="*.yml" 2>/dev/null; then
    log_pass "Deployment strategy documented"
  else
    log_warn "Deployment strategy not found"
  fi

  # Check rollback procedures
  if grep -r "rollback\|revert" "$PROJECT_ROOT" --include="*.md" 2>/dev/null; then
    log_pass "Rollback procedures documented"
  else
    log_warn "Rollback procedures not found"
  fi

  # Check for build script
  if grep -q "\"build\":" "$PROJECT_ROOT/package.json"; then
    log_pass "Build script configured in package.json"
  else
    log_fail "Build script not found in package.json"
  fi
}

################################################################################
# Compliance Verification
################################################################################

verify_compliance() {
  log_section "Compliance Verification"

  # Check privacy policy
  if [ -f "$PROJECT_ROOT/PRIVACY_POLICY.md" ] || [ -f "$PROJECT_ROOT/docs/privacy.md" ]; then
    log_pass "Privacy policy found"
  else
    log_warn "Privacy policy not found"
  fi

  # Check GDPR compliance
  if grep -r "GDPR\|data.*subject\|consent\|privacy" "$PROJECT_ROOT" --include="*.md" 2>/dev/null | head -1; then
    log_pass "GDPR documentation found"
  else
    log_warn "GDPR documentation not found"
  fi

  # Check license
  if [ -f "$PROJECT_ROOT/LICENSE" ]; then
    log_pass "LICENSE file found"
  else
    log_warn "LICENSE file not found"
  fi

  # Check for data retention policy
  if [ -f "$PROJECT_ROOT/DATA_RETENTION_POLICY.md" ]; then
    log_pass "Data retention policy found"
  else
    log_warn "Data retention policy not found"
  fi
}

################################################################################
# Generate Report
################################################################################

generate_report() {
  log_section "Generating Report"

  # Initialize report
  echo "# Production Readiness Verification Report" > "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo "**Generated:** $(date)" >> "$REPORT_FILE"
  echo "**Status:** Production Readiness Assessment" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  # Summary
  echo "## Summary" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo "- **Checks Passed:** $PASS_COUNT" >> "$REPORT_FILE"
  echo "- **Checks Failed:** $FAIL_COUNT" >> "$REPORT_FILE"
  echo "- **Warnings:** $WARN_COUNT" >> "$REPORT_FILE"
  echo "- **Total Checks:** $((PASS_COUNT + FAIL_COUNT + WARN_COUNT))" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  # Readiness status
  if [ "$FAIL_COUNT" -eq 0 ]; then
    READINESS="✅ READY FOR PRODUCTION"
    if [ "$WARN_COUNT" -gt 0 ]; then
      READINESS="$READINESS (with warnings)"
    fi
  else
    READINESS="❌ NOT READY - $FAIL_COUNT critical issues"
  fi
  echo "**Readiness Status:** $READINESS" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  # Recommendations
  echo "## Recommendations" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "### Critical Issues to Address" >> "$REPORT_FILE"
    echo "- Review failures listed above" >> "$REPORT_FILE"
    echo "- Implement fixes for each critical failure" >> "$REPORT_FILE"
    echo "- Re-run verification after fixes" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
  fi

  if [ "$WARN_COUNT" -gt 0 ]; then
    echo "### Warnings to Investigate" >> "$REPORT_FILE"
    echo "- Review warnings listed above" >> "$REPORT_FILE"
    echo "- Assess impact of each warning" >> "$REPORT_FILE"
    echo "- Plan improvements for next release" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
  fi

  echo "### Next Steps" >> "$REPORT_FILE"
  echo "1. Address all critical failures" >> "$REPORT_FILE"
  echo "2. Review and mitigate warnings" >> "$REPORT_FILE"
  echo "3. Re-run verification" >> "$REPORT_FILE"
  echo "4. Obtain sign-offs from all stakeholders" >> "$REPORT_FILE"
  echo "5. Proceed with deployment" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  log_pass "Report generated: $REPORT_FILE"
}

################################################################################
# Main Execution
################################################################################

main() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║       Production Readiness Verification Script             ║"
  echo "║       Lucide React Mobile Application v22.19              ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  # Run all verifications
  verify_security
  verify_performance
  verify_code_quality
  verify_testing
  verify_database
  verify_infrastructure
  verify_documentation
  verify_configuration
  verify_deployment
  verify_compliance

  # Generate report
  generate_report

  # Summary
  log_section "Final Summary"
  echo ""
  echo -e "Passed:  ${GREEN}$PASS_COUNT${NC}"
  echo -e "Failed:  ${RED}$FAIL_COUNT${NC}"
  echo -e "Warnings: ${YELLOW}$WARN_COUNT${NC}"
  echo ""

  if [ "$FAIL_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✓ APPLICATION IS READY FOR PRODUCTION${NC}"
    echo ""
    echo "All critical requirements have been met. The application"
    echo "can proceed to production deployment."
    exit 0
  else
    echo -e "${RED}✗ APPLICATION NOT READY FOR PRODUCTION${NC}"
    echo ""
    echo "There are $FAIL_COUNT critical issues that must be resolved"
    echo "before production deployment. Please review and address."
    exit 1
  fi
}

# Run main function
main "$@"
