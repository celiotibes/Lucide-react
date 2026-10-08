# Navigation Integration Guide - Phase 22.8

## Overview

This document provides guidance on using the new navigation structure implemented in Phase 22.8.

## New Screens

### 1. CaptureDocumentScreen
**Route**: `Documents -> CaptureDocument`
**Purpose**: Capture documents from camera or gallery with real-time preview and processing

**Usage**:
```typescript
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type NavigationProp = NativeStackNavigationProp<any, any>;

export const MyComponent = () => {
  const navigation = useNavigation<NavigationProp>();
  
  const handleCapture = () => {
    navigation.navigate('CaptureDocument' as any);
  };
  
  return <Button onPress={handleCapture}>Capture</Button>;
};
```

**Features**:
- Camera capture with preview
- Gallery selection
- Real-time document processing (OCR, parsing)
- Progress tracking
- Success/error states
- Automatic document type detection

### 2. ReprocessDocumentScreen
**Route**: `Documents -> ReprocessDocument { documentId }`
**Purpose**: Re-analyze existing documents to improve OCR accuracy

**Usage**:
```typescript
const handleReprocess = (documentId: string) => {
  navigation.navigate('ReprocessDocument', { documentId });
};
```

**Features**:
- Re-run OCR analysis
- Compare old vs new confidence scores
- Highlight improvements
- Update document with better results

### 3. ConflictResolutionScreen
**Route**: `Documents -> ConflictResolution { conflictId }`
**Purpose**: Resolve sync conflicts between local and remote data

**Usage**:
```typescript
const handleResolveConflict = (conflictId: string) => {
  navigation.navigate('ConflictResolution', { conflictId });
};
```

**Features**:
- Display conflicting data
- Side-by-side comparison
- Resolution options:
  - Keep local version
  - Keep remote version
  - Merge both versions

### 4. SyncDetailsScreen
**Route**: `Documents -> SyncDetails`
**Purpose**: View detailed sync status, history, and statistics

**Usage**:
```typescript
const handleViewSyncDetails = () => {
  navigation.navigate('SyncDetails' as any);
};
```

**Features**:
- Sync statistics and summary
- Success rate tracking
- Last sync time
- Pending items count
- Complete sync history log
- Manual sync trigger
- Detailed error information

## Navigation Helpers

### Using Navigation Routes

```typescript
import { navigationRoutes } from '@/navigation/navigationUtils';

// Navigate to document detail
navigation.navigate(navigationRoutes.documentDetail('doc-123'));

// Navigate to capture
navigation.navigate(navigationRoutes.captureDocument());

// Navigate to sync details
navigation.navigate(navigationRoutes.syncDetails());
```

### Navigation Guards

```typescript
import { navigationGuards } from '@/navigation/navigationUtils';

// Check if user can access documents
if (navigationGuards.canAccessDocuments(isAuth, apiEndpoint)) {
  navigation.navigate(navigationRoutes.documentsList());
}
```

## Deep Linking

Deep links are configured with the following patterns:

```
app://documents                    -> Documents List
app://documents/:id                -> Document Detail
app://documents/capture            -> Capture Document
app://documents/:id/reprocess      -> Reprocess Document
app://documents/conflicts/:id      -> Conflict Resolution
app://sync/details                 -> Sync Details
```

## Header Configuration

### Network Status Indicator
Located at the top of the app to show network connectivity status.

```typescript
import { NetworkStatusIndicator } from '@/components/NetworkStatusIndicator';

// Used in MainNavigator
<NetworkStatusIndicator />
```

### Sync Status Indicator
Located in the header of main screens to show sync activity.

```typescript
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';

// Used in screen options
options={{
  headerRight: () => <SyncStatusIndicator />,
}}
```

## Navigation Flow Examples

### Example 1: Document Capture Flow
```
Documents List (FAB) 
  → Capture Document (camera/gallery)
    → Processing state
      → Success → View Detail
                  → Back to List
```

### Example 2: Sync Conflict Resolution
```
Documents List (auto-detect conflict)
  → Conflict Resolution
    → Compare versions
      → Choose resolution option
        → Resolve
          → Back to List
```

### Example 3: Document Reprocessing
```
Document Detail (menu)
  → Reprocess Document
    → Show comparison
      → Compare results
        → Success
          → View updated detail
```

### Example 4: Offline → Sync Flow
```
Offline: Capture Document
  → Document stored locally
  → Online: Auto-sync triggers
    → Sync Details shows progress
      → Sync complete
        → Document shows sync status
```

## Type Safety

All screens are fully typed with TypeScript. Routes are defined in `src/types/navigation.ts`:

```typescript
export type DocumentsStackParamList = {
  DocumentsList: undefined;
  DocumentDetail: { documentId: string };
  CaptureDocument: undefined;
  ReprocessDocument: { documentId: string };
  ConflictResolution: { conflictId: string };
  SyncDetails: undefined;
};
```

## Best Practices

1. **Always use type-safe navigation**:
   ```typescript
   // ✓ Good
   navigation.navigate('DocumentDetail', { documentId: '123' });
   
   // ✗ Avoid
   navigation.navigate('DocumentDetail' as any, { wrongParam: '123' });
   ```

2. **Use navigation helpers**:
   ```typescript
   // ✓ Good
   navigation.navigate(navigationRoutes.documentDetail('123'));
   
   // ✗ Less clear
   navigation.navigate('Documents', { screen: 'DocumentDetail', params: { documentId: '123' } });
   ```

3. **Handle back navigation properly**:
   - CaptureDocument: Can pop to list or view detail
   - ReprocessDocument: Should update document detail
   - ConflictResolution: Should pop after resolution
   - SyncDetails: Simple pop behavior

4. **Screen transitions**:
   - Use `animationEnabled: true` for user-initiated navigation
   - Use `animationEnabled: false` only for auth state changes
   - Modal-style screens should have appropriate animations

5. **Component integration**:
   - Always import screens from `/screens` index files
   - Use navigation component from `@react-navigation/native`
   - Check screen options for header configuration

## Troubleshooting

### Issue: "Cannot navigate to undefined route"
**Solution**: Verify route name is defined in `DocumentsStackParamList`

### Issue: Type errors with navigation params
**Solution**: Ensure params match the type definition exactly

### Issue: Deep link not working
**Solution**: Check if URL pattern matches `linking` configuration in `navigationUtils.ts`

### Issue: Screen not showing header
**Solution**: Verify `DocumentsStackNavigator` is used instead of direct screen component

## Future Enhancements

1. Add animated transitions for smooth UX
2. Implement navigation state persistence
3. Add breadcrumb navigation for nested routes
4. Create custom header components
5. Add gesture-based navigation swipe-back
6. Implement screen-specific bottom sheets
7. Add tab-specific FAB buttons with more actions
