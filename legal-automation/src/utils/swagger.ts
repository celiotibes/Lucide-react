// ============================================================================
// SWAGGER/OPENAPI DOCUMENTATION - API Contract & Developer Experience
// ============================================================================

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
          status: { type: 'string', enum: ['prospect', 'lead', 'qualified', 'customer', 'inactive'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Contract: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          clientId: { type: 'string' },
          templateId: { type: 'string' },
          title: { type: 'string' },
          status: {
            type: 'string',
            enum: ['draft', 'review', 'pending_signature', 'signed', 'executed', 'archived'],
          },
          version: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Invoice: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          clientId: { type: 'string' },
          amount: { type: 'number' },
          status: {
            type: 'string',
            enum: ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'archived'],
          },
          dueDate: { type: 'string', format: 'date' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Case: {
        type: 'object',
        properties: {
          caseId: { type: 'string' },
          clientId: { type: 'string' },
          caseType: { type: 'string' },
          status: { type: 'string' },
          outcome: {
            type: 'string',
            enum: ['pending', 'favorable', 'unfavorable', 'partial', 'dismissed', 'settled'],
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          code: { type: 'string' },
          message: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
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
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string' },
                  cpf: { type: 'string' },
                  caseTypes: { type: 'array', items: { type: 'string' } },
                },
                required: ['name', 'email'],
              },
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
              },
            },
          },
          400: { description: 'Invalid request' },
          401: { description: 'Unauthorized' },
        },
      },
      get: {
        tags: ['CRM'],
        summary: 'List all clients',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
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
                  },
                },
              },
            },
          },
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
