/**
 * API Context - Provides secure API client to all components
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { SecureAPIClient, ApiResponse, ApiError } from '../services/api/secureAPIClient';
import {
  initializeApp,
  createConfiguredAPIClient,
  setupTokenRefreshInterval,
} from '../config/securityConfig';
import { TokenManager } from '../services/security/TokenManager';

interface APIContextType {
  apiClient: SecureAPIClient | null;
  isInitialized: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

const APIContext = createContext<APIContextType | undefined>(undefined);

/**
 * API Provider Component
 */
export const APIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiClient, setApiClient] = useState<SecureAPIClient | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Initialize API on mount
   */
  useEffect(() => {
    const initialize = async () => {
      try {
        // Initialize security services
        await initializeApp();

        // Create API client
        const client = createConfiguredAPIClient('default');
        setApiClient(client);

        // Check authentication
        const authenticated = TokenManager.isAuthenticated();
        setIsAuthenticated(authenticated);

        if (authenticated) {
          // Setup token refresh
          setupTokenRefreshInterval(handleRefreshToken);
        }

        setIsInitialized(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to initialize API';
        setError(message);
        console.error('[APIProvider] Initialization error:', err);
      }
    };

    initialize();
  }, []);

  /**
   * Handle login
   */
  const handleLogin = async (credentials: {
    email: string;
    password: string;
  }): Promise<void> => {
    if (!apiClient) {
      throw new Error('API client not initialized');
    }

    try {
      const response = await apiClient.post<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      }>('/auth/login', credentials, {
        skipCertificatePinning: true, // May want to skip for login endpoint
      });

      // Store tokens
      TokenManager.setTokens(
        response.data.accessToken,
        response.data.refreshToken,
        response.data.expiresIn
      );

      setIsAuthenticated(true);
      setError(null);

      // Setup token refresh
      setupTokenRefreshInterval(handleRefreshToken);

      console.log('[APIProvider] Login successful');
    } catch (err) {
      const apiError = err as ApiError;
      const message = apiError.message || 'Login failed';
      setError(message);
      throw err;
    }
  };

  /**
   * Handle logout
   */
  const handleLogout = (): void => {
    TokenManager.clearTokens();
    setIsAuthenticated(false);
    setError(null);
    console.log('[APIProvider] Logout successful');
  };

  /**
   * Handle token refresh
   */
  const handleRefreshToken = async (): Promise<void> => {
    if (!apiClient) {
      throw new Error('API client not initialized');
    }

    const refreshToken = TokenManager.getRefreshToken();
    if (!refreshToken) {
      handleLogout();
      throw new Error('No refresh token available');
    }

    try {
      const response = await apiClient.post<{
        accessToken: string;
        expiresIn: number;
      }>('/auth/refresh', { refreshToken }, {
        retry: {
          maxRetries: 2,
          initialDelayMs: 500,
        },
      });

      TokenManager.setTokens(
        response.data.accessToken,
        refreshToken,
        response.data.expiresIn
      );

      console.log('[APIProvider] Token refreshed successfully');
    } catch (err) {
      console.error('[APIProvider] Token refresh failed:', err);
      handleLogout();
      throw err;
    }
  };

  const value: APIContextType = {
    apiClient,
    isInitialized,
    isAuthenticated,
    error,
    login: handleLogin,
    logout: handleLogout,
    refreshToken: handleRefreshToken,
  };

  return <APIContext.Provider value={value}>{children}</APIContext.Provider>;
};

/**
 * Hook to use API context
 */
export function useAPI(): APIContextType {
  const context = useContext(APIContext);

  if (context === undefined) {
    throw new Error('useAPI must be used within APIProvider');
  }

  return context;
}

/**
 * Hook to use API client directly
 */
export function useAPIClient(): SecureAPIClient {
  const { apiClient } = useAPI();

  if (!apiClient) {
    throw new Error('API client not initialized');
  }

  return apiClient;
}

/**
 * Hook to check authentication status
 */
export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useAPI();
  return isAuthenticated;
}

/**
 * Hook to perform authenticated request
 */
export function useAuthenticatedRequest<T = any>(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  url: string
) {
  const apiClient = useAPIClient();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const execute = async (body?: any) => {
    setLoading(true);
    setError(null);

    try {
      let response: ApiResponse<T>;

      switch (method) {
        case 'get':
          response = await apiClient.get<T>(url);
          break;
        case 'post':
          response = await apiClient.post<T>(url, body);
          break;
        case 'put':
          response = await apiClient.put<T>(url, body);
          break;
        case 'patch':
          response = await apiClient.patch<T>(url, body);
          break;
        case 'delete':
          response = await apiClient.delete<T>(url);
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }

      setData(response.data);
      return response.data;
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError);
      throw apiError;
    } finally {
      setLoading(false);
    }
  };

  return {
    data,
    loading,
    error,
    execute,
  };
}

/**
 * Example usage in components:
 *
 * export function UserList() {
 *   const { data: users, loading, error, execute } = useAuthenticatedRequest(
 *     'get',
 *     '/users'
 *   );
 *
 *   useEffect(() => {
 *     execute();
 *   }, []);
 *
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return (
 *     <ul>
 *       {users?.map(user => (
 *         <li key={user.id}>{user.name}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 */
