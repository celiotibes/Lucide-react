/**
 * HTTP Cache Headers Middleware
 * Phase 22.17 — Performance & Optimization
 *
 * Sets appropriate Cache-Control headers based on response type:
 * - Static assets (versioned): Immutable, 1 year TTL
 * - HTML (index): Short TTL for app shell updates
 * - API responses: Private, moderate TTL for dynamic data
 * - Tesseract/external: Long TTL with validation
 */

import type { Request, Response, NextFunction } from 'express';

interface CacheRule {
  pattern: RegExp;
  cacheControl: string;
  description: string;
}

const CACHE_RULES: CacheRule[] = [
  // Static assets with hash — Vite bundles these with hash in filename
  // Safe to cache for 1 year (expires by filename change)
  {
    pattern: /\.(js|css|png|svg|woff2|woff|ttf|eot)$/i,
    cacheControl: 'public, max-age=31536000, immutable',
    description: 'Static versioned assets (hash in filename)',
  },

  // HTML files (app shell) — short TTL to check for updates
  {
    pattern: /\.html$/i,
    cacheControl: 'public, max-age=3600', // 1 hour
    description: 'HTML files (app shell)',
  },

  // API responses — private, short TTL
  {
    pattern: /^\/api\//,
    cacheControl: 'private, max-age=300', // 5 minutes
    description: 'API responses',
  },

  // Service Worker — must revalidate frequently
  {
    pattern: /^\/service-worker\.js$/,
    cacheControl: 'public, max-age=0, must-revalidate',
    description: 'Service Worker',
  },

  // Web App Manifest
  {
    pattern: /manifest\.json$/,
    cacheControl: 'public, max-age=3600',
    description: 'Web App Manifest',
  },

  // Tesseract OCR data — rarely changes, safe for long cache
  {
    pattern: /tesseract/,
    cacheControl: 'public, max-age=2592000', // 30 days
    description: 'Tesseract OCR library',
  },

  // Favicon — rarely changes
  {
    pattern: /favicon/,
    cacheControl: 'public, max-age=604800', // 1 week
    description: 'Favicon',
  },
];

/**
 * Main cache headers middleware
 */
export function cacheHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;

  // Find matching cache rule
  const rule = CACHE_RULES.find(rule => rule.pattern.test(path));

  if (rule) {
    res.set('Cache-Control', rule.cacheControl);

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[Cache] ${path} → ${rule.description}`);
    }
  }

  // Always add Vary header to indicate what affects caching
  res.vary('Accept-Encoding');

  next();
}

/**
 * ETag support for conditional requests
 * Allows clients to validate cached responses without downloading full body
 */
export function etagMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json;

  res.json = function(data: any) {
    // Generate simple ETag from JSON stringify hash
    // In production, consider using crypto.createHash('sha256')
    const hash = JSON.stringify(data).length;
    res.set('ETag', `"${hash}"`);

    return originalJson.call(this, data);
  };

  next();
}

/**
 * Validate cache for API responses
 * Implements stale-while-revalidate pattern for better UX
 */
export function cacheValidationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only apply to GET requests
  if (req.method !== 'GET') {
    return next();
  }

  // Add cache validation hints for browsers
  // "stale-while-revalidate" allows serving stale content while checking for updates
  res.set('Cache-Control', (prev = '') => {
    if (prev.includes('private')) {
      // API responses can use stale-while-revalidate
      return `${prev}, stale-while-revalidate=86400`; // 24 hours stale tolerance
    }
    return prev;
  });

  next();
}

/**
 * Security headers that don't affect caching but improve overall security
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.set('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.set('X-Frame-Options', 'DENY');

  // Prevent XSS (older browsers)
  res.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
}

/**
 * Compression middleware support — signals to client if response is compressed
 */
export function compressionHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Express compression middleware sets Content-Encoding automatically
  // But we ensure Vary header includes it
  if (res.get('Content-Encoding')) {
    res.vary('Accept-Encoding');
  }

  next();
}

/**
 * Combined export for easy app setup
 */
export function setupCacheHeaders(app: any): void {
  // Order matters: cache validation first, then headers, then etag
  app.use(cacheValidationMiddleware);
  app.use(cacheHeadersMiddleware);
  app.use(etagMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(compressionHeadersMiddleware);
}

/**
 * Invalidate cache for specific routes (called after successful write operations)
 * Example: After successful POST /transactions, clear the transactions cache
 */
export function invalidateClientCache(res: Response, cacheKeys: string[]): void {
  // Signal to client that specific cache entries are now stale
  // Client (via service worker) can clear these from cache
  res.set('Cache-Clear', cacheKeys.join(', '));
}
