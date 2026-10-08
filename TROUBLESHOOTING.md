# Troubleshooting Guide

Comprehensive guide to solving common issues during setup and development.

## Quick Reference

### Installation Issues
- Node.js not found: Install from https://nodejs.org/
- npm ERESOLVE error: `npm install --legacy-peer-deps`
- OpenSSL not found: `brew install openssl` (macOS) or `apt-get install openssl` (Linux)

### Environment Issues
- .env.local not found: `cp .env.example .env.local` then run `./scripts/setup.sh`
- Invalid encryption key: `./scripts/generate-keys.sh --all`
- Port already in use: `lsof -i :3000` then `kill -9 <PID>`

### Security Issues
- Hardcoded secrets found: `./scripts/validate-security.sh` then `./scripts/generate-keys.sh --rotate-encryption`
- .env.local in git: `git rm --cached .env.local`

### Testing Issues
- Tests fail: `npm run test -- --reporter=verbose`
- No test files found: Ensure files are named `*.test.ts` or `*.spec.ts`

### Build Issues
- Build fails: `npm run build:typecheck` to check TypeScript
- Build too large: `npm prune` to remove unused dependencies

## Validation Commands

Always run these to diagnose issues:

```bash
# Full configuration validation
./scripts/validate-config.sh

# Security validation
./scripts/validate-security.sh

# Environment validation
./scripts/validate-config.sh --env

# Dependency validation
npm audit
```

## Common Solutions

### Installation
```bash
# Setup from scratch
./scripts/setup.sh

# Or Windows PowerShell
.\scripts\setup.ps1
```

### Configuration
```bash
# Create environment file
cp .env.example .env.local

# Generate all keys
./scripts/generate-keys.sh --all

# Configure for development
./scripts/dev-setup.sh --development
```

### Development
```bash
# Start dev server
npm run dev

# Watch tests
npm run test:watch

# Fix linting
npm run lint -- --fix

# Run all validations
npm run test && npm run lint && ./scripts/validate-security.sh
```

### Cleanup
```bash
# Clean cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## For Detailed Help

- **SETUP.md** - Complete installation guide
- **DEVELOPMENT.md** - Development best practices
- **CONTRIBUTING.md** - Contribution guidelines
- **GitHub Issues** - Search for similar problems
- **Email Support** - support@lucide-react.dev

---

Last Updated: October 2024
