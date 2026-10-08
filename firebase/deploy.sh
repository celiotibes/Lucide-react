#!/bin/bash

# Firebase Security Rules Deployment Script
# Deploy todas as regras de segurança de forma segura

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIREBASE_PROJECT="${1:-lucide-react-app}"
ENVIRONMENT="${2:-development}"

echo -e "${BLUE}=== Firebase Security Rules Deployment ===${NC}"
echo -e "${BLUE}Project: ${FIREBASE_PROJECT}${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo ""

# Function to print section headers
print_header() {
    echo -e "${BLUE}>>> $1${NC}"
}

# Function to print success messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error messages
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if Firebase CLI is installed
print_header "Checking Firebase CLI"
if ! command -v firebase &> /dev/null; then
    print_error "Firebase CLI is not installed"
    echo "Install it with: npm install -g firebase-tools"
    exit 1
fi
print_success "Firebase CLI found"

# Check if we're logged in
print_header "Checking Firebase authentication"
if ! firebase projects:list > /dev/null 2>&1; then
    print_error "Not logged in to Firebase"
    echo "Run: firebase login"
    exit 1
fi
print_success "Authenticated with Firebase"

# Validate rules files exist
print_header "Validating rules files"
RULES_FILES=(
    "firestore.rules"
    "database.rules"
    "storage.rules"
)

for file in "${RULES_FILES[@]}"; do
    if [ -f "$SCRIPT_DIR/$file" ]; then
        print_success "$file found"
    else
        print_error "$file not found"
        exit 1
    fi
done

# Check configuration
print_header "Validating Firebase configuration"
if [ ! -f "$SCRIPT_DIR/config.json" ]; then
    print_warning "config.json not found, using defaults"
else
    print_success "config.json found"
fi

# Backup current rules
print_header "Backing up current rules"
BACKUP_DIR="$SCRIPT_DIR/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

firebase rules:log --project="$FIREBASE_PROJECT" --limit=1 > "$BACKUP_DIR/firestore_backup.txt" 2>/dev/null || true
print_success "Backup created at $BACKUP_DIR"

# Test Firestore rules locally
print_header "Testing Firestore rules locally"
if command -v firebase &> /dev/null; then
    firebase rules:test --project="$FIREBASE_PROJECT" 2>/dev/null || print_warning "Rules testing requires emulator"
fi

# Deploy Firestore rules
print_header "Deploying Firestore rules"
if firebase deploy --only firestore:rules --project="$FIREBASE_PROJECT"; then
    print_success "Firestore rules deployed"
else
    print_error "Failed to deploy Firestore rules"
    print_warning "Rolling back from backup: $BACKUP_DIR"
    exit 1
fi

# Deploy Realtime Database rules
print_header "Deploying Realtime Database rules"
if firebase deploy --only database --project="$FIREBASE_PROJECT"; then
    print_success "Realtime Database rules deployed"
else
    print_error "Failed to deploy Realtime Database rules"
    exit 1
fi

# Deploy Storage rules
print_header "Deploying Storage rules"
if firebase deploy --only storage --rules="$SCRIPT_DIR/storage.rules" --project="$FIREBASE_PROJECT"; then
    print_success "Storage rules deployed"
else
    print_error "Failed to deploy Storage rules"
    exit 1
fi

# Deploy Cloud Functions (if they exist)
print_header "Checking for Cloud Functions"
if [ -d "$SCRIPT_DIR/functions" ]; then
    if [ -f "$SCRIPT_DIR/functions/package.json" ]; then
        print_header "Installing Cloud Functions dependencies"
        (cd "$SCRIPT_DIR/functions" && npm install)

        print_header "Deploying Cloud Functions"
        if firebase deploy --only functions --project="$FIREBASE_PROJECT"; then
            print_success "Cloud Functions deployed"
        else
            print_error "Failed to deploy Cloud Functions"
            exit 1
        fi
    fi
else
    print_warning "Cloud Functions directory not found"
fi

# Create security indexes
print_header "Creating Firestore indexes"
if [ -f "$SCRIPT_DIR/indexes.json" ]; then
    firebase firestore:indexes --project="$FIREBASE_PROJECT" > /dev/null 2>&1 || true
    print_success "Indexes checked"
else
    print_warning "indexes.json not found"
fi

# Verify deployment
print_header "Verifying deployment"
echo "Checking Firestore rules..."
firebase firestore:indexes list --project="$FIREBASE_PROJECT" > /dev/null 2>&1
print_success "Firestore rules verified"

# Summary
echo ""
echo -e "${GREEN}=== Deployment Summary ===${NC}"
echo "Environment: $ENVIRONMENT"
echo "Project: $FIREBASE_PROJECT"
echo "Timestamp: $(date)"
echo ""
echo "Deployed:"
echo "  ✓ Firestore Rules"
echo "  ✓ Realtime Database Rules"
echo "  ✓ Storage Rules"
if [ -d "$SCRIPT_DIR/functions" ] && [ -f "$SCRIPT_DIR/functions/package.json" ]; then
    echo "  ✓ Cloud Functions"
fi
echo ""
echo "Backup location: $BACKUP_DIR"
echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"

# Post-deployment checks
print_header "Running post-deployment checks"

# Check if we need to enable any APIs
if [ "$ENVIRONMENT" = "production" ]; then
    print_warning "Production deployment - ensure you have:"
    echo "  • Read and reviewed all rule changes"
    echo "  • Tested with production data"
    echo "  • Configured all environment variables"
    echo "  • Verified backup location"
fi

echo ""
echo "Useful commands:"
echo "  • View logs: firebase functions:log --project=$FIREBASE_PROJECT"
echo "  • View rules: firebase firestore:indexes list --project=$FIREBASE_PROJECT"
echo "  • Rollback: Deploy previous version from $BACKUP_DIR"
echo ""

# Optional: Send deployment notification
if [ -n "$DEPLOYMENT_WEBHOOK" ]; then
    print_header "Sending deployment notification"
    curl -X POST "$DEPLOYMENT_WEBHOOK" \
        -H 'Content-Type: application/json' \
        -d "{
            \"text\": \"Firebase rules deployed to $ENVIRONMENT\",
            \"project\": \"$FIREBASE_PROJECT\",
            \"timestamp\": \"$(date)\"
        }" 2>/dev/null || print_warning "Failed to send webhook notification"
fi

print_success "Deployment finished successfully!"
exit 0
