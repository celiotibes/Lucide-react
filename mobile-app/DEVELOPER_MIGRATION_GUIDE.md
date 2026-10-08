# Phase 22.14 Developer Migration Guide

## Quick Start for Developers

### 1. Update Your Service Initialization

**Before:**
```typescript
// ❌ Old approach - immediate synchronous usage
import { SecureStorageService } from '@utils/security/secureStorageService';

export const secureStorage = new SecureStorageService();

export async function loginUser(credentials) {
  // This would fail now - service not initialized
  secureStorage.setItem('auth_token', credentials.token);
}
```

**After:**
```typescript
// ✅ New approach - async initialization
import { SecureStorageService } from '@utils/security/secureStorageService';

export const secureStorage = new SecureStorageService();

// Initialize during app startup
export async function initializeApp() {
  try {
    await secureStorage.initialize();
    console.log('Secure storage ready');
  } catch (error) {
    console.error('Failed to initialize secure storage:', error);
    throw error;
  }
}

export async function loginUser(credentials) {
  // Now safe to use - service has been initialized
  await secureStorage.setItem('auth_token', credentials.token);
}
```

### 2. Update App Entry Point

**Example: App.tsx**

```typescript
import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { secureStorage, initializeApp } from '@services/index';

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        // Initialize secure storage first
        await initializeApp();
        setIsReady(true);
      } catch (error) {
        console.error('App initialization failed:', error);
        // Handle error - show error screen or retry
      }
    }

    bootstrap();
  }, []);

  if (!isReady) {
    return <SplashScreen />; // Show loading screen
  }

  return <NavigationContainer>{/* Your app navigation */}</NavigationContainer>;
}
```

### 3. Update setItem() Calls

**Pattern 1: Store Encrypted Data (Most Common)**

```typescript
// ❌ Before - no await
secureStorage.setItem('auth_token', myToken, { encrypt: true });

// ✅ After - with await
await secureStorage.setItem('auth_token', myToken, { encrypt: true });
```

**Pattern 2: Store with TTL (Auto-Expire)**

```typescript
// ❌ Before - no await
secureStorage.setItem('otp_code', code, { 
  encrypt: true, 
  ttl: 5 * 60 * 1000  // 5 minutes
});

// ✅ After - with await
await secureStorage.setItem('otp_code', code, { 
  encrypt: true, 
  ttl: 5 * 60 * 1000  // 5 minutes
});
```

**Pattern 3: Store Unencrypted Data**

```typescript
// ❌ Before - no await
secureStorage.setItem('user_id', userId, { encrypt: false });

// ✅ After - with await
await secureStorage.setItem('user_id', userId, { encrypt: false });
```

### 4. getItem() Calls (No Changes Required)

Good news! Reading data doesn't require changes:

```typescript
// ✅ This still works the same - no await needed
const token = secureStorage.getItem<string>('auth_token');
if (token) {
  // Use the token
  addAuthorizationHeader(token);
}
```

### 5. Update clear() Calls

**Pattern: Logout / Clear Data**

```typescript
// ❌ Before - no await
secureStorage.clear();

// ✅ After - with await
await secureStorage.clear();
```

### 6. Common Use Cases

#### Authentication Service

```typescript
import { secureStorage } from '@utils/security/secureStorageService';

export class AuthService {
  async login(email: string, password: string) {
    const response = await apiClient.post('/auth/login', { email, password });
    
    // ✅ Now awaiting storage operations
    await secureStorage.setItem('auth_token', response.token, { encrypt: true });
    await secureStorage.setItem('refresh_token', response.refreshToken, { encrypt: true });
    await secureStorage.setItem('user_id', response.userId, { encrypt: false });
    
    return response;
  }

  async logout() {
    // ✅ Now awaiting clear operation
    await secureStorage.clear();
    
    // Clear API client auth headers
    apiClient.clearAuthHeaders();
  }

  getAuthToken(): string | null {
    // ✅ Still synchronous - no await needed
    return secureStorage.getItem<string>('auth_token');
  }

  async refreshToken() {
    const refreshToken = secureStorage.getItem<string>('refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiClient.post('/auth/refresh', { refreshToken });
    
    // ✅ Update token securely
    await secureStorage.setItem('auth_token', response.token, { encrypt: true });
    
    return response.token;
  }
}
```

#### Session Management

```typescript
export class SessionManager {
  async storeSession(sessionData: SessionData) {
    const sessionId = generateUUID();
    
    // ✅ Store encrypted session data with 1-hour TTL
    await secureStorage.setItem(
      `session_${sessionId}`,
      sessionData,
      { 
        encrypt: true, 
        ttl: 60 * 60 * 1000  // 1 hour
      }
    );
    
    return sessionId;
  }

  getSession(sessionId: string): SessionData | null {
    // ✅ Still synchronous - data retrieved from memory
    return secureStorage.getItem<SessionData>(`session_${sessionId}`);
  }

  async endSession(sessionId: string) {
    // ✅ Remove specific session
    secureStorage.removeItem(`session_${sessionId}`);
  }
}
```

#### Device Credentials Storage

```typescript
export class DeviceCredentials {
  async storePushToken(token: string) {
    // ✅ Store with encryption
    await secureStorage.setItem('push_token', token, { encrypt: true });
  }

  async storeDeviceId(deviceId: string) {
    // ✅ Device ID can be non-encrypted (not sensitive)
    await secureStorage.setItem('device_id', deviceId, { encrypt: false });
  }

  getDeviceFingerprint() {
    // ✅ Non-encrypted retrieval
    return secureStorage.getItem<string>('device_id');
  }

  async clearAllTokens() {
    // ✅ Remove sensitive tokens on logout
    await secureStorage.clear();
  }
}
```

### 7. Error Handling Patterns

```typescript
// Pattern 1: Try-catch for initialization
async function initializeSecureStorage() {
  try {
    await secureStorage.initialize();
  } catch (error) {
    console.error('Secure storage initialization failed:', error);
    // Show error to user or retry
    throw error;
  }
}

// Pattern 2: Try-catch for storage operations
async function saveUserData(userData: UserData) {
  try {
    await secureStorage.setItem('user_data', userData);
  } catch (error) {
    console.error('Failed to save user data:', error);
    // Handle error appropriately
  }
}

// Pattern 3: Fallback pattern
async function getStoredCredentials() {
  try {
    const credentials = secureStorage.getItem<Credentials>('credentials');
    return credentials || null;
  } catch (error) {
    console.warn('Failed to retrieve credentials:', error);
    return null;
  }
}
```

### 8. React Hooks Pattern

```typescript
import { useEffect, useState } from 'react';
import { secureStorage } from '@utils/security/secureStorageService';

// Hook for managing secure storage
export function useSecureStorage<T>(key: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load data on mount
    const value = secureStorage.getItem<T>(key);
    setData(value);
    setLoading(false);
  }, [key]);

  const setValue = async (newValue: T) => {
    try {
      await secureStorage.setItem(key, newValue, { encrypt: true });
      setData(newValue);
    } catch (error) {
      console.error('Failed to update secure storage:', error);
      throw error;
    }
  };

  const remove = () => {
    secureStorage.removeItem(key);
    setData(null);
  };

  return { data, loading, setValue, remove };
}

// Usage in component
function AuthorizedScreen() {
  const { data: token, loading } = useSecureStorage<string>('auth_token');

  if (loading) {
    return <LoadingScreen />;
  }

  if (!token) {
    return <LoginScreen />;
  }

  return <MainApp token={token} />;
}
```

### 9. Async/Await in Navigation

```typescript
// Navigation handler with secure storage
async function handleLogin(credentials: LoginCredentials) {
  try {
    setLoading(true);
    
    const response = await authAPI.login(credentials);
    
    // ✅ Await storage operations
    await secureStorage.setItem('auth_token', response.token);
    
    // Navigate after storage complete
    navigation.replace('MainApp');
  } catch (error) {
    showErrorMessage(error.message);
  } finally {
    setLoading(false);
  }
}

async function handleLogout() {
  try {
    setLoading(true);
    
    // ✅ Clear all sensitive data
    await secureStorage.clear();
    
    // Navigate after storage cleared
    navigation.replace('LoginApp');
  } catch (error) {
    showErrorMessage('Failed to logout');
  } finally {
    setLoading(false);
  }
}
```

### 10. Key Metadata Monitoring

```typescript
// Monitor key lifecycle for security audit
export function monitorKeyHealth() {
  const metadata = secureStorage.getKeyMetadata();
  
  if (!metadata) {
    console.warn('Master key not initialized');
    return;
  }

  const keyAgeMs = Date.now() - metadata.createdAt;
  const keyAgeDays = Math.floor(keyAgeMs / (24 * 60 * 60 * 1000));
  const daysUntilRotation = 90 - keyAgeDays;

  console.log('Key Lifecycle Status:');
  console.log(`  Version: ${metadata.version}`);
  console.log(`  Age: ${keyAgeDays} days`);
  console.log(`  Until Rotation: ${daysUntilRotation} days`);
  
  if (daysUntilRotation < 0) {
    console.warn('⚠️ Key rotation OVERDUE!');
  } else if (daysUntilRotation < 14) {
    console.warn(`⚠️ Key rotation in ${daysUntilRotation} days`);
  }

  if (metadata.rotatedAt) {
    const lastRotationDate = new Date(metadata.rotatedAt);
    console.log(`  Last Rotation: ${lastRotationDate.toISOString()}`);
  }
}
```

## Checklist for Migration

- [ ] Update `App.tsx` or main entry point to call `await secureStorage.initialize()`
- [ ] Add `await` to all `secureStorage.setItem()` calls
- [ ] Add `await` to all `secureStorage.clear()` calls
- [ ] Keep `secureStorage.getItem()` calls as-is (no await needed)
- [ ] Keep `secureStorage.removeItem()` calls as-is (still sync)
- [ ] Test authentication flow
- [ ] Test logout flow
- [ ] Test token refresh flow
- [ ] Test error scenarios (network offline, storage failure)
- [ ] Run `npm run type-check` - should pass
- [ ] Run `npm test` - all tests should pass
- [ ] Manual testing on Android device
- [ ] Manual testing on iOS device
- [ ] Verify localStorage is NOT used for master key

## Troubleshooting

### Issue: "SecureStorageService not initialized"
**Cause:** Called methods before `await secureStorage.initialize()`
**Solution:** Ensure initialization is awaited during app startup

```typescript
// ✅ Correct
await secureStorage.initialize();
await secureStorage.setItem('key', value);

// ❌ Wrong
secureStorage.setItem('key', value); // Error: not initialized
```

### Issue: "setItem is not a function" or type error
**Cause:** `setItem` is now async
**Solution:** Add `await` keyword

```typescript
// ✅ Correct
await secureStorage.setItem('key', value);

// ❌ Wrong
secureStorage.setItem('key', value);
```

### Issue: "Key rotation overdue" warning in logs
**Cause:** Normal - happens when key exceeds 90 days
**Solution:** No action needed - automatic rotation handles it

## Performance Impact on App Startup

```
Old Approach:     0ms   (synchronous, but insecure)
New Approach:    ~100ms (includes PBKDF2 key generation)
Impact:         Imperceptible to users
```

The 100ms initialization cost is a one-time operation during app boot and is well worth the security improvement.

## Support & Questions

For questions about the Phase 22.14 migration:

1. **Read**: `SECURE_STORAGE_INTEGRATION.md` - Comprehensive reference
2. **Check**: `secureStorageService.test.ts` - Examples and patterns
3. **Review**: `PHASE_22_14_SECURITY_HARDENING_SUMMARY.md` - Technical details

## Summary

| Aspect | Change | Impact |
|--------|--------|--------|
| **Initialization** | Now async | Must call `await initialize()` |
| **setItem()** | Now async | Must use `await` |
| **clear()** | Now async | Must use `await` |
| **getItem()** | Still sync | No changes needed |
| **removeItem()** | Still sync | No changes needed |
| **Security** | Greatly improved | Master key now encrypted |
| **Performance** | 100ms startup cost | Worth the security improvement |
| **Compatibility** | Breaking changes | Requires code updates |

**Status**: ✅ Ready for developer adoption
