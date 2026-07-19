/**
 * Strategic Analysis Types
 * Data structures for legal weakness detection and strategic blindaging
 */

export interface LegalWeakness {
  id: string
  category: 'factual' | 'legal' | 'procedural' | 'evidentiary' | 'strategic'
  severity: 'critical' | 'high' | 'medium' | 'low'
  issue: string
  description: string
  potentialImpact: string
  affectedArguments: string[]
}

export interface CounterArgument {
  id: string
  description: string
  legalBasis: string
  likelihood: 'high' | 'medium' | 'low'
  refutation: string
  refutationStrength: 'strong' | 'moderate' | 'weak'
  supportingCases: string[]
}

export interface StrategicRecommendation {
  id: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  type: 'restructure' | 'strengthen' | 'clarify' | 'add-evidence' | 'remove' | 'emphasize'
  description: string
  implementation: string
  expectedImpact: string
  estimatedEffort: 'minimal' | 'low' | 'medium' | 'high'
}

export interface ArgumentBlindage {
  argumentId: string
  argumentText: string
  vulnerabilityScore: number // 0-100, higher = more vulnerable
  criticisms: string[]
  defenses: string[]
  alternativeFraming: string
  supportingAuthorities: string[]
}

export interface StrategicAnalysisResult {
  documentId: string
  documentTitle: string
  analysisDate: Date
  overallWeaknessScore: number // 0-100, higher = weaker case
  overallStrengthScore: number // 0-100, higher = stronger case
  weaknesses: LegalWeakness[]
  counterArguments: CounterArgument[]
  argumentBlimdages: ArgumentBlindage[]
  recommendations: StrategicRecommendation[]
  summary: string
  executiveSummary: string
  confidenceScore: number // 0-100, AI confidence in analysis
}

export interface BlindagePlan {
  id: string
  argumentId: string
  vulnerabilities: string[]
  blindages: Blindage[]
  effectivenessScore: number
}

export interface Blindage {
  technique: 'authority-stacking' | 'narrowing' | 'reframing' | 'precedent-distinction' | 'burden-shifting'
  description: string
  implementation: string
  strength: 'strong' | 'moderate' | 'weak'
}

export interface StrategicMetrics {
  argumentCount: number
  criticalWeaknesses: number
  highWeaknesses: number
  totalWeaknesses: number
  averageWeaknessScore: number
  averageStrengthScore: number
  vulnerableArguments: number
  wellDefendedArguments: number
  needsRestructuring: boolean
  recommendedActions: number
}
