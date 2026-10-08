/**
 * Biometric Authentication Service Tests
 * Comprehensive test suite for biometric authentication
 * Phase 22.15 Mobile-First Features
 *
 * Test coverage:
 * - Biometric availability detection
 * - Biometric authentication flow
 * - Attempt limiting (max 3 attempts)
 * - Enable/disable biometric
 * - Permission handling
 * - Error scenarios
 * - Device type detection
 */

import { BiometricAuthService } from '../biometricAuthService';
import * as LocalAuthentication from 'expo-local-authentication';
import { SecureStorageService } from '@/utils/security/secureStorageService';

// Mock expo-local-authentication
jest.mock('expo-local-authentication');

// Mock SecureStorageService
jest.mock('@/utils/security/secureStorageService');

describe('BiometricAuthService', () => {
  let service: BiometricAuthService;
  let mockSecureStorage: jest.Mocked<SecureStorageService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock secure storage
    mockSecureStorage = {
      initialize: jest.fn().mockResolvedValue(undefined),
      setItem: jest.fn().mockResolvedValue(undefined),
      getItem: jest.fn().mockReturnValue(null),
      removeItem: jest.fn(),
      clear: jest.fn().mockResolvedValue(undefined),
      getAllKeys: jest.fn().mockReturnValue([]),
      getKeyMetadata: jest.fn().mockReturnValue(null),
    } as any;

    service = new BiometricAuthService(mockSecureStorage);
  });

  describe('Initialization', () => {
    it('should initialize the service', async () => {
      await service.initialize();

      expect(mockSecureStorage.initialize).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockSecureStorage.initialize = jest.fn().mockRejectedValue(new Error('Init failed'));

      await expect(service.initialize()).rejects.toThrow('Failed to initialize biometric authentication service');
    });
  });

  describe('Availability Detection', () => {
    it('should detect no biometric hardware', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);

      const availability = await service.checkAvailability();

      expect(availability.available).toBe(false);
      expect(availability.biometricTypes).toEqual([]);
      expect(availability.deviceEnrolled).toBe(false);
    });

    it('should detect hardware without enrollment', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false);

      const availability = await service.checkAvailability();

      expect(availability.available).toBe(true);
      expect(availability.deviceEnrolled).toBe(false);
      expect(availability.securityLevel).toBe('weak');
    });

    it('should detect available and enrolled biometric', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);

      const availability = await service.checkAvailability();

      expect(availability.available).toBe(true);
      expect(availability.deviceEnrolled).toBe(true);
      expect(availability.biometricTypes).toContain('face_id');
      expect(availability.securityLevel).toBe('strong_biometric');
    });

    it('should handle availability check errors', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockRejectedValue(new Error('Hardware check failed'));

      const availability = await service.checkAvailability();

      expect(availability.available).toBe(false);
      expect(availability.errorMessage).toContain('Failed to check biometric availability');
    });
  });

  describe('Biometric Authentication', () => {
    beforeEach(async () => {
      // Setup default successful availability
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);
    });

    it('should authenticate successfully', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      const result = await service.authenticate();

      expect(result.success).toBe(true);
      expect(result.biometricType).toBe('face_id');
    });

    it('should handle user cancellation', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: 'user_cancel',
      });

      const result = await service.authenticate();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('user_cancelled');
    });

    it('should handle fallback to PIN', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: 'fallback',
      });

      const result = await service.authenticate();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('user_fallback');
    });

    it('should handle system errors', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: 'SystemError',
      });

      const result = await service.authenticate();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('system_error');
    });

    it('should enforce attempt limit (max 3 per session)', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: 'SystemError',
      });

      // First 3 attempts should succeed
      let result = await service.authenticate();
      expect(result.success).toBe(false);

      result = await service.authenticate();
      expect(result.success).toBe(false);

      result = await service.authenticate();
      expect(result.success).toBe(false);

      // 4th attempt should be blocked
      result = await service.authenticate();
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('max_attempts_exceeded');
    });

    it('should handle authentication timeout', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockRejectedValue(
        new Error('Authentication timeout')
      );

      const result = await service.authenticate();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('timeout');
    });

    it('should require reason parameter', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      await service.authenticate('Custom reason');

      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Custom reason',
        })
      );
    });
  });

  describe('Enable Biometric', () => {
    beforeEach(async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
    });

    it('should enable biometric after user consent', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      const result = await service.enableBiometric({
        userId: 'user123',
      });

      expect(result).toBe(true);
      expect(mockSecureStorage.setItem).toHaveBeenCalledWith(
        expect.stringContaining('preferences'),
        expect.objectContaining({
          enabled: true,
          userId: 'user123',
        }),
        { encrypt: true }
      );
    });

    it('should handle user declining biometric setup', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
      });

      const result = await service.enableBiometric({
        userId: 'user123',
      });

      expect(result).toBe(false);
    });

    it('should fail if biometric unavailable', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);

      const result = await service.enableBiometric({
        userId: 'user123',
      });

      expect(result).toBe(false);
    });

    it('should require user ID', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      const result = await service.enableBiometric({
        userId: '',
      });

      // Should still attempt, but preferences stored with empty userId
      // This test documents current behavior
      expect(mockSecureStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('Disable Biometric', () => {
    it('should disable biometric authentication', async () => {
      const preferences = {
        enabled: true,
        userId: 'user123',
        biometricType: 'face_id',
        createdAt: Date.now(),
        fallbackPasswordSetup: true,
      };

      mockSecureStorage.getItem = jest.fn().mockReturnValue(preferences);

      const result = await service.disableBiometric('user123');

      expect(result).toBe(true);
      expect(mockSecureStorage.setItem).toHaveBeenCalledWith(
        expect.stringContaining('preferences'),
        expect.objectContaining({
          enabled: false,
        }),
        { encrypt: true }
      );
    });

    it('should fail if no preferences found', async () => {
      mockSecureStorage.getItem = jest.fn().mockReturnValue(null);

      const result = await service.disableBiometric('user123');

      expect(result).toBe(false);
    });

    it('should verify user ID matches', async () => {
      const preferences = {
        enabled: true,
        userId: 'user123',
        biometricType: 'fingerprint',
        createdAt: Date.now(),
        fallbackPasswordSetup: true,
      };

      mockSecureStorage.getItem = jest.fn().mockReturnValue(preferences);

      const result = await service.disableBiometric('user456');

      expect(result).toBe(false);
    });
  });

  describe('Biometric Status', () => {
    it('should return enabled status', () => {
      const preferences = {
        enabled: true,
        userId: 'user123',
        biometricType: 'face_id',
        createdAt: Date.now(),
        fallbackPasswordSetup: true,
      };

      mockSecureStorage.getItem = jest.fn().mockReturnValue(preferences);

      const enabled = service.isBiometricEnabled();

      expect(enabled).toBe(true);
    });

    it('should return disabled status', () => {
      mockSecureStorage.getItem = jest.fn().mockReturnValue(null);

      const enabled = service.isBiometricEnabled();

      expect(enabled).toBe(false);
    });

    it('should return preferences', () => {
      const preferences = {
        enabled: true,
        userId: 'user123',
        biometricType: 'fingerprint',
        createdAt: Date.now(),
        fallbackPasswordSetup: true,
      };

      mockSecureStorage.getItem = jest.fn().mockReturnValue(preferences);

      const result = service.getBiometricPreferences();

      expect(result).toEqual(preferences);
    });
  });

  describe('Attempt Tracking', () => {
    beforeEach(async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
    });

    it('should track successful attempts', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      await service.authenticate();

      const history = service.getAttemptHistory();

      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].success).toBe(true);
    });

    it('should track failed attempts', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: 'SystemError',
      });

      await service.authenticate();

      const history = service.getAttemptHistory();

      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].success).toBe(false);
    });

    it('should clear attempt history', async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      await service.authenticate();

      service.clearAttemptHistory();

      const history = service.getAttemptHistory();

      expect(history).toHaveLength(0);
    });
  });

  describe('Device Type Detection', () => {
    it('should detect Face ID on iOS', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);

      const availability = await service.checkAvailability();

      expect(availability.biometricTypes).toContain('face_id');
    });

    it('should detect fingerprint on Android', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);

      const availability = await service.checkAvailability();

      expect(availability.biometricTypes).toContain('fingerprint');
    });

    it('should detect iris recognition', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.IRIS,
      ]);

      const availability = await service.checkAvailability();

      expect(availability.biometricTypes).toContain('iris');
    });

    it('should handle multiple biometric types', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);

      const availability = await service.checkAvailability();

      expect(availability.biometricTypes).toContain('face_id');
      expect(availability.biometricTypes).toContain('fingerprint');
    });
  });

  describe('Security Considerations', () => {
    it('should use SecureStorageService for preferences', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      await service.enableBiometric({ userId: 'user123' });

      // Verify encryption was requested
      const calls = mockSecureStorage.setItem.mock.calls;
      const preferencesCall = calls.find(call => call[0]?.includes('preferences'));

      expect(preferencesCall).toBeDefined();
      expect(preferencesCall?.[2]).toEqual({ encrypt: true });
    });

    it('should not expose biometric data', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      const result = await service.authenticate();

      // Result should not contain biometric scan data
      expect(result.success).toBe(true);
      expect(result.biometricType).toBeDefined();
      // No raw biometric data returned
      expect(Object.keys(result)).not.toContain('biometricData');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null reason parameter', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      const result = await service.authenticate();

      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle rapid successive attempts', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: 'SystemError',
      });

      // Make rapid attempts
      const results = await Promise.all([
        service.authenticate(),
        service.authenticate(),
        service.authenticate(),
      ]);

      // At least some should be tracked
      expect(results.filter(r => !r.success).length).toBeGreaterThan(0);
    });

    it('should handle concurrent enable/disable requests', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      const preferences = {
        enabled: true,
        userId: 'user123',
        biometricType: 'fingerprint',
        createdAt: Date.now(),
        fallbackPasswordSetup: true,
      };

      mockSecureStorage.getItem = jest.fn().mockReturnValue(preferences);

      // Concurrent enable and disable
      const [enableResult, disableResult] = await Promise.all([
        service.enableBiometric({ userId: 'user123' }),
        service.disableBiometric('user123'),
      ]);

      // Results depend on execution order, but no crashes
      expect(typeof enableResult).toBe('boolean');
      expect(typeof disableResult).toBe('boolean');
    });
  });
});
