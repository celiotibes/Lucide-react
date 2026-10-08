/**
 * Permission Service
 * Centralized permission management for iOS/Android
 * Phase 22.15 Mobile-First Features
 */

import {
  Camera,
  FaceDetector,
  ImageLibrary,
  MediaLibrary,
  Microphone,
  Notifications,
  Contacts,
  Calendar,
  Location,
} from 'expo-permissions';
import * as Permissions from 'expo-permissions';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

export type PermissionType =
  | 'camera'
  | 'imageLibrary'
  | 'mediaLibrary'
  | 'microphone'
  | 'location'
  | 'contacts'
  | 'calendar'
  | 'notifications';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PermissionInfo {
  status: PermissionStatus;
  canAskAgain: boolean;
  shouldShowRationale?: boolean;
}

export interface PermissionRequest {
  type: PermissionType;
  title: string;
  message: string;
  deniedMessage?: string;
}

class PermissionService {
  private requestedPermissions: Set<PermissionType> = new Set();
  private permissionDeniedCount: Map<PermissionType, number> = new Map();
  private readonly MAX_PERMISSION_REQUESTS = 3;

  /**
   * Check if permission is granted
   */
  async checkPermission(permissionType: PermissionType): Promise<PermissionInfo> {
    try {
      const status = await this.getPermissionStatus(permissionType);
      const canAskAgain = this.shouldAskAgain(permissionType);

      logger.debug(`[PermissionService] Checked permission: ${permissionType}`, {
        status,
        canAskAgain,
      });

      return {
        status,
        canAskAgain,
      };
    } catch (error) {
      logger.error(`[PermissionService] Error checking permission: ${permissionType}`, error);
      return {
        status: 'undetermined',
        canAskAgain: true,
      };
    }
  }

  /**
   * Request permission from user
   */
  async requestPermission(request: PermissionRequest): Promise<PermissionInfo> {
    const { type, title, message } = request;

    try {
      // Check if already requested too many times
      const deniedCount = this.permissionDeniedCount.get(type) || 0;
      if (deniedCount >= this.MAX_PERMISSION_REQUESTS) {
        logger.warn(
          `[PermissionService] Permission "${type}" has been denied too many times (${deniedCount})`
        );
        return {
          status: 'denied',
          canAskAgain: false,
        };
      }

      // Check current status
      const currentStatus = await this.getPermissionStatus(type);
      if (currentStatus === 'granted') {
        logger.info(`[PermissionService] Permission "${type}" already granted`);
        return {
          status: 'granted',
          canAskAgain: true,
        };
      }

      // Request permission
      logger.info(`[PermissionService] Requesting permission: ${type}`);
      const status = await this.performPermissionRequest(type);

      // Track denied permissions
      if (status === 'denied') {
        this.permissionDeniedCount.set(type, deniedCount + 1);
      } else {
        this.permissionDeniedCount.set(type, 0);
        this.requestedPermissions.add(type);
      }

      logger.debug(`[PermissionService] Permission request result: ${type} = ${status}`);

      return {
        status,
        canAskAgain: deniedCount + 1 < this.MAX_PERMISSION_REQUESTS,
      };
    } catch (error) {
      logger.error(`[PermissionService] Error requesting permission: ${type}`, error);
      return {
        status: 'undetermined',
        canAskAgain: true,
      };
    }
  }

  /**
   * Request multiple permissions
   */
  async requestMultiplePermissions(requests: PermissionRequest[]): Promise<Map<string, PermissionInfo>> {
    const results = new Map<string, PermissionInfo>();

    for (const request of requests) {
      const result = await this.requestPermission(request);
      results.set(request.type, result);

      if (result.status === 'granted') {
        logger.info(`[PermissionService] Permission granted: ${request.type}`);
      } else {
        logger.warn(`[PermissionService] Permission denied: ${request.type}`);
      }
    }

    return results;
  }

  /**
   * Reset permission tracking for testing
   */
  resetPermissionTracking(permissionType?: PermissionType): void {
    if (permissionType) {
      this.permissionDeniedCount.delete(permissionType);
      this.requestedPermissions.delete(permissionType);
    } else {
      this.permissionDeniedCount.clear();
      this.requestedPermissions.clear();
    }
  }

  /**
   * Private: Get permission status using Expo APIs
   */
  private async getPermissionStatus(permissionType: PermissionType): Promise<PermissionStatus> {
    try {
      let permissionModule: any;

      switch (permissionType) {
        case 'camera':
          permissionModule = Camera;
          break;
        case 'imageLibrary':
        case 'mediaLibrary':
          permissionModule = ImageLibrary;
          break;
        case 'microphone':
          permissionModule = Microphone;
          break;
        case 'location':
          permissionModule = Location;
          break;
        case 'contacts':
          permissionModule = Contacts;
          break;
        case 'calendar':
          permissionModule = Calendar;
          break;
        case 'notifications':
          permissionModule = Notifications;
          break;
        default:
          throw new Error(`Unknown permission type: ${permissionType}`);
      }

      const { status } = await permissionModule.getAsync();

      // Map Expo permission status to our status type
      switch (status) {
        case Permissions.PermissionStatus.GRANTED:
          return 'granted';
        case Permissions.PermissionStatus.DENIED:
          return 'denied';
        case Permissions.PermissionStatus.UNDETERMINED:
        default:
          return 'undetermined';
      }
    } catch (error) {
      logger.error(`[PermissionService] Error getting status for ${permissionType}:`, error);
      return 'undetermined';
    }
  }

  /**
   * Private: Request permission using Expo APIs
   */
  private async performPermissionRequest(permissionType: PermissionType): Promise<PermissionStatus> {
    try {
      let permissionModule: any;

      switch (permissionType) {
        case 'camera':
          permissionModule = Camera;
          break;
        case 'imageLibrary':
        case 'mediaLibrary':
          permissionModule = ImageLibrary;
          break;
        case 'microphone':
          permissionModule = Microphone;
          break;
        case 'location':
          permissionModule = Location;
          break;
        case 'contacts':
          permissionModule = Contacts;
          break;
        case 'calendar':
          permissionModule = Calendar;
          break;
        case 'notifications':
          permissionModule = Notifications;
          break;
        default:
          throw new Error(`Unknown permission type: ${permissionType}`);
      }

      const { status } = await permissionModule.requestAsync();

      switch (status) {
        case Permissions.PermissionStatus.GRANTED:
          return 'granted';
        case Permissions.PermissionStatus.DENIED:
          return 'denied';
        case Permissions.PermissionStatus.UNDETERMINED:
        default:
          return 'undetermined';
      }
    } catch (error) {
      logger.error(`[PermissionService] Error requesting ${permissionType}:`, error);
      return 'undetermined';
    }
  }

  /**
   * Check if we should ask for permission again
   */
  private shouldAskAgain(permissionType: PermissionType): boolean {
    const deniedCount = this.permissionDeniedCount.get(permissionType) || 0;
    return deniedCount < this.MAX_PERMISSION_REQUESTS;
  }

  /**
   * Get all requested permissions
   */
  getRequestedPermissions(): PermissionType[] {
    return Array.from(this.requestedPermissions);
  }

  /**
   * Get permission request count for debugging
   */
  getPermissionRequestCount(permissionType: PermissionType): number {
    return this.permissionDeniedCount.get(permissionType) || 0;
  }
}

export const permissionService = new PermissionService();
