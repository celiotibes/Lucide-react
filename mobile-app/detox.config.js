module.exports = {
  apps: {
    ios: {
      type: 'ios.app',
      binaryPath: 'artifacts/build/Release-iphonesimulator/LucideReact.app',
      build: 'xcodebuild -workspace ios/LucideReact.xcworkspace -scheme LucideReact -configuration Release -derivedDataPath artifacts/build -quiet',
    },
    android: {
      type: 'android.emu',
      binaryPath: 'artifacts/build/app-release.apk',
      build: 'cd android && ./gradlew assembleRelease -DtestBuildType=release -quiet && cd ..',
    },
  },
  testRunner: 'jest',
  configurations: {
    'ios.sim.debug': {
      device: {
        type: 'ios.simulator',
        device: {
          type: 'iPhone 15 Pro',
        },
      },
      app: 'ios',
    },
    'ios.sim.release': {
      device: {
        type: 'ios.simulator',
        device: {
          type: 'iPhone 15 Pro',
        },
      },
      app: 'ios',
    },
    'android.emu.debug': {
      device: {
        type: 'android.emu',
        device: {
          avdName: 'Pixel_4_API_30',
        },
      },
      app: 'android',
    },
    'android.emu.release': {
      device: {
        type: 'android.emu',
        device: {
          avdName: 'Pixel_4_API_30',
        },
      },
      app: 'android',
    },
  },
  testRunner: 'jest',
  runnerConfig: 'artifacts/config.json',
  apps: {
    ios: {
      type: 'ios.app',
      binaryPath: 'artifacts/ios/LucideReact.app',
      build: 'xcodebuild -workspace ios/LucideReact.xcworkspace -scheme LucideReact -configuration Release -derivedDataPath artifacts -quiet -UseModernBuildSystem=YES',
    },
    android: {
      type: 'android.emu',
      binaryPath: 'artifacts/android/app-release.apk',
      build: 'cd android && ./gradlew assembleRelease -DtestBuildType=release && cd ..',
    },
  },
};
