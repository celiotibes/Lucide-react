/**
 * Multi-Tier LLM Stack Client
 * Cliente para integração com API de roteamento inteligente 4-Tier
 */

import axios from 'axios'
import type { AxiosInstance } from 'axios'
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  MultiTierConfig,
  UsageStats,
  MultiTierHealth,
  AnalysisResult,
} from '../types/multiTierLlm'

export class MultiTierLlmClient {
  private axiosInstance: AxiosInstance
  private baseURL: string

  constructor(baseURL: string = 'http://localhost:8000') {
    this.baseURL = baseURL
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Executar análise inteligente com roteamento automático 4-Tier
   *
   * O router seleciona automaticamente o melhor LLM (Claude, Groq, Gemini, Ollama)
   * baseado em tipo de tarefa, urgência e configurações de custo.
   *
   * @param request Requisição com prompt, tipo de tarefa, e opções
   * @returns Resposta com análise, provider usado, custos e métricas
   */
  async analyzeIntelligent(request: AnalyzeRequest): Promise<AnalysisResult> {
    try {
      const response = await this.axiosInstance.post<AnalyzeResponse>(
        '/api/llm/analyze/intelligent',
        {
          prompt: request.prompt,
          task_type: request.task_type,
          is_urgent: request.is_urgent ?? false,
          allow_premium: request.allow_premium ?? true,
          temperature: request.temperature ?? 0.3,
          max_tokens: request.max_tokens ?? 1000,
        }
      )

      return this.mapResponseToResult(response.data)
    } catch (error) {
      throw this.handleError(error, 'analyzeIntelligent')
    }
  }

  /**
   * Executar análise rápida (TIER2 - Groq, 1-2s, grátis)
   */
  async analyzeQuick(prompt: string): Promise<AnalysisResult> {
    return this.analyzeIntelligent({
      prompt,
      task_type: 'analise_rapida',
      is_urgent: false,
      allow_premium: false, // Prefer free options
      temperature: 0.3,
    })
  }

  /**
   * Executar análise de hermenêutica jurídica (TIER1 - Claude)
   */
  async analyzeHermenautica(prompt: string, isUrgent: boolean = false): Promise<AnalysisResult> {
    return this.analyzeIntelligent({
      prompt,
      task_type: 'hermenautica_juridica',
      is_urgent: isUrgent,
      allow_premium: true,
      temperature: 0.2, // Determinístico para análises jurídicas
    })
  }

  /**
   * Classificar tipo de caso (TIER2 - Groq, rápido, grátis)
   */
  async classifyCase(caseDescription: string): Promise<AnalysisResult> {
    return this.analyzeIntelligent({
      prompt: `Classifique o seguinte caso: ${caseDescription}`,
      task_type: 'classificacao_caso',
      is_urgent: false,
      allow_premium: false,
      temperature: 0.1, // Muito determinístico para classificação
    })
  }

  /**
   * Buscar jurisprudência (TIER3 - Gemini, barato)
   */
  async searchJurisprudence(query: string): Promise<AnalysisResult> {
    return this.analyzeIntelligent({
      prompt: `Busque jurisprudência sobre: ${query}`,
      task_type: 'busca_jurisprudencia',
      is_urgent: false,
      allow_premium: false,
      temperature: 0.2,
    })
  }

  /**
   * Sumarizar documento (TIER2 - Groq, rápido, grátis)
   */
  async summarizeDocument(content: string, maxTokens: number = 500): Promise<AnalysisResult> {
    return this.analyzeIntelligent({
      prompt: `Resuma o seguinte conteúdo em ${maxTokens} tokens máximo:\n\n${content}`,
      task_type: 'sumarizacao',
      is_urgent: false,
      allow_premium: false,
      max_tokens: maxTokens,
    })
  }

  /**
   * Extrair entidades (TIER3 - Gemini, barato)
   */
  async extractEntities(text: string): Promise<AnalysisResult> {
    return this.analyzeIntelligent({
      prompt: `Extraia as seguintes entidades do texto: nomes, datas, locais, valores monetários, documentos:\n\n${text}`,
      task_type: 'extracao_entidades',
      is_urgent: false,
      allow_premium: false,
      temperature: 0.1,
    })
  }

  /**
   * Analisar dados sensíveis (TIER4 - Ollama, 100% privado, grátis)
   */
  async analyzeSensitiveData(data: string): Promise<AnalysisResult> {
    return this.analyzeIntelligent({
      prompt: `Analise os seguintes dados sensíveis:\n\n${data}`,
      task_type: 'analise_dados_sensiveis',
      is_urgent: false,
      allow_premium: false,
      temperature: 0.2,
    })
  }

  /**
   * Obter estatísticas de uso do multi-tier router
   *
   * @returns Estatísticas com total de requisições, custo total, custo por provider
   */
  async getStats(): Promise<UsageStats> {
    try {
      const response = await this.axiosInstance.get<UsageStats>('/api/llm/stats')
      return response.data
    } catch (error) {
      throw this.handleError(error, 'getStats')
    }
  }

  /**
   * Resetar estatísticas de uso
   *
   * ⚠️ Use com cuidado - limpa histórico de custos
   */
  async resetStats(): Promise<{ status: string; message: string }> {
    try {
      const response = await this.axiosInstance.post<{ status: string; message: string }>(
        '/api/llm/stats/reset'
      )
      return response.data
    } catch (error) {
      throw this.handleError(error, 'resetStats')
    }
  }

  /**
   * Obter configuração do multi-tier router
   */
  async getConfig(): Promise<MultiTierConfig> {
    try {
      const response = await this.axiosInstance.get<MultiTierConfig>('/api/llm/config')
      return response.data
    } catch (error) {
      throw this.handleError(error, 'getConfig')
    }
  }

  /**
   * Health check do multi-tier router
   */
  async health(): Promise<MultiTierHealth> {
    try {
      const response = await this.axiosInstance.get<MultiTierHealth>('/api/llm/health')
      return response.data
    } catch (error) {
      // Se falhar, retornar status unavailable
      console.error('MultiTierLlm health check failed:', error)
      return {
        status: 'unavailable',
        message: 'MultiTierRouter não está disponível',
        router_initialized: false,
      }
    }
  }

  /**
   * Mapear response da API para AnalysisResult
   */
  private mapResponseToResult(response: AnalyzeResponse): AnalysisResult {
    return {
      content: response.response,
      provider: response.provider as any,
      tier: response.tier as any,
      tokensUsed: response.tokens_used,
      costUSD: response.cost_usd,
      latencyMs: response.latency_ms,
      confidence: response.confidence,
      isFromFallback: response.fallback_used ?? false,
      model: response.model,
    }
  }

  /**
   * Tratamento de erros
   */
  private handleError(error: any, methodName: string): Error {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        return new Error(
          `${methodName} failed: ${error.response.status} - ${error.response.data?.detail || error.response.data?.message || error.message}`
        )
      } else if (error.request) {
        return new Error(`${methodName} failed: No response from server`)
      }
    }
    return new Error(`${methodName} failed: ${error?.message || 'Unknown error'}`)
  }
}

// Singleton instance
let clientInstance: MultiTierLlmClient | null = null

export function getMultiTierLlmClient(): MultiTierLlmClient {
  if (!clientInstance) {
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    clientInstance = new MultiTierLlmClient(baseURL)
  }
  return clientInstance
}

export default getMultiTierLlmClient
