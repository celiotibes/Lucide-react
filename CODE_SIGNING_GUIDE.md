# Code Signing & Release Configuration Guide

Comprehensive guide for code signing and releasing the Lucide React mobile application to iOS App Store and Google Play Store.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [iOS Code Signing](#ios-code-signing)
3. [Android Code Signing](#android-code-signing)
4. [EAS Build & Submit](#eas-build--submit)
5. [Certificate Management](#certificate-management)
6. [Release Checklist](#release-checklist)

---

## Prerequisites

### Required Tools

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to EAS
eas login

# Install Expo CLI
npm install -g expo-cli

# Verify installation
eas --version
expo --version
```

### Required Accounts

- ✅ Apple Developer Account ($99/year)
- ✅ Google Play Developer Account ($25 one-time)
- ✅ EAS Account (free with Expo account)

---

## iOS Code Signing

### Step 1: Create iOS App on Apple Developer

1. Visit [Apple Developer Console](https://developer.apple.com/account)
2. Go to **Certificates, Identifiers & Profiles**
3. Create new App ID: `com.crmt.mobile`
4. Enable App Capabilities:
   - Push Notifications
   - Keychain Sharing
   - Data Protection (Complete)

### Step 2: Create Signing Certificate

```bash
# EAS handles certificate creation automatically
eas certificates

# Select platform: iOS
# Choose action: Generate new

# Follow prompts to:
# 1. Create Apple ID application password
# 2. Generate distribution certificate
# 3. Generate provisioning profile
```

### Step 3: Manual Certificate Generation (Alternative)

```bash
# Generate private key
openssl genrsa -out private.key 2048

# Create certificate signing request (CSR)
openssl req -new -key private.key -out certificate.csr \
  -subj "/C=BR/ST=São Paulo/L=São Paulo/O=CRMT/CN=com.crmt.mobile"

# Sign CSR with Apple Developer (manual process in Apple Console)
# Download certificate as certificate.cer

# Combine key and certificate
openssl pkcs12 -export \
  -in certificate.cer \
  -inkey private.key \
  -out distribution.p12 \
  -name "CRMT Distribution Certificate"
```

### Step 4: Manage Provisioning Profiles

```bash
# List current profiles
eas credentials show --platform ios

# Update profiles
eas credentials

# Revoke certificate if needed
eas credentials --platform ios --action revoke
```

### Step 5: Configure app.json for iOS

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.crmt.mobile",
      "buildNumber": "1",
      "supportsTabletMode": true,
      "entitlements": {
        "aps-environment": "production",
        "keychain-access-groups": ["group.com.crmt.mobile"]
      },
      "privacy": {
        "NSCameraUsageDescription": "O app usa a câmera para capturar documentos",
        "NSPhotoLibraryUsageDescription": "O app acessa suas fotos para enviar documentos"
      }
    }
  }
}
```

### Step 6: Build for iOS

```bash
# Build for internal distribution (simulator/ad-hoc)
eas build --platform ios --profile preview

# Build for TestFlight distribution
eas build --platform ios --profile staging

# Build for App Store distribution
eas build --platform ios --profile production
```

### Step 7: Upload to TestFlight

```bash
# Automatically upload to TestFlight after build
eas submit --platform ios

# Or submit existing build
eas submit --platform ios --id <build-id>
```

---

## Android Code Signing

### Step 1: Create Android Keystore

```bash
# Generate new Android keystore
keytool -genkey-dname "CN=CRMT Mobile, OU=Engineering, O=CRMT, L=São Paulo, ST=SP, C=BR" \
  -alias crmt-key \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10950 \
  -keystore crmt-keystore.jks \
  -storepass "your-secure-keystore-password" \
  -keypass "your-secure-key-password"

# Verify keystore
keytool -list -v -keystore crmt-keystore.jks \
  -storepass "your-secure-keystore-password"
```

### Step 2: Store Keystore Securely

```bash
# NEVER commit keystore to version control
echo "crmt-keystore.jks" >> .gitignore

# Store in secure password manager
# Location: ~/.android/crmt-keystore.jks (recommended)
# Or use environment variable: $KEYSTORE_PATH
```

### Step 3: Configure eas.json for Android

```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "aab",
        "autoIncrement": true,
        "gradleCommand": ":app:bundleRelease"
      }
    }
  }
}
```

### Step 4: Configure app.json for Android

```json
{
  "expo": {
    "android": {
      "package": "com.crmt.mobile",
      "versionCode": 1,
      "versionName": "1.0.0",
      "permissions": [
        "android.permission.CAMERA",
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE"
      ]
    }
  }
}
```

### Step 5: Build for Android

```bash
# Build APK for testing
eas build --platform android --profile preview

# Build AAB for Play Store
eas build --platform android --profile production
```

### Step 6: Upload to Google Play Console

```bash
# Automatically upload to Play Store
eas submit --platform android

# Manual submission
# 1. Download signed AAB from EAS
# 2. Go to Play Console
# 3. Upload to Internal Testing track first
# 4. After verification, promote to production
```

---

## EAS Build & Submit

### Complete Build Workflow

```bash
# 1. Prepare build
eas build --platform all --profile production

# 2. Check build status
eas build:list

# 3. Download build artifacts
eas build:view <build-id>

# 4. Submit to app stores
eas submit --platform all --id <build-id>

# 5. Check submission status
eas submit:list
```

### Build Configuration for Production

```bash
# Build with specific profile
eas build \
  --platform all \
  --profile production \
  --message "Version 1.0.0 - Security Hardening Release"

# Build with environment variables
eas build \
  --platform all \
  --profile production \
  --set API_ENDPOINT=https://api.crmt.app \
  --set FIREBASE_PROJECT_ID=crmt-prod
```

### Submit Configuration

```bash
# Submit with metadata
eas submit \
  --platform all \
  --id <build-id> \
  --message "Submission for version 1.0.0"

# Preview submission (dry run)
eas submit --platform ios --id <build-id> --no-wait
```

---

## Certificate Management

### Renew Certificates

```bash
# Check certificate expiration
eas credentials show --platform ios

# Renew before expiration (typically yearly)
eas credentials update --platform ios
```

### Key Rotation Policy

```
Certificate Pins:
├── Primary: Rotate every 12 months
├── Backup: Maintain 2 backup pins
├── Pre-notification: 30 days before rotation
└── Implementation: Update app.json + new build

Encryption Keys:
├── Master Key: Device-specific (no rotation)
├── Derived Keys: Rotate with master key
└── Session Keys: Auto-rotate on new session

JWT Tokens:
├── Access Token: Expires 15 minutes
├── Refresh Token: Expires 7 days
└── Auto-refresh: Transparent to user
```

### Certificate Pinning Updates

```typescript
// Update certificate pins in app.json when certificates are rotated
{
  "expo": {
    "security": {
      "certificatePinning": {
        "primaryDomains": [
          {
            "domain": "api.crmt.app",
            "pins": [
              "sha256/new_certificate_pin_here="
            ]
          }
        ],
        "backupDomains": [
          {
            "domain": "backup-api.crmt.app",
            "pins": [
              "sha256/backup_certificate_pin_here="
            ]
          }
        ]
      }
    }
  }
}
```

---

## Release Checklist

### Pre-Release Verification

- [ ] All tests passing (`npm run test`)
- [ ] Security tests passing (90% coverage)
- [ ] No security vulnerabilities (`npm audit`)
- [ ] Version number updated in app.json
- [ ] Changelog updated
- [ ] Privacy policy current
- [ ] Security policy updated
- [ ] Certificate pins valid and not expired

### Pre-Build Checks

- [ ] Code reviewed and approved
- [ ] All dependencies updated
- [ ] Environment variables configured
- [ ] Encryption keys generated and stored
- [ ] Firebase config updated
- [ ] API endpoints verified
- [ ] Keystore password stored securely

### iOS Release Process

```bash
# 1. Verify iOS configuration
eas build --platform ios --profile production --dry-run

# 2. Build release
eas build --platform ios --profile production

# 3. Monitor build status
watch -n 10 "eas build:list --platform ios | head -5"

# 4. Submit to TestFlight
eas submit --platform ios --id <build-id>

# 5. Test on TestFlight (2-3 days)

# 6. Submit to App Store
eas submit --platform ios --id <build-id> --submit-for-review
```

### Android Release Process

```bash
# 1. Verify Android configuration
eas build --platform android --profile production --dry-run

# 2. Build release AAB
eas build --platform android --profile production

# 3. Monitor build status
watch -n 10 "eas build:list --platform android | head -5"

# 4. Submit to Play Store
eas submit --platform android --id <build-id>

# 5. Release process in Play Console
# - Internal Testing (1-2 hours)
# - Staged rollout (optional, 25% → 50% → 100% over days)
# - Full production release
```

### Post-Release

- [ ] Monitor app analytics
- [ ] Check crash reports
- [ ] Monitor security alerts
- [ ] Verify certificate pins working
- [ ] Confirm privacy compliance
- [ ] Update release notes
- [ ] Archive release artifacts

---

## Environment Variables for Signing

Create `.env.production` file (never commit):

```bash
# Keystore Configuration
KEYSTORE_PATH=$HOME/.android/crmt-keystore.jks
KEYSTORE_PASSWORD=your-secure-keystore-password
KEY_ALIAS=crmt-key
KEY_PASSWORD=your-secure-key-password

# Apple Signing
APPLE_ID=your-apple-id@example.com
APPLE_ID_PASSWORD=your-app-specific-password
APPLE_TEAM_ID=ABCDEFGHIJ

# Google Play
GOOGLE_PLAY_KEY_FILE=$HOME/.android/google-play-key.json

# EAS
EAS_PROJECT_ID=your-eas-project-id
```

---

## Troubleshooting

### Certificate Errors

```bash
# Clear certificate cache and regenerate
eas credentials --platform ios --action revoke
eas credentials --platform ios --action generate

# Verify certificate validity
eas credentials show --platform ios
```

### Build Failures

```bash
# Check build logs
eas build:list --platform ios --limit 5

# View detailed logs
eas build:view <build-id>

# Rebuild with verbose output
eas build --platform ios --verbose
```

### Submission Errors

```bash
# Check submission status
eas submit:list --platform ios

# View submission logs
eas submit:view <submission-id>

# Resubmit after fixing issues
eas submit --platform ios --id <build-id> --resubmit
```

---

## References

- [EAS Documentation](https://docs.expo.dev/eas/)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policies](https://play.google.com/about/developer-content-policy/)
- [Certificate Pinning Best Practices](https://owasp.org/www-community/attacks/Certificate_and_Public_Key_Pinning)
- [Code Signing Best Practices](https://developer.apple.com/documentation/security/code_signing_and_notarization)

---

**Last Updated**: October 8, 2026  
**Status**: Production Ready  
**Next Review**: January 8, 2027
