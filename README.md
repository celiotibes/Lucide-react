# 🚀 Lucide React - Legal Automation Platform

A modern, interactive, and ergonomic UI for legal case management, intimation processing, and LGPD compliance automation. Built with React 19, TypeScript, Tailwind CSS, and real-time WebSocket integration.

![CI Status](https://github.com/celiotibes/lucide-react/actions/workflows/ci.yml/badge.svg)
![Deploy Status](https://github.com/celiotibes/lucide-react/actions/workflows/deploy.yml/badge.svg)

## ✨ Features

### Core Functionality
- **📋 Case Management**: Track legal cases with progress, deadlines, and client details
- **📬 Intimation Processing**: Automated legal document processing with confidence scoring
- **✅ Compliance Monitoring**: LGPD compliance tracking with real-time metrics
- **🔐 JWT Authentication**: Secure authentication with token refresh and auto-refresh
- **🔔 Real-time Updates**: WebSocket integration for live data synchronization

### Design & UX
- **🎨 Glassmorphism UI**: Modern translucent card effects with backdrop blur
- **🌙 Dark Mode 2.0**: Premium dark theme with gradients and micro-interactions
- **📱 Mobile-First**: Bottom-centric navigation for ergonomic thumb navigation
- **♿ Accessible**: WCAG 2.1 compliant with keyboard navigation and screen readers
- **⚡ Responsive**: Bento grid layouts for optimal mobile, tablet, and desktop views

### Developer Experience
- **🧪 E2E Testing**: Playwright tests with 13+ test cases covering all screens
- **📚 Storybook**: Interactive component documentation with live prop editing
- **✅ CI/CD**: GitHub Actions automation for testing and deployment
- **🔧 Type-Safe**: Full TypeScript support with strict type checking
- **🎯 Mock Data**: Development-ready mock data system for offline testing

## 🚀 Quick Start

### Installation

```bash
# Clone repository
git clone https://github.com/celiotibes/lucide-react.git
cd lucide-react

# Run automated setup
chmod +x setup.sh
./setup.sh

# Or manual setup
npm install
cp .env.example .env.local
npm run format
npm run lint
```

### Development

```bash
# Start dev server with mock data
npm run dev

# Open http://localhost:5173 in your browser
```

**Mock data is enabled by default** in development. No backend required to get started.

### Testing

```bash
# Run E2E tests
npm run test:e2e

# Open Playwright UI
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug
```

### Component Documentation

```bash
# Launch Storybook at http://localhost:6006
npm run storybook

# Build static Storybook
npm run storybook:build
```

## 📁 Project Structure

```
src/
├── screens/            # Full-page screens (Dashboard, Cases, Intimations, Compliance)
├── components/         # Reusable UI components (Button, Card, Modal, etc)
├── stores/            # Zustand state management (auth, cases, intimations, compliance)
├── services/          # API client with Axios and WebSocket service
├── contexts/          # React contexts (Auth, Toast, WebSocket)
├── types/             # TypeScript interfaces and types
├── utils/             # Helper functions (formatting, validation, etc)
├── hooks/             # Custom React hooks (useAsync, etc)
├── mocks/             # Mock data for development
├── constants.ts       # App configuration and constants
└── App.tsx            # Root component with routing

e2e/                   # Playwright E2E tests
.storybook/            # Storybook configuration
.github/               # GitHub Actions workflows and templates
```

## 🏗️ Architecture

### State Management (Zustand)
- **authStore**: User authentication and session management
- **casesStore**: Case CRUD operations and filtering
- **intimationsStore**: Intimation processing and status tracking
- **complianceStore**: Compliance metrics and audit trails
- **websocketStore**: Real-time connection state

### API Integration (Axios)
- JWT token injection in request headers
- Automatic token refresh with request queueing
- Retry logic with exponential backoff (max 3 retries)
- Typed error handling with semantic error codes

### Real-time Updates (WebSocket)
- Socket.io for reliable WebSocket connections
- Auto-reconnection with exponential backoff
- Event subscriptions for intimations, cases, compliance
- Local store updates without full page refresh

### Routing (React Router v6)
- Protected routes with authentication checks
- Auto-redirect to login for unauthenticated access
- Persistent scroll position during navigation

## 🔐 Authentication Flow

```
User → Login Form → JWT Token → Token Storage (localStorage)
  ↓
  API Requests Include JWT in Authorization Header
  ↓
  Token Expires → Auto-refresh Flow → Get New Token
  ↓
  Request Queue Holds Pending Requests During Refresh
  ↓
  Resume Pending Requests with New Token
```

## 📊 Real-time Data Flow

```
Backend Event → WebSocket Event → WebSocketService.emit()
  ↓
  Zustand Store Update (updateCaseLocal, updateIntimation, etc)
  ↓
  React Component Re-render (useWebSocketStore, useIntimationsStore)
  ↓
  UI Reflects Latest Data Instantly
  ↓
  Toast Notification Shows Update
```

## 🛠️ Technology Stack

### Frontend
- **React 19.2** - UI library with server components
- **TypeScript 5.9** - Type-safe JavaScript
- **Tailwind CSS 4** - Utility-first styling
- **Zustand 5** - Lightweight state management
- **Axios 1.18** - HTTP client with interceptors
- **React Router 7** - Client-side routing
- **Socket.io-client 4** - Real-time WebSocket communication

### Development Tools
- **Vite 7** - Fast build tool and dev server
- **Playwright 1.61** - E2E testing framework
- **Storybook 10** - Component documentation
- **Prettier 3.9** - Code formatting
- **ESLint 9** - Code linting
- **TypeScript ESLint** - TS linting

### CI/CD
- **GitHub Actions** - Automated testing and deployment
- **Vercel** - Serverless deployment platform

## 📚 Documentation

- **[QUICK_START.md](./QUICK_START.md)** - 5-minute setup guide
- **[README_DESENVOLVIMENTO.md](./README_DESENVOLVIMENTO.md)** - Comprehensive development guide
- **[INTEGRATION_SETUP.md](./INTEGRATION_SETUP.md)** - Backend API integration
- **[.github/CONTRIBUTING.md](./.github/CONTRIBUTING.md)** - Contributing guidelines
- **[.github/CICD_SETUP.md](./.github/CICD_SETUP.md)** - CI/CD configuration
- **[.storybook/STORYBOOK_GUIDE.md](./.storybook/STORYBOOK_GUIDE.md)** - Component documentation

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Deploy to Vercel
npm install -g vercel
vercel deploy

# Or connect GitHub for auto-deploy on push
# https://vercel.com/dashboard
```

### GitHub Pages

```bash
npm run build
# Upload dist/ folder to GitHub Pages
```

### Docker

```bash
docker build -t lucide-react .
docker run -p 80:5173 lucide-react
```

## 📋 Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run format` | Format code with Prettier |
| `npm run lint` | Lint code with ESLint |
| `npm run test:e2e` | Run E2E tests |
| `npm run test:e2e:ui` | Run E2E tests in UI mode |
| `npm run test:e2e:debug` | Debug E2E tests |
| `npm run storybook` | Launch Storybook |
| `npm run storybook:build` | Build static Storybook |

## 🔄 Workflow

### Development
```bash
# 1. Create feature branch
git checkout -b feat/my-feature

# 2. Start dev server
npm run dev

# 3. Start Storybook for components
npm run storybook

# 4. Make changes and test
npm run test:e2e
npm run format
npm run lint

# 5. Commit with conventional messages
git commit -m "feat: add new feature"

# 6. Push and create PR
git push origin feat/my-feature
```

### Before Merging
- ✅ All CI checks pass (lint, type check, tests)
- ✅ Code review approved
- ✅ E2E tests pass
- ✅ Accessibility checks pass
- ✅ Storybook builds successfully

## 🐛 Troubleshooting

### Port 5173 already in use
```bash
npm run dev -- --port 3000
```

### Cannot find module errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### VITE_API_URL not defined
Edit `.env.local`:
```
VITE_API_URL=http://localhost:3000/api/v1
```

### WebSocket connection errors
Verify backend is running and socket.io is properly configured. Check browser console for error messages.

### Storybook won't start
```bash
rm -rf node_modules/.cache
npm run storybook
```

## 🤝 Contributing

See [CONTRIBUTING.md](./.github/CONTRIBUTING.md) for:
- Code style guidelines
- Commit message format
- Testing requirements
- Pull request process

## 📄 License

[Choose appropriate license]

## 📞 Support

- 📧 Email: support@example.com
- 💬 Discussions: GitHub Discussions
- 🐛 Issues: GitHub Issues

## 🙏 Acknowledgments

- Designed with 2024-2025 design trends in mind
- Optimized for legal and accounting professionals
- Community feedback welcome

---

**Built with ❤️ for legal professionals who deserve better tools**

For detailed setup and development instructions, see [README_DESENVOLVIMENTO.md](./README_DESENVOLVIMENTO.md)
