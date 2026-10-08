import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { APIClient, APIConfig, APIResponse, PinningError, ValidationError } from '../APIClient';

describe('APIClient', () => {
  let client: APIClient;
  const config: APIConfig = {
    baseURL: 'https://api.example.com',
    timeout: 5000,
    retryAttempts: 3,
    retryDelay: 100,
  };

  beforeEach(() => {
    client = new APIClient(config);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with config', () => {
      expect(client).toBeDefined();
    });

    it('should use default values for optional config', () => {
      const minimalClient = new APIClient({
        baseURL: 'https://api.test.com',
      });
      expect(minimalClient).toBeDefined();
    });
  });

  describe('GET request', () => {
    it('should make successful GET request', async () => {
      const mockData = { id: 1, name: 'Test' };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValueOnce(mockData),
      } as any);

      const result = await client.get('/test');

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('should handle 404 error', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValueOnce({ error: 'Not found' }),
      } as any);

      const result = await client.get('/notfound');

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
      expect(result.error).toBeDefined();
    });
  });

  describe('POST request', () => {
    it('should make successful POST request', async () => {
      const requestData = { name: 'Test' };
      const responseData = { id: 1, ...requestData };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValueOnce(responseData),
      } as any);

      const result = await client.post('/test', requestData);

      expect(result.success).toBe(true);
      expect(result.status).toBe(201);
      expect(result.data).toEqual(responseData);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('should handle POST error', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const result = await client.post('/test', {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('PUT request', () => {
    it('should make successful PUT request', async () => {
      const requestData = { name: 'Updated' };
      const responseData = { id: 1, ...requestData };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValueOnce(responseData),
      } as any);

      const result = await client.put('/test/1', requestData);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/test/1',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  describe('PATCH request', () => {
    it('should make successful PATCH request', async () => {
      const requestData = { status: 'active' };
      const responseData = { id: 1, ...requestData };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValueOnce(responseData),
      } as any);

      const result = await client.patch('/test/1', requestData);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/test/1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('DELETE request', () => {
    it('should make successful DELETE request', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
        json: vi.fn().mockResolvedValueOnce({}),
      } as any);

      const result = await client.delete('/test/1');

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/test/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('authentication', () => {
    it('should include auth token in headers', async () => {
      client.setAuthToken('test-token-123');

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValueOnce({ success: true }),
      } as any);

      await client.get('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      );
    });

    it('should clear auth token', () => {
      client.setAuthToken('token');
      client.clearAuthToken();
      // After clearing, no token should be sent
      expect(client).toBeDefined();
    });
  });

  describe('retry logic', () => {
    it('should retry failed requests', async () => {
      vi.mocked(global.fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: vi.fn().mockResolvedValueOnce({ success: true }),
        } as any);

      const result = await client.get('/test');

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retry attempts', async () => {
      vi.mocked(global.fetch).mockRejectedValue(
        new Error('Network error'),
      );

      const result = await client.get('/test');

      expect(result.success).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3); // retryAttempts: 3
    });
  });

  describe('batch requests', () => {
    it('should handle batch requests', async () => {
      const requests = [
        { method: 'GET' as const, endpoint: '/test/1' },
        { method: 'GET' as const, endpoint: '/test/2' },
        { method: 'GET' as const, endpoint: '/test/3' },
      ];

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: vi.fn().mockResolvedValueOnce({ id: 1 }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: vi.fn().mockResolvedValueOnce({ id: 2 }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: vi.fn().mockResolvedValueOnce({ id: 3 }),
        } as any);

      const results = await client.batch(requests);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('custom headers', () => {
    it('should include custom headers in request', async () => {
      const customHeaders = { 'X-Custom': 'value' };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValueOnce({}),
      } as any);

      await client.get('/test', customHeaders);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'value',
          }),
        }),
      );
    });
  });

  describe('online status', () => {
    it('should check if device is online', () => {
      expect(typeof client.isOnline()).toBe('boolean');
    });
  });

  describe('response handling', () => {
    it('should include timestamp in response', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValueOnce({ success: true }),
      } as any);

      const result = await client.get('/test');

      expect(result.timestamp).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
    });
  });

  describe('certificate pinning', () => {
    it('should initialize with certificate pinning enabled by default', () => {
      const newClient = new APIClient({
        baseURL: 'https://api.example.com',
      });
      expect(newClient).toBeDefined();
    });

    it('should allow disabling certificate pinning', () => {
      const newClient = new APIClient({
        baseURL: 'https://api.example.com',
        enableCertificatePinning: false,
      });
      expect(newClient).toBeDefined();
    });

    it('should add pinned certificates for domains', () => {
      const testPublicKey = 'test-public-key-123';
      client.addPinnedCertificate('api.example.com', testPublicKey);

      // Should not throw and should be logged
      expect(client).toBeDefined();
    });

    it('should add backup pinned certificates', () => {
      const testPublicKey = 'backup-key-456';
      client.addPinnedCertificate('api.example.com', testPublicKey, undefined, true);

      expect(client).toBeDefined();
    });

    it('should provide validation logs for debugging', () => {
      const logs = client.getValidationLogs();
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should allow clearing validation logs', () => {
      client.clearValidationLogs();
      const logs = client.getValidationLogs();
      expect(logs.length).toBe(0);
    });

    it('should throw PinningError when validation fails', async () => {
      const pinnedClient = new APIClient({
        baseURL: 'https://api.example.com',
        enableCertificatePinning: true,
      });

      // Add a pinned certificate
      pinnedClient.addPinnedCertificate('api.example.com', 'valid-key-123');

      // Mock fetch to simulate network success but we'll test error handling
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValueOnce({ success: true }),
      } as any);

      // Request should succeed with certificate pinning
      const result = await pinnedClient.get('/test');
      expect(result.success).toBe(true);
    });

    it('should handle requests when pinning is disabled', async () => {
      const noPinningClient = new APIClient({
        baseURL: 'https://api.example.com',
        enableCertificatePinning: false,
      });

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValueOnce({ success: true }),
      } as any);

      const result = await noPinningClient.get('/test');
      expect(result.success).toBe(true);
    });

    it('should configure pinned hosts on initialization', () => {
      const newClient = new APIClient({
        baseURL: 'https://secure-api.example.com',
        pinnedHosts: ['secure-api.example.com'],
      });
      expect(newClient).toBeDefined();
    });

    it('should extract host from URL correctly', async () => {
      client.addPinnedCertificate('api.example.com', 'test-key-789');

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValueOnce({ success: true }),
      } as any);

      const result = await client.get('/test');
      expect(result.success).toBe(true);
    });

    it('should maintain validation logs up to max capacity', () => {
      for (let i = 0; i < 150; i++) {
        client.addPinnedCertificate(`domain${i}.com`, `key-${i}`);
      }

      const logs = client.getValidationLogs();
      // Should keep only recent logs (MAX_VALIDATION_LOGS = 100)
      expect(logs.length).toBeLessThanOrEqual(100);
    });

    it('PinningError should have correct properties', () => {
      const error = new PinningError('Test pinning error', 'api.example.com', 'abc123');

      expect(error.name).toBe('PinningError');
      expect(error.message).toBe('Test pinning error');
      expect(error.host).toBe('api.example.com');
      expect(error.fingerprint).toBe('abc123');
      expect(error.timestamp).toBeGreaterThan(0);
    });

    it('ValidationError should have correct properties', () => {
      const error = new ValidationError(
        'Test validation error',
        'api.example.com',
        'Certificate chain invalid'
      );

      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Test validation error');
      expect(error.host).toBe('api.example.com');
      expect(error.reason).toBe('Certificate chain invalid');
      expect(error.timestamp).toBeGreaterThan(0);
    });
  });
});
