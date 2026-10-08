# Security Hardening Implementation Guide - Phase 22.14

## Overview

This document details the security hardening implementation for CRMT Mobile application, implementing Phase 22.14 requirements:
- End-to-end encryption for sensitive data
- Secure storage using Keychain/Keystore
- API security with certificate pinning
- JWT token management with refresh
- Data sanitization against injection attacks
- Privacy compliance (GDPR, CCPA, LGPD)

**Status**: Implementation Complete  
**Test Coverage**: >70%  
**Date**: October 8, 2026

---

## 1. Encryption Service Implementation

### 1.1 Technical Specification

**File**: `src/utils/security/encryptionService.ts`

**Algorithm**: AES-256-GCM
- **Key Size**: 256 bits (32 bytes)
- **IV Size**: 96 bits (12 bytes) - GCM recommended
- **Auth Tag**: 128 bits (16 bytes)
- **Salt**: 256 bits (32 bytes)
- **KDF**: PBKDF2 with SHA-256
- **Iterations**: 100,000 (per NIST recommendation)

### 1.2 Usage Example

```typescript
import { EncryptionService } from './utils/security/encryptionService';

// Encrypt sensitive data
const encrypted = await EncryptionService.encrypt(
  'sensitive_data_here',
  'user_password'
);

// Result structure
{
  encrypted: '3f4c9d...',
  iv: 'a1b2c3...',
  salt: 'd4e5f6...',
  authTag: '7g8h9i...'
}

// Decrypt
const decrypted = await EncryptionService.decrypt(encrypted, 'user_password');

// Hash data (one-way)
const hash = await EncryptionService.hashData(data, 'sha256');

// Generate secure token
const token = EncryptionService.generateSecureToken(32);
```

### 1.3 Security Considerations

- **Key Derivation**: PBKDF2 with 100,000 iterations prevents brute-force attacks
- **Random IV**: New IV for each encryption ensures semantic security
- **Authentication Tag**: Prevents tampering and ensures data integrity
- **Zero-Length**: Handles empty strings securely
- **Timing**: Constant-time comparisons prevent timing attacks

---

## 2. Secure Storage Implementation

### 2.1 Technical Specification

**File**: `src/utils/security/secureStorageService.ts`

**Storage Hierarchy**:
1. Primary: expo-secure-store (Keychain/Keystore)
2. Fallback: AsyncStorage with AES-256 encryption
3. Master Key: Securely generated and stored in Keychain

### 2.2 Usage Examples

```typescript
import { SecureStorageService } from './utils/security/secureStorageService';

// Initialize (call once at app startup)
await SecureStorageService.initialize();

// Store encrypted data
await SecureStorageService.setItem(
  'sensitive_key',
  { data: 'value' },
  { encrypt: true, ttl: 30 * 24 * 60 * 60 * 1000 } // 30 days
);

// Retrieve data
const data = await SecureStorageService.getItem('sensitive_key');

// Store authentication tokens
await SecureStorageService.storeCredentials(email, password);
const creds = await SecureStorageService.getCredentials();

// Store JWT tokens
await SecureStorageService.storeToken(accessToken, refreshToken, expiresIn);
const token = await SecureStorageService.getToken();

// Clear all secure storage
await SecureStorageService.clearAll();

// Check if item exists
const exists = await SecureStorageService.hasItem('key');

// Get all keys
const allKeys = await SecureStorageService.getAllKeys();
```

### 2.3 Key Rotation Strategy

```typescript
// Automatic rotation every 90 days
Private static readonly KEY_ROTATION_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;

// Manual rotation
await SecureStorageService.rotateKeys();
```

### 2.4 TTL (Time-to-Live)

Data with TTL is automatically deleted after expiration:

```typescript
// Data expires in 24 hours
await SecureStorageService.setItem(
  'temp_data',
  data,
  { ttl: 24 * 60 * 60 * 1000 }
);
```

---

## 3. Certificate Pinning Implementation

### 3.1 Technical Specification

**File**: `src/utils/security/certificatePinning.ts`

**Pinning Strategy**:
- **Public Key Pinning**: SHA-256 fingerprints of public keys
- **Backup Pins**: Secondary keys for certificate rotation
- **Expiration**: 24-hour cache with refresh

### 3.2 Configuration

```typescript
// Default pinned hosts configuration
const PINNING_CONFIGS = {
  'api.crmt.app': {
    domain: 'api.crmt.app',
    publicKeys: [
      'sha256/AAAA...', // Primary key
      'sha256/BBBB...', // Backup key
    ],
    allowBackupKeys: true,
  },
  'secure.crmt.app': {
    domain: 'secure.crmt.app',
    publicKeys: [
      'sha256/CCCC...',
    ],
    allowBackupKeys: false,
  },
};
```

### 3.3 Usage in APIClient

```typescript
// Certificate pinning automatically enabled
const apiClient = new APIClient({
  baseURL: 'https://api.crmt.app',
  enableCertificatePinning: true,
  pinnedHosts: ['api.crmt.app', 'secure.crmt.app'],
});

// Add pins for domains
apiClient.addPinnedCertificate('api.crmt.app', publicKeyFingerprint);

// Verification happens automatically on each request
```

### 3.4 Certificate Extraction

To extract certificate fingerprints:

```bash
# Extract public key from certificate
openssl x509 -in certificate.crt -pubkey -noout | \
  openssl pkey -pubin -outform der | \
  openssl dgst -sha256 -binary | \
  openssl enc -base64

# Result: sha256/XXXXX...
```

---

## 4. JWT Token Management

### 4.1 Technical Specification

**File**: `src/utils/security/tokenManager.ts`

**Token Handling**:
- **Storage**: Encrypted in Keychain/Keystore
- **Validation**: Signature and expiration verification
- **Refresh**: Automatic 5 minutes before expiration
- **Revocation**: JTI-based token revocation support

### 4.2 JWT Structure

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user_id",
    "email": "user@example.com",
    "iat": 1728406800,
    "exp": 1728410400,
    "aud": "crmt-mobile",
    "iss": "crmt-auth",
    "jti": "unique_token_id",
    "scopes": ["read:profile", "write:transactions"]
  },
  "signature": "signature_here"
}
```

### 4.3 Usage Examples

```typescript
import { TokenManager } from './utils/security/tokenManager';

// Initialize
await TokenManager.initialize();

// Set token from login
await TokenManager.setToken({
  accessToken: 'eyJhbGc...',
  refreshToken: 'eyJhbGc...',
  expiresIn: 3600,
  tokenType: 'Bearer',
});

// Get current token (auto-refreshes if needed)
const token = TokenManager.getAccessToken();

// Check token validity
if (TokenManager.isTokenValid()) {
  // Token is valid
}

// Get token payload
const payload = TokenManager.getTokenPayload();
console.log(payload.sub); // User ID
console.log(payload.email); // User email

// Check if refresh needed
if (TokenManager.shouldRefreshToken()) {
  await TokenManager.refreshTokenSilently();
}

// Manually revoke token
TokenManager.revokeToken(token);

// Clear all tokens
await TokenManager.clearTokens();

// Get time remaining
const timeLeft = TokenManager.getTimeRemaining();
console.log(`Token expires in ${timeLeft}ms`);
```

### 4.4 Token Refresh Flow

```typescript
// Register refresh callback
TokenManager.setRefreshCallback(async (newToken) => {
  // Called when token is refreshed
  console.log('Token refreshed');
  // Update UI, retry failed requests, etc.
});

// Automatic refresh check every minute
TokenManager.setTokenRefreshCallback(() => {
  console.log('Token needs refresh');
});
```

---

## 5. Data Validation & Sanitization

### 5.1 Technical Specification

**File**: `src/utils/security/dataValidationService.ts`

**Protection Against**:
- SQL Injection
- Cross-Site Scripting (XSS)
- Command Injection
- Path Traversal

### 5.2 Input Validation

```typescript
import { DataValidationService } from './utils/security/dataValidationService';

// Email validation
if (DataValidationService.validateEmail(email)) {
  // Email is valid and safe
}

// URL validation
if (DataValidationService.validateUrl(url)) {
  // URL is valid
}

// Phone number validation
if (DataValidationService.validatePhoneNumber(phone)) {
  // Phone is valid
}

// Password strength validation
if (DataValidationService.validatePassword(password)) {
  // Password meets requirements:
  // - Min 8 chars
  // - Uppercase + lowercase
  // - Number + special char
}

// Custom validation
const isValid = DataValidationService.validateInput(
  userInput,
  {
    type: 'custom',
    minLength: 5,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9_-]+$/,
    validator: (value) => !value.includes('admin'),
  }
);

// Batch validation
const result = DataValidationService.validateBatch(
  {
    email: userEmail,
    phone: userPhone,
    password: userPassword,
  },
  {
    email: { type: 'email' },
    phone: { type: 'phone' },
    password: { type: 'password' },
  }
);

if (!result.valid) {
  console.error(result.errors);
  // { email: 'Invalid email', ... }
}
```

### 5.3 Input Sanitization

```typescript
// Sanitize user input (remove dangerous characters)
const safe = DataValidationService.sanitizeInput(userInput);

// Prevent SQL injection
if (!DataValidationService.preventSqlInjection(input)) {
  // Input contains SQL patterns
  throw new Error('Invalid input');
}

// Check if string is safe
if (DataValidationService.isSafeString(userString)) {
  // Safe to use in HTML/JSON
}

// HTML sanitization
const safeHtml = DataValidationService.sanitizeHtml(userHtml);

// Escape special characters
const escaped = DataValidationService.escapeSpecialChars(text);
```

---

## 6. Privacy Compliance Implementation

### 6.1 Technical Specification

**File**: `src/utils/security/privacyCompliance.ts`

**Compliance Features**:
- GDPR rights implementation
- CCPA compliance
- LGPD compliance
- Data export and deletion
- Consent management
- Breach notifications

### 6.2 Usage Examples

```typescript
import { PrivacyComplianceService } from './utils/security/privacyCompliance';

// Initialize
await PrivacyComplianceService.initialize();

// Get user privacy preferences
const prefs = await PrivacyComplianceService.getPreferences();

// Update privacy preferences
await PrivacyComplianceService.setPreferences({
  analyticsConsent: true,
  marketingConsent: false,
  thirdPartyConsent: false,
  dataRetentionDays: 365,
});

// GDPR Article 15 - Right to Access
const accessRequest = await PrivacyComplianceService.requestDataAccess(userId);

// GDPR Article 17 - Right to be Forgotten
const deletionRequest = await PrivacyComplianceService.requestDataDeletion(userId, 'no reason');

// GDPR Article 20 - Right to Portability
const portabilityRequest = await PrivacyComplianceService.requestDataPortability(userId);

// Export user data
const userData = await PrivacyComplianceService.exportUserData(userId);
// Returns: { userId, exportDate, preferences, processingLogs }

// Report data breach
const breach = await PrivacyComplianceService.reportDataBreach(
  'Unauthorized access detected',
  ['personal', 'financial'],
  1500
);

// Check compliance status
const status = await PrivacyComplianceService.getComplianceStatus();
// Returns: { compliant: true/false, issues: [...] }

// Anonymize user data
await PrivacyComplianceService.anonymizeUserData(userId);
```

### 6.3 Data Retention Limits

```typescript
// Automatic retention based on data classification
{
  personal: 365,     // 1 year
  sensitive: 90,     // 3 months
  financial: 730,    // 2 years (compliance)
  health: 1825,      // 5 years
  location: 30       // 1 month
}
```

### 6.4 Legal Basis

Supported legal basis for processing:
- `consent` - User explicit consent
- `contract` - Contract performance
- `legal-obligation` - Legal requirement
- `vital-interests` - Life or health protection
- `public-task` - Public function
- `legitimate-interests` - Legitimate business interests

---

## 7. APIClient Integration

### 7.1 Security Features Enabled

```typescript
const apiClient = new APIClient({
  baseURL: 'https://api.crmt.app',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  headers: {
    'User-Agent': 'CRMT-Mobile/1.0',
  },
  enableCertificatePinning: true,
  pinnedHosts: ['api.crmt.app'],
  enableTokenRefresh: true,
  enableInputValidation: true,
});
```

### 7.2 Request Flow with Security

```
User Request
    ↓
[1] Input Validation → Reject if invalid
    ↓
[2] Token Check → Refresh if expired
    ↓
[3] Build Headers → Add Authorization
    ↓
[4] Certificate Pinning → Verify host certificate
    ↓
[5] Execute Request → HTTPS with TLS 1.3
    ↓
[6] Validate Response → Check status and content
    ↓
[7] Parse & Return → Decrypt if needed
```

---

## 8. Testing & Validation

### 8.1 Unit Tests

**Location**: `src/utils/security/__tests__/`

```bash
# Run security tests
npm test -- --testPathPattern=security

# Run with coverage
npm test -- --coverage --testPathPattern=security

# Run specific test file
npm test -- encryptionService.test.ts
```

### 8.2 Test Coverage Requirements

- **Encryption**: >90% coverage
- **Secure Storage**: >85% coverage
- **Certificate Pinning**: >80% coverage
- **Token Manager**: >85% coverage
- **Data Validation**: >90% coverage
- **Overall**: >70% coverage

### 8.3 Security Test Cases

```typescript
// Encryption tests
- Encrypt/decrypt round-trip
- Different passwords produce different ciphertexts
- Corrupted ciphertext fails decryption
- IV randomization works correctly
- Large data encryption/decryption
- Empty string handling

// Storage tests
- Store and retrieve encrypted data
- TTL expiration
- Master key rotation
- Fallback to AsyncStorage
- Clear all data
- Key existence checks

// Certificate pinning tests
- Pin verification success
- Pin mismatch detection
- Backup pin failover
- Pin expiration
- Host extraction from URL

// Token management tests
- Token storage and retrieval
- Expiration detection
- Automatic refresh
- Token revocation
- Payload decoding
- Invalid token handling

// Data validation tests
- Email validation
- SQL injection detection
- XSS prevention
- Batch validation
- Custom validators
- Sanitization correctness
```

---

## 9. App Configuration

### 9.1 app.json Security Settings

```json
{
  "expo": {
    "ios": {
      "entitlements": {
        "aps-environment": "production",
        "com.apple.developer.associated-domains": [
          "applinks:api.crmt.app"
        ]
      },
      "privacyPolicy": "https://crmt.app/privacy"
    },
    "android": {
      "permissions": [
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE"
      ]
    },
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "minSdkVersion": 24,
            "usesCleartextTraffic": false
          }
        }
      ]
    ]
  }
}
```

### 9.2 Environment Variables

```bash
# .env.production
API_ENDPOINT=https://api.crmt.app
ENABLE_CERTIFICATE_PINNING=true
LOG_LEVEL=error
FIREBASE_API_KEY=your_key_here
```

---

## 10. Deployment Checklist

### Pre-Deployment

- [ ] All security tests passing (>70% coverage)
- [ ] Code review completed
- [ ] Penetration testing done
- [ ] OWASP Top 10 validated
- [ ] Dependencies audited (no high-severity vulnerabilities)
- [ ] Certificate pinning configured
- [ ] API endpoints verified
- [ ] Encryption keys rotated
- [ ] Privacy policy updated
- [ ] Terms of service updated

### Post-Deployment

- [ ] Monitor security logs
- [ ] Check for anomalies
- [ ] Verify certificate pinning working
- [ ] Confirm encryption in place
- [ ] Monitor API errors
- [ ] Check user data access
- [ ] Verify compliance features
- [ ] Review incident reports

---

## 11. Incident Response

### 11.1 Breach Detection

```typescript
// Monitor for suspicious patterns
- Failed authentication attempts: >5 in 5 minutes
- Invalid tokens: >10 per minute
- Certificate pinning failures: Any
- Encryption errors: >1 per minute
- SQL injection attempts: Any detected
```

### 11.2 Response Actions

1. **Alert** - Notify security team immediately
2. **Isolate** - Disable affected accounts
3. **Investigate** - Review logs and audit trail
4. **Notify** - Inform users if data exposed
5. **Remediate** - Apply fixes and patch
6. **Document** - Record incident details

---

## 12. References & Resources

### Security Standards
- [OWASP Top 10 Mobile](https://owasp.org/www-project-mobile-top-10/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)

### Specifications
- [GDPR Official Text](https://gdpr-info.eu/)
- [NIST Special Publication 800-38D (GCM)](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [RFC 2898 (PBKDF2)](https://tools.ietf.org/html/rfc2898)

### Tools
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

## 13. Support & Contact

For security concerns:
- **Email**: security@crmt.app
- **Report Vulnerability**: [Vulnerability Report Form]
- **Legal Compliance**: legal@crmt.app

---

**Document Version**: 1.0  
**Last Updated**: October 8, 2026  
**Next Review**: October 8, 2027
