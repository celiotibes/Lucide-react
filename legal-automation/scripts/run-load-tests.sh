#!/bin/bash

# Automated Load Testing Script
# Executes small, medium, and high load tests with result analysis

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
API_URL="${1:-http://localhost:3000}"
TEST_TOKEN="${2:-test-token}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESULTS_DIR="$PROJECT_DIR/load-test-results"

# Create results directory
mkdir -p "$RESULTS_DIR"

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Legal Automation - Load Testing Suite           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  API URL: $API_URL"
echo "  Results Directory: $RESULTS_DIR"
echo ""

# Function to run load test
run_load_test() {
  local scenario=$1
  local concurrency=$2
  local duration=$3
  local rps=$4
  local description=$5

  echo -e "${YELLOW}=== Load Test: $scenario ===${NC}"
  echo "  Description: $description"
  echo "  Concurrency: $concurrency users"
  echo "  Duration: $duration seconds"
  echo "  Target RPS: $rps"
  echo ""

  local timestamp=$(date +%Y%m%d_%H%M%S)
  local results_file="$RESULTS_DIR/load-test-${scenario,,}-${timestamp}.json"

  echo "Starting test..."

  if npx ts-node "$PROJECT_DIR/src/scripts/load-test.ts" \
    --concurrency "$concurrency" \
    --duration "$duration" \
    --rps "$rps" \
    --url "$API_URL" \
    --token "$TEST_TOKEN" > "$results_file" 2>&1; then

    echo -e "${GREEN}✓ Test completed${NC}"

    # Parse and display results
    if grep -q "SUMMARY" "$results_file"; then
      echo ""
      grep -A 20 "SUMMARY" "$results_file" | head -20
      echo ""
    fi

    echo "Results saved: $results_file"
  else
    echo -e "${RED}✗ Test failed${NC}"
    return 1
  fi

  echo ""
  echo "Waiting 30 seconds before next test..."
  sleep 30
}

# ========== PRE-TEST CHECKS ==========
echo -e "${YELLOW}=== Pre-Test Validation ===${NC}"

# Check API connectivity
echo -n "Checking API connectivity..."
if curl -s -f "$API_URL/health" > /dev/null 2>&1; then
  echo -e " ${GREEN}✓${NC}"
else
  echo -e " ${RED}✗${NC}"
  echo -e "${RED}Error: Cannot connect to API at $API_URL${NC}"
  exit 1
fi

# Check Node.js
if ! command -v npx &> /dev/null; then
  echo -e "${RED}Error: Node.js/npm is not installed${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Node.js available${NC}"

# Install dependencies
echo "Installing dependencies..."
cd "$PROJECT_DIR"
npm install cli-table3 > /dev/null 2>&1

echo ""

# ========== SCENARIO 1: SMALL LOAD ==========
run_load_test \
  "Small Load" \
  10 \
  60 \
  10 \
  "10 concurrent users, 1 minute duration, 10 RPS"

# ========== SCENARIO 2: MEDIUM LOAD ==========
run_load_test \
  "Medium Load" \
  50 \
  300 \
  50 \
  "50 concurrent users, 5 minute duration, 50 RPS"

# ========== SCENARIO 3: HIGH LOAD ==========
run_load_test \
  "High Load" \
  100 \
  600 \
  100 \
  "100+ concurrent users, 10 minute duration, 100+ RPS"

# ========== RESULTS ANALYSIS ==========
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Load Test Results Summary                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Success criteria
echo -e "${YELLOW}Success Criteria:${NC}"
echo "  ✓ Success Rate > 99%"
echo "  ✓ Avg Response Time < 500ms"
echo "  ✓ P95 Response Time < 1s"
echo "  ✓ P99 Response Time < 2s"
echo "  ✓ No critical errors"
echo ""

# Results files
echo -e "${YELLOW}Results Files:${NC}"
ls -lh "$RESULTS_DIR" | tail -3 | awk '{print "  " $9 " (" $5 ")"}'
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Review detailed results in: $RESULTS_DIR"
echo "  2. Analyze metrics:          grep 'Response Time' load-test-*.json"
echo "  3. Check for errors:         grep 'ERRORS' load-test-*.json"
echo "  4. Compare scenarios:        diff load-test-*-*.json"
echo ""

echo -e "${YELLOW}Troubleshooting:${NC}"
echo "  High latency?    Check: docker stats, database performance"
echo "  High error rate? Check: docker logs api, application errors"
echo "  Memory issues?   Check: docker compose exec api free -h"
echo "  Cache issues?    Check: docker compose exec redis redis-cli info stats"
echo ""

echo -e "${GREEN}✓ Load testing completed!${NC}"
echo ""
echo "Full results saved to: $RESULTS_DIR"
