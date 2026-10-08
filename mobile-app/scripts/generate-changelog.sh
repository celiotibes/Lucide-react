#!/bin/bash

# Changelog Generation Script for CRMT Mobile
# Usage: ./scripts/generate-changelog.sh [version]
# Example: ./scripts/generate-changelog.sh v1.0.0

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get version
if [ -z "$1" ]; then
    # Get from package.json
    VERSION=$(jq -r '.version' package.json)
    TAG="v$VERSION"
else
    TAG="$1"
    VERSION="${TAG#v}"
fi

echo -e "${BLUE}Generating changelog for $TAG...${NC}"

# Check if git repository
if [ ! -d ".git" ]; then
    echo -e "${RED}Error: Not a git repository${NC}"
    exit 1
fi

# Get previous tag
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -z "$PREV_TAG" ]; then
    echo -e "${YELLOW}No previous tags found. Using all commits.${NC}"
    COMMITS=$(git log --pretty=format:"%h %s" --grep="feat\|fix\|perf\|docs\|style\|refactor" -i)
else
    echo -e "${BLUE}Previous tag: $PREV_TAG${NC}"
    COMMITS=$(git log $PREV_TAG..HEAD --pretty=format:"%h %s" --grep="feat\|fix\|perf\|docs\|style\|refactor" -i)
fi

# Create changelog entry
CHANGELOG_ENTRY=$(cat <<EOF
## [$VERSION] - $(date +%Y-%m-%d)

### Added
EOF
)

# Extract features
FEATURES=$(echo "$COMMITS" | grep -i "^[a-f0-9]* feat" | sed 's/^[a-f0-9]* feat: /- /' || true)
if [ ! -z "$FEATURES" ]; then
    CHANGELOG_ENTRY="$CHANGELOG_ENTRY
$FEATURES"
fi

CHANGELOG_ENTRY="$CHANGELOG_ENTRY

### Changed
"

# Extract changes
CHANGES=$(echo "$COMMITS" | grep -i "^[a-f0-9]* \(refactor\|perf\)" | sed 's/^[a-f0-9]* [^ ]*: /- /' || true)
if [ ! -z "$CHANGES" ]; then
    CHANGELOG_ENTRY="$CHANGELOG_ENTRY
$CHANGES"
fi

CHANGELOG_ENTRY="$CHANGELOG_ENTRY

### Fixed
"

# Extract fixes
FIXES=$(echo "$COMMITS" | grep -i "^[a-f0-9]* fix" | sed 's/^[a-f0-9]* fix: /- /' || true)
if [ ! -z "$FIXES" ]; then
    CHANGELOG_ENTRY="$CHANGELOG_ENTRY
$FIXES"
fi

# Check if CHANGELOG.md exists
if [ ! -f "CHANGELOG.md" ]; then
    echo -e "${BLUE}Creating CHANGELOG.md...${NC}"
    cat > CHANGELOG.md <<EOF
# Changelog

All notable changes to CRMT Mobile are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

$CHANGELOG_ENTRY

## [0.1.0] - 2024-01-01

### Added
- Initial release of CRMT Mobile
- Document upload and management
- Offline sync capabilities
- Multi-language support (Portuguese and English)
EOF
else
    echo -e "${BLUE}Updating CHANGELOG.md...${NC}"
    # Insert new entry after the header
    sed -i "/^# Changelog/a\\
\\
$CHANGELOG_ENTRY" CHANGELOG.md
fi

echo -e "${GREEN}✓ Changelog generated${NC}"
echo ""
echo -e "${BLUE}Changelog preview:${NC}"
head -30 CHANGELOG.md
echo ""
echo -e "${YELLOW}Please review and edit CHANGELOG.md as needed${NC}"
echo ""
echo -e "${BLUE}Commit changelog:${NC}"
echo "git add CHANGELOG.md"
echo "git commit -m 'Phase 22.11: Update changelog for $TAG'"
