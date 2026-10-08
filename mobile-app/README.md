# CRMT Mobile App

A React Native/Expo Android application for CRMT (Comprehensive Real Estate Management Tool) that integrates with the desktop installer system.

## Project Overview

CRMT Mobile provides mobile access to:
- **Document Management**: Upload, store, and manage property documents
- **Transaction Tracking**: Record income and expenses
- **Property Management**: Maintain property information and valuations
- **Offline-First Sync**: WatermelonDB enables offline usage with automatic sync
- **OCR Processing**: Extract data from documents via the desktop API

## Features

- **Type-Safe Architecture**: Full TypeScript with strict mode
- **Authentication**: Email/password login with token-based auth
- **API Integration**: Axios client with interceptors for token refresh
- **Offline Support**: WatermelonDB for local-first data management
- **Navigation**: React Navigation with TypeScript support
- **UI Components**: React Native Paper Material Design components
- **State Management**: Context API + Zustand ready
- **Input Validation**: Zod schemas for runtime type checking
- **Error Handling**: Comprehensive error handling and user-friendly messages

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- Android development environment (if building for Android)
- Desktop CRMT API running and accessible

## Installation

### 1. Install Dependencies

```bash
cd mobile-app
npm install
```

### 2. Configure Environment

Create a `.env.local` file:

```
EXPO_PUBLIC_API_ENDPOINT=http://192.168.1.100:8000
EXPO_PUBLIC_API_TIMEOUT=30000
```

Or configure via the setup wizard on first launch.

## Development

### Start Development Server

```bash
npm start
```

This will start the Expo Metro bundler. Scan the QR code with your phone or use:
- **Android**: Press `a` to open on Android emulator or connected device
- **Web**: Press `w` to open in web browser

### Development Workflow

1. The app will first show the **Setup Wizard** screen
2. Enter your desktop API endpoint (e.g., `http://192.168.1.100:8000`)
3. The app will test the connection
4. Log in with your credentials
5. Access the main dashboard

### Hot Reload

Changes to TypeScript/JavaScript files automatically reload. For native code changes, rebuild:

```bash
npm start -- --clear
```

## Project Structure

```
mobile-app/
├── src/
│   ├── api/              # API client & endpoints
│   │   ├── client.ts     # Axios instance with interceptors
│   │   ├── auth.ts       # Authentication endpoints
│   │   ├── documents.ts  # Document CRUD endpoints
│   │   └── config.ts     # API config & validation schemas
│   │
│   ├── screens/          # Navigation screens
│   │   ├── auth/         # Login, Register, Setup Wizard
│   │   ├── dashboard/    # Dashboard home
│   │   ├── documents/    # Document list & detail
│   │   ├── transactions/ # Transaction list & detail
│   │   └── settings/     # Settings & user profile
│   │
│   ├── components/       # Reusable UI components
│   │   ├── navigation/   # Navigation components
│   │   └── ui/           # Common UI elements
│   │
│   ├── hooks/            # Custom React hooks
│   │   └── useAuth.ts    # Authentication hook
│   │
│   ├── store/            # State management
│   │   └── auth-context.tsx # Auth provider & context
│   │
│   ├── types/            # TypeScript type definitions
│   │   ├── api.ts        # API request/response types
│   │   ├── domain.ts     # Business domain types
│   │   ├── auth.ts       # Authentication types
│   │   └── navigation.ts # Navigation types
│   │
│   ├── utils/            # Utility functions
│   │   ├── api-error.ts  # Error handling
│   │   └── validation.ts # Input validation
│   │
│   ├── db/               # Database (WatermelonDB)
│   │   ├── schema.ts     # Database schema
│   │   └── models/       # Database models
│   │
│   ├── services/         # Business logic services
│   │   ├── sync.ts       # Data sync service
│   │   └── ocr.ts        # OCR service
│   │
│   ├── constants/        # App constants
│   │   └── config.ts     # Configuration constants
│   │
│   └── App.tsx           # Root component
│
├── __tests__/            # Test files
├── assets/               # Images, fonts, etc.
├── app.json              # Expo configuration
├── eas.json              # Expo Application Services config
├── tsconfig.json         # TypeScript configuration
├── babel.config.js       # Babel configuration
└── package.json          # Dependencies
```

## API Integration

### Base URL Configuration

The app requires a CRMT desktop API endpoint. This is configured via:

1. **Setup Wizard** (first launch)
2. **Settings Screen** (runtime)
3. **AsyncStorage** (persistent)

### API Endpoints

All endpoints are defined in `src/api/config.ts`:

```typescript
// Authentication
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/refresh
GET    /api/auth/verify

// Documents
GET    /api/documentos?page=1&limit=20
GET    /api/documentos/{id}
POST   /api/documentos
PATCH  /api/documentos/{id}
DELETE /api/documentos/{id}
POST   /api/documentos/upload

// OCR
POST   /api/ocr/process
GET    /api/ocr/{id}/status

// Transactions
GET    /api/transacoes?page=1&limit=20
GET    /api/transacoes/{id}
POST   /api/transacoes
PATCH  /api/transacoes/{id}
DELETE /api/transacoes/{id}

// Sync
POST   /api/sync
```

### Error Handling

The app includes comprehensive error handling:

```typescript
import { parseApiError, getErrorMessage, shouldRetry } from '@/utils';

try {
  const data = await documentsApi.list();
} catch (error) {
  const errorResponse = parseApiError(error);
  const userMessage = getErrorMessage(error);
  
  if (shouldRetry(error)) {
    // Retry logic
  }
}
```

## Authentication

### Token Management

- Tokens are stored in AsyncStorage
- Auto-refresh happens 5 minutes before expiry
- Failed refresh triggers re-login
- Logout clears all stored credentials

### Login Flow

```typescript
import { useAuth } from '@/hooks';

function LoginComponent() {
  const { login, status, error } = useAuth();
  
  const handleLogin = async (email: string, password: string) => {
    try {
      await login({ email, password });
    } catch (err) {
      console.error(err);
    }
  };
}
```

## Database

### WatermelonDB Setup

WatermelonDB enables offline-first sync:

```typescript
// src/db/schema.ts defines models
// src/db/models/ contains model implementations

import { useLiveQuery } from '@nozbe/watermelondb/react';
import { db } from '@/db/schema';

function DocumentsList() {
  const documents = useLiveQuery(
    () => db.collections.get('documents').query()
  );
}
```

## Validation

Input validation uses Zod:

```typescript
import { validateCredentials, validateEmail } from '@/utils';

const { valid, errors } = validateCredentials(email, password);
if (!valid) {
  console.error(errors);
}
```

## Testing

### Run Tests

```bash
npm test
```

### Test with Coverage

```bash
npm run test:coverage
```

## Linting

### Check Code Style

```bash
npm run lint
```

### Fix Style Issues

```bash
npm run lint:fix
```

### Type Checking

```bash
npm run type-check
```

## Building

### Android Development Build

```bash
npm run build:preview
```

### Android Production Build

```bash
npm run build:production
```

### Web Export

```bash
npm run web
```

## Deployment

### Using EAS Build

```bash
# Configure EAS (one-time setup)
eas build:configure

# Build for Android
npm run build:android

# Submit to Google Play (requires setup)
npm run submit
```

See [EAS Build Documentation](https://docs.expo.dev/build/introduction/) for detailed instructions.

## Security Considerations

1. **Token Storage**: Tokens are stored in AsyncStorage (not secure for production)
   - For production, use Expo Secure Store or react-native-secure-storage
   
2. **HTTPS**: Always use HTTPS for production API endpoints

3. **Permissions**: The app requests:
   - Camera (for document capture)
   - Internet (for API calls)

4. **Session Timeout**: Implement session timeout in production (see `APP_CONFIG.SECURITY.SESSION_TIMEOUT`)

## Troubleshooting

### Connection Issues

If the app can't connect to the API:

1. Verify the desktop API is running
2. Check the API endpoint URL format (include http:// or https://)
3. Ensure devices are on the same network
4. Disable firewall if testing locally
5. Check network logs: Use React Native Debugger

### Build Issues

```bash
# Clear cache and rebuild
npm start -- --clear

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors

```bash
# Check type errors
npm run type-check

# Update type definitions
npm install --save-dev @types/react-native@latest
```

## Performance Optimization

- **Code Splitting**: Screens are lazy-loaded via React Navigation
- **Image Optimization**: Use React Native's Image component with proper sizing
- **List Performance**: Use FlatList for large document/transaction lists
- **Database Queries**: Use WatermelonDB indexes for frequently queried fields

## Contributing

1. Ensure code passes linting: `npm run lint:fix`
2. Add TypeScript types for new features
3. Update relevant documentation
4. Follow commit message format: `type(scope): description`

## License

Proprietary - CRMT

## Support

For issues or questions:
1. Check the API documentation for endpoint requirements
2. Review error logs in React Native Debugger
3. Verify desktop API is running and accessible

## Next Steps

Planned features:
- [ ] Biometric authentication
- [ ] Enhanced OCR results display
- [ ] Transaction categorization UI
- [ ] Property valuation tracking
- [ ] Offline-first document sync
- [ ] Voice input for transactions
- [ ] Document image compression
