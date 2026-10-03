# Docker & Kubernetes Setup Guide

Complete containerization setup for the Lucide React Accounting System with Docker and Kubernetes manifests.

## Table of Contents

- [Quick Start](#quick-start)
- [Local Development with Docker Compose](#local-development-with-docker-compose)
- [Building Docker Images](#building-docker-images)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Environment Configuration](#environment-configuration)
- [Secrets Management](#secrets-management)
- [Health Checks & Monitoring](#health-checks--monitoring)
- [Scaling](#scaling)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- Node.js 20+ (for local development without Docker)
- kubectl 1.26+ (for Kubernetes deployment)
- Helm 3.0+ (optional, for advanced deployments)

### Run Locally with Docker Compose

```bash
# 1. Copy environment template
cp .env.docker .env

# 2. Edit .env with your configuration
nano .env

# 3. Start all services
docker-compose up --build

# 4. Verify the app is running
curl http://localhost:8787/api/health

# 5. View logs
docker-compose logs -f app
```

The application will be available at:
- **Backend API**: http://localhost:8787
- **Frontend** (if running): http://localhost:5173

---

## Local Development with Docker Compose

### Configuration

The `docker-compose.yml` includes:

- **app**: Express.js backend server (Node 20 Alpine)
- **data**: SQLite database volume
- **network**: `lucide-network` for service communication

### Services

#### Backend (Express.js)

```bash
# Start backend only
docker-compose up app

# Rebuild on code changes
docker-compose up --build app

# View logs
docker-compose logs -f app

# Stop
docker-compose down
```

#### Volume Management

```bash
# View database location
ls -lah ./data/

# Access database from container
docker-compose exec app sqlite3 ./data/lucide.sqlite ".tables"

# Backup database
cp ./data/lucide.sqlite ./data/lucide.sqlite.backup

# Restore database
cp ./data/lucide.sqlite.backup ./data/lucide.sqlite
```

#### Environment Variables

Copy `.env.docker` to `.env` and customize:

```bash
# Core settings
NODE_ENV=development
PORT=8787
DATABASE_URL=file:./data/lucide.sqlite

# Security (change these!)
API_KEY=your-secure-api-key-min-32-chars
SESSION_SECRET=your-session-secret-min-32-chars

# Integrations (optional)
ASAAS_API_KEY=your-asaas-key
PLUGGY_CLIENT_ID=your-pluggy-id
PLUGGY_CLIENT_SECRET=your-pluggy-secret

# Notifications
ALERTS_EMAIL_PROVIDER=resend
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
```

---

## Building Docker Images

### Build Multi-stage Image

```bash
# Build production image
docker build -t lucide-react:1.0.0 .

# Build with specific build arg
docker build --build-arg NODE_ENV=production -t lucide-react:1.0.0 .

# Verify image size
docker images | grep lucide-react
```

Expected image size: **~180-200 MB** (optimized with Alpine Linux)

### Push to Registry

#### Docker Hub

```bash
# Login
docker login

# Tag image
docker tag lucide-react:1.0.0 your-username/lucide-react:1.0.0

# Push
docker push your-username/lucide-react:1.0.0
```

#### AWS ECR

```bash
# Create repository
aws ecr create-repository --repository-name lucide-react --region us-east-1

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# Tag image
docker tag lucide-react:1.0.0 123456789.dkr.ecr.us-east-1.amazonaws.com/lucide-react:1.0.0

# Push
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/lucide-react:1.0.0
```

#### Google Cloud Registry

```bash
# Configure Docker
gcloud auth configure-docker gcr.io

# Tag image
docker tag lucide-react:1.0.0 gcr.io/my-project/lucide-react:1.0.0

# Push
docker push gcr.io/my-project/lucide-react:1.0.0
```

### Image Details

The multi-stage Dockerfile creates two stages:

1. **Builder** (discarded): Compiles TypeScript, installs all dependencies
2. **Runtime** (final): Minimal image with only production dependencies

Benefits:
- Final image size: ~180MB vs ~500MB without multi-stage
- Security: No build tools in production image
- Faster deployment: Smaller pull times

---

## Kubernetes Deployment

### Prerequisites

```bash
# 1. Create a Kubernetes cluster
# GKE
gcloud container clusters create lucide-cluster --zone us-central1-a --num-nodes 2

# AKS
az aks create --resource-group myResourceGroup --name lucide-cluster --node-count 2

# EKS
eksctl create cluster --name lucide-cluster --region us-east-1

# 2. Get credentials
kubectl cluster-info
kubectl config current-context

# 3. Verify cluster
kubectl get nodes
kubectl get namespaces
```

### Deploy to Kubernetes

```bash
# 1. Create ConfigMap
kubectl apply -f k8s/configmap.yaml

# 2. Create Secret (see Secrets Management section)
kubectl apply -f k8s/secret.yaml

# 3. Create PersistentVolumeClaim (for data storage)
kubectl apply -f k8s/pvc.yaml

# 4. Deploy application
kubectl apply -f k8s/app-deployment.yaml

# 5. Create service
kubectl apply -f k8s/app-service.yaml

# 6. Setup autoscaling
kubectl apply -f k8s/hpa.yaml

# 7. Setup ingress (optional, requires ingress controller)
kubectl apply -f k8s/ingress.yaml
```

### Verify Deployment

```bash
# Check deployment status
kubectl get deployment lucide-app
kubectl describe deployment lucide-app

# Check pods
kubectl get pods -l app=lucide-app
kubectl logs -l app=lucide-app --tail=50 -f

# Check service
kubectl get svc lucide-app
kubectl describe svc lucide-app

# Check HPA
kubectl get hpa lucide-app-hpa
kubectl describe hpa lucide-app-hpa

# Port-forward for local testing
kubectl port-forward svc/lucide-app 8787:80
curl http://localhost:8787/api/health
```

### All-in-one Deployment

```bash
# Deploy all manifests at once
kubectl apply -f k8s/

# Monitor
kubectl get all -l app=lucide-app

# Cleanup
kubectl delete -f k8s/
```

---

## Environment Configuration

### Configuration Hierarchy

1. **ConfigMap** (`k8s/configmap.yaml`): Non-sensitive, environment-specific
2. **Secret** (`k8s/secret.yaml`): Sensitive data (API keys, tokens)
3. **Environment Variables**: Individual pod settings

### ConfigMap Usage

```bash
# View current ConfigMap
kubectl get configmap lucide-config -o yaml

# Update ConfigMap
kubectl apply -f k8s/configmap.yaml

# Edit live ConfigMap
kubectl edit configmap lucide-config

# Reload pods after ConfigMap change
kubectl rollout restart deployment lucide-app
```

### Multi-Environment Setup

Create separate ConfigMaps for each environment:

```yaml
# Development
kubectl apply -f k8s/configmap-dev.yaml

# Staging
kubectl apply -f k8s/configmap-staging.yaml

# Production
kubectl apply -f k8s/configmap-prod.yaml
```

Then patch deployment to use the correct ConfigMap:

```bash
kubectl patch deployment lucide-app -p '{"spec":{"template":{"spec":{"containers":[{"name":"lucide-app","envFrom":[{"configMapRef":{"name":"lucide-config-prod"}}]}]}}}}'
```

---

## Secrets Management

### IMPORTANT: Secret Security

**Base64 is NOT encryption!** Secrets in this YAML template are only base64-encoded, which is reversible.

For production, implement proper secret management:

### Option 1: Sealed Secrets (Recommended for GitOps)

```bash
# Install sealed-secrets
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/sealed-secrets-0.24.0.yaml

# Create a secret file
kubectl create secret generic lucide-secret \
  --from-literal=API_KEY='your-api-key' \
  --from-literal=SESSION_SECRET='your-session-secret' \
  --from-literal=ASAAS_API_KEY='your-asaas-key' \
  --dry-run=client -o yaml > secret.yaml

# Encrypt it
kubeseal -f secret.yaml -w secret-sealed.yaml

# Apply sealed secret
kubectl apply -f secret-sealed.yaml

# Verify
kubectl get sealedsecret
kubectl get secret lucide-secret -o yaml
```

### Option 2: External Secrets Operator (Recommended for AWS/GCP/Azure)

```bash
# Install external-secrets
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets-system --create-namespace

# Create SecretStore (example: AWS Secrets Manager)
kubectl apply -f k8s/external-secret-store.yaml

# Create ExternalSecret
kubectl apply -f k8s/external-secret.yaml

# Verify
kubectl get externalsecrets
kubectl describe externalsecret lucide-secret
```

### Option 3: Native Kubernetes Secret (Development Only)

```bash
# Create from env file
kubectl create secret generic lucide-secret --from-env-file=.env.kubernetes

# Create from individual files
kubectl create secret generic lucide-secret \
  --from-file=api-key=./secrets/api-key.txt \
  --from-file=session-secret=./secrets/session-secret.txt

# Create from literal values
kubectl create secret generic lucide-secret \
  --from-literal=API_KEY='your-key' \
  --from-literal=SESSION_SECRET='your-secret'
```

### Rotating Secrets

```bash
# Update secret
kubectl create secret generic lucide-secret \
  --from-literal=API_KEY='new-api-key' \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods to pick up new secrets
kubectl rollout restart deployment lucide-app

# Verify
kubectl logs -l app=lucide-app --tail=20
```

---

## Health Checks & Monitoring

### Health Check Endpoint

The application provides a health check endpoint:

```bash
# Check application health
curl http://localhost:8787/api/health

# Expected response:
# {"status": "ok", "timestamp": "2026-10-03T12:00:00Z"}
```

### Kubernetes Health Probes

Configured in `app-deployment.yaml`:

```yaml
# Liveness: Restart if pod is unhealthy
livenessProbe:
  httpGet:
    path: /api/health
    port: 8787
  initialDelaySeconds: 20
  periodSeconds: 10
  failureThreshold: 3

# Readiness: Remove from load balancer if not ready
readinessProbe:
  httpGet:
    path: /api/health
    port: 8787
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 2
```

### Monitoring Health

```bash
# Watch pod status
kubectl get pods -l app=lucide-app -w

# Check probe events
kubectl describe pod -l app=lucide-app

# View detailed status
kubectl get pods -o wide -l app=lucide-app

# Check restart count
kubectl get pods -l app=lucide-app -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}'
```

### Prometheus Metrics (Optional)

```yaml
# Ingress annotation (in ingress.yaml)
prometheus.io/scrape: "true"
prometheus.io/port: "8787"
prometheus.io/path: "/metrics"
```

Install Prometheus:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack
```

---

## Scaling

### Horizontal Pod Autoscaling (HPA)

Automatically scales pods based on CPU/memory usage.

```bash
# View HPA status
kubectl get hpa lucide-app-hpa -w

# View detailed HPA info
kubectl describe hpa lucide-app-hpa

# Manual scaling
kubectl scale deployment lucide-app --replicas=5

# Edit HPA
kubectl edit hpa lucide-app-hpa
```

**HPA Configuration** (from `k8s/hpa.yaml`):

- **Min replicas**: 2
- **Max replicas**: 5
- **CPU threshold**: 70%
- **Memory threshold**: 80%

### Scaling Scenarios

```bash
# Scale up (add replicas)
kubectl scale deployment lucide-app --replicas=5

# Scale down
kubectl scale deployment lucide-app --replicas=2

# Watch scaling in action
watch 'kubectl get pods -l app=lucide-app'

# Monitor HPA decisions
kubectl describe hpa lucide-app-hpa
```

### Vertical Pod Autoscaling (Optional)

For automatic resource request/limit tuning:

```bash
# Install VPA
helm repo add fairwinds-stable https://charts.fairwinds.com/stable
helm install vpa fairwinds-stable/vpa

# VPA recommendations
kubectl describe vpa lucide-app-vpa
```

---

## Troubleshooting

### Common Issues

#### 1. Pod won't start / CrashLoopBackOff

```bash
# Check logs
kubectl logs lucide-app-xxx -f

# Check events
kubectl describe pod lucide-app-xxx

# Common causes:
# - Missing environment variables (check ConfigMap/Secret)
# - Health check failing immediately
# - Database connection issue
```

Solution:

```bash
# Verify ConfigMap
kubectl get configmap lucide-config -o yaml

# Verify Secret
kubectl get secret lucide-secret -o yaml

# Check pod events
kubectl describe pod -l app=lucide-app
```

#### 2. Readiness probe failing

```bash
# Check if app is responding
kubectl exec lucide-app-xxx -- wget -O- http://localhost:8787/api/health

# Check app logs
kubectl logs lucide-app-xxx --tail=50

# Increase initialDelaySeconds if needed
kubectl edit deployment lucide-app
```

#### 3. Database connection errors

```bash
# Check if database exists
kubectl exec lucide-app-xxx -- ls -la /app/data/

# Check database connectivity
kubectl exec lucide-app-xxx -- sqlite3 /app/data/lucide.sqlite ".tables"

# Check PVC status
kubectl get pvc
kubectl describe pvc lucide-data-pvc
```

#### 4. No metric data in HPA

```bash
# Install metrics-server (required for HPA)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify metrics
kubectl top nodes
kubectl top pods -l app=lucide-app

# Check HPA status
kubectl get hpa lucide-app-hpa
kubectl describe hpa lucide-app-hpa
```

#### 5. Ingress not working

```bash
# Check ingress controller
kubectl get pods -n ingress-nginx

# Install if missing
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/cloud/deploy.yaml

# Check ingress status
kubectl get ingress lucide-app-ingress
kubectl describe ingress lucide-app-ingress

# Check DNS
nslookup lucide-react.example.com
```

### Debugging Commands

```bash
# Get real-time logs from all pods
kubectl logs -l app=lucide-app -f --all-containers

# Execute command in pod
kubectl exec lucide-app-xxx -- ps aux

# Port-forward for direct access
kubectl port-forward lucide-app-xxx 8787:8787

# Get pod environment
kubectl exec lucide-app-xxx -- env

# Get pod info
kubectl get pod lucide-app-xxx -o yaml

# Watch all resources
kubectl get all -l app=lucide-app -w

# Check resource usage
kubectl top pods lucide-app-xxx
```

### Resource Issues

```bash
# Check node resources
kubectl describe nodes

# Check pod resource usage
kubectl top pods -l app=lucide-app --containers

# Edit resource limits
kubectl edit deployment lucide-app
# Update resources.limits and resources.requests

# Get current limits
kubectl get deployment lucide-app -o jsonpath='{.spec.template.spec.containers[0].resources}'
```

---

## Advanced Topics

### Multiple Environments

Create separate namespaces and configurations:

```bash
# Create namespaces
kubectl create namespace staging
kubectl create namespace production

# Deploy to staging
kubectl apply -f k8s/configmap-staging.yaml -n staging
kubectl apply -f k8s/secret.yaml -n staging
kubectl apply -f k8s/app-deployment.yaml -n staging

# Deploy to production
kubectl apply -f k8s/configmap-prod.yaml -n production
kubectl apply -f k8s/secret.yaml -n production
kubectl apply -f k8s/app-deployment.yaml -n production
```

### Backup and Restore

```bash
# Backup database
kubectl exec lucide-app-xxx -- sqlite3 /app/data/lucide.sqlite ".dump" > lucide.sql

# Copy database locally
kubectl cp lucide-app-xxx:/app/data/lucide.sqlite ./lucide.sqlite

# Restore from backup
kubectl cp ./lucide.sqlite lucide-app-xxx:/app/data/lucide.sqlite
```

### Rolling Updates

```bash
# Update image
kubectl set image deployment/lucide-app lucide-app=lucide-react:2.0.0

# Rollout status
kubectl rollout status deployment/lucide-app

# Rollback if needed
kubectl rollout undo deployment/lucide-app
```

---

## Support

For issues or questions:

1. Check logs: `kubectl logs -l app=lucide-app -f`
2. Check events: `kubectl describe pod -l app=lucide-app`
3. Review manifests: Check YAML files in `/k8s/`
4. Consult Kubernetes docs: https://kubernetes.io/docs/

---

**Last Updated**: October 2026  
**Version**: 1.0.0
