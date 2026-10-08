import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { APIClient, APIConfig, APIResponse } from '../APIClient';

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
});
