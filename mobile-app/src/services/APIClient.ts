import { logger } from '../utils/logger';

export interface APIConfig {
  baseURL: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export interface APIRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  data?: any;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface APIResponse<T> {
  success: boolean;
  status: number;
  data?: T;
  error?: string;
  timestamp: number;
}

export class APIClient {
  private config: Required<APIConfig>;
  private authToken?: string;
  private requestQueue: Map<string, Promise<any>> = new Map();

  constructor(config: APIConfig) {
    this.config = {
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      headers: config.headers || {},
      baseURL: config.baseURL,
    };
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  clearAuthToken(): void {
    this.authToken = undefined;
  }

  async get<T>(
    endpoint: string,
    headers?: Record<string, string>,
  ): Promise<APIResponse<T>> {
    return this.request<T>({
      method: 'GET',
      endpoint,
      headers,
    });
  }

  async post<T>(
    endpoint: string,
    data?: any,
    headers?: Record<string, string>,
  ): Promise<APIResponse<T>> {
    return this.request<T>({
      method: 'POST',
      endpoint,
      data,
      headers,
    });
  }

  async put<T>(
    endpoint: string,
    data?: any,
    headers?: Record<string, string>,
  ): Promise<APIResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      endpoint,
      data,
      headers,
    });
  }

  async patch<T>(
    endpoint: string,
    data?: any,
    headers?: Record<string, string>,
  ): Promise<APIResponse<T>> {
    return this.request<T>({
      method: 'PATCH',
      endpoint,
      data,
      headers,
    });
  }

  async delete<T>(
    endpoint: string,
    headers?: Record<string, string>,
  ): Promise<APIResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      endpoint,
      headers,
    });
  }

  private async request<T>(req: APIRequest): Promise<APIResponse<T>> {
    const requestKey = `${req.method}:${req.endpoint}`;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.config.retryAttempts) {
      try {
        const response = await this.executeRequest<T>(req);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          logger.warn(
            `Request failed, retrying in ${delay}ms: ${req.method} ${req.endpoint}`,
          );
          await this.sleep(delay);
        }
      }
    }

    logger.error(`Request failed after ${attempt} attempts: ${req.method} ${req.endpoint}`, lastError);
    return {
      success: false,
      status: 0,
      error: lastError?.message || 'Request failed',
      timestamp: Date.now(),
    };
  }

  private async executeRequest<T>(
    req: APIRequest,
  ): Promise<APIResponse<T>> {
    const url = `${this.config.baseURL}${req.endpoint}`;
    const headers = this.buildHeaders(req.headers);

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
      signal: AbortSignal.timeout(req.timeout || this.config.timeout),
    };

    if (req.data && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
      fetchOptions.body = JSON.stringify(req.data);
    }

    try {
      const response = await fetch(url, fetchOptions);
      const responseData = await this.parseResponse<T>(response);

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${responseData.error || response.statusText}`,
        );
      }

      logger.info(`Request successful: ${req.method} ${req.endpoint}`);
      return {
        success: true,
        status: response.status,
        data: responseData,
        timestamp: Date.now(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Request error: ${req.method} ${req.endpoint} - ${message}`);
      throw error;
    }
  }

  private buildHeaders(customHeaders?: Record<string, string>): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    if (customHeaders) {
      Object.assign(headers, customHeaders);
    }

    return headers;
  }

  private async parseResponse<T>(response: Response): Promise<T | { error?: string }> {
    try {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      return {} as T;
    } catch (error) {
      logger.error('Failed to parse response', error);
      return {} as T;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async batch<T>(
    requests: APIRequest[],
  ): Promise<APIResponse<T>[]> {
    try {
      const results = await Promise.all(
        requests.map((req) => this.request<T>(req)),
      );
      logger.info(`Batch request completed: ${requests.length} requests`);
      return results;
    } catch (error) {
      logger.error('Batch request failed', error);
      throw error;
    }
  }

  isOnline(): boolean {
    if (typeof navigator !== 'undefined') {
      return navigator.onLine;
    }
    return true;
  }
}
