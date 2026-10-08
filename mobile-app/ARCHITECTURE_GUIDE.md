# CRMT Mobile App - Architecture Guide

## Table of Contents

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Data Flow Architecture](#data-flow-architecture)
4. [Offline-First Architecture](#offline-first-architecture)
5. [Sync Strategy](#sync-strategy)
6. [Security Architecture](#security-architecture)
7. [Layered Architecture](#layered-architecture)
8. [Component Interactions](#component-interactions)
9. [Performance Architecture](#performance-architecture)
10. [Deployment Architecture](#deployment-architecture)

---

## System Overview

The CRMT Mobile App is designed as an offline-first, data-driven mobile application that prioritizes user experience with reliable local data storage and intelligent background synchronization.

### Core Principles

1. **Offline-First**: Users can work without internet connectivity
2. **Real-Time Sync**: Data syncs intelligently when online
3. **Type-Safe**: Full TypeScript for compile-time safety
4. **Performance**: Optimized rendering and data loading
5. **Security**: Encryption at rest and in transit
6. **Scalability**: Architecture supports millions of documents

### Architecture Layers

```
┌─────────────────────────────────────────────────┐
│             UI Layer (React Components)          │
│        (Screens, Navigation, UX Elements)        │
└─────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────┐
│         State Management Layer (Zustand)         │
│    (Global App State, Observable Updates)        │
└─────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────┐
│           Business Logic Layer (Hooks)           │
│     (Queries, Mutations, Side Effects)           │
└─────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────┐
│       Service Layer (Services & API)             │
│   (Document Processing, Sync, Network)           │
└─────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────┐
│      Data Access Layer (Repositories)            │
│     (WatermelonDB, AsyncStorage, Caching)        │
└─────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────┐
│        Infrastructure Layer (APIs, Network)      │
│     (HTTP Client, File Storage, Device APIs)     │
└─────────────────────────────────────────────────┘
```

---

## High-Level Architecture

### Component Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   Mobile App (React Native)               │
│  ┌────────────────────────────────────────────────────┐   │
│  │   Presentation Layer                               │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │ Dashboard│  │Documents │  │Transact. │  ...   │   │
│  │  └──────────┘  └──────────┘  └──────────┘         │   │
│  └────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │   State Management (Zustand)                        │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │  Auth    │  │Documents │  │Transact. │  ...   │   │
│  │  └──────────┘  └──────────┘  └──────────┘         │   │
│  └────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │   Services Layer                                    │   │
│  │  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ OCR Service  │  │ Sync Manager │  ...          │   │
│  │  └──────────────┘  └──────────────┘               │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────┐
│                  Local Database                           │
│              (WatermelonDB SQLite)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Documents    │  │ Transactions │  │ Users        │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────┐
│                  Device Storage                           │
│   (Secure Store for Tokens, Files, Cache)                │
└──────────────────────────────────────────────────────────┘
                         ▼ (when online)
┌──────────────────────────────────────────────────────────┐
│              Backend API Server                           │
│         (REST API, Database, Authentication)             │
└──────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| UI Framework | React Native, Expo | Cross-platform mobile development |
| Navigation | React Navigation | App routing and screen management |
| UI Components | React Native Paper | Material Design 3 components |
| State Mgmt | Zustand | Lightweight state management |
| Local DB | WatermelonDB | Offline-first database |
| HTTP Client | Axios | API communication |
| Date Utils | date-fns | Date manipulation |
| UUID | uuid | Unique ID generation |
| Encryption | expo-secure-store | Secure token storage |
| File Storage | expo-file-system | Local file management |

---

## Data Flow Architecture

### Request/Response Flow

```
User Action
   ↓
Component Event Handler
   ↓
Call Hook (useDocuments, etc.)
   ↓
State Update (Zustand)
   ↓
Service Call (APIClient, ProcessorService)
   ↓
Internet Available?
   ├─ YES → API Request
   │   ↓
   │   Server Processing
   │   ↓
   │   Response
   │   ↓
   │   Store in WatermelonDB
   │   ↓
   │   Update State
   │   ↓
   │   Re-render Component
   │
   └─ NO → Store in Offline Queue
       ↓
       Queue stored in WatermelonDB
       ↓
       Return optimistic state update
       ↓
       When online: Process queue
```

### Example: Document Upload Flow

```
1. User selects photo from library
   ↓ (documentStore.addCapture)
2. Document saved to WatermelonDB with status: 'captured'
   ↓ (UI shows upload progress)
3. If online:
   ├─ POST /documents/upload
   ├─ Server processes OCR
   ├─ Returns extracted data
   └─ Update document status: 'processed'
4. If offline:
   ├─ Store in local queue
   ├─ Show "waiting to sync" badge
   └─ Sync when online
```

### Real-Time Updates Flow

```
Server Change
   ↓
Push Notification (Firebase Cloud Messaging)
   ↓
Notification Handler
   ↓
Refresh from API
   ↓
Update WatermelonDB
   ↓
Observable triggers Zustand update
   ↓
Connected components re-render
```

---

## Offline-First Architecture

### Offline-First Principles

1. **Store Locally First**: All data written to local DB immediately
2. **Optimistic Updates**: UI reflects changes before server confirmation
3. **Queue Operations**: Changes queued when offline
4. **Sync on Connection**: Automatic sync when online
5. **Conflict Resolution**: Server version takes precedence

### Local Database Schema

```
┌─────────────────────────────────────────┐
│         WatermelonDB (SQLite)            │
├─────────────────────────────────────────┤
│                                           │
│  ┌──────────────────────────────────┐   │
│  │ documents                         │   │
│  ├──────────────────────────────────┤   │
│  │ id (PK)                          │   │
│  │ fileName                         │   │
│  │ status (captured→processing→...) │   │
│  │ extractedData (JSON)             │   │
│  │ syncStatus (pending/synced)      │   │
│  │ _status (WDB sync marker)        │   │
│  │ _changed (WDB change marker)     │   │
│  └──────────────────────────────────┘   │
│                                           │
│  ┌──────────────────────────────────┐   │
│  │ transactions                      │   │
│  ├──────────────────────────────────┤   │
│  │ id (PK)                          │   │
│  │ amount                           │   │
│  │ category                         │   │
│  │ status (active/pending)          │   │
│  │ _status (WDB sync marker)        │   │
│  └──────────────────────────────────┘   │
│                                           │
│  ┌──────────────────────────────────┐   │
│  │ syncQueue (offline operations)    │   │
│  ├──────────────────────────────────┤   │
│  │ id (PK)                          │   │
│  │ action (POST/PUT/DELETE)         │   │
│  │ endpoint                         │   │
│  │ payload (JSON)                   │   │
│  │ retryCount                       │   │
│  │ createdAt                        │   │
│  └──────────────────────────────────┘   │
│                                           │
│  ┌──────────────────────────────────┐   │
│  │ syncConflicts (for review)        │   │
│  ├──────────────────────────────────┤   │
│  │ id (PK)                          │   │
│  │ resourceId                       │   │
│  │ resourceType                     │   │
│  │ localVersion (JSON)              │   │
│  │ serverVersion (JSON)             │   │
│  │ resolved (boolean)               │   │
│  └──────────────────────────────────┘   │
│                                           │
└─────────────────────────────────────────┘
```

### Offline Data Persistence

```
┌──────────────────────────────────────────────┐
│   Device Storage (Expo Secure Store)         │
├──────────────────────────────────────────────┤
│                                               │
│  authTokens                                   │
│    ├─ accessToken (expires in 1 hour)       │
│    └─ refreshToken (expires in 30 days)     │
│                                               │
│  userPreferences                              │
│    ├─ theme (light/dark)                    │
│    ├─ syncSettings                          │
│    └─ notificationPreferences                │
│                                               │
│  biometricEnabled (boolean)                   │
│                                               │
└──────────────────────────────────────────────┘
```

---

## Sync Strategy

### Sync Phases

```
PHASE 1: Initialize Connection
├─ Detect network connectivity
├─ Retrieve pending changes from queue
└─ Check if sync is needed

PHASE 2: Upload Local Changes
├─ Process offline queue (FIFO)
├─ Send POST/PUT/DELETE requests
├─ Handle individual failures gracefully
└─ Update record sync status

PHASE 3: Pull Server Changes
├─ Fetch updated records since last sync
├─ Compare timestamps
├─ Identify conflicts
└─ Store conflicts for review

PHASE 4: Merge Changes
├─ For non-conflicting records: merge
├─ For conflicting records:
│   ├─ Server version takes precedence
│   ├─ Local version moved to draft
│   └─ Notify user of conflict
└─ Update local database

PHASE 5: Cleanup
├─ Remove processed queue items
├─ Clear processed notifications
├─ Update last sync timestamp
└─ Emit sync completed event
```

### Sync State Machine

```
                        [START]
                           ↓
                    ┌──────────────┐
                    │ Check Online?│
                    └──┬───────┬───┘
                       │       │
                      YES     NO
                       │       │
                       ↓       └────────────────┐
                 [SYNCING]                      │
                       ↓                        │
            ┌──────────────────┐               │
            │ Upload Changes   │               │
            └──┬───────┬───────┘               │
               │       │                       │
            SUCCESS   FAIL                     │
               │       │                       │
               ↓       ↓                       │
        [PULL_CHANGES][QUEUED]                │
               ↓                               │
        ┌──────────────┐                      │
        │ Pull Updates │                      │
        └──┬───────┬───┘                      │
           │       │                          │
        SUCCESS   FAIL                        │
           │       │                          │
           ↓       ↓                          │
     [MERGE_SYNC][QUEUED]                    │
           ↓                                  │
    ┌──────────────┐                         │
    │ Merge Conflicts?                       │
    └──┬──────┬────┘                         │
       │      │                              │
      YES    NO                              │
       │      │                              │
       ↓      └──┐                           │
   [NOTIFY]      └──────────────┬────────────┘
       ↓                        │
    (user reviews)              ↓
       │              ┌──────────────────┐
       └──────────────→│ Complete Sync   │
                      └────────┬─────────┘
                               ↓
                          [COMPLETED]
```

### Conflict Resolution Rules

When conflicts occur (both client and server modified same record):

```
Rule 1: Timestamp Comparison
├─ If server.updatedAt > local.updatedAt
│  └─ Use server version
├─ If local.updatedAt > server.updatedAt
│  └─ Use local version (unlikely case)
└─ If equal timestamps
   └─ Use server version (tie breaker)

Rule 2: User Notification
├─ Show conflict in Sync Conflicts screen
├─ Allow user to choose version
└─ Store decision for future reference

Rule 3: Data Preservation
├─ Never lose data
├─ Store both versions
├─ Allow user recovery
└─ Log conflict details
```

---

## Security Architecture

### Security Layers

```
┌─────────────────────────────────────────────────────┐
│          Transport Security (HTTPS/TLS)              │
│  ├─ All data encrypted in transit                   │
│  └─ Certificate pinning to prevent MITM             │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│        Authentication & Authorization                │
│  ├─ JWT tokens for API requests                     │
│  ├─ Token refresh before expiry                     │
│  ├─ Role-based access control                       │
│  └─ Session tracking                                │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│             Data Storage Security                    │
│  ├─ Keychain/Keystore for tokens                    │
│  ├─ SQLite database encryption (SQLCipher)          │
│  ├─ Secure file storage                             │
│  └─ No sensitive data in SharedPreferences          │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│            Application Level Security                │
│  ├─ Input validation                                │
│  ├─ Output encoding                                 │
│  ├─ Error message sanitization                      │
│  └─ Logging of security events                      │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│            Device-Level Security                     │
│  ├─ Biometric authentication                        │
│  ├─ Device lock timeout                             │
│  ├─ Secure boot validation                          │
│  └─ Jailbreak/root detection                        │
└─────────────────────────────────────────────────────┘
```

### Encryption Strategy

**In Transit**:
- TLS 1.3 minimum
- Strong cipher suites only
- Certificate pinning enabled
- No fallback to HTTP

**At Rest**:
- AES-256 encryption for sensitive data
- SQLite encryption (SQLCipher)
- Keychain/Keystore for credentials
- Encrypted file cache

**Token Management**:
- Stored in secure storage (not shared preferences)
- Cleared on logout
- Refresh before expiry
- Rotation on sensitive operations

---

## Layered Architecture

### Presentation Layer

**Responsibility**: User interface and interactions

**Components**:
- React Native screens and components
- Navigation stack management
- User input handling
- UI state management

**Design Pattern**: Container/Presentational pattern
- Containers: Connected to state, handle data
- Presentational: Pure components, receive props

```typescript
// Container (screen)
const DocumentListScreen = () => {
  const documents = useDocuments()
  return <DocumentListView documents={documents} />
}

// Presentational (component)
const DocumentListView = ({ documents }) => {
  return <FlatList data={documents} renderItem={...} />
}
```

### State Management Layer

**Responsibility**: Global application state

**Technologies**: Zustand stores

**Organization**:
- Separate store per domain (auth, documents, transactions)
- Actions for mutations
- Selectors for queries
- Observable for reactive updates

```typescript
const useDocumentStore = create((set) => ({
  documents: [],
  
  setDocuments: (docs) => set({ documents: docs }),
  
  addDocument: (doc) => set(state => ({
    documents: [...state.documents, doc]
  })),
  
  // Selector
  byCategory: (category) => 
    useDocumentStore(state => 
      state.documents.filter(d => d.category === category)
    )
}))
```

### Business Logic Layer

**Responsibility**: Application workflows and logic

**Components**:
- Custom hooks (useDocuments, useSync, etc.)
- Business rules
- Data transformations
- Side effects coordination

```typescript
// Hook coordinates multiple services
const useSync = () => {
  const [status, setStatus] = useState('idle')
  
  const sync = async () => {
    setStatus('syncing')
    try {
      await offlineSync.uploadChanges()
      await offlineSync.pullChanges()
      setStatus('complete')
    } catch (error) {
      setStatus('failed')
    }
  }
  
  return { status, sync }
}
```

### Service Layer

**Responsibility**: Business operations and integrations

**Key Services**:
- DocumentProcessorService: OCR coordination
- OfflineSyncService: Sync management
- APIClient: HTTP communication
- NetworkMonitorService: Connectivity status

```typescript
// Service - no React dependencies
export class OCRService {
  async processImage(imagePath: string): Promise<OCRResult> {
    // Business logic
  }
}

// Used in hook or service
const ocrService = new OCRService()
const result = await ocrService.processImage(path)
```

### Data Access Layer

**Responsibility**: Data persistence and retrieval

**Components**:
- WatermelonDB repositories
- AsyncStorage utilities
- Cache management
- File system operations

```typescript
// Repository pattern
class DocumentRepository {
  async findById(id: string): Promise<Document> {
    return this.collection.find(id)
  }
  
  async findByCategory(category: string): Promise<Document[]> {
    return this.collection.query(
      Q.where('category', Q.eq(category))
    ).fetch()
  }
}
```

---

## Component Interactions

### Authentication Flow

```
┌──────────────┐
│ Login Screen │
└──────┬───────┘
       │ (email, password)
       ↓
┌──────────────────────┐
│ useAuth Hook         │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│ authStore.login()    │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│ APIClient.login()    │
└──────┬───────────────┘
       │
       ↓
┌──────────────────────┐
│ POST /auth/login     │
└──────┬───────────────┘
       │
       ├─ Success ─────────────┐
       │                        ↓
       │            ┌────────────────────────┐
       │            │ Save tokens securely    │
       │            │ Update auth state       │
       │            │ Navigate to dashboard   │
       │            └────────────────────────┘
       │
       └─ Failure ─────────────┐
                                ↓
                      ┌────────────────────────┐
                      │ Show error message     │
                      │ Clear input fields     │
                      │ Remain on login screen │
                      └────────────────────────┘
```

### Document Processing Flow

```
Document Capture
       ↓
DocumentCaptureService
       ↓ (image enhancement)
DocumentProcessorService
       ↓
       ├─ Save to WatermelonDB (status: captured)
       │
       ├─ If online:
       │  └─ POST /documents/upload
       │     ↓
       │  ┌─ Server OCR Processing
       │  └─ Update document (status: processed)
       │
       └─ If offline:
          └─ Queue in syncQueue
             └─ Update when online
```

---

## Performance Architecture

### Rendering Optimization

```
React Native
├─ FlatList with virtualization
│  └─ Only renders visible items
├─ Memoization of components
│  └─ useMemo, useCallback
├─ Lazy loading of data
│  └─ Pagination
└─ Image caching
   └─ Thumbnail generation
```

### Data Loading Strategy

```
Sequential Loading:
1. Load from WatermelonDB (instant)
2. Display to user (perceived fast)
3. Fetch from server in background
4. Update if newer data available

Benefits:
- Instant perceived performance
- Works offline
- Reduces server load
- Better user experience
```

### Caching Strategy

```
Three-Level Cache:
├─ L1: Memory (Zustand state) - for current session
├─ L2: Local Database (WatermelonDB) - persistent
└─ L3: Server - source of truth

Cache Invalidation:
├─ Time-based (TTL)
├─ Event-based (user action)
└─ Manual refresh
```

---

## Deployment Architecture

### Build Pipeline

```
Source Code (GitHub)
       ↓
┌──────────────────┐
│ CI/CD Pipeline   │
│ (GitHub Actions) │
└────┬──────────────┘
     │
     ├─ Lint & Format Check
     ├─ Type Check (TypeScript)
     ├─ Unit Tests
     ├─ Integration Tests
     └─ Build APK/IPA
          ↓
         EAS Build
          ↓
    ┌─────────────┐
    │ Android APK │
    │ iOS IPA     │
    └────┬────────┘
         ↓
    ┌─────────────┐
    │ App Stores  │
    │ (Play Store │ and
    │  App Store) │
    └─────────────┘
```

### Environment Configuration

```
Development
├─ Local API server
├─ Debug symbols enabled
├─ Verbose logging
└─ No certificate pinning

Staging
├─ Staging API server
├─ Testing certificates
├─ Analytics enabled
└─ Performance monitoring

Production
├─ Production API server
├─ Optimized build
├─ Certificate pinning
├─ Crash reporting
└─ Analytics
```

---

**Document Version**: 1.0  
**Last Updated**: October 2026

For detailed implementation, see DEVELOPER_GUIDE.md and DEVELOPER_GUIDE.md
