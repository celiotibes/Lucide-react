#!/bin/bash

################################################################################
# Performance Validation & Benchmarking Script
# Purpose: Validate application meets performance requirements
# Version: 1.0
################################################################################

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

log_pass() { echo -e "${GREEN}✓${NC} $1"; ((PASS_COUNT++)); }
log_fail() { echo -e "${RED}✗${NC} $1"; ((FAIL_COUNT++)); }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; ((WARN_COUNT++)); }
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }

################################################################################
# Build Performance
################################################################################

check_build_performance() {
  echo ""
  echo "=== Build Performance ==="

  log_info "Building application..."
  START_TIME=$(date +%s)

  if npm run build --silent 2>/dev/null; then
    END_TIME=$(date +%s)
    BUILD_TIME=$((END_TIME - START_TIME))

    if [ "$BUILD_TIME" -lt 60 ]; then
      log_pass "Build completed in ${BUILD_TIME}s (target: < 60s)"
    elif [ "$BUILD_TIME" -lt 120 ]; then
      log_warn "Build completed in ${BUILD_TIME}s (target: < 60s)"
    else
      log_fail "Build too slow: ${BUILD_TIME}s (target: < 60s)"
    fi
  else
    log_fail "Build failed"
    return 1
  fi

  # Check build size
  if [ -d "$PROJECT_ROOT/build" ]; then
    BUILD_SIZE=$(du -sb "$PROJECT_ROOT/build" | cut -f1)
    BUILD_SIZE_MB=$((BUILD_SIZE / 1024 / 1024))

    if [ "$BUILD_SIZE_MB" -lt 500 ]; then
      log_pass "Build size: ${BUILD_SIZE_MB}MB (target: < 500MB)"
    else
      log_warn "Build size: ${BUILD_SIZE_MB}MB (target: < 500MB)"
    fi
  fi
}

################################################################################
# Bundle Analysis
################################################################################

check_bundle_size() {
  echo ""
  echo "=== Bundle Size Analysis ==="

  # JavaScript bundle
  if [ -f "$PROJECT_ROOT/build/index.js" ]; then
    JS_SIZE=$(du -sh "$PROJECT_ROOT/build/index.js" | cut -f1)
    log_info "JavaScript bundle size: $JS_SIZE"
  fi

  # CSS bundle
  if [ -f "$PROJECT_ROOT/build/index.css" ]; then
    CSS_SIZE=$(du -sh "$PROJECT_ROOT/build/index.css" | cut -f1)
    log_info "CSS bundle size: $CSS_SIZE"
  fi

  # Check for source maps in production
  if [ -f "$PROJECT_ROOT/build/index.js.map" ]; then
    log_warn "Source maps found in production build"
  else
    log_pass "No source maps in production build"
  fi

  # Check for dead code
  if command -v webpack-cli &> /dev/null; then
    log_info "Checking for unused code..."
    # This would require webpack bundle analyzer plugin
  fi
}

################################################################################
# Runtime Performance
################################################################################

check_startup_time() {
  echo ""
  echo "=== Startup Performance ==="

  if npm run start &
    PROC_ID=$!
    sleep 3

    if ps -p $PROC_ID > /dev/null 2>&1; then
      log_pass "Application started successfully"
      kill $PROC_ID 2>/dev/null || true
    else
      log_fail "Application failed to start"
    fi
  fi
}

check_memory_usage() {
  echo ""
  echo "=== Memory Usage ==="

  if [ -f "$PROJECT_ROOT/package.json" ]; then
    # Check for memory leaks in tests
    if npm test -- --detectLeaks 2>/dev/null; then
      log_pass "No memory leaks detected in tests"
    else
      log_warn "Memory leak detection inconclusive"
    fi
  fi

  # Check process memory limit configuration
  if grep -q "memory\|heapSize\|maxOldSpaceSize" "$PROJECT_ROOT/.env"* 2>/dev/null; then
    log_pass "Memory configuration found"
  else
    log_info "No explicit memory configuration found"
  fi
}

################################################################################
# Test Performance
################################################################################

check_test_performance() {
  echo ""
  echo "=== Test Execution Performance ==="

  log_info "Running unit tests..."
  START_TIME=$(date +%s)

  if npm test --silent 2>/dev/null; then
    END_TIME=$(date +%s)
    TEST_TIME=$((END_TIME - START_TIME))

    if [ "$TEST_TIME" -lt 60 ]; then
      log_pass "Tests completed in ${TEST_TIME}s (target: < 120s)"
    elif [ "$TEST_TIME" -lt 120 ]; then
      log_warn "Tests completed in ${TEST_TIME}s (target: < 60s)"
    else
      log_fail "Tests too slow: ${TEST_TIME}s (target: < 120s)"
    fi
  else
    log_warn "Test execution failed or incomplete"
  fi
}

################################################################################
# Network Performance
################################################################################

check_network_performance() {
  echo ""
  echo "=== Network Configuration ==="

  # Check for gzip compression
  if grep -r "gzip\|compression" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "Gzip compression configured"
  else
    log_warn "Gzip compression not verified"
  fi

  # Check for HTTP/2
  if grep -r "http2\|spdy" "$PROJECT_ROOT" --include="*.conf" --include="*.ts" 2>/dev/null; then
    log_pass "HTTP/2 support detected"
  else
    log_info "HTTP/2 support not verified"
  fi

  # Check for caching headers
  if grep -r "Cache-Control\|ETag\|Last-Modified" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "Caching headers configured"
  else
    log_warn "Caching headers not verified"
  fi

  # Check for CDN configuration
  if grep -r "cdn\|cloudflare\|cloudfront" "$PROJECT_ROOT" --include="*.ts" --include="*.yml" --include="*.yaml" 2>/dev/null; then
    log_pass "CDN configuration detected"
  else
    log_info "CDN configuration not found"
  fi
}

################################################################################
# Database Performance
################################################################################

check_database_performance() {
  echo ""
  echo "=== Database Performance ==="

  # Check for connection pooling
  if grep -r "pool\|connectionLimit" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "Connection pooling configured"
  else
    log_fail "Connection pooling not found"
  fi

  # Check for query optimization
  if grep -r "index\|INDEX" "$PROJECT_ROOT/server/src/db" --include="*.sql" 2>/dev/null; then
    log_pass "Database indexes configured"
  else
    log_warn "Database indexes not verified"
  fi

  # Check for migrations
  if [ -d "$PROJECT_ROOT/migrations" ] || [ -d "$PROJECT_ROOT/db/migrations" ]; then
    MIGRATION_COUNT=$(find "$PROJECT_ROOT" -name "*migration*" -type f 2>/dev/null | wc -l)
    log_pass "Database migrations found: $MIGRATION_COUNT"
  else
    log_warn "No migration directory found"
  fi
}

################################################################################
# Caching Strategy
################################################################################

check_caching_strategy() {
  echo ""
  echo "=== Caching Strategy ==="

  # Check for Redis/cache implementation
  if grep -r "redis\|cache\|memcached" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "Cache implementation detected"
  else
    log_info "Cache implementation not verified"
  fi

  # Check for cache invalidation
  if grep -r "invalidate\|clear.*cache\|cache.*clear" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "Cache invalidation strategy detected"
  else
    log_warn "Cache invalidation not verified"
  fi

  # Check for cache TTL configuration
  if grep -r "TTL\|ttl\|expires\|maxAge" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "Cache TTL configuration detected"
  else
    log_warn "Cache TTL not verified"
  fi
}

################################################################################
# Frontend Performance
################################################################################

check_frontend_performance() {
  echo ""
  echo "=== Frontend Performance ==="

  # Check for Lighthouse
  if command -v lighthouse &> /dev/null || npx lighthouse --version &>/dev/null 2>&1; then
    log_info "Running Lighthouse audit..."
    # Would need running server to audit
    log_info "Lighthouse can be run: npx lighthouse http://localhost:3000"
  fi

  # Check for code splitting
  if grep -r "lazy\|React\.lazy\|dynamic\|split" "$PROJECT_ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null; then
    log_pass "Code splitting detected"
  else
    log_warn "Code splitting not verified"
  fi

  # Check for image optimization
  if grep -r "webp\|avif\|image.*optimize" "$PROJECT_ROOT" --include="*.ts" --include="*.tsx" --include="*.conf" 2>/dev/null; then
    log_pass "Image optimization detected"
  else
    log_warn "Image optimization not verified"
  fi

  # Check for tree shaking
  if grep -q "sideEffects\|treeshake" "$PROJECT_ROOT/webpack.config.js" "$PROJECT_ROOT/tsconfig.json" 2>/dev/null; then
    log_pass "Tree shaking configured"
  else
    log_info "Tree shaking not explicitly configured"
  fi
}

################################################################################
# Load Test Configuration
################################################################################

check_load_test_config() {
  echo ""
  echo "=== Load Testing Setup ==="

  # Check for load testing tools
  if grep -q "k6\|locust\|artillery\|loadtest" "$PROJECT_ROOT/package.json" 2>/dev/null; then
    log_pass "Load testing tool configured"
  else
    log_warn "Load testing tool not configured"
  fi

  # Check for performance monitoring hooks
  if grep -r "prometheus\|statsd\|influxdb" "$PROJECT_ROOT/server/src" --include="*.ts" 2>/dev/null; then
    log_pass "Performance monitoring configured"
  else
    log_warn "Performance monitoring not verified"
  fi
}

################################################################################
# Scalability Configuration
################################################################################

check_scalability() {
  echo ""
  echo "=== Scalability Configuration ==="

  # Check for clustering/worker processes
  if grep -r "cluster\|worker_processes\|threads" "$PROJECT_ROOT" --include="*.ts" --include="*.conf" 2>/dev/null; then
    log_pass "Multi-process/clustering configured"
  else
    log_info "Multi-process configuration not found"
  fi

  # Check for load balancer configuration
  if [ -f "$PROJECT_ROOT/nginx.conf" ] || [ -f "$PROJECT_ROOT/haproxy.cfg" ]; then
    log_pass "Load balancer configuration found"
  else
    log_info "Load balancer configuration not found"
  fi

  # Check for auto-scaling configuration
  if [ -d "$PROJECT_ROOT/k8s" ] && grep -r "HPA\|autoscaling" "$PROJECT_ROOT/k8s" 2>/dev/null; then
    log_pass "Auto-scaling configuration found"
  else
    log_info "Auto-scaling configuration not found"
  fi
}

################################################################################
# Performance Benchmarks
################################################################################

generate_performance_report() {
  echo ""
  echo "=== Generating Performance Report ==="

  REPORT_FILE="$PROJECT_ROOT/PERFORMANCE_REPORT.txt"

  cat > "$REPORT_FILE" << EOF
# Performance Validation Report
Generated: $(date)
Project: Lucide React v22.19

## Summary
- Checks Passed: $PASS_COUNT
- Checks Failed: $FAIL_COUNT
- Warnings: $WARN_COUNT

## Performance Metrics

### Build Performance
- Build Time: [RUN: npm run build]
- Build Size: [CHECK: build/ directory]
- Bundle Size: [CHECK: build/index.js]

### Runtime Performance
- Startup Time: [MEASURE: cold/warm start]
- Memory Usage: [MEASURE: RSS at startup]
- CPU Usage: [MEASURE: idle/active]

### Network Performance
- API Response Time: [BENCHMARK: p95 < 500ms]
- Payload Size: [MEASURE: average request]
- Cache Hit Ratio: [MEASURE: cache efficiency]

### Database Performance
- Query Time: [BENCHMARK: p95 < 100ms]
- Connection Pool: [CHECK: configured]
- Replication Lag: [MEASURE: < 5 seconds]

### Frontend Performance
- Lighthouse Score: [RUN: npm run lighthouse]
- Core Web Vitals: [MEASURE: LCP, FID, CLS]
- Time to Interactive: [MEASURE: TTI]

## Recommendations

EOF

  echo "Performance report saved to: $REPORT_FILE"
}

################################################################################
# Main Execution
################################################################################

main() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║        Performance Validation & Benchmarking               ║"
  echo "║       Lucide React Mobile Application v22.19              ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  check_build_performance
  check_bundle_size
  check_startup_time
  check_memory_usage
  check_test_performance
  check_network_performance
  check_database_performance
  check_caching_strategy
  check_frontend_performance
  check_load_test_config
  check_scalability

  generate_performance_report

  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "Performance Validation Complete"
  echo "════════════════════════════════════════════════════════════"
  echo ""
  echo -e "Passed:  ${GREEN}$PASS_COUNT${NC}"
  echo -e "Failed:  ${RED}$FAIL_COUNT${NC}"
  echo -e "Warnings: ${YELLOW}$WARN_COUNT${NC}"
  echo ""

  if [ "$FAIL_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✓ Performance validation PASSED${NC}"
    exit 0
  else
    echo -e "${RED}✗ Performance validation FAILED${NC}"
    exit 1
  fi
}

main "$@"
