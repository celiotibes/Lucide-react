/**
 * Jurisprudence Timeline Types
 * Data structures for temporal visualization of case law evolution
 */

export interface TimelineEvent {
  id: string
  date: Date
  year: number
  title: string
  description: string
  tribunal: string
  caseNumber: string
  decision: 'favorable' | 'unfavorable' | 'mixed'
  legalArea: string
  keywords: string[]
  citations: string[]
  importance: 'high' | 'medium' | 'low'
  impact: string
  fullText?: string
}

export interface TimelineCluster {
  year: number
  events: TimelineEvent[]
  trend: 'strengthening' | 'weakening' | 'stable' | 'shifting'
  trendDescription: string
}

export interface TimelineAnalysis {
  legalIssue: string
  startYear: number
  endYear: number
  totalEvents: number
  clusters: TimelineCluster[]
  majorTurningPoints: TimelineEvent[]
  currentTrend: 'favorable' | 'unfavorable' | 'mixed' | 'evolving'
  summary: string
  recommendations: string[]
}

export interface TimelineFilter {
  legalArea?: string
  tribunal?: string
  decisionType?: 'favorable' | 'unfavorable' | 'mixed'
  importance?: 'high' | 'medium' | 'low'
  dateRange?: {
    startYear: number
    endYear: number
  }
}

export interface TimelineStats {
  totalCases: number
  favorableCases: number
  unfavorableCases: number
  mixedCases: number
  favorablePercentage: number
  criticalTurningPoints: number
  trendsIdentified: string[]
}
