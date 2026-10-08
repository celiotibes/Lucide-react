/**
 * Authentication Context
 * Manages global authentication state and token management
 * Phase 22.14 Security Hardening: All tokens route through TokenManager + SecureStorageService
 */

import React, { createContext, useCallback, useEffect, useReducer } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, apiClient, formatApiError } from '@/api';
import { TokenManager, JWTToken } from '@/utils/security/tokenManager';
import { BiometricAuthService } from '@/utils/biometric/biometricAuthService';
import {
  AuthContextType,
  AuthStatus,
  AuthUser,
  AuthToken,
  LoginCredentials,
  RegisterCredentials,
  AuthError,
} from '@/types';
import { toAuthError } from '@/utils';

type AuthAction =
  | { type: 'SET_LOADING' }
  | { type: 'SET_USER'; payload: AuthUser }
  | { type: 'SET_TOKEN'; payload: AuthToken }
  | { type: 'SET_AUTHENTICATED' }
  | { type: 'SET_UNAUTHENTICATED' }
  | { type: 'SET_ERROR'; payload: AuthError }
  | { type: 'CLEAR_ERROR' }
  | { type: 'LOGOUT' }
  | { type: 'SET_API_ENDPOINT'; payload: string };

interface AuthState {
  user: AuthUser | null;
  token: AuthToken | null;
  status: AuthStatus;
  error: AuthError | null;
  apiEndpoint: string | null;
}

const initialState: AuthState = {
  user: null,
  token: null,
  status: 'idle',
  error: null,
  apiEndpoint: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, status: 'loading', error: null };
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_TOKEN':
      return { ...state, token: action.payload };
    case 'SET_AUTHENTICATED':
      return { ...state, status: 'authenticated', error: null };
    case 'SET_UNAUTHENTICATED':
      return { ...state, status: 'unauthenticated', user: null, token: null };
    case 'SET_ERROR':
      return { ...state, status: 'error', error: action.payload };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'LOGOUT':
      return { ...state, ...initialState };
    case 'SET_API_ENDPOINT':
      return { ...state, apiEndpoint: action.payload };
    default:
      return state;
  }
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const tokenManagerRef = React.useRef<TokenManager | null>(null);
  const biometricServiceRef = React.useRef<BiometricAuthService | null>(null);
  const appStateSubscriptionRef = React.useRef<any | null>(null);

  // Initialize TokenManager and BiometricAuthService
  useEffect(() => {
    tokenManagerRef.current = new TokenManager();
    console.log('[TokenManager] Instance created for auth context');

    // Initialize biometric service
    biometricServiceRef.current = new BiometricAuthService();
    biometricServiceRef.current.initialize().then(() => {
      console.log('[BiometricAuth] Service initialized in auth context');
    }).catch((error) => {
      console.warn('[BiometricAuth] Failed to initialize in auth context:', error);
    });
  }, []);

  // Load stored auth state on mount and setup AppState listener for auto-refresh
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const tokenManager = tokenManagerRef.current;
        if (!tokenManager) {
          console.warn('[TokenManager] TokenManager not initialized');
          return;
        }

        // Load API endpoint from AsyncStorage (not sensitive, no change needed)
        const apiEndpoint = await AsyncStorage.getItem('apiEndpoint');
        if (apiEndpoint) {
          console.log('[Auth] Restoring API endpoint from storage');
          dispatch({ type: 'SET_API_ENDPOINT', payload: apiEndpoint });
          apiClient.setBaseURL(apiEndpoint);
        }

        // Retrieve tokens from TokenManager (secure storage)
        const token = tokenManager.getToken();
        const refreshToken = tokenManager.getRefreshToken();

        // Load user from AsyncStorage (non-sensitive metadata)
        const userJson = await AsyncStorage.getItem('user');

        if (token && refreshToken && userJson) {
          const user = JSON.parse(userJson);
          console.log('[TokenManager] Retrieved stored tokens from secure storage');

          // Check if token is still valid
          if (tokenManager.isTokenValid()) {
            console.log('[TokenManager] Token is valid, restoring authenticated state');
            const expiryMs = tokenManager.getTokenExpiry();
            const expiresAt = expiryMs ? Date.now() + expiryMs : Date.now();

            dispatch({ type: 'SET_USER', payload: user });
            dispatch({
              type: 'SET_TOKEN',
              payload: {
                token,
                refreshToken,
                expiresAt,
                expiresIn: Math.round(expiryMs ? expiryMs / 1000 : 0),
              },
            });
            dispatch({ type: 'SET_AUTHENTICATED' });
            apiClient.setAuthToken(token);
          } else {
            // Token expired or invalid, attempt refresh
            console.log('[TokenManager] Token is expired or invalid, attempting refresh');
            try {
              const response = await authApi.refreshToken({ refreshToken });
              const jwtToken: JWTToken = {
                accessToken: response.token,
                refreshToken: response.refreshToken,
                expiresIn: response.expiresIn,
                tokenType: 'Bearer',
                issuedAt: Date.now(),
              };
              tokenManager.setToken(jwtToken);
              console.log('[TokenManager] Token refreshed and stored securely');

              const newExpiresAt = Date.now() + response.expiresIn * 1000;
              dispatch({ type: 'SET_USER', payload: user });
              dispatch({
                type: 'SET_TOKEN',
                payload: {
                  token: response.token,
                  refreshToken: response.refreshToken,
                  expiresAt: newExpiresAt,
                  expiresIn: response.expiresIn,
                },
              });
              dispatch({ type: 'SET_AUTHENTICATED' });
              apiClient.setAuthToken(response.token);
            } catch (error) {
              console.log('[TokenManager] Token refresh failed, clearing all stored tokens');
              tokenManager.clearTokens();
              await AsyncStorage.multiRemove(['user', 'apiEndpoint']);
              dispatch({ type: 'SET_UNAUTHENTICATED' });
            }
          }
        } else {
          console.log('[TokenManager] No stored tokens found');
        }
      } catch (error) {
        console.warn('[TokenManager] Failed to load auth state:', error);
        dispatch({ type: 'SET_UNAUTHENTICATED' });
      }
    };

    loadAuthState();

    // Setup AppState listener for automatic token refresh on app resume
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('[TokenManager] App resumed, checking token expiration');
        const tokenManager = tokenManagerRef.current;
        if (tokenManager && state.token?.refreshToken) {
          if (tokenManager.shouldRefreshToken()) {
            console.log('[TokenManager] Token needs refresh on app resume, refreshing...');
            try {
              const response = await authApi.refreshToken({
                refreshToken: state.token.refreshToken,
              });
              const jwtToken: JWTToken = {
                accessToken: response.token,
                refreshToken: response.refreshToken,
                expiresIn: response.expiresIn,
                tokenType: 'Bearer',
                issuedAt: Date.now(),
              };
              tokenManager.setToken(jwtToken);
              const newExpiresAt = Date.now() + response.expiresIn * 1000;

              dispatch({
                type: 'SET_TOKEN',
                payload: {
                  token: response.token,
                  refreshToken: response.refreshToken,
                  expiresAt: newExpiresAt,
                  expiresIn: response.expiresIn,
                },
              });
              apiClient.setAuthToken(response.token);
              console.log('[TokenManager] Token refreshed on app resume');
            } catch (error) {
              console.warn('[TokenManager] Auto-refresh on app resume failed:', error);
            }
          }
        }
      }
    };

    appStateSubscriptionRef.current = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup: unsubscribe from AppState listener on unmount
    return () => {
      if (appStateSubscriptionRef.current) {
        appStateSubscriptionRef.current.remove();
        console.log('[TokenManager] AppState listener unsubscribed on unmount');
      }
    };
  }, [state.token?.refreshToken]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    dispatch({ type: 'SET_LOADING' });
    try {
      const tokenManager = tokenManagerRef.current;
      if (!tokenManager) {
        throw new Error('TokenManager not initialized');
      }

      console.log('[TokenManager] Login initiated');
      const response = await authApi.login(credentials);

      // Store tokens securely via TokenManager
      const jwtToken: JWTToken = {
        accessToken: response.token,
        refreshToken: response.refreshToken,
        expiresIn: response.expiresIn,
        tokenType: 'Bearer',
        issuedAt: Date.now(),
      };
      tokenManager.setToken(jwtToken);
      console.log('[TokenManager] Tokens stored securely after login');

      // Store non-sensitive user metadata in AsyncStorage
      await AsyncStorage.setItem('user', JSON.stringify(response.user));

      const expiresAt = Date.now() + response.expiresIn * 1000;
      dispatch({ type: 'SET_USER', payload: response.user });
      dispatch({
        type: 'SET_TOKEN',
        payload: {
          token: response.token,
          refreshToken: response.refreshToken,
          expiresAt,
          expiresIn: response.expiresIn,
        },
      });
      dispatch({ type: 'SET_AUTHENTICATED' });
      apiClient.setAuthToken(response.token);
      console.log('[TokenManager] Login successful, authentication state updated');
    } catch (error) {
      console.error('[TokenManager] Login failed:', error);
      const apiError = formatApiError(error);
      const authError = toAuthError(apiError);
      dispatch({ type: 'SET_ERROR', payload: authError });
      throw authError;
    }
  }, []);

  const register = useCallback(async (credentials: RegisterCredentials) => {
    dispatch({ type: 'SET_LOADING' });
    try {
      const tokenManager = tokenManagerRef.current;
      if (!tokenManager) {
        throw new Error('TokenManager not initialized');
      }

      console.log('[TokenManager] Registration initiated');
      const response = await authApi.register(credentials);

      // Store tokens securely via TokenManager
      const jwtToken: JWTToken = {
        accessToken: response.token,
        refreshToken: response.refreshToken,
        expiresIn: response.expiresIn,
        tokenType: 'Bearer',
        issuedAt: Date.now(),
      };
      tokenManager.setToken(jwtToken);
      console.log('[TokenManager] Tokens stored securely after registration');

      // Store non-sensitive user metadata in AsyncStorage
      await AsyncStorage.setItem('user', JSON.stringify(response.user));

      const expiresAt = Date.now() + response.expiresIn * 1000;
      dispatch({ type: 'SET_USER', payload: response.user });
      dispatch({
        type: 'SET_TOKEN',
        payload: {
          token: response.token,
          refreshToken: response.refreshToken,
          expiresAt,
          expiresIn: response.expiresIn,
        },
      });
      dispatch({ type: 'SET_AUTHENTICATED' });
      apiClient.setAuthToken(response.token);
      console.log('[TokenManager] Registration successful, authentication state updated');
    } catch (error) {
      console.error('[TokenManager] Registration failed:', error);
      const apiError = formatApiError(error);
      const authError = toAuthError(apiError);
      dispatch({ type: 'SET_ERROR', payload: authError });
      throw authError;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      console.log('[TokenManager] Logout initiated');
      await authApi.logout();
    } catch (error) {
      console.warn('[TokenManager] Logout API call failed:', error);
    } finally {
      const tokenManager = tokenManagerRef.current;
      if (tokenManager) {
        // Clear all tokens from secure storage
        tokenManager.clearTokens();
        console.log('[TokenManager] All tokens cleared from secure storage');
      }
      // Clear non-sensitive user data from AsyncStorage
      await AsyncStorage.multiRemove(['user', 'apiEndpoint']);
      dispatch({ type: 'LOGOUT' });
      apiClient.clearAuthToken();
      console.log('[TokenManager] Logout complete, authentication state reset');
    }
  }, []);

  const refreshToken = useCallback(async () => {
    if (!state.token?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const tokenManager = tokenManagerRef.current;
      if (!tokenManager) {
        throw new Error('TokenManager not initialized');
      }

      console.log('[TokenManager] Token refresh initiated');
      const response = await authApi.refreshToken({
        refreshToken: state.token.refreshToken,
      });

      // Store refreshed tokens securely via TokenManager
      const jwtToken: JWTToken = {
        accessToken: response.token,
        refreshToken: response.refreshToken,
        expiresIn: response.expiresIn,
        tokenType: 'Bearer',
        issuedAt: Date.now(),
      };
      tokenManager.setToken(jwtToken);
      console.log('[TokenManager] Refreshed tokens stored securely');

      const expiresAt = Date.now() + response.expiresIn * 1000;
      dispatch({
        type: 'SET_TOKEN',
        payload: {
          token: response.token,
          refreshToken: response.refreshToken,
          expiresAt,
          expiresIn: response.expiresIn,
        },
      });
      apiClient.setAuthToken(response.token);
      console.log('[TokenManager] Token refresh successful');
    } catch (error) {
      console.error('[TokenManager] Token refresh failed:', error);
      const apiError = formatApiError(error);
      const authError = toAuthError(apiError);
      dispatch({ type: 'SET_ERROR', payload: authError });
      await logout();
      throw authError;
    }
  }, [state.token?.refreshToken, logout]);

  const setApiEndpoint = useCallback((endpoint: string) => {
    apiClient.setBaseURL(endpoint);
    AsyncStorage.setItem('apiEndpoint', endpoint).catch((err) =>
      console.warn('Failed to save API endpoint:', err)
    );
    dispatch({ type: 'SET_API_ENDPOINT', payload: endpoint });
  }, []);

  /**
   * Login using biometric authentication
   * Phase 22.15: Biometric authentication support
   */
  const loginWithBiometric = useCallback(async () => {
    dispatch({ type: 'SET_LOADING' });
    try {
      const biometricService = biometricServiceRef.current;
      if (!biometricService) {
        throw new Error('Biometric service not initialized');
      }

      // Check if biometric is enabled
      if (!biometricService.isBiometricEnabled()) {
        throw new Error('Biometric authentication is not enabled');
      }

      // Authenticate with biometric
      const authResult = await biometricService.authenticate(
        'Authenticate to access your account'
      );

      if (!authResult.success) {
        const error = authResult.error?.message || 'Biometric authentication failed';
        const authError = {
          code: authResult.error?.code || 'biometric_failed',
          message: error,
        };
        dispatch({ type: 'SET_ERROR', payload: authError });
        throw authError;
      }

      // After successful biometric verification, we still need user credentials
      // for the initial login to get tokens. Biometric is used for unlock,
      // not for initial authentication.
      console.log('[TokenManager] Biometric authentication successful');

      // Biometric verification unlocks TokenManager
      // The app should use this to skip password entry if tokens exist
    } catch (error) {
      console.error('[TokenManager] Biometric login failed:', error);
      const apiError = formatApiError(error);
      const authError = toAuthError(apiError);
      dispatch({ type: 'SET_ERROR', payload: authError });
      throw authError;
    }
  }, []);

  /**
   * Enable biometric authentication for current user
   * Phase 22.15: Biometric authentication support
   */
  const enableBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const biometricService = biometricServiceRef.current;
      if (!biometricService || !state.user) {
        throw new Error('Service or user not available');
      }

      const success = await biometricService.enableBiometric({
        userId: state.user.id,
        reason: 'Enable biometric authentication for secure access',
      });

      if (success) {
        console.log('[BiometricAuth] Biometric authentication enabled for user:', state.user.id);
      }

      return success;
    } catch (error) {
      console.error('[BiometricAuth] Failed to enable biometric:', error);
      return false;
    }
  }, [state.user]);

  /**
   * Disable biometric authentication for current user
   * Phase 22.15: Biometric authentication support
   */
  const disableBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const biometricService = biometricServiceRef.current;
      if (!biometricService || !state.user) {
        throw new Error('Service or user not available');
      }

      const success = await biometricService.disableBiometric(state.user.id);

      if (success) {
        console.log('[BiometricAuth] Biometric authentication disabled for user:', state.user.id);
      }

      return success;
    } catch (error) {
      console.error('[BiometricAuth] Failed to disable biometric:', error);
      return false;
    }
  }, [state.user]);

  /**
   * Check biometric availability
   * Phase 22.15: Biometric authentication support
   */
  const checkBiometricAvailability = useCallback(async () => {
    try {
      const biometricService = biometricServiceRef.current;
      if (!biometricService) {
        throw new Error('Biometric service not initialized');
      }

      return await biometricService.checkAvailability();
    } catch (error) {
      console.error('[BiometricAuth] Failed to check availability:', error);
      return null;
    }
  }, []);

  const value: AuthContextType = {
    user: state.user,
    token: state.token,
    status: state.status,
    error: state.error,
    login,
    register,
    logout,
    refreshToken,
    setApiEndpoint,
    apiEndpoint: state.apiEndpoint,
    loginWithBiometric,
    enableBiometric,
    disableBiometric,
    checkBiometricAvailability,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
