/**
 * Authentication Context
 * Manages global authentication state and token management
 */

import React, { createContext, useCallback, useEffect, useReducer } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, apiClient, formatApiError } from '@/api';
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

  // Load stored auth state on mount
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const [token, refreshToken, apiEndpoint, userJson, expiresAtStr] =
          await AsyncStorage.multiGet([
            'authToken',
            'refreshToken',
            'apiEndpoint',
            'user',
            'tokenExpiresAt',
          ]);

        if (apiEndpoint[1]) {
          dispatch({ type: 'SET_API_ENDPOINT', payload: apiEndpoint[1] });
          apiClient.setBaseURL(apiEndpoint[1]);
        }

        if (token[1] && refreshToken[1] && userJson[1]) {
          const user = JSON.parse(userJson[1]);
          const expiresAt = expiresAtStr[1] ? parseInt(expiresAtStr[1], 10) : Date.now();

          // Check if token is still valid
          if (expiresAt > Date.now()) {
            dispatch({ type: 'SET_USER', payload: user });
            dispatch({
              type: 'SET_TOKEN',
              payload: {
                token: token[1],
                refreshToken: refreshToken[1],
                expiresAt,
                expiresIn: Math.round((expiresAt - Date.now()) / 1000),
              },
            });
            dispatch({ type: 'SET_AUTHENTICATED' });
            apiClient.setAuthToken(token[1]);
          } else {
            // Token expired, try to refresh
            try {
              const response = await authApi.refreshToken({
                refreshToken: refreshToken[1],
              });
              await AsyncStorage.setItem('authToken', response.token);
              const newExpiresAt = Date.now() + response.expiresIn * 1000;
              await AsyncStorage.setItem('tokenExpiresAt', newExpiresAt.toString());

              dispatch({ type: 'SET_USER', payload: user });
              dispatch({
                type: 'SET_TOKEN',
                payload: {
                  token: response.token,
                  refreshToken: refreshToken[1],
                  expiresAt: newExpiresAt,
                  expiresIn: response.expiresIn,
                },
              });
              dispatch({ type: 'SET_AUTHENTICATED' });
              apiClient.setAuthToken(response.token);
            } catch (error) {
              await AsyncStorage.multiRemove([
                'authToken',
                'refreshToken',
                'user',
                'tokenExpiresAt',
              ]);
              dispatch({ type: 'SET_UNAUTHENTICATED' });
            }
          }
        }
      } catch (error) {
        console.warn('Failed to load auth state:', error);
        dispatch({ type: 'SET_UNAUTHENTICATED' });
      }
    };

    loadAuthState();
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    dispatch({ type: 'SET_LOADING' });
    try {
      const response = await authApi.login(credentials);

      const expiresAt = Date.now() + response.expiresIn * 1000;
      await AsyncStorage.multiSet([
        ['authToken', response.token],
        ['refreshToken', response.refreshToken],
        ['user', JSON.stringify(response.user)],
        ['tokenExpiresAt', expiresAt.toString()],
      ]);

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
    } catch (error) {
      const apiError = formatApiError(error);
      const authError = toAuthError(apiError);
      dispatch({ type: 'SET_ERROR', payload: authError });
      throw authError;
    }
  }, []);

  const register = useCallback(async (credentials: RegisterCredentials) => {
    dispatch({ type: 'SET_LOADING' });
    try {
      const response = await authApi.register(credentials);

      const expiresAt = Date.now() + response.expiresIn * 1000;
      await AsyncStorage.multiSet([
        ['authToken', response.token],
        ['refreshToken', response.refreshToken],
        ['user', JSON.stringify(response.user)],
        ['tokenExpiresAt', expiresAt.toString()],
      ]);

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
    } catch (error) {
      const apiError = formatApiError(error);
      const authError = toAuthError(apiError);
      dispatch({ type: 'SET_ERROR', payload: authError });
      throw authError;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.warn('Logout call failed:', error);
    } finally {
      await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'user', 'tokenExpiresAt']);
      dispatch({ type: 'LOGOUT' });
      apiClient.clearAuthToken();
    }
  }, []);

  const refreshToken = useCallback(async () => {
    if (!state.token?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await authApi.refreshToken({
        refreshToken: state.token.refreshToken,
      });

      const expiresAt = Date.now() + response.expiresIn * 1000;
      await AsyncStorage.multiSet([
        ['authToken', response.token],
        ['tokenExpiresAt', expiresAt.toString()],
      ]);

      dispatch({
        type: 'SET_TOKEN',
        payload: {
          token: response.token,
          refreshToken: state.token.refreshToken,
          expiresAt,
          expiresIn: response.expiresIn,
        },
      });
      apiClient.setAuthToken(response.token);
    } catch (error) {
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
