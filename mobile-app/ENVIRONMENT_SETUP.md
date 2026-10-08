# Environment Setup Guide

Guia completo para configurar o ambiente de desenvolvimento para builds e releases do CRMT Mobile.

## Table of Contents

1. [Local Development Setup](#local-development-setup)
2. [CI/CD Setup](#cicd-setup)
3. [Firebase Configuration](#firebase-configuration)
4. [Google Play Setup](#google-play-setup)
5. [App Store Setup](#app-store-setup)
6. [Secret Management](#secret-management)

## Local Development Setup

### Prerequisites

```bash
# Node.js >= 18.0.0
node --version

# npm >= 9.0.0
npm --version

# Git
git --version
```

### Install Dependencies

```bash
# From project root
cd mobile-app

# Install npm dependencies
npm install

# Verify installation
npm run type-check
```

### Install EAS CLI

```bash
# Install globally
npm install -g eas-cli

# Verify installation
eas --version

# Login to Expo (required for builds)
eas login
```

### Install Expo CLI (Optional)

```bash
# Install globally
npm install -g expo-cli

# For running local development server
expo start
```

### Environment Files

Create local environment files for development:

```bash
# Copy .env.example to development environment
cp .env.example .env.development

# Edit for your local setup
nano .env.development
```

**Local Development (.env.development):**

```env
API_ENDPOINT=http://localhost:8000
API_TIMEOUT=30000
FIREBASE_API_KEY=dev-key-here
FIREBASE_PROJECT_ID=crmt-dev
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=debug
```

### Verify Setup

```bash
# Run tests
npm run test:ci

# Check linting
npm run lint

# Type checking
npm run type-check

# Build locally
npm run build:preview
```

## CI/CD Setup

### GitHub Actions Workflow

Create `.github/workflows/eas-build.yml`:

```yaml
name: EAS Build & Deploy

on:
  push:
    branches:
      - main
    paths:
      - 'mobile-app/**'
      - '.github/workflows/eas-build.yml'
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          cd mobile-app
          npm install
      
      - name: Run tests
        run: |
          cd mobile-app
          npm run test:ci
      
      - name: Lint
        run: |
          cd mobile-app
          npm run lint
      
      - name: Type check
        run: |
          cd mobile-app
          npm run type-check

  build-android:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install EAS CLI
        run: npm install -g eas-cli
      
      - name: Install dependencies
        run: |
          cd mobile-app
          npm install
      
      - name: Setup credentials
        env:
          GOOGLE_PLAY_SERVICE_ACCOUNT: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT }}
        run: |
          cd mobile-app
          echo "$GOOGLE_PLAY_SERVICE_ACCOUNT" > service-account.json
      
      - name: Build Android
        env:
          EAS_TOKEN: ${{ secrets.EAS_TOKEN }}
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          API_ENDPOINT_PRODUCTION: ${{ secrets.API_ENDPOINT_PRODUCTION }}
        run: |
          cd mobile-app
          eas build --platform android --profile production --non-interactive
```

### Environment Variables in GitHub Actions

Set these in GitHub repository secrets (Settings > Secrets and variables > Actions):

- `EAS_TOKEN` - EAS CLI authentication token
- `EXPO_TOKEN` - Expo authentication token  
- `GOOGLE_PLAY_SERVICE_ACCOUNT` - Google Play service account JSON
- `API_ENDPOINT_PRODUCTION` - Production API endpoint
- `FIREBASE_API_KEY_PRODUCTION` - Firebase API key
- And other environment-specific secrets

## Firebase Configuration

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a new project"
3. Enter project name: "CRMT Production"
4. Enable Google Analytics (optional)
5. Create project

### 2. Add Android App

1. In Firebase Console, click "Android" icon
2. Enter package name: `com.crmt.mobile`
3. Download `google-services.json`
4. Place in `mobile-app/` (not committed to git)

### 3. Add iOS App

1. In Firebase Console, click "iOS" icon
2. Enter bundle ID: `com.crmt.mobile`
3. Download `GoogleService-Info.plist`
4. Note the configuration values

### 4. Get Firebase Credentials

In Firebase Console > Project Settings:

- Copy API Key (Web)
- Copy Project ID
- Copy Auth Domain
- Copy Storage Bucket
- Copy Messaging Sender ID
- Copy App ID

### 5. Enable Firebase Services

In Firebase Console:

- **Firestore Database** (optional)
  - Create in production mode
  - Set security rules for app access

- **Firebase Analytics**
  - Auto-enabled (no setup needed)

- **Crash Reporting**
  - Auto-enabled (no setup needed)

- **Performance Monitoring**
  - Enable for tracking app performance

## Google Play Setup

### 1. Create Developer Account

1. Go to [Google Play Console](https://play.google.com/console)
2. Sign in with Google account
3. Complete developer registration
4. Pay one-time $25 fee
5. Accept agreements

### 2. Create Service Account

1. In Google Play Console, click "Settings" > "API access"
2. Click "Create service account"
3. Follow the link to Google Cloud Console
4. Create new service account: `crmt-mobile-releases`
5. Generate new key (JSON format)
6. Download and securely store the JSON file

### 3. Grant Permissions

1. Back in Google Play Console
2. Grant permissions to service account:
   - Release manager
   - Edit and delete draft apps
   - Manage releases

### 4. Create App Listing

1. Click "Create app"
2. Fill in app details:
   - Name: CRMT - Gestão Contábil
   - Default language: Portuguese (Brazil)
   - App type: Application (not game)
   - Category: Business
3. Complete store listing with:
   - Screenshots
   - Description
   - Privacy policy link

## App Store Setup

### 1. Enroll in Apple Developer Program

1. Go to [Apple Developer Program](https://developer.apple.com/programs/)
2. Enroll as individual or organization
3. Pay $99 annual fee
4. Complete verification process

### 2. Create App ID

1. Go to [Apple Developer Console](https://developer.apple.com/account)
2. Certificates, IDs & Profiles > Identifiers
3. Click "+"
4. Register new App ID:
   - Type: App IDs
   - App ID: com.crmt.mobile
   - Bundle ID: com.crmt.mobile
   - Capabilities: Camera, Network, etc.

### 3. Create Distribution Certificate

1. Certificates, IDs & Profiles > Certificates
2. Create new certificate:
   - Type: iOS Distribution (App Store and Ad Hoc)
   - Follow prompts to create CSR
   - Upload CSR
   - Download certificate
   - Install in Keychain

### 4. Create App Store Connect Record

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Apps > "+" (Create New App)
3. Fill in:
   - Name: CRMT - Gestão Contábil
   - Bundle ID: com.crmt.mobile
   - SKU: com.crmt.mobile
   - Language: Portuguese (Brazil)
4. Complete app information form

## Secret Management

### EAS Secrets

Store all sensitive credentials in EAS:

```bash
# View all secrets
eas secret:list

# Create new secret
eas secret:create --scope project --name MY_SECRET

# Update secret
eas secret:update --name MY_SECRET

# Delete secret
eas secret:delete --name MY_SECRET
```

### Environment Variables

**Do NOT commit to Git:**
- Private API keys
- Service account credentials
- Signing keys
- Passwords or tokens

**Use instead:**
- EAS secrets (for EAS builds)
- GitHub Actions secrets (for CI/CD)
- Environment files (locally, with .gitignore)

### Credential Rotation

Rotate credentials regularly:

1. **Service Accounts**
   ```bash
   # Generate new key in Google Cloud Console
   # Update in EAS secrets
   eas secret:update --name GOOGLE_PLAY_SERVICE_ACCOUNT
   ```

2. **API Keys**
   ```bash
   # Regenerate in Firebase Console
   # Update in EAS secrets
   eas secret:update --name FIREBASE_API_KEY_PRODUCTION
   ```

3. **App Store Credentials**
   - Create new app-specific password in Apple ID settings
   - Update in EAS secrets

## Verification Checklist

- [ ] Node.js >= 18 installed
- [ ] npm dependencies installed
- [ ] EAS CLI installed and authenticated
- [ ] Local environment files created
- [ ] Tests passing locally
- [ ] Linting passing
- [ ] Type checking passing
- [ ] Firebase project created and configured
- [ ] Google Play developer account set up
- [ ] Google Play service account created
- [ ] Apple Developer account enrolled
- [ ] App Store Connect app created
- [ ] EAS secrets configured
- [ ] GitHub Actions secrets configured

## Troubleshooting

### Node/npm Issues

```bash
# Update npm
npm install -g npm@latest

# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### EAS Authentication

```bash
# Clear EAS credentials
rm ~/.eas/credentials.json

# Re-authenticate
eas login
```

### Firebase Issues

- Verify package name matches app.json
- Check Firebase console for app registration
- Ensure API keys have proper restrictions

### Google Play Issues

- Verify service account has correct permissions
- Check service account JSON is valid
- Ensure app is registered in Google Play Console

## See Also

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Build and deployment instructions
- [BUILD_TROUBLESHOOTING.md](./BUILD_TROUBLESHOOTING.md) - Troubleshooting guide
- [app.json](./app.json) - App configuration
- [eas.json](./eas.json) - EAS build configuration
