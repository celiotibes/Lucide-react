# CRMT Mobile App - Installation Guide

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Pre-Installation Checklist](#pre-installation-checklist)
3. [Installation for Android](#installation-for-android)
4. [Installation for iOS](#installation-for-ios)
5. [Post-Installation Configuration](#post-installation-configuration)
6. [Initial Setup Walkthrough](#initial-setup-walkthrough)
7. [Verification Steps](#verification-steps)
8. [Uninstallation](#uninstallation)
9. [Troubleshooting Installation](#troubleshooting-installation)

---

## System Requirements

### Android Requirements

**Minimum**:
- OS Version: Android 10 (API Level 29) or higher
- RAM: 2GB minimum (4GB recommended)
- Storage: 150MB free for app + data
- Screen: 4.5" or larger diagonal
- Processor: ARM v7 or ARM v8

**Recommended**:
- OS Version: Android 12 or higher
- RAM: 4GB or more
- Storage: 500MB+ free
- Screen: 5" or larger
- Processor: Recent processor (less than 3 years old)

**Optional Features**:
- Biometric sensor (fingerprint or face recognition) - for faster login
- NFC chip - for card scanning (future feature)
- Camera flash - for better document capture

**Supported Devices** (Examples):
- Google Pixel 4, 5, 6, 7, 8
- Samsung Galaxy S10, S20, S21, S22, S23, S24
- OnePlus 8, 9, 10, 11, 12
- Motorola Moto G7 or newer
- Sony Xperia 10, 5, 1
- Most other devices running Android 10+

**Device Compatibility Check**:
```bash
# On your Android device:
1. Open Google Play Store app
2. Search for "CRMT Mobile"
3. If you see "Install" button, device is compatible
4. If you see "This app isn't compatible with this device", 
   your device doesn't meet requirements
```

### iOS Requirements

**Minimum**:
- OS Version: iOS 15.0 or higher
- RAM: 2GB minimum (3GB recommended)
- Storage: 150MB free for app + data
- Screen: iPhone SE or equivalent size
- Processor: A9 processor or newer

**Recommended**:
- OS Version: iOS 16 or higher
- RAM: 4GB or more
- Storage: 500MB+ free
- Screen: iPhone 12 or newer
- Processor: A13 Bionic or newer

**Optional Features**:
- Face ID or Touch ID - for faster login
- Telephoto camera - for better zoom on documents
- LiDAR scanner - for document detection

**Supported Devices** (Examples):
- iPhone XS, XS Max, XR and newer
- iPhone SE (2nd generation and newer)
- iPhone 11, 12, 13, 14, 15 series
- iPad Air (3rd generation and newer)
- iPad Pro 11" and 12.9"
- iPad (7th generation and newer)

**Device Compatibility Check**:
```
On your iOS device:
1. Open App Store app
2. Search for "CRMT Mobile"
3. If you see "Get" button, device is compatible
4. If you see "Requires iOS X.X or later", 
   update your iOS or use a newer device
```

### Network Requirements

**For Initial Setup**:
- Internet connection required (WiFi or cellular)
- Data transfer: ~50MB for initial download and account setup
- Connection speed: 2Mbps+ recommended

**For Daily Use**:
- Offline mode: Can work without internet for 1-2 days
- Sync: Requires internet to sync documents (any speed acceptable)
- Best experience: WiFi recommended for syncing large documents

**Network Compatibility**:
- Works with: WiFi (802.11 a/b/g/n/ac/ax), LTE, 5G, 4G/3G
- Does not require: VPN (but works with VPN)
- Certificate pinning: Incompatible with MITM proxies (feature, not bug)

---

## Pre-Installation Checklist

Before installing the app, verify you have:

### Device Preparation

- [ ] Device is running supported OS (Android 10+ or iOS 15+)
- [ ] Device has at least 150MB free storage
  - Check: Settings → Storage → Available
- [ ] Internet connection is working
  - Test: Open web browser and visit any website
- [ ] Phone number for account recovery (optional)
- [ ] Secondary email address (optional)

### Account Preparation

- [ ] Valid email address ready (you'll use this to log in)
- [ ] Password ideas noted (min 8 characters, mixed case + numbers)
- [ ] Know your organization name (if required)
- [ ] Have authorization code (if sent by admin)

### Storage Space

Verify sufficient space:

**Minimum Required**:
- App: 150MB
- Initial data cache: 50MB
- Operating system buffer: 100MB
- **Total: 300MB minimum free storage**

**Recommended for Comfortable Use**:
- App: 150MB
- Data storage: 500MB (for documents)
- Cache: 100MB
- Operating system buffer: 200MB
- **Total: 1GB free storage recommended**

**Check Storage Space**:

Android:
```
Settings → Storage → Available
Should show at least 300MB available
```

iOS:
```
Settings → General → iPhone Storage
Should show at least 300MB available
```

### Disable VPN (if applicable)

If using a VPN app:
- Certificate pinning will block connection
- Temporarily disable VPN for login
- Re-enable after initial setup if desired

---

## Installation for Android

### Step 1: Open Google Play Store

1. Locate and open the **Google Play Store** app
   - Icon looks like a colorful shopping bag
   - Pre-installed on most Android devices
   - If not found, search "Google Play Store" in app drawer

### Step 2: Search for the App

1. Tap the **Search** icon at the bottom (magnifying glass)
2. Type: `CRMT Mobile`
3. Tap **Search**
4. Look for app by "Accounting & Legal Mobile Solutions"
   - Icon should show business/document design
   - Version should be 1.0.0 or later

### Step 3: Review App Information

Before installing, review:

1. **Publisher**: "Accounting & Legal Mobile Solutions"
2. **Ratings**: Should have good rating (4+ stars)
3. **Permissions**: Required for camera, photos, storage
4. **Size**: Usually 150-200MB
5. **Requires Android**: 10.0 and up

**Do NOT install if**:
- Publisher is different
- Rating is below 3 stars
- Size is over 500MB

### Step 4: Install the App

1. Tap **Install** button (green button)
2. Review permissions popup:
   ```
   Google Play will use: Camera, Photos, Storage
   This is needed for document capture.
   ```
3. Tap **Accept** (or "Install" if no popup)
4. Wait for installation (progress bar shows)
   - Typical time: 1-2 minutes
   - Depends on internet speed

### Step 5: Grant Permissions (First Launch)

After installation, tap **Open**:

1. App launches for the first time
2. You may be asked for permissions:
   - **Camera**: For document capture ✓ Allow
   - **Photos**: For selecting images ✓ Allow
   - **Storage**: For saving data ✓ Allow
   - **Location**: Optional ○ Deny (if not needed)

3. Tap **Allow** for each permission prompt
   - App needs these to function properly

### Step 6: Create Account or Login

See "Initial Setup Walkthrough" section below for next steps.

---

## Installation for iOS

### Step 1: Open App Store

1. Locate and open the **App Store** app
   - Icon is white with blue app symbol
   - Pre-installed on all iPhones/iPads
   - Located on home screen or in Spotlight search

### Step 2: Search for the App

1. Tap **Search** tab at the bottom (magnifying glass)
2. Type: `CRMT Mobile` in search box
3. Tap **Search** or press return
4. Look for app by "Accounting & Legal Mobile Solutions"
   - Icon should show business/document design
   - Ensure correct publisher

### Step 3: Review App Information

Before installing, review:

1. **Publisher**: "Accounting & Legal Mobile Solutions"
2. **Rating**: Should have good rating (4+ stars)
3. **Requires**: iOS X.X or later (should show 15.0 or later)
4. **File Size**: Usually 150-200MB
5. **Screenshots**: Preview of app features
6. **Reviews**: Read recent user reviews (optional)

**Do NOT install if**:
- Publisher is unknown
- Requires older iOS version (sign of fake app)
- Size is unusually large (over 500MB)

### Step 4: Install the App

1. Tap **Get** button
2. Authenticate using one of:
   - **Face ID**: Look at device (fastest)
   - **Touch ID**: Place finger on home button
   - **Apple ID Password**: Enter password
3. Installation begins (may take 1-2 minutes)
4. Button changes to **Open** when complete

### Step 5: Open App for First Time

1. Tap **Open** button
2. App launches
3. You may see permission requests:
   ```
   "CRMT Mobile" Would Like to Access:
   - Your Camera
   - Your Photos
   - Your Location
   ```
4. Tap **Allow** for each (required permissions)
   - Camera: For document capture
   - Photos: For selecting images
   - Location: Optional

### Step 6: Create Account or Login

See "Initial Setup Walkthrough" section below for next steps.

---

## Post-Installation Configuration

### Automatic Initial Configuration

After first launch, the app automatically:

1. **Initializes Database**:
   - Creates local SQLite database
   - Sets up WatermelonDB tables
   - Takes 5-30 seconds

2. **Configures Storage**:
   - Sets up secure token storage
   - Creates cache directories
   - Prepares file system

3. **Tests Connectivity**:
   - Checks internet connection
   - Tests API connectivity
   - Validates certificate pinning

4. **Loads Settings**:
   - Applies default theme
   - Sets default language
   - Configures notifications

### Manual Configuration Options

**After successful login**, configure:

1. **App Theme**:
   - Settings → Appearance → Theme
   - Choose: Light, Dark, or System Default

2. **Language**:
   - Settings → Language
   - Select preferred language
   - Restart app for language to apply

3. **Notifications**:
   - Settings → Notifications
   - Toggle notifications on/off
   - Set notification sounds

4. **Biometric Authentication**:
   - Settings → Security → Set Up Biometric
   - Choose Fingerprint or Face Recognition
   - Scan biometric twice
   - Now can unlock app with biometric

5. **Sync Settings**:
   - Settings → Data → Sync Configuration
   - Adjust sync frequency
   - Enable/disable cellular sync
   - Set retry policy

---

## Initial Setup Walkthrough

### Screen 1: Welcome Screen

When app launches for first time:

1. See welcome message with app features
2. Two options:
   - **"Login"**: If you already have account
   - **"Sign Up"**: If creating new account

**Choose based on your situation**:
- If given account by organization: Choose "Login"
- If first-time user: Choose "Sign Up"

### Screen 2a: Login (Existing Account)

If you have existing account:

1. **Email Address**:
   - Tap field and enter your email
   - Used for all login attempts

2. **Password**:
   - Tap field and enter password
   - Case-sensitive (capital letters matter)
   - If forgotten: Tap "Forgot Password?" link

3. **Device Name**:
   - Optional: Enter device name (e.g., "My Phone")
   - Helps identify device if used on multiple devices

4. **Tap "Login"**:
   - App validates credentials
   - If successful: Proceeds to dashboard
   - If failed: Shows error message (see troubleshooting)

### Screen 2b: Sign Up (New Account)

If creating new account:

1. **Email Address**:
   - Tap field
   - Enter valid email (you'll verify this)
   - Example: `yourname@company.com`
   - Must be unique (not already in system)

2. **Password**:
   - Tap field
   - Create strong password:
     - Minimum 8 characters
     - Mix uppercase and lowercase
     - Include at least one number
     - Include at least one special character (!, @, #, etc.)
   - Example: `MyPass2024!`

3. **Confirm Password**:
   - Tap field
   - Re-enter same password
   - Must match password field above

4. **Full Name**:
   - Tap field
   - Enter your full name
   - Used for display and communications

5. **Organization** (if required):
   - Some organizations auto-assign
   - Others require selection
   - If selector appears: Choose your organization
   - If no option: May be auto-assigned later

6. **Terms & Conditions**:
   - Checkbox: "I agree to Terms of Service"
   - Checkbox: "I agree to Privacy Policy"
   - Tap both to enable signup
   - Links to full documents available

7. **Tap "Sign Up"**:
   - Account created
   - Welcome email sent to your email address
   - You'll be logged in automatically
   - May need to verify email (see next)

### Screen 3: Email Verification (If Required)

If your organization requires email verification:

1. See message: "Check your email to verify account"
2. Open your email app
3. Find email from `noreply@accounting-legal.com`
4. Tap **"Verify Email"** link in email
5. Link opens app or browser
6. You'll be notified when verified
7. Return to app (may need to re-login)

**If email doesn't arrive**:
- Wait 5 minutes (sometimes delayed)
- Check spam folder
- From app: Settings → Account → Resend Verification Email

### Screen 4: Biometric Setup (Optional)

If device has biometric sensor:

1. See prompt: "Set up biometric unlock?"
2. Choose:
   - **"Set Up Now"**: Recommended for faster login
   - **"Skip"**: Can set up later

3. If "Set Up Now":
   - Choose Fingerprint or Face Recognition
   - Follow device-specific setup
   - When completed: "Biometric enabled"

### Screen 5: Permissions

App requests required permissions:

1. **Camera**: For document capture
   - Tap **"Allow"**

2. **Photos/Media**: For selecting images
   - Tap **"Allow"**

3. **Storage**: For saving documents locally
   - Tap **"Allow"**

4. **Location**: Optional, can skip
   - Tap **"Allow"** if desired
   - Tap **"Deny"** if not needed

5. **Notifications**: For alerts
   - Tap **"Allow"** for notifications
   - Can customize later in Settings

### Screen 6: Dashboard

First time you see dashboard:

1. **Welcome Card**: "Welcome to CRMT Mobile"
   - Brief introduction
   - Tap X to dismiss

2. **Quick Stats**: Shows
   - Total documents: 0 (new account)
   - Pending transactions: 0
   - Sync status: "Synced"

3. **Quick Actions**: Buttons for
   - Capture New Document
   - Add Transaction
   - View Documents

4. **Getting Started Tips**: 
   - Suggestions for first actions
   - Tap any to get started

5. **Bottom Navigation**: Shows five tabs
   - Dashboard (home)
   - Documents
   - Transactions
   - Notifications
   - Settings

**Congratulations!** App is installed and configured!

---

## Verification Steps

### Verify Installation

After installation, confirm app is working:

1. **App Launches Successfully**:
   - Tap app icon
   - App opens within 5 seconds
   - No crash on launch

2. **Can Log In**:
   - Enter email and password
   - After 5-10 seconds: Dashboard appears
   - No error messages

3. **Dashboard Shows**:
   - Welcome message visible
   - Quick action buttons present
   - Bottom navigation appears

4. **Can Navigate**:
   - Tap "Documents" tab
   - See "No documents yet" message
   - Tap "Transactions" tab
   - Tap "Settings" tab

5. **Settings Accessible**:
   - Tap "Settings" tab
   - Tap "Account"
   - Should show your email and name

### Verify Internet Connection

```
In the app:
1. Go to Settings → Network Status
2. Should show "Connected"
3. Shows connection type: WiFi or Cellular
4. Signal strength shown

If "Offline":
1. Check device WiFi/cellular is ON
2. Try connecting to WiFi manually
3. Restart app
```

### Verify Permissions

```
Android:
1. Settings → Apps → CRMT Mobile
2. Tap "Permissions"
3. Check these are "Allowed":
   - Camera
   - Photos
   - Storage
4. If any "Denied": Tap and select "Allow"

iOS:
1. Settings → Privacy
2. Check each:
   - Camera → CRMT Mobile → Allow
   - Photos → CRMT Mobile → Allow
   - Location → CRMT Mobile → Allow (optional)
3. Change if needed
```

### Verify Database

```
In the app:
1. Go to Settings → Data
2. Tap "Storage Usage"
3. Should show database size
4. Should show last sync time
5. Manual "Sync Now" button works
```

### Verify Biometric (If Set Up)

```
1. Close app completely
2. Tap app icon to open
3. Should see biometric prompt
4. Use fingerprint or face recognition
5. If works: Biometric is configured
6. If fails: Try 2-3 times
   Then falls back to password
```

---

## Uninstallation

### Uninstall on Android

**Method 1: Using Google Play Store** (Recommended)
```
1. Open Google Play Store app
2. Tap your profile icon (top right)
3. Tap "Manage apps and device"
4. Find "CRMT Mobile" in list
5. Tap app name
6. Tap "Uninstall"
7. Confirm "Uninstall"
8. App is removed
```

**Method 2: Using Device Settings**
```
1. Go to Settings
2. Tap "Apps" or "Application Manager"
3. Find "CRMT Mobile" in list
4. Tap app name
5. Tap "Uninstall"
6. Confirm "Uninstall"
7. App is removed
```

**Method 3: From Home Screen**
```
Android 11+:
1. Long-press app icon on home screen
2. Tap "Uninstall"
3. Confirm "Uninstall"

Earlier Android:
1. Press and hold app icon
2. Drag to top "Remove" or "Uninstall"
3. Release
4. Confirm if prompted
```

### Uninstall on iOS

**Method 1: From App Library** (Recommended)
```
1. Open App Library (swipe right from home screen)
2. Find "CRMT Mobile" app
3. Press and hold app icon
4. Tap "Remove App"
5. Tap "Remove from Home Screen" or "Delete App"
6. If "Delete App": Confirm "Delete"
7. App is uninstalled
```

**Method 2: From Settings**
```
1. Open Settings
2. Tap "General"
3. Tap "iPhone Storage" or "iPad Storage"
4. Find "CRMT Mobile"
5. Tap app name
6. Tap "Delete App"
7. Confirm "Delete App"
```

**Method 3: From Home Screen**
```
1. Long-press app icon
2. Tap "Remove App"
3. Tap "Remove from Home Screen" OR "Delete App"
   (if Delete App: Confirm deletion)
4. App is uninstalled
```

### Clear All Data After Uninstall

This removes all local app data (optional):

**Android**:
- Uninstalling app usually removes all local data
- If you want to be thorough:
  - Go to Settings → Apps → CRMT Mobile
  - Tap "Storage" → "Clear Data"
  - Then uninstall

**iOS**:
- Uninstalling automatically removes all app data
- No additional steps needed

---

## Troubleshooting Installation

### Installation Fails / Hangs

**Problem**: Installation starts but never completes

**Solutions**:
```
1. Check Storage Space:
   - Need at least 300MB free
   - Clear space by deleting unused apps

2. Restart Device:
   - Turn off device
   - Wait 10 seconds
   - Turn back on
   - Try installing again

3. Clear Play Store Cache:
   Android:
   - Settings → Apps → Play Store
   - Tap Storage → Clear Cache
   - Try installing again

4. Use WiFi:
   - Cellular connection may be unstable
   - Connect to WiFi first
   - Try installing via WiFi

5. Check Google Account:
   Android:
   - Device must have Google Account logged in
   - Go to Settings → Accounts
   - If no Google Account: Add one
```

### "Device Not Compatible"

**Problem**: Play Store says device is incompatible

**Causes**:
- Device OS is too old
- Device architecture not supported
- Device lacks required features

**Solutions**:
```
1. Update Device OS:
   Android:
   - Settings → About → System Update
   - Install latest update if available
   
   iOS:
   - Settings → General → Software Update
   - Install latest update if available

2. Check Requirements:
   - Device must run Android 10+ or iOS 15+
   - If older: Cannot install (need new device)

3. Try Web Version:
   - Some organizations offer web version
   - Can use in mobile web browser
   - Ask your organization
```

### Installation Succeeds But App Won't Open

**Problem**: App installed but crashes on launch

**Solutions**:
```
1. Force Stop and Clear:
   Android:
   - Settings → Apps → CRMT Mobile
   - Tap Force Stop
   - Tap Storage → Clear Data
   - Tap app icon to reopen

   iOS:
   - Force-close: Swipe up from bottom (X models)
   - Or: Settings → General → App Switcher
   - Swipe app up to close
   - Tap app icon to reopen

2. Restart Device:
   - Turn off
   - Wait 10 seconds
   - Turn back on
   - Try app again

3. Reinstall:
   - Uninstall app completely
   - Restart device
   - Reinstall from Play Store/App Store

4. Check Free Storage:
   - Needs 200MB free
   - Delete unused apps if needed
```

### Permissions Not Working

**Problem**: App installed but permissions not granted

**Solutions**:
```
Android:
1. Open Settings
2. Go to Apps → CRMT Mobile
3. Tap Permissions
4. Check each permission is marked "Allow"
5. If "Deny": Tap it and select "Allow"

iOS:
1. Open Settings
2. Scroll to find CRMT Mobile
3. Tap it
4. Check toggles are ON for:
   - Camera
   - Photos
   - Location (optional)
5. If OFF: Tap to turn ON
```

---

**Document Version**: 1.0  
**Last Updated**: October 2026

For installation support, see TROUBLESHOOTING.md or contact support@accounting-legal.com
