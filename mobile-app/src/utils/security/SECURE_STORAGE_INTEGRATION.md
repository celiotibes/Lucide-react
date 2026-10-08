# Phase 22.14: SecureStorageService Integration with expo-secure-store

## Overview

The `SecureStorageService` has been hardened with Phase 22.14 security enhancements, moving the master encryption key from plain-text localStorage to the device's native secure storage via `expo-secure-store`.

## Critical Security Improvements

### 1. **Master Key Management**
- **Before**: Stored in plain-text localStorage (CRITICAL VULNERABILITY)
- **After**: Stored in expo-secure-store (device-level encryption)
- **Implementation**: PBKDF2 derivation with 100,000 iterations

### 2. **Key Encryption Details**
- **Algorithm**: PBKDF2-SHA256
- **Iterations**: 100,000 (exceeds NIST minimum of 100k)
- **Salt Length**: 32 bytes
- **Derived Key Length**: 32 bytes (256-bit)
- **Combined Storage Format**: salt + derived_key (hex encoded)

### 3. **Encryption Lifecycle**
- **Data Encryption**: AES-256-GCM (unchanged from encryptionService.ts)
- **Key Rotation**: Automatic every 90 days
- **Rotation Warning**: Triggered at 14 days before expiry
- **Re-encryption**: Automatic data re-encryption during key rotation

### 4. **Error Handling**
- Graceful fallback if expo-secure-store is unavailable
- Fallback: 64-byte secure random token generation
- All errors logged with timestamps for audit trails

## Installation & Setup

### Prerequisites
```bash
npm install expo-secure-store@13.0.0  # Already in package.json
```

### Initialization Pattern

```typescript
import { SecureStorageService } from './utils/security/secureStorageService';

// Create instance
const secureStorage = new SecureStorageService();

// Initialize BEFORE using
await secureStorage.initialize();

// Now safe to use for encryption operations
```

### Application-Level Integration

**Example: App initialization (App.tsx or main entry point)**

```typescript
import { SecureStorageService } from './utils/security/secureStorageService';

export const secureStorageService = new SecureStorageService();

export async function initializeApp() {
  try {
    // Initialize secure storage with key management
    await secureStorageService.initialize();
    console.log('Secure storage initialized');

    // Retrieve key metadata to verify setup
    const keyMetadata = secureStorageService.getKeyMetadata();
    console.log('Master key info:', {
      version: keyMetadata?.version,
      createdAt: new Date(keyMetadata?.createdAt || 0),
      rotatedAt: keyMetadata?.rotatedAt ? new Date(keyMetadata.rotatedAt) : 'Never',
    });
  } catch (error) {
    console.error('Failed to initialize app security:', error);
    throw error;
  }
}
```

## API Reference

### Methods

#### `async initialize(): Promise<void>`
Initializes the secure storage service. Must be called before any other operations.
- Loads or generates master key from expo-secure-store
- Loads key metadata
- Checks for pending key rotation
- Loads persisted items from localStorage

**Usage:**
```typescript
await secureStorage.initialize();
```

#### `async setItem<T>(key: string, value: T, options?: SecureStorageOptions): Promise<void>`
Stores an item with optional encryption.
- **key**: Storage key identifier
- **value**: Data to store
- **options.encrypt**: Enable encryption (default: true)
- **options.ttl**: Time-to-live in milliseconds (optional)

**Usage:**
```typescript
// Encrypted storage (recommended)
await secureStorage.setItem('auth_token', myToken, { encrypt: true });

// Non-encrypted storage
await secureStorage.setItem('user_id', userId, { encrypt: false });

// With TTL (30 minute expiry)
await secureStorage.setItem('temp_data', data, { 
  encrypt: true, 
  ttl: 30 * 60 * 1000 
});
```

#### `getItem<T>(key: string): T | null`
Retrieves and decrypts an item.
- Returns `null` if not found or expired
- Automatically removes expired items

**Usage:**
```typescript
const token = secureStorage.getItem<string>('auth_token');
if (token) {
  // Use decrypted token
}
```

#### `removeItem(key: string): void`
Removes an item from storage.

**Usage:**
```typescript
secureStorage.removeItem('auth_token');
```

#### `async clear(): Promise<void>`
Clears all items from storage.

**Usage:**
```typescript
await secureStorage.clear();
```

#### `getAllKeys(): string[]`
Returns array of all stored keys.

**Usage:**
```typescript
const keys = secureStorage.getAllKeys();
console.log('Stored keys:', keys);
```

#### `getKeyMetadata(): MasterKeyMetadata | null`
Returns master key metadata.

**Returns:**
```typescript
{
  createdAt: number;          // Timestamp when key was created
  rotatedAt?: number;         // Timestamp of last rotation
  version: number;            // Key version (increments on rotation)
}
```

**Usage:**
```typescript
const metadata = secureStorage.getKeyMetadata();
if (metadata) {
  const keyAge = Date.now() - metadata.createdAt;
  const daysUntilRotation = 90 - Math.floor(keyAge / (24 * 60 * 60 * 1000));
  console.log(`Key rotation in ${daysUntilRotation} days`);
}
```

## Key Rotation Details

### Automatic Rotation
- **Interval**: Every 90 days (from creation date)
- **Warning**: Logged at 14 days before rotation
- **Trigger**: Checked during initialization

### Rotation Process
1. Generate new PBKDF2-derived key
2. Decrypt all encrypted items with old key
3. Re-encrypt all items with new key
4. Store new key in expo-secure-store
5. Update version metadata
6. Log rotation completion

### Logging Events

All key lifecycle events are logged with timestamps:

```typescript
// Key creation
[2026-10-08T12:34:56.789Z] SecureStorage: created - {"version":1}

// Key initialization
[2026-10-08T12:34:56.789Z] SecureStorage: initialized - {"version":1}

// Rotation warning
[2026-10-08T12:34:56.789Z] SecureStorage: rotation_warning - {"daysUntilRotation":7}

// Key rotation
[2026-10-08T12:34:56.789Z] SecureStorage: rotated - {"version":2,"itemsRotated":5}

// Cleanup
[2026-10-08T12:34:56.789Z] SecureStorage: cleanup - {"expiredItemsRemoved":2}
```

## Security Considerations

### 1. **Master Key Storage**
- Master key is stored in expo-secure-store, not accessible via JavaScript
- On Android: Uses Android Keystore
- On iOS: Uses Keychain
- On Web: Falls back to secure random generation (no native store)

### 2. **Data Encryption**
- All sensitive data encrypted with AES-256-GCM
- Each encryption includes unique IV and auth tag
- Salt-based key derivation prevents rainbow tables

### 3. **Key Rotation**
- Automatic 90-day rotation ensures keys don't persist indefinitely
- All historical data re-encrypted with new key
- Version tracking for audit purposes

### 4. **Error Handling**
- Failed decryptions return null (safe default)
- Secure Store unavailability handled gracefully
- All errors logged for debugging

### 5. **TTL (Time-To-Live)**
- Sensitive data can auto-expire
- Expired items automatically removed
- Useful for temporary tokens or session data

## Platform-Specific Behavior

### Android
- Uses Android Keystore System
- Hardware-backed encryption when available
- Requires device lock enabled for strongest security

### iOS
- Uses Keychain Services
- Automatic iCloud backup (can be disabled if needed)
- Protected with device passcode

### Web/Fallback
- expo-secure-store not available in web environment
- Falls back to 64-byte secure random token
- Consider using Web Crypto API for web implementations

## Migration from Old Implementation

If migrating from the old localStorage-based approach:

```typescript
// Old approach (INSECURE - DO NOT USE)
// localStorage.setItem('app_keychain_master_key', plainTextKey);

// New approach (SECURE)
const secureStorage = new SecureStorageService();
await secureStorage.initialize();
// Key is automatically managed in expo-secure-store
```

## Testing & Verification

```typescript
// Verify initialization
const metadata = secureStorage.getKeyMetadata();
console.assert(metadata !== null, 'Key metadata should be loaded');
console.assert(metadata!.version > 0, 'Key should have valid version');

// Verify encryption/decryption
await secureStorage.setItem('test', { secret: 'value' }, { encrypt: true });
const retrieved = secureStorage.getItem('test');
console.assert(retrieved !== null, 'Should retrieve encrypted data');

// Verify TTL
await secureStorage.setItem('expiring', 'data', { ttl: 1000 });
await new Promise(r => setTimeout(r, 1100));
const expired = secureStorage.getItem('expiring');
console.assert(expired === null, 'Should expire after TTL');
```

## Compliance & Standards

- **PBKDF2**: NIST SP 800-132 compliant
- **AES-256-GCM**: NIST SP 800-38D compliant
- **Key Derivation**: 100,000 iterations (exceeds minimum requirements)
- **Secure Storage**: Platform-native encryption used
- **Error Handling**: Secure failure patterns (no key leakage)

## Troubleshooting

### Issue: "SecureStorageService not initialized"
**Solution**: Call `await secureStorage.initialize()` before using

### Issue: Decryption failures
**Solution**: Verify data wasn't modified, check key metadata version

### Issue: expo-secure-store unavailable warnings
**Solution**: Normal on web; uses fallback secure token generation

### Issue: Key rotation warnings
**Solution**: Normal at 14 days before rotation; automatic rotation handles this

## References

- **expo-secure-store**: https://docs.expo.dev/modules/expo-secure-store/
- **PBKDF2 (RFC 2898)**: https://tools.ietf.org/html/rfc2898
- **AES-GCM (NIST SP 800-38D)**: https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf
- **Encryption Service**: See encryptionService.ts for details

## Phase 22.14 Checklist

- [x] Master key moved from localStorage to expo-secure-store
- [x] PBKDF2 derivation with 100k iterations implemented
- [x] Key rotation logic implemented (90-day interval)
- [x] Automatic re-encryption during rotation
- [x] Key metadata tracking (creation, rotation, version)
- [x] Comprehensive error handling with fallback
- [x] Logging for key lifecycle events
- [x] TypeScript type safety maintained
- [x] Promise<T> return types preserved for async operations
- [x] No modifications to encryptionService.ts (unchanged)
