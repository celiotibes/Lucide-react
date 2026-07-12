# Swagger/OpenAPI Documentation Setup

## Overview

The Legal Automation Platform now includes comprehensive OpenAPI 3.0.0 specification with interactive API documentation via ReDoc.

## Files

### Core Documentation
- **src/utils/swagger.ts**: OpenAPI specification configuration with 30+ endpoint definitions covering all major API routes
- **src/api/routes/swaggerRouter.ts**: Express router serving documentation and OpenAPI spec
- **src/index.ts**: Updated with swagger router registration at `/api-docs`

## Accessing API Documentation

### Interactive Documentation (ReDoc)
```
GET http://localhost:3000/api-docs
```
Browser-based, read-only API explorer with:
- Full endpoint documentation
- Request/response schemas
- Authentication details
- Code examples

### OpenAPI JSON Specification
```
GET http://localhost:3000/api-docs/openapi.json
```
Machine-readable spec for:
- IDE integrations
- Client code generation
- API testing tools
- Third-party service integration

### OpenAPI YAML Specification (Future)
```
GET http://localhost:3000/api-docs/openapi.yaml
```

## Endpoints Documented

### CRM (Client Relationship Management)
- `POST /api/v1/crm/clients` - Create client
- `GET /api/v1/crm/clients` - List all clients
- `GET /api/v1/crm/clients/{id}` - Get client details
- `PUT /api/v1/crm/clients/{id}` - Update client
- `DELETE /api/v1/crm/clients/{id}` - Delete client

### Contracts (Lifecycle Management)
- `POST /api/v1/contracts` - Create contract
- `GET /api/v1/contracts` - List contracts
- `GET /api/v1/contracts/{id}` - Get contract details
- `PUT /api/v1/contracts/{id}` - Update contract
- `DELETE /api/v1/contracts/{id}` - Delete contract
- `POST /api/v1/contracts/{id}/sign` - Sign contract digitally

### Financial (Billing & Payments)
- `POST /api/v1/financial/invoices` - Create invoice
- `GET /api/v1/financial/invoices` - List invoices
- `GET /api/v1/financial/invoices/{id}` - Get invoice details
- `PUT /api/v1/financial/invoices/{id}` - Update invoice
- `POST /api/v1/financial/invoices/{id}/pay` - Record payment

### Jurimetry (Analytics & Predictions)
- `GET /api/v1/jurimetria/cases` - List cases with analytics
- `GET /api/v1/jurimetria/analytics/court/{courtName}` - Get court analytics
- `GET /api/v1/jurimetria/predictions/{caseId}` - Predict case outcome

### Audit (Compliance & Logging)
- `GET /api/v1/audit/logs` - List audit logs
  - Query params: userId, action, entity, startDate, endDate
- `GET /api/v1/audit/logs/export` - Export as CSV

### Events (Webhooks & Pub/Sub)
- `POST /api/v1/events/webhooks` - Register webhook
- `GET /api/v1/events/webhooks` - List webhooks
- `DELETE /api/v1/events/webhooks/{id}` - Delete webhook

### Cache (Performance)
- `POST /api/v1/cache/clear` - Clear all cache
- `DELETE /api/v1/cache/keys/{pattern}` - Clear cache by pattern

### Health (System Monitoring)
- `GET /health` - Basic health check
- `GET /health/live` - Liveness probe (Kubernetes)
- `GET /health/ready` - Readiness probe (Kubernetes)
- `GET /health/metrics` - Prometheus-compatible metrics

## OpenAPI Specification Structure

```javascript
{
  openapi: '3.0.0',
  info: {
    title: 'Legal Automation Platform API',
    version: '1.0.0',
    contact: { ... },
    license: { ... }
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Development' },
    { url: 'https://api.example.com', description: 'Production' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    },
    schemas: {
      Client, Contract, Invoice, Case, Error
    }
  },
  paths: { /* 30+ endpoint definitions */ }
}
```

## Security

All endpoints (except health checks) require JWT bearer token:
```
Authorization: Bearer <JWT_TOKEN>
```

Health endpoints are publicly accessible:
- `/health`
- `/health/live`
- `/health/ready`
- `/health/metrics`

## Extending Documentation

To add a new endpoint to the OpenAPI spec:

1. **Add schema to components** (if new type)
```typescript
components: {
  schemas: {
    NewType: {
      type: 'object',
      properties: { ... }
    }
  }
}
```

2. **Add path definition**
```typescript
paths: {
  '/api/v1/resource/{id}': {
    get: {
      tags: ['Category'],
      summary: 'Description',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: {
          description: 'Success',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResponseType' }
            }
          }
        }
      }
    }
  }
}
```

## Integration with Tools

### Postman Import
1. Navigate to http://localhost:3000/api-docs/openapi.json
2. Copy the URL
3. In Postman: File → Import → Paste URL

### Code Generation
Generate client libraries using OpenAPI tools:
```bash
# Node.js client
openapi-generator-cli generate -i http://localhost:3000/api-docs/openapi.json \
  -g typescript-axios -o ./generated-client

# Python client
openapi-generator-cli generate -i http://localhost:3000/api-docs/openapi.json \
  -g python -o ./generated-client
```

### IDE IntelliSense
Most IDEs support OpenAPI specs for REST Client plugins:
- VSCode: REST Client extension can reference the spec
- IntelliJ: Built-in OpenAPI plugin

## Future Enhancements

- [ ] Add request/response examples for each endpoint
- [ ] Complete all 120+ endpoints documentation
- [ ] Add webhook event schemas
- [ ] Implement API key documentation
- [ ] Add rate limiting documentation
- [ ] Swagger UI with try-it-out functionality
- [ ] Generate OpenAPI YAML from TypeScript interfaces
- [ ] API versioning support (v2, v3, etc.)

## Monitoring API Usage

Track documentation access and API consumption:
```
GET /health/metrics
```

Prometheus metrics include:
- Request count per endpoint
- Error rates
- Latency percentiles
- Cache hit rates

## Compliance & Standards

- OpenAPI 3.0.0 specification compliant
- JWT authentication documented
- Error response schemas
- Audit trail for all state changes
- LGPD/GDPR compliance notes in security section

## Testing Documentation

Verify endpoints are accessible:
```bash
# Get OpenAPI spec
curl http://localhost:3000/api-docs/openapi.json

# View interactive documentation
open http://localhost:3000/api-docs
```

## Troubleshooting

### Documentation not loading
1. Check swagger router is mounted: `app.use('/api-docs', swaggerRouter)`
2. Verify swagger.ts is properly imported
3. Check browser console for errors

### Missing endpoints
1. Add path definition to `swaggerConfig.paths` in swagger.ts
2. Verify tag matches existing tags array
3. Test endpoint is accessible before documenting

### Security schemes not working
1. Ensure `securitySchemes` defines bearerAuth
2. Add `security: [{ bearerAuth: [] }]` to endpoints requiring auth
3. Verify JWT validation middleware is active
