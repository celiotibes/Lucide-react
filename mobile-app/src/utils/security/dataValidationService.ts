export interface ValidationRule {
  type: 'email' | 'url' | 'phone' | 'alphanumeric' | 'number' | 'password' | 'custom';
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  validator?: (value: string) => boolean;
}

export class DataValidationService {
  private static readonly DANGEROUS_CHARS = /[<>{}'"`;]/g;
  private static readonly SQL_INJECTION_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b)/gi,
    /(--|#|\/\*|\*\/)/g,
    /(\bOR\b.*=.*)/gi,
    /(\bAND\b.*=.*)/gi,
  ];

  static sanitizeInput(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    let sanitized = input
      .trim()
      .replace(this.DANGEROUS_CHARS, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');

    return sanitized;
  }

  static sanitizeHtml(html: string): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    const element = document.createElement('div');
    element.textContent = html;
    return element.innerHTML;
  }

  static preventSqlInjection(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return true;
    }

    for (const pattern of this.SQL_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        return false;
      }
    }

    return true;
  }

  static validateEmail(email: string): boolean {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email) && this.preventSqlInjection(email);
  }

  static validateUrl(url: string): boolean {
    try {
      new URL(url);
      return this.preventSqlInjection(url);
    } catch {
      return false;
    }
  }

  static validatePhoneNumber(phone: string): boolean {
    const pattern = /^[\d\s\-\+\(\)]{7,}$/;
    return pattern.test(phone) && this.preventSqlInjection(phone);
  }

  static validatePassword(password: string): boolean {
    if (!password || password.length < 8) {
      return false;
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    return hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
  }

  static validateInput(value: string, rule: ValidationRule): boolean {
    if (!value || typeof value !== 'string') {
      return false;
    }

    switch (rule.type) {
      case 'email':
        return this.validateEmail(value);
      case 'url':
        return this.validateUrl(value);
      case 'phone':
        return this.validatePhoneNumber(value);
      case 'password':
        return this.validatePassword(value);
      case 'number':
        return !isNaN(Number(value));
      case 'alphanumeric':
        return /^[a-zA-Z0-9]+$/.test(value);
      case 'custom':
        if (rule.pattern && !rule.pattern.test(value)) {
          return false;
        }
        if (rule.validator && !rule.validator(value)) {
          return false;
        }
        if (rule.minLength && value.length < rule.minLength) {
          return false;
        }
        if (rule.maxLength && value.length > rule.maxLength) {
          return false;
        }
        return true;
      default:
        return false;
    }
  }

  static validateBatch(values: Record<string, string>, rules: Record<string, ValidationRule>): {
    valid: boolean;
    errors: Record<string, string>;
  } {
    const errors: Record<string, string> = {};

    for (const [key, value] of Object.entries(values)) {
      const rule = rules[key];
      if (!rule) {
        continue;
      }

      if (!this.validateInput(value, rule)) {
        errors[key] = `Validation failed for ${key}`;
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  static escapeSpecialChars(str: string): string {
    if (!str || typeof str !== 'string') {
      return '';
    }

    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  static isSafeString(str: string): boolean {
    if (!str || typeof str !== 'string') {
      return false;
    }

    return (
      this.preventSqlInjection(str) &&
      !/<script|<iframe|javascript:/i.test(str) &&
      !this.DANGEROUS_CHARS.test(str)
    );
  }
}
