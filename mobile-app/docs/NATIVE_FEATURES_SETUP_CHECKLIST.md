# Native Features Setup Checklist
## Phase 22.15 Mobile-First Features

This checklist ensures proper implementation of native feature access for iOS and Android.

---

## Pre-Implementation Checklist

- [ ] Review the [Native Features Guide](./NATIVE_FEATURES_GUIDE.md)
- [ ] Understand the architecture and service structure
- [ ] Review existing codebase patterns and conventions
- [ ] Plan feature requirements for your app

---

## Installation & Configuration

### Step 1: Install Dependencies

```bash
cd mobile-app
npm install expo-camera expo-image-picker expo-media-library
npm install expo-file-system expo-sharing expo-document-picker
npm install expo-image-manipulator expo-permissions
```

- [ ] All Expo modules installed successfully
- [ ] `package.json` updated with new dependencies
- [ ] No dependency conflicts

### Step 2: Update app.json

Verify the following plugins are configured:

```json
{
  "plugins": [
    ["expo-image-picker", {...}],
    ["expo-build-properties", {...}]
  ]
}
```

- [ ] `expo-image-picker` plugin configured
- [ ] Camera/photo permissions in plugin config
- [ ] `expo-build-properties` configured
- [ ] Android SDK version: 24+
- [ ] iOS Hermes enabled (optional but recommended)

### Step 3: iOS Configuration

Check `app.json` ios section:

```json
{
  "ios": {
    "infoPlist": {
      "NSCameraUsageDescription": "...",
      "NSPhotoLibraryUsageDescription": "...",
      "NSMicrophoneUsageDescription": "...",
      "NSLocationWhenInUseUsageDescription": "..."
    }
  }
}
```

- [ ] NSCameraUsageDescription added
- [ ] NSPhotoLibraryUsageDescription added
- [ ] NSPhotoLibraryAddUsageDescription added (optional)
- [ ] NSMicrophoneUsageDescription added (if using microphone)
- [ ] NSLocationWhenInUseUsageDescription added (if using location)
- [ ] All descriptions in user's language
- [ ] Privacy entitlements configured

### Step 4: Android Configuration

Check `app.json` android section:

```json
{
  "android": {
    "permissions": [
      "android.permission.CAMERA",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.INTERNET"
    ]
  }
}
```

- [ ] CAMERA permission added
- [ ] READ_EXTERNAL_STORAGE permission added
- [ ] WRITE_EXTERNAL_STORAGE permission added
- [ ] ACCESS_NETWORK_STATE permission added
- [ ] INTERNET permission added
- [ ] Minimum SDK version: 24
- [ ] Target SDK version: 34+

---

## Implementation Checklist

### Step 5: Create Directory Structure

Create the required directories:

```bash
mkdir -p src/utils/nativeFeatures
mkdir -p src/contexts
mkdir -p src/utils/nativeFeatures/__tests__
mkdir -p docs
```

- [ ] `src/utils/nativeFeatures/` created
- [ ] `src/contexts/` created
- [ ] `__tests__/` subdirectories created
- [ ] `docs/` directory created

### Step 6: Copy Service Files

Copy all service files from the implementation:

- [ ] `permissionService.ts`
- [ ] `cameraService.ts`
- [ ] `filePickerService.ts`
- [ ] `mediaLibraryService.ts`
- [ ] `fileSystemService.ts`
- [ ] `index.ts` (exports)

### Step 7: Copy Context File

- [ ] `nativeFeatureContext.tsx` copied to `src/contexts/`
- [ ] Imports updated for your project
- [ ] No import errors

### Step 8: Copy Test Files

- [ ] All test files in `__tests__/` subdirectory
- [ ] `jest.config.js` compatible with tests
- [ ] Test mocks properly configured

---

## Integration Checklist

### Step 9: Setup in Root Component

```typescript
// In App.tsx or root component
import { NativeFeatureProvider } from '@/contexts/nativeFeatureContext';
import { fileSystemService } from '@/utils/nativeFeatures';

export default function App() {
  useEffect(() => {
    fileSystemService.initialize();
  }, []);

  return (
    <NativeFeatureProvider>
      {/* Your app */}
    </NativeFeatureProvider>
  );
}
```

- [ ] NativeFeatureProvider wraps app
- [ ] fileSystemService.initialize() called on startup
- [ ] No TypeScript errors
- [ ] App starts without errors

### Step 10: Test in Components

Create a test screen:

```typescript
import { useNativeFeatures } from '@/contexts/nativeFeatureContext';

function NativeFeaturesTestScreen() {
  const features = useNativeFeatures();
  
  return (
    <View>
      <Text>Camera: {features.isCameraAvailable() ? 'Available' : 'N/A'}</Text>
      <Text>File Library: {features.isFileLibraryAvailable() ? 'Available' : 'N/A'}</Text>
      <Text>Media Library: {features.isMediaLibraryAvailable() ? 'Available' : 'N/A'}</Text>
    </View>
  );
}
```

- [ ] Context imports successfully
- [ ] useNativeFeatures hook works
- [ ] Feature availability checks work
- [ ] No runtime errors

---

## Testing Checklist

### Step 11: Run Unit Tests

```bash
npm run test -- nativeFeatures

# With coverage
npm run test:coverage -- nativeFeatures

# Watch mode
npm run test:watch -- nativeFeatures
```

- [ ] All tests pass
- [ ] Coverage above 80%
- [ ] No test failures
- [ ] Mock setup correct

### Step 12: Test Permissions

```typescript
// Test each permission type
const result = await permissionService.requestPermission({
  type: 'camera',
  title: 'Test Camera',
  message: 'Testing camera permission',
});

console.log('Camera permission:', result);
```

- [ ] Camera permission request works
- [ ] File library permission works
- [ ] Media library permission works
- [ ] Microphone permission works (if applicable)
- [ ] Permission status correctly tracked
- [ ] Denial count increments correctly

### Step 13: Test Camera Service

- [ ] Camera availability check works
- [ ] Permission request flows correctly
- [ ] Image processing works
- [ ] Local media caching works
- [ ] Media deletion works
- [ ] Base64 export works

### Step 14: Test File Picker

- [ ] File picker opens correctly
- [ ] File selection works
- [ ] Permission handling works
- [ ] File size validation works
- [ ] Multiple file selection works
- [ ] File copying to app storage works
- [ ] File metadata extraction works
- [ ] Base64 encoding works

### Step 15: Test Media Library

- [ ] Album listing works
- [ ] Asset pagination works
- [ ] Photo filtering works
- [ ] Video filtering works
- [ ] Search functionality works
- [ ] High-resolution asset access works
- [ ] Album management works (iOS)

### Step 16: Test File System

- [ ] Directory creation works
- [ ] File writing works
- [ ] File reading works
- [ ] File copying works
- [ ] File deletion works
- [ ] File sharing works
- [ ] Directory size calculation works
- [ ] Cache cleanup works

---

## Platform-Specific Testing

### Step 17: iOS Testing

```bash
npm run ios
```

- [ ] App builds successfully
- [ ] Camera permission prompt appears
- [ ] Photo library permission prompt appears
- [ ] File picker opens correctly
- [ ] Sharing works (AirDrop option visible)
- [ ] HEIC images converted to JPEG
- [ ] Album management works
- [ ] No console errors

### Step 18: Android Testing

```bash
npm run android
```

- [ ] App builds successfully
- [ ] Camera permission prompt appears
- [ ] File picker uses Storage Access Framework (Android 11+)
- [ ] Files saved to correct directory
- [ ] Scoped storage respected
- [ ] Permission denial tracking works
- [ ] No console errors

---

## Deployment Checklist

### Step 19: Code Review

- [ ] All code follows project conventions
- [ ] TypeScript types correct
- [ ] No `any` types (except where necessary)
- [ ] Error handling comprehensive
- [ ] Logging appropriate
- [ ] Comments clear and helpful

### Step 20: Documentation

- [ ] Setup guide complete
- [ ] API reference accurate
- [ ] Usage examples tested
- [ ] Troubleshooting section helpful
- [ ] iOS-specific notes clear
- [ ] Android-specific notes clear

### Step 21: Security Review

- [ ] No hardcoded secrets
- [ ] Permissions handled correctly
- [ ] File operations secure
- [ ] Base64 encoding secure
- [ ] No local storage of sensitive data
- [ ] Error messages don't expose paths

### Step 22: Performance

- [ ] Image compression working
- [ ] Pagination implemented correctly
- [ ] Cache cleanup scheduled
- [ ] No memory leaks detected
- [ ] Large files handled correctly
- [ ] Battery usage acceptable

---

## Final Verification

### Step 23: Feature Completeness

- [ ] All required services implemented
- [ ] All required methods work
- [ ] Error handling complete
- [ ] Platform-specific logic correct
- [ ] Context provider functional
- [ ] Hook interface correct

### Step 24: Build & Distribution

```bash
# Android
npm run build:android

# iOS (requires Mac)
npm run ios
```

- [ ] Android build succeeds
- [ ] iOS build succeeds (on Mac)
- [ ] No build warnings
- [ ] App installs on test devices
- [ ] All features work on devices

### Step 25: Documentation Review

- [ ] Setup guide reviewed
- [ ] API reference complete
- [ ] Examples tested
- [ ] Troubleshooting verified
- [ ] Best practices documented
- [ ] Additional resources linked

---

## Maintenance Checklist

### Step 26: Version Management

- [ ] Expo modules versions documented
- [ ] Breaking changes tracked
- [ ] Update schedule established
- [ ] Compatibility matrix maintained

### Step 27: Monitoring

- [ ] Analytics tracking feature usage
- [ ] Error reporting configured
- [ ] Permission denial tracking
- [ ] Performance metrics tracked

### Step 28: User Support

- [ ] FAQ updated
- [ ] Common issues documented
- [ ] Support channel established
- [ ] User guide created

---

## Post-Launch Checklist

- [ ] Monitor crash reports
- [ ] Track feature usage
- [ ] Gather user feedback
- [ ] Plan improvements
- [ ] Document learnings
- [ ] Update documentation as needed

---

## Sign-Off

**Implementation Date:** ________________

**Developer:** ________________

**Reviewer:** ________________

**QA Lead:** ________________

**Release Date:** ________________

---

## Notes

Use this section to document any deviations from the standard setup or special considerations:

```
_________________________________________________________________

_________________________________________________________________

_________________________________________________________________

_________________________________________________________________
```

---

**Last Updated:** October 2026
**Status:** Production Ready
