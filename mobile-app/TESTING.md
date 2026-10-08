# Phase 22.7: Testing & Quality Assurance

Comprehensive test suite for the CRMT Mobile App with focus on UI components, screens, and integration testing.

## Overview

This document describes the testing infrastructure for the mobile application including:
- Unit tests for components and hooks
- Screen-level integration tests
- End-to-end component flow tests
- Test coverage targets and reporting

## Test Structure

```
mobile-app/src/
├── components/
│   ├── __tests__/
│   │   ├── NetworkStatusIndicator.test.tsx
│   │   └── SyncStatusIndicator.test.tsx
├── screens/
│   ├── documents/
│   └── __tests__/
│       ├── DocumentsListScreen.test.tsx
│       ├── DocumentDetailScreen.test.tsx
│       └── SettingsScreen.test.tsx
└── __tests__/
    ├── setup.ts
    ├── mocks/
    │   └── services.ts
    └── integration/
        ├── NetworkStatusIntegration.test.tsx
        ├── SyncIntegration.test.tsx
        └── DocumentFlowIntegration.test.tsx
```

## Component Tests

### NetworkStatusIndicator.test.tsx

Tests for the network connectivity status indicator component.

**Coverage:**
- Online/offline status display
- Connection type detection (WiFi, 4G, etc.)
- Auto-hide functionality for online status
- Offline message display
- Compact mode rendering
- Component lifecycle (mount/unmount)
- Accessibility compliance

**Key Test Cases:**
```
✓ Should display online status with correct icon
✓ Should auto-hide after 3 seconds when online
✓ Should display connection type when available
✓ Should display offline status
✓ Should display offline message
✓ Should not auto-hide when offline
✓ Should render compact version correctly
✓ Should subscribe to network monitor on mount
✓ Should unsubscribe on unmount
```

### SyncStatusIndicator.test.tsx

Tests for the sync status indicator component with progress tracking.

**Coverage:**
- Sync status display (syncing, synced, error, conflict)
- Progress bar rendering and updates
- Pending changes count badge
- Manual sync button functionality
- Conflict indicator
- Offline sync prevention
- Compact mode with badge
- Last sync time display

**Key Test Cases:**
```
✓ Should display sync success status
✓ Should display syncing status with progress
✓ Should display error status
✓ Should display conflict status
✓ Should display pending changes count
✓ Should trigger sync when button pressed
✓ Should call onSyncPress callback
✓ Should disable sync button when syncing
✓ Should disable sync button when offline
✓ Should display offline message when offline
✓ Should show progress bar when syncing
```

## Screen Tests

### DocumentsListScreen.test.tsx

Tests for the documents list display screen.

**Coverage:**
- Document list loading from database
- Document sorting by creation date
- Search functionality (case-insensitive)
- Type-based filtering (All, Invoice, Receipt, Contract)
- Combined search and filter
- Empty state display
- Pull-to-refresh functionality
- FAB (Floating Action Button) navigation
- File size formatting
- Sync status indicators for unsynced documents
- Navigation to detail screen

**Test Categories:**
- Document List Loading
- Search Functionality
- Pull-to-Refresh
- Floating Action Button (FAB)
- Document Icons and Colors
- Sync Status Indicator
- Navigation
- File Size Formatting

### DocumentDetailScreen.test.tsx

Tests for the detailed document view screen.

**Coverage:**
- Document loading from database
- OCR text display with toggle
- Parsed data display (vendor, date, amount, items)
- Confidence score display
- Share functionality
- Delete functionality with confirmation
- Header navigation buttons
- Document type display
- Error handling
- Accessibility compliance

**Test Categories:**
- Document Loading
- OCR Text Display
- Parsed Data Display
- Share Functionality
- Delete Functionality
- Header Navigation Buttons
- Document Type Display
- Error Handling
- Accessibility

### SettingsScreen.test.tsx

Tests for the settings and preferences screen.

**Coverage:**
- User information display
- Auto-sync toggle
- Sync interval selection (1min, 5min, 15min, 30min, 1hour)
- OCR language selection (9 languages)
- Logout functionality with confirmation
- Cache clearing with confirmation
- Settings reset with confirmation
- Sync status indicator
- Settings persistence
- Error handling

**Test Categories:**
- User Information Display
- Auto-Sync Settings
- Sync Interval Settings
- OCR Language Selection
- Logout Functionality
- Cache Management
- Settings Reset
- Sync Status Display
- Settings Persistence
- Error Handling

## Integration Tests

### NetworkStatusIntegration.test.tsx

Tests the integration between NetworkStatusIndicator and NetworkMonitorService.

**Coverage:**
- Online to offline transitions
- Connection type changes
- Subscription lifecycle
- Auto-hide integration
- Service error handling
- Rapid status changes

**Key Scenarios:**
```
✓ Should handle transition from online to offline
✓ Should update UI when connection type changes
✓ Should subscribe on mount and unsubscribe on unmount
✓ Should properly integrate compact mode with network monitor
✓ Should auto-hide when online
✓ Should handle service initialization errors
✓ Should handle rapid status changes correctly
```

### SyncIntegration.test.tsx

Tests the integration between SyncStatusIndicator and useSyncManager hook.

**Coverage:**
- Sync progress flow (syncing → synced)
- Pending changes handling
- Conflict resolution
- Online/offline transitions
- Error handling and retry
- Callback integration
- Compact mode integration
- Rapid state transitions

**Key Scenarios:**
```
✓ Should transition from syncing to synced state
✓ Should display pending changes count
✓ Should sync pending changes when button pressed
✓ Should display conflict indicator
✓ Should handle offline conflicts gracefully
✓ Should transition from online to offline
✓ Should disable sync button when offline
✓ Should display sync error when present
✓ Should allow retry after error
✓ Should invoke callback when sync starts
```

### DocumentFlowIntegration.test.tsx

Tests the complete document lifecycle flow.

**Coverage:**
- Document capture to listing
- OCR processing and result display
- Data parsing and visualization
- Document detail navigation
- Sync integration
- Search and filter integration
- Error scenarios
- Network connectivity impact
- Full document lifecycle

**Test Scenarios:**
```
✓ Should load and display captured documents
✓ Should show unsynced indicator for captured documents
✓ Should navigate to detail screen when document tapped
✓ Should load and display OCR results
✓ Should display parsed OCR data
✓ Should display confidence score
✓ Should allow syncing from detail screen
✓ Should handle database loading errors
✓ Should handle missing OCR data
✓ Should show offline status when network unavailable
✓ Should prevent sync when offline
✓ Should handle complete document lifecycle
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Unit Tests Only
```bash
npm run test:unit
```

### Run Integration Tests Only
```bash
npm run test:integration
```

### Generate Coverage Report
```bash
npm run test:coverage
```

### Run Tests in CI Environment
```bash
npm run test:ci
```

## Test Coverage

### Coverage Thresholds

Global targets:
- **Branches:** 70%
- **Functions:** 70%
- **Lines:** 70%
- **Statements:** 70%

Component-specific targets:
- **Components:** 80% across all metrics
- **Screens:** 75% across all metrics

### Coverage Reports

After running tests with coverage, view reports:

1. **Text Summary:**
   ```bash
   npm test -- --verbose
   ```

2. **HTML Report:**
   Open `coverage/index.html` in a browser

3. **LCOV Report:**
   View `coverage/lcov-report/index.html` for detailed coverage

## Mocking Strategy

### Service Mocks

All external services are mocked to ensure tests are isolated and fast:

- **NetworkMonitorService:** Mocked to simulate online/offline states
- **useSyncManager:** Mocked to control sync state, progress, and conflicts
- **Database Instance:** Mocked to return test data without hitting real database
- **Authentication Hook:** Mocked with test user data

### Implementation Example

```typescript
jest.mock('@/services', () => ({
  NetworkMonitorService: jest.fn(function() {
    this.subscribe = jest.fn((callback) => {
      callback({ isOnline: true, connectionType: 'wifi' });
      return () => {};
    });
    this.getStatus = jest.fn(() => ({
      isOnline: true,
      connectionType: 'wifi',
    }));
    this.destroy = jest.fn();
  }),
}));
```

## Accessibility Testing

All components include basic accessibility tests:

- **Labels:** Verify meaningful labels for screen readers
- **Roles:** Check proper ARIA roles are applied
- **Navigation:** Test keyboard navigation
- **Contrast:** Ensure colors meet WCAG standards
- **Touch Targets:** Verify minimum 44x44 touch areas

## Performance Considerations

Tests are optimized for performance:

- **Fake Timers:** Used for auto-hide and interval tests
- **Mocked Animations:** Prevent React Native animation overhead
- **Batch Operations:** Multiple assertions per test where appropriate
- **Parallel Execution:** Jest runs tests in parallel by default

## Best Practices

### Writing New Tests

1. **Organize by Behavior:** Group tests by feature, not by type
2. **Use Descriptive Names:** Test names should describe what is being tested
3. **Follow Arrange-Act-Assert:** Clear structure for each test
4. **Mock Dependencies:** Never rely on external services
5. **Test Edge Cases:** Include error scenarios and boundary conditions

### Example Test Structure

```typescript
describe('ComponentName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Feature Group', () => {
    it('should perform expected behavior', async () => {
      // Arrange
      const props = { /* test props */ };

      // Act
      const { queryByText } = render(<Component {...props} />);

      // Assert
      await waitFor(() => {
        expect(queryByText(/expected text/)).toBeTruthy();
      });
    });
  });
});
```

## Continuous Integration

Tests run automatically on:
- Every commit (pre-commit hook)
- Pull requests (CI/CD pipeline)
- Before releases

### CI Command
```bash
npm run test:ci
```

## Troubleshooting

### Common Issues

**1. Tests Timeout**
- Increase timeout in jest.config.js: `testTimeout: 10000`
- Check for unresolved promises

**2. Module Not Found**
- Verify moduleNameMapper in jest.config.js
- Check path aliases match tsconfig.json

**3. Mock Not Working**
- Ensure mock is defined before component import
- Use jest.clearAllMocks() in beforeEach

**4. Coverage Threshold Exceeded**
- Run coverage report: `npm run test:coverage`
- View HTML report at `coverage/index.html`

## Future Improvements

Planned enhancements:
- [ ] Visual regression testing with snapshots
- [ ] E2E testing with Detox
- [ ] Performance profiling
- [ ] Accessibility scanning with axe-core
- [ ] Screenshot testing for UI changes

## Resources

- [Jest Documentation](https://jestjs.io/)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Testing Library Best Practices](https://testing-library.com/docs/queries/about)
- [React Native Testing Guide](https://reactnative.dev/docs/testing-overview)
