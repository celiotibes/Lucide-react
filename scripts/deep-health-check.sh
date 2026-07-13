#!/bin/bash
# Deep Health Check - Verificação completa de saúde

set -e

echo "🏥 Deep Health Check - Sistema de Gerenciamento de Aluguéis"
echo "=========================================================="
echo ""

API_URL="${API_URL:-http://localhost:3000}"
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-rental_user}"
DB_NAME="${DB_NAME:-rental_sync}"
REDIS_HOST="${REDIS_HOST:-localhost}"

CHECKS_PASSED=0
CHECKS_FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

check_status() {
  local name=$1
  local command=$2
  
  echo -n "$name ... "
  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
    ((CHECKS_PASSED++))
    return 0
  else
    echo -e "${RED}❌${NC}"
    ((CHECKS_FAILED++))
    return 1
  fi
}

# API Health
echo -e "${BLUE}1️⃣ API Service${NC}"
check_status "Liveness probe (/api/health)" "curl -s -f $API_URL/api/health > /dev/null"
check_status "Readiness probe (/api/health/ready)" "curl -s -f $API_URL/api/health/ready > /dev/null"

# Pegar status detalhado
HEALTH=$(curl -s $API_URL/api/health/detailed 2>/dev/null || echo '{}')
echo "  Status: $(echo $HEALTH | jq -r '.status // "unknown"')"

# Database
echo ""
echo -e "${BLUE}2️⃣ PostgreSQL Database${NC}"
if check_status "Database connectivity" "psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c 'SELECT 1'"; then
  DB_SIZE=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT pg_size_pretty(pg_database_size(current_database()))" 2>/dev/null || echo "unknown")
  echo "  Database size: $DB_SIZE"
  
  CONNECTIONS=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()" 2>/dev/null || echo "unknown")
  echo "  Active connections: $CONNECTIONS"
fi

# Redis
echo ""
echo -e "${BLUE}3️⃣ Redis Cache${NC}"
if check_status "Redis connectivity" "redis-cli -h $REDIS_HOST ping > /dev/null"; then
  REDIS_INFO=$(redis-cli -h $REDIS_HOST info stats 2>/dev/null || echo "")
  MEMORY=$(echo "$REDIS_INFO" | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
  echo "  Memory usage: $MEMORY"
fi

# Application
echo ""
echo -e "${BLUE}4️⃣ Application Metrics${NC}"
if [ ! -z "$HEALTH" ] && [ "$HEALTH" != "{}" ]; then
  UPTIME=$(echo $HEALTH | jq -r '.uptime // "unknown"')
  VERSION=$(echo $HEALTH | jq -r '.version // "unknown"')
  echo "  Uptime: ${UPTIME}s"
  echo "  Version: $VERSION"
fi

# Summary
echo ""
echo "════════════════════════════════════════════"
echo -e "Results: ${GREEN}${CHECKS_PASSED} passed${NC}, ${RED}${CHECKS_FAILED} failed${NC}"
echo "════════════════════════════════════════════"

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ System is healthy!${NC}"
  exit 0
else
  echo -e "${RED}❌ System has issues${NC}"
  exit 1
fi
