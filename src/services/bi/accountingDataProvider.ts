import type { CSVRow } from '../../types/starSchema'

export interface AccountingDataSource {
  type: 'api' | 'mock' | 'erp'
  name: string
  endpoint?: string
  apiKey?: string
}

export interface FetchOptions {
  source: AccountingDataSource
  dateRange?: { start: string; end: string }
  filters?: Record<string, any>
}

export interface DataFetchResult {
  success: boolean
  recordsCount: number
  data: CSVRow[]
  error?: string
  timestamp: Date
}

export class AccountingDataProvider {
  private static readonly CACHE_DURATION = 3600000 // 1 hour
  private static cache = new Map<string, { data: CSVRow[]; timestamp: number }>()

  // Fetch accounting data from configured source
  static async fetchData(options: FetchOptions): Promise<DataFetchResult> {
    const cacheKey = this.getCacheKey(options)
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return {
        success: true,
        recordsCount: cached.data.length,
        data: cached.data,
        timestamp: new Date(),
      }
    }

    try {
      let data: CSVRow[] = []

      switch (options.source.type) {
        case 'mock':
          data = this.generateMockData(options.dateRange)
          break
        case 'api':
          if (!options.source.endpoint) {
            throw new Error('API endpoint required')
          }
          data = await this.fetchFromAPI(options)
          break
        case 'erp':
          data = this.parseERPData(options)
          break
        default:
          throw new Error(`Unknown source type: ${options.source.type}`)
      }

      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      })

      return {
        success: true,
        recordsCount: data.length,
        data,
        timestamp: new Date(),
      }
    } catch (error) {
      return {
        success: false,
        recordsCount: 0,
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      }
    }
  }

  // Generate realistic mock accounting data for testing
  private static generateMockData(dateRange?: { start: string; end: string }): CSVRow[] {
    const data: CSVRow[] = []
    const startDate = dateRange?.start ? new Date(dateRange.start) : new Date('2025-01-01')
    const endDate = dateRange?.end ? new Date(dateRange.end) : new Date()

    // Common Brazilian chart of accounts
    const accounts = [
      { code: '1.1.1', name: 'Caixa e Equivalentes', type: 'asset' },
      { code: '1.1.2', name: 'Contas a Receber', type: 'asset' },
      { code: '1.1.3', name: 'Estoque', type: 'asset' },
      { code: '1.2.1', name: 'Imobilizado Bruto', type: 'asset' },
      { code: '1.2.2', name: 'Depreciação Acumulada', type: 'asset' },
      { code: '2.1.1', name: 'Contas a Pagar', type: 'liability' },
      { code: '2.1.2', name: 'Empréstimos Curto Prazo', type: 'liability' },
      { code: '2.2.1', name: 'Financiamentos', type: 'liability' },
      { code: '3.1.1', name: 'Capital Social', type: 'equity' },
      { code: '3.2.1', name: 'Lucros Retidos', type: 'equity' },
      { code: '4.1.1', name: 'Receita de Serviços', type: 'revenue' },
      { code: '4.1.2', name: 'Receita de Produtos', type: 'revenue' },
      { code: '5.1.1', name: 'Custos de Materiais', type: 'expense' },
      { code: '5.2.1', name: 'Despesas com Pessoal', type: 'expense' },
      { code: '5.3.1', name: 'Despesas Operacionais', type: 'expense' },
    ]

    // Generate daily transactions for 12 months
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      // Generate 2-4 transactions per day
      const transactionsPerDay = Math.floor(Math.random() * 3) + 2

      for (let t = 0; t < transactionsPerDay; t++) {
        // Randomly select debit and credit accounts (must be different)
        const debitAccount = accounts[Math.floor(Math.random() * accounts.length)]
        let creditAccount = accounts[Math.floor(Math.random() * accounts.length)]
        while (creditAccount.code === debitAccount.code) {
          creditAccount = accounts[Math.floor(Math.random() * accounts.length)]
        }

        // Amount varies by transaction type
        let amount = Math.random() * 10000 + 100

        // More frequent, smaller transactions for cash/receivables
        if (debitAccount.code.startsWith('1.1')) {
          amount = Math.random() * 5000 + 50
        }

        // Larger transactions for revenue
        if (debitAccount.code.startsWith('4')) {
          amount = Math.random() * 50000 + 1000
        }

        data.push({
          date: currentDate.toISOString().split('T')[0],
          accountCode: debitAccount.code,
          accountName: debitAccount.name,
          debit: amount,
          credit: 0,
          description: `Transaction ${data.length + 1}`,
        })

        data.push({
          date: currentDate.toISOString().split('T')[0],
          accountCode: creditAccount.code,
          accountName: creditAccount.name,
          debit: 0,
          credit: amount,
          description: `Transaction ${data.length + 1}`,
        })
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return data
  }

  // Fetch from REST API endpoint
  private static async fetchFromAPI(options: FetchOptions): Promise<CSVRow[]> {
    const { endpoint, apiKey } = options.source
    if (!endpoint) throw new Error('No endpoint provided')

    const url = new URL(endpoint)
    if (options.dateRange?.start) {
      url.searchParams.set('startDate', options.dateRange.start)
    }
    if (options.dateRange?.end) {
      url.searchParams.set('endDate', options.dateRange.end)
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const response = await fetch(url.toString(), { headers })
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    return Array.isArray(result) ? result : result.data || []
  }

  // Parse ERP export format (typically CSV or JSON)
  private static parseERPData(_options: FetchOptions): CSVRow[] {
    // This would handle ERP-specific formats like:
    // - SAP export files
    // - Oracle Financials exports
    // - Totvs/PROTHEUS exports
    // - QuickBooks/Sage exports

    // For now, return empty - would implement format detection
    console.warn('ERP parsing not yet implemented')
    return []
  }

  // Get available accounting data sources
  static getAvailableSources(): AccountingDataSource[] {
    return [
      {
        type: 'mock',
        name: 'Demo Data (Mock)',
        endpoint: 'internal://mock',
      },
      // Real API sources can be configured here
      // {
      //   type: 'api',
      //   name: 'Accounting System API',
      //   endpoint: 'https://api.accounting-system.com/ledger',
      //   apiKey: 'YOUR_API_KEY'
      // },
    ]
  }

  // Validate data integrity before import
  static validateData(data: CSVRow[]): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (data.length === 0) {
      errors.push('No data provided')
      return { valid: false, errors }
    }

    data.forEach((row, idx) => {
      // Check required fields
      if (!row.accountCode || !row.accountName) {
        errors.push(`Row ${idx + 1}: Missing account code or name`)
      }

      // Validate amounts
      if (typeof row.debit === 'string') {
        if (isNaN(parseFloat(row.debit as string))) {
          errors.push(`Row ${idx + 1}: Invalid debit amount`)
        }
      }

      if (typeof row.credit === 'string') {
        if (isNaN(parseFloat(row.credit as string))) {
          errors.push(`Row ${idx + 1}: Invalid credit amount`)
        }
      }

      // Validate date format
      if (row.date) {
        const dateStr = String(row.date)
        if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
          errors.push(`Row ${idx + 1}: Invalid date format (expected YYYY-MM-DD)`)
        }
      }
    })

    return {
      valid: errors.length === 0,
      errors: errors.slice(0, 10), // Limit to first 10 errors
    }
  }

  // Transform and enrich data for Star Schema
  static enrichData(data: CSVRow[]): CSVRow[] {
    return data.map((row) => {
      let dateValue = ''
      if (row.date) {
        if (typeof row.date === 'string') {
          dateValue = row.date
        } else if (typeof row.date === 'object' && 'toISOString' in row.date) {
          dateValue = (row.date as any).toISOString().split('T')[0]
        }
      }

      return {
        ...row,
        // Ensure consistent data types
        debit: typeof row.debit === 'string' ? parseFloat(row.debit) : (row.debit || 0),
        credit: typeof row.credit === 'string' ? parseFloat(row.credit) : (row.credit || 0),
        // Normalize date
        date: dateValue,
      }
    })
  }

  // Clear cache
  static clearCache(): void {
    this.cache.clear()
  }

  // Get cache statistics
  static getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    }
  }

  private static getCacheKey(options: FetchOptions): string {
    return `${options.source.type}:${options.source.name}:${options.dateRange?.start || 'all'}:${
      options.dateRange?.end || 'all'
    }`
  }
}
