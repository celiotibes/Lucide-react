/**
 * Legal Data Hunter Client
 * Integration with Legal Data Hunter MCP for multi-jurisdictional legal research
 */

import type {
  LegalQuery,
  LegalResult,
  LegalDocument,
  PetitionAnalysis,
  StrategicAnalysis,
  JurisdictionComparison,
} from '../types/legal'

export class LegalDataHunterClient {
  private apiEndpoint: string
  private apiKey: string | undefined
  private timeout: number

  constructor(apiKey?: string, timeout = 30000) {
    this.apiEndpoint = import.meta.env.VITE_LEGAL_DATA_HUNTER_API || 'https://api.legaldatahunter.com'
    this.apiKey = apiKey || import.meta.env.VITE_LEGAL_DATA_HUNTER_API_KEY
    this.timeout = timeout
  }

  /**
   * Pesquisar legislação, jurisprudência e doutrinas
   */
  async search(query: LegalQuery): Promise<LegalResult[]> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/search`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(query),
      })

      const data = await response.json() as { results: LegalResult[] }
      return data.results || []
    } catch (error) {
      throw new Error(`Legal Data Hunter search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Obter documento completo pelo ID
   */
  async getDocument(id: string): Promise<LegalResult> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/documents/${id}`, {
        headers: this._getHeaders(),
      })

      const data = await response.json() as LegalResult
      return data
    } catch (error) {
      throw new Error(`Failed to fetch document ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Análise crítica de petição jurídica
   * Detecta falhas estratégicas, argumentos ausentes, omissões, etc.
   */
  async analyzePetition(document: LegalDocument): Promise<PetitionAnalysis> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/analyze/petition`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify({
          documentId: document.id,
          content: document.content,
          caseType: document.caseType,
          jurisdiction: document.jurisdiction,
          parties: document.parties,
        }),
      })

      const data = await response.json() as PetitionAnalysis
      return data
    } catch (error) {
      throw new Error(`Petition analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Análise estratégica com blindagem defensiva e contra-ataques
   * Inclui: advogado do diabo, vulnerabilidades, cenários de decisão, plano de ação
   */
  async analyzeStrategic(
    documentId: string,
    legalArguments: string,
    jurisdiction: string,
  ): Promise<StrategicAnalysis> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/analyze/strategic`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify({
          documentId,
          legalArguments,
          jurisdiction,
        }),
      })

      const data = await response.json() as StrategicAnalysis
      return data
    } catch (error) {
      throw new Error(`Strategic analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Comparar legislação entre jurisdições
   */
  async compareJurisdictions(
    topic: string,
    jurisdictions: string[],
  ): Promise<JurisdictionComparison> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/compare/jurisdictions`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify({
          topic,
          jurisdictions,
        }),
      })

      const data = await response.json() as JurisdictionComparison
      return data
    } catch (error) {
      throw new Error(
        `Jurisdiction comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Pesquisar jurisprudência com filtros
   */
  async searchCaseLaw(
    query: string,
    jurisdiction: string,
    filters?: {
      court?: string
      yearFrom?: number
      yearTo?: number
    },
  ): Promise<LegalResult[]> {
    const legalQuery: LegalQuery = {
      query,
      jurisdiction: jurisdiction as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      searchType: 'case_law',
      filters,
    }

    return this.search(legalQuery)
  }

  /**
   * Pesquisar legislação
   */
  async searchStatutes(
    query: string,
    jurisdiction: string,
    filters?: {
      yearFrom?: number
      yearTo?: number
      topic?: string
    },
  ): Promise<LegalResult[]> {
    const legalQuery: LegalQuery = {
      query,
      jurisdiction: jurisdiction as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      searchType: 'statute',
      filters,
    }

    return this.search(legalQuery)
  }

  /**
   * Pesquisar doutrina (artigos, comentários, análises)
   */
  async searchDoctrine(
    query: string,
    jurisdiction: string,
  ): Promise<LegalResult[]> {
    const legalQuery: LegalQuery = {
      query,
      jurisdiction: jurisdiction as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      searchType: 'doctrine',
    }

    return this.search(legalQuery)
  }

  /**
   * Obter casos relacionados
   */
  async getRelatedCases(caseId: string, limit = 10): Promise<LegalResult[]> {
    try {
      const response = await this._fetchWithTimeout(
        `${this.apiEndpoint}/cases/${caseId}/related?limit=${limit}`,
        { headers: this._getHeaders() },
      )

      const data = await response.json() as { results: LegalResult[] }
      return data.results || []
    } catch (error) {
      throw new Error(`Failed to fetch related cases: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Fetch com timeout automático
   */
  private async _fetchWithTimeout(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return response
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Obter headers de requisição
   */
  private _getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Lucide-react/1.0.0',
    }

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey
    }

    return headers
  }

  /**
   * Verificar conectividade com Legal Data Hunter
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/health`)
      return response.ok
    } catch {
      return false
    }
  }
}

/**
 * Singleton instance
 */
export const legalDataHunterClient = new LegalDataHunterClient()
