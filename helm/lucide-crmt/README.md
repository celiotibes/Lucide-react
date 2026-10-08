# Lucide CRMT Helm Chart

Complete Helm chart for deploying the Lucide React Accounting System (CRMT) on Kubernetes.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- Persistent Volume provisioner (for data storage)
- Ingress controller (nginx recommended)
- cert-manager (for HTTPS/TLS)

## Quick Start

### 1. Development Deployment

```bash
# Add values from your repository
helm install lucide ./helm/lucide-crmt \
  -f ./helm/lucide-crmt/values-development.yaml \
  -n lucide-crmt \
  --create-namespace
```

### 2. Staging Deployment

```bash
helm install lucide ./helm/lucide-crmt \
  -f ./helm/lucide-crmt/values-staging.yaml \
  -n lucide-crmt-staging \
  --create-namespace \
  --set secrets.existingSecret=lucide-secret-staging
```

### 3. Production Deployment

```bash
# Important: Set proper values before deploying
helm install lucide ./helm/lucide-crmt \
  -f ./helm/lucide-crmt/values-production.yaml \
  -n lucide-crmt-prod \
  --create-namespace \
  --set image.registry=your-registry \
  --set secrets.existingSecret=lucide-secret-prod \
  --set ingress.hosts[0].host=accounting.your-domain.com
```

## Chart Values

Key configuration options:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of application replicas | 2 |
| `image.repository` | Image repository | lucide-react |
| `image.tag` | Image tag | 22.21 |
| `autoscaling.enabled` | Enable HPA | true |
| `persistence.enabled` | Enable persistent storage | true |
| `persistence.size` | Storage size | 10Gi |
| `ingress.enabled` | Enable Ingress | true |
| `secrets.create` | Create secret from values | false |
| `secrets.existingSecret` | Use existing secret | "" |

## Installation Methods

### Method 1: Using values files (Recommended)

```bash
# Download and customize values
cp helm/lucide-crmt/values-production.yaml my-values.yaml
# Edit my-values.yaml with your settings
helm install lucide ./helm/lucide-crmt -f my-values.yaml
```

### Method 2: Using --set flags

```bash
helm install lucide ./helm/lucide-crmt \
  --set image.tag=22.21 \
  --set replicaCount=3 \
  --set ingress.hosts[0].host=accounting.example.com
```

### Method 3: Using multiple values files

```bash
helm install lucide ./helm/lucide-crmt \
  -f values.yaml \
  -f values-production.yaml \
  -f my-custom-values.yaml
```

## Configuration

### 1. Image Configuration

Push your Docker image to a registry and update:

```yaml
image:
  registry: gcr.io/your-project
  repository: lucide-crmt
  tag: "22.21"
```

### 2. Database Configuration

#### Option A: SQLite (Development/Small deployments)

Default configuration - no changes needed.

#### Option B: PostgreSQL (Production)

Enable PostgreSQL:

```yaml
database:
  enabled: true
  postgresql:
    auth:
      password: "your-secure-password"
```

Or use external PostgreSQL:

```yaml
env:
  DATABASE_TYPE: "postgresql"
  DATABASE_URL: "postgresql://user:password@external-db:5432/lucide_crmt"
```

### 3. Secrets Management

#### Option A: Create from values (Development only)

```yaml
secrets:
  create: true
  API_KEY: "your-api-key"
  SESSION_SECRET: "your-session-secret"
  JWT_SECRET: "your-jwt-secret"
```

#### Option B: Use existing Secret (Recommended)

```yaml
secrets:
  create: false
  existingSecret: lucide-secret-prod
```

Create the secret first:

```bash
kubectl create secret generic lucide-secret-prod \
  --from-literal=API_KEY='your-key' \
  --from-literal=SESSION_SECRET='your-session-secret' \
  --from-literal=JWT_SECRET='your-jwt-secret' \
  -n lucide-crmt-prod
```

#### Option C: Using Sealed Secrets

```bash
# Install sealed-secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.18.0/controller.yaml

# Create sealed secret
echo -n 'your-api-key' | kubectl create secret generic lucide-secret-prod \
  --dry-run=client --from-file=API_KEY=/dev/stdin -o yaml | \
  kubeseal -f - > sealed-secret.yaml

kubectl apply -f sealed-secret.yaml
```

#### Option D: Using External Secrets Operator

Reference values in `values-external-secrets.yaml` for AWS Secrets Manager, HashiCorp Vault, or GCP Secrets.

### 4. Ingress Configuration

#### Using NGINX Ingress Controller

```yaml
ingress:
  enabled: true
  className: "nginx"
  hosts:
    - host: accounting.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: lucide-tls
      hosts:
        - accounting.example.com
```

#### Using cert-manager for TLS

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.11.0/cert-manager.yaml

# Create ClusterIssuer for Let's Encrypt
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

### 5. Resource Configuration

Configure CPU and memory for your environment:

```yaml
resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

### 6. Autoscaling Configuration

```yaml
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
```

Requires metrics-server:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

## Deployment

### Initial Deployment

```bash
# Validate chart
helm lint ./helm/lucide-crmt

# Dry-run
helm install lucide ./helm/lucide-crmt \
  -f values-production.yaml \
  --dry-run \
  --debug

# Install
helm install lucide ./helm/lucide-crmt \
  -f values-production.yaml \
  -n lucide-crmt-prod \
  --create-namespace

# Wait for deployment
kubectl wait --for=condition=ready pod \
  -l app.kubernetes.io/name=lucide-crmt \
  -n lucide-crmt-prod \
  --timeout=300s
```

### Verify Deployment

```bash
# Check resources
kubectl get all -n lucide-crmt-prod

# Check pod status
kubectl get pods -n lucide-crmt-prod -w

# View logs
kubectl logs -f deployment/lucide-lucide-crmt -n lucide-crmt-prod

# Test health endpoint
kubectl port-forward svc/lucide-lucide-crmt 8787:80 -n lucide-crmt-prod
curl http://localhost:8787/api/health
```

## Upgrades

### Helm Upgrade

```bash
# Prepare new values
cp values-production.yaml values-production-new.yaml
# Edit with new settings

# Dry-run upgrade
helm upgrade lucide ./helm/lucide-crmt \
  -f values-production-new.yaml \
  --dry-run \
  --debug

# Perform upgrade
helm upgrade lucide ./helm/lucide-crmt \
  -f values-production-new.yaml

# Monitor rollout
kubectl rollout status deployment/lucide-lucide-crmt -n lucide-crmt-prod -w
```

### Update Image

```bash
# Update and upgrade
helm upgrade lucide ./helm/lucide-crmt \
  --set image.tag=22.22 \
  -n lucide-crmt-prod
```

## Scaling

### Manual Scaling

```bash
kubectl scale deployment lucide-lucide-crmt --replicas=5 -n lucide-crmt-prod
```

### Autoscaling

HPA automatically scales based on CPU/memory:

```bash
kubectl get hpa -n lucide-crmt-prod -w
```

## Monitoring

### Prometheus Integration

Enable ServiceMonitor:

```yaml
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
```

### View Metrics

```bash
kubectl get servicemonitor -n lucide-crmt-prod
```

### Custom Dashboards

Create Grafana dashboards targeting `lucide_crmt_*` metrics.

## Backup and Restore

### Enable Backup

```yaml
backup:
  enabled: true
  schedule: "0 2 * * *"  # Daily at 2 AM UTC
  retention: 30          # Keep 30 days
```

### Manual Backup

```bash
# Export database
kubectl exec -it pod/lucide-lucide-crmt-xxx \
  -n lucide-crmt-prod \
  -- sqlite3 /app/data/app.db ".dump" > backup.sql

# Or backup PVC
kubectl cp lucide-crmt-prod/lucide-lucide-crmt-xxx:/app/data ./backup-data
```

### Restore from Backup

```bash
kubectl cp ./backup-data lucide-crmt-prod/lucide-lucide-crmt-xxx:/app/data
```

## Troubleshooting

### Pod not starting

```bash
# Check pod status
kubectl describe pod lucide-lucide-crmt-xxx -n lucide-crmt-prod

# View logs
kubectl logs lucide-lucide-crmt-xxx -n lucide-crmt-prod --previous

# Check events
kubectl get events -n lucide-crmt-prod --sort-by='.lastTimestamp'
```

### Health check failing

```bash
# Test health endpoint
kubectl exec lucide-lucide-crmt-xxx -n lucide-crmt-prod -- \
  wget -O- http://localhost:8787/api/health

# Check application logs
kubectl logs -f lucide-lucide-crmt-xxx -n lucide-crmt-prod
```

### Persistent Volume issues

```bash
# Check PVC status
kubectl get pvc -n lucide-crmt-prod

# Check storage class
kubectl get storageclass

# Check PV status
kubectl get pv
```

### Memory/CPU issues

```bash
# Check resource usage
kubectl top pods -n lucide-crmt-prod
kubectl top nodes

# Check HPA status
kubectl get hpa -n lucide-crmt-prod -o wide
kubectl describe hpa lucide-lucide-crmt -n lucide-crmt-prod
```

## Security Best Practices

1. **Always use specific image tags** (never `latest`)
2. **Use Secrets for sensitive data** (not ConfigMaps)
3. **Enable Network Policies** for production
4. **Use Pod Security Policies** or Pod Security Standards
5. **Enable RBAC** and minimal permissions
6. **Regular backups** of persistent data
7. **Monitor pod metrics** (CPU, memory, restarts)
8. **Use resource limits** to prevent resource exhaustion
9. **Enable ingress TLS** for HTTPS
10. **Audit and log** all access

## Environment-Specific Deployments

### Development

```bash
helm install lucide ./helm/lucide-crmt \
  -f values-development.yaml \
  -n lucide-dev \
  --create-namespace
```

### Staging

```bash
helm install lucide ./helm/lucide-crmt \
  -f values-staging.yaml \
  -n lucide-staging \
  --create-namespace
```

### Production

```bash
helm install lucide ./helm/lucide-crmt \
  -f values-production.yaml \
  -n lucide-prod \
  --create-namespace
```

## Helm Hooks and Tests

### Test Chart

```bash
helm test lucide -n lucide-crmt-prod
```

### Lint Chart

```bash
helm lint ./helm/lucide-crmt
```

## Uninstall

```bash
# Uninstall release (keeps PVCs)
helm uninstall lucide -n lucide-crmt-prod

# Delete namespace and all resources
kubectl delete namespace lucide-crmt-prod
```

## Advanced Configuration

### Using multiple values files

```bash
helm install lucide ./helm/lucide-crmt \
  -f base-values.yaml \
  -f environment-values.yaml \
  -f secrets-values.yaml
```

### Using values from URL

```bash
helm install lucide ./helm/lucide-crmt \
  -f https://example.com/values-production.yaml
```

### Using secrets as values

```bash
helm install lucide ./helm/lucide-crmt \
  --set-string secrets.API_KEY="$(kubectl get secret -o jsonpath='{.data.API_KEY}' lucide-secret-prod | base64 -d)"
```

## Support and Documentation

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Lucide React Repository](https://github.com/celiotibes/Lucide-react)

## License

Apache License 2.0 - See LICENSE file
