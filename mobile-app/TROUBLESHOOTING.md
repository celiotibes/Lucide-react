# CRMT Mobile App - Troubleshooting Guide

## Table of Contents

1. [Common Issues and Solutions](#common-issues-and-solutions)
2. [Performance Optimization](#performance-optimization)
3. [Debugging Procedures](#debugging-procedures)
4. [Log Analysis](#log-analysis)
5. [Database Issues](#database-issues)
6. [Network & Sync Issues](#network--sync-issues)
7. [Authentication Issues](#authentication-issues)
8. [Document Processing Issues](#document-processing-issues)
9. [Known Limitations](#known-limitations)
10. [Getting Additional Help](#getting-additional-help)

---

## Common Issues and Solutions

### Issue 1: App Won't Start or Keeps Crashing on Launch

**Symptoms**:
- App closes immediately after opening
- Error: "Unfortunately, CRMT Mobile has stopped"
- Blank white screen on startup
- Repeated crashes within 5 seconds

**Diagnosis Steps**:

1. Check device storage:
```bash
# If using Android, check available storage
# Settings → Storage → Available space
# Need at least 200MB free
```

2. Check if app can be force stopped:
   - Open Settings → Apps → CRMT Mobile
   - Tap "Force Stop"
   - Clear app cache: "Storage" → "Clear Cache"
   - Restart device

3. Check if issue is database corruption:
```
The app stores data in WatermelonDB (SQLite).
If corrupted, the app will crash on startup.
```

**Solutions** (in order of effectiveness):

**Solution 1**: Clear app data (WARNING: Deletes local documents)
1. Settings → Apps → CRMT Mobile
2. Tap "Storage"
3. Tap "Clear Data" (NOT just cache)
4. Restart app
5. Log back in - your documents are safe on server

**Solution 2**: Reinstall the app
```bash
# For Android:
1. Go to Settings → Apps → CRMT Mobile
2. Tap three dots → Uninstall
3. Restart device
4. Reinstall from Play Store

# For iOS:
1. Long-press app icon
2. Tap "Remove App" → "Delete App"
3. Restart device
4. Reinstall from App Store
```

**Solution 3**: Check for app updates
- Open Play Store/App Store
- Search for CRMT Mobile
- If update available, install it
- Newer versions often fix startup issues

**If issue persists**:
- Contact support with device model and app version
- Device model: Settings → About Phone
- App version: In app, go to Settings → About

---

### Issue 2: Slow App Performance / Freezing

**Symptoms**:
- List screens take 5+ seconds to load
- Scrolling is choppy/stutters
- Animations lag
- App becomes unresponsive
- Memory usage is high

**Diagnosis**:

Check what's causing slowness:

```
1. Is it loading data? (spinning indicator)
   → Network or database query issue
   
2. Is it rendering? (no indicator)
   → Too many items or complex components
   
3. Is it processing? (OCR running)
   → CPU usage from OCR service
   
4. Is storage full?
   → Device running out of space
```

**Solutions**:

**For Slow Data Loading**:

1. Check if syncing is happening:
   - Go to Settings → Data
   - If "Syncing..." is shown, wait for completion
   - Large sync operations slow the app

2. Reduce data volume:
   - Delete old documents (Settings → Data → Delete Old Documents)
   - Archive old transactions (if available)
   - Clear app cache: Settings → About → Clear Cache

3. Disable automatic sync:
   - Settings → Data → Auto Sync
   - Toggle "Auto Sync" OFF
   - Manually sync when needed

**For Choppy Scrolling**:

1. Disable animations:
   - Settings → Advanced → Animations
   - Toggle "Enable Animations" OFF
   - Restart app

2. Switch to list view (if available):
   - Some screens have grid/list toggle
   - List view is more performant

3. Reduce image quality:
   - Settings → Documents → Image Quality
   - Set to "Low" for faster loading

**For High Memory Usage**:

1. Close other apps:
   - Stop background apps
   - This frees up RAM for CRMT

2. Restart the app:
   - Close CRMT Mobile completely
   - Wait 10 seconds
   - Reopen

3. Update OS:
   - Android/iOS updates improve memory management
   - Settings → System Update

**Performance Monitoring**:

Check performance metrics in the app:
- Settings → About → System Info
- Look for:
  - Available RAM
  - Storage used by app
  - Database size

---

### Issue 3: Documents Not Syncing

**Symptoms**:
- Document stays in "uploading" state
- Changes made aren't appearing on other devices
- Last sync time is very old
- Manual sync doesn't work

**Diagnosis Steps**:

1. Check internet connection:
   - Settings → Network Status
   - Should show "Connected" (WiFi or cellular)
   - Try opening a web browser to verify internet works

2. Check sync status:
   - Settings → Data → Last Sync Time
   - If over 1 hour ago, sync has issues

3. Check for large pending sync:
   - Documents being uploaded/synced appear slowly
   - Large syncs can take several minutes

4. Check if sync is enabled:
   - Settings → Data → Auto Sync
   - If OFF, tap to enable

**Solutions**:

**Solution 1**: Manual sync
```
1. Go to Settings → Data
2. Tap "Sync Now"
3. Watch the progress indicator
4. Wait for "Sync Complete" message
5. If it fails, note the error message
```

**Solution 2**: Restart sync service
```
1. Force stop the app: Settings → Apps → CRMT Mobile → Force Stop
2. Wait 10 seconds
3. Reopen the app
4. Go to Settings → Data → Sync Now
```

**Solution 3**: Check sync settings
```
Settings → Data → Sync Configuration:
- "Sync on Cellular": Toggle ON if using cellular data
- "Sync Interval": Set to 5 minutes (default)
- "Retry Failed": Should be ON
```

**Solution 4**: Reduce sync load
```
If syncing lots of documents:
1. Go to Documents
2. Manually delete old/unused documents
3. This reduces sync payload
4. Try syncing again
```

**If sync still fails**:
- Note the error message shown
- Contact support with error details
- Settings → Help → Send Debug Report

---

### Issue 4: OCR Not Working / Low Accuracy

**Symptoms**:
- OCR processing never completes (stuck at 50%)
- Extracted text is completely wrong
- Numbers are unrecognizable
- Mixed language text causes errors

**Diagnosis**:

OCR accuracy depends on image quality:
- Image must be well-lit and clear
- Text must be in a supported language
- Document should be straight (not tilted)
- No shadows or glare on text

**Solutions**:

**For Processing Never Completing**:

1. Check internet connection (OCR uses server):
   - Settings → Network Status → Connected?
   - OCR requires internet even for local capture

2. Cancel and retry:
   - Go to Documents
   - Find the stuck document
   - Tap and hold → "Delete"
   - Recapture the document

3. Check file size:
   - Large images (over 5MB) may fail
   - Most phone cameras create 2-3MB images
   - If over 5MB, the phone camera may have unusual settings

4. Wait longer:
   - Sometimes processing takes 30+ seconds
   - Complex documents take longer
   - Wait at least 2 minutes before giving up

**For Poor OCR Accuracy**:

1. Better lighting:
   - Capture in natural light
   - Avoid shadows and glare
   - Position light source appropriately

2. Better angle:
   - Hold device at 45-degree angle
   - Document should fill 80% of frame
   - Document edges should be straight

3. Better focus:
   - Wait for focus indicator (green border)
   - Keep hands steady
   - Take multiple photos and choose best

4. After capture improvements:
   - If extracted text is wrong
   - Manually correct each field
   - The app allows editing extracted text

**For Mixed Language Issues**:

1. Use primary language:
   - OCR works best with single language
   - If mixing languages, may get errors
   - English/Portuguese/Spanish best supported

2. Set expected language:
   - Settings → Language
   - Select primary document language
   - This hints OCR engine

---

### Issue 5: Can't Log In / Authentication Fails

**Symptoms**:
- "Invalid credentials" error
- "Unable to connect to server" error
- Stuck on login screen
- Biometric unlock doesn't work

**Diagnosis**:

1. Check credentials:
   - Verify email address is correct
   - Ensure CAPS LOCK is off
   - Password is case-sensitive

2. Check internet:
   - Settings → Network Status
   - Must be connected for login
   - Offline login not available

3. Check account status:
   - Account may be locked after failed attempts
   - Password may have expired
   - Account may be deactivated by admin

**Solutions**:

**Solution 1**: Reset password
```
1. On login screen, tap "Forgot Password?"
2. Enter email address
3. Check email for reset link (may take 5 min)
4. Create new password:
   - Min 8 characters
   - Mix of upper, lower, numbers, special chars
   - Example: MyPass123!
5. Return to app and log in with new password
```

**Solution 2**: Clear stored credentials
```
Android:
Settings → Apps → CRMT Mobile → Storage → Clear Data

iOS:
Long-press app → Remove App → Delete App
Reinstall from App Store
```

**Solution 3**: Wait if locked
```
After 5 failed login attempts, account locks for 15 minutes.
Wait 15 minutes, then try again.
```

**Solution 4**: Check with admin
```
Your account may have been deactivated.
Ask your organization admin to re-enable it.
```

**If biometric not working**:
```
1. Go to Settings → Security
2. Tap "Disable Biometric" 
3. Re-setup biometric:
   Settings → Security → Set Up Biometric
4. Follow on-screen prompts
```

---

## Performance Optimization

### Device Storage Optimization

**Current Usage**:
View in Settings → Data → Storage Usage

**Reduction Steps**:

1. **Delete Old Documents**:
   - Documents → Filter → Older than 6 months
   - Select unwanted documents
   - Tap "Delete Selected"
   - Each document: 2-5MB (with image)

2. **Clear Cache**:
   - Settings → About → Clear Cache
   - Removes thumbnail cache
   - Usually 50-200MB
   - Safe to delete, will rebuild

3. **Archive Data**:
   - Settings → Data → Export & Archive
   - Export old documents as PDF
   - Save to cloud storage
   - Delete local copies

4. **Disable Offline Storage**:
   - Settings → Data → Offline Documents
   - Set to "Last 30 days only"
   - Reduces local database size

**Expected Storage**:
- App installation: 150MB
- Data per 1000 documents: 5-10GB
- With cache/thumbnails: +500MB

### Memory Optimization

**Signs of Memory Pressure**:
- App becomes slow after 30 minutes use
- Scrolling stutters
- Photos load slowly
- App crashes when opening large documents

**Optimization**:

1. **Restart Regularly**:
   - Close CRMT Mobile completely
   - Restart every 2-3 hours of heavy use
   - This clears memory leaks

2. **Disable Background Sync**:
   - Settings → Data → Auto Sync
   - Turn OFF if not needed
   - Manually sync when needed

3. **Reduce Image Resolution**:
   - Settings → Documents → Image Quality
   - Set to "Low"
   - Frees memory for processing

4. **Close Other Apps**:
   - Stop unnecessary background apps
   - This frees RAM for CRMT

### Battery Optimization

**High Battery Drain Signs**:
- Battery drains 20%+ per hour of app use
- Device gets very warm while using app
- "Warm device" warning appears

**Optimization**:

1. **Disable Push Notifications**:
   - Settings → Notifications → All Notifications
   - Turn OFF
   - Reduces battery 10-15%

2. **Use WiFi for Sync**:
   - Settings → Data → Sync on Cellular
   - Toggle OFF
   - Use WiFi only for sync
   - WiFi uses less power than cellular

3. **Disable Biometric**:
   - Settings → Security → Biometric
   - Turn OFF
   - Biometric scanning uses power

4. **Disable Background Activity**:
   - Settings → Advanced → Background Activity
   - Turn OFF
   - Only syncs when app is open

5. **Enable Battery Saver Mode**:
   - Device Settings → Battery
   - Enable Battery Saver
   - Reduces app performance but saves battery

---

## Debugging Procedures

### Enable Debug Logging

```
Step 1: Go to Settings → Advanced → Debug Mode
Step 2: Toggle "Enable Debug Logging" ON
Step 3: Restart app
Step 4: Perform action that causes issue
Step 5: Logs are written to device storage

Logs location:
Android: /storage/emulated/0/Android/data/com.crmtmobile/cache/logs
iOS: App Documents folder (not directly accessible)
```

### View Debug Logs

**Android**:
```bash
# Using Android Studio
1. Open Android Studio
2. Connect device or open emulator
3. View → Tool Windows → Logcat
4. Filter by "CRMT" or "WatermelonDB"
5. Reproduce the issue
6. Read log output

# Or using CLI
adb logcat | grep CRMT
```

**iOS**:
```bash
# Using Xcode
1. Open Xcode
2. Window → Devices and Simulators
3. Select device/simulator
4. View device logs
5. Reproduce the issue
6. Read log output
```

### Send Debug Report

```
In-app method (Recommended):
1. Go to Settings → Help & Support
2. Tap "Send Debug Report"
3. Describe the issue briefly
4. Tap "Send"
5. App automatically collects:
   - Device info
   - App version
   - Recent logs
   - Error stack traces

Manual method:
1. Enable Debug Logging (see above)
2. Perform steps to reproduce issue
3. Export logs via email
4. Send to support@accounting-legal.com
```

### Monitor Network Requests

**iOS (Using Charles Proxy)**:
```
1. Install Charles Proxy on Mac
2. Configure iOS device to use Charles as proxy:
   Settings → WiFi → Select Network → Proxy
3. Trust Charles certificate:
   Settings → General → Profile/Device Management
4. Open CRMT app
5. View all network traffic in Charles
6. Can see request/response details
```

**Android (Using Charles Proxy)**:
```
1. Install Charles Proxy on computer
2. Configure Android device:
   Settings → WiFi → Long-press network → Modify proxy
3. Enter Charles IP and port
4. Trust Charles certificate (install as system cert)
5. Open CRMT app
6. View traffic in Charles
```

---

## Log Analysis

### Common Log Patterns

**Success Login**:
```
[INFO] AuthService: Login requested for user@example.com
[DEBUG] APIClient: POST /auth/login
[INFO] AuthService: Login successful, token received
[INFO] TokenManager: Token stored securely
```

**Failed Login**:
```
[INFO] AuthService: Login requested for user@example.com
[DEBUG] APIClient: POST /auth/login
[ERROR] APIClient: HTTP 401 Unauthorized
[ERROR] AuthService: Login failed: Invalid credentials
```

**Document Upload Success**:
```
[DEBUG] DocumentCaptureService: Image captured from camera
[INFO] DocumentProcessorService: Starting OCR processing
[DEBUG] APIClient: POST /documents/upload
[INFO] OCRService: OCR processing started on server
[INFO] DocumentProcessorService: OCR completed
[INFO] WatermelonDB: Document saved with ID doc-123
```

**Sync Operation**:
```
[INFO] SyncManager: Starting sync
[DEBUG] SyncManager: Found 5 pending changes
[DEBUG] OfflineSyncService: Uploading changes...
[INFO] OfflineSyncService: 5 changes uploaded
[DEBUG] OfflineSyncService: Pulling updates...
[INFO] OfflineSyncService: Pulled 12 updates
[INFO] SyncManager: Sync completed successfully
```

**Network Error**:
```
[ERROR] NetworkMonitor: Network status changed to OFFLINE
[WARN] OfflineSyncService: Sync failed, queueing for later
[INFO] OfflineSyncService: 2 items queued for sync
[INFO] NetworkMonitor: Network status changed to ONLINE
[INFO] OfflineSyncService: Processing queued items...
```

### Searching Logs

**Android Logcat**:
```bash
# Show only errors
adb logcat | grep ERROR

# Show specific service
adb logcat | grep "DocumentProcessor"

# Save to file
adb logcat > logs.txt

# Filter by level and tag
adb logcat CRMT:I *:S  (INFO and above for CRMT only)
```

**iOS Console**:
```
In Xcode Debugger Console:
po NSLog(@"Debug message")  (print object)
expr (void)NSLog(@"")       (log expression)
```

---

## Database Issues

### Corrupted Database

**Symptoms**:
- App crashes on startup
- "Database error" message
- Can't load any data
- Documents appear then disappear

**Solution**:
```
WatermelonDB is file-based SQLite.
If corrupted, must be reset.

WARNING: This deletes ALL local data.
Documents are safe on server.

1. Force stop app: Settings → Apps → CRMT Mobile → Force Stop
2. Clear app data: Settings → Apps → CRMT Mobile → Storage → Clear Data
3. Restart device
4. Reopen app and log in
5. App downloads data from server
```

### Database Size Growing

**Problem**:
- App storage usage growing daily
- Database file getting huge
- App becoming slow

**Causes**:
- Many documents with large extracted data
- Sync queue items not being cleared
- Cache not being cleaned

**Solution**:
```
1. Clear old data:
   Settings → Data → Retention Policy
   Set to "Delete older than 6 months"

2. Clear sync queue:
   Settings → Advanced → Clear Sync Queue
   (Only if nothing is syncing)

3. Rebuild database:
   Settings → Advanced → Optimize Database
   Rebuilds and optimizes internal structure

4. Export and archive:
   Settings → Data → Export
   Save important documents to cloud
   Delete local copies
```

---

## Network & Sync Issues

### Intermittent Connectivity

**Problem**:
- Sync works sometimes, fails other times
- Network status keeps changing online/offline
- Sync gets stuck at 50%

**Causes**:
- Weak WiFi signal
- Cellular coverage fluctuates
- Network timeout too short
- Server temporarily unavailable

**Solutions**:

1. **Use stronger WiFi**:
   - Move closer to router
   - Check WiFi signal strength (Settings → Network)
   - Should be 3+ bars

2. **Increase timeout**:
   - Settings → Advanced → Network Timeout
   - Increase from 30s to 60s
   - Helps with slow connections

3. **Disable cellular sync**:
   - Settings → Data → Sync on Cellular
   - Turn OFF
   - Only sync over WiFi (more reliable)

4. **Manual sync over WiFi**:
   - Connect to WiFi network
   - Go to Settings → Data
   - Tap "Sync Now"
   - Wait for completion

### Certificate Pinning Issues

**Problem**:
- "Certificate validation failed" error
- "Security certificate problem" message
- Can't upload documents

**Causes**:
- Corporate firewall intercepting traffic
- Government network monitoring (MiTM)
- Malware or hacking attempt

**This is intentional security measure**

**Solution**:
1. Use non-corporate/non-government network
2. If using VPN, try disabling it
3. If using corporate WiFi, contact IT
4. Contact support with error details

**Don't disable certificate pinning** - it's your security!

---

## Authentication Issues

### Token Expired

**Problem**:
- "Token expired" error after app open
- Need to log back in frequently
- "Unauthorized" errors appearing

**Causes**:
- App wasn't used for 1+ hour (token expires)
- Device time is wrong
- Too many active sessions

**Solutions**:

1. **Log back in**:
   - Go to login screen
   - Enter credentials
   - This gets new token

2. **Check device time**:
   - Settings → Date & Time
   - Should be set to automatic
   - Incorrect time causes token validation to fail

3. **Revoke old sessions**:
   - Settings → Security → Active Sessions
   - Look for old devices/sessions
   - Tap "×" to revoke
   - Limits active sessions to 3

### Session Conflicts

**Problem**:
- Logged out on one device when using another
- Getting "Session invalidated" message
- Can only be logged in on one device

**Causes**:
- Logged in on too many devices (limit is 3)
- Security system detected suspicious activity
- Account was compromised

**Solutions**:

1. **Check active sessions**:
   - Settings → Security → Active Sessions
   - View all logged-in devices
   - Tap "×" to revoke unwanted sessions

2. **Log out remotely**:
   - If suspicious session appears:
   - Settings → Security → Active Sessions
   - Tap "×" on suspicious device
   - Change password: Settings → Account → Change Password

3. **Log back in**:
   - Enter credentials again
   - You'll be logged out of oldest session
   - New device can now log in

---

## Document Processing Issues

### Document Processing Takes Too Long

**Problem**:
- OCR stuck at "processing" for 10+ minutes
- Document never finishes processing
- Error: "Processing timeout"

**Causes**:
- Server OCR service is overloaded
- Document image is very large/complex
- Network dropped during processing
- Server temporarily unavailable

**Solutions**:

1. **Wait longer**:
   - Very complex documents (receipts with fine print) can take 5 minutes
   - Wait at least 10 minutes
   - Don't force-close the app

2. **Cancel and retry**:
   - After 15 minutes, document has likely failed
   - Go to Documents
   - Find stuck document
   - Tap and hold → "Delete"
   - Recapture the document

3. **Try during off-peak**:
   - Server may be overloaded
   - Try again in a few hours
   - Retry usually succeeds

4. **Simplify document**:
   - Photos of complex documents (with tables, fine print, etc.) are harder to OCR
   - Take photo of just the important parts
   - Focus camera on main text area

### Extracted Text is Wrong

**Problem**:
- OCR reads "123" as "I23" (letter I instead of 1)
- Numbers are all wrong
- Text is scrambled
- Wrong language detected

**Root Cause**:
- Image quality is poor
- Text size is too small
- Font is unusual/decorative
- Mixed language document

**Solutions**:

1. **Retake photo** with better quality:
   - Use better lighting
   - Hold device steady
   - Get closer so text fills more screen space
   - Avoid shadows/glare

2. **Manually correct** extracted text:
   - After OCR, tap "Edit"
   - Fix each field
   - Correct incorrect text
   - Tap "Save"

3. **Use specific document type**:
   - Some document types have better OCR
   - Receipt vs Invoice templates
   - Try different category

4. **Change document language**:
   - Settings → Language
   - Set to document's language
   - Portuguese, English, Spanish optimized

---

## Known Limitations

### Limitations by Feature

**Document Capture**:
- Maximum image resolution: 4096x4096
- Maximum file size: 10MB
- Supported formats: JPEG, PNG, PDF
- Handwritten text: Not recognized (printed only)
- Watermarked documents: May affect accuracy

**OCR Processing**:
- Single language per document (mixing languages reduces accuracy)
- Small text (<10pt font): Reduced accuracy
- Rotated/skewed documents: Reduced accuracy
- Colored background text: Reduced accuracy
- Supported languages: English, Portuguese, Spanish, French (16 more added in v2.0)

**Offline Functionality**:
- Can work offline but limited features
- Cannot: Upload documents, sync, push notifications
- Can: View cached data, add transactions locally
- Sync may take long time if queued items exceed 1GB

**Database Limits**:
- Maximum local storage: Device storage limit
- Maximum single document: 100MB
- Maximum queued operations: 10,000

**App Size**:
- App installation: 150MB
- Per 1000 documents: 5-10GB storage needed
- Minimum RAM required: 2GB

### Planned Improvements

**Upcoming in v1.1**:
- Support for 10 additional languages
- Bulk document upload
- Recurring transactions
- Custom categories

**Planned for v2.0**:
- OCR for handwritten text
- Multi-language documents
- Advanced analytics
- Third-party app integration

---

## Getting Additional Help

### Contact Support

**Email**: support@accounting-legal.com
- Response time: 24-48 hours
- Included: Device model, app version, error message

**In-App Support**: Settings → Help & Support
- Fastest response
- Automatic system info collection
- Better for urgent issues

**Phone**: +1-800-ACCOUNTING (during business hours)
- Real-time assistance
- Complex issues best handled here

### Before Contacting Support

Have this information ready:

1. **Device Info**:
   - Device model (Settings → About Phone)
   - OS version (Settings → About Phone)
   - App version (In-app About)

2. **Issue Details**:
   - Exact error message
   - Steps to reproduce
   - When it started happening
   - Frequency (always/sometimes)

3. **System Status**:
   - Network status (WiFi/cellular)
   - Available storage
   - Battery level
   - Other apps running

4. **Debug Info**:
   - Enable debug logging first
   - Include recent log excerpt
   - Screenshot of error (if possible)

### Creating a Bug Report

**Template**:
```
Issue Title: [Clear, concise description]

Device: [Model and OS]
App Version: [Version number]
Reproduction Steps:
1. [First step]
2. [Second step]
3. [Error occurs]

Expected Behavior: [What should happen]
Actual Behavior: [What actually happens]
Error Message: [Exact error text]

Screenshots/Logs: [Attached]
```

---

**Document Version**: 1.0  
**Last Updated**: October 2026

For the latest troubleshooting information, visit: [docs.accounting-legal.com/troubleshooting](https://docs.accounting-legal.com/troubleshooting)
