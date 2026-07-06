# Security Testing Plan - Rental Listing Sync

**Status**: 📋 Plano Definido  
**Data**: 2026-07-06  
**Objetivo**: Validar implementação de segurança antes de produção  
**OWASP**: Top 10 Coverage

---

## 1. Escopo de Segurança

### Sistemas Cobertos
- ✅ Authentication & Authorization (JWT)
- ✅ API Endpoints (HTTPS/TLS)
- ✅ Webhook Signature Verification
- ✅ Rate Limiting
- ✅ Database Security
- ✅ Password Storage (Bcrypt)
- ✅ Sensitive Data (encryption)
- ✅ Dependency Vulnerabilities
- ✅ Infrastructure (Docker, env vars)
- ✅ Third-party Integrations (OTA APIs)

---

## 2. OWASP Top 10 - Test Plan

### A1: Broken Authentication

#### Test Cases
```
1.1 Default Credentials
- [ ] No default admin:admin
- [ ] No hardcoded passwords
- [ ] No test accounts in production

1.2 JWT Token Security
- [ ] Token expiration enforced (7 days)
- [ ] Token signing algorithm secure (HS256)
- [ ] Secret key strong (>32 bytes random)
- [ ] No token stored in query params
- [ ] Tokens over HTTPS only

1.3 Password Security
- [ ] Bcrypt hashing (12 rounds)
- [ ] Salts generated per user
- [ ] No plaintext passwords in logs
- [ ] Password validation rules enforced
- [ ] Account lockout after N failed attempts

1.4 Session Management
- [ ] Session timeout after inactivity
- [ ] Cookies marked HttpOnly + Secure
- [ ] CSRF tokens on state-changing ops
- [ ] Cross-origin requests validated
```

#### Commands
```bash
# Test default credentials
curl -X POST http://api:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin"}'

# Check token expiration
token=$(curl -X POST http://api:3000/auth/login ... | jq .token)
sleep 7d  # Wait 7 days
curl -H "Authorization: Bearer $token" http://api:3000/api/properties
# Should fail with 401

# Verify Bcrypt rounds
curl http://api:3000/api/debug/password-hash-rounds
# Should return 12
```

---

### A2: Broken Access Control

#### Test Cases
```
2.1 Authorization Bypass
- [ ] User cannot access other users' properties
- [ ] User cannot modify other users' bookings
- [ ] Admin endpoints restricted to admin role
- [ ] Can't elevate privileges

2.2 Horizontal Access Control
- [ ] Can't modify another user's OTA listings
- [ ] Can't view another user's calendar
- [ ] Can't update another user's pricing rules

2.3 Vertical Access Control
- [ ] Non-admin can't access admin endpoints
- [ ] Guest can't create properties
- [ ] Only owner can delete property

Test Method:
- Login as User A
- Try accessing User B's resources
- Should return 403 Forbidden
```

#### Commands
```bash
# Get User A's token
token_a=$(curl -X POST http://api:3000/auth/login \
  -d '{"email":"user_a@test.com","password":"pass123"}' | jq -r .token)

# Get User B's property ID
property_b_id="12345"

# Try to access User B's property as User A
curl -H "Authorization: Bearer $token_a" \
  http://api:3000/api/properties/$property_b_id
# Should return 403
```

---

### A3: Injection

#### Test Cases
```
3.1 SQL Injection
- [ ] Parameterized queries everywhere
- [ ] No string concatenation in queries
- [ ] Test payload: ' OR '1'='1
- [ ] Test payload: '; DROP TABLE users; --

3.2 Command Injection
- [ ] No shell commands from user input
- [ ] Worker processes safe from injection

3.3 LDAP/XXLM Injection
- [ ] External service calls validated
- [ ] XML parsing safe

3.4 Log Injection
- [ ] No newlines in logged user input
- [ ] Logs can't be manipulated

Test Examples:
- Booking form with: <script>alert('xss')</script>
- Property name with: ' OR '1'='1
- Email with: admin@example.com%0ainjected
```

#### Commands
```bash
# Test SQL injection in calendar query
curl "http://api:3000/api/properties/123/calendar?date=2026-07-06' OR '1'='1"
# Should return 400 Bad Request (invalid date format)

# Test XSS in booking form
curl -X POST http://api:3000/api/properties/123/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "guest_name":"<script>alert(1)</script>",
    "guest_email":"test@test.com"
  }'
# Should sanitize/reject the script tag
```

---

### A4: Insecure Design

#### Test Cases
```
4.1 Threat Modeling
- [ ] Authentication flow secure
- [ ] OTA integration secure
- [ ] Webhook verification complete
- [ ] Rate limiting covers all endpoints

4.2 Rate Limiting
- [ ] 100 req/min per IP enforced
- [ ] Booking.com respects 2 req/sec
- [ ] VRBO respects 10 req/sec
- [ ] Exceeding limit returns 429

4.3 CORS Configuration
- [ ] Allowed origins restricted
- [ ] Credentials not exposed unnecessarily
- [ ] Preflight requests handled

Test Method:
- Send 101 requests in 60 seconds
- Verify 101st request returns 429
```

#### Commands
```bash
# Test rate limiting
for i in {1..101}; do
  curl http://api:3000/api/properties \
    -H "Authorization: Bearer $token"
done
# Request 101 should return 429 Too Many Requests

# Test CORS
curl -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: POST" \
  http://api:3000/api/properties
# Should NOT include evil.com in CORS headers
```

---

### A5: Broken Cryptography

#### Test Cases
```
5.1 Data in Transit
- [ ] All connections use HTTPS/TLS 1.2+
- [ ] No HTTP fallback
- [ ] Certificate valid and signed
- [ ] HSTS header set

5.2 Data at Rest
- [ ] Sensitive data encrypted in database
- [ ] API keys not in logs
- [ ] Passwords never stored plaintext
- [ ] Backup encryption enabled

5.3 Cryptographic Algorithms
- [ ] JWT uses HS256 (secure)
- [ ] Bcrypt uses 12 rounds (strong)
- [ ] Random number generation secure
- [ ] No hardcoded crypto keys

Test Method:
- Check headers for security directives
- Verify TLS version
- Inspect database for plaintext sensitive data
```

#### Commands
```bash
# Check TLS version
openssl s_client -connect api.example.com:443 -tls1_2

# Check headers
curl -I https://api.example.com/api/properties
# Should include: Strict-Transport-Security, X-Frame-Options, etc.

# Check JWT algorithm
token=$(curl -X POST http://api:3000/auth/login ...) 
echo $token | jq -R 'split(".")[0] | @base64d | fromjson'
# Should show "alg":"HS256"
```

---

### A6: Identification & Authentication Failures

#### Test Cases
```
6.1 Account Enumeration
- [ ] Login responses don't reveal user existence
- [ ] Forgot password doesn't reveal if email exists
- [ ] Generic error messages used

6.2 Weak Password Policies
- [ ] Minimum 8 characters required
- [ ] Mix of upper, lower, numbers, special chars
- [ ] No dictionary words allowed
- [ ] Password history tracked (no reuse)

6.3 Multi-factor Authentication
- [ ] Consider MFA for sensitive operations
- [ ] 2FA not required (MVP acceptable)

Test Method:
- Try non-existent email → same response as invalid password
- Try weak password → rejected with specific feedback
```

#### Commands
```bash
# Test account enumeration
curl -X POST http://api:3000/auth/login \
  -d '{"email":"admin@test.com","password":"wrong"}'
# Response: "Invalid email or password" (generic)

curl -X POST http://api:3000/auth/login \
  -d '{"email":"nonexistent@test.com","password":"wrong"}'
# Response: "Invalid email or password" (same generic message)
```

---

### A7: Software & Data Integrity Failures

#### Test Cases
```
7.1 Dependency Vulnerabilities
- [ ] npm audit passes
- [ ] No high/critical vulnerabilities
- [ ] Dependencies updated regularly
- [ ] Peer dependencies resolved

7.2 CI/CD Security
- [ ] Build pipeline locked down
- [ ] Secrets not in git history
- [ ] Signed commits required (optional)
- [ ] Deployment approval workflow

7.3 Supply Chain
- [ ] Third-party libraries verified
- [ ] License compliance checked
- [ ] no malicious packages

Test Method:
- Run npm audit
- Check for vulnerable dependencies
- Verify build pipeline security
```

#### Commands
```bash
# Check dependencies
npm audit
# Should show: "0 vulnerabilities"

# Check for hardcoded secrets
git log -p | grep -i "api.key\|secret\|password"
# Should find none

# Verify package integrity
npm audit signatures
# All should be verified
```

---

### A8: Server-Side Request Forgery (SSRF)

#### Test Cases
```
8.1 Internal Service Access
- [ ] Can't access internal Redis via API
- [ ] Can't access internal DB via API
- [ ] Can't access metadata service (if cloud)

8.2 External Service Calls
- [ ] OTA API calls validated
- [ ] Webhook delivery to safe URLs
- [ ] AI service calls (Gemini) secure

8.3 URL Validation
- [ ] Only expected domains allowed
- [ ] IPv4/IPv6 localhost blocked
- [ ] Private IP ranges blocked

Test Method:
- Try to call internal services
- Verify only expected external calls
```

#### Commands
```bash
# Test SSRF - try to access internal Redis
curl http://api:3000/api/proxy?url=redis://localhost:6379
# Should reject or not work

# Test SSRF - try metadata service
curl http://api:3000/api/proxy?url=http://169.254.169.254/latest/meta-data/
# Should reject
```

---

### A9: Logging & Monitoring Failures

#### Test Cases
```
9.1 Security Logging
- [ ] All authentication attempts logged
- [ ] Failed access attempts logged
- [ ] API errors with stack traces logged (dev only)
- [ ] Sensitive data not logged

9.2 Monitoring
- [ ] High error rates alert
- [ ] Unusual access patterns detected
- [ ] Rate limit violations tracked
- [ ] Database backup verified

9.3 Log Retention
- [ ] Logs retained 30+ days
- [ ] Log tampering detected
- [ ] Central log storage (not local)

Test Method:
- Trigger authentication failure
- Verify logged without sensitive data
- Check monitoring alerts
```

#### Commands
```bash
# Trigger auth failure
curl -X POST http://api:3000/auth/login \
  -d '{"email":"test@test.com","password":"wrong"}'

# Check logs
docker logs rental-sync-backend | grep "auth"
# Should show failed login attempt without password

# Verify no sensitive data in logs
docker logs rental-sync-backend | grep -i "password\|token\|api.key"
# Should find none
```

---

### A10: Using Components with Known Vulnerabilities

#### Test Cases
```
10.1 Dependency Scanning
- [ ] npm audit passes
- [ ] No known CVEs in dependencies
- [ ] TypeScript version current
- [ ] Express version current
- [ ] Pg driver version current

10.2 Security Updates
- [ ] Subscribe to security advisories
- [ ] Process for rapid patching
- [ ] Automated update checks

10.3 Transitive Dependencies
- [ ] No vulnerable transitive deps
- [ ] Peer dependency conflicts resolved

Test Method:
- Run npm audit regularly
- Check CVE databases
- Test known exploit payloads
```

#### Commands
```bash
# Full dependency audit
npm audit --audit-level=moderate
# No vulnerabilities found

# Check specific packages
npm view express@4.18.2 | grep vulnerability

# Generate SBOM (Software Bill of Materials)
npm list --all > dependencies.txt
```

---

## 3. Additional Security Tests

### Webhook Signature Verification
```
Test: Webhook Signature
- [ ] Booking.com signature required
- [ ] VRBO signature required
- [ ] Invalid signature rejected (401)
- [ ] Missing signature rejected (401)
- [ ] Timing-safe comparison used
- [ ] No timing attacks possible

Commands:
curl -X POST http://api:3000/webhooks/booking-com \
  -H "X-Booking-Signature: invalid" \
  -d '{"event":"booking_created"}'
# Should return 401 Unauthorized
```

### Environment Variables
```
Test: Configuration Security
- [ ] No secrets in Dockerfile
- [ ] No secrets in .env in git
- [ ] All env vars documented
- [ ] Production env vars differ from dev
- [ ] Secrets manager ready for production

Commands:
grep -r "password\|secret\|api.key" Dockerfile
# Should find none

git log --all -S "password" -- '*.env'
# Should find no secrets committed
```

### Database Security
```
Test: Database Hardening
- [ ] Connections use SSL
- [ ] Connection pooling enabled
- [ ] Connection limits enforced
- [ ] Row-level security (future)
- [ ] Encryption at rest (cloud provider)

Commands:
# Test connection string
echo $DATABASE_URL | grep -i ssl
# Should be: postgresql://...?sslmode=require
```

---

## 4. Penetration Testing Checklist

### Phase 1: Reconnaissance
- [ ] Map all endpoints
- [ ] Identify technology stack
- [ ] Find exposed configurations
- [ ] Check DNS/WHOIS

### Phase 2: Vulnerability Scanning
- [ ] Automated tool scan (OWASP ZAP, Burp)
- [ ] Manual endpoint testing
- [ ] Parameter fuzzing
- [ ] Header injection tests

### Phase 3: Exploitation
- [ ] Attempt identified vulnerabilities
- [ ] Chain vulnerabilities
- [ ] Document impact

### Phase 4: Reporting
- [ ] Create detailed report
- [ ] Prioritize findings
- [ ] Provide remediation steps
- [ ] Follow-up testing

---

## 5. Security Tools

### Automated Scanning
```
# OWASP Dependency Check
dependency-check --project "Rental-Sync" --scan .

# npm audit
npm audit

# Trivy (Docker image scanning)
trivy image rental-sync-backend:latest

# OWASP ZAP (API testing)
zaproxy -cmd -quickurl http://api:3000 -quickout results.html
```

### Manual Testing
```
# Burp Suite Community (proxy + testing)
# - Intercept requests
# - Fuzz parameters
# - Replay/modify requests

# Postman (API testing)
# - Test all endpoints
# - Validate response codes
# - Check header security

# curl (command-line testing)
# - Direct endpoint testing
# - Header manipulation
# - Request crafting
```

---

## 6. Timeline & Resources

### Week 1: Planning & Setup
- [ ] Define scope and goals
- [ ] Setup test environment
- [ ] Prepare test tools
- [ ] Create test cases

### Week 2: Automated Testing
- [ ] Run dependency scans
- [ ] Run OWASP ZAP scan
- [ ] Document findings
- [ ] Prioritize issues

### Week 3: Manual Testing
- [ ] Test each OWASP Top 10
- [ ] Endpoint fuzzing
- [ ] Penetration testing
- [ ] Document exploits

### Week 4: Remediation & Reporting
- [ ] Fix identified vulnerabilities
- [ ] Re-test fixes
- [ ] Generate security report
- [ ] Present findings

### Resources Needed
- Security engineer (1 person)
- Test environment clone
- Penetration testing tools
- Bug bounty platform (optional)

---

## 7. Success Criteria

### All Must Pass:
- ✅ No OWASP Top 10 vulnerabilities
- ✅ npm audit passes (0 vulnerabilities)
- ✅ No hardcoded secrets in codebase
- ✅ All authentication tests pass
- ✅ Webhook signatures verified
- ✅ Rate limiting enforced
- ✅ SQL injection tests all fail
- ✅ CORS properly configured
- ✅ HTTPS/TLS enforced
- ✅ No sensitive data in logs

### Red Flags (Fail):
- ❌ Any high/critical vulnerability found
- ❌ SQL injection possible
- ❌ Authentication bypass found
- ❌ Authorization bypass found
- ❌ Hardcoded credentials
- ❌ HTTPS disabled
- ❌ CORS misconfigured
- ❌ Sensitive data exposed

---

## 8. Post-Testing Actions

### If Vulnerabilities Found:
1. Assess severity (CVSS score)
2. Create fix plan
3. Implement fix
4. Re-test vulnerability
5. Update documentation

### If No Vulnerabilities Found:
1. Generate security certificate
2. Document findings
3. Create monthly re-test schedule
4. Plan for future penetration tests

---

## 9. Compliance & Standards

### Standards Covered
- ✅ OWASP Top 10 2021
- ✅ CWE Top 25
- ✅ NIST Cybersecurity Framework
- ✅ GDPR (data protection)
- ✅ PCI DSS (if handling payments)

### Documentation Required
- Security audit report
- Remediation plan
- Testing methodology
- Evidence of testing

---

**Owner**: Security Team / DevSecOps  
**Timeline**: 4 weeks recommended  
**Next Step**: Week 1 Planning  
**Sign-off Required**: Before production deployment
