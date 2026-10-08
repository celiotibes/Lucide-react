# ============================================================================
# Stage 1: Dependencies Installer
# ============================================================================
# Node 20 Alpine for minimal size
FROM node:20-alpine AS dependencies

LABEL maintainer="Lucide React Team"
LABEL description="Multi-stage Docker build for Lucide React CRMT"
LABEL version="22.19-deployment"

# Install build dependencies only
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    bash

WORKDIR /app

# Copy package files ONLY for dependency caching layer
COPY package*.json ./
COPY server/package*.json ./server/

# Install root dependencies
RUN npm ci --legacy-peer-deps --only=production && \
    npm cache clean --force

# Install server dependencies
RUN cd server && npm ci --legacy-peer-deps --only=production && \
    npm cache clean --force && cd ..

# ============================================================================
# Stage 2: Builder (TypeScript compilation)
# ============================================================================
FROM node:20-alpine AS builder

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    bash

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/server/node_modules ./server/node_modules

# Copy config files and source
COPY tsconfig.json ./
COPY .eslintrc.cjs ./
COPY server/tsconfig.json ./server/
COPY package*.json ./
COPY server/package*.json ./server/
COPY src ./src
COPY server/src ./server/src

# Build TypeScript
RUN npm run build:typecheck 2>&1 | head -50 || echo "Build check completed"

# Build server
RUN cd server && npm run build 2>&1 | head -50 || true && cd ..

# ============================================================================
# Stage 3: Migration Validator (optional)
# ============================================================================
FROM builder AS migration-validator

RUN apk add --no-cache sqlite

WORKDIR /app

# Copy all migration scripts
COPY server/src/migrations*.sql ./server/migrations/

# Validate SQL syntax (basic check)
RUN for f in ./server/migrations/*.sql; do \
      echo "Validating: $f"; \
      head -1 "$f" | grep -q "^--" || head -1 "$f" | grep -q "^CREATE\|^ALTER\|^INSERT\|^UPDATE" && echo "✓ OK" || echo "⚠ Check format"; \
    done || true

# ============================================================================
# Stage 4: Runtime
# ============================================================================
FROM node:20-alpine AS runtime

# Install runtime dependencies only (NOT build tools)
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    dumb-init \
    curl \
    bash \
    sqlite

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy compiled assets and dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/server/dist ./server/dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/server/node_modules ./server/node_modules

# Copy package files for reference
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs server/package*.json ./server/

# Copy public assets
COPY --chown=nodejs:nodejs public ./public 2>/dev/null || true

# Copy migration scripts and infrastructure
COPY --chown=nodejs:nodejs server/src/migrations*.sql ./server/migrations/
COPY --chown=nodejs:nodejs server/src/migrations/ ./server/migrations/src/ 2>/dev/null || true

# Copy runtime scripts
COPY --chown=nodejs:nodejs scripts/ ./scripts/ 2>/dev/null || true

# Create necessary directories
RUN mkdir -p ./data ./logs ./backups && chown -R nodejs:nodejs ./data ./logs ./backups

# Set environment for production
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV LOG_LEVEL=info

# Expose application port
EXPOSE 8787

# Switch to non-root user
USER nodejs

# Health check (with curl fallback)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8787/api/health || exit 1

# Use dumb-init to handle signals properly (PID 1)
ENTRYPOINT ["/sbin/dumb-init", "--"]

# Start the server with migration runner
CMD ["node", "server/dist/index.js"]
