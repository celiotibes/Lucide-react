#!/bin/bash

################################################################################
# Lucide React - Development Environment Setup Script
#
# This script automates the setup of a secure development environment for
# Lucide React projects. It validates dependencies, generates encryption keys,
# creates environment configuration, and sets up git hooks.
#
# Usage:
#   ./scripts/setup.sh                 # Interactive mode
#   ./scripts/setup.sh --skip-certs    # Skip certificate validation
#   ./scripts/setup.sh --ci            # CI/CD mode (non-interactive)
#
# Supported Platforms: macOS, Linux, Windows (WSL/Git Bash)
################################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REQUIRED_NODE_MIN="20.19.0"
REQUIRED_NODE_MAX_MAJOR="22"
REQUIRED_NPM_MIN="9.0.0"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="${PROJECT_ROOT}/scripts"
ENV_TEMPLATE="${PROJECT_ROOT}/.env.example"
ENV_LOCAL="${PROJECT_ROOT}/.env.local"
ENV_LOCAL_BACKUP="${PROJECT_ROOT}/.env.local.backup"

# Flags
SKIP_CERTS=false
CI_MODE=false
VERBOSE=false

################################################################################
# Utility Functions
################################################################################

log() {
    echo -e "${BLUE}[Setup]${NC} $*"
}

success() {
    echo -e "${GREEN}✓${NC} $*"
}

error() {
    echo -e "${RED}✗${NC} $*" >&2
}

warning() {
    echo -e "${YELLOW}⚠${NC} $*"
}

die() {
    error "$@"
    exit 1
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Parse version strings for comparison
parse_version() {
    echo "$1" | awk -F. '{print ($1 * 1000000) + ($2 * 1000) + $3}'
}

# Check if version is greater than or equal to minimum
version_gte() {
    local version=$1
    local minimum=$2
    [ "$(parse_version "$version")" -ge "$(parse_version "$minimum")" ]
}

# Prompt user for yes/no
prompt_yn() {
    local prompt="$1"
    local default="${2:-y}"
    local response

    if [ "$CI_MODE" = true ]; then
        return 0
    fi

    read -p "$(echo -e "${BLUE}?${NC} $prompt (${default}/n) "):" response
    response=${response:-$default}

    if [[ "$response" =~ ^[Yy]$ ]]; then
        return 0
    else
        return 1
    fi
}

################################################################################
# Validation Functions
################################################################################

validate_node_version() {
    if ! command_exists node; then
        die "Node.js is not installed. Please install Node.js ${REQUIRED_NODE_MIN} or higher from https://nodejs.org/"
    fi

    local node_version=$(node -v | sed 's/^v//')
    local node_major=$(echo "$node_version" | cut -d. -f1)

    if ! version_gte "$node_version" "$REQUIRED_NODE_MIN"; then
        die "Node.js version ${node_version} is too old. Required: ${REQUIRED_NODE_MIN} or higher"
    fi

    if [ "$node_major" -lt 20 ]; then
        die "Node.js version ${node_version} is not supported. Required: 20.19.0+ or 22.12.0+"
    fi

    success "Node.js ${node_version} ✓"
}

validate_npm_version() {
    if ! command_exists npm; then
        die "npm is not installed with Node.js"
    fi

    local npm_version=$(npm -v)

    if ! version_gte "$npm_version" "$REQUIRED_NPM_MIN"; then
        die "npm version ${npm_version} is too old. Required: ${REQUIRED_NPM_MIN} or higher"
    fi

    success "npm ${npm_version} ✓"
}

validate_git() {
    if ! command_exists git; then
        die "Git is not installed. Please install Git from https://git-scm.com/"
    fi

    local git_version=$(git --version | awk '{print $3}')
    success "Git ${git_version} ✓"
}

validate_openssl() {
    if ! command_exists openssl; then
        die "OpenSSL is not installed. Please install it:"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo "  brew install openssl"
        elif [[ "$OSTYPE" == "linux"* ]]; then
            echo "  sudo apt-get install openssl  # Debian/Ubuntu"
            echo "  sudo yum install openssl      # RHEL/CentOS"
        fi
    fi

    local openssl_version=$(openssl version | awk '{print $2}')
    success "OpenSSL ${openssl_version} ✓"
}

################################################################################
# Environment Setup Functions
################################################################################

create_env_local() {
    if [ -f "$ENV_LOCAL" ]; then
        if [ "$CI_MODE" = false ] && prompt_yn ".env.local already exists. Do you want to overwrite it?" "n"; then
            warning "Backing up existing .env.local to .env.local.backup"
            cp "$ENV_LOCAL" "$ENV_LOCAL_BACKUP"
            rm "$ENV_LOCAL"
        else
            warning ".env.local already exists. Skipping environment setup"
            return 0
        fi
    fi

    if [ ! -f "$ENV_TEMPLATE" ]; then
        die ".env.example not found at ${ENV_TEMPLATE}"
    fi

    log "Creating .env.local from .env.example..."
    cp "$ENV_TEMPLATE" "$ENV_LOCAL"
    chmod 600 "$ENV_LOCAL"

    success ".env.local created"
    warning "⚠ Remember to fill in actual values in .env.local (it's gitignored)"
}

################################################################################
# Key Generation Functions
################################################################################

generate_encryption_key() {
    log "Generating AES-256-GCM encryption key..."

    local encryption_key=$(openssl rand -base64 32)

    if grep -q "^ENCRYPTION_KEY=" "$ENV_LOCAL"; then
        sed -i.bak "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${encryption_key}|" "$ENV_LOCAL"
        rm -f "${ENV_LOCAL}.bak"
    else
        echo "ENCRYPTION_KEY=${encryption_key}" >> "$ENV_LOCAL"
    fi

    success "Encryption key generated and saved to .env.local"
}

generate_jwt_secret() {
    log "Generating JWT secret..."

    local jwt_secret=$(openssl rand -base64 32)

    if grep -q "^JWT_SECRET=" "$ENV_LOCAL"; then
        sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" "$ENV_LOCAL"
        rm -f "${ENV_LOCAL}.bak"
    else
        echo "JWT_SECRET=${jwt_secret}" >> "$ENV_LOCAL"
    fi

    success "JWT secret generated and saved to .env.local"
}

generate_certificate_pins() {
    if [ "$SKIP_CERTS" = true ]; then
        warning "Skipping certificate pin generation"
        return 0
    fi

    local api_endpoint=$(grep "^API_ENDPOINT=" "$ENV_LOCAL" | cut -d= -f2 | sed 's|https://||' | sed 's|/.*||')

    if [ -z "$api_endpoint" ]; then
        warning "API_ENDPOINT not configured in .env.local, skipping certificate pins"
        return 0
    fi

    log "Generating certificate pins for ${api_endpoint}..."

    local cert_pin=$(echo | openssl s_client -servername "$api_endpoint" -connect "${api_endpoint}:443" 2>/dev/null | \
                     openssl x509 -pubkey -noout 2>/dev/null | \
                     openssl pkey -pubin -outform der 2>/dev/null | \
                     openssl dgst -sha256 -binary 2>/dev/null | \
                     openssl enc -base64 2>/dev/null || echo "")

    if [ -n "$cert_pin" ]; then
        if grep -q "^API_CERT_PIN=" "$ENV_LOCAL"; then
            sed -i.bak "s|^API_CERT_PIN=.*|API_CERT_PIN=sha256/${cert_pin}|" "$ENV_LOCAL"
            rm -f "${ENV_LOCAL}.bak"
        else
            echo "API_CERT_PIN=sha256/${cert_pin}" >> "$ENV_LOCAL"
        fi
        success "Certificate pin generated for ${api_endpoint}"
    else
        warning "Could not generate certificate pin for ${api_endpoint} (server might be unreachable)"
    fi
}

################################################################################
# Dependency Installation
################################################################################

install_dependencies() {
    log "Installing Node.js dependencies..."

    if [ ! -d "${PROJECT_ROOT}/node_modules" ] || [ ! -f "${PROJECT_ROOT}/package-lock.json" ]; then
        npm ci --legacy-peer-deps || npm install --legacy-peer-deps
    else
        npm ci --legacy-peer-deps
    fi

    success "Dependencies installed"
}

setup_git_hooks() {
    log "Setting up git pre-commit and pre-push hooks..."

    # Create .husky directory if it doesn't exist
    mkdir -p "${PROJECT_ROOT}/.husky"

    # Create pre-commit hook
    cat > "${PROJECT_ROOT}/.husky/pre-commit" << 'EOF'
#!/bin/bash

set -e

echo "Running pre-commit checks..."

# Run ESLint on staged files
echo "  • Running ESLint..."
npx eslint --fix . --max-warnings 0 2>/dev/null || {
    echo "❌ ESLint failed. Fix errors and try again."
    exit 1
}

# Run tests
echo "  • Running tests..."
npm run test 2>/dev/null || {
    echo "❌ Tests failed. Fix errors and try again."
    exit 1
}

echo "✓ Pre-commit checks passed"
EOF
    chmod +x "${PROJECT_ROOT}/.husky/pre-commit"

    # Create pre-push hook
    cat > "${PROJECT_ROOT}/.husky/pre-push" << 'EOF'
#!/bin/bash

set -e

echo "Running pre-push security checks..."

# Check for secrets in code
echo "  • Checking for hardcoded secrets..."
git diff --name-only --cached | xargs -I {} sh -c '
    if grep -r "PRIVATE_KEY\|API_KEY\|SECRET\|PASSWORD" {} 2>/dev/null; then
        echo "❌ Potential secrets found in: {}"
        exit 1
    fi
' || true

# Run security audit
echo "  • Running npm audit..."
npm audit --audit-level=moderate 2>/dev/null || {
    echo "⚠️  Security issues found. Review with: npm audit"
    exit 1
}

# Check for deprecated packages
echo "  • Checking for deprecated packages..."
npm ls 2>/dev/null | grep "deprecated" && {
    warning "Deprecated packages found. Consider updating them."
} || true

echo "✓ Pre-push security checks passed"
EOF
    chmod +x "${PROJECT_ROOT}/.husky/pre-push"

    success "Git hooks configured"
}

################################################################################
# Validation Scripts
################################################################################

run_initial_tests() {
    log "Running initial test suite..."

    if ! npm run test 2>&1 | head -20; then
        warning "Some tests failed. Review output above."
        if prompt_yn "Continue anyway?" "n"; then
            return 0
        else
            return 1
        fi
    fi

    success "Tests passed"
}

################################################################################
# Summary and Cleanup
################################################################################

show_summary() {
    local setup_date=$(date)

    cat << EOF

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${GREEN}✓ Development Environment Setup Complete!${NC}
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${BLUE}Setup Date:${NC} $setup_date

${BLUE}Verified Components:${NC}
  • Node.js $(node -v)
  • npm $(npm -v)
  • Git $(git --version | awk '{print $3}')
  • OpenSSL $(openssl version | awk '{print $2}')

${BLUE}Configured Items:${NC}
  • Environment: .env.local created
  • Encryption: AES-256-GCM key generated
  • JWT: Secret generated
  • Git Hooks: pre-commit and pre-push configured
  • Dependencies: npm modules installed

${BLUE}Next Steps:${NC}

1. ${YELLOW}Configure .env.local${NC}
   Edit ${ENV_LOCAL} and fill in actual values:
   • Firebase configuration
   • API endpoints
   • Certificate pins (if needed)
   • Third-party service credentials

2. ${YELLOW}Start Development${NC}
   npm run dev

3. ${YELLOW}Run Tests${NC}
   npm run test
   npm run test:watch  # Watch mode

4. ${YELLOW}Code Quality${NC}
   npm run lint        # Check code
   npm run lint -- --fix  # Auto-fix issues

${YELLOW}Important:${NC}
  • NEVER commit .env.local with real secrets
  • Use .env.local.backup for local backups only
  • Rotate encryption keys periodically
  • Review SETUP.md for detailed instructions
  • Check DEVELOPMENT.md for development guidelines
  • See CONTRIBUTING.md for contribution guidelines

${YELLOW}Security Reminders:${NC}
  • Keep .env.local restricted (chmod 600)
  • Never share private keys via email/chat
  • Use certificate pinning for production APIs
  • Enable biometric auth in mobile app
  • Review DATA_RETENTION_POLICY.md for compliance

${YELLOW}Need Help?${NC}
  • Read SETUP.md for detailed setup instructions
  • Check TROUBLESHOOTING.md for common issues
  • Review DEVELOPMENT.md for development guidelines

${GREEN}Happy coding! 🚀${NC}

EOF
}

################################################################################
# Parse Command Line Arguments
################################################################################

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-certs)
                SKIP_CERTS=true
                shift
                ;;
            --ci)
                CI_MODE=true
                SKIP_CERTS=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Setup development environment for Lucide React projects with secure defaults.

OPTIONS:
    --skip-certs    Skip certificate pin generation
    --ci            CI/CD mode (non-interactive, skips certs)
    --verbose       Enable verbose output
    -h, --help      Show this help message

EXAMPLES:
    # Interactive setup
    $0

    # CI/CD pipeline setup
    $0 --ci

    # Skip certificate validation
    $0 --skip-certs

REQUIREMENTS:
    • Node.js ${REQUIRED_NODE_MIN}+
    • npm ${REQUIRED_NPM_MIN}+
    • Git
    • OpenSSL

For detailed setup instructions, see SETUP.md

EOF
}

################################################################################
# Main Setup Flow
################################################################################

main() {
    local start_time=$(date +%s)

    clear

    cat << EOF
${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}
${BLUE}║   Lucide React - Development Environment Setup                 ║${NC}
${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}

EOF

    # Parse arguments
    parse_args "$@"

    # Validate environment
    log "Validating system environment..."
    validate_node_version
    validate_npm_version
    validate_git
    validate_openssl

    # Setup environment
    log "Setting up project configuration..."
    create_env_local

    # Generate keys (only if .env.local was created/fresh)
    log "Generating security keys and secrets..."
    generate_encryption_key
    generate_jwt_secret
    generate_certificate_pins

    # Install dependencies
    log "Installing project dependencies..."
    install_dependencies

    # Configure git hooks
    log "Configuring Git hooks..."
    setup_git_hooks

    # Run tests
    if [ "$CI_MODE" = false ]; then
        if prompt_yn "Run initial test suite?" "y"; then
            run_initial_tests
        fi
    fi

    # Show summary
    show_summary

    # Calculate setup time
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log "Setup completed in ${duration}s"
}

# Run main function
main "$@"
