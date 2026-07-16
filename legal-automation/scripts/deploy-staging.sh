#!/bin/bash

# Automated Staging Deployment Script
# Deploys complete staging environment with all services

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.staging"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.staging.yml"
LOGS_DIR="$PROJECT_DIR/logs"
BACKUPS_DIR="$PROJECT_DIR/backups"

# Ensure required directories exist
mkdir -p "$LOGS_DIR" "$BACKUPS_DIR"

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Legal Automation - Staging Deployment Script       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to print status
print_status() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

# ========== PRE-DEPLOYMENT CHECKS ==========
echo -e "${YELLOW}=== Pre-Deployment Checks ===${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
  print_error "Docker is not installed"
  exit 1
fi
print_status "Docker installed"

# Check Docker daemon
if ! docker info &> /dev/null; then
  print_error "Docker daemon is not running"
  exit 1
fi
print_status "Docker daemon running"

# Check docker compose
if ! docker compose version &> /dev/null; then
  print_error "Docker Compose is not installed"
  exit 1
fi
print_status "Docker Compose available"

# Check required files
if [ ! -f "$COMPOSE_FILE" ]; then
  print_error "docker-compose.staging.yml not found"
  exit 1
fi
print_status "docker-compose.staging.yml exists"

if [ ! -f "$ENV_FILE" ]; then
  print_error ".env.staging not found"
  exit 1
fi
print_status ".env.staging exists"

# Check disk space
available_space=$(df "$PROJECT_DIR" | awk 'NR==2 {print $4}')
if [ "$available_space" -lt 5242880 ]; then # 5GB
  print_warning "Low disk space (${available_space}KB available). Requires at least 5GB"
fi
print_status "Disk space check: ${available_space}KB available"

echo ""

# ========== CONFIGURATION VALIDATION ==========
echo -e "${YELLOW}=== Configuration Validation ===${NC}"

# Check environment variables
required_vars=(
  "DB_PASSWORD"
  "REDIS_PASSWORD"
  "JWT_SECRET"
  "CLAUDE_API_KEY"
  "PROJUDI_USERNAME"
  "PROJUDI_PASSWORD"
)

missing_vars=()
for var in "${required_vars[@]}"; do
  if ! grep -q "^${var}=" "$ENV_FILE"; then
    missing_vars+=("$var")
  fi
done

if [ ${#missing_vars[@]} -gt 0 ]; then
  print_warning "Missing or placeholder values for: ${missing_vars[*]}"
  print_info "Please update .env.staging with real credentials before deployment"
fi

# Validate compose file
print_info "Validating docker-compose configuration..."
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config > /dev/null 2>&1; then
  print_status "docker-compose.staging.yml is valid"
else
  print_error "docker-compose.staging.yml validation failed"
  exit 1
fi

echo ""

# ========== BACKUP EXISTING DATA ==========
echo -e "${YELLOW}=== Backup Existing Data ===${NC}"

# Check if containers already running
if docker compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
  print_warning "Existing containers detected, creating backup..."

  # Backup PostgreSQL
  if docker compose -f "$COMPOSE_FILE" ps postgres | grep -q "Up"; then
    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_file="$BACKUPS_DIR/legal_automation_staging_${timestamp}.sql.gz"

    print_info "Backing up PostgreSQL..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
      pg_dump -U legal_user legal_automation_staging | gzip > "$backup_file"
    print_status "Database backup saved: $backup_file"
  fi

  # Stop existing services
  print_warning "Stopping existing services..."
  docker compose -f "$COMPOSE_FILE" down
  sleep 5
fi

echo ""

# ========== BUILD & START SERVICES ==========
echo -e "${YELLOW}=== Building & Starting Services ===${NC}"

# Pull latest base images
print_info "Pulling base images..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull

# Build images
print_info "Building application image..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache api

# Start services
print_info "Starting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# Wait for services to be healthy
print_info "Waiting for services to become healthy..."
max_attempts=60
attempt=0

while [ $attempt -lt $max_attempts ]; do
  postgres_status=$(docker compose -f "$COMPOSE_FILE" ps postgres 2>/dev/null | grep -c "healthy" || echo "0")
  redis_status=$(docker compose -f "$COMPOSE_FILE" ps redis 2>/dev/null | grep -c "healthy" || echo "0")
  api_status=$(docker compose -f "$COMPOSE_FILE" ps api 2>/dev/null | grep -c "Up" || echo "0")

  if [ "$postgres_status" = "1" ] && [ "$redis_status" = "1" ] && [ "$api_status" = "1" ]; then
    break
  fi

  echo -n "."
  sleep 2
  ((attempt++))
done

echo ""
print_status "All services started"

# Display service status
echo ""
print_info "Service Status:"
docker compose -f "$COMPOSE_FILE" ps

echo ""

# ========== DATABASE MIGRATIONS ==========
echo -e "${YELLOW}=== Database Migrations ===${NC}"

print_info "Running database migrations..."
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api npm run db:migrate; then
  print_status "Database migrations completed successfully"
else
  print_error "Database migrations failed"
  exit 1
fi

echo ""

# ========== VERIFICATION & HEALTH CHECKS ==========
echo -e "${YELLOW}=== Health Checks ===${NC}"

# Test health endpoint
print_info "Testing health endpoint..."
for i in {1..10}; do
  if curl -f -s http://localhost:3000/health > /dev/null 2>&1; then
    print_status "Health check passed"
    break
  elif [ $i -lt 10 ]; then
    echo -n "."
    sleep 2
  else
    print_error "Health check failed after 20 seconds"
    exit 1
  fi
done

# Test database connectivity
print_info "Testing database connectivity..."
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U legal_user -d legal_automation_staging -c "SELECT 1" > /dev/null 2>&1; then
  print_status "Database connectivity verified"
else
  print_error "Database connectivity test failed"
  exit 1
fi

# Test Redis connectivity
print_info "Testing Redis connectivity..."
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T redis \
  redis-cli ping > /dev/null 2>&1; then
  print_status "Redis connectivity verified"
else
  print_error "Redis connectivity test failed"
  exit 1
fi

echo ""

# ========== SMOKE TESTS ==========
echo -e "${YELLOW}=== Running Smoke Tests ===${NC}"

if [ -f "$PROJECT_DIR/scripts/smoke-tests.sh" ]; then
  bash "$PROJECT_DIR/scripts/smoke-tests.sh" http://localhost:3000
else
  print_warning "smoke-tests.sh not found, skipping smoke tests"
fi

echo ""

# ========== DEPLOYMENT SUMMARY ==========
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Staging Deployment Completed Successfully!         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"

echo ""
print_status "All services deployed and healthy"
echo ""
echo -e "${YELLOW}Services Available:${NC}"
echo "  📋 API:           http://localhost:3000"
echo "  🩺 Health Check:  http://localhost:3000/health"
echo "  📊 GraphQL IDE:   http://localhost:3000/graphql"
echo "  🔍 Search:        http://localhost:3000/api/v1/search"
echo "  📈 Analytics:     http://localhost:3000/api/v1/analytics/dashboard"
echo "  🔐 Certification: http://localhost:3000/api/v1/certification/statistics"

echo ""
echo -e "${YELLOW}Database Connections:${NC}"
echo "  PostgreSQL: postgres://legal_user@localhost:5433/legal_automation_staging"
echo "  Redis:      redis://:***@localhost:6380"
echo "  Elasticsearch: http://localhost:9201"

echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Review logs:        docker compose -f docker-compose.staging.yml logs -f api"
echo "  2. Run load tests:     npx ts-node src/scripts/load-test.ts --concurrency 100"
echo "  3. Check metrics:      curl http://localhost:3000/api/v1/monitoring/metrics"
echo "  4. View database:      docker compose -f docker-compose.staging.yml exec postgres psql -U legal_user -d legal_automation_staging"

echo ""
echo -e "${YELLOW}Documentation:${NC}"
echo "  📚 Deployment Guide:   /docs/DEPLOYMENT.md"
echo "  📋 Roadmap:            /docs/ROADMAP_STAGE2.md"
echo "  ✅ Checklist:          /STAGING_DEPLOYMENT_CHECKLIST.md"

echo ""
echo -e "${GREEN}✓ Staging environment is ready for testing!${NC}"
