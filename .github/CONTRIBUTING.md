# Contributing to Lucide React

Thank you for your interest in contributing to Lucide React! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful and constructive in all interactions. We welcome diverse perspectives and backgrounds.

## Getting Started

### 1. Fork & Clone
```bash
git clone https://github.com/YOUR_USERNAME/lucide-react.git
cd lucide-react
```

### 2. Setup Development Environment
```bash
./setup.sh
npm run dev
```

### 3. Create Feature Branch
```bash
git checkout -b feat/your-feature-name
# or for bug fixes:
git checkout -b fix/your-bug-fix
```

## Development Workflow

### Before Coding
- Check existing issues and PRs to avoid duplicates
- Create an issue for discussion if proposing new features
- Link your PR to related issues

### While Coding
- Follow the project's code style (Prettier + ESLint)
- Add tests for new features
- Keep commits atomic and descriptive
- Reference issue numbers in commits

### Before Committing
```bash
npm run format      # Auto-format code
npm run lint        # Check linting
npx tsc -b          # Type check
npm run test:e2e    # Run tests
npm run build       # Verify build
```

## Commit Message Format

Follow conventional commits format:
```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting, missing semicolons, etc)
- `refactor`: Code refactoring without feature changes
- `perf`: Performance improvement
- `test`: Test additions or fixes
- `chore`: Build, dependencies, tooling

**Examples:**
```
feat(cases): add case detail modal
fix(auth): handle token refresh race condition
docs: update setup instructions
chore: update dependencies
```

## Submitting Changes

### 1. Create Pull Request
- Use descriptive title following conventional commits
- Reference related issues using `Closes #123`
- Provide clear description of changes
- Include screenshots/demos if applicable

### 2. PR Checklist
Before submitting, ensure:
- ✅ Code follows style guidelines
- ✅ Tests pass locally
- ✅ No new linting warnings
- ✅ Documentation updated
- ✅ Commit messages follow format
- ✅ No merge conflicts

### 3. Review Process
- Maintainers will review your PR
- Address feedback and push updates
- CI checks must pass before merging
- Typically merged within 2-5 days

## Testing

### Run All Tests
```bash
npm run test:e2e
```

### Run Tests in UI Mode
```bash
npm run test:e2e:ui
```

### Debug Tests
```bash
npm run test:e2e:debug
```

### Add New Tests
- E2E tests go in `e2e/` directory
- Test file pattern: `*.spec.ts`
- Follow existing test patterns

## Project Structure

```
src/
├── screens/       # Full-page components
├── components/    # Reusable UI components
├── stores/        # Zustand state management
├── services/      # API clients
├── mocks/         # Mock data for development
├── contexts/      # React contexts (Auth, Toast)
├── types/         # TypeScript interfaces
├── utils/         # Helper functions
├── hooks/         # Custom React hooks
├── constants.ts   # App constants
└── App.tsx        # Root component

e2e/              # Playwright tests
.github/          # GitHub Actions workflows
```

## Key Technologies

- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **Axios** - HTTP client
- **React Router** - Routing
- **Playwright** - E2E testing
- **Vite** - Build tool

## Style Guide

### Code Style
- Use TypeScript for type safety
- Follow Prettier formatting rules
- Max line length: 100 characters
- Use meaningful variable names
- One export per component file

### Component Structure
```typescript
import { ReactNode } from 'react'

interface ComponentProps {
  children: ReactNode
  className?: string
}

export function Component({ children, className }: ComponentProps) {
  return <div className={className}>{children}</div>
}
```

### File Naming
- Components: PascalCase (Button.tsx)
- Utilities: camelCase (formatDate.ts)
- Types: index.ts for exports
- Tests: *.spec.ts pattern

## Documentation

### Update Documentation When
- Adding new features
- Changing existing behavior
- Improving setup/installation
- Adding utility functions
- Modifying architecture

### Documentation Files
- `README.md` - Project overview
- `QUICK_START.md` - 5-minute setup
- `README_DESENVOLVIMENTO.md` - Full development guide
- `INTEGRATION_SETUP.md` - API integration guide
- `.github/CICD_SETUP.md` - CI/CD configuration

## Common Tasks

### Add New Component
1. Create `src/components/MyComponent.tsx`
2. Define TypeScript interface for props
3. Implement component with Tailwind styles
4. Export from component index
5. Add to component showcase/docs

### Add New Screen
1. Create `src/screens/MyScreen.tsx`
2. Use ProtectedRoute in App.tsx
3. Add to bottom navigation if needed
4. Create E2E tests

### Add New Store
1. Create `src/stores/myStore.ts`
2. Use Zustand with useStore pattern
3. Add TypeScript interfaces
4. Export hook function
5. Add store initialization if needed

### Modify API Integration
1. Update `src/services/apiClient.ts`
2. Add new methods as needed
3. Update types in `src/types/index.ts`
4. Update stores that use the API
5. Test with real API or mocks

## Debugging

### Browser DevTools
```javascript
// Enable mock data
localStorage.setItem('ENABLE_MOCK_DATA', 'true')
location.reload()

// Disable mock data
localStorage.removeItem('ENABLE_MOCK_DATA')
```

### VS Code Debugging
1. Install Debugger for Chrome extension
2. Add breakpoints in code
3. Run: `npm run dev`
4. Open Chrome DevTools (F12)

### State Debugging
```javascript
// Check Zustand store state
window.__ZUSTAND_DEBUG__ = true
```

## Performance Tips

- Use React DevTools Profiler
- Lazy load components with React.lazy
- Optimize images and assets
- Monitor bundle size with Vite analyze
- Use memoization for expensive computations

## Security Guidelines

- Never commit secrets or API keys
- Use environment variables for sensitive data
- Validate user input
- Keep dependencies updated
- Report security issues privately

## Getting Help

- **Issues**: Ask questions in GitHub issues
- **Discussions**: Use discussions for broader topics
- **Documentation**: Check README and guides
- **Examples**: Review existing code patterns

## Recognition

Contributors will be recognized in:
- Release notes for significant contributions
- CONTRIBUTORS.md file
- Project documentation

## License

By contributing, you agree that your contributions will be licensed under the project's license.

---

**Happy contributing!** 🚀
