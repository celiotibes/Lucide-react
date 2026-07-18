// ============================================================================
// SHARED TYPES
// ============================================================================

export interface User {
  id: string
  email: string
  name: string
  role: string
  avatar?: string
}

export interface Case {
  id: string
  number: string
  status: 'active' | 'paused' | 'concluded'
  title: string
  description?: string
  deadline: string
  progress: number
  clientName?: string
  judge?: string
  lastUpdate?: string
}

export interface Intimation {
  id: string
  number: string
  status: 'pending' | 'processed' | 'archived'
  title: string
  description?: string
  deadline: string
  confidence?: number
  source?: string
  lastUpdate?: string
}

export interface ComplianceMetric {
  id: string
  name: string
  value: number
  target: number
  status: 'compliant' | 'warning' | 'critical'
  description?: string
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high'
  score: number
  lastUpdated: string
  description?: string
}

export interface AuditTrailEntry {
  id: string
  action: string
  description: string
  user?: string
  timestamp: string
  severity: 'info' | 'warning' | 'error'
}

export interface ApiResponse<T> {
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
