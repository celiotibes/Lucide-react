#!/bin/bash
# ============================================================================
# Validate Helm Chart - Phase 22.21
# ============================================================================
# Validates Lucide CRMT Helm chart syntax and configuration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CHART_DIR="${CHART_DIR:-./helm/lucide-crmt}"
DRY_RUN_DIR="${DRY_RUN_DIR:-/tmp/helm-dry-run}"
ENVIRONMENTS=("development" "staging" "production")

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

# Check if Helm is installed
if ! command -v helm &> /dev/null; then
    log_error "Helm is not installed. Please install Helm 3.0+"
    exit 1
fi

log_info "Helm version: $(helm version --short)"

# Check if chart exists
if [ ! -f "$CHART_DIR/Chart.yaml" ]; then
    log_error "Chart.yaml not found in $CHART_DIR"
    exit 1
fi

log_success "Chart directory found: $CHART_DIR"

# Create temp directory for dry-runs
mkdir -p "$DRY_RUN_DIR"

# 1. Validate Chart Syntax
echo ""
log_info "========== 1. VALIDATING CHART SYNTAX =========="

if helm lint "$CHART_DIR" --strict; then
    log_success "Chart validation passed"
else
    log_error "Chart validation failed"
    exit 1
fi

# 2. Validate Templates
echo ""
log_info "========== 2. VALIDATING TEMPLATES =========="

for env in "${ENVIRONMENTS[@]}"; do
    log_info "Validating templates for $env environment..."

    # Find values file
    values_file="$CHART_DIR/values-${env}.yaml"
    if [ ! -f "$values_file" ]; then
        log_warning "Values file not found: $values_file, using default values"
        values_file="$CHART_DIR/values.yaml"
    fi

    # Template dry-run
    output_file="$DRY_RUN_DIR/${env}-manifests.yaml"

    if helm template lucide "$CHART_DIR" \
        -f "$values_file" \
        --output-dir="$DRY_RUN_DIR/${env}" > "$output_file" 2>&1; then
        log_success "Templates validated for $env"
    else
        log_error "Template validation failed for $env"
        exit 1
    fi
done

# 3. Validate Kubernetes Manifests
echo ""
log_info "========== 3. VALIDATING KUBERNETES MANIFESTS =========="

if command -v kubeval &> /dev/null; then
    log_info "Using kubeval for manifest validation"

    for env_dir in "$DRY_RUN_DIR"/*/; do
        env_name=$(basename "$env_dir")
        log_info "Validating manifests in $env_name..."

        if kubeval "$env_dir"/*.yaml 2>&1 | head -20; then
            log_success "Manifests validated for $env_name"
        else
            log_warning "Some manifest validation warnings for $env_name"
        fi
    done
else
    log_warning "kubeval not installed, skipping manifest validation"
    log_info "Install with: go install github.com/instrumenta/kubeval@latest"
fi

# 4. Check Required Values
echo ""
log_info "========== 4. CHECKING REQUIRED VALUES =========="

required_values=(
    "replicaCount"
    "image.repository"
    "image.tag"
    "service.type"
    "persistence.enabled"
)

for value in "${required_values[@]}"; do
    if grep -q "$value:" "$CHART_DIR/values.yaml"; then
        log_success "Required value found: $value"
    else
        log_warning "Required value not found: $value"
    fi
done

# 5. Check Secret Configuration
echo ""
log_info "========== 5. CHECKING SECRET CONFIGURATION =========="

log_info "Checking if secrets are properly configured..."

if grep -q "existingSecret" "$CHART_DIR/templates/deployment.yaml"; then
    log_success "Secret reference found in deployment"
else
    log_warning "Secret reference not found in deployment"
fi

# 6. Check Probe Configuration
echo ""
log_info "========== 6. CHECKING HEALTH PROBES =========="

if grep -q "livenessProbe" "$CHART_DIR/templates/deployment.yaml"; then
    log_success "Liveness probe configured"
else
    log_warning "Liveness probe not configured"
fi

if grep -q "readinessProbe" "$CHART_DIR/templates/deployment.yaml"; then
    log_success "Readiness probe configured"
else
    log_warning "Readiness probe not configured"
fi

# 7. Check Resource Limits
echo ""
log_info "========== 7. CHECKING RESOURCE LIMITS =========="

if grep -q "requests:" "$CHART_DIR/templates/deployment.yaml"; then
    log_success "Resource requests configured"
else
    log_warning "Resource requests not configured"
fi

if grep -q "limits:" "$CHART_DIR/templates/deployment.yaml"; then
    log_success "Resource limits configured"
else
    log_warning "Resource limits not configured"
fi

# 8. Check Persistence
echo ""
log_info "========== 8. CHECKING PERSISTENCE CONFIGURATION =========="

if [ -f "$CHART_DIR/templates/pvc.yaml" ]; then
    log_success "PVC template found"
else
    log_warning "PVC template not found"
fi

# 9. Generate Sample Manifests
echo ""
log_info "========== 9. GENERATING SAMPLE MANIFESTS =========="

for env in "${ENVIRONMENTS[@]}"; do
    values_file="$CHART_DIR/values-${env}.yaml"
    if [ ! -f "$values_file" ]; then
        values_file="$CHART_DIR/values.yaml"
    fi

    output_dir="$DRY_RUN_DIR/${env}-output"
    mkdir -p "$output_dir"

    helm template lucide "$CHART_DIR" \
        -f "$values_file" \
        -o yaml > "$output_dir/all-manifests.yaml"

    log_success "Manifests generated for $env: $output_dir/all-manifests.yaml"
done

# 10. Summary
echo ""
log_info "========== VALIDATION SUMMARY =========="
log_info "Dry-run output directory: $DRY_RUN_DIR"
log_success "Helm chart validation completed successfully!"

echo ""
echo "Next steps:"
echo "1. Review generated manifests in $DRY_RUN_DIR"
echo "2. Deploy to Minikube: helm install lucide $CHART_DIR -f $CHART_DIR/values-development.yaml"
echo "3. Deploy to production: helm install lucide $CHART_DIR -f $CHART_DIR/values-production.yaml"
echo ""
