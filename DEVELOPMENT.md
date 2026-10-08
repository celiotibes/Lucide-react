# Development Guidelines

Best practices and workflows for secure, productive development on Lucide React projects.

## Table of Contents

1. [Development Workflow](#development-workflow)
2. [Code Quality Standards](#code-quality-standards)
3. [Security Guidelines](#security-guidelines)
4. [Testing Strategy](#testing-strategy)
5. [Git Workflow](#git-workflow)
6. [Environment Variables](#environment-variables)
7. [Debugging](#debugging)
8. [Performance](#performance)

## Development Workflow

### Starting Development

```bash
# 1. Ensure environment is setup
./scripts/validate-config.sh

# 2. Install latest dependencies
npm install

# 3. Start development server
npm run dev

# 4. In another terminal, watch tests
npm run test:watch

# 5. In another terminal, watch linting
npm run lint -- --watch  # if available
```

### Daily Development

```bash
# Start of day: Pull latest changes
git pull origin develop

# Verify environment is still valid
./scripts/validate-security.sh
npm install  # Install any new dependencies

# Start dev server and tests
npm run dev &
npm run test:watch
```

### End of day: Before Committing

```bash
# Run all validation checks
npm run lint
npm run test
./scripts/validate-security.sh

# Review git diff
git diff

# Stage and commit
git add .
git commit -m "feat: description of changes"

# Pre-push validation happens automatically
git push origin feature-branch
```

## Code Quality Standards

### TypeScript

All code must be written in TypeScript with strict mode enabled:

```typescript
// ✓ Good: Explicit types
function processUser(user: User): Promise<UserResponse> {
  // Implementation
}

// ✗ Bad: Implicit types
function processUser(user) {
  // Implementation
}

// ✓ Good: Null checking
if (user?.email) {
  console.log(user.email);
}

// ✗ Bad: Unsafe access
console.log(user.email);  // Could be undefined
```

### ESLint Configuration

The project uses ESLint for code quality. Run before committing:

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint -- --fix

# Check specific file
npx eslint src/path/to/file.ts
```

### Code Formatting

The project uses Prettier for consistent formatting:

```bash
# Format all files
npx prettier --write .

# Check formatting
npx prettier --check .
```

### Import Organization

Follow this order for imports:

```typescript
// 1. External libraries
import { React } from 'react';
import { useSelector } from 'react-redux';

// 2. Absolute imports from project
import { useAuth } from '@/hooks/useAuth';
import { User } from '@/types/User';

// 3. Relative imports
import { Component } from './Component';
import { helper } from '../utils/helper';

// 4. Side effects (should be last)
import './styles.css';
```

### Naming Conventions

```typescript
// Files
- user.ts           // type/interface
- userService.ts    // service class
- useUser.ts        // custom hook
- UserComponent.tsx // React component
- user.test.ts      // test file

// Constants
const API_ENDPOINT = 'https://api.example.com';
const MAX_RETRIES = 3;

// Variables
const userName = 'John';
let isLoading = false;

// Functions
function getUserById(id: string): User {}
const fetchUser = async (id: string): Promise<User> => {};

// Classes
class UserService {}

// React Components
function UserProfile() {}
const UserCard = ({ user }: UserCardProps) => {};

// Interfaces and Types
interface User {
  id: string;
  name: string;
}

type UserResponse = User | null;
```

## Security Guidelines

### Handling Secrets

```typescript
// ✓ Good: Use environment variables
const apiKey = process.env.API_KEY;
const apiEndpoint = process.env.API_ENDPOINT;

// ✗ Bad: Hardcoded secrets
const apiKey = 'sk-1234567890abcdef';
const apiEndpoint = 'https://api.example.com';

// ✗ Bad: Secrets in code comments
// const password = 'admin123';  // Don't do this!
```

### API Requests

```typescript
// ✓ Good: Use HTTPS and certificate pinning
const response = await fetch('https://api.example.com/users', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// ✗ Bad: Unencrypted connection
const response = await fetch('http://api.example.com/users', {
  // No HTTPS
});

// ✗ Bad: Sending secrets in URL
const response = await fetch(`https://api.example.com/users?key=${apiKey}`, {
  // Secret exposed in URL
});
```

### Data Encryption

```typescript
// ✓ Good: Encrypt sensitive data
import { encrypt } from '@/utils/encryption';

const encryptedData = encrypt(sensitiveData, process.env.ENCRYPTION_KEY);

// ✓ Good: Use secure storage
localStorage.setItem('token', encryptedData);

// ✗ Bad: Store unencrypted sensitive data
localStorage.setItem('password', password);

// ✗ Bad: Log sensitive data
console.log('API Key:', process.env.API_KEY);
console.log('User Password:', user.password);
```

### Authentication & Authorization

```typescript
// ✓ Good: Verify JWT tokens
import jwt from 'jsonwebtoken';

function verifyToken(token: string): User | null {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded as User;
  } catch (error) {
    return null;
  }
}

// ✓ Good: Use secure session management
const session = await getSession();
if (!session?.user) {
  return redirect('/login');
}

// ✗ Bad: Trust client-provided user ID
const user = users.find(u => u.id === req.body.userId);

// ✗ Bad: No permission checks
app.delete('/users/:id', (req, res) => {
  User.deleteOne({ _id: req.params.id });
});
```

### Input Validation

```typescript
// ✓ Good: Validate and sanitize input
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email(),
  age: z.number().min(0).max(150),
  name: z.string().min(1).max(100)
});

function createUser(data: unknown) {
  const validated = userSchema.parse(data);  // Throws if invalid
  // Process validated data
}

// ✗ Bad: Trust user input directly
function createUser(data: any) {
  User.create(data);  // No validation!
}
```

### Error Handling

```typescript
// ✓ Good: Don't expose sensitive info in errors
try {
  await database.query(sql);
} catch (error) {
  console.error('Database operation failed');  // Generic message
  logger.error(error);  // Log full error for debugging
  throw new Error('An error occurred');  // Generic response to user
}

// ✗ Bad: Expose sensitive error details
try {
  await database.query(sql);
} catch (error) {
  console.error(error.message);  // Shows SQL and credentials
  throw error;  // Sends error to client
}
```

## Testing Strategy

### Test Coverage Requirements

- **Minimum**: 80% code coverage
- **Target**: 90% code coverage
- **Critical paths**: 100% coverage

### Running Tests

```bash
# Run all tests once
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test -- src/user.test.ts

# Run tests matching pattern
npm run test -- --grep "User.*profile"

# Generate coverage report
npm run test -- --coverage

# Generate HTML coverage report
npm run test -- --coverage --reporter=html
```

### Writing Tests

```typescript
// ✓ Good: Clear test descriptions
describe('UserService', () => {
  describe('getUserById', () => {
    it('should return user when ID exists', async () => {
      const user = await userService.getUserById('123');
      expect(user).toBeDefined();
      expect(user.id).toBe('123');
    });

    it('should throw when ID does not exist', async () => {
      expect(async () => {
        await userService.getUserById('nonexistent');
      }).rejects.toThrow();
    });
  });
});

// ✓ Good: Test both happy and error paths
it('should handle API errors gracefully', async () => {
  fetch.mockRejectedValueOnce(new Error('Network error'));
  
  expect(async () => {
    await fetchUser('123');
  }).rejects.toThrow('Network error');
});

// ✗ Bad: Vague test descriptions
it('works', () => {
  expect(result).toBeTruthy();
});

// ✗ Bad: No error testing
it('fetches user', async () => {
  const user = await fetchUser('123');
  expect(user).toBeDefined();
});
```

### E2E Testing

```bash
# Run Playwright E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run specific test file
npx playwright test src/e2e/login.spec.ts
```

## Git Workflow

### Branch Naming

```
feature/description-of-feature
bugfix/description-of-bug
hotfix/critical-issue
docs/description-of-docs
refactor/description-of-refactor
test/description-of-test
```

### Commit Messages

Follow conventional commits:

```
feat: add user authentication
fix: resolve login timeout issue
docs: update setup instructions
refactor: simplify user service
test: add authentication tests
```

### Making Changes

```bash
# 1. Create feature branch
git checkout -b feature/user-authentication

# 2. Make changes and commit
git add .
git commit -m "feat: add user authentication"

# 3. Keep branch updated
git pull origin develop

# 4. Push to remote
git push origin feature/user-authentication

# 5. Create pull request on GitHub
# - Add description
# - Link related issues
# - Request reviewers
```

### Code Review Checklist

Before submitting for review, ensure:

- [ ] Code follows project style guide
- [ ] All tests pass: `npm run test`
- [ ] No ESLint errors: `npm run lint`
- [ ] No security issues: `./scripts/validate-security.sh`
- [ ] No console.log or debugging code
- [ ] No hardcoded secrets
- [ ] Commit messages are clear
- [ ] No merge conflicts
- [ ] Documentation updated if needed

## Environment Variables

### Development Variables

```env
DEBUG_MODE=true
LOG_LEVEL=debug
LOG_NETWORK_REQUESTS=true
MOCK_API_RESPONSES=false
FEATURE_BIOMETRIC_AUTH=true
FEATURE_OFFLINE_MODE=true
```

### Accessing Variables in Code

```typescript
// ✓ Good: Use with default fallback
const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.example.com';

// ✓ Good: Use in React components
const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT;

// ✓ Good: TypeScript-safe environment
import { env } from '@/config/environment';
const apiKey = env.apiKey;  // Typed and validated

// ✗ Bad: Unsafe access
const apiKey = process.env.API_KEY;  // Could be undefined

// ✗ Bad: Client-side secrets
const secretKey = process.env.SECRET_KEY;  // Never expose secrets to client!
```

## Debugging

### Browser DevTools

```typescript
// ✓ Good: Use debugger
function getUserData(id: string) {
  debugger;  // Breakpoint
  const user = users.find(u => u.id === id);
  return user;
}

// ✓ Good: Conditional breakpoint
if (userId === 'problematic-id') {
  debugger;
}
```

### Console Logging

```typescript
// ✓ Good: Structured logging
import { logger } from '@/utils/logger';

logger.info('User fetched', { userId: '123', timestamp: Date.now() });
logger.error('Authentication failed', { reason: 'Invalid token' });

// ✓ Good: Temporary debugging
if (DEBUG_MODE) {
  console.log('User data:', userData);
}

// ✗ Bad: Left in production code
console.log('Password:', password);
console.log(apiKey);
```

### Source Maps

```bash
# Enable source maps in development
npm run dev  # Automatically enabled

# Build with source maps
npm run build  # Check vite.config.ts for sourcemap settings
```

## Performance

### Code Splitting

```typescript
// ✓ Good: Lazy load components
import { lazy, Suspense } from 'react';

const AdminPanel = lazy(() => import('./AdminPanel'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AdminPanel />
    </Suspense>
  );
}

// ✗ Bad: Load all at once
import AdminPanel from './AdminPanel';
import Dashboard from './Dashboard';
import Analytics from './Analytics';  // All loaded even if not used
```

### Memoization

```typescript
// ✓ Good: Memoize expensive computations
import { useMemo } from 'react';

function UserList({ users }) {
  const sortedUsers = useMemo(
    () => users.sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );
  return <div>{sortedUsers.map(u => <User key={u.id} user={u} />)}</div>;
}

// ✗ Bad: Recalculate every render
function UserList({ users }) {
  const sortedUsers = users.sort((a, b) => a.name.localeCompare(b.name));
  return <div>{sortedUsers.map(u => <User key={u.id} user={u} />)}</div>;
}
```

### Bundle Size

```bash
# Analyze bundle size
npm run build
# Check dist/ folder size

# Identify large dependencies
npm install -g webpack-bundle-analyzer
npm run build -- --analyze
```

---

**Last Updated**: October 2024
**Maintainer**: Development Team
