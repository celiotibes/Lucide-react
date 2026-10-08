/**
 * Detox Configuration for E2E Testing
 * Configures test runners, simulators, and build settings for iOS and Android
 */

module.exports = {
  testRunner: 'jest',
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
  configurations: {
    'ios.sim.debug': {
      device: {
        type: 'ios.simulator',
        device: {
          type: 'iPhone 15 Pro',
        },
      },
      app: 'ios',
      testRunner: 'jest',
    },
    'ios.sim.release': {
      device: {
        type: 'ios.simulator',
        device: {
          type: 'iPhone 15 Pro',
        },
      },
      app: 'ios',
      testRunner: 'jest',
    },
    'android.emu.debug': {
      device: {
        type: 'android.emu',
        device: {
          avdName: 'Pixel_4_API_30',
        },
      },
      app: 'android',
      testRunner: 'jest',
    },
    'android.emu.release': {
      device: {
        type: 'android.emu',
        device: {
          avdName: 'Pixel_4_API_30',
        },
      },
      app: 'android',
      testRunner: 'jest',
    },
  },
};
