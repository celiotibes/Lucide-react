/**
 * Accounting & Tax Research Type Definitions
 * Types for accounting regulations, tax analysis, audit, and forensic accounting
 */

/**
 * Tipos de pesquisa contábil
 */
export type AccountingSearchType = 'tax' | 'audit' | 'regulation' | 'standard' | 'forensic'

/**
 * Jurisdições contábeis suportadas
 */
export type AccountingJurisdiction = 'BR' | 'US' | 'EU' | 'GB' | 'CA' | 'AU'

/**
 * Parâmetros para pesquisa contábil
 */
export interface AccountingQuery {
  type: AccountingSearchType
  jurisdiction: AccountingJurisdiction | AccountingJurisdiction[]
  year: number
  keywords: string[]
  filters?: {
    topic?: string
    standard?: string // IFRS, GAAP, GAAB, etc.
    regulation?: string
  }
  limit?: number
}

/**
 * Documento contábil/fiscal
 */
export interface AccountingDocument {
  id: string
  title: string
  jurisdiction: AccountingJurisdiction
  type: 'law' | 'regulation' | 'guidance' | 'standard' | 'ruling' | 'instruction'
  date: string
  reference: string // Lei 10.150/2015, etc
  excerpt: string
  fullText?: string
  url?: string
  keywords?: string[]
  applicableYear?: number
}

/**
 * Sessão de pesquisa contábil
 */
export interface AccountingResearchSession {
  id: string
  createdAt: Date
  updatedAt: Date

  queries: AccountingQuery[]
  results: AccountingDocument[]

  favorites: string[]
  analyses: AccountingAnalysis[]

  notes?: string
}

/**
 * Análise de conformidade fiscal
 */
export interface TaxComplianceAnalysis {
  analysisId: string
  company: {
    name: string
    cnpj: string
    jurisdiction: AccountingJurisdiction
    fiscalYear: number
  }

  analysisDate: Date
  analysisType: 'irpf' | 'irpj' | 'icms' | 'pis_cofins' | 'nfe' | 'efd' | 'sped' | 'comprehensive'

  // Checklist de conformidade
  complianceCheckList: ComplianceItem[]

  // Problemas encontrados
  nonCompliances: NonCompliance[]

  // Riscos identificados
  taxRisks: TaxRisk[]

  // Recomendações
  recommendations: TaxRecommendation[]

  // Score de conformidade
  complianceScore: number // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical'

  // Próximos passos
  actionItems: ActionItem[]

  // Relatório executivo
  executiveSummary: string
}

/**
 * Item de checklist de conformidade
 */
export interface ComplianceItem {
  id: string
  requirement: string
  regulation: string
  isCompliant: boolean
  dueDate?: string
  notes?: string
  evidence?: string[]
}

/**
 * Não-conformidade encontrada
 */
export interface NonCompliance {
  id: string
  issue: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  regulation: string
  impact: string
  correctionRequired: boolean
  deadline?: string
  estimatedCost: 'high' | 'medium' | 'low'
}

/**
 * Risco fiscal identificado
 */
export interface TaxRisk {
  id: string
  description: string
  probability: number // 0-1
  potentialExposure: number // Em reais/dólares
  regulatoryBasis: string
  mitigation: string
  owner: string
}

/**
 * Recomendação fiscal
 */
export interface TaxRecommendation {
  id: string
  title: string
  description: string
  potentialSavings?: number
  implementationComplexity: 'simple' | 'moderate' | 'complex'
  timeframe: string
  priorityLevel: 'critical' | 'high' | 'medium' | 'low'
  relatedRegulations: string[]
}

/**
 * Item de ação
 */
export interface ActionItem {
  id: string
  action: string
  responsible: string
  dueDate: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'not_started' | 'in_progress' | 'completed'
  notes?: string
}

/**
 * Análise de auditoria
 */
export interface AuditAnalysis {
  auditId: string
  company: {
    name: string
    cnpj: string
    fiscalYear: number
  }

  auditDate: Date
  auditScope: string
  auditType: 'external' | 'internal' | 'forensic'

  // Achados de auditoria
  findings: AuditFinding[]

  // Observações
  observations: string[]

  // Recomendações
  auditRecommendations: AuditRecommendation[]

  // Risco geral
  auditRiskAssessment: {
    overallRisk: 'high' | 'medium' | 'low'
    controlRisk: number // 0-1
    detectionRisk: number // 0-1
  }

  // Opinião de auditoria
  auditOpinion: 'unqualified' | 'qualified' | 'adverse' | 'disclaimer'
  auditOpinionDescription: string

  // Próximas etapas
  followUpActions: string[]
}

/**
 * Achado de auditoria
 */
export interface AuditFinding {
  id: string
  category: 'financial_reporting' | 'internal_controls' | 'compliance' | 'operational_efficiency'
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'

  // Criterio (que deveria ser)
  criteria: string

  // Condição (o que foi encontrado)
  condition: string

  // Causa
  cause: string

  // Impacto
  impact: string

  // Recomendação de remediação
  remediation: string

  managementResponse?: string
  estimatedResolutionDate?: string
}

/**
 * Recomendação de auditoria
 */
export interface AuditRecommendation {
  id: string
  relatedFinding: string
  recommendation: string
  benefitDescription: string
  estimatedCost: 'high' | 'medium' | 'low'
  implementationTimeframe: string
  priority: 'critical' | 'high' | 'medium' | 'low'
}

/**
 * Análise forense contábil
 */
export interface ForensicAccounting {
  caseId: string
  caseType: 'fraud_investigation' | 'asset_valuation' | 'dispute_resolution' | 'loss_quantification' | 'other'

  investigationDate: Date
  investigator: string

  // Escopo da investigação
  scope: string

  // Documentação revisada
  documentsReviewed: {
    documentType: string
    quantity: number
    period: string
  }[]

  // Achados principais
  keyFindings: ForensicFinding[]

  // Conclusões
  conclusions: string

  // Quantificação de danos/perdas
  damageQuantification?: {
    damageType: string
    amount: number
    currency: string
    calculationMethod: string
  }

  // Suporte a litígio
  litigationSupport?: {
    expertReport: string
    testimonyPoints: string[]
    potentialDefenses: string[]
  }
}

/**
 * Achado forense
 */
export interface ForensicFinding {
  id: string
  description: string
  evidence: {
    type: string
    source: string
    reliability: 'high' | 'medium' | 'low'
  }[]
  significance: 'critical' | 'high' | 'medium' | 'low'
  timeline: {
    eventDate: string
    discoveryDate: string
  }
  impliedFraud?: boolean
  potentialValue?: number
}

/**
 * Análise contábil genérica
 */
export interface AccountingAnalysis {
  analysisId: string
  analysisType: AccountingSearchType
  analysisDate: Date

  subject: string
  jurisdiction: AccountingJurisdiction

  applicableRules: AccountingDocument[]

  analysis: string

  findings: {
    key_point: string
    implication: string
    recommendation: string
  }[]

  relatedCases?: string[]
  references?: string[]
}

/**
 * Rastreamento de conformidade (Audit Trail)
 */
export interface AuditTrail {
  trailId: string
  transactionId: string
  timestamp: Date

  action: string // Create, Update, Delete, View, etc
  user: string

  beforeValue?: Record<string, unknown>
  afterValue?: Record<string, unknown>

  reason?: string
  documentReference?: string

  ipAddress?: string
  system: string
}

/**
 * Relatório de conformidade
 */
export interface ComplianceReport {
  reportId: string
  reportDate: Date
  reportingPeriod: {
    startDate: Date
    endDate: Date
  }

  company: {
    name: string
    cnpj: string
    jurisdiction: AccountingJurisdiction
  }

  regulations: string[] // Quais regulamentações foram verificadas

  assessmentResults: {
    regulation: string
    status: 'compliant' | 'non_compliant' | 'partial_compliance' | 'not_applicable'
    details: string
    evidenceLocation: string
  }[]

  overallComplianceStatus: 'compliant' | 'non_compliant' | 'partial_compliance'
  compliancePercentage: number // 0-100

  areasOfConcern: string[]
  actionPlan: {
    action: string
    deadline: string
    owner: string
    priority: 'critical' | 'high' | 'medium'
  }[]

  nextReviewDate: Date

  approvedBy: string
  signatureDate: Date
}

/**
 * Glossário de termos contábeis/fiscais
 */
export interface AccountingGlossary {
  [key: string]: {
    term: string
    definition: string
    applicableJurisdictions: AccountingJurisdiction[]
    relatedTerms?: string[]
    references?: string[]
  }
}
