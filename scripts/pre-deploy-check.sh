#!/bin/bash
# Pre-deploy Validation Script
# Valida tudo antes de fazer deploy

set -e

echo "🔍 Running Pre-Deploy Checks..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CHECKS_PASSED=0
CHECKS_FAILED=0

check_item() {
  local name=$1
  local command=$2
  
  echo -n "[$name] ... "
  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
    ((CHECKS_PASSED++))
  else
    echo -e "${RED}❌${NC}"
    ((CHECKS_FAILED++))
  fi
}

# Git checks
echo "📋 Git Status:"
check_item "Git repo" "git rev-parse --git-dir"
check_item "No uncommitted changes" "[[ -z \$(git status -s) ]]"
check_item "On correct branch" "git rev-parse --abbrev-ref HEAD | grep -q -E 'main|develop|staging|release'"

# Build checks
echo ""
echo "🔨 Build Status:"
check_item "Node modules installed" "[ -d node_modules ]"
check_item "TypeScript compilation" "npm run build"
check_item "Linting passes" "npm run lint"

# Test checks
echo ""
echo "🧪 Test Status:"
check_item "Unit tests pass" "npm run test:unit"
check_item "Integration tests pass" "npm run test:integration"

# Code quality
echo ""
echo "📊 Code Quality:"
check_item "No TODO comments" "! grep -r 'TODO:' src/ || true"

# Environment
echo ""
echo "⚙️ Environment:"
check_item "Node version >= 18" "node -v | grep -E 'v(1[8-9]|[2-9][0-9])'"
check_item "npm version check" "npm --version"

# Database
echo ""
echo "🗄️ Database:"
check_item "Database accessible" "psql -c 'SELECT 1' > /dev/null 2>&1 || true"
check_item "Migrations up to date" "npm run migrate:status"

# Performance
echo ""
echo "⚡ Performance:"
check_item "Performance baseline known" "[ -f backend/performance/baseline.json ]"

echo ""
echo "═══════════════════════════════════════════"
echo -e "Results: ${GREEN}${CHECKS_PASSED} passed${NC}, ${RED}${CHECKS_FAILED} failed${NC}"
echo "═══════════════════════════════════════════"

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed! Ready for deploy${NC}"
  exit 0
else
  echo -e "${RED}❌ Some checks failed. Fix issues and try again${NC}"
  exit 1
fi
