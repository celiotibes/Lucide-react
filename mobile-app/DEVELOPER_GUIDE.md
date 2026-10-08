# CRMT Mobile App - Developer Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Development Environment Setup](#development-environment-setup)
3. [Project Structure](#project-structure)
4. [Key Systems & Architecture](#key-systems--architecture)
5. [Core Technologies](#core-technologies)
6. [Working with Specific Features](#working-with-specific-features)
7. [Testing Strategy](#testing-strategy)
8. [Debugging and Development Tools](#debugging-and-development-tools)
9. [Extension Points & Customization](#extension-points--customization)
10. [Contributing Guidelines](#contributing-guidelines)

---

## Introduction

The CRMT Mobile App is a React Native/Expo application built with TypeScript. This guide covers the development practices, architecture patterns, and workflows for contributing to the codebase.

### Target Audience

- Backend developers transitioning to React Native
- Mobile app developers new to the codebase
- Contributors working on features or bug fixes
- DevOps engineers managing CI/CD pipelines

### Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- Git installed and configured
- Knowledge of JavaScript/TypeScript fundamentals
- Basic React hooks understanding
- Familiarity with REST APIs

---

## Development Environment Setup

### Step 1: Install Node.js and npm

**For macOS:**
```bash
# Using Homebrew
brew install node@18

# Verify installation
node --version  # Should be v18.x.x or higher
npm --version   # Should be 9.x.x or higher
```

**For Windows:**
1. Download from [nodejs.org](https://nodejs.org)
2. Run the installer and follow prompts
3. Restart your terminal/PowerShell
4. Verify with `node --version` and `npm --version`

**For Linux:**
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

### Step 2: Clone the Repository

```bash
# Clone with SSH (recommended if you have SSH key)
git clone git@github.com:yourorg/Lucide-react.git

# Or clone with HTTPS
git clone https://github.com/yourorg/Lucide-react.git

# Navigate to mobile-app directory
cd Lucide-react/mobile-app
```

### Step 3: Install Project Dependencies

```bash
# Install all dependencies
npm install

# Verify installation
npm list --depth=0  # Shows top-level packages
```

### Step 4: Set Up Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your configuration
# Open with your editor (VS Code, nano, etc.)
nano .env

# Required variables to configure:
# - API_BASE_URL=http://localhost:3000/api  (or production URL)
# - FIREBASE_CONFIG={"..."}                 (if using Firebase)
# - ENABLE_LOGGING=true/false               (for development logging)
```

### Step 5: Install Android SDK (For Android Development)

**Using Android Studio (Recommended):**

1. Download [Android Studio](https://developer.android.com/studio)
2. Install it and open the application
3. Go to **Tools** → **SDK Manager**
4. Install:
   - Android SDK Platform API Level 31 or higher
   - Android SDK Build-Tools
   - Android Emulator
5. Set ANDROID_HOME environment variable:

```bash
# macOS/Linux - Add to ~/.zshrc or ~/.bash_profile
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Windows - Add to System Environment Variables
# Variable: ANDROID_HOME
# Value: C:\Users\YourUsername\AppData\Local\Android\sdk
```

### Step 6: Install iOS Tools (For iOS Development on macOS)

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install CocoaPods (iOS dependency manager)
sudo gem install cocoapods

# Verify installation
pod --version
```

### Step 7: Configure Expo

```bash
# Install Expo CLI globally
npm install -g expo-cli

# If using eas-cli for cloud builds
npm install -g eas-cli

# Verify installation
expo --version
eas --version
```

### Step 8: Create or Configure Emulators

**For Android:**

```bash
# Open Android Studio and create an emulator via GUI, or use CLI:
# (requires Android SDK properly installed)
emulator -list-avds  # List available emulators
emulator -avd Pixel_6_API_31  # Start an emulator
```

**For iOS (macOS only):**

```bash
# List available simulators
xcrun simctl list devices

# Start a simulator (example)
open /Applications/Xcode.app/Contents/Developer/Applications/Simulator.app
```

### Step 9: Test the Setup

```bash
# In the mobile-app directory, start the development server
npm start

# You should see a menu with options like:
# a - open Android emulator
# i - open iOS simulator
# w - open web version
# Press 'a' to start with Android
```

If you see the app running in an emulator, your setup is complete!

---

## Project Structure

```
mobile-app/
├── src/
│   ├── api/                          # API communication layer
│   │   ├── client.ts                 # Axios instance and configuration
│   │   ├── endpoints/                # Organized API endpoints
│   │   │   ├── auth.ts              # Authentication endpoints
│   │   │   ├── documents.ts         # Document management endpoints
│   │   │   ├── transactions.ts      # Transaction endpoints
│   │   │   └── notifications.ts     # Notification endpoints
│   │   └── interceptors/            # Request/response interceptors
│   │
│   ├── screens/                      # React Native screens (pages)
│   │   ├── auth/                    # Login, register, password recovery
│   │   ├── dashboard/               # Home screen
│   │   ├── documents/               # Document list and detail views
│   │   ├── transactions/            # Transaction management
│   │   ├── settings/                # User settings
│   │   ├── notifications/           # Notifications feed
│   │   └── analytics/               # Analytics and reporting
│   │
│   ├── components/                   # Reusable React components
│   │   ├── common/                  # Basic components (Button, Input, etc.)
│   │   ├── forms/                   # Form components
│   │   ├── lists/                   # List components
│   │   ├── cards/                   # Card components
│   │   ├── errors/                  # Error boundaries
│   │   ├── optimized/               # Performance-optimized components
│   │   └── analytics/               # Analytics-specific components
│   │
│   ├── services/                     # Business logic and utilities
│   │   ├── APIClient.ts             # HTTP client with interceptors
│   │   ├── DocumentCaptureService.ts # Camera and photo capture
│   │   ├── DocumentParserService.ts  # Document parsing logic
│   │   ├── DocumentProcessorService.ts # OCR and processing
│   │   ├── OCRService.ts            # OCR integration
│   │   ├── OfflineSyncService.ts    # Offline-first sync
│   │   ├── SyncManagerService.ts    # Sync coordination
│   │   ├── CameraService.ts         # Camera operations
│   │   ├── NetworkMonitorService.ts # Network status monitoring
│   │   ├── pushNotificationService.ts # Push notification handling
│   │   └── userService.ts           # User-related operations
│   │
│   ├── database/                     # WatermelonDB database layer
│   │   ├── index.ts                 # Database initialization
│   │   ├── schema.ts                # Database schema definition
│   │   ├── models/                  # Database models
│   │   │   ├── Document.ts
│   │   │   ├── Transaction.ts
│   │   │   └── User.ts
│   │   └── repositories/            # Data access layer
│   │       ├── DocumentRepository.ts
│   │       ├── TransactionRepository.ts
│   │       └── UserRepository.ts
│   │
│   ├── store/                        # State management (Zustand)
│   │   ├── authStore.ts             # Authentication state
│   │   ├── documentStore.ts         # Documents state
│   │   ├── transactionStore.ts      # Transactions state
│   │   └── uiStore.ts               # UI state
│   │
│   ├── hooks/                        # Custom React hooks
│   │   ├── useAuth.ts               # Authentication hook
│   │   ├── useDocuments.ts          # Documents hook
│   │   ├── useTransactions.ts       # Transactions hook
│   │   ├── useSync.ts               # Sync coordination hook
│   │   ├── useNetwork.ts            # Network status hook
│   │   └── useOfflineQueue.ts       # Offline queue management
│   │
│   ├── navigation/                   # React Navigation setup
│   │   ├── NavigationContainer.tsx  # Navigation root
│   │   ├── RootNavigator.tsx        # Root navigation stack
│   │   ├── AuthNavigator.tsx        # Authentication stack
│   │   └── MainNavigator.tsx        # Main app stacks
│   │
│   ├── types/                        # TypeScript type definitions
│   │   ├── index.ts                 # Common types
│   │   ├── api.ts                   # API-related types
│   │   ├── domain.ts                # Business domain types
│   │   ├── navigation.ts            # Navigation types
│   │   └── auth.ts                  # Authentication types
│   │
│   ├── utils/                        # Utility functions
│   │   ├── logger.ts                # Logging utility
│   │   ├── validation.ts            # Form validation
│   │   ├── formatting.ts            # Data formatting
│   │   ├── date.ts                  # Date utilities
│   │   ├── storage.ts               # Secure storage
│   │   └── security/                # Security utilities
│   │       ├── certificatePinning.ts
│   │       ├── encryption.ts
│   │       └── tokenManager.ts
│   │
│   ├── constants/                    # App constants
│   │   ├── api.ts                   # API endpoints and timeouts
│   │   ├── theme.ts                 # Theme colors and styles
│   │   ├── strings.ts               # UI strings (i18n keys)
│   │   └── config.ts                # App configuration
│   │
│   ├── theme/                        # Material Design 3 theming
│   │   ├── colors.ts                # Color definitions
│   │   ├── typography.ts            # Typography styles
│   │   └── components.ts            # Component theme config
│   │
│   └── App.tsx                       # Root app component
│
├── __tests__/                        # Test files mirror src structure
│   ├── unit/                        # Unit tests
│   ├── integration/                 # Integration tests
│   ├── e2e/                         # End-to-end tests
│   └── fixtures/                    # Test data and mocks
│
├── e2e/                              # Detox E2E tests
│   └── config.e2e.js
│
├── eas.json                          # EAS Build configuration
├── app.json                          # Expo configuration
├── app.config.js                    # Expo config (optional)
├── babel.config.js                  # Babel configuration
├── tsconfig.json                    # TypeScript configuration
├── jest.config.js                   # Jest testing configuration
├── jest.integration.config.js       # Integration test configuration
├── .eslintrc.json                   # ESLint configuration
├── .prettierrc.json                 # Prettier formatting config
├── package.json                     # Dependencies and scripts
└── README.md                         # Project README
```

### Key Directory Explanations

**src/api**: All HTTP communication with backend
- Centralized Axios configuration
- Request/response interceptors
- Error handling and retry logic
- Certificate pinning setup

**src/screens**: Full-page components
- Each screen is a top-level component
- Navigation props passed automatically
- Connected to state management

**src/components**: Reusable UI components
- Stateless or simple state management
- Used across multiple screens
- Exported from index.ts for convenience

**src/services**: Business logic and integrations
- No React/component code here
- Can be tested independently
- Used by hooks and screens

**src/database**: WatermelonDB integration
- Schema definition
- Model classes
- Repository pattern for data access

**src/store**: Global state with Zustand
- Separate stores for each domain
- Actions for state mutations
- Selectors for accessing state

---

## Key Systems & Architecture

### 1. Authentication System

#### Flow

```
1. User enters credentials
   ↓
2. POST /auth/login with email/password
   ↓
3. Server returns JWT token + refresh token
   ↓
4. Tokens stored securely in Secure Storage
   ↓
5. Auth state updated in Zustand store
   ↓
6. User redirected to main app
```

#### Key Files

- `src/api/endpoints/auth.ts`: API calls
- `src/store/authStore.ts`: Authentication state
- `src/utils/security/tokenManager.ts`: Token lifecycle management
- `src/services/APIClient.ts`: Token injection into requests

#### Token Refresh

Tokens are automatically refreshed before expiry:

```typescript
// In APIClient request interceptor
if (token && isTokenExpiringSoon(token)) {
  token = await refreshToken();
}
```

#### Biometric Authentication

```typescript
// In SecurityService
async setupBiometric() {
  const supported = await Biometric.isAvailable();
  if (supported) {
    // Store biometric enabled flag
    // On app launch, use biometric to retrieve password
  }
}
```

### 2. Document Processing Pipeline

#### OCR Processing Flow

```
1. User captures document photo
   ↓
2. Image enhancement (contrast, rotation)
   ↓
3. Send to OCR service (server-side)
   ↓
4. Server performs OCR processing
   ↓
5. Server returns extracted text and fields
   ↓
6. Client displays results for review/editing
   ↓
7. User confirms and saves document
   ↓
8. Document stored in WatermelonDB
```

#### Key Files

- `src/services/DocumentCaptureService.ts`: Camera integration
- `src/services/DocumentProcessorService.ts`: OCR coordination
- `src/services/DocumentParserService.ts`: Text extraction and parsing
- `src/api/endpoints/documents.ts`: Document API calls

#### Processing Status Tracking

```typescript
// Status flow
'captured' → 'processing' → 'processed' → 'saved'

// Can fail at any step
'captured' → 'processing' → 'failed' (with error message)
```

### 3. Offline-First Architecture

#### WatermelonDB

Local database that syncs with server:

```typescript
// Define model
class Document extends Model {
  static table = 'documents'
  static associations = {
    transactions: { type: 'has_many', foreignKey: 'document_id' }
  }
  
  // Observable fields
  title = field('title')
  status = field('status')
  content = field('content')
}

// Query locally
const docs = await documentRepository.findByStatus('processed')
```

#### Sync Strategy

```
1. On app startup: check for pending local changes
   ↓
2. If offline: queue changes locally (WatermelonDB)
   ↓
3. When online: send queued changes to server
   ↓
4. Resolve conflicts (server data preferred)
   ↓
5. Pull latest server data and merge locally
```

#### Conflict Resolution

When the same record is modified locally and remotely:

```
Rule: Server version takes precedence
- Timestamp: server's updated_at overrides local
- User's local changes are moved to 'drafts'
- Notification shown to user about conflict
```

### 4. Sync Management System

#### SyncManager Responsibilities

1. **Detect sync status**: Online/offline, connection type (WiFi/cellular)
2. **Coordinate syncing**: Queue operations, prevent duplicate syncs
3. **Manage retries**: Exponential backoff on failures
4. **Emit events**: Notify UI of sync progress

#### Sync Events

```typescript
// Observable events
'sync:started'
'sync:progress' → { percentage: 0-100 }
'sync:completed'
'sync:failed' → { error: Error }
'sync:conflict' → { resource: string, conflict: Conflict }
```

#### Configuration

```typescript
// In settings
syncOnCellular: boolean       // Only WiFi by default
syncInterval: number          // Milliseconds between auto-syncs
maxRetries: number           // Failed attempt retries
retryBackoff: 'exponential'  // Retry strategy
```

### 5. Navigation Architecture

#### Navigation Stack

```
RootNavigator
├── AuthStack (when not authenticated)
│   ├── Login
│   ├── Register
│   └── ForgotPassword
│
└── MainStack (when authenticated)
    ├── TabNavigator
    │   ├── DashboardStack
    │   │   ├── Dashboard
    │   │   └── QuickActions
    │   ├── DocumentsStack
    │   │   ├── DocumentList
    │   │   ├── DocumentDetail
    │   │   └── DocumentCapture
    │   ├── TransactionsStack
    │   │   ├── TransactionList
    │   │   └── TransactionDetail
    │   └── SettingsStack
    │       ├── Settings
    │       ├── Account
    │       └── Security
    │
    └── ModalStack (overlays)
        ├── CameraModal
        ├── ImagePickerModal
        └── ShareModal
```

#### Type-Safe Navigation

```typescript
// Define navigation types
type RootStackParamList = {
  Dashboard: undefined
  DocumentDetail: { documentId: string }
  CameraModal: { category: string }
}

// Use in components
const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()

// Navigate with type checking
navigation.navigate('DocumentDetail', { documentId: '123' })
```

### 6. Error Handling Strategy

#### Error Boundaries

Three levels of error boundaries:

```typescript
// 1. App-level - catches all errors
<AppErrorBoundary>
  {/* entire app */}
</AppErrorBoundary>

// 2. Screen-level - catches screen errors
<ScreenErrorBoundary>
  {/* screen components */}
</ScreenErrorBoundary>

// 3. Component-level - catches component errors
<ComponentErrorBoundary>
  {/* component */}
</ComponentErrorBoundary>
```

#### Error Handling Patterns

```typescript
// API errors
try {
  const data = await apiClient.get('/documents')
} catch (error) {
  if (isNetworkError(error)) {
    // Handle offline
  } else if (is401Error(error)) {
    // Handle unauthorized
    await logout()
  } else if (isServerError(error)) {
    // Show user-friendly message
    showErrorToast('Server error, please try again')
  }
}

// Async operations in components
const [error, setError] = useState<Error | null>(null)

const handleAction = async () => {
  try {
    setError(null)
    await performAction()
  } catch (err) {
    setError(err as Error)
    logErrorToAnalytics(err)
  }
}
```

### 7. Analytics Integration

#### Event Tracking

Key events tracked:

- User authentication events (login, logout, signup)
- Document captures and processing
- Transaction creation and edits
- Navigation events
- Error/crash events
- Performance metrics

#### Implementation

```typescript
// In analyticsService
trackEvent('document_captured', {
  category: 'documents',
  label: 'camera_capture',
  properties: {
    documentType: 'receipt',
    processingTime: 2345,
    success: true
  }
})

// Automatic crash reporting
logCrash(error, {
  severity: 'high',
  context: 'document_processing'
})
```

---

## Core Technologies

### React Native & Expo

- **Version**: 0.74.0
- **Expo**: 51.0.0
- **Advantages**: Write once, run on iOS/Android
- **Features used**: Camera, Storage, Permissions, Networking

### React Navigation

- **Version**: 6.1.0
- **Navigation types**: Native Stack, Bottom Tabs, Stack Navigators
- **Type-safe navigation** with TypeScript

### WatermelonDB

- **Version**: 0.29.0
- **Purpose**: Offline-first local database
- **Advantages**: 
  - Excellent performance
  - Observable reactive queries
  - Built for syncing

### Zustand

- **Version**: 4.4.0
- **Purpose**: Lightweight state management
- **Alternative to**: Redux, Context API
- **Advantages**: Simple API, TypeScript support

### React Native Paper

- **Version**: 5.10.0
- **Purpose**: Material Design 3 UI components
- **Components**: Button, Card, TextInput, Dialog, etc.

### Axios

- **Version**: 1.6.0
- **Purpose**: HTTP client for API calls
- **Features**: Interceptors, request/response transformation

### TypeScript

- **Version**: 5.2.0
- **Benefits**: Type safety, better IDE support, catches errors at compile time

### Jest & Testing Library

- **Purpose**: Unit and integration testing
- **Coverage threshold**: 80% for critical features

### Detox

- **Purpose**: End-to-end testing
- **Configuration**: Android emulator and iOS simulator

---

## Working with Specific Features

### Adding a New Document Type

1. **Define the model** in `src/database/models/`:

```typescript
// src/database/models/CustomDocument.ts
class CustomDocument extends Model {
  static table = 'custom_documents'
  
  @field('title') title!: string
  @field('type') type!: string
  @field('metadata') metadata!: Record<string, any>
}
```

2. **Update schema** in `src/database/schema.ts`:

```typescript
const customDocumentSchema = tableSchema({
  name: 'custom_documents',
  columns: [
    { name: 'title', type: 'string' },
    { name: 'type', type: 'string' },
    { name: 'metadata', type: 'string' }, // JSON as string
  ]
})
```

3. **Create repository** in `src/database/repositories/`:

```typescript
// src/database/repositories/CustomDocumentRepository.ts
export class CustomDocumentRepository {
  constructor(private collection: Collection<CustomDocument>) {}
  
  async create(data: Partial<CustomDocument>) {
    return this.collection.create(record => {
      record.title = data.title
      record.type = data.type
      record.metadata = data.metadata
    })
  }
}
```

4. **Add API endpoint** in `src/api/endpoints/documents.ts`:

```typescript
export const customDocumentAPI = {
  upload: (data: FormData) => 
    client.post('/documents/custom', data),
  
  process: (documentId: string, options: any) =>
    client.post(`/documents/custom/${documentId}/process`, options)
}
```

5. **Create store** in `src/store/`:

```typescript
// src/store/customDocumentStore.ts
export const useCustomDocumentStore = create<CustomDocumentState>((set, get) => ({
  documents: [],
  
  addDocument: (doc) => set(state => ({
    documents: [...state.documents, doc]
  }))
}))
```

### Adding a New API Endpoint

1. **Create endpoint file** in `src/api/endpoints/`:

```typescript
// src/api/endpoints/newFeature.ts
import { client } from '../client'

export const newFeatureAPI = {
  getList: () => 
    client.get('/new-feature'),
  
  getById: (id: string) =>
    client.get(`/new-feature/${id}`),
  
  create: (data: CreateRequest) =>
    client.post('/new-feature', data),
  
  update: (id: string, data: UpdateRequest) =>
    client.put(`/new-feature/${id}`, data),
  
  delete: (id: string) =>
    client.delete(`/new-feature/${id}`)
}
```

2. **Export from index** in `src/api/endpoints/index.ts`:

```typescript
export * from './newFeature'
```

3. **Use in component** or hook:

```typescript
import { newFeatureAPI } from '../api/endpoints'

const { data } = await newFeatureAPI.getList()
```

### Creating a New Screen

1. **Create screen file** in `src/screens/newfeature/`:

```typescript
// src/screens/newfeature/NewFeatureScreen.tsx
import React from 'react'
import { View } from 'react-native'
import { useNewFeatureStore } from '../../store/newFeatureStore'

type Props = NativeStackScreenProps<RootStackParamList, 'NewFeature'>

export const NewFeatureScreen: React.FC<Props> = ({ navigation }) => {
  const { items, loading } = useNewFeatureStore()
  
  return (
    <View style={styles.container}>
      {/* Screen content */}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  }
})
```

2. **Add to navigation** in `src/navigation/MainNavigator.tsx`:

```typescript
import { NewFeatureScreen } from '../screens/newfeature/NewFeatureScreen'

export function MainNavigator() {
  return (
    <Stack.Navigator>
      {/* ... existing screens */}
      <Stack.Screen 
        name="NewFeature" 
        component={NewFeatureScreen}
        options={{ title: 'New Feature' }}
      />
    </Stack.Navigator>
  )
}
```

3. **Add navigation types** in `src/types/navigation.ts`:

```typescript
type RootStackParamList = {
  // ... existing
  NewFeature: { id?: string }
}
```

---

## Testing Strategy

### Unit Tests

Test individual functions and components in isolation.

```typescript
// src/utils/__tests__/formatting.test.ts
import { formatCurrency } from '../formatting'

describe('formatCurrency', () => {
  it('formats currency with 2 decimal places', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50')
  })
  
  it('handles negative amounts', () => {
    expect(formatCurrency(-100)).toBe('-$100.00')
  })
})
```

### Component Tests

Test React components with Testing Library.

```typescript
// src/components/__tests__/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Button } from '../Button'

describe('Button', () => {
  it('calls onPress when tapped', () => {
    const mockPress = jest.fn()
    render(<Button onPress={mockPress} title="Press me" />)
    
    fireEvent.press(screen.getByText('Press me'))
    expect(mockPress).toHaveBeenCalled()
  })
})
```

### Integration Tests

Test multiple components and services working together.

```typescript
// src/services/__tests__/OfflineSyncService.integration.test.ts
describe('OfflineSyncService Integration', () => {
  it('syncs pending changes when coming online', async () => {
    // Setup offline state
    // Simulate network change
    // Verify sync was triggered
  })
})
```

### E2E Tests with Detox

Test complete user flows.

```typescript
// e2e/smoke.e2e.ts
describe('Smoke Test', () => {
  beforeAll(async () => {
    await device.launchApp()
  })
  
  it('should login successfully', async () => {
    await element(by.id('emailInput')).typeText('test@example.com')
    await element(by.id('passwordInput')).typeText('password123')
    await element(by.text('Login')).multiTap()
    
    await expect(element(by.text('Dashboard'))).toBeVisible()
  })
})
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/utils/__tests__/formatting.test.ts

# Watch mode (re-run on file change)
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run only integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

### Coverage Targets

- **Overall**: 80% coverage minimum
- **Critical paths**: 90% coverage (auth, sync, OCR)
- **Utils**: 100% coverage
- **Components**: 80% coverage

---

## Debugging and Development Tools

### VS Code Debug Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "React Native",
      "request": "launch",
      "type": "reactnativedebugger",
      "cwd": "${workspaceFolder}/mobile-app"
    },
    {
      "name": "Jest",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/mobile-app/node_modules/.bin/jest",
      "args": ["--runInBand", "--watch"],
      "cwd": "${workspaceFolder}/mobile-app"
    }
  ]
}
```

### React Native Debugger

```bash
# Install globally
npm install -g react-native-debugger

# Start debugger
open "rndebugger://set-debugger-loc?host=localhost&port=8081"

# In app, shake device and select "Debug"
```

### Enable Logging

```typescript
// In .env
ENABLE_LOGGING=true

// In code
import { logger } from './utils/logger'

logger.info('Message', { data: 'value' })
logger.error('Error', new Error('Test'))
logger.warn('Warning', { status: 'check' })
```

### Redux DevTools (for Zustand)

```bash
npm install zustand-devtools
```

### Network Inspector

```bash
# View network requests
npm start
# Then press "Shift + M" and select "Show Network Inspector"
```

### Performance Monitoring

```typescript
import { PerformanceMonitor } from './utils/performance'

const monitor = new PerformanceMonitor()
monitor.start('operation-name')

// Do work...

monitor.end('operation-name')  // Logs duration
```

---

## Extension Points & Customization

### Custom Authentication Provider

```typescript
// src/utils/auth/CustomAuthProvider.ts
export class CustomAuthProvider implements IAuthProvider {
  async login(credentials: Credentials): Promise<AuthToken> {
    // Custom login logic
  }
  
  async refreshToken(token: string): Promise<AuthToken> {
    // Custom token refresh
  }
  
  async logout(): Promise<void> {
    // Custom logout
  }
}

// In APIClient, inject custom provider:
const authProvider = new CustomAuthProvider()
const client = new APIClient({ authProvider })
```

### Custom OCR Engine

```typescript
// src/services/CustomOCRService.ts
export class CustomOCRService implements IOCRService {
  async extractText(imageUri: string): Promise<string> {
    // Custom OCR implementation
    // Could use Google Cloud Vision, AWS Textract, etc.
  }
}
```

### Custom Sync Strategy

```typescript
// src/services/sync/CustomSyncStrategy.ts
export class CustomSyncStrategy implements ISyncStrategy {
  async sync(): Promise<SyncResult> {
    // Custom sync logic
    // Could implement different conflict resolution
  }
}
```

### Custom Theme

```typescript
// src/theme/customTheme.ts
export const customTheme = {
  colors: {
    primary: '#FF6B6B',
    secondary: '#4ECDC4',
    error: '#FF3333',
    // ... override others
  },
  typography: {
    // Custom fonts and sizes
  }
}

// In App.tsx
<PaperProvider theme={customTheme}>
  {/* App */}
</PaperProvider>
```

---

## Contributing Guidelines

### Before You Start

1. Check **Issues** for existing work
2. Look at **CONTRIBUTING.md** for detailed guidelines
3. Set up development environment (see section 2)
4. Create a feature branch from `main` or current development branch

### Development Workflow

1. **Create feature branch**:
```bash
git checkout -b feature/your-feature-name
# or for bug fixes
git checkout -b fix/bug-description
```

2. **Make your changes**:
   - Follow code style (see below)
   - Add tests for new code
   - Update documentation
   - Keep commits atomic and focused

3. **Run checks before committing**:
```bash
npm run lint          # Check code style
npm run type-check    # TypeScript validation
npm run test          # Run tests
npm run test:coverage # Check coverage
```

4. **Commit with clear messages**:
```bash
git add .
git commit -m "feat: add new feature description"
# or
git commit -m "fix: resolve issue #123"
```

5. **Push and create PR**:
```bash
git push origin feature/your-feature-name
# Then create PR on GitHub with description
```

### Code Style Guide

**TypeScript/JavaScript**:
- Use TypeScript for all new code
- Prefer `const` over `let`
- Use arrow functions for callbacks
- Extract complex logic into functions

```typescript
// Good
const processDocument = async (file: File): Promise<Document> => {
  const processed = await processor.process(file)
  return processed
}

// Bad
function processDocument(file) {
  let result = processor.process(file)
  return result
}
```

**Naming Conventions**:
- Files: `camelCase.ts` or `PascalCase.tsx`
- Functions: `camelCase`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`

**Component Structure**:
```typescript
// Imports
import React from 'react'
import { View, StyleSheet } from 'react-native'

// Types
interface Props {
  title: string
  onPress: () => void
}

// Component
export const MyComponent: React.FC<Props> = ({ title, onPress }) => {
  return <View style={styles.container}>{title}</View>
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  }
})
```

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

**Example**:
```
feat(documents): add batch document upload

- Implement multi-select in document list
- Add upload progress indicator
- Update API client for batch endpoint

Fixes #456
```

### Pull Request Process

1. **Title**: Descriptive and follows commit format
2. **Description**: Clear explanation of changes
3. **Link issues**: "Fixes #123" or "Relates to #456"
4. **Self-review**: Check your own code first
5. **Wait for CI**: Ensure all checks pass
6. **Address reviews**: Respond to feedback professionally
7. **Squash if needed**: Keep history clean

---

**Document Version**: 1.0  
**Last Updated**: October 2026

For questions or clarifications, see SUPPORT section in USER_GUIDE.md
