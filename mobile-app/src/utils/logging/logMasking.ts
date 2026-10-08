/**
 * Log Masking & Sanitization Utility
 *
 * Masks sensitive data patterns to prevent exposure of:
 * - Authentication tokens (Bearer, JWT, API keys)
 * - Passwords and API secrets
 * - Credit card numbers
 * - Social Security Numbers (SSN)
 * - Email addresses
 * - Phone numbers
 * - Personal identifiable information (PII)
 * - URLs with sensitive query parameters
 */

export interface MaskingConfig {
  maskTokens: boolean;
  maskPasswords: boolean;
  maskEmails: boolean;
  maskPhoneNumbers: boolean;
  maskCreditCards: boolean;
  maskSSN: boolean;
  maskURLParams: boolean;
  maskAPIKeys: boolean;
  customPatterns?: RegExp[];
}

export const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  maskTokens: true,
  maskPasswords: true,
  maskEmails: true,
  maskPhoneNumbers: true,
  maskCreditCards: true,
  maskSSN: true,
  maskURLParams: true,
  maskAPIKeys: true,
};

// Regex patterns for sensitive data detection
const PATTERNS = {
  // Bearer tokens and JWT
  bearer: /bearer\s+[a-z0-9.\-_]+/gi,
  jwt: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[-A-Za-z0-9_]/g,

  // API Keys and credentials
  apiKey: /(api[_-]?key|api[_-]?secret|authorization|x-api-key)\s*[=:]\s*["']?([a-zA-Z0-9_\-]+)["']?/gi,

  // AWS credentials
  awsAccessKey: /AKIA[0-9A-Z]{16}/g,
  awsSecretKey: /aws_secret_access_key\s*[=:]\s*["']?([a-zA-Z0-9\/+]+)["']?/gi,

  // Password patterns
  password: /(password|passwd|pwd|secret)\s*[=:]\s*["']?([^\s,"']+)["']?/gi,

  // Database connection strings
  dbUrl: /(mongodb|postgres|mysql|redis)[+a-z]*:\/\/[^\s]+/gi,

  // Credit Card Numbers (Luhn compliant patterns)
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

  // Social Security Number (XXX-XX-XXXX format)
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,

  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // Phone numbers (various formats)
  phone: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
  internationalPhone: /\+[0-9]{1,3}[-.\s]?[0-9]{1,14}\b/g,

  // IPv4 addresses (sometimes sensitive in logs)
  ipv4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,

  // URL query parameters with sensitive data
  urlSensitiveParams: /([?&](?:token|key|secret|password|auth|access_token|refresh_token|api_key|apikey)[=:]([^&\s]+))/gi,

  // Private SSH/RSA keys
  privateKey: /-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |OPENSSH )?PRIVATE KEY-----/g,
};

export class LogMasker {
  private config: MaskingConfig;
  private customPatterns: Map<string, RegExp> = new Map();

  constructor(config: Partial<MaskingConfig> = {}) {
    this.config = { ...DEFAULT_MASKING_CONFIG, ...config };
  }

  /**
   * Register a custom masking pattern
   */
  registerPattern(name: string, pattern: RegExp): void {
    this.customPatterns.set(name, pattern);
  }

  /**
   * Mask all sensitive data in a string
   */
  mask(data: string | any): string {
    if (!data) {
      return data;
    }

    let result = String(data);

    // Apply masking patterns
    if (this.config.maskTokens) {
      result = this.maskBearerTokens(result);
      result = this.maskJWT(result);
    }

    if (this.config.maskAPIKeys) {
      result = this.maskAPIKeys(result);
      result = this.maskAWSCredentials(result);
    }

    if (this.config.maskPasswords) {
      result = this.maskPasswords(result);
      result = this.maskDatabaseURLs(result);
    }

    if (this.config.maskCreditCards) {
      result = this.maskCreditCards(result);
    }

    if (this.config.maskSSN) {
      result = this.maskSSN(result);
    }

    if (this.config.maskEmails) {
      result = this.maskEmails(result);
    }

    if (this.config.maskPhoneNumbers) {
      result = this.maskPhoneNumbers(result);
    }

    if (this.config.maskURLParams) {
      result = this.maskURLParameters(result);
    }

    result = this.maskPrivateKeys(result);

    // Apply custom patterns
    for (const [name, pattern] of this.customPatterns) {
      result = result.replace(pattern, `[REDACTED-${name.toUpperCase()}]`);
    }

    return result;
  }

  /**
   * Mask bearer tokens
   */
  private maskBearerTokens(data: string): string {
    return data.replace(PATTERNS.bearer, (match) => {
      const prefix = match.substring(0, 7); // "Bearer " or "bearer "
      return prefix + '[REDACTED-TOKEN]';
    });
  }

  /**
   * Mask JWT tokens
   */
  private maskJWT(data: string): string {
    return data.replace(PATTERNS.jwt, '[REDACTED-JWT]');
  }

  /**
   * Mask API Keys
   */
  private maskAPIKeys(data: string): string {
    return data.replace(PATTERNS.apiKey, (match, key, value) => {
      const keyName = key.trim();
      return `${keyName}=[REDACTED-API-KEY]`;
    });
  }

  /**
   * Mask AWS credentials
   */
  private maskAWSCredentials(data: string): string {
    let result = data.replace(PATTERNS.awsAccessKey, '[REDACTED-AWS-ACCESS-KEY]');
    result = result.replace(PATTERNS.awsSecretKey, 'aws_secret_access_key=[REDACTED-AWS-SECRET-KEY]');
    return result;
  }

  /**
   * Mask passwords
   */
  private maskPasswords(data: string): string {
    return data.replace(PATTERNS.password, (match, key, value) => {
      const keyName = key.trim();
      return `${keyName}=[REDACTED-PASSWORD]`;
    });
  }

  /**
   * Mask database URLs
   */
  private maskDatabaseURLs(data: string): string {
    return data.replace(PATTERNS.dbUrl, (match) => {
      // Extract the protocol
      const protocol = match.split('://')[0];
      return `${protocol}://[REDACTED-DATABASE-URL]`;
    });
  }

  /**
   * Mask credit card numbers
   */
  private maskCreditCards(data: string): string {
    return data.replace(PATTERNS.creditCard, (match) => {
      const cleaned = match.replace(/[^\d]/g, '');
      if (cleaned.length === 16) {
        // Show only last 4 digits
        return `****-****-****-${cleaned.slice(-4)}`;
      }
      return '[REDACTED-CARD]';
    });
  }

  /**
   * Mask SSN
   */
  private maskSSN(data: string): string {
    return data.replace(PATTERNS.ssn, '[REDACTED-SSN]');
  }

  /**
   * Mask email addresses
   */
  private maskEmails(data: string): string {
    return data.replace(PATTERNS.email, (match) => {
      const parts = match.split('@');
      if (parts[0].length <= 2) {
        return '[REDACTED-EMAIL]';
      }
      // Show first char and last part of domain
      const localPart = parts[0][0] + '*'.repeat(parts[0].length - 1);
      const domain = parts[1];
      return `${localPart}@${domain}`;
    });
  }

  /**
   * Mask phone numbers
   */
  private maskPhoneNumbers(data: string): string {
    let result = data.replace(PATTERNS.phone, (match) => {
      const cleaned = match.replace(/[^\d]/g, '');
      if (cleaned.length >= 10) {
        return `***-***-${cleaned.slice(-4)}`;
      }
      return '[REDACTED-PHONE]';
    });

    result = result.replace(PATTERNS.internationalPhone, (match) => {
      const cleaned = match.replace(/[^\d+]/g, '');
      return `+${cleaned.slice(1, 4)}***${cleaned.slice(-4)}`;
    });

    return result;
  }

  /**
   * Mask URL parameters
   */
  private maskURLParameters(data: string): string {
    return data.replace(PATTERNS.urlSensitiveParams, (match, paramName) => {
      const param = paramName.split('=')[0] || paramName.split(':')[0];
      return `${param}=[REDACTED-URL-PARAM]`;
    });
  }

  /**
   * Mask private keys
   */
  private maskPrivateKeys(data: string): string {
    return data.replace(PATTERNS.privateKey, '[REDACTED-PRIVATE-KEY]');
  }

  /**
   * Mask an object recursively
   */
  maskObject(obj: any, depth = 0, maxDepth = 5): any {
    if (depth > maxDepth || !obj) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.mask(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.maskObject(item, depth + 1, maxDepth));
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    const masked: Record<string, any> = {};
    const sensitiveKeys = /^(password|passwd|pwd|secret|token|api_?key|auth|credit_?card|ssn|email|phone|private_?key|access_?token|refresh_?token|bearer)/i;

    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.test(key)) {
        // Mask entire value for sensitive key names
        masked[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        masked[key] = this.mask(value);
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskObject(value, depth + 1, maxDepth);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  /**
   * Create a safe version of a URL by removing sensitive query parameters
   */
  maskURL(url: string): string {
    try {
      const urlObj = new URL(url);
      const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth', 'access_token', 'refresh_token', 'api_key', 'apikey'];

      for (const param of sensitiveParams) {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.set(param, '[REDACTED]');
        }
      }

      return urlObj.toString();
    } catch (e) {
      // If URL parsing fails, apply string masking
      return this.maskURLParameters(url);
    }
  }

  /**
   * Get masking statistics for audit purposes
   */
  getStats(data: string): {
    totalMatches: number;
    maskedPatterns: Record<string, number>;
  } {
    const stats = {
      totalMatches: 0,
      maskedPatterns: {} as Record<string, number>,
    };

    const patternNames = Object.keys(PATTERNS) as (keyof typeof PATTERNS)[];
    for (const patternName of patternNames) {
      const pattern = PATTERNS[patternName];
      const matches = data.match(pattern) || [];
      if (matches.length > 0) {
        stats.maskedPatterns[patternName] = matches.length;
        stats.totalMatches += matches.length;
      }
    }

    return stats;
  }
}

// Export singleton instance
export const logMasker = new LogMasker();
