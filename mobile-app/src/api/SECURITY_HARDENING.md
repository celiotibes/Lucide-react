# API Client Security Hardening - Phase 22.14

## Overview

The API client has been enhanced with comprehensive input/output validation and XSS/SQL injection prevention through DataValidationService integration. This document outlines the security features implemented.

## Features Implemented

### 1. Request Validation Middleware

The request interceptor validates and sanitizes all outgoing API requests:

```typescript
// Automatically invoked for all API calls
POST /api/documentos
{
  nome: "<script>alert('xss')</script>" // Will be sanitized
}
```

#### Request Processing:
1. **Suspicious Content Detection** - Checks for SQL keywords, script tags, event handlers
2. **Input Sanitization** - Removes dangerous characters and protocols
3. **Field Validation** - Validates specific field types (email, numeric, etc.)
4. **Error Handling** - Throws `ValidationError` for malicious content

#### Detected Patterns:
- `SQL_KEYWORDS`: SELECT, INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, EXEC, EXECUTE
- `SCRIPT_TAGS`: `<script>...</script>` tags
- `EVENT_HANDLERS`: onerror=, onclick=, onload=, onmouseover=, onchange=, onsubmit=, onfocus=
- `SCRIPT_PROTOCOL`: javascript: URLs
- `DANGEROUS_HTML`: iframes, objects, embeds, images with src

### 2. Response Validation Middleware

The response interceptor validates and sanitizes all incoming API responses:

```typescript
// Automatically invoked for all API responses
Response: {
  data: "<script>alert('xss')</script>" // Will be sanitized before use
}
```

#### Response Processing:
1. **Suspicious Content Detection** - Logs warnings if malicious content found
2. **Data Sanitization** - Removes any injected content
3. **Safe Passthrough** - Allows response to be used safely

### 3. Custom Error Classes

#### ValidationError
Thrown when request validation fails:

```typescript
throw new ValidationError(
  'Request contains potentially malicious content',
  'MALICIOUS_CONTENT_DETECTED',
  { violations: [...] }
)
```

#### SanitizationError
Thrown when sanitization encounters critical issues:

```typescript
throw new SanitizationError(
  'Failed to sanitize input',
  'SANITIZATION_ERROR',
  { field: 'email' }
)
```

### 4. Granular Logging

All validation attempts are logged with:
- Request/Response URL
- HTTP status (for responses)
- Timestamp
- Violation details (without exposing sensitive data)
- Request ID for tracing

Example log entries:
```
[INFO] [ApiClient] Request data validated and sanitized
  requestId: "a1b2c3d4e5"
  url: "/api/documentos"
  timestamp: "2024-10-08T03:15:30.000Z"

[WARN] [ApiClient] Suspicious patterns detected in request: 2 violations
  violations: [
    { path: "descricao", suspicious: [{ pattern: "SQL_KEYWORDS", matches: ["SELECT"] }] }
  ]

[ERROR] [ApiClient] Request blocked: contains potentially malicious content
  url: "/api/auth/login"
  violations: [...]
```

## API Client Methods

### Validation Methods

#### validateEmail(email: string)
```typescript
const result = apiClient.validateEmail('user@example.com');
if (result.valid) {
  // Proceed with request
} else {
  console.error(result.error);
}
```

#### validateNumeric(value: any, fieldName: string)
```typescript
const result = apiClient.validateNumeric('123.45', 'amount');
if (result.valid) {
  // Safe to use
} else {
  console.error(result.error);
}
```

#### validateString(value: string, fieldName: string)
```typescript
const result = apiClient.validateString(description, 'description');
if (!result.valid) {
  throw new Error(result.error);
}
```

### Sanitization Methods

#### sanitizeString(value: string)
```typescript
const safeText = apiClient.sanitizeString(userInput);
// Removes: <>, {}, "'`;, javascript:, event handlers
```

#### sanitizeHtml(html: string)
```typescript
const safeHtml = apiClient.sanitizeHtml(htmlContent);
// Escapes dangerous HTML entities
```

### Error Handling

#### getValidationErrorDetails(error: unknown)
```typescript
try {
  await apiClient.get('/api/endpoint', { data: maliciousData });
} catch (error) {
  const details = apiClient.getValidationErrorDetails(error);
  console.error(`${details.code}: ${details.message}`);
  if (details.details) {
    console.error('Violation details:', details.details);
  }
}
```

## Usage Examples

### Login Request (Email Validation)
```typescript
const loginData = {
  email: "user@example.com",
  password: "SecurePass123!"
};

// Validation happens automatically in request interceptor
const response = await apiClient.post('/api/auth/login', loginData);
```

### Document Upload with Numeric Validation
```typescript
const documentData = {
  nome: "Invoice-2024",
  valor: "1500.00", // String number - will be validated
  data_documento: new Date().toISOString(),
  descricao: "Monthly invoice"
};

// All fields are validated and sanitized
const response = await apiClient.post('/api/documentos', documentData);
```

### Blocked Request (Contains Script Tag)
```typescript
const maliciousData = {
  descricao: "<script>alert('xss')</script>"
};

try {
  await apiClient.post('/api/documentos', maliciousData);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Request blocked:', error.message);
    console.error('Code:', error.code); // MALICIOUS_CONTENT_DETECTED
  }
}
```

## Security Patterns and Rules

### Email Fields
- Must match email regex: `^[^\s@]+@[^\s@]+\.[^\s@]+$`
- Must not contain SQL injection patterns
- Examples: ✅ valid@example.com | ❌ test@ex'; DROP TABLE

### Numeric Fields
- Must be valid JavaScript numbers
- Must not be NaN or Infinity
- Field names: valor, value, amount, price, etc.
- Examples: ✅ 123 | ✅ 123.45 | ❌ NaN | ❌ Infinity

### String Fields
- Must not contain SQL keywords
- Must not contain script tags
- Must not contain event handlers
- Must not contain javascript: protocol
- Examples: ✅ normal text | ❌ SELECT * | ❌ onerror= | ❌ <script>

### Array Validation
- Each element is validated recursively
- Depth limit: 10 levels to prevent stack overflow
- Example:
  ```typescript
  {
    tags: ["tag1", "tag2"] // Each tag is sanitized
  }
  ```

## Performance Considerations

1. **Sanitization Depth Limit**: 10 levels maximum to prevent stack overflow
2. **Violation Reporting**: Only first 5 violations logged per request
3. **Response Validation**: Non-blocking - logs warnings but allows response
4. **Request Validation**: Blocking - rejects requests with critical violations
5. **Async Operations**: Validation is synchronous for performance

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Generic validation failure |
| MALICIOUS_CONTENT_DETECTED | 400 | SQL/XSS patterns detected |
| INVALID_EMAIL | 400 | Invalid email format |
| INVALID_NUMBER | 400 | Invalid numeric value |
| SANITIZATION_ERROR | 400 | Sanitization process failed |
| UNKNOWN_ERROR | 500 | Unexpected error |

## Interceptor Execution Order

### Request Flow:
1. **Interceptor 1**: Validation & Sanitization
   - Check for suspicious patterns
   - Sanitize input
   - Validate field types
   - Throw ValidationError if critical violations found

2. **Interceptor 2**: Authentication
   - Add auth token from AsyncStorage

3. **HTTP Request**: Sent to server

### Response Flow:
1. **Interceptor 1**: Validation & Sanitization
   - Check response for suspicious patterns
   - Sanitize response data
   - Log any violations

2. **Interceptor 2**: Token Refresh
   - Handle 401 Unauthorized
   - Refresh expired token if needed

3. **Return Response**: To caller

## Integration Points

### DataValidationService Methods Used:
- `sanitizeInput()` - Remove dangerous characters
- `preventSqlInjection()` - Detect SQL keywords
- `validateEmail()` - Email format validation
- `isSafeString()` - Comprehensive safety check

### Logger Methods Used:
- `logger.debug()` - Validation success
- `logger.warn()` - Suspicious patterns detected
- `logger.error()` - Validation failures and critical issues

## Testing

Run validation tests:
```bash
npm test -- src/api/__tests__/client-validation.test.ts
```

Test coverage includes:
- Email validation
- Numeric validation
- String validation
- Sanitization functions
- Error formatting
- HTML sanitization

## Migration Guide

### Existing Code
No changes required. The validation middleware works transparently:

```typescript
// This code remains unchanged
const response = await apiClient.post('/api/documentos', data);
```

### Handling Validation Errors
Add try-catch for validation errors:

```typescript
try {
  const response = await apiClient.post('/api/documentos', data);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid request:', error.message);
  } else if (axios.isAxiosError(error)) {
    console.error('API error:', error.response?.status);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Manual Validation
Use apiClient methods for client-side validation:

```typescript
// Validate before making request
const emailValidation = apiClient.validateEmail(userEmail);
if (!emailValidation.valid) {
  setEmailError(emailValidation.error);
  return;
}

// Sanitize user input
const safeName = apiClient.sanitizeString(userName);
```

## Security Recommendations

1. **Always validate on backend**: Client-side validation is first line of defense
2. **Use HTTPS**: Prevent man-in-the-middle attacks
3. **Monitor logs**: Watch for repeated validation failures
4. **Update patterns**: Add new suspicious patterns as threats evolve
5. **Test regularly**: Run security tests before each release

## Troubleshooting

### Request Blocked with ValidationError
- Check logs for violation details
- Review suspicious patterns detected
- Ensure input doesn't contain SQL keywords or script tags
- Use apiClient.sanitizeString() to clean input first

### Unexpected Response Data Issues
- Check warnings in logs
- Validate response structure on client
- Consider backend API changes
- Review sanitization results

### Performance Issues
- Monitor sanitization depth (warn at 10 levels)
- Check for large nested objects
- Consider pagination for large responses
- Review logging overhead

## Related Documentation
- DataValidationService: `/utils/security/dataValidationService.ts`
- Logger Service: `/utils/logger.ts`
- API Config: `/api/config.ts`
