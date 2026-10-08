# Contributing to Lucide React

Thank you for your interest in contributing to Lucide React! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to support@lucide.app.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue list as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title**
* **Describe the exact steps which reproduce the problem**
* **Provide specific examples to demonstrate the steps**
* **Describe the behavior you observed after following the steps**
* **Explain which behavior you expected to see instead and why**
* **Include screenshots and animated GIFs if possible**
* **Include your environment details** (device, OS version, app version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* **Use a clear and descriptive title**
* **Provide a step-by-step description of the suggested enhancement**
* **Provide specific examples to demonstrate the steps**
* **Describe the current behavior and the expected behavior**
* **Explain why this enhancement would be useful**

### Pull Requests

* Follow the [Code Style & Conventions](#code-style--conventions) guidelines
* Include appropriate test cases
* Update documentation as needed
* Follow the Git workflow described below
* End all files with a newline

## Development Setup

### Prerequisites

- Node.js v18.0 or higher
- npm v9.0 or higher
- React Native CLI v0.72 or higher
- Xcode 14+ (for iOS development on macOS)
- Android Studio (for Android development)

### Setup Instructions

```bash
# 1. Fork and clone the repository
git clone https://github.com/your-username/lucide-react.git
cd lucide-react

# 2. Install dependencies
npm install

# 3. Install iOS dependencies (macOS only)
cd ios && pod install && cd ..

# 4. Create environment file
cp .env.example .env.local

# 5. Start development server
npm start

# 6. In another terminal, start iOS or Android
npm run ios      # iOS on macOS
npm run android  # Android
```

## Git Workflow

### Branch Naming

Use these prefixes for branch names:

- `feature/` - New features (e.g., `feature/add-batch-processing`)
- `fix/` - Bug fixes (e.g., `fix/sync-conflicts`)
- `refactor/` - Code refactoring (e.g., `refactor/optimize-database`)
- `docs/` - Documentation updates (e.g., `docs/update-api-reference`)
- `test/` - Test additions (e.g., `test/add-ocr-tests`)

### Creating a Pull Request

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and commit with clear messages:
   ```bash
   git commit -m "feat(camera): add auto-focus capability

   - Implement auto-focus algorithm
   - Add focus indicator UI
   - Include focus distance feedback"
   ```

3. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Create Pull Request** on GitHub:
   - Use a clear title
   - Reference any related issues (#123)
   - Describe what changes were made and why
   - Include screenshots for UI changes
   - List any breaking changes

### Commit Message Format

Follow conventional commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type**: feat, fix, docs, style, refactor, test, chore
**Scope**: Feature area (camera, sync, ocr, etc.)
**Subject**: Brief description (50 chars max)
**Body**: Detailed explanation (wrap at 72 chars)
**Footer**: Issue references (Closes #123)

### Example Commits

```
feat(sync): implement conflict resolution

Add automatic merge strategy for non-conflicting changes
and user-guided resolution for overlapping edits.

Closes #456
```

```
fix(ocr): improve text extraction accuracy

Increase preprocessing image contrast to handle
low-light document photos better.

Fixes #789
```

## Code Style & Conventions

### TypeScript

- Use strict TypeScript mode
- Annotate all function parameters and return types
- Use interfaces for object structures
- Prefer `const` over `let` or `var`

```typescript
// Good
interface Document {
  id: string;
  title: string;
  createdAt: Date;
}

const processDocument = (doc: Document): Promise<void> => {
  // implementation
};

// Bad
let doc: any = {};
function process(d) {
  // implementation
}
```

### React Components

- Use functional components with hooks
- Extract reusable logic into custom hooks
- Define prop types with TypeScript interfaces
- Use meaningful component names

```typescript
// Good
interface DocumentListProps {
  documents: Document[];
  onSelect: (doc: Document) => void;
}

const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  onSelect
}) => {
  return <div>...</div>;
};

// Bad
const DocList = (props: any) => {
  return <div>...</div>;
};
```

### File Organization

```
src/
├── screens/
│   └── DocumentListScreen.tsx
├── components/
│   ├── common/
│   │   └── DocumentCard.tsx
│   └── features/
│       └── DocumentGrid.tsx
├── services/
│   ├── api/
│   ├── storage/
│   ├── sync/
│   └── ocr/
├── hooks/
│   └── useDocumentList.ts
├── types/
│   └── Document.ts
├── utils/
│   └── formatDate.ts
└── App.tsx
```

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `DocumentList.tsx` |
| Hooks | camelCase with 'use' | `useDocumentSync.ts` |
| Services | PascalCase | `DocumentService.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |
| Interfaces/Types | PascalCase | `DocumentProps` |

### Formatting

All code is automatically formatted with Prettier. Before committing:

```bash
npm run format
```

Linting is checked with ESLint:

```bash
npm run lint
npm run lint --fix  # auto-fix issues
```

Type checking:

```bash
npm run type-check
```

## Testing

### Writing Tests

Tests should be colocated with source files:

```
src/components/
├── DocumentList.tsx
└── DocumentList.test.tsx
```

Use this structure for tests:

```typescript
import { render, screen } from '@testing-library/react';
import { DocumentList } from './DocumentList';

describe('DocumentList', () => {
  it('renders document items', () => {
    const docs = [{ id: '1', title: 'Doc 1' }];
    render(<DocumentList documents={docs} onSelect={() => {}} />);
    expect(screen.getByText('Doc 1')).toBeInTheDocument();
  });

  it('calls onSelect when item clicked', () => {
    const onSelect = jest.fn();
    const docs = [{ id: '1', title: 'Doc 1' }];
    render(<DocumentList documents={docs} onSelect={onSelect} />);
    screen.getByText('Doc 1').click();
    expect(onSelect).toHaveBeenCalled();
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test --watch

# Run tests with coverage
npm test --coverage

# Run specific test file
npm test DocumentList.test.tsx
```

### Test Coverage Goals

- Statements: 80%+
- Branches: 75%+
- Functions: 80%+
- Lines: 80%+

## Pull Request Review Checklist

Before submitting your PR, ensure:

- [ ] Code follows style guidelines
- [ ] All tests pass (`npm test`)
- [ ] No console warnings or errors
- [ ] Documentation updated if needed
- [ ] No breaking changes (or clearly documented)
- [ ] Commit messages are clear and descriptive
- [ ] Branch is up to date with main

## Documentation

### Updating Documentation

If your changes affect user-facing features:

1. Update relevant sections in [USER_GUIDE.md](../USER_GUIDE.md)
2. Update API documentation in [API_REFERENCE.md](../API_REFERENCE.md)
3. Update architecture docs if structure changed
4. Add entries to changelog

### Adding Code Comments

Write clear comments explaining the "why", not the "what":

```typescript
// Good: Explains why this logic exists
// Batch sync operations to reduce server load and latency
const batchSize = 50;

// Bad: Restates what the code does
// Set batchSize to 50
const batchSize = 50;
```

## Release Process

### Version Numbers

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes (e.g., 1.0.0 → 2.0.0)
- **MINOR**: New features (e.g., 1.0.0 → 1.1.0)
- **PATCH**: Bug fixes (e.g., 1.0.0 → 1.0.1)

### Release Steps

1. Update version in `package.json`
2. Update [CHANGELOG.md](CHANGELOG.md)
3. Create release branch: `git checkout -b release/v1.2.0`
4. Commit version changes
5. Create Pull Request for review
6. After approval, merge to main
7. Tag release: `git tag v1.2.0`
8. Push tag: `git push origin v1.2.0`
9. Create GitHub Release with changelog

## Community

### Getting Help

- **Issues**: Use GitHub issues for bugs and features
- **Discussions**: Use GitHub Discussions for general questions
- **Email**: support@lucide.app for security issues
- **Forum**: https://forum.lucide.app for community discussion

### Becoming a Contributor

Contributors who make significant contributions may be added to the project team:

- Regular pull requests merged
- Active participation in code review
- Positive community engagement
- Demonstrated knowledge of codebase

## Additional Resources

- [Developer Guide](../DEVELOPER_GUIDE.md)
- [Technical Architecture](../ARCHITECTURE.md)
- [API Reference](../API_REFERENCE.md)
- [Troubleshooting Guide](../TROUBLESHOOTING.md)

## License

By contributing to Lucide React, you agree that your contributions will be licensed under the same license as the project.

---

*Last Updated: October 2024*
*Version: 2.0*
*Contributing Guidelines for Lucide React*
