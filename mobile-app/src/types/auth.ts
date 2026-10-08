/**
 * Authentication Types
 * Types related to user authentication and authorization
 * Phase 22.15: Biometric authentication support
 */

import type { BiometricAvailability } from '@/utils/biometric/biometricTypes';

export interface AuthUser {
  id: string;
  email: string;
  nome: string;
  avatar?: string;
}

export interface AuthToken {
  token: string;
  refreshToken: string;
  expiresAt: number;
  expiresIn: number;
}

export interface AuthSession {
  user: AuthUser;
  token: AuthToken;
  isAuthenticated: boolean;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface AuthError {
  code: string;
  message: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  nome: string;
  sobrenome?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  token: AuthToken | null;
  status: AuthStatus;
  error: AuthError | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setApiEndpoint: (endpoint: string) => void;
  apiEndpoint: string | null;
  // Biometric authentication methods (Phase 22.15)
  loginWithBiometric?: () => Promise<void>;
  enableBiometric?: () => Promise<boolean>;
  disableBiometric?: () => Promise<boolean>;
  checkBiometricAvailability?: () => Promise<BiometricAvailability | null>;
}

export interface SetupWizardState {
  apiEndpoint: string;
  apiEndpointValid: boolean;
  testingConnection: boolean;
  connectionError: string | null;
}
