# Mobile Services - Phase 22.20.5

This directory contains essential services for mobile app functionality including push notifications, offline synchronization, and camera operations.

## Services Overview

### PushNotificationService

Manages push notifications for both iOS and Android platforms.

**File:** `push-notifications.ts`

**Initialization:**
```typescript
import { pushNotificationService } from '@/services/push-notifications';

// In your app initialization
useEffect(() => {
  pushNotificationService.initialize();
}, []);
```

**Sending Notifications:**
```typescript
import { pushNotificationService } from '@/services/push-notifications';

// Send anomaly alert
await pushNotificationService.sendNotification({
  id: 'alert-1',
  title: 'Anomaly Detected',
  body: 'Unusual transaction amount detected',
  type: 'anomaly',
  data: {
    anomalyId: 'anom-123',
    priority: 'high',
    timestamp: new Date().toISOString()
  }
});
```

**Notification Types:**
1. **anomaly** - Security and compliance alerts
2. **document-expiry** - Document expiration reminders
3. **transaction-approval** - Pending transaction approvals
4. **sync-complete** - Sync operation completion

**Listening to Events:**
```typescript
// Listen for sent notifications
const unsubscribe = pushNotificationService.on('notification:sent', (notification) => {
  console.log('Notification sent:', notification);
});

// Clean up
unsubscribe();
```

**Badge Management:**
```typescript
// Set badge count (iOS & Android)
pushNotificationService.setBadgeCount(5);

// Get current count
const count = await pushNotificationService.getBadgeCount();

// Clear all notifications
await pushNotificationService.clearAllNotifications();
```

**Scheduling Notifications:**
```typescript
// Schedule notification for later
const notificationId = await pushNotificationService.scheduleNotification(
  notification,
  5000 // 5 seconds
);

// Cancel scheduled notification
await pushNotificationService.cancelNotification(notificationId);
```

**Platform-Specific Setup:**
- **iOS:** Configure APNs certificates in Apple Developer Console
- **Android:** Set up FCM (Firebase Cloud Messaging) project

---

### OfflineSyncService

Manages offline operations and synchronization when connectivity is restored.

**File:** `OfflineSyncService.ts`

**Initialization:**
```typescript
import { OfflineSyncService } from '@/services/OfflineSyncService';

// Get database instance
const { db } = useDatabase();

// Create service
const syncService = new OfflineSyncService(db);
await syncService.initialize();
```

**Queueing Operations:**
```typescript
// Queue a transaction creation
await syncService.queueOperation(
  'create',
  'transaction',
  'trans-123',
  {
    description: 'Monthly rent payment',
    amount: 3000,
    category: 'Aluguel',
    date: '2024-10-01'
  }
);

// Queue a property update
await syncService.queueOperation(
  'update',
  'property',
  'prop-456',
  {
    name: 'Updated Property Name',
    occupancyRate: 85
  }
);

// Queue a document deletion
await syncService.queueOperation(
  'delete',
  'document',
  'doc-789',
  {}
);
```

**Sync State Management:**
```typescript
// Get current sync state
const state = await syncService.getSyncState();
console.log({
  isOnline: state.isOnline,
  isSyncing: state.isSyncing,
  pendingOperations: state.pendingOperations,
  lastSyncTime: state.lastSyncTime
});

// Manually trigger sync
const result = await syncService.syncPendingOperations();
console.log(`Synced: ${result.succeeded}, Failed: ${result.failed}`);
```

**Network Status Management:**
```typescript
import { NetInfo } from '@react-native-community/net-info';

// Monitor network status
const unsubscribe = NetInfo.addEventListener(state => {
  syncService.setOnlineStatus(state.isConnected || false);
});

// Manual status update
syncService.setOnlineStatus(true); // Now online
syncService.setOnlineStatus(false); // Now offline
```

**Operation Management:**
```typescript
// Get operation status
const operation = await syncService.getOperationStatus('operation-id');

// Retry a failed operation
await syncService.retryOperation('failed-operation-id');

// Delete an operation from queue
await syncService.deleteOperation('operation-id');

// Clear all pending operations
await syncService.clearPendingOperations();
```

**Event Listeners:**
```typescript
// Listen to sync events
syncService.on('sync:started', () => {
  console.log('Sync started');
});

syncService.on('sync:completed', (result) => {
  console.log(`Sync completed: ${result.succeeded} succeeded, ${result.failed} failed`);
});

syncService.on('sync:operation-complete', ({ id, success }) => {
  console.log(`Operation ${id} complete: ${success ? 'success' : 'failed'}`);
});

syncService.on('network:status-changed', ({ isOnline }) => {
  console.log(`Network status: ${isOnline ? 'online' : 'offline'}`);
});

syncService.on('queue:operation-added', (operation) => {
  console.log('Operation queued:', operation.id);
});
```

**Architecture:**
```
Operation Flow:
1. User performs action (create/update/delete)
2. OfflineSyncService queues operation
3. If online: Immediately sync to server
4. If offline: Store locally in SyncQueue
5. When online: Retry all pending operations
6. Emit events for UI updates
```

---

### CameraService

Handles camera operations including photo and video capture.

**File:** `CameraService.ts`

**Permission Management:**
```typescript
import { CameraService } from '@/services/CameraService';

// Request permissions
const hasPermission = await CameraService.requestPermissions();

// Check current permissions
const permissions = await CameraService.checkPermissions();
console.log({
  granted: permissions.granted,
  ios: permissions.ios,
  android: permissions.android
});
```

**Taking Photos:**
```typescript
import { useRef } from 'react';

export const ReceiptCaptureScreen = () => {
  const cameraRef = useRef(null);

  const handleCapture = async () => {
    const photo = await CameraService.takePicture(cameraRef.current);
    console.log({
      uri: photo.uri,
      width: photo.width,
      height: photo.height,
      base64: photo.base64
    });
  };

  return (
    <View>
      <Camera ref={cameraRef} />
      <Button title="Capture" onPress={handleCapture} />
    </View>
  );
};
```

**Video Capture:**
```typescript
// Record video for 10 seconds
const video = await CameraService.captureVideo(cameraRef.current, 10000);
console.log('Video saved at:', video.uri);
```

**Camera Controls:**
```typescript
// Get available cameras
const cameras = await CameraService.getAvailableCameras();
// Returns: [{ type: 'back', name: 'Back Camera' }, { type: 'front', name: 'Front Camera' }]

// Flip camera (front to back or vice versa)
CameraService.flipCamera(cameraRef.current);

// Set zoom level (0 to 1)
CameraService.setZoom(cameraRef.current, 0.5);

// Set flash mode
CameraService.setFlashMode(cameraRef.current, 'on' | 'off' | 'auto');

// Set focus mode
CameraService.setFocusMode(cameraRef.current, 'on' | 'off' | 'auto');
```

**Camera Info:**
```typescript
const info = await CameraService.getCameraInfo();
console.log({
  supportsFlash: info.supportsFlash,
  supportsZoom: info.supportsZoom,
  maxZoom: info.maxZoom,
  availableCameras: info.availableCameras
});
```

**Cleanup:**
```typescript
// Release camera resources when done
useEffect(() => {
  return () => {
    CameraService.release();
  };
}, []);
```

---

## Integration Example

Here's how these services work together in a receipt capture flow:

```typescript
import React, { useRef, useEffect } from 'react';
import { View, Button } from 'react-native';
import { CameraService } from '@/services/CameraService';
import { OfflineSyncService } from '@/services/OfflineSyncService';
import { pushNotificationService } from '@/services/push-notifications';
import { useDatabase } from '@/database';

export const ReceiptCaptureFlow = () => {
  const { db } = useDatabase();
  const cameraRef = useRef(null);
  const [syncService] = useState(() => new OfflineSyncService(db));

  useEffect(() => {
    // Initialize services
    const init = async () => {
      await pushNotificationService.initialize();
      await syncService.initialize();
    };
    init();
  }, []);

  const handleCapture = async () => {
    try {
      // 1. Capture photo with camera
      const photo = await CameraService.takePicture(cameraRef.current);

      // 2. Queue the receipt operation (works offline)
      await syncService.queueOperation(
        'create',
        'receipt',
        Date.now().toString(),
        {
          photoUri: photo.uri,
          timestamp: new Date().toISOString(),
          type: 'receipt'
        }
      );

      // 3. If online, sync immediately
      if (syncService.getSyncState().isOnline) {
        const result = await syncService.syncPendingOperations();
        
        // 4. Send notification when done
        if (result.succeeded > 0) {
          await pushNotificationService.sendNotification({
            id: 'receipt-' + Date.now(),
            title: 'Recibo Capturado',
            body: 'Seu recibo foi processado com sucesso',
            type: 'sync-complete',
            data: {
              priority: 'low',
              timestamp: new Date().toISOString()
            }
          });
        }
      }
    } catch (error) {
      console.error('Error capturing receipt:', error);
      
      // Send error notification
      await pushNotificationService.sendNotification({
        id: 'error-' + Date.now(),
        title: 'Erro ao Capturar',
        body: error instanceof Error ? error.message : 'Erro desconhecido',
        type: 'anomaly',
        data: {
          priority: 'high',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  return (
    <View>
      <Camera ref={cameraRef} />
      <Button title="Capture Receipt" onPress={handleCapture} />
    </View>
  );
};
```

---

## Testing

Services include comprehensive tests:
- `push-notifications.test.ts` - Notification service tests
- `offline-sync.test.ts` - Sync service tests

Run tests:
```bash
npm run test -- mobile-app/src/services/__tests__/
```

---

## Performance Considerations

1. **Sync Queue:** Limited to reasonable operation counts (1000+)
2. **Memory:** Operations cleaned up after 30 days
3. **Network:** Automatic backoff on retry failures
4. **Notifications:** Batch processing for multiple notifications

---

## Platform Requirements

### iOS Requirements
- iOS 12.0+
- Camera permissions in Info.plist
- APNs certificates configured
- UserNotifications framework

### Android Requirements
- Android 8.0+
- Camera permissions in AndroidManifest.xml
- FCM credentials configured
- Firebase Cloud Messaging setup

---

## Error Handling

All services include comprehensive error handling:
```typescript
try {
  await syncService.syncPendingOperations();
} catch (error) {
  console.error('Sync failed:', error);
  // Error is stored in operation's lastError field
  // Can be retried later
}
```

---

## Migration from Phase 22.20.4

Services in this phase are backward compatible with Phase 22.20.4:
- Existing sync logic preserved
- New offline queue layer added
- Push notifications as optional enhancement

---

## Related Files

- Database Models: `mobile-app/src/database/models/`
- Database Repositories: `mobile-app/src/database/repositories/`
- Screens: `mobile-app/src/screens/`
- Tests: `mobile-app/src/services/__tests__/`

---

## Support

For issues or questions:
1. Check test files for examples
2. Review Phase 22.20.5 implementation docs
3. Check component screen implementations
