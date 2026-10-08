/**
 * Native Feature Context
 * Provides device feature availability and platform-specific handling
 * Phase 22.15 Mobile-First Features
 */

import React, { createContext, useCallback, useEffect, useReducer } from 'react';
import { Platform } from 'react-native';
import { logger } from '@/utils/logger';
import { cameraService } from '@/utils/nativeFeatures/cameraService';
import { filePickerService } from '@/utils/nativeFeatures/filePickerService';
import { mediaLibraryService } from '@/utils/nativeFeatures/mediaLibraryService';
import { permissionService, PermissionStatus } from '@/utils/nativeFeatures/permissionService';
import { fileSystemService } from '@/utils/nativeFeatures/fileSystemService';

export type NativeFeature = 'camera' | 'fileLibrary' | 'mediaLibrary' | 'microphone' | 'location';

export interface NativeFeatureStatus {
  available: boolean;
  permissionStatus: PermissionStatus;
  lastChecked: number;
}

export interface NativeFeatureState {
  platform: 'ios' | 'android' | 'web';
  features: {
    camera: NativeFeatureStatus;
    fileLibrary: NativeFeatureStatus;
    mediaLibrary: NativeFeatureStatus;
    microphone: NativeFeatureStatus;
    location: NativeFeatureStatus;
  };
  initialized: boolean;
  loading: boolean;
}

export interface NativeFeatureContextType extends NativeFeatureState {
  // Feature checks
  isCameraAvailable: () => boolean;
  isFileLibraryAvailable: () => boolean;
  isMediaLibraryAvailable: () => boolean;
  isMicrophoneAvailable: () => boolean;
  isLocationAvailable: () => boolean;

  // Permission requests
  requestCameraPermission: () => Promise<boolean>;
  requestFileLibraryPermission: () => Promise<boolean>;
  requestMediaLibraryPermission: () => Promise<boolean>;
  requestMicrophonePermission: () => Promise<boolean>;
  requestLocationPermission: () => Promise<boolean>;

  // Services
  getCamera: () => typeof cameraService;
  getFilePicker: () => typeof filePickerService;
  getMediaLibrary: () => typeof mediaLibraryService;
  getFileSystem: () => typeof fileSystemService;

  // Platform-specific helpers
  getPlatformName: () => string;
  isIOS: () => boolean;
  isAndroid: () => boolean;
}

type NativeFeatureAction =
  | { type: 'SET_INITIALIZED'; payload: Partial<NativeFeatureState> }
  | { type: 'UPDATE_FEATURE_STATUS'; payload: { feature: NativeFeature; status: NativeFeatureStatus } }
  | { type: 'SET_LOADING'; payload: boolean };

const initialState: NativeFeatureState = {
  platform: (Platform.OS as any) || 'android',
  features: {
    camera: { available: false, permissionStatus: 'undetermined', lastChecked: 0 },
    fileLibrary: { available: false, permissionStatus: 'undetermined', lastChecked: 0 },
    mediaLibrary: { available: false, permissionStatus: 'undetermined', lastChecked: 0 },
    microphone: { available: false, permissionStatus: 'undetermined', lastChecked: 0 },
    location: { available: false, permissionStatus: 'undetermined', lastChecked: 0 },
  },
  initialized: false,
  loading: true,
};

function nativeFeatureReducer(state: NativeFeatureState, action: NativeFeatureAction): NativeFeatureState {
  switch (action.type) {
    case 'SET_INITIALIZED':
      return {
        ...state,
        ...action.payload,
        initialized: true,
      };
    case 'UPDATE_FEATURE_STATUS':
      return {
        ...state,
        features: {
          ...state.features,
          [action.payload.feature]: action.payload.status,
        },
      };
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      };
    default:
      return state;
  }
}

export const NativeFeatureContext = createContext<NativeFeatureContextType | undefined>(undefined);

export interface NativeFeatureProviderProps {
  children: React.ReactNode;
}

export const NativeFeatureProvider: React.FC<NativeFeatureProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(nativeFeatureReducer, initialState);

  // Initialize services and check feature availability
  useEffect(() => {
    const initializeFeatures = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });

        logger.info('[NativeFeatureProvider] Initializing native features for platform:', state.platform);

        // Initialize file system service
        await fileSystemService.initialize();

        // Check each feature's availability
        const features: Partial<NativeFeatureState['features']> = {};

        // Camera
        const cameraPermission = await permissionService.checkPermission('camera');
        features.camera = {
          available: true,
          permissionStatus: cameraPermission.status,
          lastChecked: Date.now(),
        };

        // File library
        const fileLibraryPermission = await permissionService.checkPermission('imageLibrary');
        features.fileLibrary = {
          available: true,
          permissionStatus: fileLibraryPermission.status,
          lastChecked: Date.now(),
        };

        // Media library
        const mediaLibraryPermission = await permissionService.checkPermission('mediaLibrary');
        features.mediaLibrary = {
          available: true,
          permissionStatus: mediaLibraryPermission.status,
          lastChecked: Date.now(),
        };

        // Microphone
        const microphonePermission = await permissionService.checkPermission('microphone');
        features.microphone = {
          available: true,
          permissionStatus: microphonePermission.status,
          lastChecked: Date.now(),
        };

        // Location
        const locationPermission = await permissionService.checkPermission('location');
        features.location = {
          available: true,
          permissionStatus: locationPermission.status,
          lastChecked: Date.now(),
        };

        dispatch({
          type: 'SET_INITIALIZED',
          payload: {
            features: features as NativeFeatureState['features'],
          },
        });

        logger.info('[NativeFeatureProvider] Native features initialized');
      } catch (error) {
        logger.error('[NativeFeatureProvider] Error initializing native features:', error);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    initializeFeatures();
  }, [state.platform]);

  // Feature availability checks
  const isCameraAvailable = useCallback(() => {
    return state.features.camera.available && state.features.camera.permissionStatus === 'granted';
  }, [state.features.camera]);

  const isFileLibraryAvailable = useCallback(() => {
    return (
      state.features.fileLibrary.available &&
      state.features.fileLibrary.permissionStatus === 'granted'
    );
  }, [state.features.fileLibrary]);

  const isMediaLibraryAvailable = useCallback(() => {
    return (
      state.features.mediaLibrary.available &&
      state.features.mediaLibrary.permissionStatus === 'granted'
    );
  }, [state.features.mediaLibrary]);

  const isMicrophoneAvailable = useCallback(() => {
    return state.features.microphone.available && state.features.microphone.permissionStatus === 'granted';
  }, [state.features.microphone]);

  const isLocationAvailable = useCallback(() => {
    return state.features.location.available && state.features.location.permissionStatus === 'granted';
  }, [state.features.location]);

  // Permission request handlers
  const requestCameraPermission = useCallback(async () => {
    try {
      const granted = await cameraService.requestCameraPermission();
      if (granted) {
        dispatch({
          type: 'UPDATE_FEATURE_STATUS',
          payload: {
            feature: 'camera',
            status: {
              available: true,
              permissionStatus: 'granted',
              lastChecked: Date.now(),
            },
          },
        });
      }
      return granted;
    } catch (error) {
      logger.error('[NativeFeatureProvider] Error requesting camera permission:', error);
      return false;
    }
  }, []);

  const requestFileLibraryPermission = useCallback(async () => {
    try {
      const granted = await permissionService.requestPermission({
        type: 'imageLibrary',
        title: 'File Access',
        message: 'This app needs access to your files',
      });
      if (granted.status === 'granted') {
        dispatch({
          type: 'UPDATE_FEATURE_STATUS',
          payload: {
            feature: 'fileLibrary',
            status: {
              available: true,
              permissionStatus: 'granted',
              lastChecked: Date.now(),
            },
          },
        });
      }
      return granted.status === 'granted';
    } catch (error) {
      logger.error('[NativeFeatureProvider] Error requesting file library permission:', error);
      return false;
    }
  }, []);

  const requestMediaLibraryPermission = useCallback(async () => {
    try {
      const granted = await mediaLibraryService.requestMediaLibraryPermission();
      if (granted) {
        dispatch({
          type: 'UPDATE_FEATURE_STATUS',
          payload: {
            feature: 'mediaLibrary',
            status: {
              available: true,
              permissionStatus: 'granted',
              lastChecked: Date.now(),
            },
          },
        });
      }
      return granted;
    } catch (error) {
      logger.error('[NativeFeatureProvider] Error requesting media library permission:', error);
      return false;
    }
  }, []);

  const requestMicrophonePermission = useCallback(async () => {
    try {
      const granted = await permissionService.requestPermission({
        type: 'microphone',
        title: 'Microphone Access',
        message: 'This app needs access to your microphone',
      });
      if (granted.status === 'granted') {
        dispatch({
          type: 'UPDATE_FEATURE_STATUS',
          payload: {
            feature: 'microphone',
            status: {
              available: true,
              permissionStatus: 'granted',
              lastChecked: Date.now(),
            },
          },
        });
      }
      return granted.status === 'granted';
    } catch (error) {
      logger.error('[NativeFeatureProvider] Error requesting microphone permission:', error);
      return false;
    }
  }, []);

  const requestLocationPermission = useCallback(async () => {
    try {
      const granted = await permissionService.requestPermission({
        type: 'location',
        title: 'Location Access',
        message: 'This app needs access to your location',
      });
      if (granted.status === 'granted') {
        dispatch({
          type: 'UPDATE_FEATURE_STATUS',
          payload: {
            feature: 'location',
            status: {
              available: true,
              permissionStatus: 'granted',
              lastChecked: Date.now(),
            },
          },
        });
      }
      return granted.status === 'granted';
    } catch (error) {
      logger.error('[NativeFeatureProvider] Error requesting location permission:', error);
      return false;
    }
  }, []);

  // Service getters
  const getCamera = useCallback(() => cameraService, []);
  const getFilePicker = useCallback(() => filePickerService, []);
  const getMediaLibrary = useCallback(() => mediaLibraryService, []);
  const getFileSystem = useCallback(() => fileSystemService, []);

  // Platform helpers
  const getPlatformName = useCallback(() => {
    switch (state.platform) {
      case 'ios':
        return 'iOS';
      case 'android':
        return 'Android';
      default:
        return 'Web';
    }
  }, [state.platform]);

  const isIOS = useCallback(() => state.platform === 'ios', [state.platform]);
  const isAndroid = useCallback(() => state.platform === 'android', [state.platform]);

  const value: NativeFeatureContextType = {
    ...state,
    isCameraAvailable,
    isFileLibraryAvailable,
    isMediaLibraryAvailable,
    isMicrophoneAvailable,
    isLocationAvailable,
    requestCameraPermission,
    requestFileLibraryPermission,
    requestMediaLibraryPermission,
    requestMicrophonePermission,
    requestLocationPermission,
    getCamera,
    getFilePicker,
    getMediaLibrary,
    getFileSystem,
    getPlatformName,
    isIOS,
    isAndroid,
  };

  return <NativeFeatureContext.Provider value={value}>{children}</NativeFeatureContext.Provider>;
};

/**
 * Hook to use native feature context
 */
export const useNativeFeatures = (): NativeFeatureContextType => {
  const context = React.useContext(NativeFeatureContext);
  if (!context) {
    throw new Error('useNativeFeatures must be used within a NativeFeatureProvider');
  }
  return context;
};
