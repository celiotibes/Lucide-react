# Build Troubleshooting Guide

Solução de problemas comuns durante builds e deployments do CRMT Mobile.

## Table of Contents

1. [Build Failures](#build-failures)
2. [Submission Failures](#submission-failures)
3. [Code Signing Issues](#code-signing-issues)
4. [Performance Issues](#performance-issues)
5. [Runtime Issues](#runtime-issues)
6. [Common Error Messages](#common-error-messages)

## Build Failures

### Build Timeout

**Error:** "Build timed out after 3600 seconds"

**Solutions:**
```bash
# Clear build cache and retry
eas build --platform android --profile production --clear-cache

# For incremental builds, check network
# Ensure stable internet connection
# Try again in a few minutes

# Check EAS build status
eas build:logs <BUILD_ID>
```

### Memory Issues During Build

**Error:** "Java heap space", "Out of memory"

**Solutions:**
```bash
# Increase heap size for Gradle
export GRADLE_OPTS="-Xmx4096m -Xms1024m"

# Clear Gradle cache
rm -rf ~/.gradle/caches

# Rebuild
eas build --platform android --profile production --clear-cache
```

### Gradle Build Error

**Error:** "Gradle task failed", "assembleRelease failed"

**Solutions:**
```bash
# Check build logs
eas build:logs <BUILD_ID>

# Common causes:
# 1. Incompatible dependency versions
# 2. Proguard rules conflicting with libraries
# 3. Resources with invalid names

# Inspect Gradle configuration
eas build:inspect --platform android --profile production

# Try clean rebuild
eas build --platform android --profile production --clean
```

### Dependencies Not Found

**Error:** "Cannot resolve dependency"

**Solutions:**
```bash
# Reinstall npm dependencies
cd mobile-app
rm -rf node_modules package-lock.json
npm install

# Clear npm cache
npm cache clean --force

# Check for network issues
npm list --depth=0

# Rebuild
eas build --platform android --profile production
```

### Node Version Mismatch

**Error:** "Node version X is not compatible"

**Solutions:**
```bash
# Check required version
cat .nvmrc  # or check package.json engines

# Switch to correct version (if using nvm)
nvm use

# Verify Node version
node --version

# Should be >= 18.0.0
```

## Submission Failures

### Permission Denied

**Error:** "Permission denied", "Unauthorized"

**Solutions:**
```bash
# Verify Google Play service account
eas secret:list | grep GOOGLE_PLAY

# Check service account has correct permissions
# In Google Play Console: Settings > API access > Check permissions

# Re-authenticate with service account
eas secret:update --name GOOGLE_PLAY_SERVICE_ACCOUNT

# Verify JSON format is correct
# Should be: {"type": "service_account", ...}
```

### Invalid Build Artifacts

**Error:** "Invalid APK", "Invalid IPA"

**Solutions:**
```bash
# Verify build output
eas build:logs <BUILD_ID>

# Download and inspect artifact
eas build:download <BUILD_ID>

# For Android, validate APK
aapt dump badging app.apk

# For iOS, validate IPA
unzip -t app.ipa

# Rebuild with clean cache
eas build --platform android --profile production --clear-cache
```

### Version Code Already Exists

**Error:** "versionCode X already exists in track"

**Solutions:**
```bash
# Increment version code
./scripts/bump-version.sh patch

# Or manually update in app.json
nano app.json
# Increment android.versionCode

# Commit and rebuild
git commit -m "Bump version to resolve conflict"
eas build --platform android --profile production
```

### Track Not Found

**Error:** "Track 'production' not found"

**Solutions:**
```bash
# Check available tracks in Google Play Console
# Default tracks: internal, alpha, beta, production

# Update eas.json to use valid track
nano eas.json
# Change track to "internal" or "beta"

# Rebuild and resubmit
eas build --platform android --profile production
eas submit --platform android --profile production
```

### App Store Rejection

**Error:** "Binary rejected by Apple review"

**Solutions:**
1. **Privacy Policy Missing**
   ```
   - Add complete privacy policy
   - Link in App Store Connect
   - Ensure it covers all data collection
   ```

2. **Crash on Launch**
   ```bash
   # Test build locally first
   npm run build:preview
   
   # Check device logs
   eas build:logs <BUILD_ID>
   
   # Look for crash report in TestFlight
   # Fix crashes and resubmit
   ```

3. **Missing App Functionality**
   ```
   - Ensure all promised features work
   - Test on actual iOS device
   - Check permissions are requested properly
   ```

4. **External Links Issue**
   ```
   - Ensure external links open in app or with permission
   - Don't link to competing stores
   - Get user permission for external links
   ```

## Code Signing Issues

### No Signing Certificate

**Error:** "No signing certificate found", "Signing certificate expired"

**Solutions:**

**For iOS:**
```bash
# Revoke old certificate and create new one
# In Apple Developer Console:
# 1. Certificates, Identifiers & Profiles > Certificates
# 2. Revoke old certificate
# 3. Create new iOS Distribution certificate
# 4. Download and install in Keychain

# Remove old credentials from EAS
eas credentials:remove --platform ios

# Run build and set up new credentials interactively
eas build --platform ios --profile production
```

**For Android:**
```bash
# EAS manages keystore automatically
# If issues occur:
eas credentials:remove --platform android

# Rebuild with new credentials
eas build --platform android --profile production
```

### Certificate Mismatch

**Error:** "Certificate mismatch", "Invalid signing key"

**Solutions:**
```bash
# Verify certificate in use
# For iOS:
eas credentials:list --platform ios

# For Android:
eas credentials:list --platform android

# If mismatch, remove and recreate
eas credentials:remove --platform ios  # or android

# Rebuild with correct credentials
eas build --platform ios --profile production
```

### Expired Provisioning Profile

**Error:** "Provisioning profile expired", "Invalid provisioning profile"

**Solutions:**
```bash
# Create new provisioning profile
# In Apple Developer Console:
# 1. Certificates, Identifiers & Profiles > Profiles
# 2. Create new App Store distribution profile
# 3. Select your app and certificate

# Update EAS
eas credentials:remove --platform ios

# Rebuild
eas build --platform ios --profile production
```

### Keystore Issues (Android)

**Error:** "Invalid keystore", "Wrong keystore password"

**Solutions:**
```bash
# EAS stores keystore securely
# Reset if needed:
eas credentials:remove --platform android

# Rebuild (will create new keystore)
eas build --platform android --profile production

# WARNING: New keystore means can't update existing app
# Only do if starting fresh
```

## Performance Issues

### Slow Build Times

**Symptoms:** Build takes > 30 minutes

**Solutions:**
```bash
# Check build logs for bottlenecks
eas build:logs <BUILD_ID> | tail -100

# Possible causes:
# 1. Network issues - retry build
# 2. Large dependencies - review package.json
# 3. Heavy code - check for large files

# Optimize dependencies
npm audit

# Remove unused dependencies
npm prune

# Check bundle size
du -sh node_modules
```

### Large Build Artifacts

**Symptoms:** APK > 50MB, IPA > 100MB

**Solutions:**
```bash
# Check what's in the bundle
# For Android:
unzip -l app.aab | head -50

# Remove large dependencies if unused
npm list --depth=0 | grep -E "large-package-name"

# Use dynamic imports for large modules
# Example:
const LargeModule = lazy(() => import('./LargeComponent'))

# Enable minification (should be default in production)
# Check eas.json for minification settings
```

### Slow App Performance

**Symptoms:** App sluggish, slow navigation

**Solutions:**
```bash
# Profile app performance
# Add debug logging
console.time('operation')
// ... code to measure
console.timeEnd('operation')

# Check for memory leaks
# Use React DevTools Profiler

# Optimize re-renders
# Wrap components with React.memo if needed

# Measure before/after changes
npm run test:coverage
```

## Runtime Issues

### App Crashes on Launch

**Error:** "App crashes immediately after opening"

**Solutions:**
1. **Check Android logs**
   ```bash
   eas build:logs <BUILD_ID>
   
   # Look for runtime exceptions
   # Common: ClassNotFoundException, NullPointerException
   ```

2. **Check iOS logs**
   ```
   Via TestFlight:
   - Test on device
   - Check Console.app logs
   - Look for crash reports
   ```

3. **Common causes**
   - Missing Firebase initialization
   - Invalid configuration
   - Permission issues
   - Database initialization failure

### App Crashes While Running

**Error:** "App crashes during specific operation"

**Solutions:**
```bash
# Enable detailed logging
export LOG_LEVEL=debug

# Test the problematic operation step by step
# Use try-catch blocks to capture errors

# Check Sentry for error tracking
# In Firebase Console:
# Performance > Check for crashes

# Review recent code changes
git log --oneline -10
git diff HEAD~5..HEAD

# Reproduce locally
npm run start
# Test same operation in development
```

### Memory Leaks

**Error:** "App uses increasing memory", "App becomes slower over time"

**Solutions:**
```bash
# Check for circular references in state
# Review useEffect cleanup functions
useEffect(() => {
  // Setup
  return () => {
    // Cleanup - must remove listeners
  }
}, [])

# Monitor with DevTools
# Check for repeated renders

# Use React Profiler to identify problematic components

# Review third-party library versions
npm audit fix
```

### Network Connection Issues

**Error:** "Cannot connect to server", "Network timeout"

**Solutions:**
```bash
# Verify API endpoint
echo $API_ENDPOINT  # or check .env.production

# Test connectivity
curl https://api.crmt.app/health

# Check timeout settings
# In axios or fetch calls, verify timeouts

# Monitor network in DevTools
# Check for slow/blocked requests

# Verify CORS headers if applicable
# Check Content-Type headers
```

## Common Error Messages

### Error: "EAGAIN: resource temporarily unavailable"

**Cause:** Port already in use

**Solution:**
```bash
# Find process using port
lsof -i :8000  # or your port

# Kill process
kill -9 <PID>

# Or use different port
PORT=8001 npm start
```

### Error: "EACCES: permission denied"

**Cause:** Permission issues

**Solution:**
```bash
# Fix file permissions
chmod -R 755 node_modules

# Or reinstall with correct permissions
npm install --legacy-peer-deps

# Ensure you have write access to directory
ls -la
```

### Error: "ENOMEM: out of memory"

**Cause:** Insufficient memory

**Solution:**
```bash
# Clear caches
npm cache clean --force
rm -rf .gradle  # for Android builds

# Increase available memory
# On Linux:
free -h  # check available RAM

# Close unnecessary applications

# Try build again on system with more RAM
```

### Error: "401 Unauthorized"

**Cause:** Authentication failed

**Solution:**
```bash
# Check credentials
eas whoami

# Re-authenticate
eas logout
eas login

# Verify EAS token
echo $EAS_TOKEN

# Check GitHub Actions secrets are correct
# In repo: Settings > Secrets and variables > Actions
```

### Error: "ENOTFOUND: getaddrinfo ENOTFOUND api.example.com"

**Cause:** DNS resolution or network issue

**Solution:**
```bash
# Verify API endpoint
cat .env.production | grep API_ENDPOINT

# Test DNS resolution
nslookup api.crmt.app

# Check network connectivity
ping 8.8.8.8

# Try with different network (WiFi vs cellular)
```

## Getting Help

1. **Check EAS Logs**
   ```bash
   eas build:logs <BUILD_ID>
   eas submit:logs <SUBMISSION_ID>
   ```

2. **Review Documentation**
   - [DEPLOYMENT.md](./DEPLOYMENT.md)
   - [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)
   - [EAS Docs](https://docs.expo.dev/eas/)

3. **Community Support**
   - Expo Forums: https://forums.expo.dev
   - GitHub Issues: Search existing issues
   - Stack Overflow: Tag with `expo` and `react-native`

4. **Premium Support**
   - Expo Priority Support (paid)
   - Schedule: https://expo.dev/support

## See Also

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Build and deployment steps
- [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) - Environment configuration
- [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) - Release checklist
- [app.json](./app.json) - App configuration
- [eas.json](./eas.json) - EAS configuration
