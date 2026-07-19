/**
 * Outcome Prediction Types
 * Case success probability and prediction analysis
 */

export interface CaseOutcomePrediction {
  successProbability: number // 0-100
  confidenceLevel: number // 0-100
  riskLevel: 'low' | 'medium' | 'high' // Risk of losing
  recommendation: 'proceed' | 'proceed-cautiously' | 'reconsider'
  keyFactors: PredictionFactor[]
  improvementOpportunities: string[]
  historicalComparison: HistoricalComparison
  detailedAnalysis: string
  warningsAndRisks: string[]
  strengthScores: StrengthScores
}

export interface PredictionFactor {
  factor: string
  weight: number // 0-1
  impact: 'positive' | 'negative' | 'neutral'
  contribution: number // -25 to +25 to final score
  description: string
}

export interface HistoricalComparison {
  similarCases: number
  successRate: number // percentage
  averageOutcome: 'favorable' | 'unfavorable' | 'settlement'
  reasonsForOutcome: string[]
  applicablePrecedents: string[]
}

export interface StrengthScores {
  factualStrength: number // 0-100
  legalFoundation: number // 0-100
  evidentiarySupport: number // 0-100
  proceduralCompliance: number // 0-100
  strategicPositioning: number // 0-100
  overallQuality: number // 0-100
}

export interface PredictionDetails {
  documentId: string
  analysisDate: Date
  legalArea: string
  petitionLength: number
  argumentCount: number
  prediction: CaseOutcomePrediction
}
