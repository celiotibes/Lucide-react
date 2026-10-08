import { Platform } from 'react-native';

export interface CameraPhoto {
  uri: string;
  width: number;
  height: number;
  base64?: string;
  exif?: any;
}

export interface CameraPermissions {
  granted: boolean;
  ios?: {
    permission: 'granted' | 'denied' | 'undetermined';
  };
  android?: {
    permission: 'granted' | 'denied' | 'undetermined';
  };
}

class CameraService {
  private hasPermission = false;
  private cameraRef: any = null;

  /**
   * Request camera permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      // In a real app, would use react-native-permissions
      // This is a mock implementation
      console.log('Requesting camera permissions...');
      this.hasPermission = true;
      return true;
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      return false;
    }
  }

  /**
   * Check if camera permissions are granted
   */
  async checkPermissions(): Promise<CameraPermissions> {
    try {
      if (Platform.OS === 'ios') {
        return {
          granted: this.hasPermission,
          ios: {
            permission: this.hasPermission ? 'granted' : 'undetermined'
          }
        };
      } else {
        return {
          granted: this.hasPermission,
          android: {
            permission: this.hasPermission ? 'granted' : 'undetermined'
          }
        };
      }
    } catch (error) {
      console.error('Error checking camera permissions:', error);
      return { granted: false };
    }
  }

  /**
   * Take a photo
   */
  async takePicture(cameraRef: any): Promise<CameraPhoto> {
    try {
      if (!this.hasPermission) {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) {
          throw new Error('Camera permission not granted');
        }
      }

      // In a real app, would use expo-camera or react-native-camera
      // This is a mock implementation
      const photo: CameraPhoto = {
        uri: `file:///photo_${Date.now()}.jpg`,
        width: 1080,
        height: 1920,
      };

      console.log('Photo captured:', photo.uri);
      return photo;
    } catch (error) {
      console.error('Error taking picture:', error);
      throw error;
    }
  }

  /**
   * Capture video
   */
  async captureVideo(cameraRef: any, durationMs: number = 5000): Promise<{ uri: string }> {
    try {
      if (!this.hasPermission) {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) {
          throw new Error('Camera permission not granted');
        }
      }

      // In a real app, would use expo-camera or react-native-camera
      const video = {
        uri: `file:///video_${Date.now()}.mp4`
      };

      console.log('Video captured:', video.uri);
      return video;
    } catch (error) {
      console.error('Error capturing video:', error);
      throw error;
    }
  }

  /**
   * Get available cameras
   */
  async getAvailableCameras(): Promise<Array<{ type: 'front' | 'back'; name: string }>> {
    try {
      return [
        { type: 'back', name: 'Back Camera' },
        { type: 'front', name: 'Front Camera' }
      ];
    } catch (error) {
      console.error('Error getting available cameras:', error);
      return [];
    }
  }

  /**
   * Flip camera
   */
  flipCamera(cameraRef: any): void {
    try {
      // In a real app, would flip the camera
      console.log('Camera flipped');
    } catch (error) {
      console.error('Error flipping camera:', error);
    }
  }

  /**
   * Zoom camera
   */
  setZoom(cameraRef: any, zoomLevel: number): void {
    try {
      if (zoomLevel < 0 || zoomLevel > 1) {
        throw new Error('Zoom level must be between 0 and 1');
      }
      console.log('Camera zoom set to:', zoomLevel);
    } catch (error) {
      console.error('Error setting zoom:', error);
    }
  }

  /**
   * Set flash mode
   */
  setFlashMode(
    cameraRef: any,
    mode: 'on' | 'off' | 'auto'
  ): void {
    try {
      console.log('Flash mode set to:', mode);
    } catch (error) {
      console.error('Error setting flash mode:', error);
    }
  }

  /**
   * Set focus mode
   */
  setFocusMode(
    cameraRef: any,
    mode: 'on' | 'off' | 'auto'
  ): void {
    try {
      console.log('Focus mode set to:', mode);
    } catch (error) {
      console.error('Error setting focus mode:', error);
    }
  }

  /**
   * Get camera info
   */
  async getCameraInfo(): Promise<{
    supportsFlash: boolean;
    supportsZoom: boolean;
    maxZoom: number;
    availableCameras: number;
  }> {
    try {
      return {
        supportsFlash: true,
        supportsZoom: true,
        maxZoom: 10,
        availableCameras: 2
      };
    } catch (error) {
      console.error('Error getting camera info:', error);
      return {
        supportsFlash: false,
        supportsZoom: false,
        maxZoom: 1,
        availableCameras: 0
      };
    }
  }

  /**
   * Release camera resources
   */
  async release(): Promise<void> {
    try {
      this.cameraRef = null;
      console.log('Camera resources released');
    } catch (error) {
      console.error('Error releasing camera:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const CameraService = new CameraService();
