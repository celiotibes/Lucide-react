# Kubernetes Manifests

This directory contains Kubernetes manifests for deploying the Lucide React Accounting System.

## Files

| File | Purpose | Required |
|------|---------|----------|
| `app-deployment.yaml` | Deployment with 2-5 replicas, health checks, resource limits | Yes |
| `app-service.yaml` | ClusterIP service for internal pod communication | Yes |
| `configmap.yaml` | Non-sensitive configuration (environment variables) | Yes |
| `secret.yaml` | Template for sensitive data (API keys, tokens) | Yes |
| `pvc.yaml` | PersistentVolumeClaim for SQLite database | Yes |
| `hpa.yaml` | Horizontal Pod Autoscaler (CPU/memory-based scaling) | No |
| `ingress.yaml` | Ingress for external HTTP/HTTPS routing (requires ingress controller) | No |
| `external-secret.yaml` | Integration with external secret managers (AWS/Vault/GCP/Azure) | No |

## Quick Deploy

```bash
# Deploy all manifests
kubectl apply -f .

# Or deploy specific files
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f pvc.yaml
kubectl apply -f app-deployment.yaml
kubectl apply -f app-service.yaml
kubectl apply -f hpa.yaml

# Verify
kubectl get all -l app=lucide-app
```

## Configuration

### ConfigMap

Non-sensitive configuration like port, log level, cache TTLs.

Edit `configmap.yaml` to customize for your environment.

### Secret

Sensitive data: API keys, tokens, credentials.

**NEVER commit actual secret values to git.**

Create secret safely:

```bash
kubectl create secret generic lucide-secret \
  --from-literal=API_KEY='your-secure-key' \
  --from-literal=SESSION_SECRET='your-session-secret' \
  --dry-run=client -o yaml | kubectl apply -f -
```

For production, use:
- **Sealed Secrets** (encrypted at rest)
- **External Secrets Operator** (fetch from AWS/Vault/GCP/Azure)

See `external-secret.yaml` for examples.

### PVC (Persistent Volume Claim)

Stores SQLite database at `/app/data`.

Requires:
- Available storage class (check: `kubectl get storageclass`)
- 10Gi minimum space

Adjust size in `pvc.yaml` if needed.

## Deployment Workflow

### 1. Initial Deployment

```bash
# Create namespace (optional)
kubectl create namespace accounting

# Apply all manifests
kubectl apply -f . -n accounting

# Wait for pod to be ready
kubectl wait --for=condition=ready pod -l app=lucide-app -n accounting --timeout=300s

# Port-forward for testing
kubectl port-forward svc/lucide-app 8787:80 -n accounting

# Test health endpoint
curl http://localhost:8787/api/health
```

### 2. Update Configuration

```bash
# Edit ConfigMap
kubectl edit configmap lucide-config -n accounting

# Restart pods to pick up changes
kubectl rollout restart deployment lucide-app -n accounting
```

### 3. Update Secrets

```bash
# Update secret
kubectl create secret generic lucide-secret \
  --from-literal=NEW_KEY='value' \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods
kubectl rollout restart deployment lucide-app
```

### 4. Update Application Image

```bash
# Push new image to registry
docker tag lucide-react:new-version your-registry/lucide-react:new-version
docker push your-registry/lucide-react:new-version

# Update deployment
kubectl set image deployment/lucide-app lucide-app=your-registry/lucide-react:new-version

# Monitor rollout
kubectl rollout status deployment/lucide-app -w
```

### 5. Scale

```bash
# Manual scale
kubectl scale deployment lucide-app --replicas=5

# HPA will auto-scale based on CPU/memory
kubectl get hpa lucide-app-hpa -w
```

## Monitoring

```bash
# Watch pod status
kubectl get pods -l app=lucide-app -w

# View logs
kubectl logs -l app=lucide-app -f --all-containers

# Check resource usage
kubectl top pods -l app=lucide-app --containers

# View events
kubectl get events --sort-by='.lastTimestamp' | grep lucide
```

## Troubleshooting

### Pod not starting

```bash
# Check pod status
kubectl describe pod lucide-app-xxx

# View logs
kubectl logs lucide-app-xxx -f

# Common issues:
# - Missing ConfigMap/Secret
# - Health check failing
# - Database connection error
```

### Readiness probe failing

```bash
# Check if app is responding
kubectl exec lucide-app-xxx -- wget -O- http://localhost:8787/api/health

# Check recent logs
kubectl logs lucide-app-xxx --tail=20
```

### Database issues

```bash
# Check database exists
kubectl exec lucide-app-xxx -- ls -la /app/data/

# Check SQLite
kubectl exec lucide-app-xxx -- sqlite3 /app/data/lucide.sqlite ".tables"
```

### HPA not working

```bash
# Install metrics-server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify metrics
kubectl top nodes
kubectl top pods -l app=lucide-app
```

## Environment-specific Deployments

### Development

```bash
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f pvc.yaml
kubectl apply -f app-deployment.yaml
kubectl set env deployment/lucide-app NODE_ENV=development
```

### Staging

```bash
# Create separate ConfigMap for staging
kubectl apply -f configmap-staging.yaml
# Or edit existing: NODE_ENV=production, SENTRY_ENVIRONMENT=staging
```

### Production

```bash
# Use sealed-secrets or external-secrets for secrets
# Use separate production ConfigMap
# Enable ingress with TLS
# Enable HPA
# Configure monitoring
```

## Backup & Restore

```bash
# Backup database
kubectl exec lucide-app-xxx -- sqlite3 /app/data/lucide.sqlite ".dump" > backup.sql

# Backup PVC
kubectl cp lucide-app-xxx:/app/data ./backup-data

# Restore from backup
kubectl cp ./backup-data lucide-app-xxx:/app/data
```

## Cleanup

```bash
# Delete specific resources
kubectl delete deployment lucide-app
kubectl delete service lucide-app
kubectl delete configmap lucide-config
kubectl delete secret lucide-secret
kubectl delete pvc lucide-data-pvc

# Delete all at once
kubectl delete -f .

# Delete namespace
kubectl delete namespace accounting
```

## Best Practices

1. **Always use specific image tags** (never `latest` in production)
2. **Use Sealed Secrets or External Secrets** for sensitive data
3. **Enable resource limits** (prevent pod from consuming all cluster resources)
4. **Use HPA** for automatic scaling
5. **Enable ingress with TLS** for HTTPS
6. **Regular backups** of database
7. **Monitor pod metrics** (CPU, memory, restarts)
8. **Use multiple environments** (dev, staging, prod)
9. **Review logs regularly** for errors
10. **Test disaster recovery** procedures

## Further Reading

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Deployment Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)
- [Security Best Practices](https://kubernetes.io/docs/concepts/security/)
- [Pod Security](https://kubernetes.io/docs/concepts/security/pod-security-standards/)

---

For complete setup instructions, see [../DOCKER-SETUP.md](../DOCKER-SETUP.md)
