/**
 * Input Validation Utilities
 * Uses Zod for runtime type validation
 */

import { z, ZodError } from 'zod';
import {
  CredentialsSchema,
  DocumentCreateSchema,
  TransactionCreateSchema,
  PropertyCreateSchema,
} from '@/api/config';

export type ValidationError = {
  field: string;
  message: string;
};

/**
 * Validate credentials (email and password)
 */
export function validateCredentials(
  email: string,
  password: string
): { valid: boolean; errors: ValidationError[] } {
  try {
    CredentialsSchema.parse({ email, password });
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path[0] as string,
        message: err.message,
      }));
      return { valid: false, errors };
    }
    return {
      valid: false,
      errors: [{ field: 'unknown', message: 'Validation failed' }],
    };
  }
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  return z.string().email().safeParse(email).success;
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
  valid: boolean;
  strength: 'weak' | 'medium' | 'strong';
  message: string;
} {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  const strengthScore = [minLength, hasUppercase, hasLowercase, hasNumbers, hasSpecial].filter(
    Boolean
  ).length;

  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  let message = 'Password is weak';

  if (strengthScore >= 4) {
    strength = 'strong';
    message = 'Password is strong';
  } else if (strengthScore >= 3) {
    strength = 'medium';
    message = 'Password is medium strength';
  }

  return {
    valid: password.length >= 6,
    strength,
    message,
  };
}

/**
 * Validate document data
 */
export function validateDocument(data: unknown): { valid: boolean; errors: ValidationError[] } {
  try {
    DocumentCreateSchema.parse(data);
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.errors.map((err) => ({
        field: String(err.path[0] || 'unknown'),
        message: err.message,
      }));
      return { valid: false, errors };
    }
    return {
      valid: false,
      errors: [{ field: 'unknown', message: 'Validation failed' }],
    };
  }
}

/**
 * Validate transaction data
 */
export function validateTransaction(data: unknown): { valid: boolean; errors: ValidationError[] } {
  try {
    TransactionCreateSchema.parse(data);
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.errors.map((err) => ({
        field: String(err.path[0] || 'unknown'),
        message: err.message,
      }));
      return { valid: false, errors };
    }
    return {
      valid: false,
      errors: [{ field: 'unknown', message: 'Validation failed' }],
    };
  }
}

/**
 * Validate property data
 */
export function validateProperty(data: unknown): { valid: boolean; errors: ValidationError[] } {
  try {
    PropertyCreateSchema.parse(data);
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.errors.map((err) => ({
        field: String(err.path[0] || 'unknown'),
        message: err.message,
      }));
      return { valid: false, errors };
    }
    return {
      valid: false,
      errors: [{ field: 'unknown', message: 'Validation failed' }],
    };
  }
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate numeric value range
 */
export function validateNumberRange(
  value: unknown,
  min?: number,
  max?: number
): { valid: boolean; message: string } {
  const schema = z
    .number()
    .min(min ?? Number.NEGATIVE_INFINITY)
    .max(max ?? Number.POSITIVE_INFINITY);

  const result = schema.safeParse(value);
  return {
    valid: result.success,
    message: result.success ? '' : 'Invalid number',
  };
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return '';

  return errors.map((err) => `${err.field}: ${err.message}`).join('\n');
}

/**
 * Get first validation error message
 */
export function getFirstValidationError(errors: ValidationError[]): string | null {
  return errors.length > 0 ? errors[0].message : null;
}
