# Security Policy - CRMT Mobile

## 1. Overview

The CRMT Mobile application implements comprehensive security measures to protect sensitive user data, including financial and personal information. This document outlines the security architecture, practices, and policies.

## 2. Security Architecture

### 2.1 End-to-End Encryption
- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Salt**: 256-bit random salt per encryption
- **IV**: 96-bit random IV (Galois/Counter Mode)
- **Authentication**: 128-bit auth tag for integrity verification

**Implementation**: `src/utils/security/encryptionService.ts`

```typescript
const encrypted = await EncryptionService.encrypt(sensitiveData, password);
const decrypted = await EncryptionService.decrypt(encrypted, password);
```

### 2.2 Secure Storage
- **iOS**: Keychain (native secure storage)
- **Android**: Keystore (native secure storage)
- **Fallback**: Encrypted AsyncStorage for backwards compatibility

**Implementation**: `src/utils/security/secureStorageService.ts`

```typescript
// Store sensitive data
await SecureStorageService.setItem('auth:token', tokenData, { encrypted: true });

// Retrieve sensitive data
const token = await SecureStorageService.getItem('auth:token');

// Clear sensitive data
await SecureStorageService.clearToken();
```

### 2.3 Certificate Pinning
Prevents Man-in-the-Middle (MITM) attacks by pinning SSL/TLS certificates for critical API endpoints.

**Implementation**: `src/utils/security/certificatePinning.ts`

- **Primary Keys**: SHA-256 public key fingerprints
- **Backup Keys**: Secondary pins for certificate rotation
- **Validation**: Automatic during API requests
- **Timeout**: 24-hour cache for pinned certificates

```typescript
// Add pinned certificate
apiClient.addPinnedCertificate('api.crmt.app', publicKeyFingerprint);

// Verification happens automatically during requests
```

### 2.4 JWT Token Management
Secure handling of authentication tokens with automatic refresh.

**Implementation**: `src/utils/security/tokenManager.ts`

- **Token Storage**: Encrypted in Keychain/Keystore
- **Refresh Threshold**: Automatic refresh 5 minutes before expiration
- **Validation**: JWT signature and expiration validation
- **Revocation**: Support for token revocation

```typescript
// Initialize
await TokenManager.initialize();

// Get current token (auto-refreshes if needed)
const token = TokenManager.getAccessToken();

// Check if refresh is needed
if (TokenManager.shouldRefreshToken()) {
  await TokenManager.refreshTokenSilently();
}
```

### 2.5 Data Validation & Sanitization
Protection against SQL injection, XSS, and other injection attacks.

**Implementation**: `src/utils/security/dataValidationService.ts`

```typescript
// Validate email
if (DataValidationService.validateEmail(email)) {
  // Email is valid
}

// Sanitize input
const safe = DataValidationService.sanitizeInput(userInput);

// Prevent SQL injection
if (!DataValidationService.preventSqlInjection(input)) {
  // Input contains SQL injection patterns
}

// Validate password strength
if (DataValidationService.validatePassword(password)) {
  // Password meets security requirements
}

// Batch validation
const result = DataValidationService.validateBatch(
  { email: userEmail, phone: userPhone },
  {
    email: { type: 'email' },
    phone: { type: 'phone' },
  }
);
```

## 3. API Security

### 3.1 Certificate Pinning Integration
All API requests automatically validate certificates:

```typescript
const apiClient = new APIClient({
  baseURL: API_ENDPOINT,
  enableCertificatePinning: true,
  pinnedHosts: ['api.crmt.app'],
});
```

### 3.2 Request/Response Validation
- Input validation on all user data
- Response validation before processing
- HTTPS-only communication
- TLS 1.3 or higher

### 3.3 Rate Limiting
- Automatic retry with exponential backoff
- Rate limit detection and handling
- Client-side rate limiting for API keys

## 4. Authentication & Authorization

### 4.1 Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character

### 4.2 Two-Factor Authentication (2FA)
- TOTP (Time-based One-Time Password) support
- SMS verification as fallback
- Backup codes for account recovery

### 4.3 Session Management
- Automatic token refresh
- Session timeout: 24 hours
- Logout clears all tokens and cached data
- Concurrent session limit: 3 active sessions

## 5. Data Protection

### 5.1 Data Classification
- **Personal Data**: Name, email, phone (365-day retention)
- **Sensitive Data**: Tax ID, bank details (90-day retention)
- **Financial Data**: Invoices, statements (2-year retention for compliance)
- **Location Data**: GPS coordinates (30-day retention)
- **Health Data**: Medical records (5-year retention)

### 5.2 Data Retention
Data is automatically deleted after retention period expires unless:
- Legally required to retain
- User explicitly opts to retain
- Needed for ongoing disputes

### 5.3 Data Encryption at Rest
- All sensitive data encrypted with AES-256-GCM
- Encryption keys stored in Keychain/Keystore
- Master key rotation every 90 days

### 5.4 Data Encryption in Transit
- HTTPS with TLS 1.3
- Certificate pinning
- Perfect Forward Secrecy (PFS)

## 6. Privacy Compliance

### 6.1 GDPR (Europe)
Compliance with General Data Protection Regulation:
- Right to access (Article 15)
- Right to be forgotten (Article 17)
- Right to data portability (Article 20)
- Right to restrict processing (Article 18)
- Data breach notification within 72 hours

### 6.2 CCPA (California)
Compliance with California Consumer Privacy Act:
- Consumer right to know
- Consumer right to delete
- Consumer right to opt-out
- Consumer right to non-discrimination

### 6.3 LGPD (Brazil)
Compliance with Lei Geral de Proteção de Dados:
- User consent required
- Data breach notification (Article 6)
- Data subject rights
- Data controller responsibilities

**Implementation**: `src/utils/security/privacyCompliance.ts`

```typescript
// Get privacy preferences
const prefs = await PrivacyComplianceService.getPreferences();

// Request data access (GDPR Article 15)
const request = await PrivacyComplianceService.requestDataAccess(userId);

// Request data deletion (GDPR Article 17)
const deletion = await PrivacyComplianceService.requestDataDeletion(userId);

// Export user data (GDPR Article 20)
const data = await PrivacyComplianceService.exportUserData(userId);
```

## 7. Security Best Practices

### 7.1 Input Validation
- Validate all user inputs
- Use whitelist validation where possible
- Reject suspicious patterns
- Log validation failures

### 7.2 Output Encoding
- HTML encode all user-generated content
- URL encode URL parameters
- JSON escape special characters

### 7.3 Error Handling
- Don't expose sensitive information in errors
- Log detailed errors for debugging
- Return generic errors to users
- Include correlation IDs for support

### 7.4 Logging & Monitoring
- Log security events
- Monitor for suspicious patterns
- Alert on failed authentication
- Track data access

## 8. Vulnerability Reporting

If you discover a security vulnerability, please email **security@crmt.app** instead of using public issue trackers.

### Security Disclosure
- Disclose responsibly
- Allow 90 days for remediation
- Do not publicly disclose before fix
- Acknowledge security researchers

## 9. Dependencies Security

### 9.1 Regular Updates
- Update dependencies monthly
- Check for security advisories weekly
- Use npm audit for vulnerability scanning
- Test updates in staging first

### 9.2 Trusted Sources
- Only install from official npm registry
- Verify package signatures
- Review package dependencies
- Avoid untrusted or abandoned packages

## 10. Testing & Validation

### 10.1 Security Testing
- Regular penetration testing
- OWASP Top 10 validation
- Static code analysis
- Dynamic security testing

### 10.2 Code Review
- Peer review all security code
- Security-focused code reviews
- Threat modeling for new features
- Regular security audits

## 11. Incident Response

### 11.1 Data Breach Response Plan
1. **Detect**: Monitor for suspicious activity
2. **Contain**: Isolate affected systems
3. **Eradicate**: Remove attack vectors
4. **Recover**: Restore normal operations
5. **Notify**: Inform affected users and authorities
6. **Document**: Record incident details

### 11.2 Contact Information
- Security Team: security@crmt.app
- Legal Compliance: legal@crmt.app
- Support: support@crmt.app

## 12. Changes & Versioning

This security policy is versioned and maintained alongside the application.

- **Last Updated**: 2026-10-08
- **Policy Version**: 1.0
- **Applicable Until**: 2027-10-08

## 13. References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [GDPR Official Text](https://gdpr-info.eu/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [OWASP Mobile Security](https://owasp.org/www-project-mobile-top-10/)
