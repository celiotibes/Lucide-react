import type {
  StarSchemaDatabase,
  DimDate,
  DimAccount,
  FactBalancete,
  CSVRow,
  ImportResult,
} from '../../types/starSchema'

export class StarSchemaManager {
  private static readonly DB_KEY = 'lucide_star_schema'

  // Initialize empty star schema
  static initializeSchema(): StarSchemaDatabase {
    return {
      dimDate: [],
      dimAccount: [],
      dimCostCenter: [],
      factBalancete: [],
      factIncomeStatement: [],
      factCashFlow: [],
    }
  }

  // Load schema from localStorage
  static loadSchema(): StarSchemaDatabase {
    try {
      const stored = localStorage.getItem(this.DB_KEY)
      return stored ? JSON.parse(stored) : this.initializeSchema()
    } catch (err) {
      if (err instanceof Error && err.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded during load')
      } else if (err instanceof SyntaxError) {
        console.warn('Corrupted schema data, reinitializing')
      }
      return this.initializeSchema()
    }
  }

  // Save schema to localStorage with automatic quota management
  static saveSchema(schema: StarSchemaDatabase): void {
    try {
      localStorage.setItem(this.DB_KEY, JSON.stringify(schema))
    } catch (err) {
      if (err instanceof Error && err.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, attempting cleanup')
        try {
          this.clearOldData()
          localStorage.setItem(this.DB_KEY, JSON.stringify(schema))
        } catch (retryErr) {
          console.error('Failed to save after cleanup:', retryErr)
          // Last resort: clear everything and try again
          try {
            localStorage.clear()
            localStorage.setItem(this.DB_KEY, JSON.stringify(schema))
          } catch (finalErr) {
            console.error('Critical: Cannot save to localStorage', finalErr)
            throw new Error('Storage quota exceeded and cannot be freed')
          }
        }
      } else {
        throw err
      }
    }
  }

  // Get storage usage estimate
  static getStorageStats(): { used: number; available: number; percent: number } {
    let used = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        const value = localStorage.getItem(key) || ''
        used += key.length + value.length
      }
    }

    // Rough estimate: typical localStorage limit is 5-10MB
    const available = 5242880 // 5MB estimate
    return {
      used,
      available,
      percent: Math.round((used / available) * 100),
    }
  }

  // Import CSV data
  static importCSV(csvData: CSVRow[], mappings: Map<string, string>): ImportResult {
    const schema = this.loadSchema()
    const result: ImportResult = {
      success: true,
      totalRows: csvData.length,
      importedRows: 0,
      failedRows: 0,
      errors: [],
      warnings: [],
      timestamp: new Date(),
    }

    // Process each row
    for (let i = 0; i < csvData.length; i++) {
      try {
        const row = csvData[i]

        // Extract mapped values
        const accountCode = row[mappings.get('accountCode') || ''] as string
        const accountName = row[mappings.get('accountName') || ''] as string
        const debit = parseFloat(row[mappings.get('debit') || '0'] as string) || 0
        const credit = parseFloat(row[mappings.get('credit') || '0'] as string) || 0
        const dateStr = row[mappings.get('date') || ''] as string

        // Validate required fields
        if (!accountCode || !accountName) {
          result.failedRows++
          result.errors.push(`Row ${i + 1}: Missing account code or name`)
          continue
        }

        // Create or update account dimension
        const accountKey = this.generateKey('ACC', accountCode)
        const existingAccount = schema.dimAccount.find((a) => a.accountKey === accountKey)

        if (!existingAccount) {
          const newAccount: DimAccount = {
            accountKey,
            accountCode,
            accountName,
            accountType: this.inferAccountType(accountCode),
            category: this.inferCategory(accountName),
            subCategory: accountName.split('-')[1]?.trim() || '',
            isActive: true,
          }
          schema.dimAccount.push(newAccount)
        }

        // Create date dimension if needed
        const dateKey = this.parseDateKey(dateStr)
        if (!schema.dimDate.find((d) => d.dateKey === dateKey)) {
          const dimDate = this.generateDateDimension(dateKey)
          if (dimDate) {
            schema.dimDate.push(dimDate)
          }
        }

        // Create balancete fact
        const factBalancete: FactBalancete = {
          balanceteKey: this.generateKey('BAL', `${accountKey}_${dateKey}`),
          dateKey,
          accountKey,
          costCenterKey: 'DEFAULT',
          debitAmount: debit,
          creditAmount: credit,
          balanceAmount: debit - credit,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        schema.factBalancete.push(factBalancete)
        result.importedRows++
      } catch (err) {
        result.failedRows++
        result.errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    // Save updated schema
    if (result.importedRows > 0) {
      this.saveSchema(schema)
      result.success = true
    } else {
      result.success = false
    }

    return result
  }

  // Query balancete facts
  static queryBalancete(
    schema: StarSchemaDatabase,
    filters?: { dateKey?: string; accountType?: string }
  ): any[] {
    let facts = schema.factBalancete

    if (filters?.dateKey) {
      facts = facts.filter((f) => f.dateKey === filters.dateKey)
    }

    return facts.map((fact) => {
      const account = schema.dimAccount.find((a) => a.accountKey === fact.accountKey)
      return {
        ...fact,
        accountName: account?.accountName || 'Unknown',
        accountType: account?.accountType || 'unknown',
      }
    })
  }

  // Generate summary statistics
  static generateSummary(schema: StarSchemaDatabase): Record<string, any> {
    const totalDebit = schema.factBalancete.reduce((sum, f) => sum + f.debitAmount, 0)
    const totalCredit = schema.factBalancete.reduce((sum, f) => sum + f.creditAmount, 0)
    const uniqueDates = new Set(schema.factBalancete.map((f) => f.dateKey)).size
    const uniqueAccounts = new Set(schema.factBalancete.map((f) => f.accountKey)).size

    return {
      totalRecords: schema.factBalancete.length,
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit,
      uniqueDates,
      uniqueAccounts,
      lastUpdated: new Date(),
    }
  }

  // Private helpers
  private static generateKey(prefix: string, value: string): string {
    const hash = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return `${prefix}_${hash}_${Date.now()}`
  }

  private static generateDateKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
  }

  private static parseDateKey(dateStr: string): string {
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) {
        return this.generateDateKey(new Date())
      }
      return this.generateDateKey(date)
    } catch {
      return this.generateDateKey(new Date())
    }
  }

  private static generateDateDimension(dateKey: string): DimDate | null {
    try {
      const year = parseInt(dateKey.substring(0, 4))
      const month = parseInt(dateKey.substring(4, 6))
      const day = parseInt(dateKey.substring(6, 8))
      const date = new Date(year, month - 1, day)

      if (isNaN(date.getTime())) return null

      return {
        dateKey,
        date,
        year,
        month,
        quarter: Math.ceil(month / 3),
        dayOfWeek: date.getDay(),
        week: this.getWeekNumber(date),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      }
    } catch {
      return null
    }
  }

  private static getWeekNumber(date: Date): number {
    const firstDay = new Date(date.getFullYear(), 0, 1)
    const pastDaysOfYear = (date.getTime() - firstDay.getTime()) / 86400000
    return Math.ceil((pastDaysOfYear + firstDay.getDay() + 1) / 7)
  }

  private static inferAccountType(
    code: string
  ): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' {
    const prefix = code.charAt(0)
    if (prefix === '1') return 'asset'
    if (prefix === '2') return 'liability'
    if (prefix === '3') return 'equity'
    if (prefix === '4') return 'revenue'
    if (prefix === '5') return 'expense'
    return 'asset'
  }

  private static inferCategory(accountName: string): string {
    const parts = accountName.split('-')
    return parts[0]?.trim() || 'Other'
  }

  private static clearOldData(): void {
    const schema = this.loadSchema()
    // Keep only last 90 days of data
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const cutoffKey = this.generateDateKey(ninetyDaysAgo)
    schema.factBalancete = schema.factBalancete.filter((f) => f.dateKey >= cutoffKey)

    this.saveSchema(schema)
  }
}
