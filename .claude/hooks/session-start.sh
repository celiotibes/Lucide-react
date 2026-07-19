#!/bin/bash

# Claude Code Session Start Hook
# Lucide-react: Legal, Accounting & Academic Research Platform
# This hook runs when starting a new Claude Code session

set -e

echo "🚀 Initializing Lucide-react Development Session..."
echo "=================================================="

# Check Node.js and npm
echo "✓ Checking dependencies..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install npm first."
    exit 1
fi

echo "✓ Node.js $(node --version)"
echo "✓ npm $(npm --version)"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies..."
    npm install
fi

# Check TypeScript
if ! command -v tsc &> /dev/null; then
    echo "⚠️  TypeScript not found locally. Installing..."
    npm install -D typescript
fi

echo ""
echo "✅ Session initialization complete!"
echo ""
echo "Available commands:"
echo "  npm run dev     - Start development server (http://localhost:5173)"
echo "  npm run build   - Build project with type checking"
echo "  npm run lint    - Run ESLint validation"
echo "  npm run preview - Preview production build"
echo ""
echo "Claude Code skills available:"
echo "  /legal-research       - Legal document search and analysis"
echo "  /accounting-analysis  - Tax and audit analysis"
echo "  /academic-search      - Academic article search"
echo "  /code-review          - Code review and feedback"
echo "  /verify               - Verify code changes"
echo ""
echo "Start development:"
echo "  npm run dev"
echo "=================================================="
