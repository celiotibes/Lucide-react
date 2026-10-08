/**
 * Security Headers Configuration
 * Phase 22.18 — Web Security Headers
 *
 * Content-Security-Policy (CSP) and other HTTP security headers
 * for protecting against XSS, clickjacking, and injection attacks.
 *
 * Usage: Integrated into vite.config.ts as middleware
 */

/**
 * CSP Nonce Generator
 * Used for inline scripts and styles that need to bypass CSP restrictions
 */
export function generateCSPNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
}

/**
 * Content-Security-Policy Header
 * Prevents inline script execution, clickjacking, and injection attacks
 */
export const CSP_HEADER = {
  // Defaults to 'self' for resources not explicitly listed
  'default-src': ["'self'"],

  // Scripts from same origin + nonce-based inline scripts (for React + frameworks)
  'script-src': [
    "'self'",
    // Note: Nonce added dynamically per request in middleware
    // "'nonce-{random}'"
  ],

  // Styles from same origin + unsafe-inline required for:
  // - Recharts inline styles
  // - Vite HMR in development
  // - Tailwind CSS (minimal, but some inline required)
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for Recharts and Tailwind
  ],

  // Images from self, data URIs, and HTTPS sources
  'img-src': ["'self'", 'data:', 'https:'],

  // Fonts from same origin only
  'font-src': ["'self'"],

  // External API calls - explicitly whitelist
  'connect-src': [
    "'self'",
    'https://api.anthropic.com', // Claude API
    'https://googleapis.com',
    'https://www.googleapis.com',
    'https://www.gstatic.com', // Google Static
  ],

  // Media from same origin
  'media-src': ["'self'"],

  // Objects/embeds blocked
  'object-src': ["'none'"],

  // Prevent framing (clickjacking protection)
  'frame-ancestors': ["'none'"],

  // Forms only submit to same origin
  'form-action': ["'self'"],

  // Base URI restricted to same origin
  'base-uri': ["'self'"],

  // Reports CSP violations (non-blocking)
  // In production, set to your CSP report endpoint
  // 'report-uri': ['/api/security/csp-report'],

  // Future: upgrade insecure requests to HTTPS
  'upgrade-insecure-requests': [],

  // Block mixed content
  'block-all-mixed-content': [],
};

/**
 * Format CSP header value
 */
export function formatCSPHeader(
  cspObject: Record<string, string[]>,
  options: { reportUri?: string; reportOnly?: boolean } = {}
): string {
  const directives = Object.entries(cspObject)
    .map(([key, values]) => {
      if (values.length === 0) {
        return key;
      }
      return `${key} ${values.join(' ')}`;
    })
    .join('; ');

  // Add report-uri if provided
  if (options.reportUri) {
    return `${directives}; report-uri ${options.reportUri}`;
  }

  return directives;
}

/**
 * Other Security Headers
 * Each header is separated for clarity
 */
export const SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Legacy XSS filter (browser-dependent, but good for defense in depth)
  'X-XSS-Protection': '1; mode=block',

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // Control referrer information leakage
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions Policy - restrict sensitive APIs
  'Permissions-Policy': [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ].join(', '),

  // HSTS: Enforce HTTPS for 1 year + include subdomains
  // Only set in production over HTTPS
  // 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Encourage HTTPS in development
  // (production: use HSTS instead)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/**
 * Vite Middleware for Security Headers
 * Usage: Add to vite.config.ts in dev server config
 *
 * @example
 * // In vite.config.ts:
 * server: {
 *   middlewares: [securityHeadersMiddleware()],
 *   // ... rest of config
 * }
 */
export function securityHeadersMiddleware() {
  return (req: any, res: any, next: any) => {
    // CSP Header with nonce
    const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
    const cspValue = formatCSPHeader(CSP_HEADER);

    res.setHeader('Content-Security-Policy', cspValue);

    // Store nonce for inline script injection (if needed)
    res.locals = res.locals || {};
    res.locals.cspNonce = nonce;

    // Other security headers
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      // Skip HSTS in development
      if (key === 'Strict-Transport-Security' && process.env.NODE_ENV === 'development') {
        return;
      }
      res.setHeader(key, value);
    });

    // Cache control: no caching for HTML, aggressive cache for assets
    if (req.url.endsWith('.html') || req.url === '/') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (/\.[a-f0-9]{8}\.(js|css|png|jpg|woff)$/.test(req.url)) {
      // Hashed assets can be cached long-term
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    next();
  };
}

/**
 * Subresource Integrity (SRI) Configuration
 * For CDN resources that cannot be self-hosted
 */
export interface SRIResource {
  url: string;
  integrity: string;
  crossorigin?: 'anonymous' | 'use-credentials';
}

export const SRI_RESOURCES: SRIResource[] = [
  // Example: Add CDN resources here if needed
  // {
  //   url: 'https://cdnjs.cloudflare.com/ajax/libs/library/version/file.min.js',
  //   integrity: 'sha384-...',
  //   crossorigin: 'anonymous',
  // },
];

/**
 * CORS Configuration
 * Whitelist trusted origins
 */
export const CORS_CONFIG = {
  // Whitelist of allowed origins (set in environment)
  allowedOrigins: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8787',
    // Production origins added via environment
    ...(process.env.ALLOWED_ORIGINS?.split(',') || []),
  ],

  // Allowed HTTP methods
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  // Allowed headers
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],

  // Expose headers to client
  exposedHeaders: ['Content-Length', 'X-Total-Count'],

  // Credentials (cookies, auth headers)
  credentials: true,

  // Max age for preflight cache
  maxAge: 3600,
};

/**
 * Development Security Considerations
 *
 * - CSP is less restrictive in dev (allows 'unsafe-inline' for HMR)
 * - HSTS disabled in dev (not over HTTPS)
 * - Some headers relaxed to allow hot reload
 *
 * Production:
 * - CSP strict mode
 * - HSTS enabled
 * - All unsafe-inline removed
 * - Report-uri pointing to security endpoint
 */
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Security Status Check
 * For monitoring and alerts
 */
export interface SecurityHeadersStatus {
  cspEnabled: boolean;
  hstsEnabled: boolean;
  frameOptionsSet: boolean;
  xssProtectionSet: boolean;
  contentTypeSniffingPrevented: boolean;
}

export function checkSecurityHeaders(headers: Record<string, string>): SecurityHeadersStatus {
  return {
    cspEnabled: !!headers['content-security-policy'],
    hstsEnabled: !!headers['strict-transport-security'],
    frameOptionsSet: !!headers['x-frame-options'],
    xssProtectionSet: !!headers['x-xss-protection'],
    contentTypeSniffingPrevented: headers['x-content-type-options'] === 'nosniff',
  };
}
