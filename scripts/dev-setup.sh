#!/bin/bash

################################################################################
# Development Environment Configuration Script
#
# Sets up environment variables and development tools for local development.
# This script is run by setup.sh but can also be run independently to refresh
# the development environment.
#
# Usage:
#   ./scripts/dev-setup.sh              # Default development setup
#   ./scripts/dev-setup.sh --staging    # Staging environment
#   ./scripts/dev-setup.sh --reset      # Reset to defaults
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
ENV_EXAMPLE="${PROJECT_ROOT}/.env.example"

# Logging functions
log() { echo -e "${BLUE}[Dev Setup]${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
error() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
warning() { echo -e "${YELLOW}⚠${NC} $*"; }

################################################################################
# Helper Functions
################################################################################

check_env_local() {
    if [ ! -f "$ENV_LOCAL" ]; then
        error ".env.local not found. Run ./scripts/setup.sh first"
    fi
}

update_env_var() {
    local key=$1
    local value=$2

    if grep -q "^${key}=" "$ENV_LOCAL"; then
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_LOCAL"
        rm -f "${ENV_LOCAL}.bak"
    else
        echo "${key}=${value}" >> "$ENV_LOCAL"
    fi
}

get_env_var() {
    local key=$1
    grep "^${key}=" "$ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d "'" || echo ""
}

################################################################################
# Development Mode Setup
################################################################################

setup_development_mode() {
    log "Configuring for development mode..."

    # Enable debug mode for development
    update_env_var "DEBUG_MODE" "true"
    update_env_var "LOG_LEVEL" "debug"
    update_env_var "LOG_NETWORK_REQUESTS" "true"
    update_env_var "LOG_ENCRYPTION_OPERATIONS" "false"

    # Mock API responses for development
    read -p "Enable mock API responses? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        update_env_var "MOCK_API_RESPONSES" "true"
    fi

    # Analytics sampling for development
    update_env_var "ANALYTICS_SAMPLE_RATE" "10"

    success "Development mode configured"
    success "Debug logging enabled"
}

################################################################################
# Staging Mode Setup
################################################################################

setup_staging_mode() {
    log "Configuring for staging environment..."

    # Read staging endpoint from user or config
    local staging_endpoint=$(get_env_var "STAGING_API_ENDPOINT")

    if [ -z "$staging_endpoint" ]; then
        read -p "Enter staging API endpoint (default: https://api.staging.crmt.app): " staging_endpoint
        staging_endpoint=${staging_endpoint:-https://api.staging.crmt.app}
    fi

    update_env_var "API_ENDPOINT" "$staging_endpoint"
    update_env_var "DEBUG_MODE" "true"
    update_env_var "LOG_LEVEL" "info"
    update_env_var "ANALYTICS_SAMPLE_RATE" "100"

    success "Staging environment configured"
    success "API Endpoint: $staging_endpoint"
}

################################################################################
# Production Mode Setup
################################################################################

setup_production_mode() {
    log "Configuring for production environment..."

    # Strict production settings
    update_env_var "DEBUG_MODE" "false"
    update_env_var "LOG_LEVEL" "warn"
    update_env_var "LOG_NETWORK_REQUESTS" "false"
    update_env_var "LOG_ENCRYPTION_OPERATIONS" "false"
    update_env_var "MOCK_API_RESPONSES" "false"
    update_env_var "ANALYTICS_SAMPLE_RATE" "100"

    warning "⚠ Production mode configured"
    warning "  • Debug mode disabled"
    warning "  • Only warnings and errors logged"
    warning "  • Network requests not logged"
}

################################################################################
# Feature Flags Configuration
################################################################################

setup_feature_flags() {
    log "Configuring feature flags..."

    local features=(
        "FEATURE_BIOMETRIC_AUTH:true:Biometric authentication"
        "FEATURE_OFFLINE_MODE:true:Offline mode"
        "FEATURE_TWO_FACTOR_AUTH:false:Two-factor authentication"
        "FEATURE_DATA_EXPORT:true:Data export functionality"
    )

    for feature in "${features[@]}"; do
        IFS=':' read -r key default description <<< "$feature"

        read -p "Enable $description? (y/n, default: $default): " -n 1 -r
        echo

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            update_env_var "$key" "true"
        else
            update_env_var "$key" "false"
        fi
    done

    success "Feature flags configured"
}

################################################################################
# Rate Limiting Configuration
################################################################################

setup_rate_limiting() {
    log "Configuring rate limiting..."

    local environment=$([ "$1" == "production" ] && echo "production" || echo "development")

    if [ "$environment" == "production" ]; then
        update_env_var "RATE_LIMIT_LOGIN_ATTEMPTS" "5"
        update_env_var "RATE_LIMIT_LOGIN_WINDOW_MINUTES" "15"
        update_env_var "RATE_LIMIT_API_REQUESTS" "100"
        update_env_var "RATE_LIMIT_API_WINDOW_SECONDS" "60"
    else
        update_env_var "RATE_LIMIT_LOGIN_ATTEMPTS" "100"
        update_env_var "RATE_LIMIT_LOGIN_WINDOW_MINUTES" "60"
        update_env_var "RATE_LIMIT_API_REQUESTS" "1000"
        update_env_var "RATE_LIMIT_API_WINDOW_SECONDS" "60"
    fi

    success "Rate limiting configured"
}

################################################################################
# Database Configuration
################################################################################

setup_database() {
    log "Configuring database connection..."

    # Check if database URL is configured
    local db_url=$(get_env_var "DATABASE_URL")

    if [ -z "$db_url" ]; then
        warning "DATABASE_URL not set. Using default SQLite for development."
        echo "For production, set DATABASE_URL in .env.local"
    else
        success "Database URL configured"
    fi
}

################################################################################
# Verification Functions
################################################################################

verify_env_setup() {
    log "Verifying environment setup..."

    local missing=0

    # Critical variables
    local critical_vars=(
        "ENCRYPTION_KEY"
        "JWT_SECRET"
        "API_ENDPOINT"
    )

    for var in "${critical_vars[@]}"; do
        local value=$(get_env_var "$var")
        if [ -z "$value" ] || [ "$value" == "your_"* ]; then
            warning "Missing or unconfigured: $var"
            ((missing++))
        else
            success "$var configured"
        fi
    done

    if [ $missing -gt 0 ]; then
        warning "$missing critical variables need configuration"
        return 1
    fi

    success "Environment verification passed"
    return 0
}

################################################################################
# Display Configuration
################################################################################

show_config() {
    log "Current configuration:"
    echo ""
    echo "Environment Variables:"
    echo "  DEBUG_MODE: $(get_env_var 'DEBUG_MODE')"
    echo "  LOG_LEVEL: $(get_env_var 'LOG_LEVEL')"
    echo "  API_ENDPOINT: $(get_env_var 'API_ENDPOINT')"
    echo ""
    echo "Feature Flags:"
    echo "  FEATURE_BIOMETRIC_AUTH: $(get_env_var 'FEATURE_BIOMETRIC_AUTH')"
    echo "  FEATURE_OFFLINE_MODE: $(get_env_var 'FEATURE_OFFLINE_MODE')"
    echo "  FEATURE_TWO_FACTOR_AUTH: $(get_env_var 'FEATURE_TWO_FACTOR_AUTH')"
    echo "  FEATURE_DATA_EXPORT: $(get_env_var 'FEATURE_DATA_EXPORT')"
    echo ""
}

################################################################################
# Reset Configuration
################################################################################

reset_to_defaults() {
    log "Resetting configuration to defaults..."

    read -p "This will reset .env.local. Continue? (y/n): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp "$ENV_EXAMPLE" "$ENV_LOCAL"
        success "Configuration reset to defaults"
        log "Run setup.sh again to generate new keys"
    else
        echo "Reset cancelled"
    fi
}

################################################################################
# Main Menu
################################################################################

show_menu() {
    echo ""
    echo "Development Environment Setup"
    echo "=============================="
    echo "1) Development mode"
    echo "2) Staging mode"
    echo "3) Production mode"
    echo "4) Configure feature flags"
    echo "5) Configure rate limiting"
    echo "6) Configure database"
    echo "7) Verify environment"
    echo "8) Show configuration"
    echo "9) Reset to defaults"
    echo "0) Exit"
    echo ""
}

main() {
    check_env_local

    # Handle command line arguments
    case "${1:-}" in
        --development)
            setup_development_mode
            verify_env_setup
            ;;
        --staging)
            setup_staging_mode
            verify_env_setup
            ;;
        --production)
            setup_production_mode
            verify_env_setup
            ;;
        --verify)
            verify_env_setup
            ;;
        --reset)
            reset_to_defaults
            ;;
        --show-config)
            show_config
            ;;
        -h|--help)
            echo "Usage: $0 [OPTION]"
            echo "Setup development environment variables and configurations"
            echo ""
            echo "Options:"
            echo "  --development    Setup development environment"
            echo "  --staging        Setup staging environment"
            echo "  --production     Setup production environment"
            echo "  --verify         Verify environment setup"
            echo "  --show-config    Display current configuration"
            echo "  --reset          Reset to default configuration"
            echo "  -h, --help       Show this help message"
            echo ""
            echo "Interactive mode:"
            echo "  Run without arguments for interactive menu"
            ;;
        "")
            # Interactive mode
            while true; do
                show_menu
                read -p "Select option: " choice

                case $choice in
                    1) setup_development_mode ;;
                    2) setup_staging_mode ;;
                    3) setup_production_mode ;;
                    4) setup_feature_flags ;;
                    5) setup_rate_limiting ;;
                    6) setup_database ;;
                    7) verify_env_setup ;;
                    8) show_config ;;
                    9) reset_to_defaults ;;
                    0) log "Exiting"; exit 0 ;;
                    *) warning "Invalid option" ;;
                esac
            done
            ;;
        *)
            error "Unknown option: $1. Use --help for usage information."
            ;;
    esac
}

main "$@"
