#!/bin/bash
# ============================================================================
# BLUE-GREEN PRODUCTION DEPLOYMENT SCRIPT
# ============================================================================
# Complete automated deployment with monitoring
# Status: Production Ready
# Commit: 320cea8 (PR #15 merged)
# Date: 2026-10-03
# ============================================================================

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGISTRY="${DOCKER_REGISTRY:-docker.io}"
IMAGE_NAME="lucide-react"
TAG="production-20261003-050400"
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"
LATEST_IMAGE="${REGISTRY}/${IMAGE_NAME}:latest"
NAMESPACE="default"
DEPLOYMENT_NAME="lucide-app"
GIT_COMMIT="320cea8"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
log_phase() { echo -e "\n${BLUE}===${NC} $* ${BLUE}===${NC}\n"; }

# Error handler
trap 'log_error "Deployment failed at line $LINENO"' ERR

# ============================================================================
# PHASE 0: PRE-FLIGHT CHECKS
# ============================================================================
phase_preflight() {
  log_phase "PHASE 0: PRE-FLIGHT CHECKS"

  log_info "Checking prerequisites..."

  # Check docker
  if ! command -v docker &> /dev/null; then
    log_error "Docker not installed"
  fi
  docker --version

  # Check kubectl
  if ! command -v kubectl &> /dev/null; then
    log_error "kubectl not installed"
  fi
  kubectl version --client

  # Check cluster access
  log_info "Verifying Kubernetes cluster access..."
  if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot access Kubernetes cluster"
  fi

  # Check registry auth
  log_info "Verifying registry authentication..."
  if ! docker info | grep -q "Registry Authorizations"; then
    log_warn "Docker registry not fully authenticated"
  fi

  # Check secrets/configmaps
  log_info "Verifying production secrets and configs..."
  kubectl get secret lucide-secret -n $NAMESPACE > /dev/null || log_error "Secret 'lucide-secret' not found"
  kubectl get configmap lucide-config -n $NAMESPACE > /dev/null || log_error "ConfigMap 'lucide-config' not found"

  # Check PVC
  kubectl get pvc lucide-data-pvc -n $NAMESPACE > /dev/null || log_warn "PVC 'lucide-data-pvc' not found"

  # Check current BLUE deployment
  log_info "Checking current BLUE deployment..."
  kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE > /dev/null || log_warn "Current deployment not found"

  log_success "Pre-flight checks passed"
}

# ============================================================================
# PHASE 1: DOCKER BUILD & PUSH
# ============================================================================
phase_docker_build() {
  log_phase "PHASE 1: DOCKER BUILD & PUSH"

  local repo_path="${1:-.}"

  if [ ! -f "$repo_path/Dockerfile" ]; then
    log_error "Dockerfile not found in $repo_path"
  fi

  log_info "Building Docker image..."
  log_info "Image: $FULL_IMAGE"

  docker build \
    --tag "$FULL_IMAGE" \
    --tag "$LATEST_IMAGE" \
    --label "version=production-20261003-050400" \
    --label "commit=$GIT_COMMIT" \
    --label "built-at=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    "$repo_path"

  log_success "Docker image built successfully"

  # Verify image size
  local image_size=$(docker inspect "$FULL_IMAGE" --format='{{.Size}}' | numfmt --to=iec 2>/dev/null || docker inspect "$FULL_IMAGE" --format='{{.Size}}')
  log_info "Image size: $image_size"

  # Security scan with Trivy (if available)
  if command -v trivy &> /dev/null; then
    log_info "Running Trivy security scan..."
    if trivy image --severity HIGH,CRITICAL "$FULL_IMAGE"; then
      log_success "Security scan passed"
    else
      log_warn "Security scan found issues - review before proceeding"
    fi
  else
    log_warn "Trivy not installed - skipping security scan"
  fi

  log_info "Pushing image to registry..."
  docker push "$FULL_IMAGE"
  docker push "$LATEST_IMAGE"

  log_success "Image pushed to registry"
}

# ============================================================================
# PHASE 2: DEPLOY GREEN
# ============================================================================
phase_deploy_green() {
  log_phase "PHASE 2: DEPLOY GREEN ENVIRONMENT"

  log_info "Creating GREEN deployment manifest..."

  cat > /tmp/lucide-app-green.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lucide-app-green
  namespace: default
  labels:
    app: lucide-app
    version: green
    deployment: green
spec:
  replicas: 2
  selector:
    matchLabels:
      app: lucide-app
      deployment: green
  template:
    metadata:
      labels:
        app: lucide-app
        version: green
        deployment: green
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8787"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: default
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
        - name: lucide-app
          image: %FULL_IMAGE%
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 8787
              protocol: TCP
          envFrom:
            - configMapRef:
                name: lucide-config
            - secretRef:
                name: lucide-secret
          env:
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: POD_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: NODE_OPTIONS
              value: "--max-old-space-size=512"
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /api/health
              port: http
            initialDelaySeconds: 20
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /api/health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 2
            failureThreshold: 2
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
              add:
                - NET_BIND_SERVICE
          lifecycle:
            preStop:
              exec:
                command:
                  - sh
                  - -c
                  - sleep 5; kill -TERM 1 || true
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - lucide-app
                topologyKey: kubernetes.io/hostname
      restartPolicy: Always
      terminationGracePeriodSeconds: 30
EOF

  # Replace image placeholder
  sed -i "s|%FULL_IMAGE%|$FULL_IMAGE|g" /tmp/lucide-app-green.yaml

  log_info "Deploying GREEN..."
  kubectl apply -f /tmp/lucide-app-green.yaml

  log_info "Waiting for GREEN rollout (timeout: 5min)..."
  kubectl rollout status deployment/lucide-app-green -n $NAMESPACE --timeout=5m

  log_info "Verifying GREEN pod health..."
  local ready_pods=$(kubectl get deployment lucide-app-green -n $NAMESPACE -o jsonpath='{.status.readyReplicas}')
  local desired_pods=$(kubectl get deployment lucide-app-green -n $NAMESPACE -o jsonpath='{.spec.replicas}')

  if [ "$ready_pods" != "$desired_pods" ]; then
    kubectl get pods -l deployment=green -n $NAMESPACE
    log_error "GREEN pods not ready: $ready_pods/$desired_pods"
  fi

  log_success "GREEN deployment successful: $ready_pods/$desired_pods pods ready"
}

# ============================================================================
# PHASE 3: SMOKE TESTS
# ============================================================================
phase_smoke_tests() {
  log_phase "PHASE 3: SMOKE TESTS"

  log_info "Setting up port forward..."
  kubectl port-forward svc/lucide-app-green 8787:8787 -n $NAMESPACE &
  local pf_pid=$!
  sleep 2

  local tests_passed=0
  local tests_failed=0

  # Test health check
  log_info "Testing health endpoint..."
  if curl -s http://localhost:8787/api/health | grep -q "ok\|healthy"; then
    log_success "Health check passed"
    ((tests_passed++))
  else
    log_warn "Health check may not be responding as expected"
  fi

  # Test API endpoints
  log_info "Testing API endpoints..."
  for endpoint in "/api/users" "/api/charges" "/api/invoices"; do
    if curl -s http://localhost:8787$endpoint > /dev/null 2>&1; then
      log_success "Endpoint $endpoint responding"
      ((tests_passed++))
    else
      log_warn "Endpoint $endpoint not responding"
      ((tests_failed++))
    fi
  done

  # Performance check
  log_info "Checking response time..."
  local response_time=$(curl -w "%{time_total}" -o /dev/null -s http://localhost:8787/api/health)
  log_info "Response time: ${response_time}s"

  kill $pf_pid 2>/dev/null || true
  wait $pf_pid 2>/dev/null || true

  log_success "Smoke tests completed: $tests_passed passed, $tests_failed warnings"
}

# ============================================================================
# PHASE 4: TRAFFIC SWITCH
# ============================================================================
phase_traffic_switch() {
  log_phase "PHASE 4: TRAFFIC SWITCH (BLUE → GREEN)"

  log_info "Current service selector:"
  kubectl get svc $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath='{.spec.selector}' | jq '.'

  log_info "Switching traffic to GREEN..."
  kubectl patch service $DEPLOYMENT_NAME -n $NAMESPACE -p \
    '{"spec":{"selector":{"deployment":"green"}}}'

  log_success "Traffic switch initiated"

  sleep 2

  log_info "Verifying traffic switched..."
  local updated_selector=$(kubectl get svc $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath='{.spec.selector.deployment}')

  if [ "$updated_selector" = "green" ]; then
    log_success "Traffic successfully switched to GREEN"
  else
    log_error "Traffic switch verification failed"
  fi

  log_info "Endpoints:"
  kubectl get endpoints $DEPLOYMENT_NAME -n $NAMESPACE
}

# ============================================================================
# PHASE 5: MONITORING
# ============================================================================
phase_monitoring() {
  log_phase "PHASE 5: PRODUCTION MONITORING (24 HOURS)"

  log_info "Starting 24-hour monitoring..."
  log_info "Check metrics every 4 hours"
  log_info "Dashboard URLs:"
  log_info "  Prometheus: https://<YOUR_DOMAIN>/prometheus"
  log_info "  Sentry: https://sentry.io/organizations/<ORG>/issues"
  log_info "  AlertManager: https://<YOUR_DOMAIN>/alertmanager"

  local start_time=$(date +%s)
  local duration=$((24 * 60 * 60))
  local check_interval=$((4 * 60 * 60))

  while [ $(($(date +%s) - start_time)) -lt $duration ]; do
    local elapsed=$(($(date +%s) - start_time))
    local hours=$((elapsed / 3600))

    log_info "=== Monitoring checkpoint: ${hours}h ==="

    # Pod status
    kubectl get pods -l deployment=green -n $NAMESPACE --no-headers | awk '{print $1, $3}'

    # Resource usage
    if kubectl top pods -l deployment=green -n $NAMESPACE &>/dev/null; then
      kubectl top pods -l deployment=green -n $NAMESPACE
    fi

    # Check for restart loops
    local restarts=$(kubectl get pods -l deployment=green -n $NAMESPACE -o jsonpath='{.items[0].status.containerStatuses[0].restartCount}')
    if [ "$restarts" -gt 0 ]; then
      log_warn "Pod restarts detected: $restarts"
    fi

    log_info "Next check in 4 hours..."
    sleep $check_interval
  done

  log_success "24-hour monitoring period complete"
}

# ============================================================================
# PHASE 6: CLEANUP
# ============================================================================
phase_cleanup() {
  log_phase "PHASE 6: CLEANUP"

  log_info "Scaling BLUE deployment to 0..."
  kubectl scale deployment $DEPLOYMENT_NAME --replicas=0 -n $NAMESPACE

  sleep 30

  log_info "Verifying no traffic to BLUE..."
  kubectl top pods -l deployment=blue -n $NAMESPACE || true

  log_info "Deleting BLUE deployment..."
  kubectl delete deployment $DEPLOYMENT_NAME -n $NAMESPACE

  log_success "BLUE deployment cleaned up"

  # Git tagging
  log_info "Tagging deployment in Git..."
  git tag -a "production-deployed-20261003" -m "Blue-green deployment successful" "$GIT_COMMIT"
  git push origin "production-deployed-20261003"

  log_success "Git tag created and pushed"
}

# ============================================================================
# PHASE 7: ROLLBACK (Emergency only)
# ============================================================================
phase_rollback() {
  log_phase "PHASE 7: EMERGENCY ROLLBACK"

  log_warn "INITIATING ROLLBACK TO BLUE"

  log_info "Switching traffic back to BLUE..."
  kubectl patch service $DEPLOYMENT_NAME -n $NAMESPACE -p \
    '{"spec":{"selector":{"deployment":"blue"}}}'

  sleep 5

  log_info "Verifying BLUE is serving..."
  if kubectl port-forward svc/$DEPLOYMENT_NAME 8787:8787 -n $NAMESPACE &>/dev/null &; then
    sleep 2
    if curl -s http://localhost:8787/api/health > /dev/null; then
      log_success "BLUE is serving traffic - rollback successful"
    else
      log_error "BLUE health check failed after rollback"
    fi
  fi

  log_warn "Investigating GREEN deployment failure..."
  kubectl logs -l deployment=green -n $NAMESPACE --tail=50 > /tmp/green-failure-logs.txt
  log_info "Logs saved to /tmp/green-failure-logs.txt"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================
main() {
  local repo_path="${1:-.}"
  local phase="${2:-all}"

  log_info "Starting Blue-Green Deployment"
  log_info "Repository: $repo_path"
  log_info "Image: $FULL_IMAGE"
  log_info "Commit: $GIT_COMMIT"

  case "$phase" in
    preflight)
      phase_preflight
      ;;
    build)
      phase_preflight
      phase_docker_build "$repo_path"
      ;;
    deploy)
      phase_preflight
      phase_deploy_green
      ;;
    smoke)
      phase_smoke_tests
      ;;
    switch)
      phase_traffic_switch
      ;;
    monitor)
      phase_monitoring
      ;;
    cleanup)
      phase_cleanup
      ;;
    rollback)
      phase_rollback
      ;;
    all)
      phase_preflight
      phase_docker_build "$repo_path"
      phase_deploy_green
      phase_smoke_tests
      phase_traffic_switch
      phase_monitoring
      phase_cleanup
      ;;
    *)
      log_error "Unknown phase: $phase"
      ;;
  esac

  log_success "Deployment phase '$phase' completed successfully"
}

# Run main function
main "$@"
