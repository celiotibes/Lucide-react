# Firebase Cloud Messaging (FCM) Push Notifications - Implementation Checklist

**Phase 22.15: Mobile-First Features**

Complete implementation checklist for integrating push notifications into the CRMT mobile app.

## Pre-Implementation

- [ ] Firebase project created at https://console.firebase.google.com
- [ ] Firebase messaging enabled in project
- [ ] Android app registered with Firebase
- [ ] iOS app registered with Firebase
- [ ] APNs certificate obtained and configured (iOS)
- [ ] Service account key downloaded
- [ ] Developer has access to Firebase Console
- [ ] Backend team ready to integrate notification sending

## Core Implementation

### Files Created (19 files)

#### Service & Logic (1 file)
- [x] `src/services/pushNotificationService.ts` (650+ lines)
  - FCM token management
  - Message handling (all states)
  - Offline queuing with retry
  - Secure token storage
  - Analytics integration
  - Handler subscriptions

#### UI Components (2 files)
- [x] `src/screens/notifications/NotificationCenterScreen.tsx` (400+ lines)
  - Notification list display
  - Type filtering
  - Mark as read/unread
  - Delete notifications
  - Unread badge
- [x] `src/screens/notifications/index.ts`

#### Hooks (1 file)
- [x] `src/hooks/useNotifications.ts` (150+ lines)
  - Complete notification state management
  - Event subscription hooks
  - Unread count tracking
  - FCM token access

#### Tests (1 file)
- [x] `src/services/__tests__/pushNotificationService.test.ts` (600+ lines)
  - 20+ comprehensive test cases
  - Service initialization
  - Token management
  - Message handling
  - Error scenarios

#### Documentation (4 files)
- [x] `docs/PUSH_NOTIFICATIONS.md` (1000+ lines)
  - Complete API reference
  - Configuration options
  - All event types
  - Troubleshooting guide
  - Best practices
- [x] `docs/PUSH_NOTIFICATIONS_INTEGRATION.md` (500+ lines)
  - Step-by-step setup
  - Environment setup
  - Deep linking
  - Testing instructions
- [x] `docs/PUSH_NOTIFICATIONS_EXAMPLES.md` (700+ lines)
  - Real-world code examples
  - Component patterns
  - Screen integration
  - Backend integration
- [x] `PUSH_NOTIFICATIONS_README.md` (Main overview)

#### Configuration (3 files)
- [x] `app.json` - Firebase plugins and permissions updated
- [x] `package.json` - Firebase dependencies added
- [x] `IMPLEMENTATION_CHECKLIST.md` - This file

#### Export Updates (2 files)
- [x] `src/services/index.ts` - Push notification service exports
- [x] `src/hooks/index.ts` - Notification hooks exports

#### Analytics Updates (1 file)
- [x] `src/utils/analytics/analyticsService.ts` - New notification event types

## Configuration Steps

### Firebase Setup
- [ ] Download `google-services.json` for Android
  - Place in: `mobile-app/` root directory
  - Verify SHA1 fingerprints match
- [ ] Download `GoogleService-Info.plist` for iOS
  - Store securely (EAS will handle)
  - Verify bundle ID matches

### Environment Variables
- [ ] Create `.env.local` file in mobile-app root
- [ ] Add Firebase configuration:
  ```
  FIREBASE_API_KEY=...
  FIREBASE_AUTH_DOMAIN=...
  FIREBASE_PROJECT_ID=...
  FIREBASE_STORAGE_BUCKET=...
  FIREBASE_MESSAGING_SENDER_ID=...
  FIREBASE_APP_ID=...
  ```
- [ ] Verify all 6 variables are set
- [ ] Do NOT commit `.env.local` to git

### Dependencies
- [ ] Run `npm install` in mobile-app directory
- [ ] Verify Firebase packages installed:
  ```bash
  npm list @react-native-firebase/app
  npm list @react-native-firebase/messaging
  ```
- [ ] Clear npm cache if needed: `npm cache clean --force`

## Integration Steps

### Auth Context Integration
- [ ] Update `src/store/auth-context.tsx`:
  - [ ] Import `pushNotificationService`
  - [ ] Import `SecureStorageService`
  - [ ] Create `secureStorageRef`
  - [ ] Add initialization in `useEffect`
  - [ ] Initialize on `authenticated` status
  - [ ] Call `cleanup()` on unmount
  - [ ] Handle initialization errors gracefully

### Navigation Integration
- [ ] Add `NotificationCenterScreen` to navigation stack
- [ ] Verify screen imports: `from '@/screens/notifications'`
- [ ] Set navigation options (title, etc.)
- [ ] Test navigation to NotificationCenter screen

### Header Integration
- [ ] Create or update header component
- [ ] Import `useUnreadNotifications` hook
- [ ] Add notification bell button
- [ ] Display unread badge
- [ ] Add tap handler to navigate to NotificationCenter
- [ ] Style consistently with app design

### Deep Linking Setup (Optional)
- [ ] Create deep link handler in auth context
- [ ] Setup navigation integration
- [ ] Test notification navigation to correct screens

## Testing

### Unit Tests
- [ ] Run push notification service tests:
  ```bash
  npm test pushNotificationService.test
  ```
- [ ] Verify all tests pass
- [ ] Check test coverage (target: >90%)
- [ ] Review test output for any warnings

### Integration Tests
- [ ] Test on Android device/emulator
- [ ] Test on iOS simulator/device
- [ ] Verify permission requests
- [ ] Verify FCM token obtained
- [ ] Check SecureStorage storage

### Manual Testing
- [ ] Send test notification from Firebase Console
- [ ] Verify received in foreground
- [ ] Verify received in background
- [ ] Verify received from terminated state
- [ ] Verify notification center displays it
- [ ] Verify mark as read works
- [ ] Verify delete works
- [ ] Verify deep linking works
- [ ] Verify offline queueing
- [ ] Verify retry logic
- [ ] Verify badge counting
- [ ] Verify analytics events

### Verification Checklist
- [ ] Permission dialog shows on iOS
- [ ] Permission dialog shows on Android 13+
- [ ] FCM token stored securely
- [ ] Unread badge displays correct count
- [ ] Notifications filtered by type correctly
- [ ] Pull-to-refresh works
- [ ] Clear All button works
- [ ] Navigation from notification works
- [ ] No console errors or warnings

## Documentation Review

- [ ] Read `PUSH_NOTIFICATIONS_README.md`
- [ ] Read setup section of `docs/PUSH_NOTIFICATIONS.md`
- [ ] Review API reference in `docs/PUSH_NOTIFICATIONS.md`
- [ ] Review examples in `docs/PUSH_NOTIFICATIONS_EXAMPLES.md`
- [ ] Review integration guide: `docs/PUSH_NOTIFICATIONS_INTEGRATION.md`
- [ ] Share documentation with team

## Backend Integration

### Token Registration
- [ ] Create device token registration endpoint:
  ```
  POST /user/device-tokens
  {
    token: string,
    platform: 'ios' | 'android',
    appVersion: string
  }
  ```
- [ ] Create token refresh endpoint:
  ```
  POST /user/device-tokens/refresh
  {
    oldToken: string,
    newToken: string
  }
  ```
- [ ] Implement token cleanup for deleted tokens

### Notification Sending
- [ ] Setup Firebase Admin SDK integration
- [ ] Create notification sending service:
  - [ ] Send to single user
  - [ ] Send to user segment
  - [ ] Send to topic
  - [ ] Batch sending
- [ ] Implement notification payload builder:
  - [ ] Title and body
  - [ ] Notification type
  - [ ] Priority level
  - [ ] Deep links
  - [ ] Custom data
- [ ] Add error handling and logging
- [ ] Add metrics/monitoring

### Testing Notifications
- [ ] Send test transaction notification
- [ ] Send test alert notification
- [ ] Send test update notification
- [ ] Verify different payload types
- [ ] Test deep linking
- [ ] Verify analytics events

## Deployment

### Local Development
- [ ] Build and test on Android: `npm run android`
- [ ] Build and test on iOS: `npm run ios`
- [ ] Test with Expo: `npm start`
- [ ] Verify all functionality works

### EAS Build
- [ ] Ensure `google-services.json` in root
- [ ] Build for Android: `eas build --platform android`
- [ ] Build for iOS: `eas build --platform ios`
- [ ] Download and install APK/IPA
- [ ] Test on physical devices
- [ ] Verify permissions requested
- [ ] Verify notifications working

### Production Deployment
- [ ] Review security settings
- [ ] Verify analytics tracking
- [ ] Check error handling
- [ ] Monitor notification delivery
- [ ] Setup monitoring alerts
- [ ] Document runbook for issues

## Monitoring & Maintenance

### Analytics
- [ ] Monitor notification delivery rates
- [ ] Track notification open rates
- [ ] Identify high-error scenarios
- [ ] Review event patterns

### Error Monitoring
- [ ] Setup error tracking (e.g., Sentry)
- [ ] Monitor FCM errors
- [ ] Alert on high error rates
- [ ] Track retry patterns

### Performance
- [ ] Monitor app initialization time
- [ ] Track notification queue size
- [ ] Monitor storage usage
- [ ] Track battery impact

### Security
- [ ] Verify token rotation
- [ ] Check encrypted storage
- [ ] Monitor permission usage
- [ ] Audit access logs

## Common Issues & Solutions

### Build Failures
- [ ] Check `google-services.json` is in root
- [ ] Verify Firebase plugins in `app.json`
- [ ] Clear cache: `npm cache clean --force`
- [ ] Delete node_modules and reinstall
- [ ] Check minimum SDK versions

### Permission Issues
- [ ] Ensure `POST_NOTIFICATIONS` in Android permissions
- [ ] Verify iOS entitlements configured
- [ ] Check device settings allow notifications
- [ ] Test with app freshly installed

### Token Issues
- [ ] Verify Firebase project ID is correct
- [ ] Check google-services.json syntax
- [ ] Ensure Google Play Services installed (Android)
- [ ] Verify APNs certificate (iOS)

### Message Not Received
- [ ] Check FCM token registered on backend
- [ ] Verify notification payload is valid
- [ ] Check app has notification permission
- [ ] Verify user not opted out
- [ ] Check device is online

See `docs/PUSH_NOTIFICATIONS.md` for detailed troubleshooting.

## Post-Launch

### Week 1
- [ ] Monitor notification delivery rates
- [ ] Fix any critical issues
- [ ] Verify analytics events
- [ ] Gather user feedback

### Week 2-4
- [ ] Optimize based on metrics
- [ ] Add additional notification types as needed
- [ ] Improve deep linking
- [ ] Enhance UI based on feedback

### Ongoing
- [ ] Monitor analytics dashboard
- [ ] Watch error rates
- [ ] Keep dependencies updated
- [ ] Review and optimize performance
- [ ] Gather user feedback
- [ ] Plan enhancements

## Sign-Off

- [ ] Development complete
- [ ] Tests passing (>90% coverage)
- [ ] Documentation reviewed
- [ ] Team trained
- [ ] Ready for QA testing
- [ ] QA approval obtained
- [ ] Ready for production deployment
- [ ] Production deployment complete
- [ ] Monitoring setup verified
- [ ] Production testing complete

## Team Members

- **Lead Developer**: _____________________ Date: _____
- **QA Tester**: _____________________ Date: _____
- **Backend Lead**: _____________________ Date: _____
- **Product Manager**: _____________________ Date: _____

## Notes

```
[Use this space for any additional notes, blockers, or decisions]
```

## Resources

- Firebase Documentation: https://firebase.google.com/docs/cloud-messaging
- React Native Firebase: https://rnfirebase.io/messaging/usage
- Push Notifications Best Practices: https://firebase.google.com/docs/cloud-messaging/best-practices
- This Project Documentation: `docs/PUSH_NOTIFICATIONS.md`

## Rollback Plan

If issues arise in production:

1. Disable notification sending from backend (stop sending new notifications)
2. Disable notification permissions request in app (next build)
3. Monitor error rates
4. Identify root cause
5. Deploy fix
6. Gradual rollout to avoid issues
7. Monitor metrics

## Success Metrics

- [ ] >90% permission acceptance rate
- [ ] <5% error rate on delivery
- [ ] >20% notification open rate
- [ ] <100ms per notification processing
- [ ] <1% offline queue backlog
- [ ] Users report feature useful

---

**Last Updated**: 2026-10-08
**Status**: Ready for Implementation
