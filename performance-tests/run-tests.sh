#!/bin/bash

# Performance Testing Script
# Runs comprehensive load tests and generates reports

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${TEST_DIR}/results"
TARGET_URL="${1:-http://localhost:3000}"
TEST_TYPE="${2:-load}"

# Create results directory
mkdir -p "$RESULTS_DIR"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Performance Testing Suite${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Target URL: ${YELLOW}${TARGET_URL}${NC}"
echo -e "Test Type:  ${YELLOW}${TEST_TYPE}${NC}"
echo -e "Results:    ${YELLOW}${RESULTS_DIR}${NC}"
echo ""

# Check if Artillery is installed
if ! command -v artillery &> /dev/null; then
    echo -e "${RED}❌ Artillery not installed${NC}"
    echo "Install with: npm install -g artillery"
    exit 1
fi

echo -e "${GREEN}✓ Artillery found${NC}"
artillery --version
echo ""

# Function to run test
run_test() {
    local test_name=$1
    local config_file=$2
    local timestamp=$(date +%s)
    local output_file="${RESULTS_DIR}/${test_name}-${timestamp}.json"
    
    echo -e "${YELLOW}🚀 Starting ${test_name}...${NC}"
    echo ""
    
    artillery run "${TEST_DIR}/${config_file}" \
        --target "${TARGET_URL}" \
        --output "${output_file}" \
        --quiet
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ ${test_name} completed${NC}"
        echo -e "${YELLOW}📊 Generating report...${NC}"
        artillery report "${output_file}" --output "${output_file%.json}.html"
        echo -e "${GREEN}✓ Report saved to: ${output_file%.json}.html${NC}"
        echo ""
    else
        echo -e "${RED}❌ ${test_name} failed${NC}"
        return 1
    fi
}

# Run selected test
case $TEST_TYPE in
    load)
        run_test "Load Test" "load-test.yml"
        ;;
    stress)
        run_test "Stress Test" "stress-test.yml"
        ;;
    all)
        run_test "Load Test" "load-test.yml"
        run_test "Stress Test" "stress-test.yml"
        ;;
    *)
        echo -e "${RED}❌ Unknown test type: ${TEST_TYPE}${NC}"
        echo "Usage: ./run-tests.sh [url] [load|stress|all]"
        exit 1
        ;;
esac

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Performance Testing Complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Results available in: ${YELLOW}${RESULTS_DIR}${NC}"
echo ""
