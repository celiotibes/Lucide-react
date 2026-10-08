# CRMT Mobile App - Setup & Development Guide

## Quick Start

### 1. Prerequisites Setup

```bash
# Install Node.js (v18 or higher)
# https://nodejs.org/

# Install Expo CLI globally
npm install -g expo-cli

# Optional: Install Expo Go app on your phone
# https://expo.dev/download
```

### 2. Clone & Install

```bash
# Navigate to mobile app directory
cd /home/user/Lucide-react/mobile-app

# Install dependencies
npm install

# This will install:
# - React Native & Expo
# - Navigation libraries
# - UI components (React Native Paper)
# - API client (Axios)
# - Type checking (TypeScript)
# - Validation (Zod)
# - Database (WatermelonDB - when needed)
```

### 3. Start Development Server

```bash
# Start Expo development server
npm start

# This will display a QR code and options:
# Press 'a' for Android emulator/device
# Press 'w' for web browser
# Scan QR code with Expo Go app (iOS/Android)
```

### 4. First Launch Setup

When you first launch the app:

1. **Setup Wizard Screen** appears
2. Enter your desktop CRMT API endpoint:
   - Local: `http://localhost:8000`
   - Network: `http://192.168.1.100:8000` (adjust IP)
   - Remote: `https://crmt.example.com`
3. Click "Test Connection"
4. On success, click "Continue to Login"
5. Enter your credentials and sign in

## Development Workflow

### Making Code Changes

1. **Edit TypeScript files** in `src/`
2. **Changes auto-reload** via Expo Metro
3. **Type checking**: Run `npm run type-check`
4. **Linting**: Run `npm run lint:fix`

### Adding New Screens

```typescript
// 1. Create screen component
// src/screens/documents/DocumentDetailScreen.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

export const DocumentDetailScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text>Document Detail</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});

// 2. Add to navigation
// src/App.tsx - add to appropriate stack navigator
```

### Adding API Endpoints

```typescript
// 1. Define types in src/types/api.ts
// 2. Add endpoint in src/api/config.ts
// 3. Create API methods in src/api/documents.ts

export const documentsApi = {
  async myNewMethod() {
    const response = await apiClient.getAxiosInstance().get('/api/endpoint');
    return response.data;
  },
};

// 4. Use in component
import { documentsApi } from '@/api';

const response = await documentsApi.myNewMethod();
```

### Using Authentication

```typescript
import { useAuth } from '@/hooks';

export function MyComponent() {
  const { user, token, login, logout, status } = useAuth();

  if (status === 'loading') {
    return <Text>Loading...</Text>;
  }

  if (status === 'unauthenticated') {
    return <Text>Please log in</Text>;
  }

  return (
    <View>
      <Text>Welcome, {user?.nome}</Text>
    </View>
  );
}
```

## Testing

### Run Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Type Checking

```bash
# Check for TypeScript errors
npm run type-check

# This runs without compilation, just type checking
```

### Linting & Format

```bash
# Check code style
npm run lint

# Auto-fix issues
npm run lint:fix

# Prettier automatically formats on save if configured in IDE
```

## Building for Android

### Prerequisites

- Android SDK installed
- Android emulator OR physical device connected
- USB debugging enabled (for physical device)

### Build Steps

```bash
# Install Android dependencies (one-time)
npm install

# Build APK for testing
npm run build:preview

# Build AAB for Google Play
npm run build:production

# Build and sign APK locally
eas build --platform android --profile preview
```

### Run on Connected Device

```bash
# Build and run on connected Android device
npm run android

# Or with Expo:
expo run:android
```

### Emulator Setup

```bash
# Start Android emulator (macOS/Linux/Windows)
$ANDROID_SDK/emulator/emulator -avd emulator-name

# Then run app
npm run android
```

## Debugging

### React Native Debugger

```bash
# Download: https://github.com/jhen0409/react-native-debugger

# Usage:
# 1. Open React Native Debugger
# 2. Press Ctrl+Cmd+Z (macOS) or Ctrl+M (Android) in app
# 3. Select "Open Debugger"
# 4. Use Chrome DevTools for debugging
```

### Console Logging

```typescript
// In your app
console.log('Debug message');
console.warn('Warning message');
console.error('Error message');

// View in:
# Expo Terminal output
# React Native Debugger console
# adb logcat (Android)
```

### Network Debugging

```bash
# Use Expo Network Debugger
# 1. Start app with npm start
# 2. Open http://localhost:19000 in browser
# 3. View network requests

# Or use Charles Proxy or mitmproxy for HTTPS
```

### AsyncStorage Inspection

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

// In console:
AsyncStorage.getAllKeys().then(keys => {
  AsyncStorage.multiGet(keys).then(store => {
    console.log(JSON.stringify(store, null, 2));
  });
});
```

## Environment Configuration

### .env.local (Create this file)

```env
# API Configuration
EXPO_PUBLIC_API_ENDPOINT=http://192.168.1.100:8000
EXPO_PUBLIC_API_TIMEOUT=30000

# Logging
EXPO_PUBLIC_LOG_LEVEL=info

# Features (when implemented)
EXPO_PUBLIC_ENABLE_OCR=true
EXPO_PUBLIC_ENABLE_OFFLINE=true
```

### Access in Code

```typescript
import Constants from 'expo-constants';

const apiEndpoint = Constants.expoConfig?.extra?.apiEndpoint;
const timeout = Constants.expoConfig?.extra?.apiTimeout;
```

## Project Dependencies

### Core Dependencies

| Package | Purpose |
|---------|---------|
| react-native | Mobile framework |
| expo | Managed native development |
| @react-navigation | Screen navigation |
| react-native-paper | Material Design UI |
| axios | HTTP client |
| zod | Type validation |
| @react-native-async-storage | Local storage |

### Optional Dependencies (Planned)

| Package | Purpose |
|---------|---------|
| watermelondb | Offline database |
| @react-native-community/camera | Camera capture |
| react-native-image-picker | Image selection |
| react-native-document-scanner | Document scanning |

## Troubleshooting

### "Cannot find module" error

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm start -- --clear
```

### "API endpoint not responding"

1. Verify desktop CRMT API is running
2. Check firewall allows connection
3. Verify network connectivity between devices
4. Use correct IP address (not localhost from phone)
5. Check API endpoint URL format

### "Type error" in TypeScript

```bash
# Run type checker
npm run type-check

# Ensure all types are exported from src/types/index.ts
```

### Expo Connection Issues

```bash
# Kill Expo process
lsof -i :8081
kill -9 <PID>

# Restart
npm start -- --clear
```

### Android Build Failures

```bash
# Clean build
eas build --platform android --profile preview --clear-cache

# Check Java version
java -version  # Should be 11 or 17

# Update EAS CLI
npm install -g eas-cli@latest
```

## IDE Setup

### VS Code Recommended Extensions

```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode-remote.remote-containers",
    "React-Native.react-native-tools"
  ]
}
```

### Settings.json for TypeScript

```json
{
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": true
    }
  }
}
```

## Performance Tips

1. **Use React.memo** for expensive components
2. **Optimize images** before adding to assets
3. **Lazy load screens** (React Navigation does this)
4. **Batch API calls** when possible
5. **Use FlatList** instead of ScrollView for long lists
6. **Profile with React Native Debugger**

## Next Steps

1. ✅ Set up development environment
2. ✅ Configure API endpoint via setup wizard
3. ✅ Test login with desktop API credentials
4. 📋 Implement dashboard screens
5. 📋 Add document upload functionality
6. 📋 Implement transaction management
7. 📋 Set up WatermelonDB for offline sync
8. 📋 Test on physical Android device
9. 📋 Configure EAS for production builds

## Getting Help

- **Expo Docs**: https://docs.expo.dev
- **React Native Docs**: https://reactnative.dev
- **React Navigation**: https://reactnavigation.org
- **TypeScript Handbook**: https://www.typescriptlang.org/docs
- **Zod Documentation**: https://zod.dev

## Project Structure Reference

```
mobile-app/
├── src/
│   ├── api/              ← API endpoints & client
│   ├── screens/          ← Navigation screens
│   ├── components/       ← Reusable components
│   ├── hooks/            ← Custom hooks
│   ├── store/            ← State management
│   ├── types/            ← TypeScript definitions
│   ├── utils/            ← Utility functions
│   ├── constants/        ← App constants
│   └── App.tsx           ← Root component
├── __tests__/            ← Test files
├── assets/               ← Images, icons, fonts
├── app.json              ← Expo config
├── package.json          ← Dependencies
├── tsconfig.json         ← TypeScript config
├── README.md             ← Overview
└── API_INTEGRATION.md    ← API reference
```

## Common Commands Reference

```bash
# Development
npm start                 # Start Expo server
npm run lint:fix          # Fix code style
npm run type-check        # Check types
npm test                  # Run tests

# Building
npm run build:android     # Build for Android
npm run build:production  # Production build
npm run web               # Export as web app

# Cleanup
npm start -- --clear      # Clear cache
```

Enjoy developing the CRMT Mobile App!
