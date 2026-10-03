# SEC-013: CSRF Protection - Practical Examples

## Example 1: React Component with CSRF Token

### Component: Create Invoice

```tsx
import { useState, useEffect } from 'react';

export function CreateInvoice() {
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);

  // Fetch CSRF token on component mount
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const response = await fetch('/api/asaas/cobrancas', {
          method: 'GET',
          credentials: 'include', // Include session cookies
        });

        if (!response.ok) throw new Error('Failed to fetch form');

        // Token is in response headers
        const csrfToken = response.headers.get('XSRF-Token');
        if (csrfToken) {
          setToken(csrfToken);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load form');
      }
    };

    fetchToken();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);

    try {
      const response = await fetch('/api/asaas/cobrancas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token, // Include CSRF token
        },
        credentials: 'include', // Include session cookies
        body: JSON.stringify(data),
      });

      if (response.status === 403) {
        setError('Security token expired. Please reload and try again.');
        // Re-fetch token
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.erro || 'Failed to create invoice');
      }

      const result = await response.json();
      setSuccess(true);
      console.log('Invoice created:', result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!token) return <div>Loading form...</div>;

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create Invoice</h2>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">Invoice created successfully!</div>}

      <input
        type="text"
        name="customer_name"
        placeholder="Customer Name"
        required
      />
      <input
        type="number"
        name="amount"
        placeholder="Amount"
        required
      />
      <input
        type="date"
        name="due_date"
        placeholder="Due Date"
        required
      />

      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Invoice'}
      </button>
    </form>
  );
}
```

## Example 2: Fetch API Helper (JavaScript)

### Module: csrfClient.ts

```typescript
/**
 * CSRF Helper for API requests
 * Automatically manages CSRF tokens for protected endpoints
 */

class CsrfClient {
  private token: string = '';
  private tokenExpiresAt: number = 0;

  async fetchWithCsrf(
    url: string,
    options: RequestInit & { method: 'POST' | 'PUT' | 'DELETE' },
  ): Promise<Response> {
    // Refresh token if expired or missing
    if (!this.token || Date.now() > this.tokenExpiresAt) {
      await this.refreshToken();
    }

    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-CSRF-Token': this.token,
      },
      credentials: 'include',
    });
  }

  private async refreshToken(): Promise<void> {
    try {
      const response = await fetch('/api/asaas/cobrancas', {
        method: 'GET',
        credentials: 'include',
      });

      const token = response.headers.get('XSRF-Token');
      if (!token) {
        throw new Error('Failed to get CSRF token');
      }

      this.token = token;
      // Token valid for 24 hours (session timeout)
      this.tokenExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
    } catch (error) {
      console.error('Failed to refresh CSRF token:', error);
      throw new Error('Security token refresh failed');
    }
  }
}

export const csrfClient = new CsrfClient();
```

### Usage:

```typescript
const response = await csrfClient.fetchWithCsrf('/api/asaas/cobrancas', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Invoice' }),
});
```

## Example 3: Axios Interceptor (TypeScript)

### Setup: axiosInstance.ts

```typescript
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const instance: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true, // Include cookies
});

let csrfToken: string = '';

// Request interceptor: add CSRF token to POST/PUT/DELETE
instance.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (['post', 'put', 'delete'].includes(config.method?.toLowerCase() || '')) {
      // Refresh token if needed
      if (!csrfToken) {
        await fetchCsrfToken();
      }
      config.headers['X-CSRF-Token'] = csrfToken;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: handle CSRF token refresh on 403
instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 403 && error.config?.data) {
      // Token expired, refresh and retry
      await fetchCsrfToken();
      error.config.headers['X-CSRF-Token'] = csrfToken;
      return instance.request(error.config);
    }
    return Promise.reject(error);
  },
);

async function fetchCsrfToken(): Promise<void> {
  const response = await axios.get('/api/asaas/cobrancas', {
    withCredentials: true,
  });
  csrfToken = response.headers['xsrf-token'] || '';
}

export default instance;
```

### Usage:

```typescript
import api from './axiosInstance';

// POST request automatically includes CSRF token
const response = await api.post('/asaas/cobrancas', {
  name: 'Invoice',
  amount: 100,
});
```

## Example 4: Server-Side Route (TypeScript)

### Protected Route: asaas-routes.ts

```typescript
import express from 'express';
import { criarMiddlewareAutenticacao } from './auth-routes';

export function criarRotasAsaas({
  authService,
  eventosService,
}: AsaasRoutesDeps) {
  const router = express.Router();

  // CSRF is automatically applied by middleware in index.ts
  // No need to add it here - it's global

  /**
   * GET /api/asaas/cobrancas
   * List invoices (also returns CSRF token in header)
   */
  router.get(
    '/cobrancas',
    criarMiddlewareAutenticacao,
    async (req, res) => {
      try {
        const invoices = await consultarCobrancas(req.usuario.id);

        // Token is automatically added to response headers by middleware
        res.json({
          success: true,
          data: invoices,
          // Client receives XSRF-Token in response headers
        });
      } catch (error) {
        res.status(500).json({ erro: 'Failed to load invoices' });
      }
    },
  );

  /**
   * POST /api/asaas/cobrancas
   * Create invoice (CSRF token required in header)
   *
   * CSRF Validation Flow:
   * 1. Client sends X-CSRF-Token header
   * 2. csurf middleware validates token
   * 3. If invalid: 403 response
   * 4. If valid: continues to this handler
   * 5. Token is regenerated after request
   */
  router.post(
    '/cobrancas',
    criarMiddlewareAutenticacao,
    // CSRF validation happens here automatically
    async (req, res) => {
      try {
        const { customer, amount, dueDate } = req.body;

        // Validate input
        if (!customer || !amount) {
          res.status(400).json({ erro: 'Missing required fields' });
          return;
        }

        // Create invoice
        const invoice = await criarCobranca({
          customer,
          amount,
          dueDate,
          userId: req.usuario.id,
        });

        // Token has been regenerated at this point
        res.status(201).json({
          success: true,
          data: invoice,
          // New token will be in response headers
        });
      } catch (error) {
        if (error instanceof AsaasApiError) {
          res.status(400).json({ erro: error.message });
          return;
        }
        res.status(500).json({ erro: 'Failed to create invoice' });
      }
    },
  );

  /**
   * PUT /api/asaas/cobrancas/:id
   * Update invoice (CSRF token required)
   */
  router.put(
    '/cobrancas/:id',
    criarMiddlewareAutenticacao,
    // CSRF validation happens here automatically
    async (req, res) => {
      try {
        const { id } = req.params;
        const { amount, dueDate, status } = req.body;

        const updated = await atualizarCobranca(id, {
          amount,
          dueDate,
          status,
        });

        res.json({
          success: true,
          data: updated,
        });
      } catch (error) {
        res.status(500).json({ erro: 'Failed to update invoice' });
      }
    },
  );

  /**
   * DELETE /api/asaas/cobrancas/:id
   * Cancel invoice (CSRF token required)
   */
  router.delete(
    '/cobrancas/:id',
    criarMiddlewareAutenticacao,
    // CSRF validation happens here automatically
    async (req, res) => {
      try {
        const { id } = req.params;

        await cancelarCobranca(id);

        res.json({ success: true, message: 'Invoice cancelled' });
      } catch (error) {
        res.status(500).json({ erro: 'Failed to cancel invoice' });
      }
    },
  );

  return router;
}
```

## Example 5: cURL Testing

### Get Token

```bash
curl -i -X GET http://localhost:8787/api/asaas/cobrancas \
  -H "X-API-Key: your-api-key"
```

Response headers include:
```
xsrf-token: YOUR_TOKEN_HERE
set-cookie: connect.sid=...; Path=/; HttpOnly; ...
```

### Create Invoice with Token

```bash
curl -i -X POST http://localhost:8787/api/asaas/cobrancas \
  -H "X-API-Key: your-api-key" \
  -H "X-CSRF-Token: YOUR_TOKEN_HERE" \
  -H "Cookie: connect.sid=..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer": "John Doe",
    "amount": 1000,
    "dueDate": "2026-12-31"
  }'
```

Expected response (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "charge_123",
    "customer": "John Doe",
    "amount": 1000,
    "status": "pending"
  }
}
```

### Without Token (should fail with 403)

```bash
curl -i -X POST http://localhost:8787/api/asaas/cobrancas \
  -H "X-API-Key: your-api-key" \
  -H "Cookie: connect.sid=..." \
  -H "Content-Type: application/json" \
  -d '{"customer": "John Doe", "amount": 1000}'
```

Expected response (403 Forbidden):
```json
{
  "erro": "Token CSRF inválido ou expirado",
  "codigo": "EBADCSRFTOKEN"
}
```

## Security Testing Checklist

- [ ] GET requests return XSRF-Token header
- [ ] POST without token returns 403
- [ ] POST with valid token succeeds
- [ ] POST with invalid token returns 403
- [ ] Tokens expire with session (24 hours)
- [ ] Token regenerates after each use
- [ ] Multiple tabs in same session work
- [ ] Different browsers have different tokens
- [ ] Webhook endpoints skip CSRF validation
- [ ] HTTPS enforced in production (secure cookies)

## Common Patterns

### Pattern: Token Caching

```typescript
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getCsrfToken(sessionId: string): Promise<string> {
  const cached = tokenCache.get(sessionId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const response = await fetch('/api/form');
  const token = response.headers.get('XSRF-Token')!;
  tokenCache.set(sessionId, {
    token,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min cache
  });

  return token;
}
```

### Pattern: Error Recovery

```typescript
async function apiCall(method: 'POST' | 'PUT' | 'DELETE', url: string, data: any) {
  let token = await getCsrfToken();

  let response = await fetch(url, {
    method,
    headers: { 'X-CSRF-Token': token },
    body: JSON.stringify(data),
    credentials: 'include',
  });

  // If CSRF token expired, retry once
  if (response.status === 403) {
    token = await refreshCsrfToken();
    response = await fetch(url, {
      method,
      headers: { 'X-CSRF-Token': token },
      body: JSON.stringify(data),
      credentials: 'include',
    });
  }

  return response;
}
```
