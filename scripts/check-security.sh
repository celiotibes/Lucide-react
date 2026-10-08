#!/bin/bash

################################################################################
# Security Audit & Verification Script
# Purpose: Comprehensive security checks and OWASP Top 10 validation
# Version: 1.0
################################################################################

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

log_pass() { echo -e "${GREEN}✓${NC} $1"; ((PASS_COUNT++)); }
log_fail() { echo -e "${RED}✗${NC} $1"; ((FAIL_COUNT++)); }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; ((WARN_COUNT++)); }
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }

################################################################################
# OWASP Top 10 Security Checks
################################################################################

check_injection_prevention() {
  echo ""
  echo "=== A1: Injection Prevention ==="

  # Check for parameterized queries
  if grep -r "SELECT.*WHERE.*\$\|executeQuery\|parameterized" "$PROJECT_ROOT/server/src" 2>/dev/null; then
    log_pass "Parameterized queries detected"
  else
    log_warn "Parameterized queries not verified"
  fi

  # Check for SQL injection test coverage
  if grep -r "injection\|sql.*inject" "$PROJECT_ROOT" --include="*.test.*" --include="*.spec.*" 2>/dev/null; then
    log_pass "SQL injection tests found"
  else
    log_warn "SQL injection tests not found"
  fi

  # Check for eval usage
  if grep -r "\beval\b\|new Function\|setTimeout.*string\|setInterval.*string" "$PROJECT_ROOT/src" --include="*.ts" --include="*.js" 2>/dev/null; then
    log_fail "Dangerous eval() found in code"
  else
    log_pass "No eval() usage detected"
  fi
}

check_authentication() {
  echo ""
  echo "=== A2: Broken Authentication ==="

  # Check for password hashing
  if grep -r "bcrypt\|argon2\|scrypt" "$PROJECT_ROOT/server/src" 2>/dev/null; then
    log_pass "Password hashing library detected"
  else
    log_fail "Password hashing not implemented"
  fi

  # Check for hardcoded credentials
  if grep -r "password.*=.*['\"].*['\"\|username.*=.*['\"].*['\"" "$PROJECT_ROOT/src" 2>/dev/null | grep -v test | grep -v example; then
    log_fail "Hardcoded credentials found"
  else
    log_pass "No hardcoded credentials detected"
  fi

  # Check for session management
  if grep -r "session\|JWT\|token" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null | head -3; then
    log_pass "Session/JWT management detected"
  else
    log_fail "Session management not found"
  fi

  # Check for MFA support
  if grep -r "MFA\|2FA\|TOTP\|mfa\|two.*factor" "$PROJECT_ROOT" --include="*.ts" --include="*.tsx" 2>/dev/null; then
    log_pass "MFA implementation detected"
  else
    log_warn "MFA not implemented"
  fi
}

check_sensitive_data_exposure() {
  echo ""
  echo "=== A3: Sensitive Data Exposure ==="

  # Check for HTTPS enforcement
  if grep -r "https\|http.*redirect\|requireHttps" "$PROJECT_ROOT" --include="*.ts" --include="*.conf" 2>/dev/null; then
    log_pass "HTTPS enforcement detected"
  else
    log_warn "HTTPS enforcement not verified"
  fi

  # Check for encryption at rest
  if grep -r "encrypt\|crypto\|cipher" "$PROJECT_ROOT/server/src" 2>/dev/null; then
    log_pass "Encryption implementation detected"
  else
    log_warn "Encryption not verified"
  fi

  # Check for PII protection
  if grep -r "mask\|redact\|hash.*password\|hash.*email" "$PROJECT_ROOT/server/src" 2>/dev/null; then
    log_pass "PII protection measures detected"
  else
    log_warn "PII protection not verified"
  fi

  # Check for debug mode in production
  if grep -r "DEBUG=true\|debug.*=.*true" "$PROJECT_ROOT/.env.production" 2>/dev/null; then
    log_fail "Debug mode enabled in production"
  else
    log_pass "Debug mode not enabled in production"
  fi

  # Check for secret logging
  if grep -r "console\.log.*password\|logger.*secret\|log.*api.*key" "$PROJECT_ROOT/src" --include="*.ts" 2>/dev/null; then
    log_fail "Secrets may be logged"
  else
    log_pass "No obvious secret logging detected"
  fi
}

check_xxe_prevention() {
  echo ""
  echo "=== A4: XML External Entities (XXE) ==="

  # Check for XML processing
  if grep -r "xml\|parseXml" "$PROJECT_ROOT/src" --include="*.ts" 2>/dev/null; then
    if grep -r "XXE\|dtdProcessing.*false\|externalEntities.*false" "$PROJECT_ROOT/src" 2>/dev/null; then
      log_pass "XXE prevention configured"
    else
      log_warn "XXE prevention not verified"
    fi
  else
    log_pass "No XML processing detected"
  fi
}

check_access_control() {
  echo ""
  echo "=== A5: Broken Access Control ==="

  # Check for authorization middleware
  if grep -r "authorize\|permission\|checkAuth\|requireAuth" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "Authorization middleware detected"
  else
    log_fail "Authorization middleware not found"
  fi

  # Check for role-based access control
  if grep -r "RBAC\|roles\|permissions" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "RBAC implementation detected"
  else
    log_warn "RBAC not verified"
  fi

  # Check for access control tests
  if grep -r "access.*control\|authorization" "$PROJECT_ROOT" --include="*.test.*" --include="*.spec.*" 2>/dev/null; then
    log_pass "Access control tests found"
  else
    log_warn "Access control tests not found"
  fi
}

check_misconfiguration() {
  echo ""
  echo "=== A6: Security Misconfiguration ==="

  # Check for security headers
  if grep -r "Strict-Transport-Security\|X-Frame-Options\|X-Content-Type-Options" "$PROJECT_ROOT" --include="*.ts" --include="*.conf" 2>/dev/null; then
    log_pass "Security headers configured"
  else
    log_fail "Security headers not found"
  fi

  # Check for CORS configuration
  if grep -r "CORS\|cors\|Access-Control" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "CORS handling detected"
  else
    log_warn "CORS configuration not verified"
  fi

  # Check for default credentials removal
  if grep -r "default.*password\|admin.*123\|password.*password" "$PROJECT_ROOT" --include="*.ts" --include="*.sql" 2>/dev/null | grep -v test | grep -v example; then
    log_warn "Potential default credentials found"
  else
    log_pass "No obvious default credentials"
  fi

  # Check for dependency updates
  if [ -f "$PROJECT_ROOT/package.json" ]; then
    if grep -q "\"engines\":" "$PROJECT_ROOT/package.json"; then
      log_pass "Node.js version specified"
    else
      log_warn "Node.js version not specified"
    fi
  fi
}

check_xss_prevention() {
  echo ""
  echo "=== A7: Cross-Site Scripting (XSS) ==="

  # Check for output encoding
  if grep -r "escape\|encode\|sanitize" "$PROJECT_ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null; then
    log_pass "Output encoding detected"
  else
    log_warn "Output encoding not verified"
  fi

  # Check for CSP header
  if grep -r "Content-Security-Policy" "$PROJECT_ROOT" --include="*.ts" --include="*.conf" 2>/dev/null; then
    log_pass "Content Security Policy configured"
  else
    log_warn "CSP not configured"
  fi

  # Check for dangerouslySetInnerHTML usage
  if grep -r "dangerouslySetInnerHTML" "$PROJECT_ROOT/src" --include="*.tsx" 2>/dev/null; then
    log_warn "dangerouslySetInnerHTML used - verify it's safe"
  else
    log_pass "No dangerouslySetInnerHTML usage"
  fi

  # Check for React XSS tests
  if grep -r "XSS\|xss" "$PROJECT_ROOT" --include="*.test.*" --include="*.spec.*" 2>/dev/null; then
    log_pass "XSS tests found"
  else
    log_warn "XSS tests not found"
  fi
}

check_deserialization() {
  echo ""
  echo "=== A8: Insecure Deserialization ==="

  # Check for safe serialization
  if grep -r "JSON\.parse\|JSON\.stringify" "$PROJECT_ROOT/src" --include="*.ts" 2>/dev/null; then
    log_pass "JSON serialization used (safe)"
  else
    log_warn "Serialization method not verified"
  fi

  # Check for dangerous deserialization
  if grep -r "pickle\|yaml.*load\|eval\|new Function" "$PROJECT_ROOT/src" --include="*.ts" 2>/dev/null; then
    log_warn "Potentially unsafe deserialization found"
  else
    log_pass "No unsafe deserialization detected"
  fi
}

check_vulnerable_components() {
  echo ""
  echo "=== A9: Using Components with Known Vulnerabilities ==="

  # Run npm audit
  if command -v npm &> /dev/null; then
    log_info "Running npm audit..."
    if npm audit --production 2>/dev/null | grep -q "0 vulnerabilities"; then
      log_pass "npm audit: no vulnerabilities found"
    else
      VULN_COUNT=$(npm audit --production 2>/dev/null | grep -oE "[0-9]+ vulnerabilities" | grep -oE "[0-9]+")
      log_fail "npm audit: $VULN_COUNT vulnerabilities found"
    fi
  fi

  # Check for outdated dependencies
  if npm outdated --production 2>/dev/null | grep -q "npm notice"; then
    log_info "Some dependencies may be outdated"
  else
    log_pass "Dependencies appear current"
  fi
}

check_logging_monitoring() {
  echo ""
  echo "=== A10: Insufficient Logging & Monitoring ==="

  # Check for logging implementation
  if grep -r "logger\|winston\|pino\|bunyan" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "Logging framework detected"
  else
    log_fail "Logging framework not found"
  fi

  # Check for security event logging
  if grep -r "login\|logout\|failed.*auth\|permission.*denied" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "Security event logging detected"
  else
    log_warn "Security event logging not verified"
  fi

  # Check for monitoring/alerting
  if grep -r "monitoring\|datadog\|new.*relic\|sentry\|prometheus" "$PROJECT_ROOT" --include="*.ts" 2>/dev/null; then
    log_pass "Monitoring implementation detected"
  else
    log_warn "Monitoring not verified"
  fi

  # Check for alert configuration
  if grep -r "alert\|threshold\|anomaly" "$PROJECT_ROOT" --include="*.ts" --include="*.yml" --include="*.yaml" 2>/dev/null; then
    log_pass "Alert configuration detected"
  else
    log_warn "Alert configuration not verified"
  fi
}

################################################################################
# Additional Security Checks
################################################################################

check_dependencies() {
  echo ""
  echo "=== Dependency Security ==="

  # Check lock file presence
  if [ -f "$PROJECT_ROOT/package-lock.json" ] || [ -f "$PROJECT_ROOT/yarn.lock" ]; then
    log_pass "Dependency lock file found"
  else
    log_fail "Dependency lock file not found"
  fi

  # Check for GPL licenses
  if npm ls 2>/dev/null | grep -i "gpl"; then
    log_warn "GPL-licensed dependency found"
  else
    log_pass "No GPL-licensed dependencies"
  fi

  # Check for outdated packages
  if command -v npm &> /dev/null; then
    OUTDATED=$(npm outdated --production 2>/dev/null | grep -c "current\|wanted" || echo 0)
    if [ "$OUTDATED" -gt 0 ]; then
      log_warn "Outdated packages detected: $OUTDATED"
    else
      log_pass "All dependencies current"
    fi
  fi
}

check_code_analysis() {
  echo ""
  echo "=== Static Code Analysis ==="

  # Check for security linting rules
  if [ -f "$PROJECT_ROOT/.eslintrc.json" ] || [ -f "$PROJECT_ROOT/.eslintrc.js" ]; then
    if grep -q "security" "$PROJECT_ROOT/.eslintrc"* 2>/dev/null; then
      log_pass "Security linting rules configured"
    else
      log_warn "Security linting rules not verified"
    fi
  fi

  # Run ESLint if available
  if command -v npx &> /dev/null; then
    log_info "Running ESLint..."
    if npx eslint src/ --quiet 2>/dev/null; then
      log_pass "ESLint passed"
    else
      log_warn "ESLint warnings/errors detected"
    fi
  fi
}

check_encryption() {
  echo ""
  echo "=== Encryption Implementation ==="

  # Check for crypto module usage
  if grep -r "crypto\|encrypt\|decrypt" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "Encryption/crypto module detected"
  else
    log_warn "Encryption implementation not verified"
  fi

  # Check for weak algorithms
  if grep -r "md5\|sha1" "$PROJECT_ROOT/src" --include="*.ts" 2>/dev/null; then
    log_fail "Weak encryption algorithms detected"
  else
    log_pass "No weak encryption algorithms"
  fi

  # Check for key management
  if grep -r "vault\|kms\|key.*manager" "$PROJECT_ROOT" --include="*.ts" --include="*.md" 2>/dev/null; then
    log_pass "Key management system detected"
  else
    log_warn "Key management not verified"
  fi
}

################################################################################
# Generate Security Report
################################################################################

generate_security_report() {
  echo ""
  echo "=== Generating Security Report ==="

  REPORT_FILE="$PROJECT_ROOT/SECURITY_AUDIT_REPORT.txt"

  cat > "$REPORT_FILE" << EOF
# Security Audit Report
Generated: $(date)
Project: Lucide React v22.19

## Summary
- Checks Passed: $PASS_COUNT
- Checks Failed: $FAIL_COUNT
- Warnings: $WARN_COUNT

## OWASP Top 10 Status

1. Injection: CHECK
2. Broken Authentication: CHECK
3. Sensitive Data Exposure: CHECK
4. XML External Entities: CHECK
5. Broken Access Control: CHECK
6. Security Misconfiguration: CHECK
7. Cross-Site Scripting: CHECK
8. Insecure Deserialization: CHECK
9. Vulnerable Components: CHECK
10. Insufficient Logging: CHECK

## Recommendations

EOF

  if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "### Critical Issues" >> "$REPORT_FILE"
    echo "Address the $FAIL_COUNT critical failures before production." >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
  fi

  if [ "$WARN_COUNT" -gt 0 ]; then
    echo "### Warnings to Address" >> "$REPORT_FILE"
    echo "Review and mitigate $WARN_COUNT warnings." >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
  fi

  echo "Security audit report saved to: $REPORT_FILE"
}

################################################################################
# Main Execution
################################################################################

main() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║            Security Audit & Verification                   ║"
  echo "║       OWASP Top 10 Compliance Check                       ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  check_injection_prevention
  check_authentication
  check_sensitive_data_exposure
  check_xxe_prevention
  check_access_control
  check_misconfiguration
  check_xss_prevention
  check_deserialization
  check_vulnerable_components
  check_logging_monitoring
  check_dependencies
  check_code_analysis
  check_encryption

  generate_security_report

  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "Security Audit Complete"
  echo "════════════════════════════════════════════════════════════"
  echo ""
  echo -e "Passed:  ${GREEN}$PASS_COUNT${NC}"
  echo -e "Failed:  ${RED}$FAIL_COUNT${NC}"
  echo -e "Warnings: ${YELLOW}$WARN_COUNT${NC}"
  echo ""

  if [ "$FAIL_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✓ Security audit PASSED${NC}"
    exit 0
  else
    echo -e "${RED}✗ Security audit FAILED - $FAIL_COUNT issues${NC}"
    exit 1
  fi
}

main "$@"
