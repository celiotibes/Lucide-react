import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './error.middleware';

export interface ValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: (string | number)[];
  pattern?: RegExp;
  custom?: (value: any) => boolean | string;
}

export interface ValidationSchema {
  [field: string]: ValidationRule;
}

export function validateRequest(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req.body;
    const errors: Record<string, string> = {};

    Object.entries(schema).forEach(([field, rules]) => {
      const value = data[field];

      // Check required
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors[field] = `${field} is required`;
        return;
      }

      if (value === undefined || value === null) {
        return;
      }

      // Check type
      if (rules.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rules.type) {
          errors[field] = `${field} must be a ${rules.type}`;
          return;
        }
      }

      // Check string rules
      if (typeof value === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          errors[field] = `${field} must be at least ${rules.minLength} characters`;
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors[field] = `${field} must be at most ${rules.maxLength} characters`;
        }
        if (rules.pattern && !rules.pattern.test(value)) {
          errors[field] = `${field} format is invalid`;
        }
      }

      // Check number rules
      if (typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors[field] = `${field} must be at least ${rules.min}`;
        }
        if (rules.max !== undefined && value > rules.max) {
          errors[field] = `${field} must be at most ${rules.max}`;
        }
      }

      // Check enum
      if (rules.enum && !rules.enum.includes(value)) {
        errors[field] = `${field} must be one of: ${rules.enum.join(', ')}`;
      }

      // Custom validation
      if (rules.custom) {
        const result = rules.custom(value);
        if (result !== true) {
          errors[field] = typeof result === 'string' ? result : `${field} validation failed`;
        }
      }
    });

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Validation failed', errors);
    }

    next();
  };
}

export const schemas = {
  createProperty: {
    owner_id: { required: true, type: 'string' },
    address: { required: true, type: 'string', minLength: 5, maxLength: 255 },
    city: { required: true, type: 'string', minLength: 2, maxLength: 100 },
    state: { required: true, type: 'string', minLength: 2, maxLength: 2 },
    type: {
      required: true,
      type: 'string',
      enum: ['kitnet', 'apt_2qt', 'apt_3qt'],
    },
    area_m2: { required: true, type: 'number', min: 10, max: 500 },
    bedrooms: { required: true, type: 'number', min: 1, max: 10 },
    bathrooms: { required: true, type: 'number', min: 1, max: 5 },
    base_monthly_rent: { required: true, type: 'number', min: 100, max: 100000 },
  } as ValidationSchema,

  createListing: {
    property_id: { required: true, type: 'string' },
    platform: {
      required: true,
      type: 'string',
      enum: ['airbnb', 'booking', 'vrbo', 'direct'],
    },
    title: { required: true, type: 'string', minLength: 10, maxLength: 255 },
    description: { required: true, type: 'string', minLength: 20, maxLength: 5000 },
    base_price: { required: true, type: 'number', min: 10, max: 100000 },
  } as ValidationSchema,

  createLead: {
    property_id: { required: true, type: 'string' },
    listing_id: { required: true, type: 'string' },
    name: { required: true, type: 'string', minLength: 2, maxLength: 255 },
    email: {
      required: false,
      type: 'string',
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    phone: { required: false, type: 'string', minLength: 10, maxLength: 20 },
    source_channel: {
      required: true,
      type: 'string',
      enum: ['airbnb', 'booking', 'vrbo', 'direct', 'ads', 'referral'],
    },
  } as ValidationSchema,

  updateLead: {
    stage: {
      required: false,
      type: 'string',
      enum: ['inquiry', 'contacted', 'tour_scheduled', 'touring', 'negotiation', 'closed', 'lost'],
    },
    actual_deal_value: { required: false, type: 'number', min: 0, max: 1000000 },
    notes: { required: false, type: 'string', maxLength: 1000 },
  } as ValidationSchema,
};
