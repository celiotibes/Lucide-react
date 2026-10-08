# Security Services Usage Guide

Comprehensive guide for using the security services in the Lucide React mobile application.

## Table of Contents

1. [EncryptionService](#encryptionservice)
2. [SecureStorageService](#securestorageservice)
3. [CertificatePinningService](#certificatepinningservice)
4. [TokenManager](#tokenmanager)
5. [PrivacyComplianceService](#privacycomplianceservice)
6. [DataValidationService](#datavalidationservice)
7. [Best Practices](#best-practices)
8. [Common Workflows](#common-workflows)

---

## EncryptionService

End-to-end encryption for sensitive data using AES-256-GCM.

### Basic Encryption

```typescript
import { EncryptionService } from '@utils/security';

const plaintext = 'sensitive data';
const encryptionKey = 'your-32-byte-key-here-1234567890';

// Encrypt data
const encrypted = EncryptionService.encrypt(plaintext, encryptionKey);

// Decrypt data
const decrypted = EncryptionService.decrypt(encrypted, encryptionKey);

console.log(decrypted === plaintext); // true
```

### Encrypt Financial Data

```typescript
const financialData = JSON.stringify({
  accountNumber: '1234567890',
  balance: 50000.00,
  currency: 'BRL',
});

const encrypted = EncryptionService.encrypt(financialData, encryptionKey);

// Store encrypted data in secure storage
storage.setItem('financial_data', encrypted, { encrypt: true });
```

### Hashing Data

```typescript
// Generate SHA-256 hash
const hash = EncryptionService.hashData('password', 'sha256');

// Verify hashed password
const userPasswordHash = EncryptionService.hashData(inputPassword, 'sha256');
if (userPasswordHash === storedHash) {
  console.log('Password matches!');
}
```

### Generate Secure Tokens

```typescript
// Generate 32-byte secure token
const token = EncryptionService.generateSecureToken(32);

// Generate API key
const apiKey = EncryptionService.generateSecureToken(64);
```

### Custom Encryption Options

```typescript
const options = {
  iterations: 150000, // Increase iterations for higher security
  saltLength: 48,     // Larger salt for more entropy
  keyLength: 32,      // 256-bit key
  tagLength: 16,      // Authentication tag length
};

const encrypted = EncryptionService.encrypt(
  plaintext,
  encryptionKey,
  options
);
```

---

## SecureStorageService

Secure credential storage with automatic encryption and TTL support.

### Basic Usage

```typescript
import { SecureStorageService } from '@utils/security';

const storage = new SecureStorageService();

// Store encrypted data
storage.setItem('api_key', 'sk_live_123456', {
  encrypt: true,
  ttl: 86400, // 24 hours
});

// Retrieve data
const apiKey = storage.getItem('api_key');

// Clear all data
storage.clear();
```

### Store User Credentials

```typescript
const userCredentials = {
  email: 'user@example.com',
  passwordHash: EncryptionService.hashData(password, 'sha256'),
};

storage.setItem('credentials', JSON.stringify(userCredentials), {
  encrypt: true,
  ttl: 2592000, // 30 days
});
```

### Automatic Expiration with TTL

```typescript
// Store data that expires in 1 hour
storage.setItem('temp_token', token, {
  encrypt: true,
  ttl: 3600, // 1 hour
});

// After 1 hour, the data is automatically deleted
setTimeout(() => {
  const expired = storage.getItem('temp_token');
  console.log(expired === null); // true
}, 3600000);
```

### Store Multiple Items

```typescript
// Store different types of data
storage.setItem('access_token', accessToken, { encrypt: true, ttl: 900 });
storage.setItem('refresh_token', refreshToken, { encrypt: true, ttl: 604800 });
storage.setItem('user_id', userId, { encrypt: true, ttl: 2592000 });

// Retrieve all items
const allItems = {
  accessToken: storage.getItem('access_token'),
  refreshToken: storage.getItem('refresh_token'),
  userId: storage.getItem('user_id'),
};
```

---

## CertificatePinningService

Prevent man-in-the-middle attacks using public key pinning.

### Add Certificate Pin

```typescript
import { CertificatePinningService } from '@utils/security';

const pinning = new CertificatePinningService();

// Add primary certificate pin for API domain
pinning.addPin('api.crmt.app', 'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAKj34GkWqyLEQ2j900j+VrQkJZHjUUx');

// Add backup pin for key rotation
pinning.addPin('backup-api.crmt.app', 'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAXyz...');
```

### Verify Certificate Before API Call

```typescript
const domain = 'api.crmt.app';
const certificatePublicKey = 'extracted_from_response';

if (pinning.verifyPin(domain, certificatePublicKey)) {
  // Certificate is valid and pinned
  console.log('✅ Certificate verified, safe to proceed');
  // Make API call
} else {
  // Certificate does not match or is expired
  console.log('❌ Certificate verification failed, reject request');
  // Throw error, use backup domain, or retry
}
```

### Generate Certificate Pin

```bash
# Generate SHA-256 fingerprint from public key
openssl s_client -servername api.crmt.app -connect api.crmt.app:443 \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64

# Output: sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
```

---

## TokenManager

Manage JWT tokens with automatic refresh.

### Store and Retrieve Token

```typescript
import { TokenManager } from '@utils/security';

const tokenManager = new TokenManager();

// Store JWT token
const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
tokenManager.setToken(jwtToken);

// Check if token is valid
if (tokenManager.isTokenValid()) {
  const token = tokenManager.getToken();
  // Use token for API requests
}
```

### Handle Token Refresh

```typescript
// Store refresh token
const refreshToken = 'refresh_token_xyz123';
tokenManager.setRefreshToken(refreshToken);

// Check if access token is expired and needs refresh
if (!tokenManager.isTokenValid()) {
  const refreshToken = tokenManager.getRefreshToken();
  
  if (refreshToken) {
    // Call API to get new access token
    const newAccessToken = await api.refreshToken(refreshToken);
    
    // Update stored token
    tokenManager.setToken(newAccessToken);
  } else {
    // No refresh token available, user must login again
    redirectToLogin();
  }
}
```

### Decode JWT Payload

```typescript
const token = tokenManager.getToken();

if (token) {
  // Decode JWT payload (without verification)
  const payload = TokenManager.decodeJWT(token);
  
  console.log(payload);
  // {
  //   sub: 'user-123',
  //   name: 'John Doe',
  //   iat: 1630000000,
  //   exp: 1630003600
  // }
  
  // Get expiration time
  const expiresAt = new Date(payload.exp * 1000);
  console.log(`Token expires at: ${expiresAt}`);
}
```

### Clear Tokens (Logout)

```typescript
tokenManager.clearTokens();
console.log(tokenManager.getToken() === null); // true
```

---

## PrivacyComplianceService

Manage privacy compliance and user consent across GDPR, CCPA, and LGPD.

### Accept Privacy Policy

```typescript
import { PrivacyComplianceService, PrivacyRegulation } from '@utils/security';

const privacy = new PrivacyComplianceService();
const userId = 'user-123';

// User accepts privacy policy (GDPR)
privacy.acceptPrivacyPolicy(userId, PrivacyRegulation.GDPR, '1.0');

// User accepts privacy policy (CCPA)
privacy.acceptPrivacyPolicy(userId, PrivacyRegulation.CCPA, '1.0');

// User accepts privacy policy (LGPD)
privacy.acceptPrivacyPolicy(userId, PrivacyRegulation.LGPD, '1.0');

// Verify acceptance
const acceptance = privacy.getPrivacyPolicyAcceptance(userId);
console.log(acceptance); // { regulation: 'GDPR', version: '1.0', timestamp: Date }
```

### Manage User Consent

```typescript
// Update user consent preferences
privacy.updateUserConsent(userId, {
  marketing: true,      // Allow marketing emails
  analytics: false,     // Disable analytics tracking
  thirdParty: false,    // Disable third-party sharing
});

// Retrieve consent preferences
const consent = privacy.getUserConsent(userId);
console.log(consent);
// { marketing: true, analytics: false, thirdParty: false }

// Update individual consent
privacy.updateUserConsent(userId, { marketing: false });
```

### Data Deletion Workflow (GDPR Article 17, CCPA 1798.105)

```typescript
// User requests data deletion
privacy.requestDataDeletion(userId);

// Check deletion request status
let request = privacy.getDataDeletionRequest(userId);
console.log(request.status); // 'pending'

// Process the deletion request
privacy.updateDataDeletionStatus(userId, 'processing');

// After processing is complete
privacy.updateDataDeletionStatus(userId, 'completed');

request = privacy.getDataDeletionRequest(userId);
console.log(request.status); // 'completed'
```

### Generate Compliance Report

```typescript
// Generate report for audit purposes
const report = privacy.generateComplianceReport(userId);

console.log(report);
// {
//   userId: 'user-123',
//   regulations: ['GDPR', 'CCPA'],
//   consentStatus: { marketing: true, analytics: false, thirdParty: false },
//   deletionStatus: 'completed',
//   lastUpdated: Date,
//   policyVersion: '1.0'
// }
```

### Export User Data (GDPR Right to Portability)

```typescript
// Export user data in standard format
const userData = {
  profile: {
    name: 'John Doe',
    email: 'john@example.com',
  },
  transactions: [
    { id: 'TX001', date: '2024-01-15', amount: 1000 },
  ],
};

const exported = privacy.exportUserData(userId, userData);

console.log(exported);
// {
//   format: 'json',
//   data: userData,
//   exportedAt: Date,
//   version: '1.0'
// }

// Send exported data to user via email
sendEmail(user.email, {
  subject: 'Your Data Export',
  attachment: JSON.stringify(exported, null, 2),
});
```

---

## DataValidationService

Prevent SQL injection, XSS, and other injection attacks.

### Prevent SQL Injection

```typescript
import { DataValidationService } from '@utils/security';

const maliciousInput = "'; DROP TABLE users; --";
const isSafe = DataValidationService.preventSqlInjection(maliciousInput);

console.log(isSafe); // false - detected SQL injection attempt

// Safe input is allowed
const safeInput = 'John Doe';
console.log(DataValidationService.preventSqlInjection(safeInput)); // true
```

### Prevent XSS Attacks

```typescript
// Escape HTML entities in user-generated content
const userComment = '<script>alert("xss")</script>';
const escaped = DataValidationService.escapeSpecialChars(userComment);

console.log(escaped);
// &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;

// Or sanitize input completely
const sanitized = DataValidationService.sanitizeInput(userComment);
console.log(sanitized); // scriptalertxssscript
```

### Validate Email

```typescript
const validEmail = 'user@example.com';
console.log(DataValidationService.validateEmail(validEmail)); // true

const invalidEmail = 'not-an-email';
console.log(DataValidationService.validateEmail(invalidEmail)); // false
```

### Validate Password Strength

```typescript
// Strong password (8+ chars, uppercase, lowercase, numbers, special chars)
const strongPassword = 'SecureP@ss123';
console.log(DataValidationService.validatePassword(strongPassword)); // true

// Weak password
const weakPassword = 'password123';
console.log(DataValidationService.validatePassword(weakPassword)); // false
```

### Validate Phone Number

```typescript
const phoneNumber = '+55 11 98765-4321';
console.log(DataValidationService.validatePhoneNumber(phoneNumber)); // true
```

### Check if String is Safe

```typescript
const safeString = 'Normal text input';
console.log(DataValidationService.isSafeString(safeString)); // true

const maliciousString = "'; DROP TABLE users; --";
console.log(DataValidationService.isSafeString(maliciousString)); // false
```

---

## Best Practices

### 1. Never Log Sensitive Data

```typescript
// ❌ DON'T
console.log('Encryption key:', encryptionKey);
console.log('User password:', password);
console.log('Token:', jwtToken);

// ✅ DO
console.log('Encryption operation completed');
console.log('User authentication successful');
console.log('Token stored securely');
```

### 2. Always Validate User Input

```typescript
// ❌ DON'T - Direct database query with user input
const query = `SELECT * FROM users WHERE email = '${userEmail}'`;

// ✅ DO - Validate input first
if (DataValidationService.validateEmail(userEmail)) {
  // Proceed with secure query
}
```

### 3. Use Secure Key Derivation

```typescript
// ❌ DON'T - Using plain text as key
const plainKey = 'mypassword';

// ✅ DO - Use PBKDF2 with proper iterations
const key = 'properly-derived-key-with-pbkdf2-100000-iterations';
```

### 4. Implement Automatic Token Refresh

```typescript
// Check token before each API call
async function makeAPICall(endpoint, options) {
  // Refresh token if needed
  if (!tokenManager.isTokenValid()) {
    await refreshAccessToken();
  }

  const token = tokenManager.getToken();
  // Make API call with fresh token
}
```

### 5. Store Secrets in Environment Variables

```typescript
// ❌ DON'T - Hardcode secrets
const API_KEY = 'sk_live_1234567890abcdef';

// ✅ DO - Use environment variables
const API_KEY = process.env.API_KEY;
```

### 6. Implement Certificate Pinning Fallback

```typescript
async function makeSecureAPICall(url) {
  try {
    // Try primary domain
    if (!pinning.verifyPin('api.crmt.app', cert)) {
      throw new Error('Certificate verification failed');
    }
    return await fetch(url);
  } catch (error) {
    // Fall back to backup domain
    return await fetch(url.replace('api.crmt.app', 'backup-api.crmt.app'));
  }
}
```

---

## Common Workflows

### Complete Login Flow

```typescript
async function handleLogin(email, password) {
  // 1. Validate input
  if (!DataValidationService.validateEmail(email)) {
    throw new Error('Invalid email');
  }
  if (!DataValidationService.validatePassword(password)) {
    throw new Error('Weak password');
  }

  // 2. Hash password
  const passwordHash = EncryptionService.hashData(password, 'sha256');

  // 3. Send to API (over HTTPS with certificate pinning)
  const response = await authenticateUser(email, passwordHash);

  // 4. Store tokens securely
  tokenManager.setToken(response.accessToken);
  tokenManager.setRefreshToken(response.refreshToken);

  // 5. Store user credentials encrypted
  storage.setItem('user_email', email, { encrypt: true });

  // 6. Accept privacy policy if new user
  if (response.isNewUser) {
    privacy.acceptPrivacyPolicy(response.userId, PrivacyRegulation.GDPR, '1.0');
  }

  return response;
}
```

### Protected API Request

```typescript
async function protectedAPIRequest(endpoint, options = {}) {
  // 1. Verify token is valid (with auto-refresh)
  if (!tokenManager.isTokenValid()) {
    const refreshToken = tokenManager.getRefreshToken();
    if (!refreshToken) {
      redirectToLogin();
      return;
    }
    const newToken = await refreshAccessToken(refreshToken);
    tokenManager.setToken(newToken);
  }

  // 2. Verify certificate pin
  if (!pinning.verifyPin('api.crmt.app', cert)) {
    throw new Error('Certificate verification failed');
  }

  // 3. Make request with token
  const token = tokenManager.getToken();
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return response.json();
}
```

### Handle Sensitive Form Submission

```typescript
async function handleFormSubmission(formData) {
  // 1. Validate all inputs
  const validations = {
    email: DataValidationService.validateEmail(formData.email),
    password: DataValidationService.validatePassword(formData.password),
    name: DataValidationService.isSafeString(formData.name),
  };

  if (!Object.values(validations).every(v => v)) {
    throw new Error('Invalid form data');
  }

  // 2. Encrypt sensitive fields
  const encryptedData = {
    email: formData.email,
    password: EncryptionService.encrypt(formData.password, encryptionKey),
    name: DataValidationService.sanitizeInput(formData.name),
  };

  // 3. Store user consent
  privacy.updateUserConsent(userId, {
    marketing: formData.marketingConsent,
    analytics: formData.analyticsConsent,
  });

  // 4. Submit via protected API
  return await protectedAPIRequest('/api/update-profile', {
    method: 'POST',
    body: JSON.stringify(encryptedData),
  });
}
```

---

## Summary

- **EncryptionService**: Use for all sensitive data encryption/decryption
- **SecureStorageService**: Use for storing credentials with automatic expiration
- **CertificatePinningService**: Use to verify API certificates before requests
- **TokenManager**: Use for JWT lifecycle management with auto-refresh
- **PrivacyComplianceService**: Use to track compliance and user consent
- **DataValidationService**: Use to validate all user inputs before processing

All services are designed to work together to create a comprehensive security layer for your application.
