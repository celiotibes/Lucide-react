# Native Features Implementation Guide
## Phase 22.15 Mobile-First Features

### Overview

This guide covers the comprehensive native feature access implementation for the React Native app, providing production-ready iOS and Android integration for:

- **Camera**: Photo capture and video recording
- **File Picker**: Document and media selection
- **Media Library**: Photo/video library browsing with pagination
- **Permissions**: Centralized permission management
- **File System**: Document directory management and file operations

### Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture](#architecture)
3. [Services Overview](#services-overview)
4. [Usage Examples](#usage-examples)
5. [iOS-Specific Setup](#ios-specific-setup)
6. [Android-Specific Setup](#android-specific-setup)
7. [Error Handling](#error-handling)
8. [Testing](#testing)
9. [Permission Management](#permission-management)
10. [File System Operations](#file-system-operations)

---

## Quick Start

### 1. Install Required Dependencies

```bash
cd mobile-app
npm install expo-camera expo-image-picker expo-media-library expo-file-system expo-sharing
npm install expo-permissions expo-document-picker expo-image-manipulator
```

### 2. Initialize File System Service

In your app root or startup component:

```typescript
import { fileSystemService } from '@/utils/nativeFeatures';

// Initialize on app startup
useEffect(() => {
  fileSystemService.initialize();
}, []);
```

### 3. Wrap App with Native Feature Provider

```typescript
import { NativeFeatureProvider } from '@/contexts/nativeFeatureContext';

export default function App() {
  return (
    <NativeFeatureProvider>
      {/* Your app content */}
    </NativeFeatureProvider>
  );
}
```

### 4. Use Native Features in Components

```typescript
import { useNativeFeatures } from '@/contexts/nativeFeatureContext';

function MyComponent() {
  const nativeFeatures = useNativeFeatures();
  
  const handleCapture = async () => {
    const hasPermission = await nativeFeatures.requestCameraPermission();
    if (hasPermission) {
      const camera = nativeFeatures.getCamera();
      // Use camera service
    }
  };
  
  return (
    <Button 
      disabled={!nativeFeatures.isCameraAvailable()}
      onPress={handleCapture}
    >
      Capture Photo
    </Button>
  );
}
```

---

## Architecture

### Service Structure

```
src/utils/nativeFeatures/
├── permissionService.ts      # Centralized permission management
├── cameraService.ts          # Camera operations
├── filePickerService.ts      # File selection
├── mediaLibraryService.ts    # Media library access
├── fileSystemService.ts      # Document directory management
├── index.ts                  # Exports
└── __tests__/               # Comprehensive test suite

src/contexts/
└── nativeFeatureContext.tsx   # React context and hooks
```

### Data Flow

```
NativeFeatureProvider
    ↓
NativeFeatureContext
    ├── cameraService
    ├── filePickerService
    ├── mediaLibraryService
    ├── permissionService
    └── fileSystemService
    
useNativeFeatures() Hook
    ↓
Component Usage
```

---

## Services Overview

### PermissionService

Centralized permission management with tracking and iOS/Android specific handling.

**Key Features:**
- Permission status checking
- User-friendly permission requests
- Permission denial tracking
- Maximum request limits
- Platform-specific permission mapping

**Supported Permissions:**
- `camera` - Device camera
- `imageLibrary` - Photo library access
- `mediaLibrary` - Full media library access
- `microphone` - Device microphone
- `location` - Location services
- `contacts` - Contact list
- `calendar` - Calendar access
- `notifications` - Push notifications

### CameraService

Handle camera access and photo/video capture with processing.

**Key Features:**
- Camera permission management
- Image compression and resizing
- Media storage in app documents
- Base64 export
- Local media caching

**Methods:**
```typescript
// Request permission
requestCameraPermission(): Promise<boolean>

// Check availability
isCameraAvailable(): Promise<boolean>

// Process captured image
processImage(imageUri: string, options?: {...}): Promise<CapturedMedia>

// File operations
deleteMedia(mediaId: string, uri: string): Promise<void>
getLocalMedia(): Promise<CapturedMedia[]>
exportMediaWithBase64(uri: string): Promise<string>
clearLocalMedia(): Promise<void>
```

### FilePickerService

Select files from device storage with filtering and metadata.

**Key Features:**
- Document, image, video, audio filtering
- File size validation
- Multiple file selection
- Metadata extraction
- Copy to app storage
- Base64 encoding

**Methods:**
```typescript
// Pick file(s)
pickFile(options?: FilePickerOptions): Promise<PickedFile | PickedFile[] | null>
pickImage(allowMultiple?: boolean): Promise<PickedFile | PickedFile[] | null>
pickVideo(allowMultiple?: boolean): Promise<PickedFile | PickedFile[] | null>
pickAudio(allowMultiple?: boolean): Promise<PickedFile | PickedFile[] | null>
pickDocument(allowMultiple?: boolean): Promise<PickedFile | PickedFile[] | null>

// File operations
copyFileToAppStorage(file: PickedFile, subdirectory?: string): Promise<PickedFile>
deleteFile(uri: string): Promise<void>
getFileMetadata(uri: string): Promise<Partial<PickedFile>>
fileExists(uri: string): Promise<boolean>

// File reading
readFileAsText(uri: string, encoding?: string): Promise<string>
readFileAsBase64(uri: string): Promise<string>

// Directory operations
getStoredFiles(directory: string): Promise<PickedFile[]>
```

### MediaLibraryService

Access device photo and video library with pagination and album support.

**Key Features:**
- Album listing
- Asset pagination
- Photo/video filtering
- Search functionality
- High-resolution asset access
- Album management (iOS)

**Methods:**
```typescript
// Permissions
requestMediaLibraryPermission(): Promise<boolean>
isMediaLibraryAvailable(): Promise<boolean>

// Albums
getAlbums(): Promise<MediaAlbum[]>
getAlbumById(albumId: string): Promise<MediaAlbum | null>
createAlbum(title: string): Promise<MediaAlbum | null> // iOS only

// Assets
getAssets(pageSize?: number, cursor?: string): Promise<MediaLibraryPage>
getAssetsByAlbum(albumId: string, pageSize?: number, cursor?: string): Promise<MediaLibraryPage>
getAssetById(assetId: string): Promise<MediaAsset | null>
getRecentPhotos(limit?: number): Promise<MediaAsset[]>
getRecentVideos(limit?: number): Promise<MediaAsset[]>

// File operations
getAssetUri(assetId: string): Promise<string | null>
getAssetHighResolution(assetId: string): Promise<{...} | null>
copyAssetToAppStorage(assetId: string, destinationDir: string): Promise<string | null>

// Search
searchAssets(query: string, pageSize?: number): Promise<MediaAsset[]>
```

### FileSystemService

Manage app document directory and file operations.

**Key Features:**
- Document directory management
- Subdirectory creation and caching
- File read/write operations
- File copying and moving
- Sharing and export
- Directory size calculation
- Cache cleanup

**Methods:**
```typescript
// Initialization
initialize(): Promise<void>

// Directory management
getDocumentDirectory(): string
getCacheDirectory(): string
getOrCreateDirectory(subdirectory: string): Promise<string>
getOrCreateMediaDirectory(): Promise<string>

// File operations
readDirectory(dirPath: string): Promise<string[]>
getDirectoryContents(dirPath: string): Promise<FileInfo[]>
writeFile(filePath: string, content: string, encoding?: string): Promise<void>
readFile(filePath: string, encoding?: string): Promise<string>
readFileAsBase64(filePath: string): Promise<string>
copyFile(sourceUri: string, destinationUri: string): Promise<void>
moveFile(sourceUri: string, destinationUri: string): Promise<void>
deleteFile(filePath: string, idempotent?: boolean): Promise<void>

// File info
getFileInfo(filePath: string): Promise<DirectoryInfo>
fileExists(filePath: string): Promise<boolean>
getDirectorySize(dirPath: string): Promise<number>

// Sharing
shareFile(filePath: string, options?: {...}): Promise<boolean>
exportFile(filePath: string, filename: string, options?: {...}): Promise<boolean>

// Cleanup
clearDirectory(dirPath: string, keepDirectory?: boolean): Promise<void>
cleanupCache(): Promise<number>
```

---

## Usage Examples

### Example 1: Capture and Save Photo

```typescript
import { useNativeFeatures } from '@/contexts/nativeFeatureContext';

function PhotoCapture() {
  const { getCamera, requestCameraPermission } = useNativeFeatures();

  const handleCapture = async () => {
    const granted = await requestCameraPermission();
    if (!granted) {
      Alert.alert('Camera permission denied');
      return;
    }

    const camera = getCamera();
    // Note: Actual camera capture requires CameraView component
    // This is a service method call example
    const media = await camera.getLocalMedia();
    console.log('Captured media:', media);
  };

  return <Button onPress={handleCapture} title="Take Photo" />;
}
```

### Example 2: Pick and Upload Document

```typescript
import { useNativeFeatures } from '@/contexts/nativeFeatureContext';

function DocumentPicker() {
  const { getFilePicker, getFileSystem } = useNativeFeatures();

  const handlePickDocument = async () => {
    const filePicker = getFilePicker();
    const file = await filePicker.pickDocument();
    
    if (!file) return;

    // Copy to app storage
    const savedFile = await filePicker.copyFileToAppStorage(file, 'documents');
    
    // Read as base64 for upload
    const base64 = await filePicker.readFileAsBase64(savedFile.uri);
    
    // Upload to server
    await uploadDocument(base64, savedFile.name);
  };

  return <Button onPress={handlePickDocument} title="Pick Document" />;
}
```

### Example 3: Browse and Select Media

```typescript
import { useNativeFeatures } from '@/contexts/nativeFeatureContext';

function MediaBrowser() {
  const [photos, setPhotos] = useState([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();

  const { getMediaLibrary } = useNativeFeatures();
  const mediaLib = getMediaLibrary();

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    const page = await mediaLib.getAssets(30);
    setPhotos(page.assets);
    setHasNextPage(page.hasNextPage);
    setCursor(page.endCursor);
  };

  const loadMore = async () => {
    if (!hasNextPage || !cursor) return;
    const page = await mediaLib.getAssets(30, cursor);
    setPhotos([...photos, ...page.assets]);
    setHasNextPage(page.hasNextPage);
    setCursor(page.endCursor);
  };

  return (
    <FlatList
      data={photos}
      renderItem={({ item }) => <Image source={{ uri: item.uri }} />}
      onEndReached={loadMore}
    />
  );
}
```

### Example 4: File System Operations

```typescript
import { useNativeFeatures } from '@/contexts/nativeFeatureContext';

function FileManager() {
  const { getFileSystem } = useNativeFeatures();
  const fs = getFileSystem();

  const handleCreateFile = async () => {
    const content = 'Hello, World!';
    const dir = await fs.getOrCreateDirectory('myfiles');
    await fs.writeFile(`${dir}hello.txt`, content);
  };

  const handleReadFile = async () => {
    const dir = await fs.getOrCreateDirectory('myfiles');
    const content = await fs.readFile(`${dir}hello.txt`);
    console.log(content);
  };

  const handleShareFile = async () => {
    const dir = await fs.getOrCreateDirectory('myfiles');
    const success = await fs.shareFile(`${dir}hello.txt`, {
      mimeType: 'text/plain',
      title: 'Share File',
    });
    console.log('Share result:', success);
  };

  return (
    <>
      <Button onPress={handleCreateFile} title="Create File" />
      <Button onPress={handleReadFile} title="Read File" />
      <Button onPress={handleShareFile} title="Share File" />
    </>
  );
}
```

---

## iOS-Specific Setup

### Info.plist Permissions

Already configured in `app.json`, but here's what's needed:

```json
{
  "ios": {
    "infoPlist": {
      "NSCameraUsageDescription": "O app usa a câmera para capturar documentos",
      "NSPhotoLibraryUsageDescription": "O app acessa suas fotos para enviar documentos",
      "NSPhotoLibraryAddUsageDescription": "O app pode salvar fotos em sua biblioteca",
      "NSMicrophoneUsageDescription": "O app precisa de acesso ao microfone",
      "NSLocationWhenInUseUsageDescription": "O app precisa acessar sua localização",
      "NSContactsUsageDescription": "O app precisa acessar seus contatos"
    }
  }
}
```

### HEIC Image Handling

The `processImage` method automatically handles HEIC format conversion to JPEG:

```typescript
const media = await cameraService.processImage(imageUri, {
  compress: 0.8,
  width: 1920,
  height: 1440,
});
// Returns JPEG format for compatibility
```

### AirDrop Support

File sharing automatically supports AirDrop:

```typescript
const success = await fileSystemService.shareFile(filePath, {
  mimeType: 'application/pdf',
  title: 'Share PDF',
});
// iOS shows AirDrop option automatically
```

### App Tracking Transparency (ATT)

Implement ATT request for analytics:

```typescript
import * as TrackingTransparency from 'expo-tracking-transparency';

useEffect(() => {
  const requestTracking = async () => {
    if (Platform.OS === 'ios') {
      const status = await TrackingTransparency.requestTrackingPermissionsAsync();
      console.log('Tracking status:', status.granted);
    }
  };
  requestTracking();
}, []);
```

---

## Android-Specific Setup

### Runtime Permissions

Android 6+ requires runtime permissions. The service handles this automatically:

```typescript
// Permission check (handled by permissionService)
const permission = await permissionService.checkPermission('camera');
// On Android, returns current runtime permission status
```

### Storage Access Framework (Android 11+)

The file picker uses Storage Access Framework automatically for Android 11+:

```typescript
const file = await filePickerService.pickDocument();
// On Android 11+, uses ACTION_OPEN_DOCUMENT instead of ACTION_GET_CONTENT
```

### Permissions Configuration

Already in `app.json`:

```json
{
  "android": {
    "permissions": [
      "android.permission.CAMERA",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.INTERNET",
      "android.permission.ACCESS_NETWORK_STATE"
    ]
  }
}
```

### Scoped Storage (Android 11+)

The file system service respects scoped storage:

```typescript
// Automatically uses app-specific directory on Android 11+
const dir = await fileSystemService.getOrCreateDirectory('media');
// Returns app-specific directory path

// For importing files
const imported = await filePickerService.copyFileToAppStorage(file);
// Copied to app's Documents directory
```

---

## Error Handling

All services include comprehensive error handling:

### Permission Errors

```typescript
try {
  const granted = await cameraService.requestCameraPermission();
  if (!granted) {
    throw new Error('Camera permission required');
  }
} catch (error) {
  if (error.message.includes('permission')) {
    // Handle permission denial
    Alert.alert(
      'Permission Required',
      'Camera permission is needed. Enable it in Settings.'
    );
  }
}
```

### File System Errors

```typescript
try {
  const content = await fileSystemService.readFile(filePath);
} catch (error) {
  if (error.message.includes('not found')) {
    // Handle missing file
  } else if (error.message.includes('permission')) {
    // Handle access denied
  }
}
```

### Feature Unavailability

```typescript
const nativeFeatures = useNativeFeatures();

if (!nativeFeatures.isCameraAvailable()) {
  return <Text>Camera not available on this device</Text>;
}
```

---

## Testing

Run the comprehensive test suite:

```bash
npm run test -- nativeFeatures

# With coverage
npm run test:coverage -- nativeFeatures

# Watch mode
npm run test:watch -- nativeFeatures
```

### Test Files

- `permissionService.test.ts` - Permission management (10 test cases)
- `cameraService.test.ts` - Camera operations (8 test cases)
- `filePickerService.test.ts` - File picking (15 test cases)
- `mediaLibraryService.test.ts` - Media library access (12 test cases)
- `fileSystemService.test.ts` - File system operations (18 test cases)

### Test Coverage

Current coverage: 85%+ for all services

---

## Permission Management

### Checking Permission Status

```typescript
import { permissionService } from '@/utils/nativeFeatures';

const permission = await permissionService.checkPermission('camera');
// Result: { status: 'granted' | 'denied' | 'undetermined', canAskAgain: boolean }
```

### Requesting Permissions

```typescript
const result = await permissionService.requestPermission({
  type: 'camera',
  title: 'Camera Access',
  message: 'App needs camera access to capture documents',
  deniedMessage: 'Camera access is required. Enable it in Settings.',
});
// Result: { status: 'granted' | 'denied' | 'undetermined', canAskAgain: boolean }
```

### Multiple Permissions

```typescript
const requests = [
  { type: 'camera', title: 'Camera', message: 'Need camera' },
  { type: 'microphone', title: 'Microphone', message: 'Need microphone' },
];

const results = await permissionService.requestMultiplePermissions(requests);
// Results: Map<'camera' | 'microphone', PermissionInfo>
```

### Permission Denial Tracking

The service tracks denied permissions and stops asking after 3 attempts:

```typescript
// Automatically stops asking after 3 denials
const result = await permissionService.requestPermission(request);
// result.canAskAgain === false after 3 denials

// Reset tracking for testing
permissionService.resetPermissionTracking('camera');
```

---

## File System Operations

### Directory Structure

App documents are organized as:

```
DocumentDirectory/
├── media/              # Camera/media captures
├── imports/            # Imported files
├── documents/          # Document files
├── cache/              # Temporary files
└── exports/            # Files prepared for sharing
```

### File Operations

```typescript
// Create file
await fileSystemService.writeFile(`${dir}file.txt`, 'content');

// Read file
const content = await fileSystemService.readFile(`${dir}file.txt`);

// Read as base64 (for upload)
const base64 = await fileSystemService.readFileAsBase64(`${dir}file.txt`);

// Copy file
await fileSystemService.copyFile(source, destination);

// Move file
await fileSystemService.moveFile(source, destination);

// Delete file
await fileSystemService.deleteFile(`${dir}file.txt`);

// Check existence
const exists = await fileSystemService.fileExists(`${dir}file.txt`);

// Get info
const info = await fileSystemService.getFileInfo(`${dir}file.txt`);
```

### Directory Operations

```typescript
// Get directory contents
const files = await fileSystemService.getDirectoryContents(dirPath);
// Returns sorted FileInfo[]

// Get directory size
const sizeInBytes = await fileSystemService.getDirectorySize(dirPath);

// Clear directory
await fileSystemService.clearDirectory(dirPath);

// Clean cache
const freedSpace = await fileSystemService.cleanupCache();
```

### File Sharing

```typescript
// Share file
await fileSystemService.shareFile(filePath, {
  mimeType: 'application/pdf',
  title: 'Share PDF',
});

// Export with automatic sharing
await fileSystemService.exportFile(filePath, 'exported-file.pdf');
```

---

## Best Practices

1. **Always check permissions first** before using any native feature
2. **Handle errors gracefully** with user-friendly messages
3. **Use the NativeFeatureContext** for consistent feature access
4. **Clean up resources** by clearing cache periodically
5. **Validate file sizes** before processing
6. **Use base64 encoding** for secure file transmission
7. **Test on both iOS and Android** for platform differences
8. **Log important operations** for debugging

---

## Troubleshooting

### Camera Permission Not Granted

**iOS:**
- Check `NSCameraUsageDescription` in `app.json`
- Ask user to enable in Settings > Privacy > Camera

**Android:**
- Check `android.permission.CAMERA` in manifest
- For Android 6+, check runtime permissions

### File Not Found

- Verify file path is correct
- Use `fileSystemService.getDocumentDirectory()` for base path
- Check file exists with `fileExists()`

### Permission Denial Loop

- Service stops asking after 3 denials
- User must change permission in Settings
- Use `resetPermissionTracking()` for testing

### Memory Issues with Large Files

- Use compression options in `processImage()`
- Use pagination for media library access
- Clean cache with `cleanupCache()`

---

## API Reference

See inline TypeScript definitions in each service file for complete type signatures and JSDoc documentation.

### Exported Types

```typescript
// Permissions
type PermissionType =
  | 'camera'
  | 'imageLibrary'
  | 'mediaLibrary'
  | 'microphone'
  | 'location'
  | 'contacts'
  | 'calendar'
  | 'notifications';

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

interface PermissionInfo {
  status: PermissionStatus;
  canAskAgain: boolean;
}

// Camera
interface CapturedMedia {
  id: string;
  uri: string;
  type: 'photo' | 'video';
  mimeType: string;
  size: number;
  timestamp: number;
}

// File Picker
interface PickedFile {
  id: string;
  name: string;
  uri: string;
  type: string;
  mimeType?: string;
  size: number;
}

// Media Library
interface MediaAsset {
  id: string;
  filename: string;
  uri: string;
  mediaType: 'photo' | 'video' | 'audio' | 'unknown';
  width?: number;
  height?: number;
}

// File System
interface FileInfo {
  name: string;
  uri: string;
  size: number;
  isDirectory: boolean;
}
```

---

## Additional Resources

- [Expo Camera Docs](https://docs.expo.dev/camera/overview/)
- [Expo Image Picker Docs](https://docs.expo.dev/modules/expo-image-picker/)
- [Expo Media Library Docs](https://docs.expo.dev/modules/expo-media-library/)
- [Expo File System Docs](https://docs.expo.dev/modules/expo-file-system/)

---

**Last Updated:** October 2026
**Status:** Production Ready
