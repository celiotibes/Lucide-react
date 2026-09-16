# Disaster Recovery Runbook

## Quick Reference

| Scenario | RTO | RPO | Triggers | Owner |
|----------|-----|-----|----------|-------|
| DC Outage | 4h | 1h | Region down, 10m no heartbeat | VP Infra |
| Data Corruption | 4h | 1h | Checksum failure, consistency alert | DBA |
| Ransomware | 4h | 1h | Encryption detected, file lock | CISO |
| App Failure | 1h | 15m | Service unavailable > 5m | App Owner |

## DC Outage Scenario (RTO: 4 hours, RPO: 1 hour)

### Detection Phase (0-5 minutes)
**Objective:** Confirm disaster status

1. **Monitor Alert Review**
   - Check CloudWatch/datadog dashboards
   - Verify DC connectivity loss
   - Confirm no false alarm

2. **Communication**
   - Activate war room (Zoom/Teams bridge)
   - Notify stakeholders
   - Start incident clock

**Contacts:**
- VP Infrastructure: +55 11 99999-0001
- On-call DBA: +55 11 99999-0003
- CISO: +55 11 99999-0004

### Activation Phase (5-15 minutes)
**Objective:** Begin failover to DR site

1. **Executive Decision**
   ```
   [ ] Confirm failover authorization
   [ ] Execute disaster declaration
   [ ] Notify clients if SLA impacted
   ```

2. **Failover Automation**
   ```bash
   # Run automated failover script
   ./scripts/failover-to-dr.sh --primary-dc us-east-1 --target-dc sa-east-1
   ```
   - Promotes secondary replica to primary
   - Redirects DNS to DR site (5-10 min propagation)
   - Validates application connectivity

3. **Verify DR Site**
   ```bash
   # Check DR database health
   mysql -h dr-db.internal -u admin -p -e "SELECT COUNT(*) FROM empresas;"
   
   # Verify replication status
   SHOW SLAVE STATUS\G
   ```

   **Acceptance Criteria:**
   - [ ] Database accessible
   - [ ] All tables present
   - [ ] Replication within 1 hour

### Recovery Phase (15-120 minutes)
**Objective:** Restore data consistency and application service

1. **Data Validation**
   ```bash
   # Compare record counts
   ./scripts/validate-dr-data.sh
   
   # Check for corruption
   mysql> CHECK TABLE empresas, contas, lancamentos;
   ```

2. **Application Failover**
   - Update application config to use DR database
   - Restart application servers
   - Run health checks
   ```bash
   # Health check
   curl -s http://app-dr:8080/health | jq .
   ```

3. **Reconciliation**
   - Identify transactions lost (up to 1 hour old)
   - Manual re-entry if critical
   - Log recovery details

4. **Testing**
   - Create test companies, transactions
   - Export test data
   - Verify calculations

### Post-Incident Phase (After 24+ hours)
**Objective:** Return to normal operations

1. **Primary DC Recovery**
   - Assess primary damage
   - Plan restoration
   - Update timeline

2. **Failback to Primary**
   - Ensure primary ready
   - Establish sync replica-to-primary
   - Execute controlled failback
   ```bash
   ./scripts/failback-to-primary.sh --wait-for-sync
   ```

3. **Root Cause Analysis**
   - Document failure
   - Identify prevention measures
   - Update runbook

4. **Notification**
   - Update clients on status
   - Confirm SLA compliance
   - Document RTO/RPO achieved

**Metrics to Log:**
```
- Time to declare disaster: ___ min
- Time to failover: ___ min
- Total downtime: ___ min
- Data loss: ___ transactions
- Cost: $___
```

## Data Corruption Scenario (RTO: 4 hours, RPO: 1 hour)

### Detection (0-5 minutes)
1. **Identify Corruption**
   ```bash
   # Run integrity checks
   ./scripts/check-data-integrity.sh
   
   # Look for error patterns
   grep -i "checksum\|corrupt" /var/log/mysql/*.err
   ```

2. **Determine Scope**
   - Which tables affected?
   - When did corruption start?
   - What percent of data?

3. **Isolate System**
   - Set database to READ-ONLY
   - Stop replication to secondaries
   - Create snapshot immediately

### Recovery (5-120 minutes)

1. **Select Recovery Point**
   ```bash
   # List available backups
   ./scripts/list-backups.sh
   
   # Choose point before corruption
   BACKUP_ID="backup-20240915-0200"
   RECOVERY_TIME="2024-09-15 01:00:00"
   ```

2. **Restore Process**
   ```bash
   # Create recovery database
   mysql> CREATE DATABASE erp_recovery;
   
   # Restore from backup
   ./scripts/restore-backup.sh \
     --backup-id $BACKUP_ID \
     --target-db erp_recovery \
     --point-in-time "$RECOVERY_TIME"
   
   # Verify restore
   mysql -D erp_recovery -e "SELECT COUNT(*) FROM empresas;"
   ```

3. **Capture Lost Transactions**
   ```bash
   # Extract valid txns after corruption
   ./scripts/extract-valid-transactions.sh \
     --from-time "2024-09-15 01:00:00" \
     --to-time "2024-09-15 02:00:00" \
     --output valid-txns.sql
   ```

4. **Apply & Validate**
   ```bash
   # Apply to recovered database
   mysql -D erp_recovery < valid-txns.sql
   
   # Compare with corrupted version
   ./scripts/compare-databases.sh \
     --database1 erp_recovery \
     --database2 erp_prod \
     --report recover-diff.txt
   ```

5. **Cutover**
   - Stop application
   - Rename databases
   - Restart application
   - Monitor closely

### Validation
- [ ] All tables present and queryable
- [ ] Record counts match expected
- [ ] Calculations validate
- [ ] No corruption in replica
- [ ] Backups verified

## Ransomware Response (RTO: 4 hours, RPO: 1 hour)

### Immediate Actions (0-15 minutes)
1. **Containment**
   - ISOLATE ALL INFECTED SYSTEMS IMMEDIATELY
   - Disable network connectivity
   - Stop replication to unaffected systems
   - Document infected systems

2. **Investigation**
   ```bash
   # Identify compromise vector
   # - Check access logs
   # - Review failed auth attempts
   # - Timeline of file modifications
   # - Ransomware file signatures
   ```

3. **Escalation**
   - Activate incident response team
   - Notify executive team
   - Contact cyber insurance
   - Prepare client communication

### Recovery (15-240 minutes)
1. **Restore from Uninfected Backup**
   - Verify backup was created BEFORE infection
   - Restore to isolated system
   - Run antivirus scan on backup
   - Restore to clean infrastructure

2. **Infrastructure Cleanup**
   - Patch vulnerability
   - Update all systems
   - Reset credentials
   - Enable enhanced monitoring

3. **Full System Validation**
   ```bash
   # Comprehensive testing
   ./scripts/validate-post-ransomware.sh \
     --check-integrity \
     --check-malware \
     --check-backdoors \
     --report ransomware-clean.txt
   ```

4. **Return to Production**
   - Monitored gradual traffic increase
   - Real-time security monitoring
   - Incident log maintenance

### Post-Incident
- Forensic investigation
- Regulatory reporting
- Process improvements
- Employee security training

## Runbook Testing Protocol

### Monthly Drills
```bash
# 1. Tabletop exercise
./drills/tabletop-scenario.sh

# 2. Automated validation
./drills/validate-backup-restore.sh

# 3. Health checks
./drills/health-check.sh
```

### Quarterly Full Simulation
```bash
# Execute full DR test
./drills/full-dr-simulation.sh \
  --scenario "dc-outage" \
  --measure-rto \
  --measure-rpo \
  --report-results

# Expected output:
# RTO achieved: 120 minutes (target: 240)
# RPO achieved: 45 minutes (target: 60)
# Issues found: []
```

### Annual Comprehensive Review
- Review all runbook procedures
- Update contact information
- Validate all recovery tools
- Test with new infrastructure
- Conduct full post-mortem simulation

## Escalation Matrix

| Level | When | Contact | Notification |
|-------|------|---------|--------------|
| Level 1 | Any incident | On-call Manager | SMS + Email |
| Level 2 | RTO > 30min | VP Engineering | Phone + Slack |
| Level 3 | RTO > 1 hour | CTO | All channels |
| Level 4 | RTO > 4 hours | CEO/Board | All channels |

## Key Resources

**Backup Locations:**
- Local: `/backup/erp-prod/`
- AWS S3: `s3://erp-backups-prod/`
- Off-site: Archive in vault (monthly)

**Database Credentials:**
```bash
# Stored in AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id erp/db/prod
```

**DR Site Access:**
```bash
ssh -i ~/.ssh/dr-access.pem ubuntu@dr-bastion.internal
```

**Communication Channels:**
- War room: https://zoom.us/j/erp-incident
- Slack: #incident-erp
- Email: incident@erp.com

## Metrics & Reporting

### Recovery Time Objective (RTO)
- Target: 4 hours
- Acceptable: < 6 hours
- Unacceptable: > 6 hours

### Recovery Point Objective (RPO)
- Target: 1 hour
- Acceptable: < 2 hours
- Unacceptable: > 2 hours

### Monthly Report Template
```
Incident Date: __________
Scenario: __________
Time to Activate Plan: _____ min
Time to First Recovery: _____ min
Total RTO: _____ min
Total Data Loss (transactions): _____
Lessons Learned: __________
Action Items: __________
```

## Version Control

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2024-09-16 | Initial version | Security Team |

**Last Updated:** 2024-09-16
**Next Review:** 2024-12-16
**Test Frequency:** Monthly
