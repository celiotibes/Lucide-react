#!/bin/bash

# Version Bumping Script for CRMT Mobile
# Usage: ./scripts/bump-version.sh [major|minor|patch]
# Example: ./scripts/bump-version.sh patch

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
if [ -z "$1" ]; then
    echo -e "${RED}Error: Version type not specified${NC}"
    echo "Usage: $0 [major|minor|patch]"
    echo "Example: $0 patch"
    exit 1
fi

VERSION_TYPE="$1"

# Validate version type
if [[ ! "$VERSION_TYPE" =~ ^(major|minor|patch)$ ]]; then
    echo -e "${RED}Error: Invalid version type '$VERSION_TYPE'${NC}"
    echo "Valid options: major, minor, patch"
    exit 1
fi

# Check if running from mobile-app directory
if [ ! -f "package.json" ] || [ ! -f "app.json" ]; then
    echo -e "${RED}Error: package.json and app.json not found${NC}"
    echo "Please run this script from the mobile-app directory"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(jq -r '.version' package.json)
echo -e "${BLUE}Current version: ${YELLOW}$CURRENT_VERSION${NC}"

# Parse version components
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR="${VERSION_PARTS[0]}"
MINOR="${VERSION_PARTS[1]:-0}"
PATCH="${VERSION_PARTS[2]:-0}"

# Bump version based on type
case "$VERSION_TYPE" in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
NEW_BUILD_NUMBER=$(($(date +%s) / 3600 % 1000000))

echo -e "${GREEN}New version: ${YELLOW}$NEW_VERSION${NC}"
echo -e "${GREEN}Build number: ${YELLOW}$NEW_BUILD_NUMBER${NC}"

# Update package.json
echo -e "${BLUE}Updating package.json...${NC}"
jq ".version = \"$NEW_VERSION\"" package.json > package.json.tmp
mv package.json.tmp package.json

# Update app.json
echo -e "${BLUE}Updating app.json...${NC}"
jq ".expo.version = \"$NEW_VERSION\"" app.json > app.json.tmp
jq ".expo.android.versionName = \"$NEW_VERSION\"" app.json.tmp > app.json.tmp2
jq ".expo.android.versionCode = $NEW_BUILD_NUMBER" app.json.tmp2 > app.json
rm -f app.json.tmp app.json.tmp2

# Update .env.production if it exists
if [ -f ".env.production" ]; then
    echo -e "${BLUE}Updating .env.production...${NC}"
    sed -i "s/APP_VERSION=.*/APP_VERSION=$NEW_VERSION/" .env.production
    sed -i "s/BUILD_NUMBER=.*/BUILD_NUMBER=$NEW_BUILD_NUMBER/" .env.production
fi

# Verify changes
echo -e "${BLUE}Verifying version updates...${NC}"
UPDATED_VERSION=$(jq -r '.version' package.json)
UPDATED_APP_VERSION=$(jq -r '.expo.version' app.json)

if [ "$UPDATED_VERSION" = "$NEW_VERSION" ] && [ "$UPDATED_APP_VERSION" = "$NEW_VERSION" ]; then
    echo -e "${GREEN}✓ Version successfully bumped to $NEW_VERSION${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Review changes: git diff"
    echo "2. Commit changes: git add package.json app.json .env.production"
    echo "3. Create commit: git commit -m 'Phase 22.11: Bump version to $NEW_VERSION'"
    echo "4. Create tag: git tag -a v$NEW_VERSION -m 'Release version $NEW_VERSION'"
    echo "5. Build: npm run build:production"
    echo "6. Submit: eas submit --platform android --profile production"
else
    echo -e "${RED}Error: Version update verification failed${NC}"
    exit 1
fi
