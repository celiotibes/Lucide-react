#!/bin/bash

################################################################################
# Key Generation Script
#
# Generates cryptographic keys, encryption secrets, and tokens for secure
# development and production environments.
#
# Usage:
#   ./scripts/generate-keys.sh              # Interactive key generation
#   ./scripts/generate-keys.sh --all        # Generate all keys
#   ./scripts/generate-keys.sh --encryption # Generate only encryption keys
#   ./scripts/generate-keys.sh --jwt        # Generate only JWT secrets
#   ./scripts/generate-keys.sh --output     # Save to file instead of .env.local
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
log() { echo -e "${BLUE}[KeyGen]${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
error() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
warning() { echo -e "${YELLOW}⚠${NC} $*"; }

################################################################################
# Validation
################################################################################

validate_openssl() {
    if ! command -v openssl &> /dev/null; then
        error "OpenSSL is not installed. Please install it first."
    fi
}

validate_env_local() {
    if [ ! -f "$ENV_LOCAL" ]; then
        error ".env.local not found. Run ./scripts/setup.sh first"
    fi
}

################################################################################
# Key Generation Functions
################################################################################

generate_encryption_key() {
    log "Generating AES-256-GCM encryption key (256 bits)..."

    local key=$(openssl rand -base64 32)
    echo "$key"
    success "Encryption key generated"
}

generate_jwt_secret() {
    log "Generating JWT secret (256 bits)..."

    local secret=$(openssl rand -base64 32)
    echo "$secret"
    success "JWT secret generated"
}

generate_api_key() {
    log "Generating API key (256 bits)..."

    local key=$(openssl rand -hex 32)
    echo "$key"
    success "API key generated"
}

generate_session_secret() {
    log "Generating session secret (256 bits)..."

    local secret=$(openssl rand -base64 32)
    echo "$secret"
    success "Session secret generated"
}

generate_refresh_token_secret() {
    log "Generating refresh token secret (512 bits)..."

    local secret=$(openssl rand -base64 64)
    echo "$secret"
    success "Refresh token secret generated"
}

generate_hmac_secret() {
    log "Generating HMAC secret (512 bits)..."

    local secret=$(openssl rand -base64 64)
    echo "$secret"
    success "HMAC secret generated"
}

generate_database_password() {
    log "Generating secure database password (256 bits, alphanumeric)..."

    local password=$(openssl rand -base64 32 | tr '/+' 'Xx' | cut -c1-32)
    echo "$password"
    success "Database password generated"
}

generate_oauth_client_secret() {
    log "Generating OAuth client secret (256 bits)..."

    local secret=$(openssl rand -hex 32)
    echo "$secret"
    success "OAuth client secret generated"
}

################################################################################
# Update .env.local
################################################################################

update_env_var() {
    local key=$1
    local value=$2

    if grep -q "^${key}=" "$ENV_LOCAL" 2>/dev/null; then
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_LOCAL"
        rm -f "${ENV_LOCAL}.bak"
    else
        echo "${key}=${value}" >> "$ENV_LOCAL"
    fi
}

################################################################################
# Export Keys
################################################################################

export_keys_to_file() {
    local output_file=$1

    log "Exporting keys to $output_file..."

    cat > "$output_file" << EOF
# Generated Keys and Secrets
# Generated: $(date)
#
# IMPORTANT: Keep this file secure!
# - Never commit to version control
# - Never share via email or chat
# - Store in secure password manager
# - Rotate periodically (recommended: every 90 days)

# Encryption and Hashing
ENCRYPTION_KEY=$(generate_encryption_key)
ENCRYPTION_ALGORITHM=aes-256-gcm
ENCRYPTION_KEY_ITERATIONS=100000

# JWT and Sessions
JWT_SECRET=$(generate_jwt_secret)
JWT_ACCESS_TOKEN_EXPIRY=900
JWT_REFRESH_TOKEN_EXPIRY=604800
TOKEN_EXPIRY_BUFFER=300
SESSION_SECRET=$(generate_session_secret)
REFRESH_TOKEN_SECRET=$(generate_refresh_token_secret)

# API and Authentication
API_KEY=$(generate_api_key)
HMAC_SECRET=$(generate_hmac_secret)

# Database
DB_PASSWORD=$(generate_database_password)

# OAuth
OAUTH_CLIENT_SECRET=$(generate_oauth_client_secret)

# Additional Security
SECURE_RANDOM_BYTES=$(openssl rand -base64 32)
NONCE_SECRET=$(openssl rand -base64 32)

EOF

    chmod 600 "$output_file"
    success "Keys exported to $output_file"
}

################################################################################
# Interactive Key Selection
################################################################################

show_menu() {
    echo ""
    echo "Cryptographic Key Generation"
    echo "============================="
    echo "1) Encryption key (AES-256)"
    echo "2) JWT secret"
    echo "3) API key"
    echo "4) Session secret"
    echo "5) Refresh token secret"
    echo "6) HMAC secret"
    echo "7) Database password"
    echo "8) OAuth client secret"
    echo "9) Generate all keys"
    echo "10) Export all keys to file"
    echo "0) Exit"
    echo ""
}

generate_all_keys() {
    log "Generating all cryptographic keys..."

    echo ""
    echo "1. Encryption Key:"
    local encryption_key=$(generate_encryption_key)
    update_env_var "ENCRYPTION_KEY" "$encryption_key"
    echo "   $encryption_key"

    echo ""
    echo "2. JWT Secret:"
    local jwt_secret=$(generate_jwt_secret)
    update_env_var "JWT_SECRET" "$jwt_secret"
    echo "   $jwt_secret"

    echo ""
    echo "3. API Key:"
    local api_key=$(generate_api_key)
    update_env_var "API_KEY" "$api_key"
    echo "   $api_key"

    echo ""
    echo "4. Session Secret:"
    local session_secret=$(generate_session_secret)
    update_env_var "SESSION_SECRET" "$session_secret"
    echo "   $session_secret"

    echo ""
    echo "5. Refresh Token Secret:"
    local refresh_secret=$(generate_refresh_token_secret)
    update_env_var "REFRESH_TOKEN_SECRET" "$refresh_secret"
    echo "   $refresh_secret"

    echo ""
    echo "6. HMAC Secret:"
    local hmac_secret=$(generate_hmac_secret)
    update_env_var "HMAC_SECRET" "$hmac_secret"
    echo "   $hmac_secret"

    echo ""
    echo "7. Database Password:"
    local db_password=$(generate_database_password)
    update_env_var "DB_PASSWORD" "$db_password"
    echo "   $db_password"

    echo ""
    echo "8. OAuth Client Secret:"
    local oauth_secret=$(generate_oauth_client_secret)
    update_env_var "OAUTH_CLIENT_SECRET" "$oauth_secret"
    echo "   $oauth_secret"

    echo ""
    success "All keys generated and saved to .env.local"
}

################################################################################
# Key Rotation
################################################################################

rotate_encryption_key() {
    log "Rotating encryption key..."
    warning "⚠ This will generate a new key. The old one should be kept for decryption of existing data."

    local new_key=$(generate_encryption_key)

    # Keep old key as backup
    local old_key=$(grep "^ENCRYPTION_KEY=" "$ENV_LOCAL" | cut -d= -f2)
    update_env_var "ENCRYPTION_KEY_BACKUP" "$old_key"

    # Update with new key
    update_env_var "ENCRYPTION_KEY" "$new_key"
    update_env_var "ENCRYPTION_KEY_ROTATION_DATE" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

    success "Encryption key rotated"
    echo "Old key saved as ENCRYPTION_KEY_BACKUP for data migration"
}

rotate_jwt_secret() {
    log "Rotating JWT secret..."

    local new_secret=$(generate_jwt_secret)

    # Keep old secret for grace period
    local old_secret=$(grep "^JWT_SECRET=" "$ENV_LOCAL" | cut -d= -f2)
    update_env_var "JWT_SECRET_BACKUP" "$old_secret"

    # Update with new secret
    update_env_var "JWT_SECRET" "$new_secret"
    update_env_var "JWT_SECRET_ROTATION_DATE" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

    success "JWT secret rotated"
    echo "Old secret kept for token validation grace period"
}

################################################################################
# Validation
################################################################################

validate_key_strength() {
    local key=$1
    local min_length=$2

    if [ ${#key} -lt "$min_length" ]; then
        warning "Generated key is shorter than recommended ($min_length bytes)"
        return 1
    fi

    return 0
}

################################################################################
# Reporting
################################################################################

show_key_info() {
    echo ""
    echo "Key Generation Information:"
    echo "============================"
    echo ""
    echo "Key Types Generated:"
    echo "  • Encryption Key: AES-256-GCM (32 bytes)"
    echo "  • JWT Secret: HS256 (32 bytes)"
    echo "  • API Key: Random hex (32 bytes)"
    echo "  • Session Secret: HS256 (32 bytes)"
    echo "  • Refresh Token: HS512 (64 bytes)"
    echo "  • HMAC Secret: HS512 (64 bytes)"
    echo "  • Database Password: Random alphanumeric (32 characters)"
    echo "  • OAuth Secret: Random hex (32 bytes)"
    echo ""
    echo "Security Recommendations:"
    echo "  • Store keys in secure password manager"
    echo "  • Never commit keys to version control"
    echo "  • Rotate keys every 90 days"
    echo "  • Use different keys for each environment"
    echo "  • Keep backups of old keys for data migration"
    echo ""
}

################################################################################
# Main
################################################################################

main() {
    validate_openssl

    # Handle command line arguments
    case "${1:-}" in
        --all)
            validate_env_local
            generate_all_keys
            ;;
        --encryption)
            validate_env_local
            echo ""
            local key=$(generate_encryption_key)
            update_env_var "ENCRYPTION_KEY" "$key"
            echo "Generated: $key"
            ;;
        --jwt)
            validate_env_local
            echo ""
            local secret=$(generate_jwt_secret)
            update_env_var "JWT_SECRET" "$secret"
            echo "Generated: $secret"
            ;;
        --api-key)
            echo ""
            generate_api_key
            ;;
        --session-secret)
            echo ""
            generate_session_secret
            ;;
        --rotate-encryption)
            validate_env_local
            rotate_encryption_key
            ;;
        --rotate-jwt)
            validate_env_local
            rotate_jwt_secret
            ;;
        --export)
            local output_file="${2:-keys-$(date +%s).env}"
            export_keys_to_file "$output_file"
            ;;
        --info)
            show_key_info
            ;;
        --help|-h)
            echo "Usage: $0 [OPTION]"
            echo "Generate cryptographic keys and secrets"
            echo ""
            echo "Options:"
            echo "  --all               Generate all keys"
            echo "  --encryption        Generate encryption key"
            echo "  --jwt               Generate JWT secret"
            echo "  --api-key           Generate API key"
            echo "  --session-secret    Generate session secret"
            echo "  --rotate-encryption Rotate encryption key"
            echo "  --rotate-jwt        Rotate JWT secret"
            echo "  --export [FILE]     Export all keys to file"
            echo "  --info              Show key generation info"
            echo "  -h, --help          Show this help message"
            echo ""
            ;;
        "")
            # Interactive mode
            validate_env_local
            show_key_info

            while true; do
                show_menu
                read -p "Select option: " choice

                case $choice in
                    1) echo ""; generate_encryption_key | xargs -I {} update_env_var "ENCRYPTION_KEY" {} ;;
                    2) echo ""; generate_jwt_secret | xargs -I {} update_env_var "JWT_SECRET" {} ;;
                    3) echo ""; generate_api_key | xargs -I {} update_env_var "API_KEY" {} ;;
                    4) echo ""; generate_session_secret | xargs -I {} update_env_var "SESSION_SECRET" {} ;;
                    5) echo ""; generate_refresh_token_secret | xargs -I {} update_env_var "REFRESH_TOKEN_SECRET" {} ;;
                    6) echo ""; generate_hmac_secret | xargs -I {} update_env_var "HMAC_SECRET" {} ;;
                    7) echo ""; generate_database_password | xargs -I {} update_env_var "DB_PASSWORD" {} ;;
                    8) echo ""; generate_oauth_client_secret | xargs -I {} update_env_var "OAUTH_CLIENT_SECRET" {} ;;
                    9) generate_all_keys ;;
                    10)
                        read -p "Output file [keys-$(date +%s).env]: " output_file
                        output_file=${output_file:-keys-$(date +%s).env}
                        export_keys_to_file "$output_file"
                        ;;
                    0) log "Exiting"; exit 0 ;;
                    *) warning "Invalid option" ;;
                esac

                echo ""
            done
            ;;
        *)
            error "Unknown option: $1. Use --help for usage information."
            ;;
    esac
}

main "$@"
