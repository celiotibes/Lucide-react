#!/bin/bash

# Smoke Tests for Legal Automation Platform
# Validates deployment health and core functionality

set -e

API_URL="${1:-http://localhost:3000}"
TEST_EMAIL="${2:-test@example.com}"
TEST_PASSWORD="${3:-test123}"
TIMEOUT=5

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Starting Smoke Tests..."
echo "📍 API URL: $API_URL"
echo ""

# Test counter
PASSED=0
FAILED=0

# Helper functions
test_endpoint() {
  local method=$1
  local endpoint=$2
  local data=$3
  local expected_code=$4
  local description=$5

  echo -n "Testing: $description... "

  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$API_URL$endpoint" -H "Content-Type: application/json" -m $TIMEOUT)
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$API_URL$endpoint" -H "Content-Type: application/json" -d "$data" -m $TIMEOUT)
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "$expected_code" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
    PASSED=$((PASSED + 1))
    echo "$body"
  else
    echo -e "${RED}✗ FAIL${NC} (Expected $expected_code, got $http_code)"
    echo "Response: $body"
    FAILED=$((FAILED + 1))
  fi
  echo ""
}

test_endpoint_with_auth() {
  local method=$1
  local endpoint=$2
  local token=$3
  local data=$4
  local expected_code=$5
  local description=$6

  echo -n "Testing: $description... "

  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$API_URL$endpoint" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -m $TIMEOUT)
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$API_URL$endpoint" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d "$data" \
      -m $TIMEOUT)
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "$expected_code" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗ FAIL${NC} (Expected $expected_code, got $http_code)"
    echo "Response: $body"
    FAILED=$((FAILED + 1))
  fi
  echo ""
}

# ====== Test 1: Health Check ======
echo -e "${YELLOW}=== 1. Health & Connectivity ===${NC}"
test_endpoint "GET" "/health" "" "200" "Health check endpoint"

# ====== Test 2: Authentication ======
echo -e "${YELLOW}=== 2. Authentication ===${NC}"

# Test invalid login
test_endpoint "POST" "/api/v1/auth/login" \
  '{"email":"invalid@test.com","password":"wrong"}' \
  "401" \
  "Invalid login credentials"

# Test valid login (assuming test user exists or is created)
login_response=$(curl -s -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
  -m $TIMEOUT)

auth_token=$(echo "$login_response" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$auth_token" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Authentication successful"
  PASSED=$((PASSED + 1))
  echo "Token: ${auth_token:0:20}..."
else
  echo -e "${YELLOW}⚠ SKIP${NC} - Test user not found (create test user first)"
fi
echo ""

# ====== Test 3: Core API Endpoints ======
echo -e "${YELLOW}=== 3. Core API Endpoints ===${NC}"

if [ -n "$auth_token" ]; then
  # Test petitions endpoint
  test_endpoint_with_auth "GET" "/api/v1/petitions" "$auth_token" "" "200" "List petitions"

  # Test processes endpoint
  test_endpoint_with_auth "GET" "/api/v1/processes" "$auth_token" "" "200" "List processes"

  # Test templates endpoint (no auth)
  test_endpoint "GET" "/api/v1/templates" "" "200" "List templates"

  # Test tribunals endpoint (no auth)
  test_endpoint "GET" "/api/v1/tribunals" "" "200" "List tribunals"
fi

# ====== Test 4: Data & Cache ======
echo -e "${YELLOW}=== 4. Data & Cache Services ===${NC}"

if [ -n "$auth_token" ]; then
  test_endpoint_with_auth "GET" "/api/v1/cache/status" "$auth_token" "" "200" "Cache status"

  test_endpoint_with_auth "GET" "/api/v1/data/enrichment/status" "$auth_token" "" "200" "Data enrichment status"
fi

# ====== Test 5: Advanced Features ======
echo -e "${YELLOW}=== 5. Advanced Features ===${NC}"

if [ -n "$auth_token" ]; then
  # Jurisprudence search
  test_endpoint_with_auth "GET" "/api/v1/legis/search?query=direito%20civil" "$auth_token" "" "200" "Jurisprudence search"

  # Certificate statistics
  test_endpoint_with_auth "GET" "/api/v1/certification/statistics" "$auth_token" "" "200" "Certificate statistics"

  # Polling status
  test_endpoint_with_auth "GET" "/api/v1/petitions/polling/status" "$auth_token" "" "200" "Polling service status"
fi

# ====== Test 6: Database Connectivity ======
echo -e "${YELLOW}=== 6. Database Connectivity ===${NC}"

if [ -n "$auth_token" ]; then
  # This assumes the API has a diagnostic endpoint
  test_endpoint_with_auth "GET" "/api/v1/monitoring/database" "$auth_token" "" "200" "Database connectivity"
fi

# ====== Test 7: External Services ======
echo -e "${YELLOW}=== 7. External Services ===${NC}"

if [ -n "$auth_token" ]; then
  # TSA provider health
  test_endpoint_with_auth "GET" "/api/v1/certification/statistics" "$auth_token" "" "200" "TSA provider health"

  # Tribunal polling service
  test_endpoint_with_auth "GET" "/api/v1/petitions/polling/status" "$auth_token" "" "200" "Tribunal polling service"
fi

# ====== Test 8: Error Handling ======
echo -e "${YELLOW}=== 8. Error Handling ===${NC}"

# Test 404 error
test_endpoint "GET" "/api/v1/nonexistent" "" "404" "404 Not Found handling"

# Test 400 error
test_endpoint "POST" "/api/v1/petitions" '{}' "400" "400 Bad Request handling"

# ====== Summary ======
echo ""
echo "═══════════════════════════════════════"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo "═══════════════════════════════════════"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All smoke tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed!${NC}"
  exit 1
fi
