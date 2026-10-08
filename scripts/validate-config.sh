#!/bin/bash

################################################################################
# Configuration Validation Script
#
# Validates the project configuration, checking for required settings,
# correct file structures, and environment setup.
#
# Usage:
#   ./scripts/validate-config.sh      # Full validation
#   ./scripts/validate-config.sh --env # Environment only
#   ./scripts/validate-config.sh --deps # Dependencies only
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
log() { echo -e "${BLUE}[Config]${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; ((PASS_COUNT++)); }
error() { echo -e "${RED}✗${NC} $*"; ((FAIL_COUNT++)); }
warning() { echo -e "${YELLOW}⚠${NC} $*"; ((WARN_COUNT++)); }

################################################################################
# Project Structure Validation
################################################################################

check_project_structure() {
    log "Checking project structure..."

    local required_dirs=(
        "src"
        "scripts"
        ".github"
    )

    local required_files=(
        ".env.example"
        "package.json"
        "package-lock.json"
        ".gitignore"
        "README.md"
        "tsconfig.json"
    )

    for dir in "${required_dirs[@]}"; do
        if [ -d "${PROJECT_ROOT}/${dir}" ]; then
            success "Directory exists: $dir"
        else
            warning "Directory missing: $dir"
        fi
    done

    for file in "${required_files[@]}"; do
        if [ -f "${PROJECT_ROOT}/${file}" ]; then
            success "File exists: $file"
        else
            error "File missing: $file"
        fi
    done
}

################################################################################
# Environment File Validation
################################################################################

validate_env_file() {
    log "Validating .env.local..."

    if [ ! -f "$ENV_LOCAL" ]; then
        error ".env.local not found. Run ./scripts/setup.sh"
        return 1
    fi

    success ".env.local exists"

    # Check file size
    local file_size=$(wc -c < "$ENV_LOCAL")
    if [ "$file_size" -lt 100 ]; then
        error ".env.local is suspiciously small ($file_size bytes)"
        return 1
    fi

    success ".env.local file size: $file_size bytes"
    return 0
}

check_required_env_vars() {
    log "Checking required environment variables..."

    local required_vars=(
        "API_ENDPOINT"
        "ENCRYPTION_KEY"
        "JWT_SECRET"
        "LOG_LEVEL"
    )

    local missing=0

    for var in "${required_vars[@]}"; do
        if grep -q "^${var}=" "$ENV_LOCAL" 2>/dev/null; then
            local value=$(grep "^${var}=" "$ENV_LOCAL" | cut -d= -f2 | tr -d ' ')

            if [ -z "$value" ] || [[ "$value" == "your_"* ]]; then
                warning "$var is not configured with actual value"
            else
                success "$var is configured"
            fi
        else
            error "$var is missing from .env.local"
            ((missing++))
        fi
    done

    if [ $missing -gt 0 ]; then
        return 1
    fi

    return 0
}

check_env_format() {
    log "Checking .env.local format..."

    # Check for lines without = sign
    if grep -v "^#" "$ENV_LOCAL" | grep -v "^$" | grep -v "=" > /dev/null; then
        error ".env.local contains invalid lines"
        grep -v "^#" "$ENV_LOCAL" | grep -v "^$" | grep -v "="
        return 1
    fi

    success ".env.local format is valid"
    return 0
}

################################################################################
# Package.json Validation
################################################################################

check_package_json() {
    log "Validating package.json..."

    if ! command -v jq &> /dev/null; then
        warning "jq not installed, skipping JSON validation"
        return 0
    fi

    if jq empty "${PROJECT_ROOT}/package.json" 2>/dev/null; then
        success "package.json is valid JSON"
    else
        error "package.json has invalid JSON"
        return 1
    fi
}

check_required_scripts() {
    log "Checking package.json scripts..."

    local required_scripts=(
        "dev"
        "build"
        "test"
        "lint"
    )

    for script in "${required_scripts[@]}"; do
        if grep -q "\"${script}\":" "${PROJECT_ROOT}/package.json"; then
            success "Script defined: $script"
        else
            warning "Script missing: $script"
        fi
    done
}

check_node_version() {
    log "Checking Node.js version..."

    if ! command -v jq &> /dev/null; then
        warning "jq not installed, skipping"
        return 0
    fi

    local required=$(jq -r '.engines.node' "${PROJECT_ROOT}/package.json" 2>/dev/null || echo "")

    if [ -n "$required" ]; then
        success "Node.js requirement in package.json: $required"

        # Check current version matches
        local current=$(node -v | sed 's/^v//')
        echo "Current Node.js version: $current"
    else
        warning "Node.js requirement not specified in package.json"
    fi
}

################################################################################
# Dependencies Validation
################################################################################

check_dependencies() {
    log "Checking npm dependencies..."

    if [ ! -f "${PROJECT_ROOT}/package-lock.json" ]; then
        error "package-lock.json not found. Run: npm install"
        return 1
    fi

    success "package-lock.json exists"

    if [ ! -d "${PROJECT_ROOT}/node_modules" ]; then
        error "node_modules directory not found. Run: npm install"
        return 1
    fi

    success "node_modules directory exists"

    # Count packages
    local package_count=$(find "${PROJECT_ROOT}/node_modules" -maxdepth 1 -type d | wc -l)
    success "Dependencies installed: ~$(($package_count - 1)) packages"

    return 0
}

################################################################################
# Git Configuration
################################################################################

check_git_setup() {
    log "Checking Git configuration..."

    if [ ! -d "${PROJECT_ROOT}/.git" ]; then
        error "Not a Git repository"
        return 1
    fi

    success "Git repository initialized"

    # Check git config
    local git_user=$(cd "$PROJECT_ROOT" && git config user.name 2>/dev/null || echo "")
    local git_email=$(cd "$PROJECT_ROOT" && git config user.email 2>/dev/null || echo "")

    if [ -z "$git_user" ]; then
        warning "Git user.name not configured globally"
        echo "  Run: git config --global user.name \"Your Name\""
    else
        success "Git user configured: $git_user"
    fi

    if [ -z "$git_email" ]; then
        warning "Git user.email not configured globally"
        echo "  Run: git config --global user.email \"your@email.com\""
    else
        success "Git email configured: $git_email"
    fi
}

check_git_hooks() {
    log "Checking git hooks..."

    if [ -d "${PROJECT_ROOT}/.husky" ]; then
        success ".husky directory exists"

        if [ -f "${PROJECT_ROOT}/.husky/pre-commit" ]; then
            success "pre-commit hook found"
        else
            warning "pre-commit hook not found"
        fi

        if [ -f "${PROJECT_ROOT}/.husky/pre-push" ]; then
            success "pre-push hook found"
        else
            warning "pre-push hook not found"
        fi
    else
        warning ".husky directory not found. Run: ./scripts/setup.sh"
    fi
}

################################################################################
# TypeScript Configuration
################################################################################

check_typescript() {
    log "Checking TypeScript configuration..."

    if [ ! -f "${PROJECT_ROOT}/tsconfig.json" ]; then
        warning "tsconfig.json not found"
        return 0
    fi

    success "tsconfig.json exists"

    if ! command -v tsc &> /dev/null; then
        warning "TypeScript not installed globally"
    else
        local ts_version=$(tsc --version | awk '{print $2}')
        success "TypeScript installed: $ts_version"
    fi
}

################################################################################
# Linting Configuration
################################################################################

check_eslint() {
    log "Checking ESLint configuration..."

    if [ -f "${PROJECT_ROOT}/eslint.config.js" ] || [ -f "${PROJECT_ROOT}/.eslintrc.json" ]; then
        success "ESLint configuration found"
    else
        warning "ESLint configuration not found"
    fi

    if [ ! -f "${PROJECT_ROOT}/.eslintignore" ]; then
        warning ".eslintignore not found"
    else
        success ".eslintignore exists"
    fi
}

################################################################################
# Testing Configuration
################################################################################

check_testing_setup() {
    log "Checking testing configuration..."

    # Check for test files
    if find "${PROJECT_ROOT}" -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | grep -q .; then
        success "Test files found"
    else
        warning "No test files found"
    fi

    # Check for vitest config
    if [ -f "${PROJECT_ROOT}/vitest.config.ts" ] || grep -q "vitest" "${PROJECT_ROOT}/package.json" 2>/dev/null; then
        success "Vitest configured"
    else
        warning "Vitest not configured"
    fi
}

################################################################################
# Port Configuration
################################################################################

check_ports() {
    log "Checking port configuration..."

    # Check if common dev ports are available
    local ports=(3000 3001 5173 8080 5000)

    for port in "${ports[@]}"; do
        if nc -z localhost "$port" 2>/dev/null; then
            warning "Port $port is in use"
        fi
    done

    success "Port check complete"
}

################################################################################
# Environment-Specific Validation
################################################################################

validate_development_config() {
    log "Checking development configuration..."

    local debug=$(grep "^DEBUG_MODE=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "")

    if [ "$debug" != "true" ]; then
        warning "DEBUG_MODE should be true for development"
    else
        success "DEBUG_MODE enabled for development"
    fi
}

validate_production_config() {
    log "Checking production configuration..."

    local debug=$(grep "^DEBUG_MODE=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "")

    if [ "$debug" == "true" ]; then
        error "DEBUG_MODE should be false in production"
        return 1
    else
        success "DEBUG_MODE disabled for production"
    fi
}

################################################################################
# Summary Report
################################################################################

show_summary() {
    local total=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))

    if [ $total -eq 0 ]; then
        echo "No checks were run"
        return 0
    fi

    local pass_rate=$((PASS_COUNT * 100 / total))

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Configuration Validation Report"
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
        echo "${GREEN}✓ Configuration validation PASSED${NC}"

        if [ $WARN_COUNT -gt 0 ]; then
            echo "${YELLOW}⚠ $WARN_COUNT warnings found${NC}"
        fi

        return 0
    else
        echo "${RED}✗ Configuration validation FAILED${NC}"
        return 1
    fi
}

################################################################################
# Main
################################################################################

main() {
    local check_env=false
    local check_deps=false
    local check_dev=false

    # Parse arguments
    case "${1:-}" in
        --env)
            check_env=true
            ;;
        --deps)
            check_deps=true
            ;;
        --dev)
            check_dev=true
            ;;
        --help|-h)
            echo "Usage: $0 [OPTION]"
            echo "Validate project configuration"
            echo ""
            echo "Options:"
            echo "  --env   Check environment configuration only"
            echo "  --deps  Check dependencies only"
            echo "  --dev   Check development configuration"
            echo "  -h, --help Show this help message"
            exit 0
            ;;
    esac

    echo ""
    echo "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo "${BLUE}║   Configuration Validation                                     ║${NC}"
    echo "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Run checks
    if [ "$check_env" = true ]; then
        validate_env_file
        check_required_env_vars
        check_env_format
    elif [ "$check_deps" = true ]; then
        check_dependencies
    elif [ "$check_dev" = true ]; then
        validate_development_config
    else
        # Full validation
        check_project_structure
        echo ""
        validate_env_file
        check_required_env_vars
        check_env_format
        echo ""
        check_package_json
        check_required_scripts
        check_node_version
        echo ""
        check_dependencies
        echo ""
        check_git_setup
        check_git_hooks
        echo ""
        check_typescript
        check_eslint
        echo ""
        check_testing_setup
        echo ""
        validate_development_config
    fi

    show_summary
}

main "$@"
