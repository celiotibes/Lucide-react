/**
 * Biometric Authentication Types
 * Types for biometric authentication system (Face ID, Touch ID, fingerprint)
 * Phase 22.15 Mobile-First Features
 */

/**
 * Available biometric types
 */
export enum BiometricType {
  FACE_ID = 'face_id',      // iOS Face ID, Android Face Unlock, Windows Hello
  TOUCH_ID = 'touch_id',    // iOS Touch ID
  FINGERPRINT = 'fingerprint', // Android fingerprint
  IRIS = 'iris',             // Android iris recognition
  UNKNOWN = 'unknown',       // Unknown biometric type
}

/**
 * Biometric authentication result
 */
export interface BiometricAuthResult {
  success: boolean;
  biometricType?: BiometricType;
  error?: {
    code: string;
    message: string;
  };
  attemptCount?: number;
}

/**
 * Biometric authentication event
 */
export interface BiometricEvent {
  type: 'success' | 'failure' | 'error';
  biometricType: BiometricType;
  timestamp: number;
  reason?: string;
  deviceId?: string;
  attemptCount?: number;
}

/**
 * Biometric availability information
 */
export interface BiometricAvailability {
  available: boolean;
  biometricTypes: BiometricType[];
  deviceEnrolled: boolean;
  securityLevel: 'none' | 'weak' | 'strong' | 'strong_biometric';
  supportsFallback: boolean;
  errorMessage?: string;
}

/**
 * Biometric authentication preferences (stored securely)
 */
export interface BiometricPreferences {
  enabled: boolean;
  biometricType?: BiometricType;
  userId: string;
  createdAt: number;
  lastUsedAt?: number;
  enabledAt?: number;
  disabledAt?: number;
  fallbackPasswordSetup: boolean; // Ensure password is set before enabling biometric
}

/**
 * Biometric verification result
 */
export interface BiometricVerificationResult {
  verified: boolean;
  timestamp: number;
  biometricType: BiometricType;
  error?: string;
  remainingAttempts?: number; // For attempt limiting
}

/**
 * Biometric authentication status
 */
export interface BiometricStatus {
  enabled: boolean;
  available: boolean;
  biometricType?: BiometricType;
  isVerified: boolean;
  lastVerifiedAt?: number;
  attemptCount: number;
  maxAttempts: number;
}

/**
 * Biometric authentication error types
 */
export enum BiometricErrorType {
  NO_BIOMETRIC_HARDWARE = 'no_biometric_hardware',
  NOT_ENROLLED = 'not_enrolled',
  USER_CANCELLED = 'user_cancelled',
  USER_FALLBACK = 'user_fallback',
  SYSTEM_ERROR = 'system_error',
  UNAVAILABLE = 'unavailable',
  TIMEOUT = 'timeout',
  MAX_ATTEMPTS_EXCEEDED = 'max_attempts_exceeded',
  INVALID_CREDENTIALS = 'invalid_credentials',
  PERMISSION_DENIED = 'permission_denied',
  STORAGE_ERROR = 'storage_error',
}

/**
 * Biometric permission request
 */
export interface BiometricPermissionRequest {
  reason: string;
  fallbackToDevicePasscode?: boolean;
  disableAlternativeAuthentication?: boolean;
}

/**
 * Biometric setup options
 */
export interface BiometricSetupOptions {
  userId: string;
  reason?: string;
  fallbackToPIN?: boolean;
  maxAttempts?: number;
  timeout?: number; // in milliseconds
}

/**
 * Biometric authentication context
 */
export interface BiometricAuthContext {
  isEnabled: boolean;
  isAvailable: boolean;
  biometricTypes: BiometricType[];
  status: 'idle' | 'authenticating' | 'verified' | 'failed' | 'error';
  error?: {
    code: BiometricErrorType;
    message: string;
  };
  lastAttempt?: {
    timestamp: number;
    success: boolean;
  };
}
