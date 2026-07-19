/**
 * Accounting Client
 * Integration for accounting, tax, and compliance research
 */

import type {
  AccountingQuery,
  AccountingDocument,
  TaxComplianceAnalysis,
  AuditAnalysis,
  ForensicAccounting,
} from '../types/accounting'

export class AccountingClient {
  private apiEndpoint: string
  private apiKey: string | undefined
  private timeout: number

  constructor(apiKey?: string, timeout = 30000) {
    this.apiEndpoint = import.meta.env.VITE_ACCOUNTING_API || 'https://api.accounting-research.com'
    this.apiKey = apiKey || import.meta.env.VITE_ACCOUNTING_API_KEY
    this.timeout = timeout
  }

  /**
   * Pesquisar documentos contábeis/fiscais
   */
  async search(query: AccountingQuery): Promise<AccountingDocument[]> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/search`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(query),
      })

      const data = await response.json() as { results: AccountingDocument[] }
      return data.results || []
    } catch (error) {
      throw new Error(`Accounting search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Pesquisar por tipo (IRPF, IRPJ, ICMS, etc.)
   */
  async searchByType(
    type: string,
    jurisdiction: string,
    year: number,
  ): Promise<AccountingDocument[]> {
    const query: AccountingQuery = {
      type: 'tax',
      jurisdiction: jurisdiction as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      year,
      keywords: [type],
    }

    return this.search(query)
  }

  /**
   * Análise de conformidade fiscal (IRPF, IRPJ, etc.)
   */
  async analyzeTaxCompliance(
    companyData: {
      name: string
      cnpj: string
      jurisdiction: string
      fiscalYear: number
      documents: Record<string, unknown>
    },
  ): Promise<TaxComplianceAnalysis> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/analyze/tax-compliance`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(companyData),
      })

      const data = await response.json() as TaxComplianceAnalysis
      return data
    } catch (error) {
      throw new Error(
        `Tax compliance analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Análise de auditoria interna/externa
   */
  async analyzeAudit(
    auditData: {
      company: { name: string, cnpj: string, fiscalYear: number }
      auditType: 'external' | 'internal' | 'forensic'
      scope: string
      documents: Record<string, unknown>
    },
  ): Promise<AuditAnalysis> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/analyze/audit`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(auditData),
      })

      const data = await response.json() as AuditAnalysis
      return data
    } catch (error) {
      throw new Error(`Audit analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Análise forense contábil
   */
  async analyzeForensic(
    caseData: {
      caseId: string
      caseType: 'fraud_investigation' | 'asset_valuation' | 'dispute_resolution'
      investigationScope: string
      documents: Record<string, unknown>
    },
  ): Promise<ForensicAccounting> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/analyze/forensic`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(caseData),
      })

      const data = await response.json() as ForensicAccounting
      return data
    } catch (error) {
      throw new Error(`Forensic accounting analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Buscar regulação específica (IRPF, NF-e, ECD, etc.)
   */
  async searchRegulation(
    regulationType: string,
    jurisdiction: string,
    year?: number,
  ): Promise<AccountingDocument[]> {
    const query: AccountingQuery = {
      type: 'regulation',
      jurisdiction: jurisdiction as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      year: year || new Date().getFullYear(),
      keywords: [regulationType],
    }

    return this.search(query)
  }

  /**
   * Obter document completo pelo ID
   */
  async getDocument(id: string): Promise<AccountingDocument> {
    try {
      const response = await this._fetchWithTimeout(`${this.apiEndpoint}/documents/${id}`, {
        headers: this._getHeaders(),
      })

      const data = await response.json() as AccountingDocument
      return data
    } catch (error) {
      throw new Error(`Failed to fetch document ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Pesquisar IRPF (Imposto de Renda Pessoa Física)
   */
  async searchIRPF(year: number): Promise<AccountingDocument[]> {
    return this.searchRegulation('IRPF', 'BR', year)
  }

  /**
   * Pesquisar IRPJ (Imposto de Renda Pessoa Jurídica)
   */
  async searchIRPJ(year: number): Promise<AccountingDocument[]> {
    return this.searchRegulation('IRPJ', 'BR', year)
  }

  /**
   * Pesquisar NF-e (Nota Fiscal Eletrônica)
   */
  async searchNFe(year: number): Promise<AccountingDocument[]> {
    return this.searchRegulation('NF-e', 'BR', year)
  }

  /**
   * Pesquisar ECD (Escrituração Contábil Digital)
   */
  async searchECD(year: number): Promise<AccountingDocument[]> {
    return this.searchRegulation('ECD', 'BR', year)
  }

  /**
   * Pesquisar EFD (Escrituração Fiscal Digital)
   */
  async searchEFD(year: number): Promise<AccountingDocument[]> {
    return this.searchRegulation('EFD', 'BR', year)
  }

  /**
   * Pesquisar SPED (Sistema Público de Escrituração Digital)
   */
  async searchSPED(year: number): Promise<AccountingDocument[]> {
    return this.searchRegulation('SPED', 'BR', year)
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
   * Verificar conectividade
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
export const accountingClient = new AccountingClient()
