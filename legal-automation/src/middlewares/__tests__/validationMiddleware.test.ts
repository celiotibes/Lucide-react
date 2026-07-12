import {
  Validator,
  validateEmail,
  validatePhone,
  validateCPFCNPJ,
  validateCPF,
  validateCNPJ,
} from '@middlewares/validationMiddleware';

describe('Validator', () => {
  describe('basic type validation', () => {
    test('should validate string type', () => {
      const schema = {
        name: { type: 'string' as const, required: true },
      };

      const result = Validator.validate({ name: 'John' }, schema);
      expect(result.valid).toBe(true);

      const invalidResult = Validator.validate({ name: 123 }, schema);
      expect(invalidResult.valid).toBe(false);
    });

    test('should validate number type', () => {
      const schema = {
        age: { type: 'number' as const, required: true },
      };

      const result = Validator.validate({ age: 25 }, schema);
      expect(result.valid).toBe(true);

      const invalidResult = Validator.validate({ age: 'invalid' }, schema);
      expect(invalidResult.valid).toBe(false);
    });

    test('should validate boolean type', () => {
      const schema = {
        active: { type: 'boolean' as const, required: true },
      };

      const result = Validator.validate({ active: true }, schema);
      expect(result.valid).toBe(true);

      const invalidResult = Validator.validate({ active: 'yes' }, schema);
      expect(invalidResult.valid).toBe(false);
    });

    test('should validate array type', () => {
      const schema = {
        tags: { type: 'array' as const, required: true },
      };

      const result = Validator.validate({ tags: ['a', 'b'] }, schema);
      expect(result.valid).toBe(true);

      const invalidResult = Validator.validate({ tags: 'not-array' }, schema);
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('string constraints', () => {
    test('should validate minLength', () => {
      const schema = {
        password: { type: 'string' as const, minLength: 8 },
      };

      const valid = Validator.validate({ password: '12345678' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = Validator.validate({ password: '1234567' }, schema);
      expect(invalid.valid).toBe(false);
    });

    test('should validate maxLength', () => {
      const schema = {
        code: { type: 'string' as const, maxLength: 5 },
      };

      const valid = Validator.validate({ code: '12345' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = Validator.validate({ code: '123456' }, schema);
      expect(invalid.valid).toBe(false);
    });

    test('should validate pattern', () => {
      const schema = {
        zipcode: { type: 'string' as const, pattern: /^\d{5}-\d{3}$/ },
      };

      const valid = Validator.validate({ zipcode: '12345-678' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = Validator.validate({ zipcode: '12345678' }, schema);
      expect(invalid.valid).toBe(false);
    });
  });

  describe('number constraints', () => {
    test('should validate min', () => {
      const schema = {
        age: { type: 'number' as const, min: 0 },
      };

      const valid = Validator.validate({ age: 18 }, schema);
      expect(valid.valid).toBe(true);

      const invalid = Validator.validate({ age: -1 }, schema);
      expect(invalid.valid).toBe(false);
    });

    test('should validate max', () => {
      const schema = {
        rating: { type: 'number' as const, max: 5 },
      };

      const valid = Validator.validate({ rating: 4.5 }, schema);
      expect(valid.valid).toBe(true);

      const invalid = Validator.validate({ rating: 6 }, schema);
      expect(invalid.valid).toBe(false);
    });
  });

  describe('enum validation', () => {
    test('should validate enum', () => {
      const schema = {
        status: { type: 'string' as const, enum: ['active', 'inactive', 'pending'] },
      };

      const valid = Validator.validate({ status: 'active' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = Validator.validate({ status: 'unknown' }, schema);
      expect(invalid.valid).toBe(false);
    });
  });

  describe('custom validation', () => {
    test('should run custom validator', () => {
      const schema = {
        email: {
          type: 'string' as const,
          custom: (value: string) => value.includes('@'),
        },
      };

      const valid = Validator.validate({ email: 'test@example.com' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = Validator.validate({ email: 'not-email' }, schema);
      expect(invalid.valid).toBe(false);
    });

    test('should return custom error message', () => {
      const schema = {
        value: {
          type: 'number' as const,
          custom: (value: number) => value > 100 || 'Value must be greater than 100',
        },
      };

      const result = Validator.validate({ value: 50 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.value[0]).toBe('Value must be greater than 100');
    });
  });

  describe('required validation', () => {
    test('should validate required fields', () => {
      const schema = {
        name: { type: 'string' as const, required: true },
      };

      const result = Validator.validate({}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.name).toBeDefined();
    });

    test('should allow optional fields', () => {
      const schema = {
        nickname: { type: 'string' as const, required: false },
      };

      const result = Validator.validate({}, schema);
      expect(result.valid).toBe(true);
    });
  });
});

describe('Email validation', () => {
  test('should validate email', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user+tag@domain.co.uk')).toBe(true);
    expect(validateEmail('invalid-email')).toBe(false);
    expect(validateEmail('missing@domain')).toBe(false);
  });
});

describe('Phone validation', () => {
  test('should validate phone', () => {
    expect(validatePhone('(11) 99999-8888')).toBe(true);
    expect(validatePhone('11999998888')).toBe(true);
    expect(validatePhone('invalid')).toBe(false);
    expect(validatePhone('123')).toBe(false);
  });
});

describe('CPF validation', () => {
  test('should validate valid CPF', () => {
    expect(validateCPF('11144477735')).toBe(true);
  });

  test('should reject invalid CPF', () => {
    expect(validateCPF('11111111111')).toBe(false);
    expect(validateCPF('12345678901')).toBe(false);
  });
});

describe('CNPJ validation', () => {
  test('should validate valid CNPJ', () => {
    expect(validateCNPJ('11222333000181')).toBe(true);
  });

  test('should reject invalid CNPJ', () => {
    expect(validateCNPJ('11111111111111')).toBe(false);
    expect(validateCNPJ('12345678901234')).toBe(false);
  });
});

describe('CPF/CNPJ validation', () => {
  test('should validate CPF or CNPJ', () => {
    expect(validateCPFCNPJ('111.444.777-35')).toBe(true);
    expect(validateCPFCNPJ('11.222.333/0001-81')).toBe(true);
  });

  test('should reject invalid formats', () => {
    expect(validateCPFCNPJ('invalid')).toBe(false);
    expect(validateCPFCNPJ('123')).toBe(false);
  });
});
