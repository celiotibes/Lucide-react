# Contributing to Lucide React

Thank you for your interest in contributing to Lucide React! This guide will help you understand our development process and how to make effective contributions.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Process](#development-process)
4. [Making Changes](#making-changes)
5. [Submitting Changes](#submitting-changes)
6. [Code Review](#code-review)
7. [Security Reporting](#security-reporting)

## Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please read and adhere to our Code of Conduct:

- Be respectful and inclusive
- Welcome different perspectives
- Focus on constructive criticism
- Report inappropriate behavior

## Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub

# Clone your fork
git clone https://github.com/YOUR_USERNAME/lucide-react.git
cd lucide-react

# Add upstream remote
git remote add upstream https://github.com/ORIGINAL_OWNER/lucide-react.git
```

### 2. Setup Development Environment

```bash
# Run the setup script (handles all configuration)
chmod +x scripts/setup.sh
./scripts/setup.sh

# Or Windows:
.\scripts\setup.ps1
```

### 3. Create a Feature Branch

```bash
# Always create a new branch for your work
git checkout -b feature/your-feature-name

# Naming conventions:
# feature/description    - New feature
# bugfix/description     - Bug fix
# docs/description       - Documentation
# refactor/description   - Code refactoring
# test/description       - Test additions
```

## Development Process

### Before You Start

1. Check [issues](https://github.com/lucide-react/lucide-react/issues) for similar work
2. Create an issue to discuss major changes
3. Get feedback before implementing

### Development Workflow

```bash
# 1. Start your development
npm run dev

# 2. Watch for changes
npm run test:watch

# 3. Check code quality
npm run lint

# 4. Fix any issues
npm run lint -- --fix

# 5. Run full test suite
npm run test
npm run test:e2e

# 6. Validate security
./scripts/validate-security.sh
./scripts/validate-config.sh
```

### Code Quality Standards

Your code must meet these standards:

- **TypeScript**: Strict mode, proper typing
- **ESLint**: Zero errors and warnings
- **Tests**: 80%+ coverage for new code
- **Documentation**: Updated if needed
- **Commits**: Clear, conventional messages

## Making Changes

### File Structure

When adding new files, follow this structure:

```
src/
├── components/      # React components
├── hooks/          # Custom React hooks
├── services/       # Business logic services
├── types/          # TypeScript interfaces
├── utils/          # Utility functions
├── styles/         # CSS/SCSS files
└── __tests__/      # Test files (parallel structure)
```

### Naming Conventions

```typescript
// Component files
- UserProfile.tsx (PascalCase for components)
- user-profile.module.css (kebab-case for styles)

// Hooks
- useAuth.ts (use prefix, camelCase)
- useUserProfile.ts

// Services
- userService.ts (Service suffix, camelCase)
- authService.ts

// Types
- User.ts (PascalCase)
- user.types.ts (Alternative pattern)

// Tests
- UserProfile.test.tsx (Test suffix)
- userService.spec.ts (Spec suffix)

// Utils
- dateUtils.ts (Utils suffix, camelCase)
- string.helper.ts (Helper suffix)
```

### Code Examples

#### Components

```typescript
// ✓ Good component structure
import React, { FC } from 'react';
import styles from './UserProfile.module.css';
import { User } from '@/types/User';

interface UserProfileProps {
  user: User;
  onUpdate?: (user: User) => void;
}

/**
 * UserProfile component displays user information
 * @param user - The user object to display
 * @param onUpdate - Callback when user is updated
 */
export const UserProfile: FC<UserProfileProps> = ({ user, onUpdate }) => {
  return (
    <div className={styles.container}>
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
};
```

#### Hooks

```typescript
// ✓ Good custom hook
import { useState, useEffect } from 'react';
import { User } from '@/types/User';

interface UseUserReturn {
  user: User | null;
  loading: boolean;
  error: Error | null;
}

export function useUser(userId: string): UseUserReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchUser = async () => {
      try {
        const response = await fetch(`/api/users/${userId}`);
        const data = await response.json();
        if (isMounted) setUser(data);
      } catch (err) {
        if (isMounted) setError(err as Error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUser();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  return { user, loading, error };
}
```

#### Tests

```typescript
// ✓ Good test structure
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserProfile } from './UserProfile';
import { User } from '@/types/User';

describe('UserProfile', () => {
  let mockUser: User;

  beforeEach(() => {
    mockUser = {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com'
    };
  });

  it('should render user information', () => {
    render(<UserProfile user={mockUser} />);
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });

  it('should call onUpdate when user is modified', () => {
    const mockOnUpdate = vi.fn();
    render(<UserProfile user={mockUser} onUpdate={mockOnUpdate} />);
    
    const button = screen.getByRole('button', { name: /update/i });
    fireEvent.click(button);
    
    expect(mockOnUpdate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'John Doe'
    }));
  });
});
```

## Submitting Changes

### Prepare Your Changes

```bash
# 1. Ensure branch is up to date
git fetch upstream
git rebase upstream/develop

# 2. Run all validations
npm run lint -- --fix
npm run test
npm run test:e2e
./scripts/validate-security.sh

# 3. Commit with clear messages
git add .
git commit -m "feat: add user authentication feature"

# 4. Push to your fork
git push origin feature/your-feature-name
```

### Create Pull Request

1. Go to the repository on GitHub
2. Click "New Pull Request"
3. Select your branch
4. Fill in the PR template:

```markdown
## Description
Brief description of changes

## Related Issues
Closes #123

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added
- [ ] E2E tests added
- [ ] All tests pass

## Checklist
- [ ] Code follows project style
- [ ] Self-review completed
- [ ] No new warnings introduced
- [ ] Documentation updated
- [ ] No hardcoded secrets
- [ ] Tests pass locally
```

### PR Guidelines

- **One feature per PR**: Keep PRs focused and manageable
- **Descriptive title**: Use conventional commits format
- **Clear description**: Explain what and why, not just what
- **Link issues**: Reference related issues
- **Small PRs**: Smaller PRs are easier to review
- **Test coverage**: Include tests for new code

## Code Review

### What to Expect

- Constructive feedback on your code
- Requests to improve clarity or security
- Discussion of implementation approach
- Questions about edge cases

### Addressing Feedback

```bash
# 1. Make requested changes
# (edit files)

# 2. Add new commits
git add .
git commit -m "refactor: improve code clarity"

# 3. Push updates
git push origin feature/your-feature-name

# Do NOT force push unless asked
# Reviewers can see iteration history
```

### After Approval

- A maintainer will merge your PR
- Your branch will be deleted
- Thank you for contributing!

## Security Reporting

**IMPORTANT**: Do not report security vulnerabilities through public issues.

### Reporting a Vulnerability

1. Email: security@lucide-react.dev
2. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Your contact information

We will:
- Acknowledge receipt within 48 hours
- Work on a fix
- Coordinate responsible disclosure
- Credit you in the fix (if desired)

## Common Contribution Scenarios

### Adding a New Feature

```bash
# 1. Create feature branch
git checkout -b feature/new-feature

# 2. Implement feature
# src/components/NewComponent.tsx
# src/__tests__/components/NewComponent.test.tsx
# Update documentation

# 3. Ensure tests pass
npm run test

# 4. Validate everything
./scripts/validate-security.sh
npm run lint

# 5. Submit PR
git push origin feature/new-feature
```

### Fixing a Bug

```bash
# 1. Create bugfix branch
git checkout -b bugfix/bug-name

# 2. Add test that reproduces bug
# src/__tests__/Bug.test.tsx

# 3. Fix the bug
# src/bug.ts

# 4. Verify test passes
npm run test

# 5. Submit PR with:
# - Description of bug
# - Test demonstrating fix
# - Before/after comparison
```

### Improving Documentation

```bash
# 1. Create docs branch
git checkout -b docs/topic

# 2. Edit documentation files
# SETUP.md, DEVELOPMENT.md, etc.

# 3. Ensure clarity
# - Run spell check
# - Verify links work
# - Check code examples

# 4. Submit PR
```

## Resources

- [SETUP.md](./SETUP.md) - Development environment setup
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development guidelines
- [CODE_SIGNING_GUIDE.md](./CODE_SIGNING_GUIDE.md) - Signing commits
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - TypeScript reference
- [React Documentation](https://react.dev) - React reference
- [Testing Library](https://testing-library.com/) - Testing patterns

## Questions?

- Check existing [GitHub Issues](https://github.com/lucide-react/lucide-react/issues)
- Start a [Discussion](https://github.com/lucide-react/lucide-react/discussions)
- Email: support@lucide-react.dev

Thank you for contributing! 🚀

---

**Last Updated**: October 2024
**Maintainer**: Development Team
