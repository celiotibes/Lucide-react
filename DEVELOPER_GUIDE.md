# Lucide React - Developer Guide

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Project Structure](#project-structure)
3. [Development Workflow](#development-workflow)
4. [Code Style & Conventions](#code-style--conventions)
5. [Testing](#testing)
6. [Performance Optimization](#performance-optimization)
7. [Security Best Practices](#security-best-practices)
8. [Debugging](#debugging)
9. [Deployment](#deployment)
10. [Contributing](#contributing)

## Environment Setup

### Prerequisites

- **Node.js**: v18.0 or higher
- **npm**: v9.0 or higher (or yarn v4.0+)
- **React Native CLI**: v0.72 or higher
- **Xcode**: v14.0+ (for iOS development)
- **Android Studio**: Latest version (for Android development)
- **Git**: Latest version

### Development Environment Setup

#### macOS Setup

```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js and npm
brew install node

# Install watchman (improves file watching)
brew install watchman

# Install React Native CLI
npm install -g react-native-cli

# Install CocoaPods for iOS dependencies
sudo gem install cocoapods
```

#### Linux Setup

```bash
# Update package manager
sudo apt-get update

# Install Node.js and npm
sudo apt-get install nodejs npm

# Install required development tools
sudo apt-get install build-essential

# Install React Native CLI
npm install -g react-native-cli
```

#### Windows Setup

```powershell
# Install Node.js from https://nodejs.org

# Install Chocolatey if not installed
Set-ExecutionPolicy Bypass -Scope Process -Force; \
  iex ((New-Object System.Net.ServicePointManager).ServerCertificateValidationCallback = {$true}); \
  iex ((new-object net.webclient).DownloadString('https://chocolatey.org/install.ps1'))

# Install development tools
choco install -y nodejs git visualstudio2019-community

# Install React Native CLI
npm install -g react-native-cli
```

### Project Setup

```bash
# Clone repository
git clone https://github.com/celiotibes/lucide-react.git
cd lucide-react

# Install dependencies
npm install

# Install iOS dependencies (macOS only)
cd ios && pod install && cd ..

# Setup environment variables
cp .env.example .env.local

# Start development server
npm start
```

### Environment Variables

Create `.env.local` with the following:

```
# API Configuration
REACT_APP_API_URL=http://localhost:3000
REACT_APP_API_TIMEOUT=30000

# Firebase Configuration
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id

# Feature Flags
REACT_APP_ENABLE_OFFLINE_MODE=true
REACT_APP_ENABLE_OCR=true
REACT_APP_ENABLE_BATCH_PROCESSING=true

# Development Settings
REACT_APP_DEBUG_MODE=false
REACT_APP_LOG_LEVEL=info
```

## Project Structure

### Directory Organization

```
lucide-react/
├── src/
│   ├── components/          # React components
│   │   ├── common/          # Shared components
│   │   ├── screens/         # Screen components
│   │   └── ui/              # UI component library
│   ├── screens/             # Screen definitions
│   ├── navigation/          # Navigation configuration
│   ├── services/            # Business logic
│   │   ├── api/             # API services
│   │   ├── storage/         # Local storage
│   │   ├── sync/            # Synchronization
│   │   └── ocr/             # OCR processing
│   ├── hooks/               # Custom React hooks
│   ├── context/             # Context API
│   ├── utils/               # Utility functions
│   ├── types/               # TypeScript definitions
│   ├── constants/           # Constants
│   ├── styles/              # Global styles
│   └── App.tsx              # Root component
├── ios/                     # iOS native code
├── android/                 # Android native code
├── __tests__/               # Test files
├── docs/                    # Documentation
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
└── README.md                # Project README
```

### Key Services

#### API Service (`src/services/api/`)

Handles all HTTP requests:

```typescript
export class APIService {
  async uploadDocument(file: File): Promise<Document>
  async fetchDocuments(filters: FilterOptions): Promise<Document[]>
  async updateDocument(id: string, data: Partial<Document>): Promise<Document>
  async deleteDocument(id: string): Promise<void>
}
```

#### Storage Service (`src/services/storage/`)

Manages local data persistence:

```typescript
export class StorageService {
  async saveDocument(doc: Document): Promise<void>
  async getDocument(id: string): Promise<Document>
  async deleteDocument(id: string): Promise<void>
  async getAllDocuments(): Promise<Document[]>
}
```

#### Sync Service (`src/services/sync/`)

Handles offline-first synchronization:

```typescript
export class SyncService {
  async syncDocuments(): Promise<SyncResult>
  async handleConflict(local: Document, remote: Document): Promise<Document>
  async queueDocument(doc: Document): Promise<void>
  subscribeToSyncStatus(callback: (status: SyncStatus) => void): Unsubscribe
}
```

## Development Workflow

### Starting Development

```bash
# Start development server
npm start

# For iOS (macOS only)
npm run ios

# For Android
npm run android

# Run with specific simulator
npm run ios -- --simulator="iPhone 14 Pro"
```

### Creating New Features

1. **Create Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Implement Feature**:
   - Create components in appropriate directory
   - Write tests alongside code
   - Update TypeScript types
   - Add inline documentation

3. **Test Locally**:
   ```bash
   npm test
   npm run lint
   npm run type-check
   ```

4. **Create Pull Request**:
   - Push branch to remote
   - Create PR with detailed description
   - Link relevant issues
   - Request review

### Git Workflow

#### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation
- `test/description` - Test additions

#### Commit Messages

Follow conventional commits:

```
feat(camera): add auto-focus capability
fix(sync): resolve conflict detection bug
docs(api): update endpoint documentation
test(ocr): add text extraction tests
refactor(storage): optimize database queries
```

## Code Style & Conventions

### TypeScript

- **Strict Mode**: Enable strict TypeScript checking
- **Type Annotations**: Always annotate function parameters and returns
- **Interfaces**: Use interfaces for object structures
- **Enums**: Use enums for fixed sets of values

```typescript
interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  status: DocumentStatus;
}

enum DocumentStatus {
  DRAFT = 'draft',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  ERROR = 'error'
}

function processDocument(doc: Document): Promise<ProcessedDocument> {
  // Implementation
}
```

### React Components

- **Functional Components**: Use only functional components with hooks
- **Custom Hooks**: Extract reusable logic into custom hooks
- **Props Interface**: Define all props with TypeScript interfaces

```typescript
interface DocumentListProps {
  documents: Document[];
  onSelect: (doc: Document) => void;
  isLoading?: boolean;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  onSelect,
  isLoading = false
}) => {
  return (
    <div>
      {isLoading && <Loading />}
      {documents.map(doc => (
        <DocumentCard 
          key={doc.id}
          document={doc}
          onClick={() => onSelect(doc)}
        />
      ))}
    </div>
  );
};
```

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `DocumentList.tsx` |
| Hooks | camelCase with 'use' | `useDocumentSync.ts` |
| Services | PascalCase | `DocumentService.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Constants | UPPER_SNAKE_CASE | `API_TIMEOUT` |
| Types | PascalCase | `Document`, `SyncStatus` |

### Code Formatting

```javascript
// Use Prettier for automatic formatting
npm run format

// Use ESLint for linting
npm run lint
npm run lint --fix
```

## Testing

### Test Structure

Tests are colocated with source files:

```
src/
├── components/
│   ├── DocumentList.tsx
│   └── DocumentList.test.tsx
├── services/
│   ├── DocumentService.ts
│   └── DocumentService.test.ts
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests for specific file
npm test DocumentList.test

# Run with coverage
npm test --coverage

# Run in watch mode
npm test --watch
```

### Writing Tests

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentList } from './DocumentList';

describe('DocumentList', () => {
  it('renders documents list', () => {
    const documents = [
      { id: '1', title: 'Doc 1', status: 'complete' }
    ];
    
    render(<DocumentList documents={documents} onSelect={() => {}} />);
    expect(screen.getByText('Doc 1')).toBeInTheDocument();
  });

  it('calls onSelect when document clicked', () => {
    const onSelect = jest.fn();
    const documents = [
      { id: '1', title: 'Doc 1', status: 'complete' }
    ];
    
    render(<DocumentList documents={documents} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Doc 1'));
    expect(onSelect).toHaveBeenCalledWith(documents[0]);
  });
});
```

### Test Coverage Goals

- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 80%+
- **Lines**: 80%+

## Performance Optimization

### React Performance

1. **Memoization**:
   ```typescript
   const DocumentCard = React.memo(({ document }: Props) => {
     return <div>{document.title}</div>;
   });
   ```

2. **useCallback**:
   ```typescript
   const handleSelect = useCallback((doc: Document) => {
     selectDocument(doc);
   }, [selectDocument]);
   ```

3. **useMemo**:
   ```typescript
   const filteredDocuments = useMemo(
     () => documents.filter(doc => doc.status === 'complete'),
     [documents]
   );
   ```

### Image Optimization

- Compress images before upload
- Use appropriate image formats (WebP when possible)
- Implement lazy loading for document lists

### Network Optimization

- Implement request batching
- Use pagination for document lists
- Cache API responses where appropriate
- Compression enabled for API requests

## Security Best Practices

### Authentication & Authorization

1. **Secure Token Storage**:
   ```typescript
   // Use secure storage, not localStorage
   await secureStorage.setItem('authToken', token);
   ```

2. **Token Refresh**:
   ```typescript
   const refreshToken = async () => {
     const newToken = await api.refreshToken();
     await secureStorage.setItem('authToken', newToken);
   };
   ```

### Data Security

1. **Encryption at Rest**:
   - All sensitive data encrypted before storage
   - Use device-level encryption when available

2. **Encryption in Transit**:
   - All API calls use HTTPS
   - Certificate pinning for production

### Input Validation

```typescript
function validateInput(input: unknown): Document {
  const schema = z.object({
    title: z.string().min(1),
    content: z.string(),
    status: z.enum(['draft', 'complete', 'error'])
  });
  
  return schema.parse(input);
}
```

## Debugging

### Console Logging

```typescript
// Use debug utility
import { debug } from './utils/debug';

debug.log('Syncing documents...', { count: 10 });
debug.error('Sync failed', error);
```

### React DevTools

1. Install React DevTools browser extension
2. Use Component profiler to identify performance issues
3. Inspect component props and state

### Network Debugging

```bash
# Use Charles Proxy or similar tool
# Monitor all network requests
# Inspect request/response headers and bodies
```

### Error Tracking

```typescript
import * as Sentry from "@sentry/react-native";

Sentry.captureException(error, {
  tags: {
    section: 'document_sync'
  }
});
```

## Deployment

### Development Build

```bash
npm run build:dev
```

### Production Build

```bash
# iOS
npm run build:ios

# Android
npm run build:android
```

### Testing Builds

```bash
# Test build locally
npm run build
npm run serve

# Access at http://localhost:3000
```

## Contributing

### Before Starting Work

1. Review existing issues and PRs
2. Discuss major changes before implementation
3. Check project roadmap
4. Ensure your environment is set up correctly

### Submission Process

1. Push to your fork
2. Create detailed pull request
3. Link related issues
4. Request review from maintainers
5. Address review feedback
6. Maintain clean commit history

### Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests written and passing
- [ ] No console errors or warnings
- [ ] Performance impact assessed
- [ ] Documentation updated
- [ ] Commit messages clear and descriptive

---

*Last Updated: October 2024*
*Version: 2.0*
*Document: Developer Guide for Lucide React*
