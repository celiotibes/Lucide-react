# API Utilities - Certificate Pinning

## Quick Start

### Initialize Secure API Client
```typescript
import { initializeAPIClientWithPinning } from './certificatePinningSetup';

const apiClient = initializeAPIClientWithPinning();
```

### Add Pinned Certificates
```typescript
// Add primary certificate
apiClient.addPinnedCertificate('api.example.com', publicKeyString);

// Add backup certificate
apiClient.addPinnedCertificate(
  'api.example.com',
  backupKeyString,
  undefined,
  true  // isBackup
);
```

### Make Requests (with automatic certificate validation)
```typescript
try {
  const response = await apiClient.get('/documents');
  if (response.success) {
    console.log(response.data);
  }
} catch (error) {
  if (error instanceof PinningError) {
    // Certificate pinning failed
    console.error('Pinning error:', error.host);
  } else if (error instanceof ValidationError) {
    // Standard validation failed
    console.error('Validation error:', error.reason);
  }
}
```

## Configuration

### Environment Variables
```env
REACT_APP_API_BASE_URL=https://api.example.com
REACT_APP_API_CERT_PRIMARY=<public-key>
REACT_APP_API_CERT_BACKUP=<backup-key>
```

### Disable Pinning (Development Only)
```typescript
const client = new APIClient({
  baseURL: 'https://api.example.com',
  enableCertificatePinning: false,
});
```

## Monitoring

### Get Validation Statistics
```typescript
import { getCertificateValidationStats } from './certificatePinningSetup';

const stats = getCertificateValidationStats(apiClient);
console.log(`Success rate: ${stats.successRate}%`);
console.log(`Total validations: ${stats.totalValidations}`);
```

### Export Validation Logs
```typescript
import { exportValidationLogs } from './certificatePinningSetup';

const logs = exportValidationLogs(apiClient);
console.log(logs);
```

### Update Certificates
```typescript
import { updateCertificates } from './certificatePinningSetup';

updateCertificates(
  apiClient,
  'api.example.com',
  newPrimaryKey,
  newBackupKey
);
```

## Error Handling

### PinningError
```typescript
import { PinningError } from '../../services/APIClient';

try {
  await apiClient.get('/data');
} catch (error) {
  if (error instanceof PinningError) {
    console.error(`Pinning failed for ${error.host}`);
    // Log security incident
  }
}
```

### ValidationError
```typescript
import { ValidationError } from '../../services/APIClient';

try {
  await apiClient.get('/data');
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(`Validation failed: ${error.reason}`);
    // Check certificate expiration
  }
}
```

## Files

- **certificatePinningSetup.ts** - Main setup and configuration
- **../../services/APIClient.ts** - Core API client with pinning
- **../../security/certificatePinning.ts** - Pinning service (do not modify)

## Documentation

- **CERTIFICATE_PINNING_GUIDE.md** - Full implementation guide
- **certificatePinningExample.ts** - 10 working examples
- **apiClient.test.ts** - Test suite and usage patterns

## Best Practices

1. Always use backup certificates
2. Rotate certificates monthly
3. Monitor validation logs daily
4. Log security incidents
5. Test in staging before production
6. Document certificate expiration dates

## Troubleshooting

**Validation failing in development?**
```typescript
enableCertificatePinning: process.env.NODE_ENV === 'production'
```

**Need to check validation logs?**
```typescript
const logs = apiClient.getValidationLogs();
const failures = logs.filter(log => !log.success);
console.log('Failures:', failures);
```

**Want to test with real certificates?**
```typescript
const testClient = new APIClient({
  baseURL: 'https://staging-api.example.com',
  enableCertificatePinning: true,
});

testClient.addPinnedCertificate(
  'staging-api.example.com',
  stagingPublicKey
);
```

## See Also

- [OWASP Pinning Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Pinning_Cheat_Sheet.html)
- [RFC 7469 - Public Key Pinning](https://tools.ietf.org/html/rfc7469)
