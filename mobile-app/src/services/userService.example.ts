/**
 * User Service - Example Implementation with Error Handling
 * Phase 22.9: Shows best practices for error handling in services
 *
 * COPY THIS PATTERN TO YOUR ACTUAL SERVICES
 */

import { logger } from '@/utils/logger';
import { ErrorHandler } from '@/utils/errorHandler';
import {
  withErrorHandler,
  withNetworkErrorHandler,
  safeServiceCall,
  ServiceResponse,
} from '@/utils/serviceErrorHandler';
import { api } from '@/api/client';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

interface UserProfile extends User {
  bio?: string;
  location?: string;
  website?: string;
}

interface UpdateUserInput {
  name?: string;
  bio?: string;
  avatar?: string;
}

class UserService {
  private readonly MODULE_NAME = 'UserService';

  /**
   * Get current user profile
   * Pattern 1: Using withNetworkErrorHandler for network-heavy operations
   */
  async getProfile(): Promise<ServiceResponse<UserProfile>> {
    return withNetworkErrorHandler(
      async () => {
        logger.debug('Fetching user profile', undefined, this.MODULE_NAME);
        const response = await api.get<UserProfile>('/user/profile');
        logger.info('Profile fetched successfully', { userId: response.data.id }, this.MODULE_NAME);
        return response.data;
      },
      {
        operation: 'getProfile',
        module: this.MODULE_NAME,
      }
    );
  }

  /**
   * Get user by ID
   * Pattern 2: With retry and error recovery
   */
  async getUserById(userId: string): Promise<ServiceResponse<User>> {
    return withErrorHandler(
      async () => {
        logger.debug('Fetching user', { userId }, this.MODULE_NAME);
        const response = await api.get<User>(`/users/${userId}`);
        return response.data;
      },
      {
        operation: 'getUserById',
        module: this.MODULE_NAME,
        retryOptions: {
          maxAttempts: 2,
          initialDelay: 500,
        },
      }
    );
  }

  /**
   * Update user profile
   * Pattern 3: With validation error handling
   */
  async updateProfile(data: UpdateUserInput): Promise<ServiceResponse<UserProfile>> {
    // Validate input
    if (!data.name && !data.bio && !data.avatar) {
      logger.warn('Update called with empty data', undefined, this.MODULE_NAME);
      return {
        success: false,
        error: ErrorHandler.classifyError(
          new Error('No data to update'),
          this.MODULE_NAME
        ),
      };
    }

    return withErrorHandler(
      async () => {
        logger.debug('Updating user profile', { fields: Object.keys(data) }, this.MODULE_NAME);
        const response = await api.patch<UserProfile>('/user/profile', data);
        logger.info('Profile updated successfully', undefined, this.MODULE_NAME);
        return response.data;
      },
      {
        operation: 'updateProfile',
        module: this.MODULE_NAME,
        retryOptions: {
          maxAttempts: 2,
          shouldRetry: (error) => {
            // Don't retry validation errors
            if (error.category === 'VALIDATION') {
              return false;
            }
            return error.retryable;
          },
        },
      }
    );
  }

  /**
   * List all users
   * Pattern 4: With caching/fallback support
   */
  async listUsers(
    limit: number = 20,
    offset: number = 0
  ): Promise<ServiceResponse<User[]>> {
    return withErrorHandler(
      async () => {
        logger.debug('Listing users', { limit, offset }, this.MODULE_NAME);
        const response = await api.get<{ users: User[] }>('/users', {
          params: { limit, offset },
        });
        logger.info('Users listed successfully', { count: response.data.users.length }, this.MODULE_NAME);
        return response.data.users;
      },
      {
        operation: 'listUsers',
        module: this.MODULE_NAME,
        fallbackValue: [], // Return empty array on error
      }
    );
  }

  /**
   * Search users
   * Pattern 5: Safe service call with default value
   */
  async searchUsers(query: string): Promise<User[]> {
    return safeServiceCall(
      'searchUsers',
      async () => {
        logger.debug('Searching users', { query }, this.MODULE_NAME);
        const response = await api.get<{ users: User[] }>('/users/search', {
          params: { q: query },
        });
        return response.data.users;
      },
      this.MODULE_NAME,
      [] // Default to empty array
    ) || [];
  }

  /**
   * Delete user
   * Pattern 6: Critical operation with detailed error logging
   */
  async deleteUser(userId: string): Promise<ServiceResponse<void>> {
    try {
      logger.debug('Deleting user', { userId }, this.MODULE_NAME);

      // Validate input
      if (!userId || userId.trim() === '') {
        throw new Error('User ID is required');
      }

      await api.delete(`/users/${userId}`);
      logger.info('User deleted successfully', { userId }, this.MODULE_NAME);

      return { success: true };
    } catch (error) {
      const errorContext = ErrorHandler.classifyError(error, this.MODULE_NAME);

      // Log with appropriate level based on error type
      if (errorContext.statusCode === 404) {
        logger.warn('User not found', { userId }, this.MODULE_NAME);
      } else if (errorContext.statusCode === 403) {
        logger.warn('No permission to delete user', { userId }, this.MODULE_NAME);
      } else {
        logger.error('Failed to delete user', error, this.MODULE_NAME);
      }

      return { success: false, error: errorContext };
    }
  }

  /**
   * Batch operations
   * Pattern 7: Multiple operations with error handling
   */
  async batchGetUsers(userIds: string[]): Promise<ServiceResponse<Map<string, User>>> {
    const result = new Map<string, User>();

    for (const userId of userIds) {
      try {
        const response = await this.getUserById(userId);
        if (response.success && response.data) {
          result.set(userId, response.data);
        } else {
          logger.warn('Failed to fetch user', { userId }, this.MODULE_NAME);
        }
      } catch (error) {
        logger.error('Error in batch operation', error, this.MODULE_NAME);
      }
    }

    if (result.size === 0) {
      return {
        success: false,
        error: ErrorHandler.classifyError(
          new Error('No users could be fetched'),
          this.MODULE_NAME
        ),
      };
    }

    return { success: true, data: result };
  }

  /**
   * Retry-heavy operation
   * Pattern 8: For operations that might fail temporarily
   */
  async uploadAvatar(userId: string, imageData: FormData): Promise<ServiceResponse<string>> {
    return await ErrorHandler.retry(
      async () => {
        logger.debug('Uploading avatar', { userId }, this.MODULE_NAME);
        const response = await api.post<{ url: string }>(
          `/users/${userId}/avatar`,
          imageData,
          {
            headers: { 'Content-Type': 'multipart/form-data' },
          }
        );
        logger.info('Avatar uploaded successfully', { url: response.data.url }, this.MODULE_NAME);
        return response.data.url;
      },
      {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
      },
      this.MODULE_NAME
    ).then(
      (url) => ({ success: true, data: url }),
      (error) => ({
        success: false,
        error: ErrorHandler.classifyError(error, this.MODULE_NAME),
      })
    );
  }

  /**
   * Get error details for debugging
   */
  getLastErrorDetails(error: unknown): Record<string, any> {
    return ErrorHandler.getErrorDetails(error, this.MODULE_NAME);
  }
}

// Export singleton instance
export const userService = new UserService();

/**
 * USAGE EXAMPLES IN COMPONENTS
 *
 * import { userService } from '@/services/userService.example';
 *
 * // In a functional component with hook
 * function UserProfile() {
 *   const { executeWithErrorHandling, error, userMessage } = useErrorHandler();
 *
 *   const loadProfile = async () => {
 *     const result = await executeWithErrorHandling(() =>
 *       userService.getProfile()
 *     );
 *     if (result?.success) {
 *       setUser(result.data);
 *     }
 *   };
 * }
 *
 * // Direct usage without hook
 * async function loadUserData(userId: string) {
 *   const response = await userService.getUserById(userId);
 *   if (response.success) {
 *     console.log('User:', response.data);
 *   } else {
 *     console.log('Error:', response.error?.userMessage);
 *   }
 * }
 */
