# Error Handling & Validation Guide

## Overview

The Legal Automation Platform implements comprehensive, standardized error handling across all API endpoints with:
- Consistent JSON error response format
- HTTP status codes with descriptive messages
- Request tracing for debugging
- Input validation for Brazilian legal documents
- Retry guidance for client implementations

## Error Response Format

All API errors follow this standardized JSON structure:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "CPF inválido",
  "details": {
    "field": "cpf",
    "value": "000.000.000-00",
    "reason": "CheckDigit validation failed"
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "traceId": "req-12345-abcde-fgh",
  "path": "/api/v1/crm/clients",
  "method": "POST"
}
```

### Error Response Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| statusCode | number | Yes | HTTP status code (400, 401, 403, 404, 409, 429, 500, 503) |
| code | string | Yes | Machine-readable error code (e.g., VALIDATION_ERROR) |
| message | string | Yes | Human-readable error message in Portuguese |
| details | object | No | Additional error context (validation errors, field info) |
| timestamp | string | Yes | ISO 8601 timestamp when error occurred |
| traceId | string | Yes | Request trace ID for debugging and request correlation |
| path | string | No | API endpoint path |
| method | string | No | HTTP method |

## HTTP Status Codes

### 400 - Bad Request (Validation Failed)

**When to use**: Input validation errors

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Email inválido",
  "details": {
    "field": "email",
    "value": "not-an-email",
    "reason": "Email format is invalid. Expected: user@domain.com"
  }
}
```

**Common causes**:
- CPF/CNPJ invalid checksum
- Email format invalid
- Phone number invalid format
- Missing required field
- Duplicate email or unique constraint violation
- Invalid enum value (status, case_type)

**Resolution**: Fix the data and retry

---

### 401 - Unauthorized (Authentication Failed)

**When to use**: Missing, invalid, or expired JWT token

```json
{
  "statusCode": 401,
  "code": "AUTHENTICATION_ERROR",
  "message": "Token de autenticação inválido ou expirado",
  "details": {
    "reason": "JWT token has expired. Please refresh your token."
  }
}
```

**Common causes**:
- Missing Authorization header
- Token JWT inválido
- Token JWT expirado
- Malformed Bearer token
- Wrong token signing key

**Resolution**: 
1. Refresh your token via POST /api/v1/auth/refresh
2. Or login again via POST /api/v1/auth/login

---

### 403 - Forbidden (Insufficient Permissions)

**When to use**: User authenticated but lacks required scopes

```json
{
  "statusCode": 403,
  "code": "AUTHORIZATION_ERROR",
  "message": "Permissão insuficiente para acessar este recurso",
  "details": {
    "required_permission": "client.delete",
    "user_permissions": ["client.read", "case.read"]
  }
}
```

**Common causes**:
- User lacks "client.write" scope to create clients
- User lacks "case.delete" scope to delete cases
- User trying to access data of another organization
- Role is read-only

**Resolution**: Request elevated permissions from administrator

---

### 404 - Not Found

**When to use**: Requested resource does not exist in database

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND",
  "message": "Cliente não encontrado: client-999",
  "details": {
    "resource_type": "Client",
    "resource_id": "client-999"
  }
}
```

**Common causes**:
- Invalid resource ID
- Resource was deleted
- Wrong endpoint path
- Typo in URL

**Resolution**: Verify the resource ID and retry with correct ID

---

### 409 - Conflict (Data Integrity Violation)

**When to use**: Unique constraint violation or conflicting update

```json
{
  "statusCode": 409,
  "code": "CONFLICT",
  "message": "Email já existe no banco de dados",
  "details": {
    "reason": "Email already exists in database",
    "existing_resource_id": "client-001"
  }
}
```

**Common causes**:
- Email already exists
- Case number already registered
- Invoice number already used
- Concurrent update (outdated version)
- Foreign key constraint violation

**Resolution**: Modify data to avoid conflict or update existing resource instead

---

### 429 - Too Many Requests (Rate Limited)

**When to use**: Request rate limit exceeded

```json
{
  "statusCode": 429,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Limite de requisições excedido",
  "details": {
    "limit": 100,
    "remaining": 0,
    "reset_at": "2024-01-15T11:30:00Z"
  }
}
```

**Response Headers**:
```
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705419000
```

**Rate Limits**:
- Per minute: 100 requests per IP
- Per hour: 1000 requests per IP  
- Per day: 10000 requests per IP

**Resolution**: Wait before retrying. Respect the `Retry-After` header

---

### 500 - Internal Server Error

**When to use**: Unexpected server error

```json
{
  "statusCode": 500,
  "code": "INTERNAL_ERROR",
  "message": "Erro interno do servidor",
  "details": {
    "reason": "An unexpected error occurred"
  }
}
```

**Common causes**:
- Bug in application code
- Unhandled exception
- Null pointer exception
- Database query error

**Resolution**: 
1. Retry after 30-60 seconds (exponential backoff)
2. Contact support with the traceId if problem persists

---

### 503 - Service Unavailable

**When to use**: Database connection or external service down

```json
{
  "statusCode": 503,
  "code": "SERVICE_UNAVAILABLE",
  "message": "Banco de dados indisponível",
  "details": {
    "service": "PostgreSQL",
    "reason": "Connection pool exhausted"
  }
}
```

**Common causes**:
- PostgreSQL offline or restarting
- All database connections in use
- Scheduled maintenance
- Network connectivity issue with database

**Resolution**: Retry after 30-60 seconds. Contact ops if persistent

---

## Input Validation

All inputs are validated using dedicated validator classes:

### CPF Validation

**Format**: `XXX.XXX.XXX-XX` or `XXXXXXXXXXX` (11 digits)

**Validation**: Checksum using módulo 11 algorithm

```typescript
import { CPFValidator } from '@utils/validators';

// Validate
CPFValidator.validate('123.456.789-01'); // true or false

// Throw error if invalid
CPFValidator.throwIfInvalid('000.000.000-00', 'CPF');
// Throws: ValidationError with field 'cpf', value, and reason
```

**Valid Examples**:
- `123.456.789-01`
- `12345678901`

**Invalid Examples**:
- `000.000.000-00` (all zeros)
- `111.111.111-11` (all same digit)
- `123.456.789-00` (wrong checksum)

---

### CNPJ Validation

**Format**: `XX.XXX.XXX/XXXX-XX` or `XXXXXXXXXXXXXX` (14 digits)

**Validation**: Checksum using módulo 11 algorithm

```typescript
import { CNPJValidator } from '@utils/validators';

// Validate
CNPJValidator.validate('12.345.678/0001-90'); // true or false

// Throw error if invalid
CNPJValidator.throwIfInvalid('12.345.678/0001-90', 'CNPJ');
```

**Valid Examples**:
- `12.345.678/0001-90`
- `12345678000190`

---

### Email Validation

**Format**: RFC 5321 compliant email

```typescript
import { EmailValidator } from '@utils/validators';

// Validate
EmailValidator.validate('user@example.com'); // true

// Throw error if invalid
EmailValidator.throwIfInvalid('invalid-email', 'email');
```

---

### Phone Validation

**Format**: Brazilian phone (10-11 digits with optional DDD)

```typescript
import { PhoneValidator } from '@utils/validators';

// Validate
PhoneValidator.validate('11987654321'); // true

// Format
PhoneValidator.format('11987654321'); // (11) 98765-4321
```

---

### Case Number Validation

**Format**: CNJ Standard - `NNNNNNN-DD.AAAA.J.TT.OOOO`

**Example**: `0001234-56.2024.1.02.3500`

```typescript
import { CaseNumberValidator } from '@utils/validators';

// Validate
CaseNumberValidator.validate('0001234-56.2024.1.02.3500'); // true

// Throw error if invalid
CaseNumberValidator.throwIfInvalid('invalid-number', 'case_number');
```

---

### Date Validation

**Format**: ISO 8601 - `YYYY-MM-DD`

```typescript
import { DateValidator } from '@utils/validators';

// Validate
DateValidator.validate('2024-01-15'); // true

// Throw error if invalid
DateValidator.throwIfInvalid('15/01/2024', 'filing_date');
```

---

## Error Handling in Route Handlers

### Using asyncHandler

Wrap async route handlers to automatically catch errors:

```typescript
import { asyncHandler } from '@middlewares/errorHandler';

router.post('/clients', asyncHandler(async (req, res) => {
  // Validate input
  validateClientInput(req.body);

  // Create client
  const client = await clientRepository.create(req.body);

  res.status(201).json(client);
}));
```

### Throwing Validation Errors

```typescript
import { ValidationError } from '@utils/errors';

router.post('/clients', asyncHandler(async (req, res) => {
  // Validate email
  EmailValidator.throwIfInvalid(req.body.email);

  // Validate CPF
  CPFValidator.throwIfInvalid(req.body.cpf);

  // If validation passes, continue...
  const client = await clientRepository.create(req.body);
  res.status(201).json(client);
}));
```

### Throwing Other Errors

```typescript
import { NotFoundError, ConflictError, AuthorizationError } from '@utils/errors';

// Resource not found
throw new NotFoundError('Client', 'client-999');

// Conflict/duplicate
throw new ConflictError('Email já existe no banco', {
  existing_resource_id: 'client-001'
});

// Authorization error
throw new AuthorizationError('Você não tem permissão para deletar este cliente');
```

---

## Request Tracing

Every request gets a unique trace ID for debugging:

### Automatic Tracing

The middleware automatically:
1. Generates or retrieves trace ID
2. Attaches to request headers
3. Includes in error responses
4. Adds to logs

### Using Trace ID in Logs

```typescript
import { getTraceId, getRequestContext } from '@utils/tracing';

router.post('/clients', asyncHandler(async (req, res) => {
  const traceId = getTraceId(req);
  logger.info({ traceId }, 'Creating new client');

  // ... create client ...

  logger.info({ traceId }, 'Client created successfully');
  res.status(201).json(client);
}));
```

### Tracing Across Services

When calling external services, propagate the trace ID:

```typescript
// Propagate trace ID to downstream service
const response = await fetch('http://downstream-service/api/data', {
  headers: {
    'X-Trace-ID': getTraceId(req)
  }
});
```

---

## Client-Side Error Handling

### Retry Logic with Exponential Backoff

```javascript
async function apiCallWithRetry(url, options, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.json();

        // Retryable errors
        if ([401, 429, 500, 503].includes(response.status)) {
          // For 401, refresh token first
          if (response.status === 401) {
            await refreshToken();
            continue;
          }

          // For rate limit, respect Retry-After
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || 60;
            await delay(retryAfter * 1000);
            continue;
          }

          // For server errors, exponential backoff
          const backoffMs = Math.pow(2, attempt) * 1000;
          await delay(backoffMs);
          continue;
        }

        // Non-retryable errors
        throw error;
      }

      return response.json();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const backoffMs = Math.pow(2, attempt) * 1000;
      await delay(backoffMs);
    }
  }
}
```

### React Hook for Error Handling

```typescript
import { useEffect, useState } from 'react';

function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        const response = await fetch(url);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message);
        }

        const data = await response.json();
        
        if (mounted) {
          setData(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err);
          setData(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [url]);

  return { data, error, loading };
}
```

---

## Debugging with Trace ID

When troubleshooting issues:

1. **Check response headers** for X-Trace-ID
2. **Search server logs** for the trace ID
3. **Correlate log entries** using the same trace ID
4. **Follow request flow** through all services

### Example Log Search

```bash
# Search logs for trace ID
grep "req-12345-abcde-fgh" /var/log/legal-automation.log

# Output shows all operations for that request:
# 10:30:00 [req-12345-abcde-fgh] POST /api/v1/crm/clients
# 10:30:01 [req-12345-abcde-fgh] Validating client input
# 10:30:02 [req-12345-abcde-fgh] Creating database transaction
# 10:30:03 [req-12345-abcde-fgh] INSERT INTO crm_clients
# 10:30:04 [req-12345-abcde-fgh] Publishing CLIENT_CREATED event
# 10:30:05 [req-12345-abcde-fgh] Response sent (201)
```

---

## Best Practices

### For API Developers

1. **Always validate input** using provided validators
2. **Throw appropriate errors** (ValidationError, NotFoundError, etc.)
3. **Use asyncHandler** for async route handlers
4. **Include details** in error context for debugging
5. **Test error paths** not just happy paths

### For Client Developers

1. **Check status code** before processing response
2. **Log traceId** from error responses for support
3. **Implement exponential backoff** for retries
4. **Respect rate limit headers** (X-RateLimit-*, Retry-After)
5. **Handle 401** by refreshing token automatically
6. **Never retry** non-retryable errors (400, 403, 404, 409)

### For Operations

1. **Monitor 5xx errors** closely (500, 503)
2. **Check logs** using traceId from error reports
3. **Set up alerts** for error rate thresholds
4. **Track rate limiting** to identify API abuse
5. **Monitor 401s** for potential authentication issues

---

## Summary

The error handling system provides:

✅ **Consistent format** across all endpoints
✅ **Detailed information** for debugging
✅ **Request tracing** for correlation
✅ **Input validation** for Brazilian legal docs
✅ **Clear HTTP status codes** with guidance
✅ **Rate limiting** with retry information
✅ **Retry strategies** for resilience

By following this guide, both API developers and clients can build robust error handling that integrates seamlessly with the platform.
