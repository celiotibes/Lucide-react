/**
 * RAG (Retrieval-Augmented Generation) Types
 * For juridical document analysis and jurisprudence search
 */

export const DocumentType = {
  JURISPRUDENCE: 'jurisprudence',
  LEGISLATION: 'legislation',
  DOCTRINE: 'doctrine',
  CASE_LAW: 'case-law',
  PRECEDENT: 'precedent',
} as const
export type DocumentType = typeof DocumentType[keyof typeof DocumentType]

export const AnalysisType = {
  STRENGTHS: 'strengths',
  WEAKNESSES: 'weaknesses',
  CONTRADICTIONS: 'contradictions',
  JURISPRUDENTIAL_SUPPORT: 'jurisprudential-support',
  GAPS: 'gaps',
  PROCEDURAL_ISSUES: 'procedural-issues',
  COUNTER_ARGUMENTS: 'counter-arguments',
} as const
export type AnalysisType = typeof AnalysisType[keyof typeof AnalysisType]

export interface JurisprudentialReference {
  id: string
  title: string
  tribunal: string
  date: Date
  citation: string
  summary: string
  relevanceScore: number // 0-100
  documentType: DocumentType
  jurisdiction: string
  keywords: string[]
  fullText?: string
  url?: string
}

export interface LegislativeReference {
  id: string
  title: string
  jurisdiction: string
  type: 'law' | 'decree' | 'regulation' | 'resolution'
  date: Date
  articles: Array<{
    number: string
    content: string
  }>
  relevanceScore: number
  keywords: string[]
}

export interface PetitionAnalysisResult {
  documentId: string
  analysisType: AnalysisType
  findings: PetitionFinding[]
  relevantJurisprudence: JurisprudentialReference[]
  relevantLegislation: LegislativeReference[]
  summary: string
  confidence: number // 0-1
  generatedAt: Date
}

export interface PetitionFinding {
  type: AnalysisType
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  location: {
    paragraph?: number
    lineStart?: number
    lineEnd?: number
    excerpt: string
  }
  suggestion?: string
  relatedJurisprudence?: JurisprudentialReference[]
}

export interface RAGSearchQuery {
  query: string
  jurisdiction?: string
  documentTypes?: DocumentType[]
  minRelevance?: number // 0-100
  limit?: number
}

export interface RAGSearchResult {
  documents: JurisprudentialReference[]
  totalCount: number
  executionTime: number
  query: RAGSearchQuery
}

export interface PetitionAnalysisRequest {
  documentId: string
  content: string
  title: string
  analysisTypes: AnalysisType[]
  jurisdiction?: string
}

export interface ComparisonAnalysis {
  petitionContent: string
  jurisprudentialSupport: JurisprudentialReference[]
  gaps: string[]
  strengthScore: number // 0-100
  vulnerabilityScore: number // 0-100
  recommendations: string[]
}

export interface ConflictDetection {
  hasConflicts: boolean
  conflicts: Array<{
    type: 'internal' | 'external'
    description: string
    paragraph1?: number
    paragraph2?: number
    severity: 'critical' | 'high' | 'medium'
    resolution?: string
  }>
}

export interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

export interface RAGConfig {
  enableCaching: boolean
  cacheTTL: number // milliseconds
  minRelevanceThreshold: number
  maxResults: number
  searchTimeout: number
}
