# Installation Guide - Lucide React Mobile Application

## System Requirements

### Minimum Requirements

**iOS**:
- iOS 13.0 or later
- iPhone 6s or later
- 200 MB free storage space
- 2 GB RAM

**Android**:
- Android 8.0 (API level 26) or later
- 200 MB free storage space
- 2 GB RAM

### Recommended Specifications

**iOS**:
- iOS 15.0 or later
- iPhone 11 or later
- 500 MB free storage space
- 3 GB RAM

**Android**:
- Android 11.0 (API level 30) or later
- 500 MB free storage space
- 4 GB RAM

## Installation Steps

### iOS Installation

#### Via App Store (Recommended)

1. Open **App Store** on your iPhone
2. Tap the **Search** tab at the bottom
3. Search for "Lucide React" or "Lucide"
4. Tap the app icon when found
5. Tap the **Get** button (or cloud icon if previously purchased)
6. Authenticate using Face ID, Touch ID, or Apple ID password
7. Wait for download and installation to complete
8. Tap **Open** to launch the app

#### Via TestFlight (Beta)

1. Install **TestFlight** app from App Store if not already installed
2. Open the TestFlight beta invitation link (provided by email)
3. Tap **Accept** to join the beta
4. Open TestFlight app
5. Tap **Lucide React**
6. Tap **Install**
7. Wait for installation and tap **Open**

#### Manual Installation (Development)

```bash
# Clone repository
git clone https://github.com/celiotibes/lucide-react.git
cd lucide-react

# Install dependencies
npm install

# Install iOS dependencies
cd ios && pod install && cd ..

# Open in Xcode
open ios/LucideReact.xcworkspace

# Select target device/simulator
# Press Play to build and run
```

### Android Installation

#### Via Google Play Store (Recommended)

1. Open **Google Play Store** on your Android device
2. Tap the **Search** icon
3. Search for "Lucide React" or "Lucide"
4. Tap the app when found
5. Tap **Install**
6. Review the requested permissions
7. Tap **Install** to confirm
8. Wait for installation to complete
9. Tap **Open** to launch the app

#### Via Internal Testing (Beta)

1. Join the beta testing group via email link
2. Open the Google Play Store link provided
3. Tap **Join as tester** or **Become a tester**
4. Wait a few minutes for access to be granted
5. Go to App Store page for Lucide React
6. Select **Install** under the beta version
7. Complete installation
8. Open the app

#### Manual Installation (Development)

```bash
# Clone repository
git clone https://github.com/celiotibes/lucide-react.git
cd lucide-react

# Install dependencies
npm install

# Run on Android emulator
npm run android

# Or connect physical device and run
npm run android -- --deviceId=<device_id>
```

## Post-Installation Setup

### 1. Grant Required Permissions

**iOS**:
1. Open Settings
2. Navigate to Privacy
3. Grant these permissions:
   - Camera: Required for document capture
   - Photos: Required for document access
   - Contacts: Optional for document organization
   - Microphone: Not required (may appear due to React Native)

**Android**:
1. Open Settings
2. Navigate to Apps
3. Select Lucide React
4. Tap Permissions
5. Grant these permissions:
   - Camera: Required for document capture
   - Storage (Photos): Required for document access
   - Contacts: Optional for document organization
   - Location: Optional for geotagging

### 2. Create Account

1. Open the Lucide React app
2. Tap "Create Account" or "Sign Up"
3. Enter your email address
4. Create a strong password (minimum 8 characters, mix of types)
5. Verify your email via the sent link
6. Complete your profile with optional information
7. Tap "Get Started"

### 3. Configure Initial Settings

1. Go to the Settings tab
2. Review and adjust:
   - **Notification Settings**: Enable desired notifications
   - **Sync Settings**: Set sync frequency and WiFi-only option
   - **Storage Settings**: Choose local storage preference
   - **Capture Settings**: Select preferred image quality
   - **Backup Settings**: Configure backup frequency

### 4. First Document Capture

1. Tap the **Capture** tab
2. Position your camera toward a document
3. Ensure adequate lighting
4. Tap the camera button to capture
5. Review the captured image
6. Tap "Save" to create the document
7. Wait for OCR processing to complete
8. Review extracted text and make corrections if needed

## Troubleshooting Installation

### Installation Hangs or Fails

**iOS**:
- Ensure 500 MB of available storage
- Close App Store completely and reopen
- Try installing over WiFi instead of cellular
- Restart device and retry installation
- Update device OS to latest version

**Android**:
- Ensure 500 MB of available storage
- Clear Google Play Store cache (Settings > Apps > Google Play Store > Storage > Clear Cache)
- Disconnect and reconnect Google account
- Try installing on WiFi connection
- Update device OS and Google Play Services

### App Crashes on Launch

**iOS**:
- Tap "Offload App" from device settings (removes app but keeps data)
- Tap "Reinstall App" from device settings
- Or delete app and reinstall from App Store

**Android**:
- Go to Settings > Apps > Lucide React
- Tap "Uninstall Updates"
- Or uninstall completely and reinstall

### Cannot Grant Permissions

**iOS**:
- Go to Settings > Lucide React > Permissions
- Enable required permissions
- Close app completely and reopen

**Android**:
- Go to Settings > Apps > Lucide React > Permissions
- Enable required permissions
- Restart the app

### Cannot Create Account

- Verify email address is correct and not already registered
- Check email for verification link (check spam folder)
- Ensure password meets requirements (8+ characters)
- Check internet connection
- Try again in a few minutes if service is slow

## Upgrading the Application

### iOS Updates

1. Open **App Store**
2. Tap the account icon
3. Scroll to "Available Updates"
4. Find "Lucide React"
5. Tap "Update"
6. Authenticate and wait for installation

**Note**: Enable automatic updates in Settings > [Your Name] > Media & Purchases > Automatic Downloads

### Android Updates

1. Open **Google Play Store**
2. Tap your profile icon
3. Tap "Manage apps & device"
4. Find "Lucide React" under "Updates available"
5. Tap "Update"
6. Wait for installation to complete

**Note**: Enable automatic updates in Play Store Settings > Network preferences > Auto-update apps > "Over any network" or "Over WiFi only"

## Storage Management

### Check Available Storage

**iOS**:
1. Go to Settings > General > iPhone Storage
2. View available space at the top
3. Lucide React usage shown in apps list

**Android**:
1. Go to Settings > Storage
2. View available space
3. Tap "Apps" to see per-app usage

### Free Up Space

If running low on storage:

1. **Delete Old Documents**: Remove documents no longer needed
2. **Clear App Cache**: Settings > [App] > Storage > Clear Cache
3. **Archive Old Documents**: Move to archive in app
4. **Reduce Image Quality**: Lower capture resolution in settings
5. **Delete Other Apps**: Remove unused applications

## Uninstallation

### iOS

1. Press and hold the app icon on Home Screen
2. Tap "Remove"
3. Select "Remove from Home Screen" or "Remove App"
4. Confirm deletion

**Note**: App data is deleted when you "Remove App". Choose "Remove from Home Screen" to keep data.

### Android

1. Go to Settings > Apps
2. Select "Lucide React"
3. Tap "Uninstall"
4. Confirm deletion

**Note**: Your cloud documents remain safe and can be restored by reinstalling and signing in.

## Support

If you encounter installation issues:

1. Check [Troubleshooting Guide](../TROUBLESHOOTING.md)
2. Visit [Help Center](https://lucide.app/help)
3. Contact support at support@lucide.app
4. Phone: +1-800-LUCIDE-1

---

*Last Updated: October 2024*
*Version: 2.0*
*Installation Guide for Lucide React*
