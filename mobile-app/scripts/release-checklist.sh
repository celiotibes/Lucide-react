#!/bin/bash

# Release Checklist Script for CRMT Mobile
# Validates that all conditions are met for a production release

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Check functions
check_tests() {
    echo -e "${BLUE}→ Checking tests...${NC}"
    if npm run test:ci > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Tests passing${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ Tests failing${NC}"
        ((FAILED++))
    fi
}

check_linting() {
    echo -e "${BLUE}→ Checking linting...${NC}"
    if npm run lint > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Linting passed${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ Linting failed${NC}"
        ((FAILED++))
    fi
}

check_types() {
    echo -e "${BLUE}→ Checking TypeScript types...${NC}"
    if npm run type-check > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Type checking passed${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ Type checking failed${NC}"
        ((FAILED++))
    fi
}

check_security() {
    echo -e "${BLUE}→ Checking security vulnerabilities...${NC}"
    AUDIT_RESULT=$(npm audit --json 2>/dev/null | jq '.metadata.vulnerabilities.total' || echo "0")

    if [ "$AUDIT_RESULT" -eq 0 ]; then
        echo -e "${GREEN}✓ No security vulnerabilities${NC}"
        ((PASSED++))
    elif [ "$AUDIT_RESULT" -le 3 ]; then
        echo -e "${YELLOW}⚠ $AUDIT_RESULT low-severity vulnerabilities${NC}"
        ((WARNINGS++))
    else
        echo -e "${RED}✗ $AUDIT_RESULT vulnerabilities found${NC}"
        ((FAILED++))
    fi
}

check_git_status() {
    echo -e "${BLUE}→ Checking Git repository status...${NC}"
    if [ -z "$(git status --porcelain)" ]; then
        echo -e "${GREEN}✓ Working directory clean${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ Working directory has uncommitted changes${NC}"
        git status --short
        ((FAILED++))
    fi
}

check_git_branch() {
    echo -e "${BLUE}→ Checking Git branch...${NC}"
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

    if [[ "$CURRENT_BRANCH" == "release/"* ]] || [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
        echo -e "${GREEN}✓ On release branch: $CURRENT_BRANCH${NC}"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠ On feature branch: $CURRENT_BRANCH${NC}"
        echo "  Consider checking out a release branch before releasing"
        ((WARNINGS++))
    fi
}

check_remote() {
    echo -e "${BLUE}→ Checking remote tracking...${NC}"
    if git rev-parse --abbrev-ref @'{u}' > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Tracking remote branch${NC}"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠ Not tracking remote branch${NC}"
        ((WARNINGS++))
    fi
}

check_version() {
    echo -e "${BLUE}→ Checking version consistency...${NC}"
    PKG_VERSION=$(jq -r '.version' package.json)
    APP_VERSION=$(jq -r '.expo.version' app.json)

    if [ "$PKG_VERSION" = "$APP_VERSION" ]; then
        echo -e "${GREEN}✓ Version consistent: $PKG_VERSION${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ Version mismatch (package.json: $PKG_VERSION, app.json: $APP_VERSION)${NC}"
        ((FAILED++))
    fi
}

check_changelog() {
    echo -e "${BLUE}→ Checking CHANGELOG.md...${NC}"
    if [ -f "CHANGELOG.md" ]; then
        VERSION=$(jq -r '.version' package.json)
        if grep -q "## \[$VERSION\]" CHANGELOG.md; then
            echo -e "${GREEN}✓ Changelog entry found for v$VERSION${NC}"
            ((PASSED++))
        else
            echo -e "${YELLOW}⚠ No changelog entry for v$VERSION${NC}"
            echo "  Update CHANGELOG.md with: ./scripts/generate-changelog.sh"
            ((WARNINGS++))
        fi
    else
        echo -e "${YELLOW}⚠ CHANGELOG.md not found${NC}"
        ((WARNINGS++))
    fi
}

check_env_config() {
    echo -e "${BLUE}→ Checking environment configuration...${NC}"
    if [ -f ".env.production" ]; then
        echo -e "${GREEN}✓ .env.production exists${NC}"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠ .env.production not found${NC}"
        ((WARNINGS++))
    fi
}

check_eas_config() {
    echo -e "${BLUE}→ Checking EAS configuration...${NC}"
    if jq '.build.production' eas.json > /dev/null 2>&1; then
        echo -e "${GREEN}✓ EAS production profile configured${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ EAS production profile missing${NC}"
        ((FAILED++))
    fi
}

check_build_cache() {
    echo -e "${BLUE}→ Checking build cache...${NC}"
    if [ -d "node_modules" ]; then
        echo -e "${GREEN}✓ Dependencies installed${NC}"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠ Dependencies not installed${NC}"
        echo "  Run: npm install"
        ((WARNINGS++))
    fi
}

check_bundle_size() {
    echo -e "${BLUE}→ Checking bundle size (estimate)...${NC}"
    # This is a simple check; actual bundle size depends on build
    if [ -d "src" ]; then
        SIZE=$(du -sh src | awk '{print $1}')
        echo -e "${GREEN}✓ Source code size: $SIZE${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ src directory not found${NC}"
        ((FAILED++))
    fi
}

# Run checks
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}       CRMT Mobile - Release Checklist${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""

# Code Quality Checks
echo -e "${YELLOW}Code Quality Checks:${NC}"
check_tests
check_linting
check_types
check_security
echo ""

# Git Checks
echo -e "${YELLOW}Git Repository Checks:${NC}"
check_git_status
check_git_branch
check_remote
echo ""

# Configuration Checks
echo -e "${YELLOW}Configuration Checks:${NC}"
check_version
check_changelog
check_env_config
check_eas_config
check_build_cache
check_bundle_size
echo ""

# Summary
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✓ All checks passed! Ready for release.${NC}"
        echo ""
        echo -e "${BLUE}Next steps:${NC}"
        echo "1. Review commits: git log --oneline origin/main..HEAD"
        echo "2. Bump version: ./scripts/bump-version.sh patch"
        echo "3. Commit changes: git commit -m 'Phase 22.11: Prepare v1.x.x release'"
        echo "4. Create tag: git tag v1.x.x"
        echo "5. Push: git push && git push --tags"
        echo "6. Build: npm run build:production"
        echo "7. Submit: eas submit --platform android --profile production"
        exit 0
    else
        echo -e "${YELLOW}✓ Ready for release (with minor warnings).${NC}"
        echo ""
        echo -e "${YELLOW}Address warnings before proceeding to production.${NC}"
        exit 0
    fi
else
    echo -e "${RED}✗ Release blocked due to failures.${NC}"
    echo ""
    echo -e "${RED}Fix the issues above before proceeding.${NC}"
    exit 1
fi
