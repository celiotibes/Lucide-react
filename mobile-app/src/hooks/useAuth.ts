/**
 * useAuth Hook
 * Provides easy access to authentication context and methods
 */

import { useContext } from 'react';
import { AuthContext } from '@/store/auth-context';
import { AuthContextType } from '@/types';

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

/**
 * Hook to check if user is authenticated
 */
export function useIsAuthenticated(): boolean {
  const { status } = useAuth();
  return status === 'authenticated';
}

/**
 * Hook to check if auth is loading
 */
export function useAuthLoading(): boolean {
  const { status } = useAuth();
  return status === 'loading';
}

/**
 * Hook to get current user
 */
export function useAuthUser() {
  const { user } = useAuth();
  return user;
}

/**
 * Hook to get auth token
 */
export function useAuthToken() {
  const { token } = useAuth();
  return token;
}
