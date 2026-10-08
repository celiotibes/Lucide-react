/**
 * useBiometric Hook
 * React hook for biometric authentication
 * Phase 22.15 Mobile-First Features
 *
 * Usage:
 * const { isEnabled, isAvailable, authenticate, enable, disable } = useBiometric();
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { BiometricAuthService } from '@/utils/biometric/biometricAuthService';
import {
  BiometricAuthResult,
  BiometricAvailability,
  BiometricStatus,
  BiometricType,
} from '@/utils/biometric/biometricTypes';
import { useAuth } from './useAuth';

interface UseBiometricReturn {
  // Status
  isEnabled: boolean;
  isAvailable: boolean;
  isBiometricLoading: boolean;
  biometricType?: BiometricType;
  availability: BiometricAvailability | null;

  // Status getter
  getBiometricStatus: () => Promise<BiometricStatus>;

  // Actions
  authenticate: (reason?: string) => Promise<BiometricAuthResult>;
  enable: () => Promise<boolean>;
  disable: () => Promise<boolean>;

  // Utilities
  checkAvailability: () => Promise<BiometricAvailability>;
  getAttemptHistory: () => Array<{ timestamp: number; success: boolean }>;
  clearAttemptHistory: () => void;
}

export function useBiometric(): UseBiometricReturn {
  const { user } = useAuth();
  const serviceRef = useRef<BiometricAuthService | null>(null);

  const [isEnabled, setIsEnabled] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isBiometricLoading, setIsBiometricLoading] = useState(true);
  const [biometricType, setBiometricType] = useState<BiometricType>();
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);

  /**
   * Initialize biometric service
   */
  useEffect(() => {
    const initializeService = async () => {
      try {
        if (!serviceRef.current) {
          serviceRef.current = new BiometricAuthService();
          await serviceRef.current.initialize();
        }

        // Check availability
        const avail = await serviceRef.current.checkAvailability();
        setAvailability(avail);
        setIsAvailable(avail.available && avail.deviceEnrolled);

        // Check if enabled
        const enabled = serviceRef.current.isBiometricEnabled();
        setIsEnabled(enabled);

        if (enabled) {
          const prefs = serviceRef.current.getBiometricPreferences();
          if (prefs?.biometricType) {
            setBiometricType(prefs.biometricType);
          }
        }

        console.log('[useBiometric] Initialized', { isAvailable, isEnabled });
      } catch (error) {
        console.error('[useBiometric] Initialization failed:', error);
        setAvailability(null);
        setIsAvailable(false);
      } finally {
        setIsBiometricLoading(false);
      }
    };

    initializeService();

    return () => {
      // Cleanup if needed
    };
  }, []);

  /**
   * Authenticate using biometric
   */
  const authenticate = useCallback(
    async (reason: string = 'Authenticate to access your account'): Promise<BiometricAuthResult> => {
      if (!serviceRef.current) {
        return {
          success: false,
          error: {
            code: 'service_not_initialized',
            message: 'Biometric service not initialized',
          },
        };
      }

      try {
        const result = await serviceRef.current.authenticate(reason);

        if (result.success && result.biometricType) {
          setBiometricType(result.biometricType);
        }

        return result;
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'authentication_error',
            message: String(error),
          },
        };
      }
    },
    []
  );

  /**
   * Enable biometric authentication
   */
  const enable = useCallback(async (): Promise<boolean> => {
    if (!serviceRef.current || !user) {
      console.error('[useBiometric] Cannot enable: service or user not available');
      return false;
    }

    try {
      const success = await serviceRef.current.enableBiometric({
        userId: user.id,
        reason: 'Enable biometric authentication for secure access',
      });

      if (success) {
        setIsEnabled(true);
        const prefs = serviceRef.current.getBiometricPreferences();
        if (prefs?.biometricType) {
          setBiometricType(prefs.biometricType);
        }
      }

      return success;
    } catch (error) {
      console.error('[useBiometric] Enable failed:', error);
      return false;
    }
  }, [user]);

  /**
   * Disable biometric authentication
   */
  const disable = useCallback(async (): Promise<boolean> => {
    if (!serviceRef.current || !user) {
      console.error('[useBiometric] Cannot disable: service or user not available');
      return false;
    }

    try {
      const success = await serviceRef.current.disableBiometric(user.id);

      if (success) {
        setIsEnabled(false);
        setBiometricType(undefined);
      }

      return success;
    } catch (error) {
      console.error('[useBiometric] Disable failed:', error);
      return false;
    }
  }, [user]);

  /**
   * Check current availability
   */
  const checkAvailability = useCallback(async (): Promise<BiometricAvailability> => {
    if (!serviceRef.current) {
      return {
        available: false,
        biometricTypes: [],
        deviceEnrolled: false,
        securityLevel: 'none',
        supportsFallback: true,
        errorMessage: 'Service not initialized',
      };
    }

    try {
      const avail = await serviceRef.current.checkAvailability();
      setAvailability(avail);
      setIsAvailable(avail.available && avail.deviceEnrolled);
      return avail;
    } catch (error) {
      console.error('[useBiometric] Check availability failed:', error);
      return {
        available: false,
        biometricTypes: [],
        deviceEnrolled: false,
        securityLevel: 'none',
        supportsFallback: true,
        errorMessage: String(error),
      };
    }
  }, []);

  /**
   * Get current biometric status
   */
  const getBiometricStatus = useCallback(async (): Promise<BiometricStatus> => {
    const avail = await checkAvailability();

    return {
      enabled: isEnabled,
      available: avail.available && avail.deviceEnrolled,
      biometricType,
      isVerified: false, // Would be set after successful authentication
      attemptCount: 0,
      maxAttempts: 3,
    };
  }, [isEnabled, biometricType, checkAvailability]);

  /**
   * Get attempt history
   */
  const getAttemptHistory = useCallback(() => {
    if (!serviceRef.current) return [];

    return serviceRef.current.getAttemptHistory().map(attempt => ({
      timestamp: attempt.timestamp,
      success: attempt.success,
    }));
  }, []);

  /**
   * Clear attempt history
   */
  const clearAttemptHistory = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.clearAttemptHistory();
    }
  }, []);

  return {
    // Status
    isEnabled,
    isAvailable,
    isBiometricLoading,
    biometricType,
    availability,

    // Status getter
    getBiometricStatus,

    // Actions
    authenticate,
    enable,
    disable,

    // Utilities
    checkAvailability,
    getAttemptHistory,
    clearAttemptHistory,
  };
}
