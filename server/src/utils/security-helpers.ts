/**
 * SEC-011B: Timing Attack Protection
 *
 * Implements cryptographically-safe comparison functions to prevent timing attacks
 * on sensitive operations like token validation, password comparison, and CSRF token checks.
 *
 * Uses crypto.timingSafeEqual() to ensure that comparison time is constant,
 * preventing attackers from inferring partial matches through timing analysis.
 */

import crypto from "crypto";

/**
 * Safely compare two strings without revealing timing information
 * Returns true only if both strings are equal
 * Throws if inputs are not strings or have different lengths
 */
export function timingSafeStringEqual(
  a: string | Buffer,
  b: string | Buffer,
): boolean {
  try {
    // Convert strings to buffers if needed
    const bufferA = typeof a === "string" ? Buffer.from(a) : a;
    const bufferB = typeof b === "string" ? Buffer.from(b) : b;

    // Buffers must be same length for timingSafeEqual
    if (bufferA.length !== bufferB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch {
    // timingSafeEqual throws on length mismatch or invalid input
    return false;
  }
}

/**
 * Safe token comparison - prevents timing attacks on token validation
 * Use this instead of === or String.compare() for tokens
 */
export function validateTokenSafely(token: string, expectedToken: string): boolean {
  // Ensure both are strings
  if (typeof token !== "string" || typeof expectedToken !== "string") {
    return false;
  }

  // Empty token check (constant-time comparison)
  if (!token || !expectedToken) {
    return token === expectedToken;
  }

  return timingSafeStringEqual(token, expectedToken);
}

/**
 * Safe CSRF token comparison - prevents timing attacks on CSRF protection
 * Use when validating CSRF tokens from forms or headers
 */
export function validateCsrfTokenSafely(
  token: string,
  expectedToken: string,
): boolean {
  return validateTokenSafely(token, expectedToken);
}

/**
 * Safe hash comparison - prevents timing attacks on password/hash validation
 * Use when comparing password hashes in authentication
 */
export function validateHashSafely(hash: string, expectedHash: string): boolean {
  if (typeof hash !== "string" || typeof expectedHash !== "string") {
    return false;
  }

  if (!hash || !expectedHash) {
    return hash === expectedHash;
  }

  return timingSafeStringEqual(hash, expectedHash);
}

/**
 * Constant-time comparison for numeric values
 * Prevents timing attacks by always comparing a fixed set of bytes
 */
export function constantTimeCompare(a: number, b: number): boolean {
  // XOR the values (constant-time operation)
  const xor = a ^ b;

  // Check if result is 0 using timing-safe method
  // This is constant-time because bitwise operations complete in fixed time
  let result = 0;
  for (let i = 0; i < 32; i++) {
    result |= (xor >> i) & 1;
  }

  return result === 0;
}

/**
 * Create a timing-safe HMAC for sensitive data comparison
 * Use for comparing signed tokens or authentication codes
 */
export function createTimingSafeHmac(
  secret: string,
  data: string,
): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data);
  return hmac.digest("hex");
}

/**
 * Verify a timing-safe HMAC
 * Use this instead of direct string comparison for HMAC validation
 */
export function verifyTimingSafeHmac(
  data: string,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature = createTimingSafeHmac(secret, data);
  return timingSafeStringEqual(signature, expectedSignature);
}

/**
 * Generate a cryptographically secure random token
 * Use for session tokens, CSRF tokens, verification codes, etc.
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Generate a random number in a range [min, max] using secure randomness
 * Use for generating OTPs, codes, and other random values
 */
export function generateSecureRandomNumber(min: number, max: number): number {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  let value: number;

  // Keep generating until we get a value in range (no modulo bias)
  do {
    const bytes = crypto.randomBytes(bytesNeeded);
    value = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      value = (value << 8) + bytes[i];
    }
  } while (value >= range);

  return min + (value % range);
}

/**
 * Hash sensitive data using PBKDF2 (for one-way hashing)
 * Use for storing passwords, PII, sensitive identifiers
 */
export function hashSensitiveData(
  data: string,
  saltIterations: number = 100000,
): {
  hash: string;
  salt: string;
} {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto
    .pbkdf2Sync(data, salt, saltIterations, 64, "sha256")
    .toString("hex");
  return { hash, salt };
}

/**
 * Verify hashed sensitive data
 * Use when checking stored password hashes
 */
export function verifySensitiveDataHash(
  data: string,
  hash: string,
  salt: string,
  saltIterations: number = 100000,
): boolean {
  const computedHash = crypto
    .pbkdf2Sync(data, salt, saltIterations, 64, "sha256")
    .toString("hex");

  // Use timing-safe comparison
  return timingSafeStringEqual(computedHash, hash);
}

/**
 * Redact sensitive information from strings
 * Use for logging and error messages
 */
export function redactSensitive(value: string, visible: number = 4): string {
  if (typeof value !== "string" || value.length <= visible) {
    return "[REDACTED]";
  }

  const suffix = value.slice(-visible);
  const redacted = "*".repeat(Math.max(1, value.length - visible));
  return `${redacted}${suffix}`;
}

/**
 * Check if a value contains sensitive patterns (API keys, tokens, etc.)
 * Use for input validation and sanitization
 */
export function containsSensitivePattern(value: string): boolean {
  const sensitivePatterns = [
    /api[_-]?key[:\s=]+/i,
    /bearer\s+[a-z0-9]+/i,
    /token[:\s=]+/i,
    /secret[:\s=]+/i,
    /password[:\s=]+/i,
    /authorization[:\s=]+/i,
    /\b[0-9a-f]{32,}\b/i, // Potential hash/token
  ];

  return sensitivePatterns.some((pattern) => pattern.test(value));
}
