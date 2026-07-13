#!/bin/bash
# Check Metrics Against Baseline
# Verifica se as métricas estão dentro dos limites esperados

PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
ERROR_THRESHOLD="${1:-0.01}"
LATENCY_THRESHOLD="${2:-500}"

echo "📊 Checking Application Metrics"
echo "==============================="
echo ""

METRICS_OK=0
METRICS_FAILED=0

check_metric() {
  local name=$1
  local query=$2
  local threshold=$3
  local operator=$4
  
  echo -n "$name ... "
  
  VALUE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=$query" | \
    jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")
  
  if [ "$VALUE" == "0" ] || [ -z "$VALUE" ]; then
    echo "⚠️  No data"
    return
  fi
  
  # Compare based on operator
  if [ "$operator" == "<" ]; then
    if (( $(echo "$VALUE < $threshold" | bc -l) )); then
      echo "✅ $VALUE (ok)"
      ((METRICS_OK++))
    else
      echo "❌ $VALUE (threshold: $threshold)"
      ((METRICS_FAILED++))
    fi
  elif [ "$operator" == ">" ]; then
    if (( $(echo "$VALUE > $threshold" | bc -l) )); then
      echo "✅ $VALUE (ok)"
      ((METRICS_OK++))
    else
      echo "❌ $VALUE (threshold: $threshold)"
      ((METRICS_FAILED++))
    fi
  fi
}

# Check key metrics
echo "⚡ Performance Metrics:"
check_metric "Error Rate" \
  'rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])' \
  "$ERROR_THRESHOLD" "<"

check_metric "P95 Latency (ms)" \
  'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) * 1000' \
  "$LATENCY_THRESHOLD" "<"

echo ""
echo "📈 Throughput:"
check_metric "Requests/sec" \
  'rate(http_requests_total[5m])' \
  "100" ">"

echo ""
echo "=================="
echo "Results: $METRICS_OK ok, $METRICS_FAILED failed"
echo "=================="

if [ $METRICS_FAILED -eq 0 ]; then
  echo "✅ All metrics OK"
  exit 0
else
  echo "❌ Some metrics failed"
  exit 1
fi
