# E2E Tests with Playwright

End-to-end tests that simulate real user interactions with the application UI.

## Setup

### 1. Install Playwright

```bash
npm install --save-dev @playwright/test
npx playwright install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update values:

```bash
cp tests/e2e/.env.example tests/e2e/.env
```

### 3. Configure Test User

Update test credentials in `.env`:

```env
TEST_USER_EMAIL=your@email.com
TEST_USER_PASSWORD=yourPassword
```

## Running Tests

### Run all E2E tests

```bash
npm run test:e2e
```

### Run tests in headed mode (see browser)

```bash
npm run test:e2e:headed
```

### Run tests with UI mode (interactive)

```bash
npm run test:e2e:ui
```

### Run specific test file

```bash
npx playwright test tests/e2e/auth.spec.ts
```

### Run tests with specific tag

```bash
npx playwright test --grep @critical
```

## Test Structure

### Test Files

- **auth.spec.ts** - Authentication and login flows
- **dre.spec.ts** - DRE (Demonstração de Resultado do Exercício)
- **fluxo-caixa.spec.ts** - Cash flow analysis
- **margens.spec.ts** - Margin analysis
- **reembolsos.spec.ts** - Reimbursement management
- **pix.spec.ts** - PIX payments and reconciliation

### Fixtures

Reusable helper functions in `tests/fixtures/`:

- **auth.ts** - Login/logout utilities

## Best Practices

### 1. Test Data

Use test data attributes in components for reliable selection:

```tsx
<button data-testid="login-button">Login</button>
```

### 2. Wait Strategies

Use explicit waits instead of fixed delays:

```typescript
await page.waitForLoadState('networkidle');
await page.waitForURL('**/dashboard', { timeout: 5000 });
```

### 3. Assertions

Be specific with assertions:

```typescript
// Good
expect(page.url()).toContain('/dashboard');

// Avoid
await page.waitForTimeout(1000);
```

### 4. Test Isolation

Each test should be independent and not rely on previous tests.

## CI/CD Integration

Tests run automatically on:

- Push to main/develop branches
- Pull requests to main/develop
- Manual trigger via GitHub Actions

View results:

1. GitHub Actions tab in repository
2. Check "E2E Tests (Playwright)" workflow
3. Download artifacts for detailed reports

## Debugging

### View Test Report

```bash
npx playwright show-report
```

### Run single test

```bash
npx playwright test tests/e2e/auth.spec.ts -g "should login"
```

### Debug mode

```bash
npx playwright test --debug
```

## Troubleshooting

### Port Already in Use

If `http://localhost:5173` is in use:

```bash
# Kill the process or use different port
lsof -i :5173
kill -9 <PID>
```

### Tests Timing Out

Increase timeout in `playwright.config.ts`:

```typescript
use: {
  navigationTimeout: 30000,
  actionTimeout: 10000,
}
```

### Flaky Tests

- Use `test.slow()` for slower operations
- Increase retries in CI
- Check network conditions
- Verify test data availability

## Performance

Target metrics:

- **Auth**: < 2 seconds
- **DRE**: < 5 seconds
- **Fluxo Caixa**: < 5 seconds
- **Margens**: < 5 seconds
- **Reembolsos**: < 5 seconds
- **PIX**: < 5 seconds

## Contributing

When adding new tests:

1. Follow naming convention: `feature.spec.ts`
2. Use data-testid for reliable selectors
3. Add test metadata (critical, smoke, etc.)
4. Test happy path and error scenarios
5. Document expected behavior

Example:

```typescript
test('should create item @critical', async ({ page }) => {
  // Arrange
  await page.goto('/items');
  
  // Act
  await page.click('button[data-testid="create-btn"]');
  await page.fill('input[data-testid="name"]', 'Test Item');
  await page.click('button[data-testid="submit"]');
  
  // Assert
  await expect(page.locator('[data-testid="success-msg"]')).toBeVisible();
});
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Locators](https://playwright.dev/docs/locators)
- [Test Assertions](https://playwright.dev/docs/test-assertions)
