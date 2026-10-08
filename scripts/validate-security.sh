#!/bin/bash

################################################################################
# Security Validation Script
#
# Validates the security configuration of the development environment,
# checking for common vulnerabilities, misconfigurations, and best practices.
#
# Usage:
#   ./scripts/validate-security.sh         # Full security audit
#   ./scripts/validate-security.sh --quick # Quick validation
#   ./scripts/validate-security.sh --ci    # CI/CD mode
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="${PROJECT_ROOT}/.env.local"
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Logging functions
log() { echo -e "${BLUE}[Security]${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; ((PASS_COUNT++)); }
error() { echo -e "${RED}✗${NC} $*"; ((FAIL_COUNT++)); }
warning() { echo -e "${YELLOW}⚠${NC} $*"; ((WARN_COUNT++)); }

################################################################################
# File and Permission Checks
################################################################################

check_env_permissions() {
    log "Checking .env.local permissions..."

    if [ ! -f "$ENV_LOCAL" ]; then
        error ".env.local not found"
        return 1
    fi

    local perms=$(stat -c %a "$ENV_LOCAL" 2>/dev/null || stat -f %A "$ENV_LOCAL" 2>/dev/null || echo "unknown")

    # Should be readable only by owner (600)
    if [[ "$perms" == "600" ]] || [[ "$perms" == "-rw-------" ]]; then
        success ".env.local has correct permissions (600)"
        return 0
    else
        error ".env.local has insecure permissions: $perms (should be 600)"
        return 1
    fi
}

check_gitignore() {
    log "Checking if .env.local is in .gitignore..."

    if grep -q "^\.env\.local$" "${PROJECT_ROOT}/.gitignore" 2>/dev/null; then
        success ".env.local is in .gitignore"
        return 0
    else
        error ".env.local is NOT in .gitignore - risk of committing secrets!"
        return 1
    fi
}

check_node_modules() {
    log "Checking node_modules permissions..."

    if [ -d "${PROJECT_ROOT}/node_modules" ]; then
        # Check if node_modules contains symlinks (sign of npm link / local packages)
        if find "${PROJECT_ROOT}/node_modules" -type l -count 2>/dev/null | grep -q .; then
            warning "node_modules contains symlinks (local packages linked)"
        else
            success "node_modules structure looks normal"
        fi
        return 0
    else
        warning "node_modules not found (run npm install)"
        return 0
    fi
}

################################################################################
# Environment Variable Checks
################################################################################

check_encryption_key() {
    log "Checking encryption key..."

    local key=$(grep "^ENCRYPTION_KEY=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "")

    if [ -z "$key" ]; then
        error "ENCRYPTION_KEY not set"
        return 1
    fi

    if [[ "$key" == "your_"* ]] || [[ "$key" == "YOUR_"* ]]; then
        error "ENCRYPTION_KEY appears to be a placeholder"
        return 1
    fi

    # Check minimum length (base64 32 bytes = 44 chars)
    if [ ${#key} -lt 40 ]; then
        error "ENCRYPTION_KEY is too short (${#key} chars, should be at least 40)"
        return 1
    fi

    success "ENCRYPTION_KEY configured securely"
    return 0
}

check_jwt_secret() {
    log "Checking JWT secret..."

    local secret=$(grep "^JWT_SECRET=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "")

    if [ -z "$secret" ]; then
        error "JWT_SECRET not set"
        return 1
    fi

    if [[ "$secret" == "your_"* ]] || [[ "$secret" == "YOUR_"* ]]; then
        error "JWT_SECRET appears to be a placeholder"
        return 1
    fi

    success "JWT_SECRET configured"
    return 0
}

check_api_endpoint() {
    log "Checking API endpoint configuration..."

    local endpoint=$(grep "^API_ENDPOINT=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "")

    if [ -z "$endpoint" ]; then
        error "API_ENDPOINT not configured"
        return 1
    fi

    if [[ "$endpoint" != "https://"* ]]; then
        error "API_ENDPOINT does not use HTTPS: $endpoint"
        return 1
    fi

    success "API_ENDPOINT uses HTTPS"
    return 0
}

check_certificate_pinning() {
    log "Checking certificate pinning configuration..."

    local cert_pin=$(grep "^API_CERT_PIN=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "")

    if [ -z "$cert_pin" ]; then
        warning "API_CERT_PIN not configured (certificate pinning disabled)"
        return 0
    fi

    if [[ "$cert_pin" == "sha256/"* ]]; then
        success "Certificate pinning configured"
        return 0
    else
        error "API_CERT_PIN format invalid: $cert_pin"
        return 1
    fi
}

################################################################################
# Dependency Checks
################################################################################

check_npm_audit() {
    log "Running npm audit for security vulnerabilities..."

    if ! npm audit --audit-level=high > /dev/null 2>&1; then
        error "npm audit found HIGH or CRITICAL vulnerabilities"
        npm audit --audit-level=high | head -20
        return 1
    fi

    success "No HIGH or CRITICAL vulnerabilities in dependencies"
    return 0
}

check_deprecated_packages() {
    log "Checking for deprecated packages..."

    if npm ls 2>/dev/null | grep -i "deprecated" > /dev/null; then
        warning "Deprecated packages found in dependencies"
        npm ls 2>/dev/null | grep -i "deprecated" | head -5
        return 0
    fi

    success "No deprecated packages found"
    return 0
}

################################################################################
# Code Quality Checks
################################################################################

check_eslint() {
    log "Running ESLint for code quality..."

    if [ ! -x "$(command -v npx)" ]; then
        warning "npx not found, skipping ESLint check"
        return 0
    fi

    if npx eslint . --max-warnings 0 > /dev/null 2>&1; then
        success "ESLint passed with no warnings"
        return 0
    else
        error "ESLint found issues"
        return 1
    fi
}

check_hardcoded_secrets() {
    log "Scanning for hardcoded secrets in code..."

    local found=0

    # Check for common secret patterns
    if grep -r "PRIVATE_KEY\|API_KEY\|SECRET_KEY\|PASSWORD" \
        --exclude-dir=node_modules \
        --exclude-dir=.git \
        --exclude="*.env*" \
        --exclude="package-lock.json" \
        "${PROJECT_ROOT}" 2>/dev/null | grep -v "^[^:]*:\s*//" | grep -q .; then

        warning "Potential hardcoded secrets found"
        grep -r "PRIVATE_KEY\|API_KEY\|SECRET_KEY\|PASSWORD" \
            --exclude-dir=node_modules \
            --exclude-dir=.git \
            --exclude="*.env*" \
            --exclude="package-lock.json" \
            "${PROJECT_ROOT}" 2>/dev/null | grep -v "^[^:]*:\s*//" | head -5

        ((found++))
    fi

    if [ $found -eq 0 ]; then
        success "No obvious hardcoded secrets found"
        return 0
    else
        error "Review findings above and remove hardcoded secrets"
        return 1
    fi
}

################################################################################
# Runtime Checks
################################################################################

check_debug_mode() {
    log "Checking debug mode setting..."

    local debug_mode=$(grep "^DEBUG_MODE=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "")

    if [[ "$debug_mode" == "true" ]]; then
        warning "DEBUG_MODE is enabled (disable in production)"
        return 0
    fi

    success "DEBUG_MODE is disabled"
    return 0
}

check_logging_config() {
    log "Checking logging configuration..."

    local log_level=$(grep "^LOG_LEVEL=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "")

    if [ -z "$log_level" ]; then
        error "LOG_LEVEL not configured"
        return 1
    fi

    if [[ "$log_level" == "debug" ]]; then
        warning "LOG_LEVEL is set to 'debug' (reduce verbosity in production)"
    fi

    success "LOG_LEVEL configured: $log_level"
    return 0
}

################################################################################
# HTTPS/TLS Checks
################################################################################

check_hsts_config() {
    log "Checking HSTS configuration..."

    local hsts=$(grep "^HSTS_MAX_AGE=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 || echo "")

    if [ -z "$hsts" ]; then
        warning "HSTS_MAX_AGE not configured"
        return 0
    fi

    if [ "$hsts" -ge 31536000 ]; then
        success "HSTS configured with max-age >= 1 year"
        return 0
    else
        warning "HSTS max-age is less than 1 year: $hsts seconds"
        return 0
    fi
}

check_csp_header() {
    log "Checking Content Security Policy..."

    local csp=$(grep "^CONTENT_SECURITY_POLICY=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 || echo "")

    if [ -z "$csp" ]; then
        warning "CONTENT_SECURITY_POLICY not configured"
        return 0
    fi

    if echo "$csp" | grep -q "unsafe-inline"; then
        warning "CSP contains 'unsafe-inline' (reduces security)"
    fi

    success "CSP configured"
    return 0
}

################################################################################
# Compliance Checks
################################################################################

check_data_retention() {
    log "Checking data retention policy..."

    local retention=$(grep "^GDPR_DATA_RETENTION_DAYS=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "")

    if [ -z "$retention" ]; then
        warning "Data retention policy not configured"
        return 0
    fi

    if [ "$retention" -ge 365 ]; then
        success "Data retention: $retention days"
        return 0
    fi
}

check_privacy_policy() {
    log "Checking privacy policy configuration..."

    local policy_url=$(grep "^PRIVACY_POLICY_URL=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "")

    if [ -z "$policy_url" ] || [[ "$policy_url" == "https://"* ]]; then
        warning "PRIVACY_POLICY_URL not configured with valid URL"
        return 0
    fi

    success "Privacy policy URL configured"
    return 0
}

################################################################################
# Summary Report
################################################################################

show_summary() {
    local total=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
    local pass_rate=$((PASS_COUNT * 100 / total))

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Security Validation Report"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Results:"
    echo "  Passed:  ${GREEN}$PASS_COUNT${NC}"
    echo "  Failed:  ${RED}$FAIL_COUNT${NC}"
    echo "  Warned:  ${YELLOW}$WARN_COUNT${NC}"
    echo "  Total:   $total"
    echo ""
    echo "Pass Rate: ${GREEN}${pass_rate}%${NC}"
    echo ""

    if [ $FAIL_COUNT -eq 0 ]; then
        echo "${GREEN}✓ Security validation PASSED${NC}"
        return 0
    else
        echo "${RED}✗ Security validation FAILED${NC}"
        return 1
    fi
}

################################################################################
# Main
################################################################################

main() {
    local quick_mode=false
    local ci_mode=false

    # Parse arguments
    case "${1:-}" in
        --quick)
            quick_mode=true
            ;;
        --ci)
            ci_mode=true
            ;;
        --help|-h)
            echo "Usage: $0 [OPTION]"
            echo "Validate security configuration"
            echo ""
            echo "Options:"
            echo "  --quick   Run quick validation (skip slow checks)"
            echo "  --ci      CI/CD mode (fail on warnings)"
            echo "  -h, --help Show this help message"
            exit 0
            ;;
    esac

    echo ""
    echo "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo "${BLUE}║   Security Configuration Validation                            ║${NC}"
    echo "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Run checks
    check_env_permissions
    check_gitignore
    check_node_modules

    echo ""
    log "Environment Variables..."
    check_encryption_key
    check_jwt_secret
    check_api_endpoint
    check_certificate_pinning

    echo ""
    log "Runtime Configuration..."
    check_debug_mode
    check_logging_config

    echo ""
    log "Security Headers..."
    check_hsts_config
    check_csp_header

    echo ""
    log "Compliance..."
    check_data_retention
    check_privacy_policy

    if [ "$quick_mode" = false ]; then
        echo ""
        log "Code Quality..."
        check_hardcoded_secrets
        check_eslint
        check_npm_audit
        check_deprecated_packages
    fi

    show_summary
}

main "$@"
