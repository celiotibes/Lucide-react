/**
 * Axios API Client
 * Configured with auth interceptors and error handling
 */

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiConfig, DEFAULT_API_CONFIG, ERROR_MESSAGES, HTTP_STATUS } from './config';
import { ApiErrorResponse } from '@/types';

class ApiClient {
  private instance: AxiosInstance;
  private config: ApiConfig;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = {
      ...DEFAULT_API_CONFIG,
      ...config,
    };

    this.instance = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor - add auth token
    this.instance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle token refresh and errors
    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
          _retry?: boolean;
        };

        if (!originalRequest) {
          return Promise.reject(error);
        }

        // Handle 401 Unauthorized - try to refresh token
        if (error.response?.status === HTTP_STATUS.UNAUTHORIZED && !originalRequest._retry) {
          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then((token) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return this.instance(originalRequest);
              })
              .catch((err) => Promise.reject(err));
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const refreshToken = await AsyncStorage.getItem('refreshToken');
            if (!refreshToken) {
              throw new Error('No refresh token available');
            }

            const response = await this.instance.post('/api/auth/refresh', {
              refreshToken,
            });

            const { token, expiresIn } = response.data;
            await AsyncStorage.setItem('authToken', token);
            await AsyncStorage.setItem('tokenExpiresAt', (Date.now() + expiresIn * 1000).toString());

            this.instance.defaults.headers.common.Authorization = `Bearer ${token}`;
            originalRequest.headers.Authorization = `Bearer ${token}`;

            this.processQueue(null, token);
            this.isRefreshing = false;

            return this.instance(originalRequest);
          } catch (err) {
            this.processQueue(err as Error, null);
            this.isRefreshing = false;
            await this.clearAuth();
            return Promise.reject(err);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private processQueue(error: Error | null, token: string | null): void {
    this.failedQueue.forEach((item) => {
      if (error) {
        item.reject(error);
      } else if (token) {
        item.resolve(token);
      }
    });
    this.failedQueue = [];
  }

  private async clearAuth(): Promise<void> {
    await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'tokenExpiresAt', 'user']);
  }

  public setBaseURL(url: string): void {
    this.config.baseURL = url;
    this.instance.defaults.baseURL = url;
  }

  public getBaseURL(): string {
    return this.config.baseURL;
  }

  public setAuthToken(token: string): void {
    this.instance.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  public clearAuthToken(): void {
    delete this.instance.defaults.headers.common.Authorization;
  }

  public async testConnection(): Promise<boolean> {
    try {
      const response = await this.instance.get('/api/health', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (_error) {
      return false;
    }
  }

  public getAxiosInstance(): AxiosInstance {
    return this.instance;
  }
}

// Create and export singleton instance
export const apiClient = new ApiClient();

// Helper function to format API errors
export function formatApiError(error: unknown): ApiErrorResponse {
  if (axios.isAxiosError(error)) {
    if (error.response?.data) {
      return error.response.data as ApiErrorResponse;
    }

    if (error.code === 'ECONNABORTED') {
      return {
        error: 'TIMEOUT',
        message: ERROR_MESSAGES.TIMEOUT,
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      };
    }

    if (!error.response) {
      return {
        error: 'NETWORK_ERROR',
        message: ERROR_MESSAGES.NETWORK_ERROR,
        statusCode: 0,
      };
    }

    return {
      error: `HTTP_${error.response.status}`,
      message: error.response.statusText || ERROR_MESSAGES.SERVER_ERROR,
      statusCode: error.response.status,
    };
  }

  if (error instanceof Error) {
    return {
      error: 'UNKNOWN_ERROR',
      message: error.message,
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    };
  }

  return {
    error: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred',
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  };
}
