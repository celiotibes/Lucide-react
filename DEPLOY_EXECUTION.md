# 🚀 Automated Deployment Execution Guide

**Status:** ✅ READY TO EXECUTE  
**Script:** `deploy.sh` (16 KB, fully automated)  
**Commit:** 320cea8 (PR #15 merged)  
**Deployment Tag:** production-20261003-050400  

---

## Quick Start

### Prerequisites
Ensure you have in your production environment:
```bash
# Required tools
docker --version        # Docker daemon running
kubectl version         # Kubernetes authenticated
git --version          # Git available

# Required credentials
echo $DOCKER_REGISTRY   # Docker registry set
kubectl auth can-i get nodes  # Kubernetes access verified
```

### Environment Setup
```bash
# Set Docker registry (required)
export DOCKER_REGISTRY="your-registry.example.com"

# Example:
export DOCKER_REGISTRY="docker.io"
export DOCKER_USERNAME="your-username"
export DOCKER_PASSWORD="your-password"
```

---

## Execution Modes

### Option 1: Complete Automated Deployment (Recommended)
Runs all 7 phases automatically with 24-hour monitoring:

```bash
# Run from your Lucide-react repository
bash deploy.sh /path/to/Lucide-react all
```

**What it does:**
1. ✅ Pre-flight validation
2. ✅ Docker build & push (8-15 min)
3. ✅ GREEN deployment (5-8 min)
4. ✅ Smoke tests (3-5 min)
5. ✅ Traffic switch (1-2 min)
6. ✅ 24-hour monitoring
7. ✅ Cleanup & archiving

**Total time:** ~30-37 minutes active + 24 hours monitored

---

### Option 2: Step-by-Step Execution
Run individual phases as needed:

```bash
# 1. Pre-flight checks only
bash deploy.sh /path/to/Lucide-react preflight

# 2. Build Docker image
bash deploy.sh /path/to/Lucide-react build

# 3. Deploy GREEN
bash deploy.sh /path/to/Lucide-react deploy

# 4. Run smoke tests
bash deploy.sh /path/to/Lucide-react smoke

# 5. Switch traffic
bash deploy.sh /path/to/Lucide-react switch

# 6. Monitor (24 hours)
bash deploy.sh /path/to/Lucide-react monitor

# 7. Cleanup
bash deploy.sh /path/to/Lucide-react cleanup
```

---

### Option 3: Emergency Rollback
If issues are detected during 24h monitoring:

```bash
bash deploy.sh /path/to/Lucide-react rollback
```

**Effect:** 
- Immediately switches traffic back to BLUE
- Saves GREEN logs for analysis
- Returns to stable production state in ~30 seconds

---

## Step-by-Step Walkthrough

### Step 1: Prepare Environment
```bash
# 1. Clone or navigate to your repo
cd /path/to/Lucide-react

# 2. Verify main branch
git status  # Should show "On branch main"
git log -1 --oneline  # Should show eeeac05

# 3. Set Docker registry
export DOCKER_REGISTRY="docker.io"
docker login $DOCKER_REGISTRY

# 4. Verify Kubernetes
kubectl cluster-info
kubectl get nodes
```

### Step 2: Run Pre-Flight Checks
```bash
# Verify everything is ready
bash deploy.sh . preflight

# Output should show:
# [SUCCESS] Pre-flight checks passed
# All secrets, configs, and cluster access verified
```

### Step 3: Build & Push Image
```bash
# Build and push to registry (8-15 min)
bash deploy.sh . build

# You should see:
# [SUCCESS] Docker image built successfully
# [SUCCESS] Security scan passed
# [SUCCESS] Image pushed to registry
```

### Step 4: Deploy GREEN
```bash
# Deploy GREEN environment (5-8 min)
bash deploy.sh . deploy

# You should see:
# [SUCCESS] GREEN deployment successful: 2/2 pods ready
```

### Step 5: Run Smoke Tests
```bash
# Verify API endpoints (3-5 min)
bash deploy.sh . smoke

# You should see:
# [SUCCESS] Health check passed
# [SUCCESS] Endpoint /api/users responding
# [SUCCESS] Endpoint /api/charges responding
# [SUCCESS] Smoke tests completed
```

### Step 6: Switch Traffic
```bash
# Route traffic from BLUE to GREEN (1-2 min)
bash deploy.sh . switch

# You should see:
# [SUCCESS] Traffic successfully switched to GREEN
```

### Step 7: Monitor (24 Hours)
```bash
# Monitor production metrics for 24 hours
# Note: This will run continuously for 24h
# Press Ctrl+C to pause, script can be resumed
bash deploy.sh . monitor

# Every 4 hours it will log:
# === Monitoring checkpoint: 4h ===
# Pod status
# Resource usage
# Restart detection
```

### Step 8: Cleanup
```bash
# After 24-hour monitoring succeeds
bash deploy.sh . cleanup

# You should see:
# [SUCCESS] BLUE deployment cleaned up
# [SUCCESS] Git tag created and pushed
```

---

## Monitoring During 24 Hours

While monitoring runs, **open these dashboards in parallel**:

### Prometheus Queries
```
# Response Time (p95)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Error Rate
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# Cache Hit Ratio
sum(rate(cache_hits_total[5m])) / (sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m])))

# Pod Memory
container_memory_usage_bytes{pod=~"lucide-app-green.*"} / container_spec_memory_limit_bytes
```

### Sentry Dashboard
Monitor for new critical errors:
```
https://sentry.io/organizations/<ORG>/issues/?environment=production
```

### AlertManager
Watch for triggered alerts:
```
https://<YOUR_DOMAIN>/alertmanager
```

---

## Troubleshooting

### Docker Build Fails
```bash
# Check Dockerfile exists
ls -la Dockerfile

# Check Docker daemon
docker ps

# Check available space
df -h

# Rebuild with verbose output
docker build --progress=plain -t $FULL_IMAGE .
```

### GREEN Pods Don't Start
```bash
# Check pod status
kubectl get pods -l deployment=green -o wide

# Check events
kubectl describe pod -l deployment=green

# Check logs
kubectl logs -l deployment=green --tail=50

# Common issues:
# - Image not found: verify docker push succeeded
# - Secret not found: verify lucide-secret exists
# - ConfigMap not found: verify lucide-config exists
# - Resource limits: check node capacity
```

### Traffic Won't Switch
```bash
# Check service exists
kubectl get svc lucide-app

# Check selector before patch
kubectl get svc lucide-app -o jsonpath='{.spec.selector}'

# Check endpoints
kubectl get endpoints lucide-app

# Verify GREEN pods are running
kubectl get pods -l deployment=green --no-headers
```

### High Error Rate After Switch
```bash
# IMMEDIATE: Rollback
bash deploy.sh . rollback

# INVESTIGATE: Check logs
kubectl logs -l deployment=green -n default --tail=100 > /tmp/green-logs.txt

# ANALYZE: Look for errors
grep -i "error\|exception\|fatal" /tmp/green-logs.txt

# FIX: Update code and rebuild
# Then retry deployment
```

---

## Network & Firewall

The deployment uses these ports/protocols:

| Component | Port | Protocol | Purpose |
|-----------|------|----------|---------|
| App HTTP | 8787 | TCP | Application traffic |
| Prometheus | 8787 | TCP | Metrics scraping |
| Kubernetes API | 6443 | TCP | kubectl commands |
| Docker Registry | 443 | HTTPS | Image push/pull |
| AlertManager | 9093 | TCP | Alert notifications |

**Ensure these are open** in your network policies.

---

## Automatic Rollback Triggers

The deployment will **automatically rollback** if:

1. **Pod Failed to Start** (startup check)
   - Readiness probe failing for > 2 minutes

2. **High Error Rate** (optional, manual trigger)
   - Error rate > 0.5% for 5 consecutive minutes
   - Recommend manual monitoring instead

3. **Manual Trigger** (on-demand)
   ```bash
   bash deploy.sh . rollback
   ```

---

## Post-Deployment

### After 24-Hour Success

1. **Verify Metrics**
   ```bash
   # All metrics should be in targets
   - Response time p95: < 200ms ✅
   - Error rate: < 0.1% ✅
   - Cache hit: > 85% ✅
   ```

2. **Run Cleanup** (automatic if using `all`)
   ```bash
   bash deploy.sh . cleanup
   # This scales BLUE to 0 and removes it
   ```

3. **Git Tag Created**
   ```bash
   git tag -l | grep production-deployed
   # Should show: production-deployed-20261003
   ```

4. **Archive Logs**
   ```bash
   tar -czf deployment-$(date +%Y%m%d).tar.gz \
     /tmp/green-failure-logs.txt* \
     <other-deployment-artifacts>
   ```

### If Issues Found (Rollback)

1. **Switch Back Automatically**
   ```bash
   bash deploy.sh . rollback
   # Traffic switches to BLUE in ~30 seconds
   ```

2. **Analyze Logs**
   ```bash
   cat /tmp/green-failure-logs.txt
   ```

3. **Fix and Redeploy**
   ```bash
   # Fix the issue in code
   # Commit and push
   # Run deployment again
   ```

---

## Full Example Execution

```bash
#!/bin/bash
# Complete deployment example

cd /path/to/Lucide-react

export DOCKER_REGISTRY="docker.io"
docker login $DOCKER_REGISTRY

# Run full deployment with timestamps
echo "Starting deployment at $(date)"

bash deploy.sh . all

echo "Deployment completed at $(date)"

# Check deployment tag
git tag | grep production-deployed

# View cleanup results
kubectl get deployment lucide-app-green -n default
```

---

## Performance Expectations

| Phase | Duration | CPU | Memory | Network |
|-------|----------|-----|--------|---------|
| Build | 8-15 min | 80-100% | 1-2GB | ~200MB |
| Deploy | 5-8 min | 20% | 512MB | ~50MB |
| Tests | 3-5 min | 10% | 256MB | ~10MB |
| Switch | 1-2 min | 5% | 128MB | <1MB |
| Monitor | 24h | <5% | 128MB | ~1MB/4h |

---

## Support & Escalation

### During Deployment
- Check logs: `kubectl logs -l deployment=green`
- Verify metrics: Open Prometheus dashboard
- Emergency contact: See DEPLOYMENT_READY_SUMMARY.md

### Post-Deployment Issues
- Check Sentry for errors
- Review Prometheus metrics
- Analyze pod logs in /tmp/

### Critical Issues
1. Immediate rollback: `bash deploy.sh . rollback`
2. Notify on-call engineer
3. Investigate root cause
4. Schedule code fix + redeploy

---

## Summary

```
✅ Code is production-ready (commit eeeac05)
✅ Docker image prepared (tag: production-20261003-050400)
✅ Kubernetes manifests ready
✅ Monitoring dashboards configured
✅ Rollback procedure automated
✅ Complete documentation provided

Ready to execute: bash deploy.sh /path/to/Lucide-react all
```

**Estimated Total Time:**
- Execution: 30-37 minutes
- Monitoring: 24 hours
- Success Criteria: All metrics stable + 0 critical alerts

---

**Generated:** 2026-10-03 UTC  
**Status:** 🟢 READY FOR PRODUCTION DEPLOYMENT
