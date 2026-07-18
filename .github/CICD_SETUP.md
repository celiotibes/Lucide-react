# CI/CD Setup Guide

This project uses GitHub Actions for automated testing, linting, type checking, and deployment.

## Workflows Overview

### 1. CI Pipeline (`ci.yml`)
Runs on every push and pull request to ensure code quality.

**Jobs:**
- **lint-and-format**: ESLint and Prettier format checking
- **type-check**: TypeScript compilation check
- **build**: Production build verification
- **test-e2e**: Playwright E2E tests
- **security-audit**: npm audit for vulnerabilities
- **quality-gate**: Aggregate status check

**Triggers:**
- Push to: main, develop, claude/** branches
- Pull requests to: main, develop

### 2. Deploy Pipeline (`deploy.yml`)
Automatically deploys to Vercel on successful builds.

**Jobs:**
- **build-and-deploy**: Build and deploy to Vercel
- **lighthouse-audit**: Performance audit on PRs

**Triggers:**
- Push to main branch (production)
- Pull requests to main branch (preview)

**Environment:**
- Production: Main branch deployments
- Preview: Pull request deployments with automatic comments

### 3. Dependencies Pipeline (`dependencies.yml`)
Weekly automated dependency checks and updates.

**Jobs:**
- **update-dependencies**: Check for outdated packages and vulnerabilities

**Triggers:**
- Weekly schedule (Mondays at 00:00 UTC)
- Manual trigger via workflow_dispatch

## Required Secrets

To enable full CI/CD functionality, configure these GitHub repository secrets:

### For Vercel Deployment
```
VERCEL_TOKEN          # Vercel API token
VERCEL_ORG_ID         # Vercel organization ID
VERCEL_PROJECT_ID     # Vercel project ID
```

**How to get these:**
1. Visit https://vercel.com/account/tokens
2. Create a new token for CI/CD use
3. Add it to GitHub Settings → Secrets and variables → Actions
4. Get org ID and project ID from Vercel project settings

### For Environment Variables
```
VITE_API_URL          # API endpoint URL (set in deploy.yml or Vercel)
```

## Workflow Status Badges

Add to README.md:
```markdown
![CI Status](https://github.com/celiotibes/lucide-react/actions/workflows/ci.yml/badge.svg)
![Deploy Status](https://github.com/celiotibes/lucide-react/actions/workflows/deploy.yml/badge.svg)
```

## Local Validation

Before pushing, run locally to catch issues early:

```bash
# Check all quality gates
npm run lint              # ESLint
npm run format:check      # Prettier
npx tsc -b                # TypeScript
npm run test:e2e          # Playwright tests
npm run build             # Build verification
```

## Debugging Workflow Failures

### CI Pipeline Failed

1. **Lint Errors**: Run `npm run format` to auto-fix
2. **Type Errors**: Check TypeScript output: `npx tsc -b`
3. **Build Errors**: Review build logs in GitHub Actions
4. **Test Failures**: Run `npm run test:e2e:debug` locally

### Deployment Failed

1. Check Vercel logs in Actions output
2. Verify secrets are configured correctly
3. Ensure build command is correct in vercel.json
4. Check environment variables in Vercel dashboard

## Monitoring

### GitHub Actions Dashboard
- Repository → Actions tab
- Click workflow to view runs
- Click run to view job details
- View logs for each step

### Vercel Dashboard
- View deployment logs
- Monitor performance metrics
- Check environment variables
- Review build configuration

## Best Practices

1. **Before Merging PR**:
   - Ensure all CI checks pass ✅
   - Review code in PR
   - Check deployment preview URL

2. **Commit Messages**:
   - Follow conventional commits (feat:, fix:, chore:)
   - Reference issues if applicable

3. **Code Quality**:
   - Run `npm run format` before pushing
   - Keep files properly linted
   - Add tests for new features

4. **Dependencies**:
   - Review dependency PRs carefully
   - Test before merging updates
   - Monitor security audit results

## Customization

### Adding New Workflows
Create `.github/workflows/name.yml` files following the same pattern.

### Modifying Triggers
Edit `on:` section in workflow files:
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'
```

### Adjusting Node Version
Change `NODE_VERSION` environment variable in ci.yml

### Environment-Specific Configuration
Use GitHub Environments feature for production/staging configs

## Troubleshooting

### "Workflow not running on push"
- Check branch protection rules
- Verify workflow file syntax
- Confirm workflow is enabled in Actions tab

### "Secrets not available in workflow"
- Verify secret names match exactly (case-sensitive)
- Confirm secrets are set in repo settings
- Use `${{ secrets.SECRET_NAME }}` syntax

### "Tests timeout in CI"
- Increase timeout-minutes in job definition
- Optimize test performance
- Split tests into parallel jobs

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vercel GitHub Integration](https://vercel.com/docs/concepts/git)
- [Playwright CI Guide](https://playwright.dev/docs/ci)
- [Conventional Commits](https://www.conventionalcommits.org/)
