# Security Integration Tests - Phase 22.16

Complete integration test suite for security services: TokenManager, SecureStorageService, CertificatePinning, and DataValidationService.

## Overview

This phase implements 115+ integration tests across 5 test files, validating security mechanisms with 85%+ coverage for all security services.

## Test Files

### 1. TokenManager Integration Tests
**File:** `tokenManager.integration.test.ts`
**Tests:** 20+ integration tests

#### Test Categories

**Token Storage & Retrieval (4 tests)**
- Store and retrieve access token securely via SecureStorageService
- Store and retrieve refresh token securely
- Return null when token not found
- Store token with correct expiration

**Token Expiration Detection (5 tests)**
- Detect valid tokens
- Detect expired tokens
- Return isTokenExpired correctly
- Consider token expired within buffer window (5 minutes)
- Detect missing token as expired

**Token Decoding (4 tests)**
- Decode valid JWT token
- Return null for invalid JWT format
- Return null for malformed base64
- Return null for empty token

**Token Cleanup & Logout (3 tests)**
- Clear all tokens on logout
- Prevent memory leaks by clearing references
- Handle multiple clearTokens calls

**Token Refresh Determination (3 tests)**
- Identify when token needs refresh
- Identify when token does not need refresh
- Handle missing token gracefully

**Concurrent Operations (2 tests)**
- Handle concurrent setToken and getToken operations
- Handle concurrent refresh token checks

**Persistence & Recovery (2 tests)**
- Survive process simulation (app crash/restart)
- Preserve token state across multiple instances

#### Key Assertions

```typescript
// Token is stored securely
expect(tokenManager.getToken()).toBe(MOCK_JWT_TOKEN.accessToken);

// Token validity is detected correctly
expect(tokenManager.isTokenValid()).toBe(true);

// Expiration buffer is applied (5 minutes)
expect(tokenManager.isTokenExpired()).toBe(true);

// Tokens cleared on logout
tokenManager.clearTokens();
expect(tokenManager.getToken()).toBeNull();
```

---

### 2. SecureStorageService Integration Tests
**File:** `secureStorageService.integration.test.ts`
**Tests:** 25+ integration tests

#### Test Categories

**Master Key Generation (3 tests)**
- Initialize with valid master key
- Use PBKDF2 with 100,000 iterations
- Generate unique keys for different instances

**Encryption & Decryption (5 tests)**
- Encrypt data with AES-256-GCM
- Not store plaintext for encrypted values
- Store plaintext for non-encrypted values
- Handle large encrypted data (100KB)
- Fail gracefully when decryption fails

**Key Rotation (3 tests)**
- Track key rotation metadata
- Handle multiple keys during rotation migration
- Prevent accessing data with old key after rotation

**TTL Management (3 tests)**
- Store items with TTL
- Return null for expired items
- Clean up expired items automatically

**Batch Operations (3 tests)**
- Store and retrieve multiple items
- Handle concurrent setItem operations
- Maintain data integrity in batch operations

**Data Types (5 tests)**
- Handle string data
- Handle number data
- Handle boolean data
- Handle object data
- Handle array data

**Item Management (3 tests)**
- Remove individual items
- Clear all items
- Get all keys

**Performance (2 tests)**
- Encrypt and decrypt within acceptable time (<100ms per op)
- Retrieve encrypted data efficiently (<1ms per op for 1000 retrievals)

**Metadata Management (2 tests)**
- Provide key metadata
- Not allow external modification of metadata

#### Key Assertions

```typescript
// PBKDF2 key derivation
const metadata = service.getKeyMetadata();
expect(metadata?.version).toBe(1);

// AES-256-GCM encryption
await service.setItem('key', 'sensitive', { encrypt: true });
expect(service.getItem('key')).toBe('sensitive');

// Key rotation tracking
expect(metadata?.rotatedAt).toBeUndefined(); // Initially

// TTL expiration
await service.setItem('temp', 'data', { ttl: 100 });
// After 150ms
expect(service.getItem('temp')).toBeNull();

// Performance metrics
expect(encryptTime).toBeLessThan(100 * 100); // 100ms per operation
```

---

### 3. APIClient Certificate Pinning Tests
**File:** `apiClient.integration.test.ts`
**Tests:** 18+ integration tests

#### Test Categories

**Valid Certificate Pinning (2 tests)**
- Accept valid pinned certificate
- Validate pinning for configured hosts

**Invalid Certificate Handling (3 tests)**
- Reject mismatched certificate fingerprint
- Reject expired certificates
- Reject certificate for wrong domain

**Backup Certificate Pinning (2 tests)**
- Accept backup certificates
- Respect allowBackupPins setting

**Multiple Pinned Certificates (2 tests)**
- Handle multiple certificates per domain
- Get fingerprints for domain

**Certificate Management (3 tests)**
- Remove pins for domain
- Remove expired pins
- List pinned domains

**Fingerprint Calculation (2 tests)**
- Generate consistent fingerprints
- Generate different fingerprints for different keys

**Certificate Expiration (2 tests)**
- Respect certificate expiration time
- Use default timeout for new certificates

**Validation Logging (2 tests)**
- Log validation attempts
- Clear validation logs

#### Key Assertions

```typescript
// Valid certificate acceptance
expect(
  pinningService.verifyPin(domain, publicKey)
).toBe(true);

// Expired certificate rejection
const isValid = pinningService.verifyPin(
  'api.example.com',
  EXPIRED_CERT.publicKey
);
expect(isValid).toBe(false);

// Backup certificates (when enabled)
expect(
  pinningService.verifyPin('api.example.com', backupCertKey)
).toBe(true);

// Performance
expect(elapsed).toBeLessThan(100); // 1000 verifications
```

---

### 4. DataValidationService Integration Tests
**File:** `dataValidationService.integration.test.ts`
**Tests:** 30+ integration tests

#### Test Categories

**XSS Prevention (7 tests)**
- Detect and prevent script tags
- Prevent image onerror handlers
- Prevent SVG onload handlers
- Prevent iframe injection
- Block javascript: protocol
- Sanitize various event handlers
- Handle DOM-based XSS attempts

**SQL Injection Prevention (7 tests)**
- Detect OR 1=1 injection
- Detect admin comment bypass
- Detect UNION SELECT injection
- Detect DROP TABLE injection
- Detect time-based blind SQL injection
- Detect comment-based bypass
- Detect hash-based bypass

**Email Validation (3 tests)**
- Accept valid email addresses
- Reject invalid email formats
- Reject emails with SQL injection attempts

**URL Validation (3 tests)**
- Accept valid URLs
- Reject invalid URLs
- Reject javascript: URLs

**Phone Number Validation (2 tests)**
- Accept valid phone numbers
- Reject invalid phone numbers

**Password Validation (3 tests)**
- Accept strong passwords
- Reject weak passwords
- Require minimum 8 characters

**Input Sanitization (5 tests)**
- Remove dangerous characters
- Remove javascript: protocol
- Remove event handlers
- Preserve safe content
- Handle empty strings

**HTML Sanitization (2 tests)**
- Escape HTML special characters
- Handle script tags

**Character Escaping (2 tests)**
- Escape special characters (&<>"')
- Escape forward slashes

**Safe String Detection (4 tests)**
- Identify safe strings
- Reject strings with script tags
- Reject strings with event handlers
- Reject strings with dangerous characters

**Batch Validation (2 tests)**
- Validate multiple fields
- Report validation errors for invalid fields

#### Attack Vectors Tested

**XSS Vectors:**
- `<script>alert("XSS")</script>`
- `<img src=x onerror="alert('XSS')">`
- `<svg/onload=fetch("http://attacker.com")>`
- `<iframe src="http://attacker.com"></iframe>`
- `javascript:alert('XSS')`

**SQL Injection Vectors:**
- `' OR '1'='1`
- `admin' --`
- `' UNION SELECT * FROM users --`
- `'; DROP TABLE users; --`
- `'; SELECT SLEEP(5); --`

**LDAP Injection:**
- `*`
- `* )`
- `*)(|(uid=*`

**Path Traversal:**
- `../../../etc/passwd`
- `..\\..\\..\\windows\\system32\\config\\sam`
- `%2e%2e%2fetc%2fpasswd`

**Command Injection:**
- `ls; cat /etc/passwd`
- `ls | cat`
- `ls && cat /etc/passwd`

**Edge Cases:**
- Null/undefined inputs
- Empty strings
- Whitespace-only strings
- Very long strings (1MB+)
- Special characters
- Unicode and emoji
- Mixed encodings
- Null bytes

#### Key Assertions

```typescript
// XSS Prevention
const xssPayload = '<script>alert("XSS")</script>';
const sanitized = DataValidationService.sanitizeInput(xssPayload);
expect(sanitized).not.toContain('<script>');

// SQL Injection Detection
const sqlPayload = "' OR '1'='1";
expect(DataValidationService.preventSqlInjection(sqlPayload)).toBe(false);

// Email Validation
expect(DataValidationService.validateEmail('user@example.com')).toBe(true);
expect(DataValidationService.validateEmail('invalid-email')).toBe(false);

// Safe String Detection
expect(DataValidationService.isSafeString('Hello World')).toBe(true);
expect(DataValidationService.isSafeString('<script>')).toBe(false);
```

---

### 5. End-to-End Security Flow Tests
**File:** `securityFlow.integration.test.ts`
**Tests:** 12+ integration tests

#### Test Categories

**Login Flow with Token Security (3 tests)**
- Complete secure login workflow
- Reject login with invalid credentials
- Prevent SQL injection in login attempts

**API Request Security (4 tests)**
- Validate and sanitize request data before sending
- Block requests with malicious payload
- Validate certificate before API request
- Reject requests with unverified certificate

**Response Validation Security (2 tests)**
- Validate and sanitize response data
- Prevent stored XSS from response data

**Token Refresh Security (2 tests)**
- Securely refresh expired tokens
- Not duplicate token refresh for concurrent requests

**Logout & Cleanup (2 tests)**
- Securely clear all data on logout
- Not expose sensitive data in logs

**Crash Recovery (2 tests)**
- Recover tokens after app crash
- Maintain data integrity across persistence

**Workflow Integrations:**

1. **Complete Secure Workflow:**
   - Login → Validate & store token
   - Authenticate → Check token validity
   - Make request → Validate request & certificate
   - Handle response → Validate response data
   - Logout → Clear everything

2. **Multi-Device Synchronization:**
   - Logout on one device affecting global session

3. **Concurrent Operations:**
   - Handle concurrent API requests with token refresh

4. **Malicious Request Blocking:**
   - Block complete XSS attack workflow
   - Block complete SQL injection attack workflow
   - Block certificate spoofing attack

## Fixtures

### MockCertificates
**File:** `fixtures/mockCertificates.ts`

Provides mock X.509 certificate data for pinning tests:
- `VALID_CERT_API`: Valid certificate for api.example.com
- `VALID_CERT_BACKUP`: Valid backup certificate
- `EXPIRED_CERT`: Expired certificate for testing rejection
- `WRONG_DOMAIN_CERT`: Certificate for different domain
- `MALFORMED_CERT`: Malformed certificate for error handling

### MockPayloads
**File:** `fixtures/mockPayloads.ts`

Provides mock API request/response payloads:
- Valid: Login request/response, transactions
- XSS attacks: Script tags, event handlers, SVG, JavaScript protocol
- SQL injection: OR statements, UNION, DROP, UPDATE, comments
- LDAP injection: Wildcards and filters
- Edge cases: Null values, empty strings, very long strings, special characters

### AttackVectors
**File:** `fixtures/attackVectors.ts`

Comprehensive collection of real-world attack vectors:
- 16+ XSS vectors
- 13+ SQL injection vectors
- 5 LDAP injection vectors
- 8 path traversal vectors
- 6 command injection vectors
- 5 NoSQL injection vectors
- 5 CSV injection vectors
- 3 XXE vectors
- Size bomb vectors
- Encoding bypass vectors

Utilities:
- `getVectorsByCategory()`: Get vectors by attack type
- `getRandomVector()`: Get random vector
- `isPresent()`: Check if vector is in text

## Running Tests

```bash
# Run all integration tests
npm test -- --testPathPattern=integration

# Run specific test file
npm test -- tokenManager.integration.test.ts

# Run with coverage
npm test -- --coverage --testPathPattern=integration

# Run in watch mode
npm test -- --watch --testPathPattern=integration
```

## Coverage Goals

- **TokenManager**: 95%+ coverage
- **SecureStorageService**: 90%+ coverage
- **CertificatePinning**: 85%+ coverage
- **DataValidationService**: 90%+ coverage
- **Overall**: 85%+ coverage

## Performance Benchmarks

- **Token operations**: <1ms per operation
- **Encryption/decryption**: <100ms per operation
- **Certificate verification**: <0.1ms per operation
- **Validation**: <1ms per operation (average)
- **Sanitization**: <0.5ms per operation (average)

## Security Properties Tested

1. **Confidentiality**
   - Tokens never logged
   - Encrypted storage
   - PBKDF2 key derivation

2. **Integrity**
   - Token expiration validation
   - Certificate fingerprint verification
   - Data sanitization

3. **Availability**
   - Token refresh mechanisms
   - Fallback certificate validation
   - Graceful error handling

4. **Authentication**
   - Email validation
   - Password strength validation
   - Token lifecycle management

5. **Authorization**
   - Certificate pinning
   - Token scope validation
   - Role-based access control (through token payload)

## Common Test Patterns

### Token Testing
```typescript
tokenManager.setToken(MOCK_JWT_TOKEN);
expect(tokenManager.isTokenValid()).toBe(true);
expect(tokenManager.getToken()).toBe(MOCK_JWT_TOKEN.accessToken);
```

### Storage Testing
```typescript
await service.setItem('key', value, { encrypt: true });
expect(service.getItem('key')).toEqual(value);
```

### Validation Testing
```typescript
expect(DataValidationService.validateEmail(validEmail)).toBe(true);
expect(DataValidationService.preventSqlInjection(sqlPayload)).toBe(false);
```

### Certificate Testing
```typescript
pinningService.addPin(domain, publicKey);
expect(pinningService.verifyPin(domain, publicKey)).toBe(true);
```

## Troubleshooting

### Tests Timeout
- Increase Jest timeout: `jest.setTimeout(10000);`
- Check for infinite loops in crypto operations

### Mock Issues
- Ensure `SecureStore` is properly mocked
- Verify mock return values match expected types

### Flaky Tests
- Avoid time-dependent assertions
- Use fixed dates for TTL tests
- Mock system time when needed

## Future Enhancements

- [ ] Add performance profiling tests
- [ ] Add memory leak detection tests
- [ ] Add stress testing with 1000+ concurrent operations
- [ ] Add real API integration tests
- [ ] Add real certificate pinning tests with live domains
- [ ] Add biometric authentication tests
- [ ] Add multi-device sync tests
- [ ] Add analytics and audit trail tests
