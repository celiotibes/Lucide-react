#!/bin/bash
# ============================================================================
# Deploy to Minikube - Phase 22.21
# ============================================================================
# Automated deployment of Lucide CRMT to local Minikube cluster

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
CLUSTER_NAME="${CLUSTER_NAME:-minikube}"
NAMESPACE="${NAMESPACE:-lucide-dev}"
RELEASE_NAME="${RELEASE_NAME:-lucide}"
CHART_DIR="${CHART_DIR:-./helm/lucide-crmt}"
VALUES_FILE="${VALUES_FILE:-./helm/lucide-crmt/values-development.yaml}"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v minikube &> /dev/null; then
        log_error "Minikube is not installed"
        echo "Install with: brew install minikube (macOS) or https://minikube.sigs.k8s.io/"
        exit 1
    fi

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        echo "Install with: brew install kubectl or https://kubernetes.io/docs/tasks/tools/"
        exit 1
    fi

    if ! command -v helm &> /dev/null; then
        log_error "Helm is not installed"
        echo "Install with: brew install helm or https://helm.sh/docs/intro/install/"
        exit 1
    fi

    log_success "All prerequisites installed"
}

# Check if Minikube is running
check_minikube_status() {
    log_info "Checking Minikube status..."

    status=$(minikube status 2>/dev/null | grep "host:" || echo "")

    if [[ $status == *"Running"* ]]; then
        log_success "Minikube is running"
        return 0
    else
        return 1
    fi
}

# Start Minikube if not running
start_minikube() {
    log_info "Starting Minikube cluster..."

    minikube start \
        --cpus=4 \
        --memory=8192 \
        --disk-size=50g \
        --kubernetes-version=v1.27.0 \
        --driver=docker

    log_success "Minikube started"
}

# Enable required addons
enable_addons() {
    log_info "Enabling required addons..."

    addons=("ingress" "metrics-server" "storage-provisioner")

    for addon in "${addons[@]}"; do
        log_info "Enabling $addon addon..."
        minikube addons enable "$addon" || log_warning "Could not enable $addon"
    done

    log_success "Addons configured"
}

# Build Docker image
build_docker_image() {
    log_info "Building Docker image in Minikube..."

    # Use Minikube's Docker daemon
    eval $(minikube docker-env)

    log_info "Building image with tag lucide-crmt:22.21..."
    docker build -t lucide-crmt:22.21 .

    log_success "Docker image built"
}

# Create namespace
create_namespace() {
    log_info "Creating namespace: $NAMESPACE"

    kubectl create namespace "$NAMESPACE" || log_warning "Namespace already exists"

    log_success "Namespace ready: $NAMESPACE"
}

# Create secrets
create_secrets() {
    log_info "Creating secrets..."

    kubectl create secret generic lucide-secret \
        --from-literal=API_KEY='dev-api-key-12345' \
        --from-literal=SESSION_SECRET='dev-session-secret-67890' \
        --from-literal=JWT_SECRET='dev-jwt-secret-abcde' \
        -n "$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -

    log_success "Secrets created"
}

# Validate Helm chart
validate_chart() {
    log_info "Validating Helm chart..."

    if helm lint "$CHART_DIR" --strict; then
        log_success "Chart validation passed"
    else
        log_error "Chart validation failed"
        exit 1
    fi
}

# Deploy with Helm
deploy_helm() {
    log_info "Deploying with Helm..."

    # Check if release exists
    if helm list -n "$NAMESPACE" | grep -q "$RELEASE_NAME"; then
        log_info "Updating existing release..."
        helm upgrade "$RELEASE_NAME" "$CHART_DIR" \
            -f "$VALUES_FILE" \
            -n "$NAMESPACE" \
            --set image.tag=22.21 \
            --set image.pullPolicy=Never
    else
        log_info "Installing new release..."
        helm install "$RELEASE_NAME" "$CHART_DIR" \
            -f "$VALUES_FILE" \
            -n "$NAMESPACE" \
            --set image.tag=22.21 \
            --set image.pullPolicy=Never
    fi

    log_success "Helm deployment completed"
}

# Wait for deployment to be ready
wait_for_deployment() {
    log_info "Waiting for deployment to be ready..."

    if kubectl wait --for=condition=ready pod \
        -l app.kubernetes.io/name=lucide-crmt \
        -n "$NAMESPACE" \
        --timeout=300s; then
        log_success "Deployment is ready"
    else
        log_warning "Timeout waiting for deployment"
        log_info "Checking pod status..."
        kubectl get pods -n "$NAMESPACE"
        kubectl describe pod -l app.kubernetes.io/name=lucide-crmt -n "$NAMESPACE"
    fi
}

# Get Minikube info
get_minikube_info() {
    log_info "Getting Minikube information..."

    minikube_ip=$(minikube ip)
    log_info "Minikube IP: $minikube_ip"

    echo "$minikube_ip" > /tmp/minikube-ip.txt
}

# Setup port forwarding
setup_port_forward() {
    log_info "Setting up port forwarding..."

    # Kill any existing port-forward processes
    pkill -f "kubectl port-forward" || true

    # Start port-forward in background
    kubectl port-forward svc/"$RELEASE_NAME"-lucide-crmt 8787:80 \
        -n "$NAMESPACE" > /tmp/port-forward.log 2>&1 &

    sleep 2

    log_success "Port forwarding established on localhost:8787"
}

# Display deployment info
display_info() {
    echo ""
    log_success "========== DEPLOYMENT COMPLETE =========="
    echo ""
    echo "Namespace: $NAMESPACE"
    echo "Release: $RELEASE_NAME"
    echo ""
    echo "Accessing the application:"
    echo "  - Port forward: http://localhost:8787"
    echo "  - Health check: curl http://localhost:8787/api/health"
    echo ""
    echo "Useful commands:"
    echo "  - View pods: kubectl get pods -n $NAMESPACE"
    echo "  - View logs: kubectl logs -f deployment/$RELEASE_NAME-lucide-crmt -n $NAMESPACE"
    echo "  - Describe pod: kubectl describe pod <pod-name> -n $NAMESPACE"
    echo "  - Exec into pod: kubectl exec -it <pod-name> -n $NAMESPACE -- /bin/sh"
    echo "  - Port forward: kubectl port-forward svc/$RELEASE_NAME-lucide-crmt 8787:80 -n $NAMESPACE"
    echo "  - Minikube dashboard: minikube dashboard"
    echo "  - Stop Minikube: minikube stop"
    echo "  - Delete Minikube: minikube delete"
    echo ""
}

# Main execution
main() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║        Lucide CRMT - Minikube Deployment Script                ║"
    echo "║                   Phase 22.21 - Kubernetes                     ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""

    check_prerequisites

    if ! check_minikube_status; then
        start_minikube
        enable_addons
    fi

    # Use Minikube's Docker environment
    eval $(minikube docker-env)

    build_docker_image
    create_namespace
    create_secrets
    validate_chart
    deploy_helm
    wait_for_deployment
    get_minikube_info
    setup_port_forward
    display_info
}

# Run main function
main "$@"
