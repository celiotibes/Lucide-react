/**
 * Secure API Client - Wraps fetch API with security features
 * Features: JWT validation, certificate pinning, encryption, retry logic, secure logging
 */

import { TokenManager } from '../security/TokenManager';
import { CertificatePinningService } from '../security/CertificatePinningService';
import { EncryptionService } from '../security/EncryptionService';
import {
  SecurityHeadersBuilder,
  RetryHandler,
  PayloadHandler,
  SecureLogger,
  CertificatePinningValidator,
  SecurityUtils,
  ApiSecurityConfig,
  RetryConfig,
} from '../../utils/security/apiSecurity';

export interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retry?: Partial<RetryConfig>;
  skipEncryption?: boolean;
  skipCertificatePinning?: boolean;
}

export interface ApiResponse<T = any> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
  duration: number;
}

export interface ApiError extends Error {
  status?: number;
  statusText?: string;
  response?: ApiResponse;
  isSecurityError?: boolean;
}

export class SecureAPIClient {
  private baseUrl: string;
  private defaultRetryConfig: RetryConfig = RetryHandler.DEFAULT_CONFIG;
  private securityConfig: ApiSecurityConfig = {
    enableEncryption: false,
    enableCertificatePinning: true,
  };
  private requestInterceptors: Array<(config: RequestConfig) => Promise<RequestConfig>> = [];
  private responseInterceptors: Array<(response: ApiResponse) => Promise<ApiResponse>> = [];
  private errorInterceptors: Array<(error: ApiError) => Promise<ApiError>> = [];

  constructor(baseUrl: string, securityConfig?: Partial<ApiSecurityConfig>) {
    this.baseUrl = baseUrl;
    if (securityConfig) {
      this.securityConfig = { ...this.securityConfig, ...securityConfig };
    }
    this.setupDefaultInterceptors();
  }

  /**
   * Set up default interceptors
   */
  private setupDefaultInterceptors(): void {
    // Request interceptor for JWT validation and headers
    this.addRequestInterceptor(async (config) => {
      return this.validateAndEnhanceRequest(config);
    });

    // Response interceptor for security checks
    this.addResponseInterceptor(async (response) => {
      return this.handleResponse(response);
    });

    // Error interceptor for security errors
    this.addErrorInterceptor(async (error) => {
      return this.handleError(error);
    });
  }

  /**
   * Add request interceptor
   */
  public addRequestInterceptor(
    interceptor: (config: RequestConfig) => Promise<RequestConfig>
  ): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  public addResponseInterceptor(
    interceptor: (response: ApiResponse) => Promise<ApiResponse>
  ): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Add error interceptor
   */
  public addErrorInterceptor(
    interceptor: (error: ApiError) => Promise<ApiError>
  ): void {
    this.errorInterceptors.push(interceptor);
  }

  /**
   * Perform GET request
   */
  public async get<T = any>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...config, method: 'GET' });
  }

  /**
   * Perform POST request
   */
  public async post<T = any>(
    url: string,
    body?: any,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...config, method: 'POST', body });
  }

  /**
   * Perform PUT request
   */
  public async put<T = any>(
    url: string,
    body?: any,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...config, method: 'PUT', body });
  }

  /**
   * Perform PATCH request
   */
  public async patch<T = any>(
    url: string,
    body?: any,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...config, method: 'PATCH', body });
  }

  /**
   * Perform DELETE request
   */
  public async delete<T = any>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...config, method: 'DELETE' });
  }

  /**
   * Core request method with retry logic
   */
  public async request<T = any>(
    url: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const fullUrl = this.buildUrl(url);
    const retryConfig = { ...this.defaultRetryConfig, ...config.retry };
    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await this.performRequest<T>(fullUrl, config, attempt);
      } catch (error) {
        const apiError = error as ApiError;
        lastError = apiError;

        // Check if we should retry
        if (
          RetryHandler.shouldRetry(
            attempt,
            apiError.status || 0,
            retryConfig
          )
        ) {
          const delayMs = RetryHandler.calculateDelay(attempt, retryConfig);
          SecureLogger.logError(
            new Error(`Request failed, retrying in ${delayMs}ms (attempt ${attempt + 1})`),
            { url: fullUrl, status: apiError.status }
          );
          await RetryHandler.sleep(delayMs);
          continue;
        }

        // Run error interceptors
        let finalError = apiError;
        for (const interceptor of this.errorInterceptors) {
          finalError = await interceptor(finalError);
        }

        throw finalError;
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Perform single request
   */
  private async performRequest<T = any>(
    url: string,
    config: RequestConfig,
    attempt: number
  ): Promise<ApiResponse<T>> {
    const startTime = performance.now();

    try {
      // Run request interceptors
      let finalConfig = { ...config };
      for (const interceptor of this.requestInterceptors) {
        finalConfig = await interceptor(finalConfig);
      }

      // Log request
      SecureLogger.logRequest(
        finalConfig.method || 'GET',
        url,
        finalConfig.headers,
        finalConfig.body
      );

      // Validate certificate pinning
      if (this.securityConfig.enableCertificatePinning && !config.skipCertificatePinning) {
        const domain = new URL(url).hostname;
        const isCertValid = await CertificatePinningValidator.validateCertificate(domain);
        if (!isCertValid) {
          throw this.createSecurityError('Certificate pinning validation failed', 0);
        }
      }

      // Prepare request
      const fetchConfig: RequestInit = {
        method: finalConfig.method || 'GET',
        headers: finalConfig.headers,
        signal: this.createAbortSignal(finalConfig.timeout),
      };

      // Encrypt body if needed
      if (
        finalConfig.body &&
        this.securityConfig.enableEncryption &&
        !config.skipEncryption
      ) {
        const encryptedBody = await PayloadHandler.encryptSensitiveFields(
          finalConfig.body,
          this.securityConfig.encryptionFields || []
        );
        fetchConfig.body = JSON.stringify(encryptedBody);
      } else if (finalConfig.body) {
        fetchConfig.body = JSON.stringify(finalConfig.body);
      }

      // Perform fetch
      const response = await fetch(url, fetchConfig);

      // Parse response
      const responseData = await this.parseResponse<T>(response);
      const duration = performance.now() - startTime;

      // Log response
      SecureLogger.logResponse(response.status, undefined, responseData.data, duration);

      // Check for HTTP errors
      if (!response.ok) {
        throw this.createApiError(response, responseData.data, duration);
      }

      // Decrypt response if needed
      let data = responseData.data;
      if (this.securityConfig.enableEncryption && !config.skipEncryption) {
        data = await PayloadHandler.decryptSensitiveFields(
          data,
          this.securityConfig.decryptionFields || []
        );
      }

      const apiResponse: ApiResponse<T> = {
        status: response.status,
        statusText: response.statusText,
        headers: this.parseHeaders(response.headers),
        data,
        duration,
      };

      // Run response interceptors
      let finalResponse = apiResponse;
      for (const interceptor of this.responseInterceptors) {
        finalResponse = await interceptor(finalResponse);
      }

      return finalResponse;
    } catch (error) {
      const duration = performance.now() - startTime;

      if (error instanceof ApiError) {
        error.response = {
          status: error.status || 0,
          statusText: error.statusText || 'Error',
          headers: {},
          data: null,
          duration,
        };
        throw error;
      }

      throw this.createApiError(error as any, null, duration);
    }
  }

  /**
   * Validate and enhance request
   */
  private async validateAndEnhanceRequest(config: RequestConfig): Promise<RequestConfig> {
    // Validate JWT token
    if (TokenManager.isTokenExpired()) {
      throw this.createSecurityError('Token expired', 401);
    }

    // Build security headers
    const headers = new SecurityHeadersBuilder()
      .addStandardSecurityHeaders()
      .addAuthenticationHeader()
      .build();

    // Add CSRF token for state-changing requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method || 'GET')) {
      const csrfToken = SecurityUtils.getCSRFToken();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
    }

    // Merge headers
    const finalHeaders = {
      ...headers,
      ...config.headers,
    };

    return {
      ...config,
      headers: finalHeaders,
    };
  }

  /**
   * Handle response
   */
  private async handleResponse(response: ApiResponse): Promise<ApiResponse> {
    // Validate security headers in response
    return response;
  }

  /**
   * Handle error
   */
  private async handleError(error: ApiError): Promise<ApiError> {
    // Log error safely
    SecureLogger.logError(error);

    // Handle security errors
    if (error.isSecurityError) {
      if (error.status === 401) {
        // Token expired or invalid - try to refresh
        console.warn('Security error: Unauthorized access');
        TokenManager.clearTokens();
      }
    }

    throw error;
  }

  /**
   * Parse response based on content type
   */
  private async parseResponse<T>(response: Response): Promise<{ data: T }> {
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      const data = await response.json();
      return { data };
    }

    if (contentType?.includes('text')) {
      const text = await response.text();
      return { data: text as T };
    }

    const blob = await response.blob();
    return { data: blob as T };
  }

  /**
   * Parse response headers
   */
  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Build full URL
   */
  private buildUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  /**
   * Create abort signal with timeout
   */
  private createAbortSignal(timeout?: number): AbortSignal | undefined {
    if (!timeout) return undefined;

    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout);
    return controller.signal;
  }

  /**
   * Create API error
   */
  private createApiError(
    response: any,
    data: any,
    duration: number
  ): ApiError {
    const error = new Error(
      `HTTP ${response.status}: ${response.statusText}`
    ) as ApiError;

    error.status = response.status;
    error.statusText = response.statusText;
    error.response = {
      status: response.status,
      statusText: response.statusText,
      headers: {},
      data,
      duration,
    };

    return error;
  }

  /**
   * Create security error
   */
  private createSecurityError(message: string, status: number): ApiError {
    const error = new Error(message) as ApiError;
    error.status = status;
    error.isSecurityError = true;
    return error;
  }
}

/**
 * Create default secure API client
 */
export function createSecureAPIClient(
  baseUrl: string,
  config?: Partial<ApiSecurityConfig>
): SecureAPIClient {
  return new SecureAPIClient(baseUrl, config);
}
