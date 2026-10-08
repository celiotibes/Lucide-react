# Release Checklist

Checklist completa para releases do CRMT Mobile.

## Pre-Release (1-2 weeks before)

### Code Quality

- [ ] All tests passing
  ```bash
  npm run test:ci
  ```
- [ ] No console errors/warnings in development
- [ ] Code linting passes
  ```bash
  npm run lint
  ```
- [ ] TypeScript type checking passes
  ```bash
  npm run type-check
  ```
- [ ] No security vulnerabilities
  ```bash
  npm audit
  ```

### Performance

- [ ] App performance validated
  - [ ] Launch time < 2 seconds
  - [ ] Main screen render < 500ms
  - [ ] Document upload < 3 seconds
  - [ ] Search < 1 second
- [ ] Bundle size acceptable
  - [ ] Android APK < 50MB
  - [ ] Android AAB < 100MB
  - [ ] iOS IPA < 100MB
- [ ] Memory usage monitored
  - [ ] No memory leaks
  - [ ] Stable memory footprint

### Testing

- [ ] Unit tests coverage > 80%
  ```bash
  npm run test:coverage
  ```
- [ ] Integration tests all pass
  ```bash
  npm run test:integration
  ```
- [ ] E2E scenarios tested manually
  - [ ] App opens correctly
  - [ ] Document upload works
  - [ ] Search and filter work
  - [ ] Offline mode works
  - [ ] Sync works when online
- [ ] Beta testing on real devices
  - [ ] Android phone (latest version)
  - [ ] Android phone (older version - 2+ years old)
  - [ ] iPad (if applicable)
  - [ ] iPhone (latest version)
  - [ ] iPhone (older version - 2+ years old)

### Documentation

- [ ] README.md up to date
- [ ] DEPLOYMENT.md updated with latest instructions
- [ ] CHANGELOG.md prepared with release notes
- [ ] API documentation updated if needed
- [ ] Privacy policy reviewed and updated
- [ ] Terms of service reviewed (if applicable)

### Configuration

- [ ] Environment variables documented
- [ ] All secrets configured in EAS
  ```bash
  eas secret:list
  ```
- [ ] Firebase configuration verified
- [ ] Analytics enabled
- [ ] Error tracking (Sentry) configured
- [ ] Build profiles in eas.json reviewed

## Release Week Preparation

### Version Management

- [ ] Determine version number following semver
  - [ ] Major version for breaking changes
  - [ ] Minor version for new features
  - [ ] Patch version for bug fixes
- [ ] Update version number
  ```bash
  ./scripts/bump-version.sh patch  # or minor, major
  ```
- [ ] Verify version in:
  - [ ] package.json
  - [ ] app.json
  - [ ] eas.json

### Release Notes

- [ ] Write release notes in Portuguese
- [ ] Write release notes in English
- [ ] Include:
  - [ ] New features
  - [ ] Bug fixes
  - [ ] Performance improvements
  - [ ] Known issues (if any)
  - [ ] Requirements (Android/iOS versions)
- [ ] Store in EAS secrets for automated submit:
  ```bash
  eas secret:create --scope project --name RELEASE_NOTES_PT_BR
  eas secret:create --scope project --name RELEASE_NOTES_EN_US
  ```

### Assets & Metadata

#### Android (Google Play)

- [ ] App icon (512x512 PNG)
  - [ ] Verify in `assets/icon.png`
- [ ] Screenshots (minimum 2)
  - [ ] Phone screenshots (1080x1920)
  - [ ] Tablet screenshots if applicable (1600x2560)
  - [ ] Show main features
  - [ ] Include in Portuguese and English
- [ ] Feature graphic (1024x500)
  - [ ] Upload to Google Play Console
- [ ] Description
  - [ ] Short description (80 chars max)
  - [ ] Full description (4000 chars max)
  - [ ] Translated to Portuguese and English
- [ ] Privacy policy
  - [ ] URL to privacy policy
  - [ ] Accessible and current

#### iOS (App Store)

- [ ] App icon (1024x1024 PNG)
  - [ ] No transparency or effects
  - [ ] Verify in `assets/icon.png`
- [ ] Screenshots (minimum 2)
  - [ ] iPad Pro 12.9" (optional)
  - [ ] iPhone 6.7" (required for latest iPhones)
  - [ ] iPhone SE (required for small devices)
  - [ ] Show app features
  - [ ] Include marketing text if desired
  - [ ] In Portuguese and English
- [ ] Preview video (optional but recommended)
  - [ ] 15-30 seconds
  - [ ] Shows main features
  - [ ] MP4 format, max 500MB
- [ ] Description
  - [ ] Subtitle (30 chars)
  - [ ] Full description (4000 chars)
  - [ ] Keywords (100 chars)
  - [ ] Support URL
  - [ ] Marketing URL (optional)
  - [ ] Privacy policy URL
- [ ] Promotional artwork (optional)
- [ ] Watch preview video for errors

## Build Phase

### Local Build Validation

- [ ] Build locally succeeds without warnings
  ```bash
  npm run build:preview
  ```
- [ ] Local build tested on device/emulator
  - [ ] All features working
  - [ ] No crashes or errors
  - [ ] Performance acceptable

### Production Build - Android

- [ ] Trigger production build
  ```bash
  npm run build:production
  ```
- [ ] Monitor build progress
  - [ ] Check build status in EAS
  - [ ] Wait for completion (usually 10-15 minutes)
- [ ] Download and inspect build
  ```bash
  eas build:logs <BUILD_ID>
  ```
- [ ] Verify build output
  - [ ] AAB generated successfully
  - [ ] No warnings or errors in logs

### Production Build - iOS

- [ ] Trigger production build
  ```bash
  eas build --platform ios --profile production
  ```
- [ ] Monitor build progress
  - [ ] Check build status in EAS
  - [ ] Wait for completion (usually 15-30 minutes)
- [ ] Review build logs
  ```bash
  eas build:logs <BUILD_ID>
  ```
- [ ] Verify build output
  - [ ] IPA generated successfully
  - [ ] Code signing successful
  - [ ] No warnings or errors

## Beta Testing Phase (Optional but Recommended)

### Android Beta (Internal Testing)

- [ ] Build preview version
  ```bash
  npm run build:preview
  ```
- [ ] Submit to internal testing
  ```bash
  eas submit --platform android --profile preview
  ```
- [ ] Share with testers in Google Play Console
- [ ] Collect feedback for 2-3 days
- [ ] Address critical issues

### iOS Beta (TestFlight)

- [ ] Build for TestFlight
  ```bash
  eas build --platform ios --profile production
  ```
- [ ] Submit to TestFlight
  ```bash
  eas submit --platform ios --profile production
  ```
- [ ] Create beta group in App Store Connect
- [ ] Invite testers
- [ ] Collect feedback for 2-3 days
- [ ] Address critical issues

## Submission Phase

### Pre-Submission Final Checks

- [ ] Git repository clean (no uncommitted changes)
  ```bash
  git status
  ```
- [ ] All commits pushed
  ```bash
  git push
  ```
- [ ] Version tag created and pushed
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```
- [ ] Release branch created (if using Git flow)
  ```bash
  git checkout -b release/v1.0.0
  ```

### Google Play Submission

- [ ] Final review in Google Play Console
  - [ ] All required fields filled
  - [ ] Screenshots and assets added
  - [ ] Privacy policy linked
  - [ ] Content rating completed
  - [ ] Target audience verified
- [ ] Set release type
  - [ ] [ ] Internal testing (for QA)
  - [ ] [ ] Closed testing (for beta users)
  - [ ] [ ] Staged rollout (start with 5-10%)
  - [ ] [ ] Full release (100% of users)
- [ ] Submit for review
  - [ ] Expected review time: 2-4 hours
- [ ] Monitor review status
  - [ ] Check email for review results
  - [ ] Address any issues immediately

### App Store Submission

- [ ] Final review in App Store Connect
  - [ ] All required fields filled
  - [ ] Screenshots and assets added
  - [ ] Privacy policy linked
  - [ ] Age rating completed
  - [ ] Pricing and distribution verified
  - [ ] Encryption details confirmed (if applicable)
- [ ] Version release management
  - [ ] [ ] Manual release (release after approval)
  - [ ] [ ] Automatic release (release immediately after approval)
- [ ] Submit for review
  - [ ] Expected review time: 1-3 days (sometimes up to 1 week)
- [ ] Monitor review status
  - [ ] Check email for review results
  - [ ] Address any rejections

### Common Review Issues & Solutions

#### Google Play Rejections

- [ ] Privacy policy missing/incomplete
  - Solution: Add complete privacy policy
- [ ] Permissions not justified
  - Solution: Add clear permission explanations in app
- [ ] Crash or ANR on test device
  - Solution: Fix crash and resubmit

#### App Store Rejections

- [ ] Privacy policy issues (missing or incorrect)
  - Solution: Update privacy policy, request re-review
- [ ] Crash on test device
  - Solution: Fix crash, increment build number, resubmit
- [ ] Missing app functionality
  - Solution: Verify all features work, resubmit

## Post-Release

### Monitoring (First 24 Hours)

- [ ] Monitor crash rates in Firebase
- [ ] Monitor error rates in Sentry
- [ ] Check app reviews on stores
- [ ] Monitor user feedback
- [ ] Check support channels for issues
- [ ] Be ready for quick hotfix if needed

### Monitoring (First Week)

- [ ] Crash rate stable and low (< 0.1%)
- [ ] No major issues reported
- [ ] User reviews positive
- [ ] Performance stable
- [ ] All analytics tracking working

### Post-Release Updates

- [ ] Update release documentation
  ```bash
  ./scripts/generate-changelog.sh
  ```
- [ ] Create release notes blog post (if applicable)
- [ ] Update social media (if applicable)
- [ ] Archive build artifacts
- [ ] Delete old EAS builds (optional, to save storage)
  ```bash
  eas build:list | tail -20  # view old builds
  # Manually delete old builds from EAS CLI or Dashboard
  ```

## Rollback Plan

If critical issues detected:

1. [ ] Assess severity
   - [ ] Crashes affecting > 1% of users: immediate rollback
   - [ ] Feature broken: immediate rollback
   - [ ] Minor issues: consider hotfix

2. [ ] For Android:
   ```bash
   # Halt rollout in Google Play Console
   # Create hotfix on new branch
   git checkout -b hotfix/v1.0.1
   # Fix issue
   ./scripts/bump-version.sh patch
   npm run build:production
   eas submit --platform android --profile production
   ```

3. [ ] For iOS:
   ```bash
   # Reject current binary in App Store Connect
   # Create hotfix
   git checkout -b hotfix/v1.0.1
   # Fix issue
   ./scripts/bump-version.sh patch
   eas build --platform ios --profile production
   eas submit --platform ios --profile production
   ```

4. [ ] Communicate with users
   - [ ] Post-mortem on what went wrong
   - [ ] Explanation of fix
   - [ ] New release timeline

## Sign-Off

- [ ] Product Manager: _________________
- [ ] Lead Developer: _________________
- [ ] QA Lead: _________________
- [ ] Release Manager: _________________

**Release Date:** ___________________

**Version:** ___________________

**Notes:** ________________________________________________________________
