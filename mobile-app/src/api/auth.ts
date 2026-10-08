/**
 * Authentication API Endpoints
 * Handles login, registration, token refresh, and verification
 */

import { apiClient } from './client';
import { API_ENDPOINTS } from './config';
import {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RefreshTokenRequest,
  RefreshTokenResponse,
} from '@/types';

export const authApi = {
  /**
   * Login with email and password
   */
  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await apiClient.getAxiosInstance().post<LoginResponse>(
      API_ENDPOINTS.AUTH_LOGIN,
      data
    );
    return response.data;
  },

  /**
   * Register a new user
   */
  async register(data: RegisterRequest): Promise<LoginResponse> {
    const response = await apiClient.getAxiosInstance().post<LoginResponse>(
      API_ENDPOINTS.AUTH_REGISTER,
      data
    );
    return response.data;
  },

  /**
   * Refresh authentication token
   */
  async refreshToken(data: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    const response = await apiClient.getAxiosInstance().post<RefreshTokenResponse>(
      API_ENDPOINTS.AUTH_REFRESH,
      data
    );
    return response.data;
  },

  /**
   * Logout (optional server-side cleanup)
   */
  async logout(): Promise<void> {
    try {
      await apiClient.getAxiosInstance().post(API_ENDPOINTS.AUTH_LOGOUT);
    } catch (error) {
      // Logout is best-effort; continue even if server call fails
      console.warn('Logout server call failed:', error);
    }
  },

  /**
   * Verify current authentication token
   */
  async verifyToken(): Promise<{ valid: boolean }> {
    const response = await apiClient.getAxiosInstance().get<{ valid: boolean }>(
      API_ENDPOINTS.AUTH_VERIFY
    );
    return response.data;
  },
};
