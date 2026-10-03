# ============================================================================
# Stage 1: Builder
# ============================================================================
# Node 20 Alpine for minimal size and fast compilation
FROM node:20-alpine AS builder

LABEL maintainer="Lucide React Team"
LABEL description="Multi-stage Docker build for Lucide React accounting system"

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Set working directory
WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./
COPY .eslintrc.cjs ./

# Copy server package files
COPY server/package*.json ./server/
COPY server/tsconfig.json ./server/

# Install dependencies for both root and server
RUN npm ci --legacy-peer-deps
RUN cd server && npm ci --legacy-peer-deps && cd ..

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build:typecheck

# Build server (if separate build needed)
RUN cd server && npm run build 2>/dev/null || true && cd ..

# ============================================================================
# Stage 2: Runtime
# ============================================================================
FROM node:20-alpine

# Install runtime dependencies only
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy compiled application from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/server/dist ./server/dist
COPY --from=builder --chown=nodejs:nodejs /app/server/node_modules ./server/node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/server/package*.json ./server/

# Copy public assets if they exist
COPY --chown=nodejs:nodejs public ./public 2>/dev/null || true

# Copy migration scripts
COPY --chown=nodejs:nodejs server/src/*.sql ./server/src/ 2>/dev/null || true

# Set environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Expose application port
EXPOSE 8787

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8787/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/sbin/dumb-init", "--"]

# Start the server
CMD ["node", "server/dist/index.js"]
