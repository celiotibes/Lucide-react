import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const STORAGE_KEYS = {
  API_ENDPOINT: '@crmt:api_endpoint',
  AUTH_TOKEN: '@crmt:auth_token',
  REFRESH_TOKEN: '@crmt:refresh_token',
  API_KEY: '@crmt:api_key',
  USER_ID: '@crmt:user_id',
  USER_EMAIL: '@crmt:user_email',
  DEVICE_ID: '@crmt:device_id',
  ENCRYPTION_KEY: '@crmt:encryption_key',
};

interface StoredCredentials {
  apiEndpoint: string | null;
  authToken: string | null;
  refreshToken: string | null;
  apiKey: string | null;
  userId: string | null;
  userEmail: string | null;
  deviceId: string | null;
}

export const credentialsStorage = {
  // API Endpoint management
  async setApiEndpoint(endpoint: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.API_ENDPOINT, endpoint);
      logger.info('API endpoint saved');
    } catch (error) {
      logger.error('Failed to save API endpoint', error);
      throw error;
    }
  },

  async getApiEndpoint(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.API_ENDPOINT);
    } catch (error) {
      logger.error('Failed to retrieve API endpoint', error);
      return null;
    }
  },

  // Authentication tokens
  async setAuthToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
      logger.info('Auth token saved');
    } catch (error) {
      logger.error('Failed to save auth token', error);
      throw error;
    }
  },

  async getAuthToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    } catch (error) {
      logger.error('Failed to retrieve auth token', error);
      return null;
    }
  },

  async setRefreshToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
      logger.info('Refresh token saved');
    } catch (error) {
      logger.error('Failed to save refresh token', error);
      throw error;
    }
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    } catch (error) {
      logger.error('Failed to retrieve refresh token', error);
      return null;
    }
  },

  // User information
  async setUserId(userId: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ID, userId);
    } catch (error) {
      logger.error('Failed to save user ID', error);
      throw error;
    }
  },

  async getUserId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.USER_ID);
    } catch (error) {
      logger.error('Failed to retrieve user ID', error);
      return null;
    }
  },

  async setUserEmail(email: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
    } catch (error) {
      logger.error('Failed to save user email', error);
      throw error;
    }
  },

  async getUserEmail(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.USER_EMAIL);
    } catch (error) {
      logger.error('Failed to retrieve user email', error);
      return null;
    }
  },

  // Device identification
  async setDeviceId(deviceId: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
    } catch (error) {
      logger.error('Failed to save device ID', error);
      throw error;
    }
  },

  async getDeviceId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    } catch (error) {
      logger.error('Failed to retrieve device ID', error);
      return null;
    }
  },

  // Bulk operations
  async getAll(): Promise<StoredCredentials> {
    try {
      const values = await AsyncStorage.multiGet([
        STORAGE_KEYS.API_ENDPOINT,
        STORAGE_KEYS.AUTH_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.API_KEY,
        STORAGE_KEYS.USER_ID,
        STORAGE_KEYS.USER_EMAIL,
        STORAGE_KEYS.DEVICE_ID,
      ]);

      return {
        apiEndpoint: values[0][1],
        authToken: values[1][1],
        refreshToken: values[2][1],
        apiKey: values[3][1],
        userId: values[4][1],
        userEmail: values[5][1],
        deviceId: values[6][1],
      };
    } catch (error) {
      logger.error('Failed to retrieve credentials', error);
      throw error;
    }
  },

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.API_ENDPOINT,
        STORAGE_KEYS.AUTH_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.API_KEY,
        STORAGE_KEYS.USER_ID,
        STORAGE_KEYS.USER_EMAIL,
        STORAGE_KEYS.DEVICE_ID,
      ]);
      logger.info('All credentials cleared');
    } catch (error) {
      logger.error('Failed to clear credentials', error);
      throw error;
    }
  },

  async clearAuthTokens(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.AUTH_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
      ]);
      logger.info('Auth tokens cleared');
    } catch (error) {
      logger.error('Failed to clear auth tokens', error);
      throw error;
    }
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAuthToken();
    return !!token;
  },
};
