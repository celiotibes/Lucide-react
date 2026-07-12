// ============================================================================
// SWAGGER/OPENAPI DOCUMENTATION - API Contract & Developer Experience
// ============================================================================

import { swaggerExamples, httpErrorCodes, rateLimitingConfig, authenticationRequirements, validationRules } from './swagger-examples';

export const swaggerConfig = {
  openapi: '3.0.0',
  info: {
    title: 'Legal Automation Platform API',
    description: 'Comprehensive legal firm management system with AI-powered analytics',
    version: '1.0.0',
    contact: {
      name: 'Development Team',
      email: 'dev@example.com',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
    {
      url: 'https://api.example.com',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Client: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          cpf: { type: 'string' },
          status: { type: 'string', enum: ['prospect', 'lead', 'customer', 'inactive'] },
          case_types: { type: 'array', items: { type: 'string' } },
          city: { type: 'string' },
          state: { type: 'string' },
          industry: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        example: swaggerExamples.clientCreate.response,
      },
      Contract: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          client_id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          content: { type: 'string' },
          status: {
            type: 'string',
            enum: ['draft', 'review', 'pending_signature', 'signed', 'executed', 'archived'],
          },
          version: { type: 'integer' },
          signature_required: { type: 'boolean' },
          signed_at: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        example: swaggerExamples.contractCreate.response,
      },
      Invoice: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          invoice_number: { type: 'string' },
          client_id: { type: 'string' },
          case_id: { type: 'string' },
          amount: { type: 'number' },
          amount_paid: { type: 'number' },
          currency: { type: 'string' },
          status: {
            type: 'string',
            enum: ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'archived'],
          },
          due_date: { type: 'string', format: 'date' },
          issued_date: { type: 'string', format: 'date' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        example: swaggerExamples.invoiceCreate.response,
      },
      Case: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          case_number: { type: 'string' },
          client_id: { type: 'string' },
          case_type: { type: 'string' },
          court_name: { type: 'string' },
          status: { type: 'string' },
          outcome: {
            type: 'string',
            enum: ['pending', 'favorable', 'unfavorable', 'partial', 'dismissed', 'settled'],
          },
          amount_claimed: { type: 'number' },
          amount_awarded: { type: 'number' },
          success_rate: { type: 'number', format: 'double' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        example: swaggerExamples.caseCreate.response,
      },
      Error: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          code: { type: 'string' },
          message: { type: 'string' },
          details: { type: 'object' },
          timestamp: { type: 'string', format: 'date-time' },
          traceId: { type: 'string' },
        },
        example: swaggerExamples.errorValidation,
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
  tags: [
    { name: 'CRM', description: 'Client relationship management' },
    { name: 'Contracts', description: 'Contract lifecycle management' },
    { name: 'Financial', description: 'Financial management and billing' },
    { name: 'Jurimetry', description: 'Legal analytics and predictions' },
    { name: 'Audit', description: 'Audit trail and compliance' },
    { name: 'Events', description: 'Event management and webhooks' },
    { name: 'Health', description: 'System health and monitoring' },
  ],
  paths: {
    '/api/v1/crm/clients': {
      post: {
        tags: ['CRM'],
        summary: 'Create a new client',
        description: 'Create a new client in the CRM system. Email must be unique and valid.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email', description: 'Unique email address' },
                  phone: { type: 'string' },
                  cpf: { type: 'string', description: validationRules.cpf.description },
                  status: { type: 'string', enum: ['prospect', 'lead', 'customer', 'inactive'] },
                  case_types: { type: 'array', items: { type: 'string' } },
                  city: { type: 'string' },
                  state: { type: 'string' },
                  industry: { type: 'string' },
                },
                required: ['name', 'email'],
              },
              example: swaggerExamples.clientCreate.request,
            },
          },
        },
        responses: {
          201: {
            description: 'Client created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    statusCode: { type: 'integer' },
                    data: { $ref: '#/components/schemas/Client' },
                    message: { type: 'string' },
                  },
                },
                example: {
                  statusCode: 201,
                  data: swaggerExamples.clientCreate.response,
                  message: 'Client created successfully',
                },
              },
            },
          },
          400: { description: httpErrorCodes['400'].description },
          401: { description: httpErrorCodes['401'].description },
          409: { description: httpErrorCodes['409'].description },
        },
      },
      get: {
        tags: ['CRM'],
        summary: 'List all clients',
        description: 'Retrieve a paginated list of clients, optionally filtered by status.',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['prospect', 'lead', 'customer', 'inactive'] }, description: 'Filter by client status' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 }, description: 'Maximum number of results' },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 }, description: 'Number of results to skip' },
        ],
        responses: {
          200: {
            description: 'List of clients',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    statusCode: { type: 'integer' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Client' } },
                    total: { type: 'integer' },
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                  },
                },
                example: swaggerExamples.clientList.response,
              },
            },
          },
          401: { description: httpErrorCodes['401'].description },
          429: { description: httpErrorCodes['429'].description },
        },
      },
    },
    '/api/v1/crm/clients/{id}': {
      get: {
        tags: ['CRM'],
        summary: 'Get client details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Client details',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Client' } } },
          },
          404: { description: 'Client not found' },
        },
      },
      put: {
        tags: ['CRM'],
        summary: 'Update client',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' }, status: { type: 'string' } } },
            },
          },
        },
        responses: { 200: { description: 'Client updated' }, 404: { description: 'Client not found' } },
      },
      delete: {
        tags: ['CRM'],
        summary: 'Delete client',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'Client deleted' }, 404: { description: 'Client not found' } },
      },
    },
    '/api/v1/contracts': {
      post: {
        tags: ['Contracts'],
        summary: 'Create contract',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  clientId: { type: 'string' },
                  templateId: { type: 'string' },
                  title: { type: 'string' },
                  content: { type: 'string' },
                },
                required: ['clientId', 'title'],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Contract created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Contract' } } },
          },
        },
      },
      get: {
        tags: ['Contracts'],
        summary: 'List contracts',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'clientId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'List of contracts',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    statusCode: { type: 'integer' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Contract' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/contracts/{id}': {
      get: {
        tags: ['Contracts'],
        summary: 'Get contract details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Contract details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Contract' } } } } },
      },
      put: {
        tags: ['Contracts'],
        summary: 'Update contract',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Contract updated' } },
      },
      delete: {
        tags: ['Contracts'],
        summary: 'Delete contract',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'Contract deleted' } },
      },
    },
    '/api/v1/contracts/{id}/sign': {
      post: {
        tags: ['Contracts'],
        summary: 'Sign contract digitally',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { signerEmail: { type: 'string' } } } } } },
        responses: { 200: { description: 'Contract signed' } },
      },
    },
    '/api/v1/financial/invoices': {
      post: {
        tags: ['Financial'],
        summary: 'Create invoice',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  clientId: { type: 'string' },
                  amount: { type: 'number' },
                  dueDate: { type: 'string', format: 'date' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Invoice created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } },
          },
        },
      },
      get: {
        tags: ['Financial'],
        summary: 'List invoices',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'clientId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'List of invoices',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { statusCode: { type: 'integer' }, data: { type: 'array', items: { $ref: '#/components/schemas/Invoice' } } } },
              },
            },
          },
        },
      },
    },
    '/api/v1/financial/invoices/{id}': {
      get: {
        tags: ['Financial'],
        summary: 'Get invoice details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Invoice details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } } } },
      },
      put: {
        tags: ['Financial'],
        summary: 'Update invoice',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Invoice updated' } },
      },
    },
    '/api/v1/financial/invoices/{id}/pay': {
      post: {
        tags: ['Financial'],
        summary: 'Record payment',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { amount: { type: 'number' }, method: { type: 'string' } } } } } },
        responses: { 200: { description: 'Payment recorded' } },
      },
    },
    '/api/v1/jurimetria/cases': {
      get: {
        tags: ['Jurimetry'],
        summary: 'List cases with analytics',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'caseType', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'List of cases',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { statusCode: { type: 'integer' }, data: { type: 'array', items: { $ref: '#/components/schemas/Case' } } } },
              },
            },
          },
        },
      },
    },
    '/api/v1/jurimetria/analytics/court/{courtName}': {
      get: {
        tags: ['Jurimetry'],
        summary: 'Get court analytics',
        parameters: [{ name: 'courtName', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Court analytics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    court: { type: 'string' },
                    totalCases: { type: 'integer' },
                    successRate: { type: 'number' },
                    avgDuration: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/jurimetria/predictions/{caseId}': {
      get: {
        tags: ['Jurimetry'],
        summary: 'Predict case outcome',
        parameters: [{ name: 'caseId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Prediction results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    predictedOutcome: { type: 'string' },
                    confidence: { type: 'number' },
                    factors: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/audit/logs': {
      get: {
        tags: ['Audit'],
        summary: 'List audit logs',
        parameters: [
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'entity', in: 'query', schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: {
            description: 'Audit logs',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    statusCode: { type: 'integer' },
                    data: { type: 'array', items: { type: 'object' } },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/audit/logs/export': {
      get: {
        tags: ['Audit'],
        summary: 'Export audit logs as CSV',
        parameters: [{ name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } }],
        responses: {
          200: { description: 'CSV file', headers: { 'Content-Type': { schema: { type: 'string' } } } },
        },
      },
    },
    '/api/v1/events/webhooks': {
      post: {
        tags: ['Events'],
        summary: 'Register webhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  url: { type: 'string', format: 'uri' },
                  eventTypes: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Webhook registered' } },
      },
      get: {
        tags: ['Events'],
        summary: 'List webhooks',
        responses: { 200: { description: 'List of webhooks' } },
      },
    },
    '/api/v1/events/webhooks/{id}': {
      delete: {
        tags: ['Events'],
        summary: 'Delete webhook',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'Webhook deleted' } },
      },
    },
    '/api/v1/cache/clear': {
      post: {
        tags: ['Cache'],
        summary: 'Clear all cache',
        responses: { 200: { description: 'Cache cleared' } },
      },
    },
    '/api/v1/cache/keys/{pattern}': {
      delete: {
        tags: ['Cache'],
        summary: 'Clear cache by pattern',
        parameters: [{ name: 'pattern', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Cache entries deleted' } },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        security: [],
        responses: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' } } },
              },
            },
          },
        },
      },
    },
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        security: [],
        responses: {
          200: {
            description: 'Service is alive',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' },
                    uptime: { type: 'number' },
                  },
                },
              },
            },
          },
          503: { description: 'Service unavailable' },
        },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe',
        security: [],
        responses: {
          200: { description: 'Service is ready' },
          503: { description: 'Service not ready' },
        },
      },
    },
    '/health/metrics': {
      get: {
        tags: ['Health'],
        summary: 'Prometheus metrics',
        security: [],
        responses: { 200: { description: 'Metrics in Prometheus format' } },
      },
    },
  },
};

/**
 * Export comprehensive documentation for developers
 */
export const swaggerDocumentation = {
  errorCodes: httpErrorCodes,
  rateLimiting: rateLimitingConfig,
  authentication: authenticationRequirements,
  validation: validationRules,
  examples: swaggerExamples,
};

/**
 * Error Handling Guide
 * All API endpoints return standardized error responses with these HTTP status codes
 */
export const errorHandlingGuide = {
  description: 'Comprehensive guide for handling API errors',

  statusCodeReference: {
    400: {
      title: 'Bad Request - Validation Failed',
      usage: 'Input validation error (invalid CPF, email format, missing field)',
      retryable: false,
      clientAction: 'Fix the data and retry'
    },
    401: {
      title: 'Unauthorized - Authentication Failed',
      usage: 'Missing, invalid, or expired JWT token',
      retryable: true,
      clientAction: 'Refresh token or login again'
    },
    403: {
      title: 'Forbidden - Insufficient Permissions',
      usage: 'User lacks required scopes for this operation',
      retryable: false,
      clientAction: 'Request elevated permissions from admin'
    },
    404: {
      title: 'Not Found - Resource Does Not Exist',
      usage: 'Requested resource not found in database',
      retryable: false,
      clientAction: 'Verify resource ID exists'
    },
    409: {
      title: 'Conflict - Data Integrity Violation',
      usage: 'Duplicate email, constraint violation, or concurrent update',
      retryable: false,
      clientAction: 'Modify data to resolve conflict'
    },
    429: {
      title: 'Too Many Requests - Rate Limited',
      usage: 'Exceeded requests per minute/hour limit',
      retryable: true,
      clientAction: 'Wait before retrying (see Retry-After header)'
    },
    500: {
      title: 'Internal Server Error',
      usage: 'Unexpected server error',
      retryable: true,
      clientAction: 'Retry after delay or contact support'
    },
    503: {
      title: 'Service Unavailable - Database Down',
      usage: 'PostgreSQL connection pool exhausted or database offline',
      retryable: true,
      clientAction: 'Retry after delay; contact ops if persistent'
    }
  },

  commonErrors: {
    invalidEmail: {
      code: 400,
      scenario: 'POST /api/v1/crm/clients with email: "invalid-email"',
      response: swaggerExamples.errorValidation,
      fix: 'Use valid email format: user@domain.com'
    },
    duplicateEmail: {
      code: 409,
      scenario: 'POST /api/v1/crm/clients with existing email',
      response: swaggerExamples.errorConflict,
      fix: 'Check if client already exists before creating'
    },
    expiredToken: {
      code: 401,
      scenario: 'Any request with expired JWT in Authorization header',
      response: swaggerExamples.errorAuth,
      fix: 'Call POST /auth/refresh to get new token'
    },
    insufficientPermission: {
      code: 403,
      scenario: 'DELETE /api/v1/crm/clients/:id without admin role',
      response: swaggerExamples.errorForbidden,
      fix: 'Request admin to grant "client.delete" scope'
    },
    rateLimitExceeded: {
      code: 429,
      scenario: 'More than 100 requests per minute from same IP',
      response: swaggerExamples.errorRateLimit,
      fix: 'Wait X-RateLimit-Reset seconds before retrying'
    },
    databaseUnavailable: {
      code: 503,
      scenario: 'PostgreSQL connection pool saturated',
      response: swaggerExamples.errorServiceUnavailable,
      fix: 'Retry after 30-60 seconds (exponential backoff)'
    }
  },

  retryStrategy: {
    description: 'Recommended retry logic for client implementations',
    retryableStatusCodes: [401, 429, 500, 503],
    backoffAlgorithm: 'Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 5 retries)',
    clientExample: `
      async function apiCallWithRetry(url, options, maxRetries = 5) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const response = await fetch(url, options);

            if (!response.ok) {
              // Only retry on specific status codes
              if (![401, 429, 500, 503].includes(response.status)) {
                throw new Error(\`HTTP \${response.status}\`);
              }

              // For 401, refresh token first
              if (response.status === 401) {
                await refreshToken();
                continue;
              }

              // For rate limit, respect Retry-After header
              if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After') || 60;
                await delay(retryAfter * 1000);
                continue;
              }

              // For server errors, use exponential backoff
              const backoffMs = Math.pow(2, attempt) * 1000;
              await delay(backoffMs);
              continue;
            }

            return response.json();
          } catch (error) {
            if (attempt === maxRetries - 1) throw error;
            const backoffMs = Math.pow(2, attempt) * 1000;
            await delay(backoffMs);
          }
        }
      }
    `
  }
};
