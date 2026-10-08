# Biometric Authentication Integration Guide

**Phase:** 22.15 Mobile-First Features  
**Document:** Integration Patterns and Examples  
**Date:** 2026-10-08

## Quick Start

### 1. Add BiometricSetupScreen to Navigation

```typescript
// mobile-app/src/navigation/AuthStackNavigator.tsx
import { BiometricSetupScreen } from '@/screens/auth/BiometricSetupScreen';

export const AuthStackNavigator = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen 
        name="BiometricSetup" 
        component={BiometricSetupScreen}
        options={{ title: 'Biometric Security' }}
      />
    </Stack.Navigator>
  );
};
```

### 2. Add BiometricSetupScreen Route to Navigation Types

```typescript
// mobile-app/src/types/navigation.ts
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  BiometricSetup: undefined;
};
```

### 3. Add Link to BiometricSetupScreen from Settings

```typescript
// mobile-app/src/screens/settings/SettingsScreen.tsx
import { useBiometric } from '@/hooks';

export const SettingsScreen: React.FC = ({ navigation }) => {
  const { isAvailable } = useBiometric();

  return (
    <ScrollView>
      {/* ... existing settings ... */}
      
      {isAvailable && (
        <ListItem
          title="Biometric Security"
          description="Manage Face ID, Touch ID, and fingerprint"
          onPress={() => navigation.navigate('BiometricSetup')}
          rightIcon={{ name: 'chevron-right' }}
        />
      )}
    </ScrollView>
  );
};
```

## Integration Patterns

### Pattern 1: Optional Biometric at Login

Add biometric authentication option after password verification:

```typescript
// mobile-app/src/screens/auth/LoginScreen.tsx
import { useBiometric } from '@/hooks';
import { useAuth } from '@/hooks';

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { login, checkBiometricAvailability } = useAuth();
  const { authenticate, isEnabled } = useBiometric();
  const [showBiometricOption, setShowBiometricOption] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    // Check if biometric login is available
    const checkBiometric = async () => {
      const availability = await checkBiometricAvailability?.();
      setBiometricAvailable(availability?.available && availability?.deviceEnrolled);
    };
    checkBiometric();
  }, []);

  const handlePasswordLogin = async () => {
    try {
      await login({ email, password });
      // If biometric is enabled, suggest using it next time
      if (isEnabled && biometricAvailable) {
        setShowBiometricOption(true);
      }
    } catch (error) {
      setError(String(error));
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const result = await authenticate('Unlock your account');
      if (result.success) {
        // Biometric verified, tokens already loaded from storage
        // User should be authenticated if valid tokens exist
        console.log('Biometric verified successfully');
      } else {
        setError(result.error?.message || 'Biometric authentication failed');
      }
    } catch (error) {
      setError(String(error));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="headlineLarge">Login</Text>

        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
        />

        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
        />

        <Button
          mode="contained"
          onPress={handlePasswordLogin}
          loading={loading}
        >
          Login with Password
        </Button>

        {/* Biometric option after password login */}
        {showBiometricOption && biometricAvailable && (
          <Card style={styles.biometricCard}>
            <Card.Content>
              <Text variant="titleMedium">Use Biometric?</Text>
              <Text variant="bodySmall">
                Next time, use Face ID/fingerprint for quicker login
              </Text>

              <Button
                mode="outlined"
                onPress={handleBiometricLogin}
                icon="fingerprint"
              >
                Try Biometric Now
              </Button>
            </Card.Content>
          </Card>
        )}

        <Button
          mode="text"
          onPress={() => navigation.navigate('Register')}
        >
          Don't have an account? Register
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
```

### Pattern 2: Biometric as Primary Auth (If Enabled)

Check for enabled biometric at app startup and offer it first:

```typescript
// mobile-app/src/screens/auth/BiometricLoginScreen.tsx
import { useBiometric } from '@/hooks';
import { useAuth } from '@/hooks';

export const BiometricLoginScreen: React.FC = ({ navigation }) => {
  const { loginWithBiometric } = useAuth();
  const { authenticate, isEnabled, isAvailable } = useBiometric();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Auto-prompt for biometric if enabled and available
    if (isEnabled && isAvailable) {
      promptBiometric();
    }
  }, [isEnabled, isAvailable]);

  const promptBiometric = async () => {
    setIsAuthenticating(true);
    setError(null);

    try {
      const result = await authenticate('Unlock your account');

      if (result.success) {
        // Biometric successful, load tokens and proceed
        // Navigation handled by auth context
        console.log('Biometric authentication successful');
      } else {
        setError(result.error?.message || 'Authentication failed');
      }
    } catch (error) {
      setError(String(error));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleFallbackToPassword = () => {
    navigation.navigate('Login');
  };

  if (!isEnabled || !isAvailable) {
    return <LoginScreen navigation={navigation} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text variant="headlineLarge" style={styles.title}>
          Welcome Back
        </Text>

        <View style={styles.biometricIcon}>
          <MaterialCommunityIcons
            name="fingerprint"
            size={80}
            color="#1976d2"
          />
        </View>

        <Text variant="bodyMedium" style={styles.instruction}>
          Place your finger on the sensor
        </Text>

        {error && (
          <Card style={styles.errorCard}>
            <Card.Content>
              <Text style={styles.errorText}>{error}</Text>
            </Card.Content>
          </Card>
        )}

        <Button
          mode="contained"
          onPress={promptBiometric}
          loading={isAuthenticating}
          disabled={isAuthenticating}
          icon={isAuthenticating ? undefined : 'fingerprint'}
        >
          {isAuthenticating ? 'Authenticating...' : 'Authenticate'}
        </Button>

        <Button
          mode="text"
          onPress={handleFallbackToPassword}
          disabled={isAuthenticating}
        >
          Use Password Instead
        </Button>
      </View>
    </View>
  );
};
```

### Pattern 3: Sensitive Operations Requiring Biometric Verification

Re-verify with biometric before sensitive operations:

```typescript
// mobile-app/src/components/BiometricVerification.tsx
import { useBiometric } from '@/hooks';

interface BiometricVerificationProps {
  onVerified: () => void;
  onFailed?: () => void;
  operation: string; // e.g., "delete account", "change password"
}

export const BiometricVerification: React.FC<BiometricVerificationProps> = ({
  onVerified,
  onFailed,
  operation,
}) => {
  const { authenticate, isEnabled } = useBiometric();
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const handleVerify = async () => {
    if (!isEnabled) {
      onVerified();
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const result = await authenticate(
        `Verify your identity to ${operation}`
      );

      if (result.success) {
        setIsVerified(true);
        onVerified();
      } else {
        setError(result.error?.message || 'Verification failed');
        onFailed?.();
      }
    } catch (err) {
      setError(String(err));
      onFailed?.();
    } finally {
      setIsVerifying(false);
    }
  };

  if (isVerified) {
    return null;
  }

  return (
    <Dialog
      visible={!isVerified}
      onDismiss={() => {
        setError(null);
        onFailed?.();
      }}
    >
      <Dialog.Title>Verify Identity</Dialog.Title>

      <Dialog.Content>
        <Text variant="bodyMedium">
          For security, please verify your identity to {operation}
        </Text>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </Dialog.Content>

      <Dialog.Actions>
        <Button onPress={() => onFailed?.()}>Cancel</Button>
        <Button
          onPress={handleVerify}
          loading={isVerifying}
          disabled={isVerifying}
        >
          Verify
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
};

// Usage:
export const DeleteAccountScreen = () => {
  const [showVerification, setShowVerification] = useState(false);

  const handleDeleteAccount = () => {
    setShowVerification(true);
  };

  const handleVerified = async () => {
    // User verified with biometric, proceed with deletion
    await deleteAccount();
  };

  return (
    <View>
      {/* ... existing UI ... */}

      <Button
        mode="contained"
        color="red"
        onPress={handleDeleteAccount}
      >
        Delete Account
      </Button>

      <BiometricVerification
        visible={showVerification}
        operation="delete your account"
        onVerified={handleVerified}
        onFailed={() => setShowVerification(false)}
      />
    </View>
  );
};
```

### Pattern 4: Settings Integration

Show biometric settings in security/privacy section:

```typescript
// mobile-app/src/screens/settings/SecuritySettingsScreen.tsx
import { useBiometric } from '@/hooks';

export const SecuritySettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { isEnabled, isAvailable, enable, disable, isBiometricLoading } = useBiometric();
  const [confirmDisable, setConfirmDisable] = useState(false);

  const handleToggleBiometric = async () => {
    if (isEnabled) {
      setConfirmDisable(true);
    } else {
      await enable();
    }
  };

  const handleConfirmDisable = async () => {
    await disable();
    setConfirmDisable(false);
  };

  return (
    <ScrollView>
      <Section title="Biometric Authentication">
        {isAvailable ? (
          <>
            <SettingItem
              title="Biometric Authentication"
              description={
                isEnabled
                  ? 'Enabled - Use biometric to unlock your account'
                  : 'Disabled - Use password to login'
              }
              right={
                <Switch
                  value={isEnabled}
                  onValueChange={handleToggleBiometric}
                  disabled={isBiometricLoading}
                />
              }
            />

            {isEnabled && (
              <>
                <SettingItem
                  title="Test Biometric"
                  description="Verify biometric authentication is working"
                  onPress={() => navigation.navigate('BiometricSetup')}
                />

                <SettingItem
                  title="Security Information"
                  description="Learn how biometric keeps your account secure"
                  onPress={() => setShowSecurityInfo(true)}
                />
              </>
            )}
          </>
        ) : (
          <SettingItem
            title="Biometric Not Available"
            description="Your device does not support biometric authentication"
            disabled
          />
        )}
      </Section>

      {/* Confirmation dialog for disabling */}
      <Dialog visible={confirmDisable} onDismiss={() => setConfirmDisable(false)}>
        <Dialog.Title>Disable Biometric?</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            You will need to use your password to login. You can re-enable this anytime.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setConfirmDisable(false)}>Cancel</Button>
          <Button
            onPress={handleConfirmDisable}
            color="red"
            loading={isBiometricLoading}
          >
            Disable
          </Button>
        </Dialog.Actions>
      </Dialog>
    </ScrollView>
  );
};
```

## Common Implementation Scenarios

### Scenario 1: First-Time User Setup

```
1. User completes password registration
2. App suggests setting up biometric (optional)
3. If accepted, show BiometricSetupScreen
4. User authenticates once with biometric
5. Preferences saved
6. Biometric available for next login
```

### Scenario 2: Returning User with Biometric Enabled

```
1. User opens app
2. Check if biometric is enabled
3. If yes, show biometric login option
4. User authenticates with biometric
5. Tokens loaded, user logged in
6. No password entry needed
```

### Scenario 3: Biometric Setup After Password Login

```
1. User logs in with password normally
2. App shows "Setup Biometric?" prompt
3. User navigates to BiometricSetupScreen
4. User authenticates with biometric
5. Preferences saved
6. Next login can use biometric
```

### Scenario 4: Account Security Review

```
1. User goes to Settings
2. Navigates to Security Settings
3. Sees biometric status
4. Can enable/disable biometric
5. Can test biometric
6. Sees security information
```

## State Management

### Auth Context Integration

The auth context manages biometric state alongside regular auth:

```typescript
const { 
  user,                              // Current user
  status,                            // 'authenticated', 'unauthenticated', etc.
  loginWithBiometric,                // Biometric login method
  enableBiometric,                   // Enable biometric for user
  disableBiometric,                  // Disable biometric
  checkBiometricAvailability,        // Check device capabilities
} = useAuth();
```

### Hook State Management

The useBiometric hook manages biometric-specific state:

```typescript
const {
  isEnabled,                         // Is biometric enabled for this user?
  isAvailable,                       // Is device capable?
  biometricType,                     // Which type (Face ID, fingerprint, etc.)
  isBiometricLoading,               // Loading state
  availability,                      // Detailed availability info
  authenticate,                      // Run biometric auth
  enable,                            // Enable biometric
  disable,                           // Disable biometric
} = useBiometric();
```

## Error Handling

### Common Error Scenarios

```typescript
async function handleBiometricAuth() {
  try {
    const result = await authenticate('Verify identity');

    if (!result.success) {
      switch (result.error?.code) {
        case 'user_cancelled':
          // User cancelled prompt - let them try again or use password
          showMessage('Authentication cancelled');
          break;

        case 'user_fallback':
          // User chose password instead
          navigateTo('login');
          break;

        case 'max_attempts_exceeded':
          // 3 failed attempts - timeout
          showMessage('Too many attempts. Please try again later.');
          break;

        case 'not_enrolled':
          // Biometric available but not set up on device
          showMessage('Please enroll biometric in device settings');
          break;

        case 'timeout':
          // User took too long
          showMessage('Authentication timed out');
          break;

        case 'system_error':
        default:
          // Unexpected error - fallback to password
          showMessage('Authentication failed. Please use password.');
          navigateTo('login');
          break;
      }
    } else {
      // Success
      proceedWithLogin();
    }
  } catch (error) {
    // Unexpected error
    console.error('Biometric error:', error);
    showMessage('An unexpected error occurred');
  }
}
```

## Testing Scenarios

### Test Cases to Verify

1. **Device Without Biometric**
   - App doesn't crash
   - Biometric unavailable message shown
   - Password login still works

2. **Device With Enrolled Biometric**
   - Biometric detection works
   - Authentication succeeds on valid scan
   - Authentication fails on invalid scan

3. **Attempt Limiting**
   - 3 failed attempts trigger timeout
   - 4th attempt blocked
   - After 1 minute, can retry

4. **Enable/Disable Flow**
   - User can enable biometric
   - Preferences persisted
   - User can disable and re-enable
   - Data encrypted properly

5. **Cross-Device Testing**
   - Test on iOS device with Face ID
   - Test on iOS device with Touch ID
   - Test on Android with fingerprint
   - Test on Android without biometric

## Debugging Tips

### Enable Logging

```typescript
// In biometricAuthService.ts - logs are prefixed with [BiometricAuth]
// Check console for detailed diagnostic information

// Clear attempt history if testing:
biometricService.clearAttemptHistory();

// Check stored preferences:
const prefs = biometricService.getBiometricPreferences();
console.log('Biometric preferences:', prefs);

// Check attempt history:
const history = biometricService.getAttemptHistory();
console.log('Attempt history:', history);
```

### Verify Setup

```typescript
// Verify service initialized
const availability = await checkBiometricAvailability?.();
console.log('Biometric available:', availability);

// Verify preferences stored
const prefs = getBiometricPreferences();
console.log('Preferences:', prefs);

// Verify attempt tracking
const history = getAttemptHistory();
console.log('Attempts:', history);
```

## Performance Tips

1. **Don't re-initialize service**
   - Service singleton via hooks
   - Initialize once at app start

2. **Cache availability check**
   - Check once and cache result
   - Availability doesn't change during session

3. **Limit authentication prompts**
   - Don't show prompt on every screen
   - Use for primary auth, not every sub-operation

4. **Clean attempt history**
   - Attempts auto-expire after 1 minute
   - Don't manually clear unless testing

## Related Documentation

- [Biometric Authentication Overview](./BIOMETRIC_AUTHENTICATION.md)
- [API Reference](./BIOMETRIC_AUTHENTICATION.md#api-reference)
- [Security Considerations](./BIOMETRIC_AUTHENTICATION.md#security-considerations)
- [Testing Guide](./BIOMETRIC_AUTHENTICATION.md#testing)

---

**Version:** 1.0  
**Last Updated:** 2026-10-08  
**Status:** Ready for Implementation
