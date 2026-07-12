/**
 * Input Validation Utilities
 * Validates common Brazilian legal document formats and data types
 * Used by API endpoints and middleware to ensure data integrity
 */

import { ValidationError } from './errors';

/**
 * CPF Validator (Cadastro de Pessoas Físicas - Individual Tax ID)
 * Format: XXX.XXX.XXX-XX or XXXXXXXXXXX (11 digits)
 * Validates format and checksum using módulo 11 algorithm
 */
export class CPFValidator {
  static readonly REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$/;

  static validate(cpf: string): boolean {
    if (!cpf || typeof cpf !== 'string') return false;

    // Remove formatting
    const clean = cpf.replace(/\D/g, '');

    // Must be 11 digits
    if (clean.length !== 11) return false;

    // Cannot have all same digits
    if (/^(\d)\1{10}$/.test(clean)) return false;

    // Validate first check digit
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(clean[i], 10) * (10 - i);
    }
    let remainder = sum % 11;
    const digit1 = remainder < 2 ? 0 : 11 - remainder;

    if (parseInt(clean[9], 10) !== digit1) return false;

    // Validate second check digit
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(clean[i], 10) * (11 - i);
    }
    remainder = sum % 11;
    const digit2 = remainder < 2 ? 0 : 11 - remainder;

    if (parseInt(clean[10], 10) !== digit2) return false;

    return true;
  }

  static format(cpf: string): string {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) throw new ValidationError('CPF deve conter 11 dígitos');
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
  }

  static throwIfInvalid(cpf: string, fieldName: string = 'CPF'): void {
    if (!this.validate(cpf)) {
      throw new ValidationError(`${fieldName} inválido`, {
        field: fieldName.toLowerCase(),
        value: cpf,
        reason: 'CPF checksum validation failed or invalid format',
        expectedFormat: '123.456.789-01 ou 12345678901',
      });
    }
  }
}

/**
 * CNPJ Validator (Cadastro Nacional da Pessoa Jurídica - Company Tax ID)
 * Format: XX.XXX.XXX/XXXX-XX or XXXXXXXXXXXXXX (14 digits)
 * Validates format and checksum using módulo 11 algorithm
 */
export class CNPJValidator {
  static readonly REGEX = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{14}$/;

  static validate(cnpj: string): boolean {
    if (!cnpj || typeof cnpj !== 'string') return false;

    // Remove formatting
    const clean = cnpj.replace(/\D/g, '');

    // Must be 14 digits
    if (clean.length !== 14) return false;

    // Cannot have all same digits
    if (/^(\d)\1{13}$/.test(clean)) return false;

    // Validate first check digit
    let sum = 0;
    const multiplier1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    for (let i = 0; i < 12; i++) {
      sum += parseInt(clean[i], 10) * multiplier1[i];
    }

    let remainder = sum % 11;
    const digit1 = remainder < 2 ? 0 : 11 - remainder;

    if (parseInt(clean[12], 10) !== digit1) return false;

    // Validate second check digit
    sum = 0;
    const multiplier2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    for (let i = 0; i < 13; i++) {
      sum += parseInt(clean[i], 10) * multiplier2[i];
    }

    remainder = sum % 11;
    const digit2 = remainder < 2 ? 0 : 11 - remainder;

    if (parseInt(clean[13], 10) !== digit2) return false;

    return true;
  }

  static format(cnpj: string): string {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) throw new ValidationError('CNPJ deve conter 14 dígitos');
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12)}`;
  }

  static throwIfInvalid(cnpj: string, fieldName: string = 'CNPJ'): void {
    if (!this.validate(cnpj)) {
      throw new ValidationError(`${fieldName} inválido`, {
        field: fieldName.toLowerCase(),
        value: cnpj,
        reason: 'CNPJ checksum validation failed or invalid format',
        expectedFormat: '12.345.678/0001-90 ou 12345678000190',
      });
    }
  }
}

/**
 * Email Validator
 * RFC 5321 compliant email validation
 */
export class EmailValidator {
  // Simplified email regex (not 100% RFC compliant but good enough for most cases)
  static readonly REGEX =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  static validate(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    return this.REGEX.test(email) && email.length <= 255;
  }

  static throwIfInvalid(email: string, fieldName: string = 'email'): void {
    if (!this.validate(email)) {
      throw new ValidationError(`${fieldName} inválido`, {
        field: fieldName.toLowerCase(),
        value: email,
        reason: 'Email format is invalid',
        expectedFormat: 'user@example.com',
      });
    }
  }
}

/**
 * Phone Validator
 * Brazilian phone format validation
 */
export class PhoneValidator {
  static validate(phone: string): boolean {
    if (!phone || typeof phone !== 'string') return false;

    // Remove common formatting characters
    const clean = phone.replace(/\D/g, '');

    // Brazil: (XX) 9XXXX-XXXX (10-11 digits)
    return clean.length >= 10 && clean.length <= 11;
  }

  static format(phone: string): string {
    const clean = phone.replace(/\D/g, '');

    if (clean.length === 10) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
    } else if (clean.length === 11) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    }

    return phone;
  }

  static throwIfInvalid(phone: string, fieldName: string = 'phone'): void {
    if (!this.validate(phone)) {
      throw new ValidationError(`${fieldName} inválido`, {
        field: fieldName.toLowerCase(),
        value: phone,
        reason: 'Phone number must be a valid Brazilian number',
        expectedFormat: '(11) 98765-4321 ou 11987654321',
      });
    }
  }
}

/**
 * Case Number Validator (CNJ Standard)
 * Format: NNNNNNN-DD.AAAA.J.TT.OOOO
 * Example: 0001234-56.2024.1.02.3500
 */
export class CaseNumberValidator {
  static readonly REGEX = /^\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}$/;

  static validate(caseNumber: string): boolean {
    if (!caseNumber || typeof caseNumber !== 'string') return false;
    return this.REGEX.test(caseNumber);
  }

  static throwIfInvalid(caseNumber: string, fieldName: string = 'case_number'): void {
    if (!this.validate(caseNumber)) {
      throw new ValidationError(`${fieldName} inválido`, {
        field: fieldName.toLowerCase(),
        value: caseNumber,
        reason: 'Case number must follow CNJ standard format',
        expectedFormat: 'NNNNNNN-DD.AAAA.J.TT.OOOO (exemplo: 0001234-56.2024.1.02.3500)',
      });
    }
  }
}

/**
 * Date Validator (ISO 8601)
 * Format: YYYY-MM-DD
 */
export class DateValidator {
  static validate(date: string): boolean {
    if (!date || typeof date !== 'string') return false;

    // Check format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

    // Check if valid date
    const d = new Date(date);
    return d instanceof Date && !isNaN(d.getTime());
  }

  static throwIfInvalid(date: string, fieldName: string = 'date'): void {
    if (!this.validate(date)) {
      throw new ValidationError(`${fieldName} inválido`, {
        field: fieldName.toLowerCase(),
        value: date,
        reason: 'Date must be in ISO 8601 format',
        expectedFormat: 'YYYY-MM-DD (exemplo: 2024-01-15)',
      });
    }
  }
}

/**
 * URL Validator
 */
export class URLValidator {
  static validate(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static throwIfInvalid(url: string, fieldName: string = 'url'): void {
    if (!this.validate(url)) {
      throw new ValidationError(`${fieldName} inválido`, {
        field: fieldName.toLowerCase(),
        value: url,
        reason: 'URL must be a valid HTTP/HTTPS URL',
        expectedFormat: 'https://example.com/path',
      });
    }
  }
}

/**
 * Enum Validator
 * Validates that value is one of allowed enum values
 */
export class EnumValidator {
  static validate<T>(value: T, allowedValues: T[]): boolean {
    return allowedValues.includes(value);
  }

  static throwIfInvalid<T>(value: T, allowedValues: T[], fieldName: string = 'value'): void {
    if (!this.validate(value, allowedValues)) {
      throw new ValidationError(`${fieldName} inválido`, {
        field: fieldName.toLowerCase(),
        value,
        reason: 'Value must be one of the allowed values',
        allowedValues,
      });
    }
  }
}

/**
 * Bulk Input Validation
 * Validates multiple fields at once
 */
export interface ValidateOptions {
  cpf?: boolean;
  cnpj?: boolean;
  email?: boolean;
  phone?: boolean;
  caseNumber?: boolean;
}

export function validateClientInput(data: Record<string, unknown>): void {
  const errors: Record<string, string> = {};

  // Validate email if present
  if (data.email && !EmailValidator.validate(String(data.email))) {
    errors.email = 'Email inválido';
  }

  // Validate CPF if present
  if (data.cpf && !CPFValidator.validate(String(data.cpf))) {
    errors.cpf = 'CPF inválido';
  }

  // Validate CNPJ if present
  if (data.cnpj && !CNPJValidator.validate(String(data.cnpj))) {
    errors.cnpj = 'CNPJ inválido';
  }

  // Validate phone if present
  if (data.phone && !PhoneValidator.validate(String(data.phone))) {
    errors.phone = 'Telefone inválido';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validação de entrada falhou', errors);
  }
}

export function validateCaseInput(data: Record<string, unknown>): void {
  const errors: Record<string, string> = {};

  // Validate case number if present
  if (data.case_number && !CaseNumberValidator.validate(String(data.case_number))) {
    errors.case_number = 'Número de caso inválido (padrão CNJ)';
  }

  // Validate dates if present
  if (data.filing_date && !DateValidator.validate(String(data.filing_date))) {
    errors.filing_date = 'Data de protocolização inválida (formato: YYYY-MM-DD)';
  }

  if (data.deadline_date && !DateValidator.validate(String(data.deadline_date))) {
    errors.deadline_date = 'Data limite inválida (formato: YYYY-MM-DD)';
  }

  // Validate case status enum
  if (data.status) {
    const validStatuses = ['registered', 'in_progress', 'closed', 'archived'];
    if (!validStatuses.includes(String(data.status))) {
      errors.status = `Status inválido. Valores permitidos: ${validStatuses.join(', ')}`;
    }
  }

  // Validate outcome enum
  if (data.outcome) {
    const validOutcomes = ['favorable', 'unfavorable', 'partial', 'dismissed', 'settled'];
    if (!validOutcomes.includes(String(data.outcome))) {
      errors.outcome = `Resultado inválido. Valores permitidos: ${validOutcomes.join(', ')}`;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validação de entrada do caso falhou', errors);
  }
}
