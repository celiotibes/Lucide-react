#!/bin/bash

# Performance Test Execution Script
# Runs all 5 k6 performance test scenarios and collects baseline metrics
# Usage: ./run-performance-tests.sh [staging-url] [optional-auth-token]

set -e

# Configuration
API_URL="${1:-http://localhost:3000}"
AUTH_TOKEN="${2:-}"
RESULTS_DIR="./performance-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
K6_IMAGE="grafana/k6:latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create results directory
mkdir -p "$RESULTS_DIR"

echo -e "${YELLOW}===============================================${NC}"
echo -e "${YELLOW}Performance Baseline Test Execution${NC}"
echo -e "${YELLOW}===============================================${NC}"
echo "API Target: $API_URL"
echo "Results Directory: $RESULTS_DIR"
echo "Timestamp: $TIMESTAMP"
echo ""

# Verify k6 availability
if ! command -v k6 &> /dev/null && ! command -v docker &> /dev/null; then
    echo -e "${RED}ERROR: Neither k6 nor docker found. Install k6 or docker to run tests.${NC}"
    exit 1
fi

# Function to run a single test
run_test() {
    local test_name=$1
    local test_file=$2
    local test_number=$3
    local total_tests=$4

    echo -e "${YELLOW}[${test_number}/${total_tests}] Running: $test_name${NC}"
    echo "File: $test_file"

    # Create output filenames
    local json_output="${RESULTS_DIR}/${test_name}_${TIMESTAMP}.json"
    local summary_output="${RESULTS_DIR}/${test_name}_${TIMESTAMP}_summary.json"
    local csv_output="${RESULTS_DIR}/${test_name}_${TIMESTAMP}.csv"

    # Run test with k6 (using docker if k6 not installed)
    local k6_cmd="k6 run --vus 1 --duration 30s"

    if command -v k6 &> /dev/null; then
        # Use local k6
        eval "k6 run \
            --out json=$json_output \
            --summary-export=$summary_output \
            -e API_URL=$API_URL \
            -e AUTH_TOKEN=$AUTH_TOKEN \
            $test_file"
    else
        # Use docker
        echo "Using Docker to run k6..."
        docker run --rm --network host \
            -e API_URL="$API_URL" \
            -e AUTH_TOKEN="$AUTH_TOKEN" \
            -v "$(pwd)/performance-tests:/scripts" \
            -v "$(pwd)/$RESULTS_DIR:/results" \
            "$K6_IMAGE" run \
            --out json=/results/$(basename "$json_output") \
            --summary-export=/results/$(basename "$summary_output") \
            "/scripts/$(basename "$test_file")"
    fi

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $test_name PASSED${NC}"
    else
        echo -e "${RED}✗ $test_name FAILED${NC}"
        return 1
    fi

    echo ""
}

# Array of tests to run
declare -a tests=(
    "auth-load:performance-tests/auth-load.js"
    "calendar-api:performance-tests/calendar-api.js"
    "webhook-simulation:performance-tests/webhook-simulation.js"
    "pricing-engine:performance-tests/pricing-engine.js"
    "concurrent-users:performance-tests/concurrent-users.js"
)

total_tests=${#tests[@]}
failed_tests=0

# Run all tests
for ((i=0; i<$total_tests; i++)); do
    test_spec="${tests[$i]}"
    test_name="${test_spec%%:*}"
    test_file="${test_spec##*:}"
    test_number=$((i+1))

    if ! run_test "$test_name" "$test_file" "$test_number" "$total_tests"; then
        ((failed_tests++))
    fi

    # Brief pause between tests
    sleep 2
done

echo ""
echo -e "${YELLOW}===============================================${NC}"
echo -e "${YELLOW}Test Execution Complete${NC}"
echo -e "${YELLOW}===============================================${NC}"
echo "Total Tests: $total_tests"
echo "Passed: $((total_tests - failed_tests))"
echo "Failed: $failed_tests"
echo ""

# Generate summary report
echo -e "${YELLOW}Generating Summary Report...${NC}"
cat > "${RESULTS_DIR}/SUMMARY_${TIMESTAMP}.txt" << EOF
Performance Baseline Test Execution Summary
Date: $TIMESTAMP
API Target: $API_URL

Test Results:
$(for test_spec in "${tests[@]}"; do
    test_name="${test_spec%%:*}"
    summary_file="${RESULTS_DIR}/${test_name}_${TIMESTAMP}_summary.json"
    if [ -f "$summary_file" ]; then
        echo "✓ $test_name"
    else
        echo "✗ $test_name"
    fi
done)

Results Directory: $RESULTS_DIR

Next Steps:
1. Review individual test results in results directory
2. Analyze metrics for bottlenecks
3. Compare against success criteria
4. Document findings in PERFORMANCE_BASELINE_RESULTS.md
5. Proceed to Phase 4: Security Audit Phase 2

For detailed analysis:
- JSON results: ${RESULTS_DIR}/*_${TIMESTAMP}.json
- Summary files: ${RESULTS_DIR}/*_${TIMESTAMP}_summary.json
- CSV exports: ${RESULTS_DIR}/*_${TIMESTAMP}.csv
EOF

echo -e "${GREEN}Summary saved to: ${RESULTS_DIR}/SUMMARY_${TIMESTAMP}.txt${NC}"
echo ""

if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}All tests executed successfully!${NC}"
    exit 0
else
    echo -e "${RED}$failed_tests test(s) failed.${NC}"
    exit 1
fi
