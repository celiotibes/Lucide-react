# Deployment Checklist - v0.1.0
**Release Date:** 2026-10-07  
**Deployment Phase:** Production Release  
**Deployment Owner:** [TO BE FILLED BY OPS TEAM]

---

## Pre-Deployment Phase (Phase 1 & 2)

### Prerequisites Check (must complete before starting)

- [ ] **Access & Permissions**
  - [ ] Kubernetes cluster access verified
  - [ ] Container registry credentials configured
  - [ ] Database admin access available
  - [ ] SSH access to production servers
  - [ ] PagerDuty/oncall verified

- [ ] **Communication**
  - [ ] Deployment window communicated to team
  - [ ] Stakeholders notified (finance, support, etc.)
  - [ ] #deployments Slack channel joined
  - [ ] Incident commander assigned
  - [ ] Rollback decision-maker on standby

- [ ] **Environment Readiness**
  - [ ] Production environment stable (no ongoing incidents)
  - [ ] All services healthy (check status page)
  - [ ] Recent backups verified as restorable
  - [ ] Monitoring system operational
  - [ ] Log aggregation system responsive

### Code & Quality Checks

- [ ] **Repository Status**
  - [ ] Branch: `claude/accounting-legal-reconstruction-i8gep8`
  - [ ] All commits from origin/main integrated
  - [ ] No uncommitted changes: `git status` clean
  - [ ] Latest commit hash: `d833716` (accounting system PR #20)
  - [ ] Tag ready: `accounting-v0.1.0-20261007`

- [ ] **Test Execution**
  ```
  Test Status Report:
  ├─ Unit Tests: 3,257/3,258 PASS (99.97%)
  ├─ E2E Tests: [RUN: npm run test:e2e]
  ├─ Integration: [RUN: npm run test:integration]
  ├─ Security: [RUN: npm audit --production]
  └─ Build: [RUN: npm run build]
  ```

  - [ ] Run: `npm test` → Expected: 3257 passing, 1 expected fail
  - [ ] Run: `npm run lint` → Expected: 0 errors
  - [ ] Run: `npm run build:typecheck` → Expected: 0 TypeScript errors
  - [ ] Run: `npm run build` → Expected: SUCCESS in < 35 seconds
  - [ ] Run: `npm run test:e2e` → Expected: all scenarios passing
  - [ ] Run: `npm audit --production` → Expected: 0 critical vulnerabilities

- [ ] **Code Review**
  - [ ] Review PR #20 accounting system changes: APPROVED
  - [ ] Review all commits in branch: APPROVED
  - [ ] Security review completed: APPROVED
  - [ ] Performance review completed: APPROVED

### Database Preparation

- [ ] **Backup & Snapshot**
  - [ ] Create pre-deployment database backup
    ```bash
    sqlite3 /var/lib/app/db.sqlite ".backup '/backup/db-pre-deploy-$(date +%Y%m%d_%H%M%S).sqlite'"
    ```
  - [ ] Backup size verified: [_____ MB]
  - [ ] Backup location: ____________________
  - [ ] Backup tested for restorability: PASS
  - [ ] Backup copied to off-site location: DONE

- [ ] **Migration Testing**
  - [ ] Test migrations on copy of prod database
    ```bash
    npm run migrate -- --dry-run
    npm run migrate -- --verify
    ```
  - [ ] All 128 constraints created successfully
  - [ ] 6 new columns added to ledger_entries
  - [ ] 2 new tables created with proper indexes
  - [ ] No data loss observed: VERIFIED
  - [ ] Rollback script tested: SUCCESS

- [ ] **Performance Analysis**
  - [ ] Run EXPLAIN PLAN on new indices
  - [ ] Verify no performance regression
  - [ ] Check migration execution time: [_____ seconds]
  - [ ] Database size after migration: [_____ GB]

- [ ] **Data Integrity**
  - [ ] Row count before/after: _____ → _____ 
  - [ ] Check for orphaned records: NONE FOUND
  - [ ] Validate foreign key constraints: PASS
  - [ ] Verify unique constraints: PASS
  - [ ] Check for null violations: NONE

---

## Deployment Phase (Phase 3-5)

### Build & Image Creation

- [ ] **Docker Build**
  ```bash
  docker build -t crmt:v0.1.0 .
  docker build -t crmt:v0.1.0-$(date +%Y%m%d_%H%M%S) .  # timestamped backup
  ```
  - [ ] Build succeeded: ✅
  - [ ] Build time: [_____ seconds]
  - [ ] Image size: [_____ MB]
  - [ ] Scan for vulnerabilities: `docker scan crmt:v0.1.0`
  - [ ] No critical vulnerabilities found: ✅

- [ ] **Image Push to Registry**
  ```bash
  docker push registry.com/crmt:v0.1.0
  docker push registry.com/crmt:latest
  docker tag crmt:v0.1.0 registry.com/crmt:latest
  ```
  - [ ] Image pushed successfully
  - [ ] Image digest: ____________________
  - [ ] Verify image in registry: FOUND
  - [ ] Image pull verified: SUCCESS

### GREEN Environment Deployment

- [ ] **Pre-Deployment State**
  - [ ] Current BLUE deployment healthy: PASS
  - [ ] Current BLUE pod replicas: [_____]
  - [ ] Current BLUE resource usage: CPU [____%] Memory [____%]
  - [ ] GREEN environment empty/cleaned
  - [ ] GREEN database snapshot: CURRENT

- [ ] **Apply Database Migrations**
  ```bash
  kubectl exec -it deployment/green -- npm run migrate
  ```
  - [ ] Migration executed: SUCCESS
  - [ ] Migration log location: ____________________
  - [ ] Schema updated: VERIFIED
  - [ ] Backfill pre-flight check: PASS

- [ ] **Deploy GREEN Pods**
  ```bash
  kubectl apply -f k8s/deployment-green.yaml
  kubectl set image deployment/green app=registry.com/crmt:v0.1.0
  ```
  - [ ] Pods created: [_____] replicas
  - [ ] Readiness probes passing: [_____]/[_____]
  - [ ] Liveness probes passing: [_____]/[_____]
  - [ ] Startup logs: NO ERRORS
  - [ ] Environment variables: VERIFIED

- [ ] **Verify GREEN Health**
  ```bash
  kubectl get pods -l deployment=green -w  # wait for Ready state
  kubectl logs -l deployment=green --tail=50
  ```
  - [ ] All pods status: Running ✅
  - [ ] Startup time per pod: [_____ seconds]
  - [ ] No crash loops detected
  - [ ] Environment vars loaded correctly

### Smoke Test Battery (GREEN Environment)

**Test Suite 1: Health & Connectivity**

- [ ] **Health Endpoint**
  ```bash
  curl -X GET http://GREEN_HOST/health
  # Expected: {"status":"ok","version":"0.1.0"}
  ```
  - [ ] HTTP Status: 200 ✅
  - [ ] Response time: [_____ ms]
  - [ ] Version matches: 0.1.0 ✅

- [ ] **Metrics Endpoint**
  ```bash
  curl -X GET http://GREEN_HOST/metrics
  ```
  - [ ] HTTP Status: 200 ✅
  - [ ] Prometheus format: VALID
  - [ ] Scrape time: [_____ ms]

**Test Suite 2: Authentication**

- [ ] **Login Endpoint**
  ```bash
  curl -X POST http://GREEN_HOST/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"testpass123"}'
  ```
  - [ ] HTTP Status: 200 or 401 (expected behavior)
  - [ ] Response time: [_____ ms]
  - [ ] Token generated: YES/NO

- [ ] **Token Validation**
  ```bash
  curl -X GET http://GREEN_HOST/api/user/profile \
    -H "Authorization: Bearer $TEST_TOKEN"
  ```
  - [ ] HTTP Status: 200 ✅
  - [ ] User data returned: VALID
  - [ ] Response time: [_____ ms]

**Test Suite 3: Accounting Module (NEW)**

- [ ] **Ledger Entries List**
  ```bash
  curl -X GET "http://GREEN_HOST/api/ledger/entries?limit=10" \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -H "Content-Type: application/json"
  ```
  - [ ] HTTP Status: 200 ✅
  - [ ] Returns array of entries: YES
  - [ ] New fields present (agente_id, agente_papel): YES
  - [ ] Response time: [_____ ms]

- [ ] **Create Ledger Entry with Agent**
  ```bash
  curl -X POST http://GREEN_HOST/api/ledger/entries \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "descricao":"Test entry",
      "valor":1000,
      "tipo":"receita",
      "agente_id":"agent-123"
    }'
  ```
  - [ ] HTTP Status: 201 ✅
  - [ ] Entry created with agent link: YES
  - [ ] Audit trail recorded: VERIFIED
  - [ ] Response time: [_____ ms]

- [ ] **Get Agent P&L Report**
  ```bash
  curl -X GET "http://GREEN_HOST/api/agentes/agent-123/relatorio?mes=2026-10" \
    -H "Authorization: Bearer $TEST_TOKEN"
  ```
  - [ ] HTTP Status: 200 ✅
  - [ ] Report contains revenues: YES
  - [ ] Report contains expenses: YES
  - [ ] Net profit calculated: YES

**Test Suite 4: Reconciliation Pipeline**

- [ ] **Process Reconciliation**
  ```bash
  curl -X POST http://GREEN_HOST/api/reconciliacao/processar \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"periodo":"2026-10","forcar":true}'
  ```
  - [ ] HTTP Status: 200 or 202 ✅
  - [ ] Job queued/started: YES
  - [ ] Response time: [_____ ms]

- [ ] **Check Reconciliation Status**
  ```bash
  curl -X GET "http://GREEN_HOST/api/reconciliacao/status?job_id=$JOB_ID" \
    -H "Authorization: Bearer $TEST_TOKEN"
  ```
  - [ ] HTTP Status: 200 ✅
  - [ ] Status in [queued, processing, completed, failed]: YES
  - [ ] Progress percentage: [_____]%

**Test Suite 5: External Integrations**

- [ ] **ASAAS Integration Health**
  ```bash
  curl -X GET http://GREEN_HOST/api/integrations/asaas/health \
    -H "Authorization: Bearer $TEST_TOKEN"
  ```
  - [ ] HTTP Status: 200 ✅
  - [ ] API connectivity: CONNECTED
  - [ ] Last sync time: ____________________
  - [ ] Pending charges count: [_____]

- [ ] **PIX Reconciliation Status**
  ```bash
  curl -X GET http://GREEN_HOST/api/pix/status \
    -H "Authorization: Bearer $TEST_TOKEN"
  ```
  - [ ] HTTP Status: 200 ✅
  - [ ] PIX API connected: YES
  - [ ] Last sync: ____________________

- [ ] **OFX Parser Health**
  ```bash
  curl -X GET http://GREEN_HOST/api/parsers/ofx/status \
    -H "Authorization: Bearer $TEST_TOKEN"
  ```
  - [ ] HTTP Status: 200 ✅
  - [ ] Parser initialized: YES
  - [ ] Last parse time: ____________________

**Test Suite 6: Database Integrity**

- [ ] **Schema Verification**
  ```bash
  kubectl exec -it deployment/green -- npm run verify:database
  ```
  - [ ] All 128 constraints present: ✅
  - [ ] 32+ foreign keys validated: ✅
  - [ ] 24+ unique constraints verified: ✅
  - [ ] Tables match schema: ✅

- [ ] **Ledger Consistency Check**
  ```bash
  kubectl exec -it deployment/green -- npm run validate:ledger
  ```
  - [ ] Double-entry principle verified: ✅
  - [ ] All entries balanced: YES
  - [ ] No orphaned records: YES
  - [ ] Agent links valid: [_____]% valid

**Test Suite 7: Performance Baseline**

- [ ] **Load Test (light)**
  ```bash
  ab -n 100 -c 10 http://GREEN_HOST/api/health
  ```
  - [ ] Requests/sec: [_____]
  - [ ] Mean response time: [_____ ms]
  - [ ] Max response time: [_____ ms]
  - [ ] Error rate: [_____%]

- [ ] **Database Query Performance**
  ```bash
  # Query ledger with various filters
  time curl -X GET "http://GREEN_HOST/api/ledger/entries?limit=1000" \
    -H "Authorization: Bearer $TEST_TOKEN"
  ```
  - [ ] Response time (1000 entries): [_____ ms]
  - [ ] Response time acceptable: YES/NO
  - [ ] No timeout errors: YES

### Traffic Switch (Load Balancer Update)

- [ ] **Pre-Switch Verification**
  - [ ] GREEN environment all tests PASS ✅
  - [ ] GREEN performance baseline acceptable: YES
  - [ ] BLUE environment still healthy: CONFIRMED
  - [ ] Rollback plan reviewed and ready: YES
  - [ ] Incident commander ready: YES

- [ ] **Update Load Balancer**
  ```bash
  # Update service selector
  kubectl patch service app-service -p '{"spec":{"selector":{"deployment":"green"}}}'
  
  # Or update Ingress
  kubectl patch ingress app-ingress -p '{"spec":{"rules":[{"host":"app.company.com","http":{"paths":[{"path":"/","backend":{"serviceName":"app-green"}}]}}]}}'
  ```
  - [ ] Service selector updated: SUCCESS
  - [ ] Ingress updated: SUCCESS
  - [ ] Load balancer config pushed: SUCCESS
  - [ ] DNS cache TTL: [_____ seconds]

- [ ] **Verify Traffic Switch**
  ```bash
  # Check pod IP endpoints
  kubectl get endpoints app-service
  
  # Verify traffic routing
  for i in {1..20}; do curl http://app-host/api/health; done | sort | uniq -c
  ```
  - [ ] All traffic routing to GREEN: ✅
  - [ ] No traffic still on BLUE: CONFIRMED
  - [ ] Response time to prod: [_____ ms]
  - [ ] Error rate: [_____%]

- [ ] **Initial Monitoring (5 minutes post-switch)**
  - [ ] Error rate: [_____%] (target: < 0.1%)
  - [ ] Response time p95: [_____ ms] (target: < 200ms)
  - [ ] CPU usage: [_____]% (target: < 70%)
  - [ ] Memory usage: [_____]% (target: < 80%)
  - [ ] Active connections: [_____]
  - [ ] No Sentry critical errors: CONFIRMED
  - [ ] Slack notifications: [_____] received

---

## Monitoring Phase (Phase 6: 24-Hour Watch)

### Automated Monitoring

- [ ] **Prometheus Metrics (every 5 min for 24 hours)**
  - [ ] Query: `rate(http_requests_total[5m])`
    - Target: Response rate stable
    - Current: [_____ req/s]
  - [ ] Query: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))`
    - Target: < 200ms
    - Current: [_____ ms]
  - [ ] Query: `rate(errors_total[5m])`
    - Target: < 0.1%
    - Current: [_____%]

- [ ] **Database Metrics**
  - [ ] Active connections: [_____] / 20 max
  - [ ] Query time p95: [_____ ms]
  - [ ] Cache hit ratio: [_____]% (target: > 85%)
  - [ ] Slow queries count: [_____] (target: 0)

- [ ] **System Resources**
  - [ ] Pod CPU: [_____]% max (target: < 70%)
  - [ ] Pod Memory: [_____]% max (target: < 80%)
  - [ ] Node CPU: [_____]% max
  - [ ] Node Memory: [_____]% max

- [ ] **Business Metrics (Ledger-Specific)**
  - [ ] Backfill progress: [_____]% complete
  - [ ] Backfill accuracy: [_____]% (target: > 95%)
  - [ ] Reconciliation success rate: [_____]% (target: 100%)
  - [ ] Integration sync errors: [_____] (target: 0)

### Sentry Error Tracking

- [ ] **Error Dashboard**
  - [ ] No new critical errors: ✅
  - [ ] Error rate trend: [stable/increasing/decreasing]
  - [ ] Top 3 errors:
    1. [_____________________] - [_____] occurrences
    2. [_____________________] - [_____] occurrences
    3. [_____________________] - [_____] occurrences

- [ ] **Performance Monitoring**
  - [ ] Slow transactions (> 500ms): [_____] count
  - [ ] Memory leaks detected: NO
  - [ ] Exception trends: STABLE

### Health Check Dashboard

| Time | Error Rate | Response Time | CPU | Memory | Status |
|------|-----------|----------------|-----|--------|--------|
| 0:00 | [_____]% | [_____]ms | [____%] | [____%] | ✅ |
| 1:00 | [_____]% | [_____]ms | [____%] | [____%] | ✅ |
| 2:00 | [_____]% | [_____]ms | [____%] | [____%] | ✅ |
| 3:00 | [_____]% | [_____]ms | [____%] | [____%] | ✅ |
| 4:00 | [_____]% | [_____]ms | [____%] | [____%] | ✅ |
| ... | ... | ... | ... | ... | ... |
| 24:00 | [_____]% | [_____]ms | [____%] | [____%] | ✅ |

### Alert Responses

| Alert | Received | Severity | Response | Resolution |
|-------|----------|----------|----------|-----------|
| [_____] | [time] | [level] | [action] | [result] |
| [_____] | [time] | [level] | [action] | [result] |

### 24-Hour Monitoring Checklist

- [ ] **Hour 1-6 (Early Monitoring)**
  - [ ] All endpoints responding: CONFIRMED
  - [ ] No cascading failures: CONFIRMED
  - [ ] Database performance stable: CONFIRMED
  - [ ] Backfill running smoothly: CONFIRMED

- [ ] **Hour 6-12 (Mid-Cycle Monitoring)**
  - [ ] Backfill progress > 50%: ✅ [_____]%
  - [ ] Reconciliation cycles completed: [_____] cycles
  - [ ] Integration sync cycles: [_____] cycles
  - [ ] No cumulative performance degradation: CONFIRMED

- [ ] **Hour 12-24 (Late Monitoring)**
  - [ ] Backfill complete: [_____]% (target: 100%)
  - [ ] Final accuracy score: [_____]% (target: > 95%)
  - [ ] 24-hour uptime: [_____]% (target: 99.9%+)
  - [ ] Ready for production promotion: YES/NO

---

## Post-Deployment Phase (Phase 7)

### Final Verification

- [ ] **Production Readiness Sign-Off**
  - [ ] All 24-hour monitoring criteria met: YES
  - [ ] Performance baselines established: [attached]
  - [ ] Backfill completed successfully: YES (accuracy: [_____]%)
  - [ ] Zero critical issues: CONFIRMED
  - [ ] Business owner approval: YES

- [ ] **Documentation Update**
  - [ ] Update runbooks with new endpoints
  - [ ] Document any workarounds applied
  - [ ] Create incident playbooks for new components
  - [ ] Update architecture documentation
  - [ ] Update client SDK docs for new fields

- [ ] **Knowledge Transfer**
  - [ ] Brief on-call engineer on new features
  - [ ] Walkthrough of monitoring dashboards
  - [ ] Review of rollback procedures
  - [ ] Q&A session completed
  - [ ] Documentation reviewed by ops team

### BLUE Environment Cleanup

- [ ] **Archive BLUE Deployment**
  - [ ] Export pod logs: `kubectl logs -l deployment=blue > blue-logs-$(date +%Y%m%d_%H%M%S).txt`
  - [ ] Backup BLUE image: `docker save crmt:previous-tag | gzip > blue-backup.tar.gz`
  - [ ] Store in archive location: [__________________________]
  - [ ] Retention period: [_____] days

- [ ] **Decommission BLUE (OPTIONAL)**
  - [ ] Verify GREEN stable for [_____] hours: CONFIRMED
  - [ ] Remove BLUE deployment: `kubectl delete deployment blue`
  - [ ] Remove BLUE service: `kubectl delete service app-blue`
  - [ ] Remove BLUE PVC (if separate): `kubectl delete pvc blue-data`
  - [ ] Confirm removal: COMPLETED

### Post-Deployment Report

**Deployment Summary**
- Start Time: ____________________
- Completion Time: ____________________
- Total Duration: [_____] minutes
- Active Deployment Time: [_____] minutes
- Monitoring Period: [_____] hours
- Final Status: ✅ SUCCESS / ⚠️ WITH ISSUES / ❌ ROLLED BACK

**Issues Encountered**
| Issue | Severity | Resolution | Time to Fix |
|-------|----------|-----------|-------------|
| [_____] | [level] | [action] | [_____ min] |
| [_____] | [level] | [action] | [_____ min] |

**Performance Comparison (BLUE vs GREEN)**
| Metric | BLUE | GREEN | Change |
|--------|------|-------|--------|
| Response Time (p95) | [_____ ms] | [_____ ms] | [_____]% |
| Error Rate | [_____%] | [_____%] | [_____]% |
| Throughput | [_____ req/s] | [_____ req/s] | [_____]% |
| Memory Usage | [_____]% | [_____]% | [_____]% |
| CPU Usage | [_____]% | [_____]% | [_____]% |

**Lessons Learned**
1. [_________________________________________________]
2. [_________________________________________________]
3. [_________________________________________________]

**Approval Sign-Off**

- [ ] Deployment Lead: __________________ Date: __________
- [ ] Platform Owner: __________________ Date: __________
- [ ] Database Admin: __________________ Date: __________
- [ ] Security Officer: __________________ Date: __________
- [ ] Finance/Business: __________________ Date: __________

---

## Quick Reference: Command Index

### Pre-Deployment
```bash
npm test                           # Run all tests
npm run lint                       # Lint check
npm run build:typecheck           # TypeScript check
npm run build                     # Build verification
npm audit --production            # Security audit
```

### Database Operations
```bash
npm run migrate -- --dry-run      # Dry-run migrations
npm run migrate                   # Execute migrations
npm run verify:database           # Verify schema
npm run validate:ledger           # Validate ledger
```

### Deployment
```bash
docker build -t crmt:v0.1.0 .     # Build image
docker push registry.com/crmt:v0.1.0  # Push image
kubectl apply -f k8s/deployment-green.yaml  # Deploy
kubectl patch service app -p '{"spec":{"selector":{"deployment":"green"}}}'  # Switch traffic
```

### Monitoring
```bash
kubectl get pods -l deployment=green  # Check pod status
kubectl logs -l deployment=green      # View logs
kubectl top pods -l deployment=green  # Check resources
curl http://host/health              # Health check
curl http://host/metrics             # Prometheus metrics
```

### Rollback
```bash
kubectl patch service app -p '{"spec":{"selector":{"deployment":"blue"}}}'  # Switch back
kubectl delete deployment green      # Remove GREEN
npm run migrate:rollback             # Rollback database
```

---

**Checklist Version:** 1.0  
**Last Updated:** 2026-10-07  
**Next Review Date:** 2026-10-21  

**DEPLOYMENT CHECKLIST STATUS:** ⏳ READY FOR EXECUTION

