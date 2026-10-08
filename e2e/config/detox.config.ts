/**
 * Advanced Detox Configuration for Mobile E2E Testing
 * Configured for iOS/Android with security, performance, and coverage tracking
 */

export const detoxConfig = {
  // Test runner configuration
  testRunner: 'jest',

  // Build configurations for both iOS and Android
  apps: {
    ios: {
      type: 'ios.app',
      binaryPath: 'artifacts/ios/build/Build/Products/Release-iphonesimulator/crmt.app',
      build: 'xcodebuild -workspace ios/crmt.xcworkspace -scheme crmt -configuration Release -derivedDataPath artifacts/ios/build -quiet -UseModernBuildSystem=YES',
    },
    android: {
      type: 'android.apk',
      binaryPath: 'artifacts/android/app-release.apk',
      build: 'cd android && ./gradlew assembleRelease -DtestBuildType=release && cd ..',
    },
  },

  // Device configurations
  configurations: {
    // iOS Simulator - Debug
    'ios.sim.debug': {
      device: {
        type: 'ios.simulator',
        device: {
          type: 'iPhone 15 Pro',
          os: 'iOS',
        },
      },
      app: 'ios',
      testRunner: 'jest',
      artifacts: {
        rootDir: '.artifacts/ios.sim.debug',
        plugins: {
          screenshot: 'failing',
          video: 'failing',
          log: 'all',
          uiHierarchy: 'enabled',
        },
      },
    },

    // iOS Simulator - Release
    'ios.sim.release': {
      device: {
        type: 'ios.simulator',
        device: {
          type: 'iPhone 15 Pro',
          os: 'iOS',
        },
      },
      app: 'ios',
      testRunner: 'jest',
      artifacts: {
        rootDir: '.artifacts/ios.sim.release',
        plugins: {
          screenshot: 'failing',
          video: 'failing',
          log: 'all',
          uiHierarchy: 'enabled',
        },
      },
    },

    // Android Emulator - Debug
    'android.emu.debug': {
      device: {
        type: 'android.emu',
        device: {
          avdName: 'Pixel_6_API_33',
        },
      },
      app: 'android',
      testRunner: 'jest',
      artifacts: {
        rootDir: '.artifacts/android.emu.debug',
        plugins: {
          screenshot: 'failing',
          video: 'failing',
          log: 'all',
          uiHierarchy: 'enabled',
        },
      },
    },

    // Android Emulator - Release
    'android.emu.release': {
      device: {
        type: 'android.emu',
        device: {
          avdName: 'Pixel_6_API_33',
        },
      },
      app: 'android',
      testRunner: 'jest',
      artifacts: {
        rootDir: '.artifacts/android.emu.release',
        plugins: {
          screenshot: 'failing',
          video: 'failing',
          log: 'all',
          uiHierarchy: 'enabled',
        },
      },
    },
  },
};

export default detoxConfig;
