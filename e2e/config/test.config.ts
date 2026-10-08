/**
 * Test Configuration for E2E Security Testing
 * Defines timeouts, retries, mock data, and security test parameters
 */

export interface TestConfig {
  // Timeouts
  timeouts: {
    action: number;
    element: number;
    network: number;
    navigation: number;
    security: number;
    biometric: number;
  };

  // Retry configuration
  retries: {
    action: number;
    network: number;
    delay: number;
  };

  // Element interaction settings
  interaction: {
    minVisible: number;
    multiTouch: boolean;
    useNative: boolean;
  };

  // Test artifacts configuration
  artifacts: {
    directory: string;
    screenshots: {
      enabled: boolean;
      onFailure: boolean;
      onError: boolean;
    };
    videos: {
      enabled: boolean;
      onFailure: boolean;
    };
    logs: {
      enabled: boolean;
      level: 'debug' | 'info' | 'warn' | 'error';
    };
  };

  // Device settings
  device: {
    orientation: 'portrait' | 'landscape';
    allowStatusBar: boolean;
    darkMode: boolean;
  };

  // Test environment configuration
  environment: {
    apiEndpoint: string;
    mockMode: boolean;
    testUser: {
      email: string;
      password: string;
      cpf: string;
    };
    testUser2: {
      email: string;
      password: string;
      cpf: string;
    };
  };

  // Security test settings
  security: {
    // Encryption test key
    encryptionTestKey: string;
    // API endpoint for security headers testing
    securityEndpoint: string;
    // Certificate pinning test domain
    pinnedDomain: string;
    // XSS test payload
    xssTestPayload: string;
    // SQL injection test payload
    sqlInjectionPayload: string;
  };

  // Privacy/GDPR settings
  privacy: {
    // Data retention days
    dataRetentionDays: number;
    // GDPR compliance check endpoint
    gdprCheckEndpoint: string;
  };

  // Performance thresholds
  performance: {
    maxRenderTime: number;
    maxActionTime: number;
    maxNetworkLatency: number;
    maxLoginTime: number;
  };
}

export const testConfig: TestConfig = {
  timeouts: {
    action: 5000,
    element: 10000,
    network: 15000,
    navigation: 8000,
    security: 20000,
    biometric: 30000,
  },

  retries: {
    action: 3,
    network: 2,
    delay: 500,
  },

  interaction: {
    minVisible: 75,
    multiTouch: true,
    useNative: true,
  },

  artifacts: {
    directory: './artifacts/e2e',
    screenshots: {
      enabled: true,
      onFailure: true,
      onError: true,
    },
    videos: {
      enabled: true,
      onFailure: true,
    },
    logs: {
      enabled: true,
      level: 'info',
    },
  },

  device: {
    orientation: 'portrait',
    allowStatusBar: true,
    darkMode: false,
  },

  environment: {
    apiEndpoint: process.env.API_ENDPOINT || 'http://localhost:3000',
    mockMode: process.env.MOCK_MODE !== 'false' && process.env.MOCK_MODE !== 'false',
    testUser: {
      email: process.env.TEST_USER_EMAIL || 'test@example.com',
      password: process.env.TEST_USER_PASSWORD || 'SecurePass123!@#',
      cpf: process.env.TEST_USER_CPF || '12345678901',
    },
    testUser2: {
      email: process.env.TEST_USER2_EMAIL || 'test2@example.com',
      password: process.env.TEST_USER2_PASSWORD || 'SecurePass456!@#',
      cpf: process.env.TEST_USER2_CPF || '98765432101',
    },
  },

  security: {
    encryptionTestKey: 'test-encryption-key-32-chars-here',
    securityEndpoint: process.env.SECURITY_ENDPOINT || 'https://api.example.com/security',
    pinnedDomain: process.env.PINNED_DOMAIN || 'api.example.com',
    xssTestPayload: '<script>alert("XSS")</script>',
    sqlInjectionPayload: "' OR '1'='1",
  },

  privacy: {
    dataRetentionDays: 30,
    gdprCheckEndpoint: process.env.GDPR_ENDPOINT || 'http://localhost:3000/api/gdpr',
  },

  performance: {
    maxRenderTime: 3000,
    maxActionTime: 2000,
    maxNetworkLatency: 5000,
    maxLoginTime: 10000,
  },
};

export default testConfig;
