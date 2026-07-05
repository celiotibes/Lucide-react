# Testing Guide - Legal Automation Tool

Complete guide for setting up, running, and writing tests for the Legal Automation Tool.

## 📋 Table of Contents

1. [Setup](#setup)
2. [Running Tests](#running-tests)
3. [Test Structure](#test-structure)
4. [E2E Tests](#e2e-tests)
5. [Writing Tests](#writing-tests)
6. [Database Management](#database-management)
7. [CI/CD Integration](#cicd-integration)

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 15+ (for test database)
- npm or yarn

### Initial Setup

```bash
# 1. Install dependencies
npm install

# 2. Setup PostgreSQL test database
psql -U postgres -c "CREATE DATABASE legal_automation_test;"

# 3. Configure environment
cp .env.example .env
# Edit .env and add:
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/legal_automation_test
```

### Docker Setup (Recommended)

```bash
# Start PostgreSQL and Redis for testing
docker-compose up -d postgres redis

# Create test database
docker-compose exec postgres psql -U legaluser -d legal_automation -c "CREATE DATABASE legal_automation_test;"
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm test -- --watch
```

### Run with Coverage Report

```bash
npm test -- --coverage
```

View coverage report:
```bash
open coverage/index.html
```

### Run Specific Test Suite

```bash
# Authentication tests only
npm test -- auth.e2e.test.ts

# Petition tests only
npm test -- petition.e2e.test.ts
```

### Run Tests by Pattern

```bash
# Run all tests matching "should create"
npm test -- -t "should create"

# Run all auth-related tests
npm test -- -t "Auth"
```

## Test Structure

### Directory Layout

```
src/
├── __tests__/
│   ├── integration/
│   │   ├── auth.e2e.test.ts          # Authentication flows
│   │   └── petition.e2e.test.ts       # Petition lifecycle
│   ├── setup/
│   │   ├── testDatabase.ts            # DB setup/cleanup/reset
│   │   └── testHelpers.ts             # Factory functions
│   └── unit/                          # (future) Unit tests
```

### Test File Naming

- `*.test.ts` - Test files (picked up by Jest)
- `*.spec.ts` - Alternative naming (also picked up)

### Test Organization

Each test file should follow this structure:

```typescript
import request from 'supertest';
import app from '@/index';
import { setupTestDatabase, cleanupTestDatabase, resetTestDatabase } from '../setup/testDatabase';
import { createTestUser } from '../setup/testHelpers';

describe('Feature Name', () => {
  // Setup/Teardown
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  // Test suites
  describe('Specific Functionality', () => {
    it('should do something', async () => {
      // Arrange
      const testUser = await createTestUser();
      
      // Act
      const response = await request(app)
        .post('/api/v1/petitions')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ /* data */ });
      
      // Assert
      expect(response.status).toBe(201);
    });
  });
});
```

## E2E Tests

### Authentication Tests (`auth.e2e.test.ts`)

Tests for all authentication flows:

- **POST /api/v1/auth/register** - User registration
- **POST /api/v1/auth/login** - User login
- **POST /api/v1/auth/2fa/challenge** - 2FA challenge creation
- **POST /api/v1/auth/2fa/verify** - 2FA verification
- **GET /api/v1/auth/certificates** - List certificates
- **POST /api/v1/auth/certificate/upload** - Upload certificate
- **DELETE /api/v1/auth/certificates/:fingerprint** - Delete certificate
- **POST /api/v1/auth/logout** - User logout

**Coverage:**
- ✅ Happy path scenarios
- ✅ Validation error cases
- ✅ Authorization checks
- ✅ Edge cases (duplicate email, invalid credentials)

### Petition Tests (`petition.e2e.test.ts`)

Tests for petition lifecycle management:

- **GET /api/v1/petitions** - List user's petitions
- **POST /api/v1/petitions** - Create petition draft
- **POST /api/v1/petitions/:id/generate** - Generate with AI
- **POST /api/v1/petitions/:id/validate** - Validate content
- **POST /api/v1/petitions/:id/sign** - Sign with certificate
- **POST /api/v1/petitions/:id/submit** - Submit to tribunal

**Coverage:**
- ✅ CRUD operations
- ✅ Status transitions
- ✅ Validation rules
- ✅ Authentication requirements

## Writing Tests

### Test Template

```typescript
it('should [expected behavior] when [condition]', async () => {
  // Arrange - Set up test data and state
  const testUser = await createTestUser();
  const testPetition = await createTestPetition(testUser.id);

  // Act - Perform the action
  const response = await request(app)
    .post(`/api/v1/petitions/${testPetition.id}/validate`)
    .set('Authorization', `Bearer ${testUser.token}`)
    .send({});

  // Assert - Check the results
  expect(response.status).toBe(200);
  expect(response.body.status).toBe('success');
  expect(response.body.validation).toBeDefined();
});
```

### Common Test Helpers

```typescript
import { 
  createTestUser,           // Create user with token
  createTestPetition,       // Create petition
  createTestProcess,        // Create process
  createAuthHeader          // Create auth header
} from '../setup/testHelpers';

// Example usage
const user = await createTestUser({
  email: 'custom@example.com',
  password: 'CustomPass123!',
  oabNumber: '654321'
});

const petition = await createTestPetition(user.id, {
  tribunal: 'trf4',
  status: 'validated'
});

const headers = createAuthHeader(user.token);
```

### Assertions

```typescript
// Status codes
expect(response.status).toBe(200);
expect(response.status).toBe(201);
expect(response.statusCode).toBe(401);

// Response structure
expect(response.body).toBeDefined();
expect(response.body.status).toBe('success');
expect(response.body.error).toBeDefined();

// Array tests
expect(Array.isArray(response.body.petitions)).toBe(true);
expect(response.body.petitions.length).toBeGreaterThan(0);

// Object properties
expect(response.body.user).toBeDefined();
expect(response.body.user.email).toBe('test@example.com');
```

## Database Management

### Test Database Setup

```typescript
// In beforeAll()
await setupTestDatabase();  // Creates pool, verifies connection

// In beforeEach()
await resetTestDatabase();  // Clears and recreates all tables

// In afterAll()
await cleanupTestDatabase(); // Closes connection pool
```

### Manual Database Operations

```typescript
import { getTestDatabase } from '../setup/testDatabase';

// Get connection pool
const pool = getTestDatabase();

// Execute query
const result = await pool.query(
  'SELECT * FROM users WHERE email = $1',
  ['test@example.com']
);

console.log(result.rows);
```

### Reset Production Database

```bash
# Using npm script
npm run db:reset

# Using make
make db-reset

# Using ts-node directly
npx ts-node scripts/reset-db.ts
```

### Run Migrations

```bash
# Using npm script
npm run db:migrate

# Using make
make db-migrate

# Using ts-node directly
npx ts-node scripts/migrate.ts
```

## CI/CD Integration

### GitHub Actions

The CI/CD pipeline automatically runs tests:

```yaml
# .github/workflows/ci-cd.yml

- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm test -- --coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

### Local CI Simulation

```bash
# Run full lint, type-check, and test suite
npm run lint && npm run type-check && npm test

# Or using make
make check
```

### Test Requirements

- Minimum coverage: 50% (branches, functions, lines, statements)
- No TypeScript errors (`npm run type-check`)
- No ESLint violations (`npm run lint`)
- All E2E tests must pass

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
psql -U postgres -c "SELECT version();"

# Verify test database exists
psql -U postgres -l | grep legal_automation_test

# Create if missing
psql -U postgres -c "CREATE DATABASE legal_automation_test;"
```

### Test Timeouts

If tests timeout, increase Jest timeout:

```typescript
describe('Slow operation', () => {
  jest.setTimeout(10000); // 10 seconds
  
  it('should complete', async () => {
    // test code
  });
});
```

### Connection Pool Issues

```bash
# Reset connection pool
npm run db:reset

# Or in test code
await cleanupTestDatabase();
await setupTestDatabase();
```

### Supertest Issues

```typescript
// Ensure app is exported
export default app;

// Use proper request method
const response = await request(app)
  .post('/api/v1/petitions');

// Always include expect() for assertions
expect(response.status).toBe(201);
```

## Best Practices

✅ **DO:**
- Use descriptive test names
- Test both happy path and error cases
- Use beforeEach/afterEach for cleanup
- Group related tests with describe()
- Use factory functions for test data
- Assert on behavior, not implementation
- Test edge cases and boundaries

❌ **DON'T:**
- Skip test cleanup (beforeEach/afterEach)
- Test multiple concerns in one test
- Use hardcoded IDs or emails
- Assume test execution order
- Share state between tests
- Make external API calls in tests
- Ignore test failures

## Coverage Goals

| Category | Current | Target |
|----------|---------|--------|
| Lines | - | 70% |
| Functions | - | 70% |
| Branches | - | 60% |
| Statements | - | 70% |

## Future Test Plans

- [ ] Process search E2E tests
- [ ] AI service mock integration tests
- [ ] Digital signature tests
- [ ] Multi-tribunal adapter tests
- [ ] Projudi SOAP integration tests
- [ ] DataJud API mock tests
- [ ] Performance/load tests
- [ ] Security tests (CORS, rate limiting)

## References

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)
- [PostgreSQL Testing](https://www.postgresql.org/docs/current/test.html)
