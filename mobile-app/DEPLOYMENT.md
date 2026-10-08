# Deployment & Release Guide

Guia completo para build, signing e deployment do CRMT Mobile em Android e iOS stores.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Build Configuration](#build-configuration)
3. [Android Build & Deployment](#android-build--deployment)
4. [iOS Build & Deployment](#ios-build--deployment)
5. [Release Process](#release-process)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

```bash
# Install Expo CLI
npm install -g eas-cli

# Install Expo managed workflow
npm install -g expo-cli

# Authenticate with EAS
eas login
```

### Required Accounts

- **Google Play Developer Account** (~$25 one-time)
  - For Android app submissions
  - Requires Google Play Service Account JSON

- **Apple Developer Account** (~$99 annual)
  - For iOS app submissions
  - Requires Apple ID and app-specific passwords

- **Firebase Project** (free tier available)
  - For analytics and cloud services
  - Get credentials from Firebase Console

## Build Configuration

### 1. Setup EAS Secrets

Store sensitive credentials securely in EAS:

```bash
# Set production Android credentials
eas secret:create --scope project --name GOOGLE_PLAY_SERVICE_ACCOUNT

# Set production iOS credentials
eas secret:create --scope project --name APPLE_ID
eas secret:create --scope project --name APPLE_ID_PASSWORD
eas secret:create --scope project --name ASC_APP_ID

# Set Firebase credentials
eas secret:create --scope project --name FIREBASE_API_KEY_PRODUCTION
eas secret:create --scope project --name FIREBASE_PROJECT_ID
eas secret:create --scope project --name FIREBASE_AUTH_DOMAIN
eas secret:create --scope project --name FIREBASE_STORAGE_BUCKET
eas secret:create --scope project --name FIREBASE_MESSAGING_SENDER_ID
eas secret:create --scope project --name FIREBASE_APP_ID

# Set API endpoint
eas secret:create --scope project --name API_ENDPOINT_PRODUCTION

# Set release notes
eas secret:create --scope project --name RELEASE_NOTES_PT_BR
eas secret:create --scope project --name RELEASE_NOTES_EN_US
```

### 2. Verify Configuration Files

Ensure these files are properly configured:

- `app.json` - App metadata, permissions, and configuration
- `eas.json` - Build profiles and submit configurations
- `.env.production` - Production environment variables

### 3. Version Management

Update version before building:

```bash
# Automatically bumps version in package.json and app.json
./scripts/bump-version.sh patch  # or minor, major
```

## Android Build & Deployment

### Build Profiles

#### Development Build (Internal Distribution)

```bash
npm run build:preview
# or
eas build --platform android --profile preview
```

**Output:** APK for testing on physical devices/emulators

#### Production Build (Google Play)

```bash
npm run build:production
# or
eas build --platform android --profile production
```

**Output:** Android App Bundle (AAB) for Google Play Store

### Signing Configuration

Android signing is configured in `eas.json`:

- **Keystore Management:** EAS handles keystore creation and storage
- **App Signing by Google Play:** Automatically managed by Google Play Console
- **Credentials:** Stored in EAS secrets (GOOGLE_PLAY_SERVICE_ACCOUNT)

### Google Play Release Process

1. **Build for production:**
   ```bash
   npm run build:production
   ```

2. **Submit to beta track (internal testing):**
   ```bash
   eas submit --platform android --profile production
   ```

3. **Verify on Google Play Console:**
   - Go to Google Play Console
   - Navigate to "Internal Testing" > "Releases"
   - Review and promote to Beta or Production

4. **Rollout:**
   - Start with 10-25% staged rollout
   - Monitor crash rates and reviews
   - Gradually increase to 100% if stable

### Proguard Rules

Proguard configuration for code minification is handled by Expo EAS.

Create `android/app/proguard-rules.pro` if custom rules needed:

```proguard
# Keep Firebase rules
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Keep Realm database
-keep class io.realm.** { *; }

# Keep custom classes (optional)
-keep class com.crmt.** { *; }
```

## iOS Build & Deployment

### Prerequisites for iOS

1. **Apple Developer Account** with active membership
2. **App Identifiers** created in Apple Developer Console
3. **Signing Certificates and Provisioning Profiles** generated

### Build Profiles

#### Development Build (Simulator)

```bash
eas build --platform ios --profile development
```

**Output:** Simulator build for local testing

#### Production Build (TestFlight/App Store)

```bash
eas build --platform ios --profile production
```

**Output:** IPA for App Store distribution

### Code Signing

iOS code signing configuration:

- **Certificate:** Production certificate stored in Apple Developer account
- **Provisioning Profile:** App Store distribution profile
- **Team ID:** Apple Developer Team ID

EAS handles signing automatically. First build will prompt for credentials:

```bash
eas build --platform ios --profile production
```

Follow the interactive prompts to set up code signing.

### App Store Connect Setup

1. **Create App Records:**
   - App Name: CRMT - Gestão Contábil
   - Bundle ID: com.crmt.mobile
   - SKU: com.crmt.mobile

2. **Fill App Information:**
   - Description in Portuguese and English
   - Category: Business/Finance
   - Keywords: contábil, gestão, documentos, financeiro

3. **Privacy Policy:**
   - Upload privacy policy (required for App Store)
   - Use `/docs/privacy-policy.md` as template

4. **Screenshots & Preview:**
   - Provide 2-5 screenshots per language
   - iPhone 6.7" and iPad required
   - Must show app functionality clearly

5. **Metadata:**
   - Support email
   - Support website
   - Marketing website (optional)

### TestFlight Beta Testing

1. **Add Beta Testers:**
   ```bash
   # Via App Store Connect
   # Add email addresses of beta testers
   ```

2. **Build and Submit:**
   ```bash
   npm run build:production
   # Then manually submit via App Store Connect
   # or use:
   eas submit --platform ios --profile production
   ```

3. **Distribute via TestFlight:**
   - Select build in App Store Connect
   - Enable "Internal Testing"
   - Send invitations to testers

4. **Collect Feedback:**
   - Use TestFlight feedback feature
   - Gather crash reports
   - Test all functionality before production release

## Release Process

### 1. Release Checklist

Before every release, run:

```bash
./scripts/release-checklist.sh
```

This checks:
- All tests passing
- No console errors/warnings
- Code linting successful
- Build succeeds locally
- Version properly bumped
- Git repository clean
- All documentation updated

### 2. Create Release Branch

```bash
git checkout -b release/v1.0.0
```

### 3. Update Version

```bash
./scripts/bump-version.sh minor
git add package.json app.json
git commit -m "Phase 22.11: Bump version to 1.0.1"
```

### 4. Generate Changelog

```bash
./scripts/generate-changelog.sh v1.0.0
```

Manually review and edit `CHANGELOG.md` if needed.

### 5. Commit and Tag

```bash
git add CHANGELOG.md
git commit -m "Phase 22.11: Update changelog for v1.0.0"
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin release/v1.0.0
git push origin v1.0.0
```

### 6. Build and Submit

```bash
# Build for Android
npm run build:production

# Wait for build to complete
# Then submit to Google Play Beta
eas submit --platform android --profile production

# Build for iOS
eas build --platform ios --profile production

# Submit to TestFlight
# (Manual via App Store Connect or automated via EAS)
```

### 7. Monitor Release

- Monitor crash rates in Firebase Console
- Monitor reviews and ratings
- Be ready to hotfix if needed

### 8. Rollback Strategy

If critical issues are found:

```bash
# Revert tag and release branch
git revert v1.0.0

# Create hotfix branch
git checkout -b hotfix/v1.0.1

# Fix the issue
git add src/...
git commit -m "Fix critical bug from v1.0.0"

# Bump patch version
./scripts/bump-version.sh patch

# Build and submit hotfix
npm run build:production
eas submit --platform android --profile production
```

## Beta Testing

### Android Beta Track

1. **Build preview version:**
   ```bash
   npm run build:preview
   ```

2. **Submit to internal testing:**
   ```bash
   eas submit --platform android --profile preview
   ```

3. **Share build URL or APK with testers**

### iOS TestFlight

1. **Build for TestFlight:**
   ```bash
   eas build --platform ios --profile production
   ```

2. **Submit to TestFlight:**
   ```bash
   eas submit --platform ios --profile production
   ```

3. **Invite testers in App Store Connect:**
   - Create beta group
   - Add tester emails
   - Provide build notes

## Configuration Management

### Environment Variables

Production environment variables are stored as EAS secrets:

```bash
# View all secrets
eas secret:list

# Update a secret
eas secret:update --name FIREBASE_API_KEY_PRODUCTION

# Delete a secret
eas secret:delete --name OLD_SECRET
```

### Secure Credential Storage

Never commit secrets to Git:

- Use `.gitignore` to exclude `.env` files
- Store credentials only in EAS secrets
- Use GitHub Actions secrets for CI/CD
- Rotate credentials regularly

## Monitoring & Analytics

### Firebase Console

- Monitor app crashes and errors
- View user analytics
- Check real-time performance metrics
- Manage feature flags

### Google Play Console

- Monitor crash rates
- View user ratings and reviews
- Check ANR (Application Not Responding) rates
- Monitor active installations

### Sentry (Error Tracking)

Configure error tracking:

```typescript
import * as Sentry from "sentry-expo";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.ENVIRONMENT,
  tracesSampleRate: 1.0,
});
```

## Troubleshooting

### Common Build Issues

#### "Build failed: No signing certificate"

```bash
# Re-authenticate and set up code signing
eas build --platform ios --profile production --clean
```

#### "Java version mismatch"

EAS handles Java automatically. If issues persist:

```bash
# Check current build configuration
eas build:inspect --platform android --profile production
```

#### "Gradle build failed"

```bash
# View build logs
eas build:logs <BUILD_ID>

# Rebuild with clean cache
eas build --platform android --profile production --clear-cache
```

### Common Submit Issues

#### "Invalid signing certificate for production"

Ensure certificates are up to date in Apple Developer account.

#### "Google Play signing certificate mismatch"

Check that the correct service account is configured in EAS.

#### "Version code already exists"

Android requires incrementing version codes. Use:

```bash
./scripts/bump-version.sh patch
```

### Getting Help

1. Check EAS documentation: https://docs.expo.dev/eas/
2. Check build logs:
   ```bash
   eas build:logs <BUILD_ID>
   ```
3. Check submit logs:
   ```bash
   eas submit:logs <SUBMISSION_ID>
   ```

## See Also

- [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) - Detailed release checklist
- [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) - Environment setup guide
- [BUILD_TROUBLESHOOTING.md](./BUILD_TROUBLESHOOTING.md) - Detailed troubleshooting
- [app.json](./app.json) - App configuration
- [eas.json](./eas.json) - EAS build configuration
