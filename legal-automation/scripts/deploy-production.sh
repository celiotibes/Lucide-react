#!/bin/bash

###############################################################################
# Production Deployment Script
# Legal Automation Tool - eProc & Projudi Integration
#
# Usage: ./deploy-production.sh [version] [environment]
# Example: ./deploy-production.sh 1.0.0 production
###############################################################################

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VERSION="${1:-}"
ENVIRONMENT="${2:-production}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REGISTRY="${DOCKER_REGISTRY:-registry.yourdomain.com}"
IMAGE_NAME="legal-automation"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

###############################################################################
# Utility Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

fail_with_error() {
    log_error "$1"
    exit 1
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        fail_with_error "$1 is required but not installed"
    fi
}

###############################################################################
# Pre-deployment Checks
###############################################################################

pre_deployment_checks() {
    log_info "Running pre-deployment checks..."

    # Check required commands
    check_command "docker"
    check_command "git"
    check_command "npm"

    # Check if version is provided
    if [ -z "$VERSION" ]; then
        fail_with_error "Version is required. Usage: $0 <version> [environment]"
    fi

    # Check git status
    if [ -n "$(git -C "$PROJECT_DIR" status -s)" ]; then
        fail_with_error "Git working directory is not clean. Commit changes first."
    fi

    # Check if version tag exists
    if ! git -C "$PROJECT_DIR" rev-parse "$VERSION" &> /dev/null; then
        log_warning "Version tag $VERSION does not exist in git"
    fi

    # Check environment file
    if [ ! -f "$PROJECT_DIR/.env.$ENVIRONMENT" ]; then
        fail_with_error "Environment file .env.$ENVIRONMENT not found"
    fi

    log_success "Pre-deployment checks passed"
}

###############################################################################
# Code Quality Checks
###############################################################################

code_quality_checks() {
    log_info "Running code quality checks..."

    cd "$PROJECT_DIR"

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm ci
    fi

    # Run linting
    log_info "Running ESLint..."
    npm run lint || fail_with_error "Linting failed"

    # Run TypeScript compilation
    log_info "Compiling TypeScript..."
    npm run build || fail_with_error "TypeScript compilation failed"

    # Run tests
    log_info "Running tests..."
    npm run test || fail_with_error "Tests failed"

    # Security audit
    log_info "Running security audit..."
    npm audit --audit-level=moderate || log_warning "Security vulnerabilities found (non-critical)"

    log_success "Code quality checks passed"
}

###############################################################################
# Build Docker Image
###############################################################################

build_docker_image() {
    log_info "Building Docker image..."

    cd "$PROJECT_DIR"

    local image_tag="$REGISTRY/$IMAGE_NAME:$VERSION"
    local image_latest="$REGISTRY/$IMAGE_NAME:latest"

    # Build image
    docker build \
        --tag "$image_tag" \
        --tag "$image_latest" \
        --build-arg NODE_ENV="$ENVIRONMENT" \
        --label "version=$VERSION" \
        --label "built_at=$TIMESTAMP" \
        --label "git_commit=$(git rev-parse HEAD)" \
        .

    log_success "Docker image built: $image_tag"
}

###############################################################################
# Push Docker Image
###############################################################################

push_docker_image() {
    log_info "Pushing Docker image to registry..."

    local image_tag="$REGISTRY/$IMAGE_NAME:$VERSION"
    local image_latest="$REGISTRY/$IMAGE_NAME:latest"

    # Login to Docker registry (requires credentials)
    # docker login "$REGISTRY"

    docker push "$image_tag"
    docker push "$image_latest"

    log_success "Docker image pushed to registry"
}

###############################################################################
# Database Migrations
###############################################################################

run_database_migrations() {
    log_info "Running database migrations..."

    cd "$PROJECT_DIR"

    # Set environment
    export "$(grep -v '^#' .env."$ENVIRONMENT" | xargs)"

    # Run migrations
    npm run migrate || fail_with_error "Database migrations failed"

    log_success "Database migrations completed"
}

###############################################################################
# Backup Current State
###############################################################################

backup_current_state() {
    log_info "Backing up current state..."

    local backup_dir="backups"
    mkdir -p "$backup_dir"

    # Backup database
    local db_backup="$backup_dir/db_backup_$TIMESTAMP.sql.gz"
    if command -v pg_dump &> /dev/null; then
        pg_dump "$DATABASE_URL" | gzip > "$db_backup"
        log_success "Database backed up: $db_backup"
    fi

    # Backup configuration
    if [ -f ".env.$ENVIRONMENT" ]; then
        cp ".env.$ENVIRONMENT" "$backup_dir/env_backup_$TIMESTAMP"
        log_success "Configuration backed up"
    fi

    log_success "Backup completed"
}

###############################################################################
# Deploy to Kubernetes
###############################################################################

deploy_to_kubernetes() {
    log_info "Deploying to Kubernetes..."

    # Update image in deployment
    kubectl set image deployment/legal-automation \
        "legal-automation=$REGISTRY/$IMAGE_NAME:$VERSION" \
        -n "$ENVIRONMENT" || fail_with_error "Kubernetes deployment failed"

    # Wait for rollout
    log_info "Waiting for deployment rollout..."
    kubectl rollout status deployment/legal-automation \
        -n "$ENVIRONMENT" \
        --timeout=5m || fail_with_error "Deployment rollout failed"

    log_success "Kubernetes deployment completed"
}

###############################################################################
# Deploy with Docker Compose
###############################################################################

deploy_with_docker_compose() {
    log_info "Deploying with Docker Compose..."

    cd "$PROJECT_DIR"

    # Pull latest images
    docker-compose -f "docker-compose.$ENVIRONMENT.yml" pull

    # Start services
    docker-compose -f "docker-compose.$ENVIRONMENT.yml" up -d

    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 10

    # Check health
    for i in {1..30}; do
        if curl -f http://localhost:3000/health > /dev/null 2>&1; then
            log_success "Application is healthy"
            return 0
        fi
        log_info "Health check attempt $i/30..."
        sleep 2
    done

    fail_with_error "Application health check failed after 60 seconds"
}

###############################################################################
# Post-deployment Verification
###############################################################################

post_deployment_verification() {
    log_info "Running post-deployment verification..."

    # Wait a moment for services to stabilize
    sleep 5

    # Health check
    log_info "Checking application health..."
    if ! curl -f http://localhost:3000/health; then
        fail_with_error "Application health check failed"
    fi

    # Check database connection
    log_info "Checking database connection..."
    if ! npm run test:db > /dev/null 2>&1; then
        log_warning "Database connection check returned warning"
    fi

    # Check critical services
    log_info "Checking critical services..."
    local status=$(curl -s http://localhost:3000/health | grep -o '"status":"[^"]*"')
    log_success "Service status: $status"

    log_success "Post-deployment verification completed"
}

###############################################################################
# Smoke Tests
###############################################################################

run_smoke_tests() {
    log_info "Running smoke tests..."

    cd "$PROJECT_DIR"

    # Test critical endpoints
    local endpoints=(
        "/health"
        "/api/v1/auth/status"
        "/api-docs"
    )

    for endpoint in "${endpoints[@]}"; do
        log_info "Testing endpoint: $endpoint"
        if curl -f http://localhost:3000"$endpoint" > /dev/null 2>&1; then
            log_success "Endpoint $endpoint is working"
        else
            log_warning "Endpoint $endpoint returned error"
        fi
    done

    log_success "Smoke tests completed"
}

###############################################################################
# Rollback Procedure
###############################################################################

rollback_deployment() {
    log_warning "Rolling back deployment..."

    if command -v kubectl &> /dev/null; then
        kubectl rollout undo deployment/legal-automation \
            -n "$ENVIRONMENT" || log_warning "Could not rollback Kubernetes deployment"
    fi

    # Restore from backup if needed
    local latest_backup=$(ls -t backups/db_backup_*.sql.gz 2>/dev/null | head -1)
    if [ -n "$latest_backup" ]; then
        log_info "Database backup available: $latest_backup"
        log_info "To restore, run: gunzip < $latest_backup | psql \$DATABASE_URL"
    fi

    log_success "Rollback procedure executed"
}

###############################################################################
# Main Deployment Flow
###############################################################################

main() {
    log_info "============================================"
    log_info "Legal Automation Tool - Production Deployment"
    log_info "============================================"
    log_info "Version: $VERSION"
    log_info "Environment: $ENVIRONMENT"
    log_info "Timestamp: $TIMESTAMP"
    log_info ""

    # Run deployment steps
    pre_deployment_checks
    code_quality_checks
    build_docker_image
    push_docker_image
    backup_current_state
    run_database_migrations

    # Choose deployment method
    if command -v kubectl &> /dev/null; then
        deploy_to_kubernetes
    else
        deploy_with_docker_compose
    fi

    post_deployment_verification
    run_smoke_tests

    log_info "============================================"
    log_success "Deployment completed successfully!"
    log_info "============================================"
    log_info ""
    log_info "Next steps:"
    log_info "1. Monitor application logs for 5 minutes"
    log_info "2. Run integration tests"
    log_info "3. Verify database integrity"
    log_info "4. Update monitoring dashboards"
    log_info ""
    log_info "Rollback command (if needed):"
    log_info "./scripts/deploy-production.sh rollback"
}

# Handle rollback
if [ "$VERSION" = "rollback" ]; then
    rollback_deployment
    exit 0
fi

# Execute main deployment
main "$@"
