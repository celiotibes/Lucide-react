// ============================================================================
// DATE UTILITIES
// ============================================================================

export function formatDate(date: string | Date, locale = 'pt-BR'): string {
  return new Date(date).toLocaleDateString(locale)
}

export function formatDateTime(date: string | Date, locale = 'pt-BR'): string {
  return new Date(date).toLocaleString(locale)
}

export function getDaysUntilDeadline(deadline: string): number {
  const today = new Date()
  const deadlineDate = new Date(deadline)
  const diffTime = deadlineDate.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

export function isDeadlineUrgent(deadline: string, daysThreshold = 7): boolean {
  return getDaysUntilDeadline(deadline) <= daysThreshold
}

// ============================================================================
// STATUS UTILITIES
// ============================================================================

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'compliant':
    case 'success':
      return 'bg-green-500/20 text-green-400'
    case 'paused':
    case 'warning':
      return 'bg-yellow-500/20 text-yellow-400'
    case 'concluded':
    case 'critical':
    case 'error':
      return 'bg-red-500/20 text-red-400'
    case 'pending':
      return 'bg-blue-500/20 text-blue-400'
    default:
      return 'bg-gray-500/20 text-gray-400'
  }
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'Ativo',
    paused: 'Pausado',
    concluded: 'Concluído',
    pending: 'Pendente',
    processed: 'Processado',
    archived: 'Arquivado',
    compliant: 'Conforme',
    warning: 'Aviso',
    critical: 'Crítico',
  }
  return labels[status] || status
}

// ============================================================================
// STRING UTILITIES
// ============================================================================

export function truncate(str: string, length = 50): string {
  return str.length > length ? str.substring(0, length) + '...' : str
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ============================================================================
// NUMBER UTILITIES
// ============================================================================

export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value)
}

export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array))
}

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce(
    (result, item) => {
      const group = String(item[key])
      if (!result[group]) result[group] = []
      result[group].push(item)
      return result
    },
    {} as Record<string, T[]>,
  )
}

export function sortBy<T>(array: T[], key: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key]
    const bVal = b[key]
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return direction === 'asc' ? comparison : -comparison
  })
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

export function isEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isPhoneNumber(phone: string): boolean {
  const phoneRegex = /^\d{10,11}$/
  return phoneRegex.test(phone.replace(/\D/g, ''))
}

export function isValidDate(date: string): boolean {
  return !isNaN(new Date(date).getTime())
}

// ============================================================================
// OBJECT UTILITIES
// ============================================================================

export function omit<T extends Record<string, any>>(obj: T, ...keys: (keyof T)[]): Partial<T> {
  const result = { ...obj }
  keys.forEach((key) => delete result[key])
  return result
}

export function pick<T extends Record<string, any>>(obj: T, ...keys: (keyof T)[]): Partial<T> {
  const result: Partial<T> = {}
  keys.forEach((key) => {
    result[key] = obj[key]
  })
  return result
}
