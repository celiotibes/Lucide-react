# CRMT Mobile App - Contributing Guide

## Table of Contents

1. [Welcome](#welcome)
2. [Getting Started](#getting-started)
3. [Code Style Guide](#code-style-guide)
4. [Development Workflow](#development-workflow)
5. [Testing Requirements](#testing-requirements)
6. [Pull Request Process](#pull-request-process)
7. [Commit Message Conventions](#commit-message-conventions)
8. [Issue Reporting](#issue-reporting)
9. [Code Review Guidelines](#code-review-guidelines)
10. [Common Tasks](#common-tasks)

---

## Welcome

Thank you for your interest in contributing to the CRMT Mobile App! This guide will help you get started with development, testing, and submitting contributions.

### Types of Contributions

We welcome:

- **Bug Fixes**: Resolving issues in existing code
- **Features**: New functionality that adds value
- **Documentation**: Improvements to guides and API docs
- **Tests**: Additional test coverage for critical paths
- **Performance**: Optimizations and efficiency improvements
- **Security**: Identifying and fixing vulnerabilities
- **UX**: Improvements to user experience and interface

### Contribution Process

1. **Fork** the repository
2. **Create** feature branch
3. **Make changes** with tests
4. **Submit** pull request
5. **Respond** to reviews
6. **Merge** when approved

### Before You Start

- Read this entire guide
- Review existing issues to avoid duplicates
- Join our developer community Slack (optional)
- Check DEVELOPER_GUIDE.md for architecture details

---

## Getting Started

### 1. Set Up Development Environment

Follow the setup guide in DEVELOPER_GUIDE.md:

```bash
# Clone repository
git clone https://github.com/yourorg/Lucide-react.git
cd Lucide-react/mobile-app

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm start
```

### 2. Fork and Create Branch

```bash
# Fork via GitHub UI or CLI
# Then clone your fork
git clone https://github.com/yourname/Lucide-react.git
cd mobile-app

# Create feature branch (replace with your feature)
git checkout -b feature/your-feature-name
# or for bug fix
git checkout -b fix/bug-description
```

### 3. Branch Naming Conventions

**Format**: `<type>/<short-description>`

**Types**:
- `feature/` - New feature
- `fix/` - Bug fix
- `docs/` - Documentation
- `refactor/` - Code refactoring
- `perf/` - Performance optimization
- `test/` - Test additions
- `chore/` - Maintenance tasks

**Examples**:
- `feature/batch-upload`
- `fix/oauth-token-refresh`
- `docs/api-reference`
- `perf/reduce-render-time`

---

## Code Style Guide

### TypeScript/JavaScript

**Variable Naming**:
```typescript
// Good
const userEmail = 'user@example.com'
const isLoading = false
const calculateTotal = () => {}
const MAX_RETRIES = 3

// Bad
const ue = 'user@example.com'
const loading = false
const calc = () => {}
const maxRetries = 3  // Constants should be UPPER_CASE
```

**File Naming**:
```
// Components (PascalCase)
UserProfile.tsx
DocumentList.tsx

// Services (camelCase or PascalCase for classes)
authService.ts
OCRService.ts

// Types/Interfaces (PascalCase)
User.ts
DocumentMetadata.ts
```

**Component Structure**:
```typescript
import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Button } from 'react-native-paper'

// Types first
interface Props {
  title: string
  onPress: () => void
}

// Component
export const MyComponent: React.FC<Props> = ({ title, onPress }) => {
  // Hooks
  const [state, setState] = useState(false)
  
  // Handlers
  const handlePress = () => {
    setState(!state)
    onPress()
  }
  
  // Render
  return (
    <View style={styles.container}>
      <Button onPress={handlePress}>{title}</Button>
    </View>
  )
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
})
```

**Import Organization**:
```typescript
// 1. External packages
import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Button } from 'react-native-paper'

// 2. Type definitions
import type { Document } from '../types'

// 3. Internal modules
import { useDocuments } from '../hooks'
import { documentAPI } from '../api/endpoints'

// 4. Styles and constants
import { colors } from '../theme'
```

### Formatting

Use Prettier (automatic formatting):

```bash
# Format single file
npx prettier --write src/MyFile.tsx

# Format entire project
npx prettier --write src/

# Check formatting without changes
npx prettier --check src/
```

Configuration is in `.prettierrc.json`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2
}
```

### Linting

Run ESLint before committing:

```bash
# Check all files
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Check specific file
npx eslint src/MyFile.tsx
```

Configuration is in `.eslintrc.json` - don't disable rules without discussion.

### Type Safety

Always use TypeScript types:

```typescript
// Good - fully typed
const fetchUser = async (id: string): Promise<User> => {
  const response = await api.get<User>(`/users/${id}`)
  return response.data
}

// Bad - implicit any
const fetchUser = async (id) => {
  const response = await api.get(`/users/${id}`)
  return response.data
}
```

### Error Handling

```typescript
// Good - specific error handling
try {
  await uploadDocument(file)
} catch (error) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      // Handle auth error
      await logout()
    } else if (error.code === 'ECONNABORTED') {
      // Handle timeout
      showMessage('Request timeout, please try again')
    }
  } else {
    // Handle unknown error
    logger.error('Unexpected error', error)
  }
}

// Bad - catch-all
try {
  await uploadDocument(file)
} catch (error) {
  console.log(error)  // Don't just log
}
```

---

## Development Workflow

### Before Making Changes

```bash
# Update local main branch
git fetch origin
git checkout main
git pull origin main

# Create feature branch from updated main
git checkout -b feature/your-feature-name

# Verify setup
npm run type-check
npm run lint
npm test
```

### While Developing

```bash
# Keep changes focused
# 1 feature = 1 branch = 1 pull request

# Run tests frequently
npm run test:watch

# Check types as you code
npm run type-check

# Format code
npm run lint:fix

# Check for unused imports
npm run lint
```

### Before Committing

```bash
# Run full test suite
npm run test

# Check coverage
npm run test:coverage

# Type check
npm run type-check

# Lint
npm run lint

# If all pass: commit
git add .
git commit -m "feat: description of changes"
```

### Breaking Changes

If your change breaks existing functionality:

1. **Mark as breaking change** in commit message:
```
feat!: major feature that breaks compatibility

BREAKING CHANGE: Users must re-authenticate after this update.
```

2. **Update version**: Increment major version in `package.json`

3. **Document**: Add migration guide if complex

---

## Testing Requirements

### Test Coverage Requirements

- **Overall**: 80% minimum
- **Critical paths**: 90% minimum (auth, sync, OCR)
- **New code**: 100% for critical features

### Unit Tests

Test pure functions and isolated logic:

```typescript
// src/utils/__tests__/formatting.test.ts
import { formatCurrency } from '../formatting'

describe('formatCurrency', () => {
  it('formats currency with 2 decimal places', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50')
  })
  
  it('handles negative amounts', () => {
    expect(formatCurrency(-50)).toBe('-$50.00')
  })
  
  it('returns empty string for null input', () => {
    expect(formatCurrency(null)).toBe('')
  })
})
```

### Component Tests

Test React components and interactions:

```typescript
// src/components/__tests__/DocumentCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native'
import { DocumentCard } from '../DocumentCard'

describe('DocumentCard', () => {
  const mockDocument = {
    id: 'doc-123',
    title: 'Receipt',
    status: 'processed'
  }

  it('renders document title', () => {
    render(<DocumentCard document={mockDocument} />)
    expect(screen.getByText('Receipt')).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const mockPress = jest.fn()
    render(<DocumentCard document={mockDocument} onPress={mockPress} />)
    
    fireEvent.press(screen.getByTestId('document-card'))
    expect(mockPress).toHaveBeenCalledWith(mockDocument)
  })
})
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific file
npm test -- src/utils/__tests__/formatting.test.ts

# Watch mode (re-run on save)
npm run test:watch

# Coverage report
npm run test:coverage

# Specific test type
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests only
```

### What to Test

**Must Test**:
- Business logic functions
- Error conditions
- Edge cases
- Component user interactions
- State changes
- API integration

**Don't Need to Test**:
- React library functions
- Third-party library integration (unless custom wrapper)
- Simple pass-through components
- Constants and enums

---

## Pull Request Process

### Step 1: Prepare PR

Before pushing:

```bash
# Ensure branch is up to date
git fetch origin
git rebase origin/main

# Run all checks
npm run lint
npm run type-check
npm test
npm run test:coverage

# If any fail: fix and commit
git add .
git commit -m "fix: resolve linting issues"

# Push
git push origin feature/your-feature-name
```

### Step 2: Create PR on GitHub

1. Visit your forked repo on GitHub
2. Click "Compare & pull request" button (or "New pull request")
3. Ensure:
   - Base branch: `main` (or current development branch)
   - Compare branch: your `feature/your-feature-name`
4. Fill PR template (see below)

### Step 3: PR Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (fixes existing issue)
- [ ] Feature (adds new functionality)
- [ ] Breaking change (breaking existing functionality)
- [ ] Documentation update

## Related Issue
Fixes #123 (replace with actual issue number)

## How Has This Been Tested?
Describe testing performed:
- [ ] Unit tests added/updated
- [ ] Manual testing (describe steps)
- [ ] E2E tests run
- [ ] No new warnings/errors

## Screenshots (if applicable)
Include before/after or new UI screenshots

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented complex areas
- [ ] I have updated documentation
- [ ] Tests pass locally
- [ ] No new console warnings/errors
- [ ] Breaking changes are documented
```

### Step 4: Respond to Reviews

Reviewers will request changes:

1. Make requested changes in new commits
2. Push to same branch
3. PR automatically updates
4. Respond to comments (politely explain if disagreeing)
5. Mark conversations as "Resolved" when addressed
6. Request re-review when ready

**Etiquette**:
- Thank reviewers for feedback
- Ask questions if unclear
- Explain your reasoning if declining suggestion
- Don't take criticism personally

### Step 5: Merge

Once approved:

1. **Squash and merge** (for feature branches):
   ```bash
   # GitHub UI: Click "Squash and merge"
   # Combines all commits into one
   # Cleaner history
   ```

2. **Delete branch**:
   ```bash
   # GitHub UI: "Delete branch" button
   # Or locally: git branch -d feature/your-feature-name
   ```

3. **Celebrate**: Your code is now in production!

---

## Commit Message Conventions

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (not logic change)
- `refactor`: Code restructuring (no feature change)
- `perf`: Performance improvement
- `test`: Test additions
- `chore`: Build/tooling/dependencies

### Scope

Component or system affected:
- `auth`, `documents`, `transactions`, `sync`, `api`, `ui`, etc.
- Optional but recommended

### Subject

- Imperative mood ("add" not "added" or "adds")
- Lowercase
- No period at end
- Max 50 characters

### Body

- Optional but recommended for non-trivial commits
- Explain **what** and **why**, not **how**
- Max 72 characters per line
- Separated from subject by blank line

### Footer

- Optional, for referencing issues/PRs
- Format: `Fixes #123` or `Related to #456`

### Examples

```
feat(documents): add batch upload functionality

- Allow users to select multiple documents
- Show upload progress with individual file status
- Automatically retry failed uploads

Fixes #789

---

fix(sync): resolve token refresh race condition

Multiple concurrent requests could all attempt refresh.
Now use mutex to ensure single refresh operation.

Fixes #234

---

docs: update API reference with new endpoints

---

refactor(components): extract button styling to theme

No behavior change, just code organization.
```

---

## Issue Reporting

### Before Creating Issue

Check if already reported:
1. Search existing issues
2. Check pull requests (might be in progress)
3. Ask in Slack/community if unsure

### Issue Template

```markdown
## Describe the bug
Brief description of what's broken.

## To Reproduce
Steps to reproduce:
1. Open app
2. Navigate to Documents
3. Try to upload large file
4. Error appears

## Expected behavior
What should happen instead.

## Actual behavior
What actually happens instead.

## Environment
- Device: [e.g. Samsung Galaxy S21]
- OS: [e.g. Android 12]
- App Version: [e.g. 1.0.0]
- Reproducible: Always / Sometimes / Rarely

## Screenshots
Include screenshots of error/issue if applicable

## Logs
Include relevant log excerpts (if available)
```

### Issue Labels

Help us categorize:
- `bug`: Something is broken
- `feature`: Enhancement or new feature
- `documentation`: Needs docs update
- `performance`: Performance issue
- `security`: Security concern
- `help-wanted`: Looking for contributors
- `good-first-issue`: Suitable for new contributors

---

## Code Review Guidelines

### As an Author

- **Self-review first**: Read your own PR before submitting
- **Explain non-obvious code**: Add comments for complex logic
- **Keep PRs focused**: One feature per PR
- **Be responsive**: Reply to reviews promptly
- **Ask questions**: If feedback is unclear, ask for clarification

### As a Reviewer

- **Be kind**: Criticism should be constructive
- **Explain why**: Not just "don't do this"
- **Suggest improvements**: "Consider..." not "This is wrong"
- **Approve when ready**: Don't hold up good work
- **Acknowledge limitations**: "I'm not an expert in X"

### Review Checklist

When reviewing, check:

- [ ] Code follows style guidelines
- [ ] Tests pass and cover changes
- [ ] No console warnings/errors
- [ ] Performance is acceptable
- [ ] Security is not compromised
- [ ] Documentation is updated
- [ ] Commit messages are clear
- [ ] No debugging code left in
- [ ] No sensitive data exposed
- [ ] Breaking changes documented

---

## Common Tasks

### Adding a New Screen

```bash
# 1. Create screen file
touch src/screens/newfeature/NewFeatureScreen.tsx

# 2. Add to navigation
# Edit src/navigation/MainNavigator.tsx

# 3. Add types
# Edit src/types/navigation.ts

# 4. Create tests
touch src/screens/__tests__/NewFeatureScreen.test.tsx

# 5. Run checks
npm run lint
npm run type-check
npm test
```

### Adding a New API Endpoint

```bash
# 1. Create endpoint file
touch src/api/endpoints/newfeature.ts

# 2. Export from index
# Edit src/api/endpoints/index.ts

# 3. Add types
# Edit src/types/api.ts

# 4. Create hook or service
# Edit src/services/ or src/hooks/

# 5. Add tests
```

### Running Tests Locally

```bash
# Full test suite
npm test

# Specific file
npm test -- DocumentListScreen.test.tsx

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Integration tests
npm run test:integration
```

### Building for Distribution

```bash
# Android
npm run build:android

# Preview build (testing)
npm run build:preview

# Production build
npm run build:production

# iOS (requires macOS)
eas build --platform ios --profile production
```

---

## Resources

- **DEVELOPER_GUIDE.md**: Architecture and setup
- **API_REFERENCE.md**: API documentation
- **ARCHITECTURE_GUIDE.md**: System design
- **TROUBLESHOOTING.md**: Common issues
- **ESLint Rules**: `.eslintrc.json`
- **Prettier Config**: `.prettierrc.json`
- **Jest Config**: `jest.config.js`

---

## Questions?

- Check DEVELOPER_GUIDE.md
- Ask in PR comments
- Join developer Slack channel
- Email dev-team@accounting-legal.com

---

**Document Version**: 1.0  
**Last Updated**: October 2026

Thank you for contributing to CRMT Mobile App! 🎉
