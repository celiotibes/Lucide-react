# Kubernetes Deployment Scripts - Phase 22.21

Automation scripts for Kubernetes deployment and testing of Lucide CRMT.

## Scripts Overview

### 1. validate-helm-chart.sh

Validates Helm chart configuration, syntax, and generates dry-run manifests.

**Usage:**

```bash
./scripts/validate-helm-chart.sh
```

**Features:**
- Chart syntax validation with `helm lint`
- Template validation for all environments
- Kubernetes manifest validation with kubeval
- Required values checking
- Secret configuration verification
- Health probe configuration checks
- Resource limits validation
- Persistence configuration checks
- Sample manifest generation

**Output:**
- Validates templates for development, staging, and production
- Generates manifests in `/tmp/helm-dry-run/`
- Summary report of validation results

**Example Output:**
```
[INFO] ========== 1. VALIDATING CHART SYNTAX ==========
[SUCCESS] Chart validation passed
[INFO] ========== 2. VALIDATING TEMPLATES ==========
[INFO] Validating templates for development environment...
[SUCCESS] Templates validated for development
...
[SUCCESS] Helm chart validation completed successfully!
```

### 2. deploy-minikube.sh

Automated deployment to local Minikube cluster for development and testing.

**Prerequisites:**
- Minikube installed
- kubectl installed
- Helm installed
- Docker installed

**Usage:**

```bash
# Basic deployment with defaults
./scripts/deploy-minikube.sh

# Custom namespace and release name
NAMESPACE=lucide-test RELEASE_NAME=test ./scripts/deploy-minikube.sh

# Using specific values file
VALUES_FILE=./helm/lucide-crmt/values-staging.yaml ./scripts/deploy-minikube.sh
```

**Configuration Options:**
```bash
CLUSTER_NAME=minikube          # Minikube cluster name
NAMESPACE=lucide-dev           # Kubernetes namespace
RELEASE_NAME=lucide           # Helm release name
CHART_DIR=./helm/lucide-crmt   # Chart directory
VALUES_FILE=values-development.yaml # Values file to use
```

**Features:**
- Prerequisite checks (minikube, kubectl, helm)
- Minikube startup and addon enablement
- Docker image building in Minikube
- Namespace creation
- Secret configuration
- Helm chart deployment
- Deployment readiness waiting
- Port forwarding setup
- Comprehensive deployment information

**Example Output:**
```
═══════════════════════════════════════════════════════════════
        Lucide CRMT - Minikube Deployment Script
                   Phase 22.21 - Kubernetes
═══════════════════════════════════════════════════════════════

[INFO] Checking prerequisites...
[SUCCESS] All prerequisites installed
[INFO] Checking Minikube status...
[SUCCESS] Minikube is running
[INFO] Building Docker image in Minikube...
[SUCCESS] Docker image built
...
[SUCCESS] ========== DEPLOYMENT COMPLETE ==========

Accessing the application:
  - Port forward: http://localhost:8787
  - Health check: curl http://localhost:8787/api/health

Useful commands:
  - View pods: kubectl get pods -n lucide-dev
  - View logs: kubectl logs -f deployment/lucide-lucide-crmt -n lucide-dev
  - Minikube dashboard: minikube dashboard
```

### 3. test-kubernetes-deployment.sh

Comprehensive test suite for Kubernetes deployment validation.

**Usage:**

```bash
# Test default namespace
./scripts/test-kubernetes-deployment.sh

# Test specific namespace
NAMESPACE=lucide-prod ./scripts/test-kubernetes-deployment.sh

# Test specific release
RELEASE_NAME=my-release ./scripts/test-kubernetes-deployment.sh
```

**Configuration Options:**
```bash
NAMESPACE=lucide-dev           # Kubernetes namespace
RELEASE_NAME=lucide           # Helm release name
TIMEOUT=300                    # Timeout in seconds
```

**Test Coverage:**

1. **Namespace Exists** - Verifies the namespace is created
2. **Deployment Exists** - Checks if Helm release is installed
3. **Pods Running** - Verifies pods are in Running state
4. **Service Endpoints** - Checks service has endpoints
5. **ConfigMap** - Validates ConfigMap exists
6. **Secret** - Verifies secrets are configured
7. **PVC Bound** - Checks PersistentVolumeClaim is bound
8. **Health Endpoint** - Tests `/api/health` endpoint
9. **Pod Logs** - Verifies logs are accessible
10. **Resource Usage** - Checks CPU/memory metrics
11. **Replica Status** - Validates desired replicas match
12. **Ingress** - Checks Ingress configuration
13. **HPA Status** - Verifies HorizontalPodAutoscaler
14. **Events** - Scans for error/warning events
15. **Network Connectivity** - Tests DNS and network access

**Example Output:**
```
═══════════════════════════════════════════════════════════════
    Lucide CRMT - Kubernetes Deployment Test Suite
                   Phase 22.21 - Tests
═══════════════════════════════════════════════════════════════

[INFO] Namespace: lucide-dev
[INFO] Release: lucide

[INFO] Test 1: Checking if namespace exists...
[✓] Namespace 'lucide-dev' exists
[INFO] Test 2: Checking if deployment exists...
[✓] Deployment 'lucide' exists
...

════════════════════════════════════════════════════════
                    TEST SUMMARY
════════════════════════════════════════════════════════
Tests Passed: 15
Tests Failed: 0
All 15 tests passed!
```

## Complete Workflow Example

### 1. Validate Helm Chart

```bash
# Check chart syntax and generate manifests
./scripts/validate-helm-chart.sh

# Review generated manifests
cat /tmp/helm-dry-run/development-output/all-manifests.yaml
```

### 2. Deploy to Minikube

```bash
# Deploy to development environment
./scripts/deploy-minikube.sh

# Or deploy to specific namespace
NAMESPACE=lucide-staging ./scripts/deploy-minikube.sh
```

### 3. Run Tests

```bash
# Test the deployment
./scripts/test-kubernetes-deployment.sh

# Check specific namespace
NAMESPACE=lucide-staging ./scripts/test-kubernetes-deployment.sh
```

### 4. Verify Application

```bash
# Port-forward to service
kubectl port-forward svc/lucide-lucide-crmt 8787:80 -n lucide-dev

# Test health endpoint
curl http://localhost:8787/api/health

# View logs
kubectl logs -f deployment/lucide-lucide-crmt -n lucide-dev
```

## Advanced Usage

### Custom Helm Values

Create custom values file:

```bash
# Create staging overrides
cat > helm/lucide-crmt/values-custom.yaml <<EOF
replicaCount: 5
autoscaling:
  enabled: true
  maxReplicas: 20
image:
  tag: "22.21-custom"
EOF

# Deploy with custom values
NAMESPACE=lucide-custom \
VALUES_FILE=helm/lucide-crmt/values-custom.yaml \
./scripts/deploy-minikube.sh
```

### Multiple Environments

Deploy to multiple environments:

```bash
# Development
./scripts/deploy-minikube.sh

# Staging
NAMESPACE=lucide-staging \
VALUES_FILE=./helm/lucide-crmt/values-staging.yaml \
./scripts/deploy-minikube.sh

# Production simulation
NAMESPACE=lucide-prod \
VALUES_FILE=./helm/lucide-crmt/values-production.yaml \
./scripts/deploy-minikube.sh
```

### Manual Helm Commands

If you prefer manual Helm commands:

```bash
# Validate
helm lint ./helm/lucide-crmt

# Dry-run
helm install lucide ./helm/lucide-crmt \
  -f ./helm/lucide-crmt/values-development.yaml \
  --dry-run --debug

# Install
helm install lucide ./helm/lucide-crmt \
  -f ./helm/lucide-crmt/values-development.yaml

# Upgrade
helm upgrade lucide ./helm/lucide-crmt \
  -f ./helm/lucide-crmt/values-development.yaml

# Uninstall
helm uninstall lucide
```

## Troubleshooting

### Script Execution Issues

**Permission Denied:**
```bash
# Make scripts executable
chmod +x scripts/*.sh
```

**Command Not Found:**
```bash
# Ensure scripts directory is in PATH
export PATH=$PATH:./scripts

# Or use full path
./scripts/deploy-minikube.sh
```

### Deployment Issues

**Pod not starting:**
```bash
# Check pod status
kubectl describe pod <pod-name> -n <namespace>

# View logs
kubectl logs <pod-name> -n <namespace>

# Check events
kubectl get events -n <namespace> --sort-by='.lastTimestamp'
```

**Service has no endpoints:**
```bash
# Check selector labels
kubectl get pods -n <namespace> --show-labels

# Verify service selector
kubectl get service -n <namespace> -o yaml
```

**Health check failing:**
```bash
# Test health endpoint directly
kubectl exec <pod-name> -n <namespace> -- \
  wget -O- http://localhost:8787/api/health

# Check application logs
kubectl logs <pod-name> -n <namespace>
```

### Test Failures

**Health endpoint test fails:**
```bash
# Ensure application is responding
kubectl port-forward svc/<service-name> 8787:80 -n <namespace>
curl http://localhost:8787/api/health
```

**Resource metrics unavailable:**
```bash
# Verify metrics-server is running
kubectl get deployment metrics-server -n kube-system

# If not installed:
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

**HPA not working:**
```bash
# Check HPA status
kubectl describe hpa -n <namespace>

# Check metrics availability
kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test Kubernetes Deployment

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Minikube
        uses: helm/kind-action@v1.4.0
      
      - name: Validate Helm Chart
        run: ./scripts/validate-helm-chart.sh
      
      - name: Deploy to Kind
        run: |
          kubectl create namespace lucide-dev
          helm install lucide ./helm/lucide-crmt \
            -f ./helm/lucide-crmt/values-development.yaml \
            -n lucide-dev
      
      - name: Run Tests
        run: NAMESPACE=lucide-dev ./scripts/test-kubernetes-deployment.sh
```

## Performance Tuning

### Load Testing

```bash
# Deploy with increased replicas
NAMESPACE=lucide-load-test ./scripts/deploy-minikube.sh

# Monitor resource usage
watch -n 1 'kubectl top pods -n lucide-load-test'

# Run load test
kubectl run -it --rm load-test --image=loadimpact/k6:latest \
  -n lucide-load-test -- \
  run /scripts/load-test.js
```

### Database Performance

```bash
# Check database connectivity
kubectl exec <pod> -n <namespace> -- \
  sqlite3 /app/data/app.db "SELECT COUNT(*) FROM users;"

# Backup database
kubectl exec <pod> -n <namespace> -- \
  sqlite3 /app/data/app.db ".dump" > backup.sql
```

## Best Practices

1. **Always validate before deploying:**
   ```bash
   ./scripts/validate-helm-chart.sh
   ```

2. **Test in development first:**
   ```bash
   ./scripts/deploy-minikube.sh
   ./scripts/test-kubernetes-deployment.sh
   ```

3. **Review dry-run output:**
   ```bash
   helm template lucide ./helm/lucide-crmt -f values.yaml
   ```

4. **Monitor deployments:**
   ```bash
   kubectl get pods -n lucide-dev -w
   ```

5. **Keep scripts updated:**
   - Review scripts periodically
   - Update versions as needed
   - Test changes in development first

## See Also

- [Kubernetes Deployment Guide](../KUBERNETES-DEPLOYMENT.md)
- [Helm Chart README](../helm/lucide-crmt/README.md)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)

---

**Phase 22.21 - Kubernetes Deployment**  
**Lucide React CRMT**
