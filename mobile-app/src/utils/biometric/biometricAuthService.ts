/**
 * Biometric Authentication Service
 * Handles Face ID, Touch ID, and fingerprint authentication
 * Phase 22.15 Mobile-First Features
 *
 * Security considerations:
 * - Uses device OS-level biometric verification (no biometric data stored locally)
 * - Biometric success unlocks TokenManager, same as password
 * - Failed attempts tracked and limited (max 3 per session)
 * - Biometric preferences stored securely via SecureStorageService
 * - Never transmit biometric data to server
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { SecureStorageService } from '@/utils/security/secureStorageService';
import {
  BiometricType,
  BiometricAuthResult,
  BiometricAvailability,
  BiometricPreferences,
  BiometricVerificationResult,
  BiometricEvent,
  BiometricErrorType,
  BiometricSetupOptions,
  BiometricPermissionRequest,
} from './biometricTypes';

interface BiometricAttempt {
  timestamp: number;
  success: boolean;
  type: BiometricType;
  reason?: string;
}

export class BiometricAuthService {
  private static readonly STORAGE_KEYS = {
    PREFERENCES: 'biometric_preferences_v1',
    ENROLLMENT_DATA: 'biometric_enrollment_v1',
    ATTEMPT_LOG: 'biometric_attempt_log_v1',
  };

  private static readonly CONFIG = {
    MAX_ATTEMPTS_PER_SESSION: 3,
    ATTEMPT_TIMEOUT_MS: 60000, // 1 minute to reset attempt count
    BIOMETRIC_PROMPT_TIMEOUT_MS: 30000, // 30 seconds for user response
  };

  private secureStorage: SecureStorageService;
  private attemptHistory: BiometricAttempt[] = [];
  private lastAttemptTime: number = 0;

  constructor(secureStorage?: SecureStorageService) {
    this.secureStorage = secureStorage || new SecureStorageService();
  }

  /**
   * Initialize biometric service (must be called before use)
   */
  async initialize(): Promise<void> {
    try {
      await this.secureStorage.initialize();
      this.loadAttemptHistory();
      console.log('[BiometricAuth] Service initialized');
    } catch (error) {
      console.error('[BiometricAuth] Initialization failed:', error);
      throw new Error('Failed to initialize biometric authentication service');
    }
  }

  /**
   * Check biometric availability on device
   */
  async checkAvailability(): Promise<BiometricAvailability> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();

      if (!compatible) {
        console.log('[BiometricAuth] No biometric hardware available');
        return {
          available: false,
          biometricTypes: [],
          deviceEnrolled: false,
          securityLevel: 'none',
          supportsFallback: true,
          errorMessage: 'Device does not have biometric hardware',
        };
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (!enrolled) {
        console.log('[BiometricAuth] Biometric hardware available but not enrolled');
        return {
          available: true,
          biometricTypes: this.getAvailableBiometricTypes(),
          deviceEnrolled: false,
          securityLevel: 'weak',
          supportsFallback: true,
          errorMessage: 'Device has no biometric enrollment',
        };
      }

      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const biometricTypes = this.mapSupportedTypes(supportedTypes);

      const securityLevel = this.determineSecurityLevel(supportedTypes);

      console.log('[BiometricAuth] Biometric availability check complete', {
        available: true,
        types: biometricTypes,
        enrolled: true,
        securityLevel,
      });

      return {
        available: true,
        biometricTypes,
        deviceEnrolled: true,
        securityLevel,
        supportsFallback: true,
      };
    } catch (error) {
      console.error('[BiometricAuth] Failed to check availability:', error);
      return {
        available: false,
        biometricTypes: [],
        deviceEnrolled: false,
        securityLevel: 'none',
        supportsFallback: true,
        errorMessage: `Failed to check biometric availability: ${String(error)}`,
      };
    }
  }

  /**
   * Authenticate user using biometric
   * Respects the 3 attempt limit with timeout
   */
  async authenticate(
    reason: string = 'Authenticate to access your account'
  ): Promise<BiometricAuthResult> {
    try {
      // Check attempt limits
      const attemptCheckResult = this.checkAttemptLimit();
      if (!attemptCheckResult.allowed) {
        const error = {
          code: BiometricErrorType.MAX_ATTEMPTS_EXCEEDED,
          message: `Maximum attempts exceeded. Please try again in ${attemptCheckResult.minutesRemaining} minutes.`,
        };
        this.recordAttempt(false, BiometricType.UNKNOWN, attemptCheckResult);
        return { success: false, error };
      }

      const availability = await this.checkAvailability();

      if (!availability.available || !availability.deviceEnrolled) {
        const error = {
          code: BiometricErrorType.NOT_ENROLLED,
          message: 'Biometric authentication is not available on this device',
        };
        return { success: false, error };
      }

      const biometricType = availability.biometricTypes[0] || BiometricType.UNKNOWN;

      try {
        const authResult = await LocalAuthentication.authenticateAsync({
          disableDeviceFallback: false, // Allow fallback to PIN
          reason,
          fallbackLabel: 'Use PIN',
          requireConfirmation: true,
        });

        if (authResult.success) {
          this.recordAttempt(true, biometricType);

          await this.recordBiometricEvent({
            type: 'success',
            biometricType,
            timestamp: Date.now(),
            attemptCount: this.attemptHistory.filter(a => !a.success).length + 1,
          });

          console.log('[BiometricAuth] Biometric authentication successful');
          return {
            success: true,
            biometricType,
            attemptCount: this.attemptHistory.filter(a => a.success).length,
          };
        } else if (authResult.error === 'app_cancel' || authResult.error === 'user_cancel') {
          const error = {
            code: BiometricErrorType.USER_CANCELLED,
            message: 'Biometric authentication was cancelled',
          };
          this.recordAttempt(false, biometricType, { reason: 'user_cancelled' });
          return { success: false, error };
        } else if (authResult.error === 'fallback') {
          const error = {
            code: BiometricErrorType.USER_FALLBACK,
            message: 'User chose to use PIN instead of biometric',
          };
          this.recordAttempt(false, biometricType, { reason: 'fallback_requested' });
          return { success: false, error };
        } else {
          const error = {
            code: BiometricErrorType.SYSTEM_ERROR,
            message: `Biometric authentication failed: ${authResult.error || 'Unknown error'}`,
          };
          this.recordAttempt(false, biometricType, { reason: authResult.error });
          return { success: false, error };
        }
      } catch (authError) {
        const errorMessage = String(authError);

        let errorType = BiometricErrorType.SYSTEM_ERROR;
        if (errorMessage.includes('timeout')) {
          errorType = BiometricErrorType.TIMEOUT;
        } else if (errorMessage.includes('not_enrolled')) {
          errorType = BiometricErrorType.NOT_ENROLLED;
        }

        const error = {
          code: errorType,
          message: `Biometric authentication error: ${errorMessage}`,
        };

        this.recordAttempt(false, biometricType, { reason: errorMessage });
        console.error('[BiometricAuth] Authentication error:', authError);
        return { success: false, error };
      }
    } catch (error) {
      console.error('[BiometricAuth] Unexpected error during authentication:', error);
      return {
        success: false,
        error: {
          code: BiometricErrorType.SYSTEM_ERROR,
          message: `Unexpected error: ${String(error)}`,
        },
      };
    }
  }

  /**
   * Enable biometric authentication for user
   */
  async enableBiometric(options: BiometricSetupOptions): Promise<boolean> {
    try {
      const availability = await this.checkAvailability();

      if (!availability.available || !availability.deviceEnrolled) {
        throw new Error('Biometric authentication is not available on this device');
      }

      // Request user consent with native biometric prompt
      const consentResult = await LocalAuthentication.authenticateAsync({
        disableDeviceFallback: false,
        reason: options.reason || 'Enable biometric authentication for secure access',
        fallbackLabel: 'Use PIN',
        requireConfirmation: true,
      });

      if (!consentResult.success) {
        console.log('[BiometricAuth] User declined biometric setup');
        return false;
      }

      const biometricType = availability.biometricTypes[0] || BiometricType.UNKNOWN;

      const preferences: BiometricPreferences = {
        enabled: true,
        biometricType,
        userId: options.userId,
        createdAt: Date.now(),
        enabledAt: Date.now(),
        fallbackPasswordSetup: true,
      };

      await this.secureStorage.setItem(
        BiometricAuthService.STORAGE_KEYS.PREFERENCES,
        preferences,
        { encrypt: true }
      );

      // Store enrollment data
      const enrollmentData = {
        timestamp: Date.now(),
        biometricType,
        deviceInfo: await this.getDeviceInfo(),
      };

      await this.secureStorage.setItem(
        BiometricAuthService.STORAGE_KEYS.ENROLLMENT_DATA,
        enrollmentData,
        { encrypt: true }
      );

      await this.recordBiometricEvent({
        type: 'success',
        biometricType,
        timestamp: Date.now(),
        reason: 'enabled',
      });

      console.log('[BiometricAuth] Biometric authentication enabled successfully');
      return true;
    } catch (error) {
      console.error('[BiometricAuth] Failed to enable biometric:', error);

      await this.recordBiometricEvent({
        type: 'error',
        biometricType: BiometricType.UNKNOWN,
        timestamp: Date.now(),
        reason: String(error),
      });

      return false;
    }
  }

  /**
   * Disable biometric authentication
   */
  async disableBiometric(userId: string): Promise<boolean> {
    try {
      const preferences = this.getBiometricPreferences();

      if (!preferences || preferences.userId !== userId) {
        throw new Error('No biometric preferences found for user');
      }

      const updatedPreferences: BiometricPreferences = {
        ...preferences,
        enabled: false,
        disabledAt: Date.now(),
      };

      await this.secureStorage.setItem(
        BiometricAuthService.STORAGE_KEYS.PREFERENCES,
        updatedPreferences,
        { encrypt: true }
      );

      await this.recordBiometricEvent({
        type: 'success',
        biometricType: preferences.biometricType || BiometricType.UNKNOWN,
        timestamp: Date.now(),
        reason: 'disabled',
      });

      console.log('[BiometricAuth] Biometric authentication disabled');
      return true;
    } catch (error) {
      console.error('[BiometricAuth] Failed to disable biometric:', error);
      return false;
    }
  }

  /**
   * Get biometric preferences for user
   */
  getBiometricPreferences(): BiometricPreferences | null {
    try {
      return this.secureStorage.getItem<BiometricPreferences>(
        BiometricAuthService.STORAGE_KEYS.PREFERENCES
      );
    } catch (error) {
      console.error('[BiometricAuth] Failed to retrieve preferences:', error);
      return null;
    }
  }

  /**
   * Check if biometric is enabled
   */
  isBiometricEnabled(): boolean {
    const preferences = this.getBiometricPreferences();
    return preferences?.enabled ?? false;
  }

  /**
   * Check if biometric is available and enrolled
   */
  async isBiometricAvailable(): Promise<boolean> {
    const availability = await this.checkAvailability();
    return availability.available && availability.deviceEnrolled;
  }

  /**
   * Get attempt history for audit logging
   */
  getAttemptHistory(): BiometricAttempt[] {
    return [...this.attemptHistory];
  }

  /**
   * Clear attempt history
   */
  clearAttemptHistory(): void {
    this.attemptHistory = [];
    this.saveattemptHistory();
    console.log('[BiometricAuth] Attempt history cleared');
  }

  /**
   * Get device biometric types mapping
   */
  private getAvailableBiometricTypes(): BiometricType[] {
    if (Platform.OS === 'ios') {
      return [BiometricType.FACE_ID, BiometricType.TOUCH_ID];
    } else if (Platform.OS === 'android') {
      return [BiometricType.FINGERPRINT, BiometricType.IRIS];
    }
    return [BiometricType.UNKNOWN];
  }

  /**
   * Map expo-local-authentication types to our types
   */
  private mapSupportedTypes(supportedTypes: LocalAuthentication.AuthenticationType[]): BiometricType[] {
    return supportedTypes
      .map(type => {
        switch (type) {
          case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
            return BiometricType.FACE_ID;
          case LocalAuthentication.AuthenticationType.FINGERPRINT:
            return BiometricType.FINGERPRINT;
          case LocalAuthentication.AuthenticationType.IRIS:
            return BiometricType.IRIS;
          default:
            return null;
        }
      })
      .filter((type): type is BiometricType => type !== null);
  }

  /**
   * Determine security level based on authentication types
   */
  private determineSecurityLevel(
    supportedTypes: LocalAuthentication.AuthenticationType[]
  ): 'none' | 'weak' | 'strong' | 'strong_biometric' {
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'strong_biometric';
    }
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'strong_biometric';
    }
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'strong_biometric';
    }
    return 'strong';
  }

  /**
   * Check attempt limit and track attempt windows
   */
  private checkAttemptLimit(): {
    allowed: boolean;
    minutesRemaining?: number;
  } {
    const now = Date.now();

    // Reset old attempts outside the timeout window
    this.attemptHistory = this.attemptHistory.filter(
      a => now - a.timestamp < BiometricAuthService.CONFIG.ATTEMPT_TIMEOUT_MS
    );

    const failedAttempts = this.attemptHistory.filter(a => !a.success).length;

    if (failedAttempts >= BiometricAuthService.CONFIG.MAX_ATTEMPTS_PER_SESSION) {
      if (this.lastAttemptTime) {
        const minutesRemaining = Math.ceil(
          (BiometricAuthService.CONFIG.ATTEMPT_TIMEOUT_MS -
            (now - this.lastAttemptTime)) /
            60000
        );
        return {
          allowed: false,
          minutesRemaining: Math.max(1, minutesRemaining),
        };
      }
      return { allowed: false };
    }

    return { allowed: true };
  }

  /**
   * Record a biometric attempt
   */
  private recordAttempt(
    success: boolean,
    type: BiometricType,
    details?: { reason?: string }
  ): void {
    const attempt: BiometricAttempt = {
      timestamp: Date.now(),
      success,
      type,
      reason: details?.reason,
    };

    this.attemptHistory.push(attempt);
    this.lastAttemptTime = Date.now();
    this.saveattemptHistory();

    console.log('[BiometricAuth] Attempt recorded', {
      success,
      totalAttempts: this.attemptHistory.length,
      failedAttempts: this.attemptHistory.filter(a => !a.success).length,
    });
  }

  /**
   * Save attempt history to storage
   */
  private saveattemptHistory(): void {
    try {
      this.secureStorage.setItem(
        BiometricAuthService.STORAGE_KEYS.ATTEMPT_LOG,
        this.attemptHistory,
        { encrypt: true }
      );
    } catch (error) {
      console.error('[BiometricAuth] Failed to save attempt history:', error);
    }
  }

  /**
   * Load attempt history from storage
   */
  private loadAttemptHistory(): void {
    try {
      const history = this.secureStorage.getItem<BiometricAttempt[]>(
        BiometricAuthService.STORAGE_KEYS.ATTEMPT_LOG
      );
      if (history) {
        this.attemptHistory = history;
        // Reset old attempts on load
        const now = Date.now();
        this.attemptHistory = this.attemptHistory.filter(
          a => now - a.timestamp < BiometricAuthService.CONFIG.ATTEMPT_TIMEOUT_MS
        );
      }
    } catch (error) {
      console.error('[BiometricAuth] Failed to load attempt history:', error);
    }
  }

  /**
   * Record biometric event for analytics
   */
  private async recordBiometricEvent(event: BiometricEvent): Promise<void> {
    try {
      // Log locally for security audit
      console.log('[BiometricAuth] Event recorded:', {
        type: event.type,
        biometricType: event.biometricType,
        timestamp: new Date(event.timestamp).toISOString(),
        reason: event.reason,
      });

      // TODO: Send to analytics service in Phase 22.13
      // This will integrate with the existing analytics system
    } catch (error) {
      console.error('[BiometricAuth] Failed to record event:', error);
    }
  }

  /**
   * Get device information for enrollment data
   */
  private async getDeviceInfo(): Promise<Record<string, unknown>> {
    return {
      platform: Platform.OS,
      osVersion: Platform.Version,
      timestamp: Date.now(),
    };
  }
}
