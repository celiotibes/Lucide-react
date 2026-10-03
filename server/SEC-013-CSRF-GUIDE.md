# SEC-013: CSRF Protection Implementation Guide

## Overview

Cross-Site Request Forgery (CSRF) protection has been implemented using the `csurf` middleware with session-based tokens. This prevents attackers from making unauthorized requests on behalf of authenticated users.

## Architecture

### How It Works

1. **Session Management**: Express sessions store a unique token for each user session
2. **Token Generation**: The csurf middleware generates a CSRF token tied to the session
3. **Token Delivery**: The token is returned in the `XSRF-TOKEN` header on every response
4. **Token Validation**: POST/PUT/DELETE requests must include the token in the `X-CSRF-Token` header
5. **Token Regeneration**: Tokens are regenerated after each use for additional security

### Request Flow

```
Client                           Server
  |                               |
  |-- GET /api/form ----------->  |
  |                         (create session + token)
  |<-- XSRF-TOKEN header ---------|
  |                               |
  |-- POST /api/submit ---------->|
  |    X-CSRF-Token: token123     | (validate token)
  |    Body: form data            |
  |<-- 200 OK ------------------- |
```

## Configuration

### Environment Variables

Add to `.env`:

```bash
SESSION_SECRET=your-very-long-random-secret-at-least-32-chars
```

If not set in production, a warning is logged and the system falls back to a default (insecure) secret.

### Middleware Setup

The CSRF protection is configured in `server/src/index.ts`:

```typescript
// Session middleware (required for session-based tokens)
app.use(criarMiddlewareSession(sessionSecret));

// CSRF protection middleware
app.use(criarMiddlewareCSRF());

// Middleware to add token to responses
app.use(adicionarTokenCSRFAoResponse);

// ... routes ...

// CSRF error handler (catches invalid tokens)
app.use(erroCSRF);
```

## Usage in Routes

### Client-Side: Getting and Sending the Token

```javascript
// 1. Get the token from a GET request
const response = await fetch('/api/my-form');
const token = response.headers.get('XSRF-Token');

// 2. Include token in POST/PUT/DELETE requests
const submitResponse = await fetch('/api/my-form', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ data: 'value' })
});
```

### Server-Side: Protected Routes

Routes are protected automatically once the middleware is applied. No additional code is needed:

```typescript
// This route is automatically protected by CSRF
app.post('/api/asaas/cobrancas', criarMiddlewareAutenticacao, async (req, res) => {
  // Token is validated automatically before this handler runs
  // If invalid, a 403 response is sent
  // If valid, continue processing
  res.json({ success: true });
});
```

## Protected Routes

The following routes are automatically protected:

### Asaas Integration
- `POST /api/asaas/cobrancas` - Create charge/invoice
- `PUT /api/asaas/cobrancas/:id` - Update charge
- `DELETE /api/asaas/cobrancas/:id` - Delete charge
- `POST /api/asaas/pagamentos-pix/criar` - Create PIX payment

### Anomalies & Analytics
- `POST /api/anomalias/analisar/:transacaoId` - Analyze anomaly
- `PATCH /api/anomalias/alertas/:id/revisar` - Mark alert as reviewed

### Other State-Changing Routes
- `POST /api/notificacoes` - Send notifications
- `POST /api/backup/agora` - Trigger backup
- `POST /api/relatorios/executivo/gerar` - Generate report
- Any other `POST`, `PUT`, `DELETE` route

## Exemptions (Webhook Routes)

The following routes are **not** protected by CSRF because they are webhooks called by external services without user sessions:

- `POST /api/webhooks/pluggy?key=...` - Pluggy webhook
- `POST /api/asaas/webhooks/asaas` - Asaas webhook
- `POST /api/telegram/webhook` - Telegram webhook
- `GET /api/health` - Health check
- Swagger documentation routes

These routes operate outside the CSRF protection system because:
1. They don't involve user sessions
2. They are called by external services, not browsers
3. They are authenticated via API keys or shared secrets (not sessions)

## Error Handling

### Invalid/Missing Token

When a token is missing or invalid, the server responds with:

```json
HTTP 403 Forbidden
{
  "erro": "Token CSRF inválido ou expirado",
  "codigo": "EBADCSRFTOKEN"
}
```

### Token Expiration

Tokens are tied to sessions. When a user's session expires (24 hours by default), the token is no longer valid. The user must:

1. Reload the page to create a new session
2. Get a new token via GET request
3. Retry the POST/PUT/DELETE request with the new token

## Testing

Run the CSRF protection tests:

```bash
npm test -- csrf-protection
```

Expected output:
```
✓ GET /api/test/form returns token in XSRF-TOKEN header
✓ POST without token returns 403
✓ POST with valid token returns 200
✓ POST with invalid token returns 403
✓ Token is transmitted in response header
✓ Multiple requests within same session work correctly
```

## Best Practices

### For API Clients

1. **Store the token**: Cache the XSRF-TOKEN from responses
2. **Reuse within session**: Use the same token for multiple requests
3. **Refresh on 403**: If a 403 CSRF error occurs, fetch a new token
4. **HTTP-only cookies**: Never access tokens from JavaScript if they're stored in cookies

### For Server Developers

1. **Always use session middleware before CSRF**: Session must be initialized first
2. **Place CSRF middleware early**: It should be before all protected routes
3. **Don't bypass CSRF**: Disable it only for well-documented webhook endpoints
4. **Log CSRF failures**: Monitor for suspicious patterns (coordinated attacks)
5. **Use HTTPS in production**: Ensure `secure: true` in session cookies

## Security Considerations

### What CSRF Protection Does

- Prevents attackers from making state-changing requests on behalf of users
- Requires knowledge of the session token (stored on server, not shared with client)
- Validates that requests originate from your own application

### What CSRF Protection Does NOT Do

- Protect against XSS (cross-site scripting) attacks
- Protect unauthenticated requests
- Prevent account takeover (use strong passwords/MFA)
- Prevent data exfiltration (use HTTPS, data encryption)

### Additional Security Measures

Use CSRF protection in combination with:

1. **HTTPS**: Encrypt all traffic (configured in Helmet middleware)
2. **HTTP-Only Cookies**: Prevent JavaScript access (configured in session)
3. **SameSite Cookies**: Limit cross-site cookie transmission (set to `strict`)
4. **Content-Security-Policy**: Restrict script execution (configured in Helmet)
5. **Rate Limiting**: Slow down brute-force attacks (configured in Express rate-limit)

## Migration Guide (for existing endpoints)

For existing endpoints that weren't protected:

1. **No code changes needed**: CSRF is applied globally via middleware
2. **Client code changes required**: Must send CSRF token with POST/PUT/DELETE
3. **Test thoroughly**: Verify token validation works
4. **Monitor logs**: Check for CSRF error patterns

## Troubleshooting

### "Token CSRF inválido" errors

**Cause**: Client sent invalid/expired token

**Solution**:
1. Fetch fresh token: `GET /api/form`
2. Wait for response headers to include `XSRF-Token`
3. Use new token in next request

### "Cannot find property 'csrfToken' of undefined"

**Cause**: CSRF middleware running before session middleware

**Solution**: Verify order in `index.ts`:
```typescript
app.use(criarMiddlewareSession(...)); // First
app.use(criarMiddlewareCSRF());       // Second
```

### Session/Token not persisting

**Cause**: Client not preserving cookies between requests

**Solution**: For fetch/axios, enable credential mode:
```javascript
fetch(url, {
  credentials: 'include', // Include cookies
  ...
})
```

## References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [csurf Documentation](https://github.com/expressjs/csurf)
- [Express Session Documentation](https://github.com/expressjs/session)
- [SameSite Cookie Explained](https://web.dev/samesite-cookies-explained/)

## Related Security Implementations

- **SEC-010**: Environment variable validation (secures configuration)
- **SEC-011**: Structured logging (audit trail for security events)
- **SEC-012**: Security headers (Helmet configuration)
- **SEC-013**: CSRF protection (this document)
