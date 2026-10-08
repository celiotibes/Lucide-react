# Testing Strategy

**Version**: 1.0.0  
**Last Updated**: 2024-10-08  
**Purpose**: Define testing approach, coverage targets, and best practices for CRMT Mobile

## Table of Contents

1. [Overview](#overview)
2. [Testing Pyramid](#testing-pyramid)
3. [Test Types & Scope](#test-types--scope)
4. [Coverage Targets](#coverage-targets)
5. [Test Organization](#test-organization)
6. [Decision Matrix](#decision-matrix)
7. [Writing Guidelines](#writing-guidelines)
8. [Code Review Checklist](#code-review-checklist)

## Overview

The CRMT Mobile application uses a **test pyramid** approach with three layers:

- **Unit Tests** (70%): Fast, focused tests of individual functions
- **Integration Tests** (20%): Test feature modules and interactions
- **E2E Tests** (10%): User-facing workflows and critical paths

This strategy ensures:
- Fast feedback on code changes (unit tests)
- Confidence in feature interactions (integration tests)
- Real-world scenario validation (E2E tests)
- Sustainable test maintenance

### Testing Goals

1. **Reliability**: Tests that consistently pass/fail
2. **Speed**: Quick feedback to developers
3. **Clarity**: Tests that document expected behavior
4. **Maintainability**: Easy to update and extend
5. **Coverage**: 85%+ coverage on critical code

## Testing Pyramid

```
                        /\
                       /  \
                      /E2E \        Few, slow, expensive
                     /Tests \       Real browser/device
                    /________\
                    
                   /          \
                  /Integration \   More, medium speed
                 /   Tests      \  Real dependencies
                /________________\

         /                          \
        /      Unit Tests            \  Many, fast, cheap
       /      (Mocked)               \ Mock dependencies
      /________________________________\
```

### Test Distribution by Layer

| Layer | Count | Speed | Cost | Coverage |
|-------|-------|-------|------|----------|
| Unit Tests | 150-200 | < 100ms | Low | Business logic |
| Integration Tests | 30-50 | 100ms-1s | Medium | Modules |
| E2E Tests | 10-20 | 1-10s | High | Critical paths |

## Test Types & Scope

### 1. Unit Tests

**Purpose**: Test individual functions and components in isolation

**Characteristics**:
- Mock all external dependencies
- Fast execution (< 100ms)
- Test single behavior
- Use Jest

**Example**:

```typescript
// src/utils/validators/__tests__/email.test.ts
import { validateEmail } from '../email';

describe('validateEmail', () => {
  it('testValidateValidEmail', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });

  it('testRejectInvalidEmail', () => {
    expect(validateEmail('invalid-email')).toBe(false);
  });

  it('testRejectEmptyString', () => {
    expect(validateEmail('')).toBe(false);
  });
});
```

**When to write**:
- ✓ Pure functions (validators, formatters, calculations)
- ✓ React components (props, state, callbacks)
- ✓ Hooks (state changes, effects)
- ✓ Services (business logic)
- ✗ API calls (use mocks)
- ✗ Real database operations (use mocks)

**Tools**: Jest, @testing-library/react-native, jest-mock-extended

### 2. Integration Tests

**Purpose**: Test feature modules and component interactions

**Characteristics**:
- Use real dependencies where appropriate
- Mock external services (API, database)
- Test complete features
- Run within Jest
- Slower than unit tests but still fast

**Example**:

```typescript
// src/services/__tests__/auth.integration.test.ts
import { loginUser } from '../auth';
import * as api from '../../api/client';

jest.mock('../../api/client');

describe('Auth Service Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('testSuccessfulLogin', async () => {
    const mockResponse = {
      token: 'test-token',
      user: { id: '1', email: 'test@example.com' },
    };

    (api.post as jest.Mock).mockResolvedValue(mockResponse);

    const result = await loginUser('test@example.com', 'password');

    expect(result).toEqual(mockResponse);
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'test@example.com',
      password: 'password',
    });
  });

  it('testLoginFailure', async () => {
    (api.post as jest.Mock).mockRejectedValue(
      new Error('Invalid credentials')
    );

    await expect(
      loginUser('test@example.com', 'wrong')
    ).rejects.toThrow('Invalid credentials');
  });
});
```

**When to write**:
- ✓ API interactions (with mocked responses)
- ✓ Database operations (with mocked database)
- ✓ Component with multiple sub-components
- ✓ Redux/Zustand store interactions
- ✓ Navigation flows within same screen
- ✗ User interactions across multiple screens (use E2E)

**Tools**: Jest, @testing-library, supertest for API mocking

### 3. E2E Tests

**Purpose**: Test complete user workflows on real device/simulator

**Characteristics**:
- Run on real simulator/emulator
- Real app build
- Real network (or mocked API server)
- Slower but validate complete flow
- Use Detox

**Example**:

```typescript
// e2e/auth/login.e2e.js
describe('Login E2E Flow', () => {
  it('testCompleteLoginFlow', async () => {
    // Tap email input
    await element(by.id('emailInput')).typeText('user@example.com');

    // Tap password input
    await element(by.id('passwordInput')).typeText('password');

    // Tap submit
    await element(by.id('loginButton')).multiTap(1);

    // Verify navigation to dashboard
    await waitFor(element(by.id('dashboardScreen')))
      .toBeVisible()
      .withTimeout(5000);

    // Verify user profile visible
    await expect(element(by.id('userProfileButton'))).toBeVisible();
  });
});
```

**When to write**:
- ✓ Critical user workflows
- ✓ Complete features (login, transaction creation)
- ✓ Navigation between screens
- ✓ Data persistence
- ✓ Platform-specific behavior
- ✗ Individual component rendering (use unit tests)
- ✗ Business logic (use unit/integration tests)

**Tools**: Detox, Jest as test runner

## Coverage Targets

### Global Coverage Targets

| Metric | Target | Priority |
|--------|--------|----------|
| Statements | 80% | High |
| Branches | 80% | High |
| Functions | 80% | High |
| Lines | 80% | High |

### Module-Specific Targets

#### 1. Services (API, Auth, Database)
- **Target**: 85%+ coverage
- **Priority**: Critical
- **Why**: Core business logic, security-sensitive

```typescript
// src/services/auth.ts
export async function loginUser(email: string, password: string) {
  // Should have 85%+ coverage
}
```

#### 2. Database
- **Target**: 85%+ coverage
- **Priority**: Critical
- **Why**: Data integrity essential

```typescript
// src/database/models/transaction.ts
export class Transaction extends Model {
  // Should have 85%+ coverage
}
```

#### 3. Components
- **Target**: 80%+ coverage
- **Priority**: High
- **Why**: UI behavior affects user experience

```typescript
// src/components/TransactionForm.tsx
export function TransactionForm() {
  // Should have 80%+ coverage
}
```

#### 4. Screens
- **Target**: 75%+ coverage
- **Priority**: Medium
- **Why**: Composition of components + navigation

```typescript
// src/screens/TransactionScreen.tsx
export function TransactionScreen() {
  // Should have 75%+ coverage
}
```

#### 5. Utils
- **Target**: 80%+ coverage
- **Priority**: High
- **Why**: Used widely, high impact

```typescript
// src/utils/validators.ts
export function validateEmail(email: string) {
  // Should have 80%+ coverage
}
```

### Coverage Tracking

Coverage reports are generated and tracked:

```bash
# Generate coverage report
npm run test:report

# View HTML report
open coverage/index.html

# Check metrics
cat coverage/metrics.json
```

## Test Organization

### Directory Structure

```
src/
├── components/
│   ├── TransactionForm.tsx
│   └── __tests__/
│       ├── TransactionForm.test.tsx
│       ├── TransactionForm.snapshot.test.tsx
│       └── TransactionForm.integration.test.tsx
│
├── services/
│   ├── auth.ts
│   └── __tests__/
│       ├── auth.test.ts (unit)
│       └── auth.integration.test.ts (integration)
│
├── database/
│   ├── models/
│   └── __tests__/
│       └── transaction.test.ts
│
└── utils/
    ├── validators.ts
    └── __tests__/
        └── validators.test.ts

e2e/
├── auth/
│   ├── login.e2e.js
│   ├── signup.e2e.js
│   └── helpers.js
├── transactions/
│   ├── create.e2e.js
│   └── list.e2e.js
└── config.e2e.js
```

### Naming Conventions

Use clear, descriptive test names:

```typescript
// Good: Describes behavior
it('testValidateEmailRejectsInvalidFormat', () => {});

// Good: Clear expected result
it('testLoginSucceedsWithValidCredentials', () => {});

// Bad: Vague
it('test1', () => {});

// Bad: Tests multiple things
it('testLoginAndNavigationAndDataLoad', () => {});
```

## Decision Matrix

Use this matrix to decide which test type to write:

| Scenario | Test Type | Reasoning |
|----------|-----------|-----------|
| Pure function (validator, formatter) | Unit | Fast, no dependencies |
| React component with props | Unit | Test rendering + interactions |
| Custom hook | Unit | Test state/side effects |
| Service method (auth, API) | Unit + Integration | Unit: logic, Integration: API calls |
| Screen component | Unit + Integration | Unit: rendering, Integration: navigation |
| Multi-screen flow | E2E | Real user scenario |
| Critical user path | E2E | Validate complete workflow |
| Error handling | Unit + Integration | Both layers |
| Data persistence | Integration + E2E | Integration: logic, E2E: real storage |
| Performance (animations) | E2E | Only visible in real app |
| Platform-specific code | Unit + E2E | Unit: logic, E2E: behavior |

## Writing Guidelines

### Unit Test Template

```typescript
describe('FunctionName', () => {
  // Setup fixtures and mocks
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Happy path
  it('testSuccessfulScenario', () => {
    const result = functionUnderTest(validInput);
    expect(result).toEqual(expectedOutput);
  });

  // Error cases
  it('testErrorHandling', () => {
    expect(() => functionUnderTest(invalidInput))
      .toThrow('Expected error message');
  });

  // Edge cases
  it('testEdgeCase', () => {
    const result = functionUnderTest(edgeInput);
    expect(result).toEqual(edgeOutput);
  });
});
```

### Integration Test Template

```typescript
describe('FeatureName Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDependencies();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('testCompleteFeatureFlow', async () => {
    // Setup
    const mockData = { /* ... */ };

    // Mocks
    (apiClient.get as jest.Mock).mockResolvedValue(mockData);

    // Execute
    const result = await featureFunction();

    // Verify
    expect(result).toEqual(expectedResult);
    expect(apiClient.get).toHaveBeenCalledWith('/endpoint');
  });
});
```

### E2E Test Template

```javascript
describe('Feature E2E', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.sendUserActivity({ detoxPrintBusyIdleResources: 'YES' });
  });

  it('testUserFlow', async () => {
    // Wait for initial element
    await waitFor(element(by.id('startButton')))
      .toBeVisible()
      .withTimeout(5000);

    // User action
    await element(by.id('startButton')).multiTap(1);

    // Wait for next screen
    await waitFor(element(by.id('nextScreen')))
      .toBeVisible()
      .withTimeout(5000);

    // Verify result
    await expect(element(by.text('Success'))).toBeVisible();
  });
});
```

### Best Practices

1. **One assertion focus**: Test single behavior
   ```typescript
   // Good
   it('testValidateEmailWithValidInput', () => {
     expect(validateEmail('user@example.com')).toBe(true);
   });

   // Bad: Multiple behaviors
   it('testValidation', () => {
     expect(validateEmail('user@example.com')).toBe(true);
     expect(validatePassword('SecurePass123')).toBe(true);
   });
   ```

2. **Use descriptive names**: Clarify expected behavior
   ```typescript
   // Good
   it('testReturnsFalseForEmptyEmail', () => {});

   // Bad
   it('test', () => {});
   ```

3. **Arrange-Act-Assert pattern**:
   ```typescript
   it('testLoginSuccess', async () => {
     // Arrange: Setup data and mocks
     const testUser = { email: 'test@example.com' };
     mockAuthService.login.mockResolvedValue({ token: 'token' });

     // Act: Execute the code
     const result = await authService.login(testUser);

     // Assert: Verify the result
     expect(result.token).toBe('token');
   });
   ```

4. **Use test fixtures**:
   ```typescript
   const mockTransaction = {
     id: '1',
     amount: 100,
     date: new Date('2024-01-01'),
     type: 'expense',
   };

   it('testCreateTransaction', () => {
     const result = createTransaction(mockTransaction);
     expect(result).toEqual(mockTransaction);
   });
   ```

5. **Keep tests isolated**:
   ```typescript
   // Good: Each test is independent
   describe('Validators', () => {
     let validator: Validator;

     beforeEach(() => {
       validator = new Validator();
     });

     it('testEmail', () => {
       expect(validator.email('test@example.com')).toBe(true);
     });

     it('testPhone', () => {
       expect(validator.phone('1234567890')).toBe(true);
     });
   });
   ```

## Code Review Checklist

When reviewing tests, check:

### Coverage
- [ ] Lines added have corresponding tests
- [ ] Coverage increased or maintained
- [ ] Edge cases tested
- [ ] Error paths tested

### Quality
- [ ] Test names are descriptive
- [ ] Single responsibility per test
- [ ] No hardcoded test data (use fixtures)
- [ ] Proper setup/teardown with beforeEach/afterEach
- [ ] No test interdependencies
- [ ] Mocks properly cleared between tests

### Structure
- [ ] Tests organized in appropriate layer (unit/integration/E2E)
- [ ] Tests co-located with source code
- [ ] Follows project naming conventions
- [ ] Uses project test utilities

### Maintenance
- [ ] Tests document expected behavior
- [ ] No hardcoded timeouts or sleeps (use waitFor)
- [ ] Easily can be updated when behavior changes
- [ ] Uses descriptive selectors (IDs, not text)

### Performance
- [ ] Unit tests run quickly
- [ ] No unnecessary mocks
- [ ] No synchronous operations in async tests
- [ ] Proper timeout values

## Continuous Integration

### Test Execution

```bash
# Run all tests with coverage
npm run test:ci

# Runs:
# 1. Unit tests (coverage collected)
# 2. Integration tests
# 3. E2E tests (in CI)
# 4. Coverage report generation
```

### Success Criteria

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] 80%+ overall coverage
- [ ] No coverage decrease
- [ ] E2E tests pass (Android + iOS)
- [ ] No flaky tests (retry once)

## Metrics & Reporting

### Coverage Report

Generated by `npm run test:report`:

```
Test Coverage Report
═══════════════════════════════════
Statements:   85.2% | Target: 80% ✓
Branches:     82.1% | Target: 80% ✓
Functions:    87.3% | Target: 80% ✓
Lines:        86.5% | Target: 80% ✓
═══════════════════════════════════

By Module:
Services:     92.1% | Target: 85% ✓
Database:     89.3% | Target: 85% ✓
Components:   81.2% | Target: 80% ✓
```

### Tracking Progress

Monitor in:
- GitHub Actions: Test results per PR
- Coverage HTML report: Detailed breakdown
- `coverage/metrics.json`: Machine-readable metrics

## FAQ

**Q: How many tests should I write?**
A: Follow the pyramid: 1 unit test per function, 1 integration test per feature, 1 E2E test per critical workflow.

**Q: When to add E2E vs integration?**
A: Use integration for isolated features, E2E for complete user flows across screens.

**Q: How to handle flaky tests?**
A: Use `waitFor()` instead of `sleep()`, increase timeouts, mock external dependencies.

**Q: Should I test private functions?**
A: No. Test public interfaces. Private functions are tested through public methods.

**Q: Coverage target seems high, can we lower it?**
A: Discuss in team. Current 80-85% targets are industry standard for quality apps.

---

**Last Updated**: 2024-10-08  
**Maintainer**: QA/Development Team
