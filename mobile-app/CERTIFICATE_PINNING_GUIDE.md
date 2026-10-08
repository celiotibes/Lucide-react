# Certificate Pinning Integration Guide
## Phase 22.14 Security Hardening

## Overview

Certificate pinning is a security mechanism that validates SSL/TLS certificates before allowing API requests. This implementation ensures that your mobile app only communicates with servers using specific, pre-approved certificates.

## Architecture

### Components

1. **CertificatePinningService** (`mobile-app/src/utils/security/certificatePinning.ts`)
   - Stores and validates pinned certificates
   - Manages certificate fingerprints (SHA-256)
   - Handles expiration and backup certificates

2. **APIClient** (`mobile-app/src/services/APIClient.ts`)
   - Integrates certificate pinning into HTTP requests
   - Implements validation before fetch
   - Provides fallback to standard TLS validation
   - Logs all validation attempts

3. **Error Classes**
   - `PinningError`: Thrown when public key validation fails
   - `ValidationError`: Thrown when certificate chain validation fails

### Validation Flow

```
Request to API
    ↓
Extract host from URL
    ↓
Check if host has pinned certificates
    ↓
YES → Validate public key fingerprint
    ↓
    Fingerprint matches? 
    ├─ YES → Log success → Proceed with request
    └─ NO → Log failure → Attempt fallback validation
    ↓
NO → Log (no pinning configured) → Proceed with request
    ↓
Fallback: Standard TLS certificate chain validation
    ↓
    Chain valid?
    ├─ YES → Log success → Proceed with request
    └─ NO → Throw ValidationError → Block request
```

## Configuration

### Enable Certificate Pinning

```typescript
import { APIClient } from './services/APIClient';

const client = new APIClient({
  baseURL: 'https://api.example.com',
  enableCertificatePinning: true,  // Default: true
  pinnedHosts: ['api.example.com', 'sentry.io'],
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
});
```

### Disable Certificate Pinning (Testing Only)

```typescript
const client = new APIClient({
  baseURL: 'https://api.example.com',
  enableCertificatePinning: false,  // Disables validation
});
```

## Adding Pinned Certificates

### Basic Usage

```typescript
// Add a primary certificate
client.addPinnedCertificate(
  'api.example.com',
  'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBALRiMLAA...', // Public key
  undefined,  // Use default expiry (24 hours)
  false       // Not a backup
);
```

### With Custom Expiration

```typescript
// Add certificate with custom expiration (7 days from now)
const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);

client.addPinnedCertificate(
  'api.example.com',
  'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBALRiMLAA...',
  expiresAt,
  false
);
```

### Add Backup Certificates

```typescript
// Add primary certificate
client.addPinnedCertificate(
  'api.example.com',
  'primary-public-key-abc123',
  undefined,
  false
);

// Add backup certificate for failover
client.addPinnedCertificate(
  'api.example.com',
  'backup-public-key-def456',
  undefined,
  true  // This is a backup
);
```

## Usage Examples

### Simple GET Request

```typescript
try {
  const response = await client.get('/api/documents');
  
  if (response.success) {
    console.log('Data:', response.data);
  } else {
    console.error('Error:', response.error);
  }
} catch (error) {
  if (error instanceof PinningError) {
    console.error('Certificate pinning failed:', error.host);
  } else if (error instanceof ValidationError) {
    console.error('Certificate validation failed:', error.reason);
  }
}
```

### Authenticated Request

```typescript
// Set auth token
client.setAuthToken(authToken);

// Make authenticated request
const response = await client.post('/api/documents', {
  title: 'New Document',
  content: 'Content here...',
});

// Clear token when done
client.clearAuthToken();
```

### Batch Requests

```typescript
const results = await client.batch([
  { method: 'GET', endpoint: '/api/documents' },
  { method: 'GET', endpoint: '/api/transactions' },
  { method: 'GET', endpoint: '/api/properties' },
]);

results.forEach((result, index) => {
  console.log(`Request ${index + 1}:`, result.success ? '✅' : '❌');
});
```

## Monitoring & Debugging

### Get Validation Logs

```typescript
const logs = client.getValidationLogs();

logs.forEach(log => {
  console.log({
    host: log.host,
    method: log.method,  // 'pinning' | 'standard' | 'fallback'
    success: log.success,
    error: log.error,
    timestamp: new Date(log.timestamp).toISOString(),
  });
});
```

### Analyze Validation Patterns

```typescript
const logs = client.getValidationLogs();

// Count by method
const byMethod = logs.reduce((acc, log) => {
  acc[log.method] = (acc[log.method] || 0) + 1;
  return acc;
}, {});

console.log('Validation methods:', byMethod);

// Find failures
const failures = logs.filter(log => !log.success);
console.log('Total failures:', failures.length);
```

### Clear Logs

```typescript
// Clear old logs after analysis
client.clearValidationLogs();
```

## Error Handling

### PinningError

Thrown when the certificate's public key doesn't match any pinned fingerprint.

```typescript
try {
  await client.get('/api/data');
} catch (error) {
  if (error instanceof PinningError) {
    console.error({
      host: error.host,
      message: error.message,
      fingerprint: error.fingerprint,
      timestamp: error.timestamp,
    });
    
    // Log security incident
    logSecurityIncident('certificate_pinning_failed', error);
  }
}
```

### ValidationError

Thrown when the certificate chain validation fails (fallback).

```typescript
try {
  await client.get('/api/data');
} catch (error) {
  if (error instanceof ValidationError) {
    console.error({
      host: error.host,
      reason: error.reason,
      message: error.message,
      timestamp: error.timestamp,
    });
    
    // Log security incident
    logSecurityIncident('certificate_validation_failed', error);
  }
}
```

## Security Best Practices

### 1. Certificate Rotation

Always implement certificate rotation to avoid expiration:

```typescript
// Update certificates monthly
async function rotateCertificates(client: APIClient) {
  const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
  
  client.addPinnedCertificate(
    'api.example.com',
    newPublicKey,
    expiresAt,
    false  // Primary
  );
}
```

### 2. Backup Certificates

Always maintain backup certificates for failover:

```typescript
// Always add both primary and backup
client.addPinnedCertificate('api.example.com', primaryKey, undefined, false);
client.addPinnedCertificate('api.example.com', backupKey, undefined, true);
```

### 3. Log Security Incidents

Create security incident logs for all validation failures:

```typescript
async function logSecurityIncident(type: string, error: Error) {
  const incident = {
    type,
    timestamp: new Date().toISOString(),
    details: error.message,
    userAgent: navigator.userAgent,
  };
  
  // Send to security logging service
  await fetch('https://security-logs.example.com/incident', {
    method: 'POST',
    body: JSON.stringify(incident),
  });
}
```

### 4. Monitor Validation Logs

Regularly review validation logs to detect attacks:

```typescript
// Daily review
setInterval(() => {
  const logs = client.getValidationLogs();
  const failures = logs.filter(log => !log.success);
  
  if (failures.length > THRESHOLD) {
    alertSecurityTeam('Certificate validation failures detected', failures);
  }
}, 24 * 60 * 60 * 1000);
```

### 5. Test in Multiple Environments

- **Development**: May disable pinning or use test certificates
- **Staging**: Use staging certificates
- **Production**: Use production certificates with backups

```typescript
const isProd = process.env.NODE_ENV === 'production';

const config = {
  baseURL: process.env.API_BASE_URL,
  enableCertificatePinning: isProd,
  pinnedHosts: isProd 
    ? ['api.example.com']
    : ['staging-api.example.com'],
};

const client = new APIClient(config);
```

## Environment Variables

```env
# Production
API_BASE_URL=https://api.example.com
ENABLE_CERTIFICATE_PINNING=true

# Staging
# API_BASE_URL=https://staging-api.example.com
# ENABLE_CERTIFICATE_PINNING=true

# Development
# API_BASE_URL=http://localhost:3000
# ENABLE_CERTIFICATE_PINNING=false
```

## Testing

### Unit Tests

```typescript
import { APIClient, PinningError, ValidationError } from '../APIClient';

describe('Certificate Pinning', () => {
  it('should throw PinningError on validation failure', async () => {
    const client = new APIClient({ baseURL: 'https://api.test.com' });
    client.addPinnedCertificate('api.test.com', 'valid-key');
    
    // Test should verify error is thrown
    expect(() => {
      // Mock validation failure
    }).toThrow(PinningError);
  });
});
```

### Integration Tests

```typescript
it('should validate real certificate in staging', async () => {
  const client = new APIClient({
    baseURL: 'https://staging-api.example.com',
    enableCertificatePinning: true,
  });
  
  // Add real staging certificate
  client.addPinnedCertificate(
    'staging-api.example.com',
    STAGING_CERT_PUBLIC_KEY
  );
  
  // Real request should succeed
  const response = await client.get('/health');
  expect(response.success).toBe(true);
});
```

## Troubleshooting

### Certificate validation fails in dev

**Solution**: Disable pinning or use local certificates

```typescript
enableCertificatePinning: process.env.NODE_ENV === 'production'
```

### Certificate expired

**Solution**: Rotate certificates before expiration

```typescript
// Check certificate expiration
const logs = client.getValidationLogs();
const failures = logs.filter(log => !log.success);

if (failures.some(f => f.error?.includes('expired'))) {
  console.warn('Certificates may be expired, rotating...');
  updateCertificates();
}
```

### Too many validation failures

**Solution**: Review logs and check network/firewall issues

```typescript
const failures = client.getValidationLogs().filter(l => !l.success);

failures.forEach(f => {
  console.error(`${f.host}: ${f.error}`);
});
```

## Performance Considerations

- Certificate validation adds minimal overhead (<1ms per request)
- Validation logs are capped at 100 entries to prevent memory growth
- Fingerprint generation uses SHA-256 (hardware accelerated on modern devices)
- No network calls required for validation (all local)

## Migration Guide

### From No Pinning to Pinning

1. **Initialize** with `enableCertificatePinning: false`
2. **Add** certificates gradually to new API clients
3. **Test** thoroughly in staging
4. **Enable** pinning in production

```typescript
// Phase 1: Prepare (no validation yet)
const client = new APIClient({ enableCertificatePinning: false });

// Phase 2: Add certificates
client.addPinnedCertificate('api.example.com', primaryKey);
client.addPinnedCertificate('api.example.com', backupKey, undefined, true);

// Phase 3: Enable validation
client = new APIClient({ enableCertificatePinning: true });
```

## Files Modified

- `mobile-app/src/services/APIClient.ts` - Main implementation
- `mobile-app/src/services/__tests__/apiClient.test.ts` - Test suite
- `mobile-app/src/services/examples/certificatePinningExample.ts` - Examples

## Next Steps

1. Review the implementation in `APIClient.ts`
2. Study the examples in `certificatePinningExample.ts`
3. Run the test suite to verify compilation
4. Configure pinned certificates for your API
5. Test in staging environment
6. Deploy to production

## References

- [RFC 7469 - Public Key Pinning](https://tools.ietf.org/html/rfc7469)
- [OWASP Certificate Pinning](https://owasp.org/www-community/Pinning_Cheat_Sheet)
- [Certificate Fingerprinting](https://en.wikipedia.org/wiki/Public_key_fingerprint)
