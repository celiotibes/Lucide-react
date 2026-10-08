/**
 * Permission Service Tests
 * Unit tests for permission management
 */

import { permissionService, PermissionStatus } from '../permissionService';
import * as Permissions from 'expo-permissions';
import { logger } from '@/utils/logger';

// Mock Expo Permissions
jest.mock('expo-permissions');
jest.mock('@/utils/logger');

describe('PermissionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    permissionService.resetPermissionTracking();
  });

  describe('checkPermission', () => {
    it('should check camera permission status', async () => {
      const mockStatus = Permissions.PermissionStatus.GRANTED;
      (Permissions.Camera.getAsync as jest.Mock).mockResolvedValue({ status: mockStatus });

      const result = await permissionService.checkPermission('camera');

      expect(result.status).toBe('granted');
      expect(result.canAskAgain).toBe(true);
    });

    it('should return undetermined for new permissions', async () => {
      const mockStatus = Permissions.PermissionStatus.UNDETERMINED;
      (Permissions.Camera.getAsync as jest.Mock).mockResolvedValue({ status: mockStatus });

      const result = await permissionService.checkPermission('camera');

      expect(result.status).toBe('undetermined');
      expect(result.canAskAgain).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      (Permissions.Camera.getAsync as jest.Mock).mockRejectedValue(new Error('Permission check failed'));

      const result = await permissionService.checkPermission('camera');

      expect(result.status).toBe('undetermined');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('requestPermission', () => {
    it('should request permission successfully', async () => {
      const mockStatus = Permissions.PermissionStatus.GRANTED;
      (Permissions.Camera.getAsync as jest.Mock).mockResolvedValue({ status: mockStatus });
      (Permissions.Camera.requestAsync as jest.Mock).mockResolvedValue({ status: mockStatus });

      const result = await permissionService.requestPermission({
        type: 'camera',
        title: 'Camera Access',
        message: 'App needs camera access',
      });

      expect(result.status).toBe('granted');
      expect(Permissions.Camera.requestAsync).toHaveBeenCalled();
    });

    it('should handle permission denial', async () => {
      const mockStatus = Permissions.PermissionStatus.DENIED;
      (Permissions.Camera.getAsync as jest.Mock).mockResolvedValue({ status: mockStatus });
      (Permissions.Camera.requestAsync as jest.Mock).mockResolvedValue({ status: mockStatus });

      const result = await permissionService.requestPermission({
        type: 'camera',
        title: 'Camera Access',
        message: 'App needs camera access',
      });

      expect(result.status).toBe('denied');
      expect(result.canAskAgain).toBe(true);
    });

    it('should not ask again after max requests', async () => {
      const mockStatus = Permissions.PermissionStatus.DENIED;
      (Permissions.Camera.getAsync as jest.Mock).mockResolvedValue({ status: mockStatus });
      (Permissions.Camera.requestAsync as jest.Mock).mockResolvedValue({ status: mockStatus });

      const request = {
        type: 'camera' as const,
        title: 'Camera Access',
        message: 'App needs camera access',
      };

      // Request 3 times
      for (let i = 0; i < 3; i++) {
        await permissionService.requestPermission(request);
      }

      const result = await permissionService.requestPermission(request);

      expect(result.status).toBe('denied');
      expect(result.canAskAgain).toBe(false);
    });

    it('should skip request if already granted', async () => {
      const mockStatus = Permissions.PermissionStatus.GRANTED;
      (Permissions.Camera.getAsync as jest.Mock).mockResolvedValue({ status: mockStatus });

      const result = await permissionService.requestPermission({
        type: 'camera',
        title: 'Camera Access',
        message: 'App needs camera access',
      });

      expect(result.status).toBe('granted');
      expect(Permissions.Camera.requestAsync).not.toHaveBeenCalled();
    });
  });

  describe('requestMultiplePermissions', () => {
    it('should request multiple permissions', async () => {
      const mockStatus = Permissions.PermissionStatus.GRANTED;
      (Permissions.Camera.getAsync as jest.Mock).mockResolvedValue({ status: mockStatus });
      (Permissions.Camera.requestAsync as jest.Mock).mockResolvedValue({ status: mockStatus });
      (Permissions.Microphone.getAsync as jest.Mock).mockResolvedValue({ status: mockStatus });
      (Permissions.Microphone.requestAsync as jest.Mock).mockResolvedValue({ status: mockStatus });

      const requests = [
        { type: 'camera' as const, title: 'Camera', message: 'Need camera' },
        { type: 'microphone' as const, title: 'Microphone', message: 'Need microphone' },
      ];

      const results = await permissionService.requestMultiplePermissions(requests);

      expect(results.size).toBe(2);
      expect(results.get('camera')?.status).toBe('granted');
      expect(results.get('microphone')?.status).toBe('granted');
    });
  });

  describe('resetPermissionTracking', () => {
    it('should reset specific permission tracking', async () => {
      const mockStatus = Permissions.PermissionStatus.DENIED;
      (Permissions.Camera.getAsync as jest.Mock).mockResolvedValue({ status: mockStatus });
      (Permissions.Camera.requestAsync as jest.Mock).mockResolvedValue({ status: mockStatus });

      const request = {
        type: 'camera' as const,
        title: 'Camera Access',
        message: 'App needs camera access',
      };

      // Request once to increment count
      await permissionService.requestPermission(request);

      // Reset tracking
      permissionService.resetPermissionTracking('camera');

      // Should allow requesting again
      const result = await permissionService.requestPermission(request);
      expect(result.canAskAgain).toBe(true);
    });

    it('should reset all permission tracking', async () => {
      const mockStatus = Permissions.PermissionStatus.DENIED;
      (Permissions.Camera.getAsync as jest.Mock).mockResolvedValue({ status: mockStatus });
      (Permissions.Camera.requestAsync as jest.Mock).mockResolvedValue({ status: mockStatus });

      const request = {
        type: 'camera' as const,
        title: 'Camera Access',
        message: 'App needs camera access',
      };

      await permissionService.requestPermission(request);
      permissionService.resetPermissionTracking();

      expect(permissionService.getRequestedPermissions().length).toBe(0);
    });
  });

  describe('getPermissionRequestCount', () => {
    it('should return correct permission request count', async () => {
      const mockStatus = Permissions.PermissionStatus.DENIED;
      (Permissions.Camera.getAsync as jest.Mock).mockResolvedValue({ status: mockStatus });
      (Permissions.Camera.requestAsync as jest.Mock).mockResolvedValue({ status: mockStatus });

      const request = {
        type: 'camera' as const,
        title: 'Camera Access',
        message: 'App needs camera access',
      };

      await permissionService.requestPermission(request);
      await permissionService.requestPermission(request);

      const count = permissionService.getPermissionRequestCount('camera');
      expect(count).toBe(2);
    });
  });
});
