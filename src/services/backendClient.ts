/**
 * Backend API Client
 * Integração com FastAPI backend
 * 
 * Responsabilidades:
 * - Autenticação com JWT
 * - Retry com backoff exponencial
 * - Error handling estruturado
 * - Request/response interceptors
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios'

// Types
export interface ApiError {
  status: number
  message: string
  detail?: string
  timestamp: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export class BackendClient {
  private static instance: AxiosInstance | null = null
  private static accessToken: string | null = null
  private static refreshToken: string | null = null
  private static isRefreshing = false
  private static refreshSubscribers: ((token: string) => void)[] = []

  /**
   * Inicializar client (singleton)
   */
  static getInstance(): AxiosInstance {
    if (!BackendClient.instance) {
      BackendClient.instance = axios.create({
        baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Request interceptor: adicionar token
      BackendClient.instance.interceptors.request.use(
        (config) => {
          if (BackendClient.accessToken) {
            config.headers.Authorization = `Bearer ${BackendClient.accessToken}`
          }
          return config
        },
        (error) => Promise.reject(error)
      )

      // Response interceptor: retry + refresh token
      BackendClient.instance.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
          const originalRequest = error.config as AxiosRequestConfig & { _retry?: number }

          // Retry com backoff exponencial
          originalRequest._retry = (originalRequest._retry || 0) + 1

          if (error.response?.status === 401 && originalRequest._retry < 3) {
            if (!BackendClient.isRefreshing) {
              BackendClient.isRefreshing = true

              try {
                const response = await BackendClient.refreshAccessToken()
                if (response) {
                  BackendClient.isRefreshing = false
                  // Notificar subscribers do novo token
                  BackendClient.refreshSubscribers.forEach((cb) => cb(response.access_token))
                  BackendClient.refreshSubscribers = []
                }
              } catch (refreshError) {
                BackendClient.isRefreshing = false
                // Logout se refresh falhar
                BackendClient.clearTokens()
                return Promise.reject(refreshError)
              }
            }

            // Reenviar request original com novo token
            return new Promise((resolve) => {
              BackendClient.refreshSubscribers.push((token: string) => {
                if (originalRequest.headers) {
                  originalRequest.headers.Authorization = `Bearer ${token}`
                }
                resolve(BackendClient.instance!.request(originalRequest))
              })
            })
          }

          return Promise.reject(BackendClient.formatError(error))
        }
      )
    }

    return BackendClient.instance
  }

  /**
   * Fazer login
   */
  static async login(email: string, password: string): Promise<TokenResponse> {
    try {
      const response = await BackendClient.getInstance().post<TokenResponse>('/auth/login', {
        email,
        password,
      })

      BackendClient.setTokens(response.data)
      return response.data
    } catch (error) {
      throw BackendClient.formatError(error)
    }
  }

  /**
   * Registrar novo usuário
   */
  static async register(
    email: string,
    password: string,
    name: string
  ): Promise<TokenResponse> {
    try {
      const response = await BackendClient.getInstance().post<TokenResponse>('/auth/register', {
        email,
        password,
        name,
      })

      BackendClient.setTokens(response.data)
      return response.data
    } catch (error) {
      throw BackendClient.formatError(error)
    }
  }

  /**
   * Refresh access token
   */
  private static async refreshAccessToken(): Promise<TokenResponse | null> {
    try {
      if (!BackendClient.refreshToken) {
        return null
      }

      const response = await BackendClient.getInstance().post<TokenResponse>('/auth/refresh', {
        refresh_token: BackendClient.refreshToken,
      })

      BackendClient.setTokens(response.data)
      return response.data
    } catch (error) {
      BackendClient.clearTokens()
      throw BackendClient.formatError(error)
    }
  }

  /**
   * Guardar tokens no localStorage + memory
   */
  static setTokens(tokens: TokenResponse): void {
    BackendClient.accessToken = tokens.access_token
    BackendClient.refreshToken = tokens.refresh_token

    // Persistir no localStorage
    localStorage.setItem('access_token', tokens.access_token)
    localStorage.setItem('refresh_token', tokens.refresh_token)
  }

  /**
   * Carregar tokens do localStorage
   */
  static loadTokens(): void {
    const accessToken = localStorage.getItem('access_token')
    const refreshToken = localStorage.getItem('refresh_token')

    if (accessToken) {
      BackendClient.accessToken = accessToken
    }
    if (refreshToken) {
      BackendClient.refreshToken = refreshToken
    }
  }

  /**
   * Limpar tokens (logout)
   */
  static clearTokens(): void {
    BackendClient.accessToken = null
    BackendClient.refreshToken = null
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }

  /**
   * Verificar se está autenticado
   */
  static isAuthenticated(): boolean {
    return BackendClient.accessToken !== null
  }

  /**
   * Formatar erro de API
   */
  private static formatError(error: unknown): ApiError {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as any
      return {
        status: error.response?.status || 500,
        message: data?.error || error.message || 'Unknown error',
        detail: data?.message || data?.detail,
        timestamp: new Date().toISOString(),
      }
    }

    return {
      status: 500,
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }
  }
}

// Auto-load tokens on init
BackendClient.loadTokens()

export default BackendClient
