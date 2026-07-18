// ============================================================================
// API CLIENT - Configuração Central com Interceptors
// Suporta: JWT auto-refresh, Rate limiting, Retry logic, Error handling
// ============================================================================

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

// ============================================================================
// 1. CONFIG E TIPOS
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'
const MAX_RETRIES = 3
const RETRY_DELAY = 1000

export enum ApiErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export class ApiError extends Error {
  constructor(
    public type: ApiErrorType,
    public statusCode?: number,
    public originalError?: Error,
  ) {
    super(`API Error: ${type}`)
    this.name = 'ApiError'
  }
}

// ============================================================================
// 2. STORAGE DE TOKENS
// ============================================================================

export class TokenManager {
  private static readonly ACCESS_TOKEN_KEY = 'auth_access_token'
  private static readonly REFRESH_TOKEN_KEY = 'auth_refresh_token'
  private static readonly EXPIRES_IN_KEY = 'auth_expires_in'

  static getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY)
  }

  static getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY)
  }

  static setTokens(tokens: AuthTokens): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, tokens.accessToken)
    localStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refreshToken)
    localStorage.setItem(this.EXPIRES_IN_KEY, String(tokens.expiresIn))
  }

  static clearTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY)
    localStorage.removeItem(this.REFRESH_TOKEN_KEY)
    localStorage.removeItem(this.EXPIRES_IN_KEY)
  }

  static isTokenExpired(): boolean {
    const expiresIn = localStorage.getItem(this.EXPIRES_IN_KEY)
    if (!expiresIn) return true

    const expirationTime = parseInt(expiresIn, 10)
    return Date.now() >= expirationTime
  }
}

// ============================================================================
// 3. RETRY LOGIC
// ============================================================================

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelay: number = RETRY_DELAY,
): Promise<T> {
  let lastError: Error | undefined

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (
        error instanceof AxiosError &&
        error.response?.status &&
        ![408, 429, 500, 502, 503, 504].includes(error.response.status)
      ) {
        throw error
      }

      if (i < maxRetries - 1) {
        const waitTime = baseDelay * Math.pow(2, i)
        await delay(waitTime)
      }
    }
  }

  throw lastError
}

// ============================================================================
// 4. AXIOS INSTANCE COM INTERCEPTORS
// ============================================================================

function createApiClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = TokenManager.getAccessToken()

      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }

      return config
    },
    (error: AxiosError) => {
      return Promise.reject(error)
    },
  )

  let isRefreshing = false
  let failedQueue: Array<(token: string) => void> = []

  const processQueue = (token: string) => {
    failedQueue.forEach(prom => prom(token))
    failedQueue = []
  }

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as any

      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          return new Promise((resolve) => {
            failedQueue.push((token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(instance(originalRequest))
            })
          })
        }

        isRefreshing = true
        originalRequest._retry = true

        try {
          const refreshToken = TokenManager.getRefreshToken()

          if (!refreshToken) {
            throw new ApiError(ApiErrorType.UNAUTHORIZED, 401)
          }

          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          })

          const { accessToken, refreshToken: newRefreshToken, expiresIn } = response.data

          TokenManager.setTokens({
            accessToken,
            refreshToken: newRefreshToken,
            expiresIn,
          })

          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          processQueue(accessToken)

          return instance(originalRequest)
        } catch (refreshError) {
          TokenManager.clearTokens()
          window.location.href = '/login'
          return Promise.reject(
            new ApiError(ApiErrorType.UNAUTHORIZED, 401, refreshError as Error),
          )
        } finally {
          isRefreshing = false
        }
      }

      let errorType = ApiErrorType.UNKNOWN

      if (!error.response) {
        errorType = ApiErrorType.NETWORK_ERROR
      } else {
        switch (error.response.status) {
          case 401:
            errorType = ApiErrorType.UNAUTHORIZED
            break
          case 403:
            errorType = ApiErrorType.FORBIDDEN
            break
          case 404:
            errorType = ApiErrorType.NOT_FOUND
            break
          case 400:
            errorType = ApiErrorType.VALIDATION_ERROR
            break
          case 500:
          case 502:
          case 503:
          case 504:
            errorType = ApiErrorType.SERVER_ERROR
            break
        }
      }

      return Promise.reject(
        new ApiError(errorType, error.response?.status, error),
      )
    },
  )

  return instance
}

// ============================================================================
// 5. SINGLETON API CLIENT
// ============================================================================

let apiInstance: AxiosInstance | null = null

export function getApiClient(): AxiosInstance {
  if (!apiInstance) {
    apiInstance = createApiClient()
  }
  return apiInstance
}

// ============================================================================
// 6. API METHODS WRAPPER
// ============================================================================

class ApiService {
  private api: AxiosInstance

  constructor() {
    this.api = getApiClient()
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const response = await retryWithBackoff(() =>
      this.api.post<ApiResponse<AuthTokens>>('/auth/login', {
        email,
        password,
      }),
    )

    if (!response.data.data) {
      throw new ApiError(ApiErrorType.SERVER_ERROR)
    }

    TokenManager.setTokens(response.data.data)
    return response.data.data
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout')
    } finally {
      TokenManager.clearTokens()
    }
  }

  async getProfile() {
    const response = await this.api.get('/auth/profile')
    return response.data.data
  }

  async getCases(params?: { status?: string; limit?: number; offset?: number }) {
    const response = await retryWithBackoff(() =>
      this.api.get<ApiResponse<any>>('/cases', { params }),
    )
    return response.data.data
  }

  async getCaseDetail(caseId: string) {
    const response = await this.api.get(`/cases/${caseId}`)
    return response.data.data
  }

  async createCase(caseData: any) {
    const response = await this.api.post('/cases', caseData)
    return response.data.data
  }

  async updateCase(caseId: string, caseData: any) {
    const response = await this.api.put(`/cases/${caseId}`, caseData)
    return response.data.data
  }

  async deleteCase(caseId: string) {
    await this.api.delete(`/cases/${caseId}`)
  }

  async getCaseTimeline(caseId: string) {
    const response = await this.api.get(`/cases/${caseId}/timeline`)
    return response.data.data
  }

  async getIntimations(params?: { status?: string; limit?: number }) {
    const response = await retryWithBackoff(() =>
      this.api.get<ApiResponse<any>>('/intimations', { params }),
    )
    return response.data.data
  }

  async getIntimationDetail(intimationId: string) {
    const response = await this.api.get(`/intimations/${intimationId}`)
    return response.data.data
  }

  async processIntimation(intimationId: string) {
    const response = await this.api.post(`/intimations/${intimationId}/auto-response`)
    return response.data.data
  }

  async updateIntimationResponse(intimationId: string, response: any) {
    const res = await this.api.put(`/intimations/${intimationId}/response`, response)
    return res.data.data
  }

  async getComplianceMetrics() {
    const response = await retryWithBackoff(() =>
      this.api.get<ApiResponse<any>>('/compliance/metrics'),
    )
    return response.data.data
  }

  async getComplianceSummary() {
    const response = await this.api.get('/compliance/summary')
    return response.data.data
  }

  async getRiskAssessment() {
    const response = await this.api.get('/compliance/risk-assessment')
    return response.data.data
  }

  async getAuditTrail(params?: { days?: number }) {
    const response = await this.api.get('/compliance/audit-trail', { params })
    return response.data.data
  }

  async getWebhooks() {
    const response = await this.api.get('/webhooks')
    return response.data.data
  }

  async registerWebhook(webhookData: any) {
    const response = await this.api.post('/webhooks/register', webhookData)
    return response.data.data
  }

  async deleteWebhook(webhookId: string) {
    await this.api.delete(`/webhooks/${webhookId}`)
  }

  async getNotificationPreferences() {
    const response = await this.api.get('/notifications/preferences')
    return response.data.data
  }

  async updateNotificationPreferences(preferences: any) {
    const response = await this.api.put('/notifications/preferences', preferences)
    return response.data.data
  }

  async healthCheck() {
    try {
      const response = await this.api.get('/health', { timeout: 5000 })
      return response.data
    } catch (error) {
      throw new ApiError(ApiErrorType.NETWORK_ERROR)
    }
  }
}

export const apiService = new ApiService()
export default apiService
