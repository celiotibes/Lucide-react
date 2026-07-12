import { Request, Response, NextFunction } from 'express';
import { AppError } from '@utils/errors';
import { logger } from '@utils/logger';

// ============================================================================
// VALIDATION MIDDLEWARE - Centralized Data Validation
// ============================================================================

export interface ValidationSchema {
  [field: string]: {
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: RegExp;
    enum?: any[];
    custom?: (value: any) => boolean | string;
    message?: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string[]>;
  data: Record<string, any>;
}

export class Validator {
  /**
   * Validate data against schema
   */
  static validate(data: Record<string, any>, schema: ValidationSchema): ValidationResult {
    const errors: Record<string, string[]> = {};
    const validatedData: Record<string, any> = {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];
      const fieldErrors: string[] = [];

      if (rules.required && (value === undefined || value === null || value === '')) {
        fieldErrors.push(rules.message || `${field} é obrigatório`);
      }

      if (value !== undefined && value !== null && value !== '') {
        const typeError = this.validateType(value, rules.type, field);
        if (typeError) {
          fieldErrors.push(typeError);
        } else {
          const constraintErrors = this.validateConstraints(value, rules, field);
          fieldErrors.push(...constraintErrors);
        }
      }

      if (rules.custom && value !== undefined) {
        const customResult = rules.custom(value);
        if (customResult !== true) {
          fieldErrors.push(typeof customResult === 'string' ? customResult : `${field} falhou na validação custom`);
        }
      }

      if (fieldErrors.length > 0) {
        errors[field] = fieldErrors;
      } else {
        validatedData[field] = value;
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      data: validatedData,
    };
  }

  /**
   * Validate type
   */
  private static validateType(value: any, type: string, field: string): string | null {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return `${field} deve ser uma string`;
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return `${field} deve ser um número`;
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          return `${field} deve ser um booleano`;
        }
        break;
      case 'date':
        if (!(value instanceof Date) && isNaN(Date.parse(value))) {
          return `${field} deve ser uma data válida`;
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          return `${field} deve ser um array`;
        }
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          return `${field} deve ser um objeto`;
        }
        break;
    }
    return null;
  }

  /**
   * Validate constraints
   */
  private static validateConstraints(value: any, rules: any, field: string): string[] {
    const errors: string[] = [];

    if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
      errors.push(`${field} deve ter pelo menos ${rules.minLength} caracteres`);
    }

    if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
      errors.push(`${field} deve ter no máximo ${rules.maxLength} caracteres`);
    }

    if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
      errors.push(`${field} deve ser maior ou igual a ${rules.min}`);
    }

    if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
      errors.push(`${field} deve ser menor ou igual a ${rules.max}`);
    }

    if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
      errors.push(`${field} tem formato inválido`);
    }

    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} deve ser um dos seguintes: ${rules.enum.join(', ')}`);
    }

    return errors;
  }
}

/**
 * Middleware factory for request validation
 */
export const validateRequest = (schema: ValidationSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;

      const result = Validator.validate(data as Record<string, any>, schema);

      if (!result.valid) {
        logger.warn(
          { errors: result.errors, source },
          `Validação falhou para ${source}`,
        );
        throw new AppError(
          `Validação falhou: ${Object.values(result.errors).flat().join(', ')}`,
          400,
          'VALIDATION_ERROR',
        );
      }

      req.body = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Email validation helper
 */
export const validateEmail = (email: string): boolean => {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
};

/**
 * Phone validation helper
 */
export const validatePhone = (phone: string): boolean => {
  const pattern = /^[\d\s\-\(\)\+]+$/;
  return pattern.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

/**
 * CPF/CNPJ validation helper
 */
export const validateCPFCNPJ = (value: string): boolean => {
  const clean = value.replace(/\D/g, '');

  if (clean.length === 11) {
    return validateCPF(clean);
  } else if (clean.length === 14) {
    return validateCNPJ(clean);
  }

  return false;
};

/**
 * CPF validation (simplified)
 */
export const validateCPF = (cpf: string): boolean => {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  let sum = 0;
  let remainder = 0;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(10, 11))) return false;

  return true;
};

/**
 * CNPJ validation (simplified)
 */
export const validateCNPJ = (cnpj: string): boolean => {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }

  let sum = 0;
  const multipliers = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  for (let i = 0; i < 12; i++) {
    sum += parseInt(cnpj[i]) * multipliers[i];
  }

  let remainder = sum % 11;
  let digit1 = remainder < 2 ? 0 : 11 - remainder;

  sum = 0;
  multipliers.unshift(6);

  for (let i = 0; i < 13; i++) {
    sum += parseInt(cnpj[i]) * multipliers[i];
  }

  remainder = sum % 11;
  let digit2 = remainder < 2 ? 0 : 11 - remainder;

  return digit1 === parseInt(cnpj[12]) && digit2 === parseInt(cnpj[13]);
};
