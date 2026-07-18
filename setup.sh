#!/bin/bash

# ============================================================================
# SETUP SCRIPT - Lucide React Development Environment
# ============================================================================

set -e

echo "🚀 Setting up Lucide React Development Environment"
echo "=================================================="
echo ""

# Check Node.js version
echo "✓ Checking Node.js version..."
NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
echo "  Node.js: $NODE_VERSION"
echo "  npm: $NPM_VERSION"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

# Setup environment file
echo "⚙️  Setting up environment..."
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "✓ Created .env.local from .env.example"
  echo "  ⚠️  Edit .env.local and set VITE_API_URL if needed"
else
  echo "✓ .env.local already exists"
fi
echo ""

# Format code
echo "🎨 Formatting code..."
npm run format
echo "✓ Code formatted with Prettier"
echo ""

# Run linter
echo "🔍 Running linter..."
npm run lint || echo "⚠️  Linter warnings found (see above)"
echo ""

# Info
echo "=================================================="
echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "   1. Edit .env.local with your API URL"
echo "   2. Run: npm run dev"
echo "   3. Open http://localhost:5173"
echo ""
echo "📝 Mock data is enabled by default in development"
echo "   To disable: localStorage.setItem('ENABLE_MOCK_DATA', 'false')"
echo ""
echo "🧪 Run E2E tests:"
echo "   npm run test:e2e"
echo ""
echo "📚 Documentation:"
echo "   - README_DESENVOLVIMENTO.md - Complete guide"
echo "   - INTEGRATION_SETUP.md - Integration examples"
echo "=================================================="
