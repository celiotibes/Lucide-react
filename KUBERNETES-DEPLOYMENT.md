# Kubernetes Deployment Guide - Phase 22.21

Complete guide for deploying Lucide React CRMT on Kubernetes.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Local Development (Minikube)](#local-development-minikube)
4. [Cloud Deployment](#cloud-deployment)
5. [Configuration](#configuration)
6. [Scaling Strategies](#scaling-strategies)
7. [Rolling Updates](#rolling-updates)
8. [Health Checks](#health-checks)
9. [Monitoring and Observability](#monitoring-and-observability)
10. [Troubleshooting](#troubleshooting)
11. [Best Practices](#best-practices)

## Prerequisites

### Required Software

- **Kubernetes Cluster** (1.19+)
  - Local: Minikube, Docker Desktop, Kind
  - Cloud: GKE, EKS, AKS

- **Helm 3.0+**
  ```bash
  curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  ```

- **kubectl 1.19+**
  ```bash
  curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
  chmod +x kubectl && sudo mv kubectl /usr/local/bin/
  ```

- **Docker** (for building images)
  ```bash
  # Install Docker Desktop or Docker Engine
  ```

### Optional Tools

- **metrics-server** (for HPA/autoscaling)
- **nginx-ingress-controller** (for Ingress)
- **cert-manager** (for HTTPS/TLS)
- **sealed-secrets** or **external-secrets-operator** (for secrets management)
- **Prometheus & Grafana** (for monitoring)

### Cluster Requirements

| Component | Development | Staging | Production |
|-----------|-------------|---------|------------|
| Nodes | 1 | 2+ | 3+ |
| Total CPU | 2 cores | 4 cores | 8+ cores |
| Total Memory | 4 GB | 8 GB | 16+ GB |
| Storage | 10 GB | 50 GB | 100+ GB |
| Network | 100 Mbps | 1 Gbps | 10+ Gbps |

## Quick Start

### 1. Build and Push Docker Image

```bash
# Build Docker image
docker build -t lucide-crmt:22.21 .

# Tag for registry
docker tag lucide-crmt:22.21 gcr.io/your-project/lucide-crmt:22.21

# Push to registry
docker push gcr.io/your-project/lucide-crmt:22.21
```

### 2. Create Secrets

```bash
# Create namespace
kubectl create namespace lucide-crmt-prod

# Create secret with sensitive data
kubectl create secret generic lucide-secret-prod \
  --from-literal=API_KEY='your-secure-api-key' \
  --from-literal=SESSION_SECRET='your-session-secret' \
  --from-literal=JWT_SECRET='your-jwt-secret' \
  -n lucide-crmt-prod
```

### 3. Deploy with Helm

```bash
# Validate chart
helm lint ./helm/lucide-crmt

# Install release
helm install lucide ./helm/lucide-crmt \
  -f ./helm/lucide-crmt/values-production.yaml \
  -n lucide-crmt-prod \
  --set image.registry=gcr.io/your-project

# Verify deployment
kubectl get all -n lucide-crmt-prod
```

### 4. Verify Deployment

```bash
# Check pod status
kubectl get pods -n lucide-crmt-prod

# View logs
kubectl logs -f deployment/lucide-lucide-crmt -n lucide-crmt-prod

# Test health endpoint
kubectl port-forward svc/lucide-lucide-crmt 8787:80 -n lucide-crmt-prod
curl http://localhost:8787/api/health
```

## Local Development (Minikube)

### 1. Install Minikube

```bash
# macOS
brew install minikube

# Linux
curl -Lo minikube https://github.com/kubernetes/minikube/releases/latest/download/minikube-linux-amd64
chmod +x minikube && sudo mv minikube /usr/local/bin/

# Windows
choco install minikube
```

### 2. Start Minikube Cluster

```bash
# Start cluster with sufficient resources
minikube start \
  --cpus=4 \
  --memory=8192 \
  --disk-size=50g \
  --kubernetes-version=v1.27.0

# Enable required addons
minikube addons enable ingress
minikube addons enable metrics-server
minikube addons enable storage-provisioner
```

### 3. Build Image in Minikube

```bash
# Use Minikube's Docker daemon
eval $(minikube docker-env)

# Build image
docker build -t lucide-crmt:22.21 .

# Verify image
docker images | grep lucide-crmt
```

### 4. Deploy to Minikube

```bash
# Create namespace
kubectl create namespace lucide-dev

# Create secret
kubectl create secret generic lucide-secret \
  --from-literal=API_KEY='dev-key' \
  --from-literal=SESSION_SECRET='dev-secret' \
  --from-literal=JWT_SECRET='dev-jwt' \
  -n lucide-dev

# Deploy with Helm
helm install lucide ./helm/lucide-crmt \
  -f ./helm/lucide-crmt/values-development.yaml \
  -n lucide-dev \
  --set image.tag=22.21

# Get Minikube IP
minikube ip

# Access application
# Add to /etc/hosts: <minikube-ip> accounting.local
curl http://accounting.local/api/health
```

### 5. Minikube Dashboard

```bash
minikube dashboard

# Or access via terminal
kubectl proxy
# Visit http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
```

### 6. Clean Up Minikube

```bash
# Delete resources
kubectl delete namespace lucide-dev
helm uninstall lucide -n lucide-dev

# Delete cluster
minikube delete
```

## Cloud Deployment

### Google Kubernetes Engine (GKE)

```bash
# Create GKE cluster
gcloud container clusters create lucide-crmt \
  --zone=us-central1-a \
  --num-nodes=3 \
  --machine-type=n1-standard-2 \
  --enable-autoscaling \
  --min-nodes=3 \
  --max-nodes=10

# Get credentials
gcloud container clusters get-credentials lucide-crmt --zone=us-central1-a

# Install ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.7.0/deploy/static/provider/gcp/deploy.yaml

# Deploy
helm install lucide ./helm/lucide-crmt \
  -f ./helm/lucide-crmt/values-production.yaml \
  -n lucide-crmt-prod \
  --create-namespace \
  --set image.registry=gcr.io/your-project
```

### Amazon EKS

```bash
# Create cluster
eksctl create cluster \
  --name lucide-crmt \
  --region us-east-1 \
  --nodes=3 \
  --node-type=t3.medium

# Get credentials
aws eks update-kubeconfig --region us-east-1 --name lucide-crmt

# Install ALB ingress controller
curl https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.6.0/docs/install/iam_policy.json -o iam_policy.json
aws iam create-policy --policy-name AWSLoadBalancerControllerIAMPolicy --policy-document file://iam_policy.json

# Deploy
helm install lucide ./helm/lucide-crmt \
  -f ./helm/lucide-crmt/values-production.yaml \
  -n lucide-crmt-prod \
  --create-namespace \
  --set image.registry=ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
```

### Microsoft Azure AKS

```bash
# Create cluster
az aks create \
  --resource-group myResourceGroup \
  --name lucide-crmt \
  --node-count 3 \
  --vm-set-type VirtualMachineScaleSets \
  --enable-managed-identity

# Get credentials
az aks get-credentials --resource-group myResourceGroup --name lucide-crmt

# Deploy
helm install lucide ./helm/lucide-crmt \
  -f ./helm/lucide-crmt/values-production.yaml \
  -n lucide-crmt-prod \
  --create-namespace
```

## Configuration

### Storage Configuration

#### Local Storage (Development)

```yaml
persistence:
  storageClass: "standard"
  size: 10Gi
```

#### Google Cloud Persistent Disks (GKE)

```yaml
persistence:
  storageClass: "standard-rwo"
  size: 100Gi
```

#### AWS EBS (EKS)

```yaml
persistence:
  storageClass: "gp3"
  size: 100Gi
```

#### Azure Disk (AKS)

```yaml
persistence:
  storageClass: "managed-csi"
  size: 100Gi
```

### Database Configuration

#### SQLite (Development)

```yaml
database:
  enabled: false
env:
  DATABASE_TYPE: "sqlite"
  DATABASE_URL: "file:./data/app.db"
```

#### PostgreSQL (Production)

Enable Helm subchart:

```yaml
database:
  enabled: true
  postgresql:
    auth:
      password: "secure-password"
    primary:
      persistence:
        size: 100Gi
```

Or use external database:

```yaml
env:
  DATABASE_TYPE: "postgresql"
  DATABASE_URL: "postgresql://user:pass@rds.amazonaws.com:5432/lucide_crmt"
```

### Ingress Configuration

#### NGINX Ingress

```yaml
ingress:
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

#### AWS ALB Ingress

```yaml
ingress:
  className: "aws-alb"
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
  hosts:
    - host: accounting.example.com
```

#### GCP Load Balancer

```yaml
ingress:
  className: "gce"
  annotations:
    kubernetes.io/ingress.class: "gce"
    kubernetes.io/ingress.global-static-ip-name: "lucide-ip"
```

## Scaling Strategies

### 1. Horizontal Pod Autoscaling (HPA)

Enable in values:

```yaml
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
```

Monitor scaling:

```bash
kubectl get hpa lucide-lucide-crmt -n lucide-crmt-prod -w
```

### 2. Vertical Pod Autoscaling (VPA)

For right-sizing:

```bash
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/download/vertical-pod-autoscaler-0.14.0/vpa-v0.14.0.yaml
```

### 3. Cluster Autoscaling

For cloud providers:

```bash
# GKE
gcloud container clusters update lucide-crmt \
  --enable-autoscaling \
  --min-nodes=3 \
  --max-nodes=20

# EKS with Auto Scaling Group
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name lucide-crmt-asg \
  --min-size=3 \
  --max-size=20
```

### 4. Capacity Planning

```bash
# Check current resource usage
kubectl top pods -n lucide-crmt-prod
kubectl top nodes

# Get resource metrics
kubectl get pods -o json | jq '.items[].spec.containers[].resources'
```

## Rolling Updates

### Helm-based Updates

```bash
# Prepare new values
cp values-production.yaml values-production-new.yaml
# Edit configuration

# Dry-run
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

### Image Update

```bash
# Method 1: Using Helm
helm upgrade lucide ./helm/lucide-crmt \
  --set image.tag=22.22

# Method 2: Direct kubectl
kubectl set image deployment/lucide-lucide-crmt \
  lucide-crmt=gcr.io/your-project/lucide-crmt:22.22 \
  -n lucide-crmt-prod

# Monitor rollout
kubectl rollout status deployment/lucide-lucide-crmt -n lucide-crmt-prod -w
```

### Rollback Strategy

```bash
# View rollout history
kubectl rollout history deployment/lucide-lucide-crmt -n lucide-crmt-prod

# Rollback to previous version
kubectl rollout undo deployment/lucide-lucide-crmt -n lucide-crmt-prod

# Rollback to specific revision
kubectl rollout undo deployment/lucide-lucide-crmt --to-revision=2 -n lucide-crmt-prod
```

## Health Checks

### Liveness Probe

Automatically restarts unhealthy pods:

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 8787
  initialDelaySeconds: 20
  periodSeconds: 10
  failureThreshold: 3
```

### Readiness Probe

Removes unhealthy pods from load balancer:

```yaml
readinessProbe:
  httpGet:
    path: /api/health
    port: 8787
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 2
```

### Health Endpoint Implementation

The application must implement `/api/health`:

```bash
curl http://localhost:8787/api/health
# Response: {"status":"ok","timestamp":"2026-10-08T12:00:00Z"}
```

## Monitoring and Observability

### Prometheus Integration

Enable ServiceMonitor:

```yaml
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: 30s
```

### Grafana Dashboards

Create dashboard with metrics:

- `container_cpu_usage_seconds_total`
- `container_memory_working_set_bytes`
- `http_requests_total`
- `http_request_duration_seconds`

### Logging

View application logs:

```bash
# Current logs
kubectl logs deployment/lucide-lucide-crmt -n lucide-crmt-prod

# Follow logs
kubectl logs -f deployment/lucide-lucide-crmt -n lucide-crmt-prod

# Previous logs (if pod crashed)
kubectl logs deployment/lucide-lucide-crmt --previous -n lucide-crmt-prod

# Logs from specific pod
kubectl logs pod/lucide-lucide-crmt-xxxxx -n lucide-crmt-prod

# Stream logs from multiple pods
kubectl logs -f -l app=lucide-crmt -n lucide-crmt-prod --all-containers
```

### Events Monitoring

```bash
kubectl get events -n lucide-crmt-prod --sort-by='.lastTimestamp'
kubectl describe pod lucide-lucide-crmt-xxxxx -n lucide-crmt-prod
```

## Troubleshooting

### Pod Debugging

```bash
# Execute command in pod
kubectl exec -it pod/lucide-lucide-crmt-xxxxx -n lucide-crmt-prod -- /bin/sh

# Check environment variables
kubectl exec pod/lucide-lucide-crmt-xxxxx -n lucide-crmt-prod -- env | grep DATABASE

# Test database connection
kubectl exec pod/lucide-lucide-crmt-xxxxx -n lucide-crmt-prod -- \
  sqlite3 /app/data/app.db ".tables"
```

### Network Debugging

```bash
# Check service endpoints
kubectl get endpoints lucide-lucide-crmt -n lucide-crmt-prod

# Test connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  sh -c 'wget -O- http://lucide-lucide-crmt:80/api/health'

# Port-forward for debugging
kubectl port-forward svc/lucide-lucide-crmt 8787:80 -n lucide-crmt-prod
curl http://localhost:8787/api/health
```

### Storage Issues

```bash
# Check PVC status
kubectl get pvc -n lucide-crmt-prod

# Check PV status
kubectl get pv

# Describe PVC for events
kubectl describe pvc lucide-lucide-crmt-data -n lucide-crmt-prod

# Check storage class
kubectl get storageclass
```

## Best Practices

### 1. Image Management

- Use specific version tags (never `latest`)
- Build multi-stage Docker images (smaller size)
- Scan images for vulnerabilities
- Use private registries for production

### 2. Resource Management

- Set appropriate resource requests and limits
- Monitor actual usage with metrics-server
- Use HPA for automatic scaling
- Implement PodDisruptionBudget for stability

### 3. Security

- Use Secrets for sensitive data (not ConfigMaps)
- Enable RBAC with minimal permissions
- Use NetworkPolicies to restrict traffic
- Regular security audits and updates
- Enable Pod Security Standards

### 4. High Availability

- Run multiple replicas (minimum 3 for production)
- Distribute across availability zones
- Use PodAntiAffinity to spread pods
- Implement health checks
- Plan for disaster recovery

### 5. Data Persistence

- Use appropriate StorageClass for your cloud provider
- Regular backups of persistent data
- Test restore procedures
- Monitor storage usage

### 6. Observability

- Configure centralized logging
- Enable Prometheus metrics
- Set up Grafana dashboards
- Configure alerting for critical metrics
- Regular log reviews

### 7. Maintenance

- Regular cluster updates
- Regular application updates via Helm
- Monitor for deprecated APIs
- Plan maintenance windows
- Document all changes

## Advanced Topics

### Using ExternalSecrets Operator

```bash
# Install ESO
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets-system --create-namespace

# Create SecretStore (AWS Secrets Manager example)
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-operator
EOF

# Create ExternalSecret
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: lucide-secret
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets
  target:
    name: lucide-secret
    creationPolicy: Owner
  data:
    - secretKey: API_KEY
      remoteRef:
        key: lucide-crmt/api-key
EOF
```

### Using Sealed Secrets

```bash
# Install sealed-secrets
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.18.0/controller.yaml

# Create and seal secret
kubectl create secret generic lucide-secret \
  --from-literal=API_KEY='your-key' \
  --dry-run=client -o yaml | \
  kubeseal -f - > sealed-secret.yaml

# Apply sealed secret
kubectl apply -f sealed-secret.yaml
```

## References

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/cluster-administration/manage-deployment/)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

---

**Phase 22.21 - Kubernetes Deployment**  
**Lucide React CRMT**  
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
