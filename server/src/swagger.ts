import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CRMT - Histórico Contábil & Financeiro',
      version: '1.0.0',
      description:
        'API Backend para reconstituição contábil, gestão financeira e integração com Open Finance',
      contact: {
        name: 'CRMT Support',
        email: 'support@crmt.local',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.crmt.app',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token returned from /api/auth/login',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API Key for legacy integration endpoints',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            erro: {
              type: 'string',
              description: 'Error message',
            },
            codigo: {
              type: 'string',
              description: 'Error code',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'User ID',
            },
            email: {
              type: 'string',
              description: 'User email',
            },
            nome: {
              type: 'string',
              description: 'User name',
            },
            papel: {
              type: 'string',
              enum: ['titular', 'contador', 'auditor'],
              description: 'User role',
            },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'JWT authentication token',
            },
            usuario: {
              $ref: '#/components/schemas/User',
            },
          },
        },
        DREResponse: {
          type: 'object',
          properties: {
            mes: {
              type: 'integer',
              description: 'Month (1-12)',
            },
            ano: {
              type: 'integer',
              description: 'Year',
            },
            receita_bruta: {
              type: 'number',
              description: 'Gross revenue',
            },
            deducoes: {
              type: 'number',
              description: 'Deductions',
            },
            receita_liquida: {
              type: 'number',
              description: 'Net revenue',
            },
            despesas_operacionais: {
              type: 'number',
              description: 'Operating expenses',
            },
            resultado_liquido: {
              type: 'number',
              description: 'Net result',
            },
          },
        },
        Pagamento: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Payment ID',
            },
            data: {
              type: 'string',
              format: 'date',
              description: 'Payment date',
            },
            valor: {
              type: 'number',
              description: 'Payment amount',
            },
            status: {
              type: 'string',
              enum: ['pendente', 'confirmado', 'falhou'],
              description: 'Payment status',
            },
            descricao: {
              type: 'string',
              description: 'Payment description',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [],
};

export const specs = swaggerJsdoc(options);
