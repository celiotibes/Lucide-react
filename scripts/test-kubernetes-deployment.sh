#!/bin/bash
# ============================================================================
# Test Kubernetes Deployment - Phase 22.21
# ============================================================================
# Tests for Lucide CRMT Kubernetes deployment

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
NAMESPACE="${NAMESPACE:-lucide-dev}"
RELEASE_NAME="${RELEASE_NAME:-lucide}"
TIMEOUT="${TIMEOUT:-300}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Test 1: Namespace exists
test_namespace_exists() {
    log_info "Test 1: Checking if namespace exists..."

    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_success "Namespace '$NAMESPACE' exists"
    else
        log_error "Namespace '$NAMESPACE' not found"
        return 1
    fi
}

# Test 2: Deployment exists
test_deployment_exists() {
    log_info "Test 2: Checking if deployment exists..."

    deployment_name=$(helm list -n "$NAMESPACE" -q | grep -E "^$RELEASE_NAME\$")

    if [ -n "$deployment_name" ]; then
        log_success "Deployment '$deployment_name' exists"
    else
        log_error "Deployment not found in namespace '$NAMESPACE'"
        return 1
    fi
}

# Test 3: Pods are running
test_pods_running() {
    log_info "Test 3: Checking if pods are running..."

    pod_count=$(kubectl get pods -n "$NAMESPACE" \
        -l app.kubernetes.io/name=lucide-crmt \
        --field-selector=status.phase=Running \
        -o jsonpath='{.items[*].metadata.name}' | wc -w)

    if [ "$pod_count" -gt 0 ]; then
        log_success "$pod_count pod(s) are running"
    else
        log_error "No running pods found"
        kubectl get pods -n "$NAMESPACE"
        return 1
    fi
}

# Test 4: Service exists and has endpoints
test_service_endpoints() {
    log_info "Test 4: Checking service endpoints..."

    service_name="${RELEASE_NAME}-lucide-crmt"

    if ! kubectl get service "$service_name" -n "$NAMESPACE" &> /dev/null; then
        log_error "Service '$service_name' not found"
        return 1
    fi

    endpoint_count=$(kubectl get endpoints "$service_name" -n "$NAMESPACE" \
        -o jsonpath='{.subsets[*].addresses[*].ip}' | wc -w)

    if [ "$endpoint_count" -gt 0 ]; then
        log_success "Service has $endpoint_count endpoint(s)"
    else
        log_error "Service has no endpoints"
        kubectl describe service "$service_name" -n "$NAMESPACE"
        return 1
    fi
}

# Test 5: ConfigMap exists
test_configmap_exists() {
    log_info "Test 5: Checking if ConfigMap exists..."

    configmap_name="${RELEASE_NAME}-lucide-crmt-config"

    if kubectl get configmap "$configmap_name" -n "$NAMESPACE" &> /dev/null; then
        log_success "ConfigMap '$configmap_name' exists"
    else
        log_warning "ConfigMap '$configmap_name' not found (may use existing secret)"
    fi
}

# Test 6: Secret exists
test_secret_exists() {
    log_info "Test 6: Checking if Secret exists..."

    secret_count=$(kubectl get secrets -n "$NAMESPACE" | wc -l)

    if [ "$secret_count" -gt 1 ]; then
        log_success "Secrets found in namespace"
    else
        log_error "No secrets found in namespace"
        return 1
    fi
}

# Test 7: PVC is bound (if persistence enabled)
test_pvc_bound() {
    log_info "Test 7: Checking PersistentVolumeClaim status..."

    pvc_status=$(kubectl get pvc -n "$NAMESPACE" \
        -o jsonpath='{.items[*].status.phase}' 2>/dev/null || echo "")

    if [ -z "$pvc_status" ]; then
        log_warning "No PVCs found (may not be enabled)"
        return 0
    fi

    if [ "$pvc_status" == "Bound" ]; then
        log_success "PVC is bound"
    else
        log_error "PVC is not bound. Status: $pvc_status"
        kubectl describe pvc -n "$NAMESPACE"
        return 1
    fi
}

# Test 8: Health endpoint responds
test_health_endpoint() {
    log_info "Test 8: Testing health endpoint..."

    # Port-forward to service
    service_name="${RELEASE_NAME}-lucide-crmt"
    local_port=9999

    # Kill any existing port-forward
    pkill -f "kubectl port-forward.*$local_port" || true

    # Start port-forward
    kubectl port-forward svc/"$service_name" "$local_port":80 \
        -n "$NAMESPACE" > /dev/null 2>&1 &
    pf_pid=$!

    sleep 2

    # Test endpoint
    if response=$(curl -s -m 5 "http://localhost:$local_port/api/health" 2>/dev/null); then
        if echo "$response" | grep -q "ok\|ready\|healthy"; then
            log_success "Health endpoint responds: $response"
        else
            log_warning "Health endpoint returned: $response"
        fi
    else
        log_error "Health endpoint did not respond"
        kill $pf_pid 2>/dev/null || true
        return 1
    fi

    # Clean up port-forward
    kill $pf_pid 2>/dev/null || true
}

# Test 9: Pod logs are accessible
test_pod_logs() {
    log_info "Test 9: Checking pod logs..."

    pod=$(kubectl get pods -n "$NAMESPACE" \
        -l app.kubernetes.io/name=lucide-crmt \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$pod" ]; then
        log_error "No pods found to check logs"
        return 1
    fi

    if kubectl logs "$pod" -n "$NAMESPACE" | head -5 &> /dev/null; then
        log_success "Pod logs are accessible"
    else
        log_error "Cannot access pod logs"
        return 1
    fi
}

# Test 10: Resource usage
test_resource_usage() {
    log_info "Test 10: Checking resource usage..."

    # Check if metrics-server is available
    if ! kubectl get deployment metrics-server -n kube-system &> /dev/null; then
        log_warning "metrics-server not found (HPA may not work)"
        return 0
    fi

    # Get metrics
    if kubectl top pods -n "$NAMESPACE" &> /dev/null; then
        log_success "Resource metrics available"
        kubectl top pods -n "$NAMESPACE"
    else
        log_warning "Resource metrics not yet available (may take time after deployment)"
    fi
}

# Test 11: Deployment replicas
test_deployment_replicas() {
    log_info "Test 11: Checking deployment replicas..."

    deployment_name=$(kubectl get deployments -n "$NAMESPACE" \
        -l app.kubernetes.io/name=lucide-crmt \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$deployment_name" ]; then
        log_error "Deployment not found"
        return 1
    fi

    desired=$(kubectl get deployment "$deployment_name" -n "$NAMESPACE" \
        -o jsonpath='{.spec.replicas}')
    ready=$(kubectl get deployment "$deployment_name" -n "$NAMESPACE" \
        -o jsonpath='{.status.readyReplicas}')

    if [ "$desired" == "$ready" ]; then
        log_success "All $ready/$desired replicas are ready"
    else
        log_error "Replicas mismatch. Desired: $desired, Ready: $ready"
        kubectl describe deployment "$deployment_name" -n "$NAMESPACE"
        return 1
    fi
}

# Test 12: Ingress (if enabled)
test_ingress() {
    log_info "Test 12: Checking Ingress configuration..."

    ingress_count=$(kubectl get ingress -n "$NAMESPACE" 2>/dev/null | wc -l)

    if [ "$ingress_count" -gt 1 ]; then
        log_success "Ingress configured"
        kubectl get ingress -n "$NAMESPACE"
    else
        log_warning "No Ingress found (may not be enabled)"
    fi
}

# Test 13: HPA status
test_hpa_status() {
    log_info "Test 13: Checking HorizontalPodAutoscaler status..."

    hpa=$(kubectl get hpa -n "$NAMESPACE" 2>/dev/null | wc -l)

    if [ "$hpa" -gt 1 ]; then
        log_success "HPA configured"
        kubectl get hpa -n "$NAMESPACE"
    else
        log_warning "No HPA found (may not be enabled)"
    fi
}

# Test 14: Events for errors
test_events() {
    log_info "Test 14: Checking for critical events..."

    error_events=$(kubectl get events -n "$NAMESPACE" \
        --sort-by='.lastTimestamp' | grep -E "Error|Warning" | wc -l)

    if [ "$error_events" -eq 0 ]; then
        log_success "No error events found"
    else
        log_warning "Found $error_events warning/error events:"
        kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' | grep -E "Error|Warning"
    fi
}

# Test 15: Network connectivity
test_network_connectivity() {
    log_info "Test 15: Testing network connectivity..."

    pod=$(kubectl get pods -n "$NAMESPACE" \
        -l app.kubernetes.io/name=lucide-crmt \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$pod" ]; then
        log_error "No pods found"
        return 1
    fi

    # Test DNS resolution
    if kubectl exec "$pod" -n "$NAMESPACE" -- nslookup kubernetes.default &> /dev/null; then
        log_success "Pod can resolve DNS"
    else
        log_error "Pod cannot resolve DNS"
        return 1
    fi
}

# Summary
print_summary() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                    TEST SUMMARY${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

    total=$((TESTS_PASSED + TESTS_FAILED))
    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}All $total tests passed!${NC}"
        return 0
    else
        echo -e "${RED}$TESTS_FAILED out of $total tests failed${NC}"
        return 1
    fi
}

# Main execution
main() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║    Lucide CRMT - Kubernetes Deployment Test Suite              ║"
    echo "║                   Phase 22.21 - Tests                          ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""

    log_info "Namespace: $NAMESPACE"
    log_info "Release: $RELEASE_NAME"
    echo ""

    # Run all tests
    test_namespace_exists || true
    test_deployment_exists || true
    test_pods_running || true
    test_service_endpoints || true
    test_configmap_exists || true
    test_secret_exists || true
    test_pvc_bound || true
    test_health_endpoint || true
    test_pod_logs || true
    test_resource_usage || true
    test_deployment_replicas || true
    test_ingress || true
    test_hpa_status || true
    test_events || true
    test_network_connectivity || true

    print_summary
}

# Run main function
main "$@"
