/**
 * Legal Research Type Definitions
 * Types for legal document search, analysis, and comparative research
 */

/**
 * Jurisdições suportadas pelo Legal Data Hunter
 */
export type Jurisdiction =
  | 'BR' | 'AR' | 'CL' | 'CO' | 'PE' | 'VE' | 'BO' | 'PY' | 'UY' // South America
  | 'US' | 'CA' | 'MX' // North America
  | 'PT' | 'ES' | 'FR' | 'DE' | 'IT' | 'GB' | 'NL' | 'BE' | 'AT' | 'CH' | 'SE' | 'DK' | 'NO' | 'FI' | 'PL' // Europe
  | 'EU' // European Union

/**
 * Tipos de documentos jurídicos
 */
export type LegalDocumentType = 'statute' | 'case_law' | 'regulation' | 'doctrine' | 'comparative'

/**
 * Tipos de pesquisa jurídica
 */
export type LegalSearchType = 'statute' | 'case_law' | 'doctrine' | 'all'

/**
 * Parâmetros para pesquisa jurídica
 */
export interface LegalQuery {
  query: string
  jurisdiction: Jurisdiction | Jurisdiction[]
  searchType: LegalSearchType
  filters?: {
    yearFrom?: number
    yearTo?: number
    court?: string
    judge?: string
    topic?: string
    party?: string
  }
  limit?: number
  offset?: number
}

/**
 * Resultado de pesquisa jurídica
 */
export interface LegalResult {
  id: string
  title: string
  jurisdiction: Jurisdiction
  type: LegalDocumentType
  date: string
  citation: string
  excerpt: string
  fullText?: string
  url: string
  relevanceScore: number
  keywords?: string[]
  metadata?: Record<string, unknown>
}

/**
 * Sessão de pesquisa jurídica
 */
export interface LegalResearchSession {
  id: string
  createdAt: Date
  updatedAt: Date
  queries: LegalQuery[]
  results: LegalResult[]
  favorites: string[]
  notes?: string
}

/**
 * Documento jurídico para análise crítica
 */
export interface LegalDocument {
  id: string
  title: string
  type: 'petition' | 'complaint' | 'motion' | 'brief' | 'contract' | 'statute' | 'other'
  content: string
  jurisdiction: Jurisdiction
  caseType?: string
  parties?: {
    plaintiff?: string
    defendant?: string
    counsel?: string
  }
  uploadedAt: Date
  metadata?: Record<string, unknown>
}

/**
 * Análise crítica de petição jurídica
 */
export interface PetitionAnalysis {
  documentId: string
  analysisId: string
  analyzedAt: Date

  summary: string

  strengths: AnalysisPoint[]
  weaknesses: AnalysisPoint[]

  strategicFlaws: StrategicFlaw[]
  missingArguments: MissingArgument[]
  omissions: Omission[]

  opposingDefenses: OpposingDefense[]
  vulnerabilities: Vulnerability[]

  recommendations: Recommendation[]

  confidenceScore: number // 0-1
  complexity: 'low' | 'medium' | 'high'
}

/**
 * Ponto de análise (força ou fraqueza)
 */
export interface AnalysisPoint {
  id: string
  title: string
  description: string
  location: {
    page?: number
    section?: string
    lineStart?: number
    lineEnd?: number
  }
  impact: 'high' | 'medium' | 'low'
  relevantLaw?: string
}

/**
 * Falha estratégica de processo
 */
export interface StrategicFlaw {
  id: string
  title: string
  description: string
  type: 'procedural' | 'substantive' | 'evidence' | 'timing' | 'jurisdiction'
  severity: 'critical' | 'high' | 'medium' | 'low'
  impact: string
  jurisdiction: Jurisdiction
  relatedCase?: string
}

/**
 * Argumento ausente que deveria estar na petição
 */
export interface MissingArgument {
  id: string
  title: string
  description: string
  legalBasis: string
  whyShouldInclude: string
  precedent?: string
  jurisdiction: Jurisdiction
  priority: 'critical' | 'high' | 'medium' | 'low'
}

/**
 * Omissão em documento jurídico
 */
export interface Omission {
  id: string
  title: string
  whatsMissing: string
  consequence: string
  howToFix: string
  legalReference?: string
  severity: 'critical' | 'high' | 'medium' | 'low'
}

/**
 * Possível defesa da parte contrária
 */
export interface OpposingDefense {
  id: string
  title: string
  description: string
  strengthAssessment: 'strong' | 'moderate' | 'weak'
  likelihood: number // 0-1
  howToCounter: string
  relatedPrecedent?: string
  jurisdiction: Jurisdiction
}

/**
 * Vulnerabilidade processual
 */
export interface Vulnerability {
  id: string
  title: string
  description: string
  exploitability: 'high' | 'medium' | 'low'
  impact: string
  mitigation: string
  timeframe: string // e.g., "before filing", "during discovery"
}

/**
 * Recomendação para melhorar petição
 */
export interface Recommendation {
  id: string
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  action: string
  expectedImpact: string
  implementationCost: 'high' | 'medium' | 'low'
  timeframeToImplement: string
}

/**
 * Análise estratégica de blindagem e contra-ataques
 */
export interface StrategicAnalysis {
  analysisId: string
  analyzedAt: Date

  caseOverview: string
  jurisdiction: Jurisdiction

  // Blindagem defensiva
  defensiveBlindage: DefensiveBlindage

  // Análise ofensiva
  offensiveStrategy: OffensiveStrategy

  // Cenários de decisão
  decisionScenarios: DecisionScenario[]

  // Plano de ação
  actionPlan: ActionPlanStep[]

  // Riscos e mitigações
  risks: RiskAssessment[]

  // Timeline e marcos processuais
  timeline: ProcessTimeline

  overallStrengthAssessment: StrengthAssessment
  recommendedApproach: string
}

/**
 * Blindagem defensiva - proteção contra argumentos adversários
 */
export interface DefensiveBlindage {
  mainVulnerabilities: string[]
  shieldingStrategies: {
    vulnerability: string
    defense: string
    precedent?: string
    strength: 'strong' | 'moderate' | 'weak'
  }[]
  worstCaseScenario: string
  contingencyPlans: string[]
}

/**
 * Estratégia ofensiva - argumentos de ataque
 */
export interface OffensiveStrategy {
  primaryAttackVectors: string[]
  secondaryArguments: string[]
  precedentsToInvoke: {
    case: string
    jurisdiction: Jurisdiction
    applicability: string
  }[]
  devilsAdvocateCounters: string[] // O que a outra parte pode usar contra nossos argumentos
  counterToCounters: string[] // Como rebater os contra-argumentos
}

/**
 * Cenário de decisão possível
 */
export interface DecisionScenario {
  id: string
  name: string
  probability: number // 0-1
  description: string
  outcomes: {
    favorable: string
    neutral: string
    unfavorable: string
  }
  nextSteps: string
  likelihood: 'high' | 'medium' | 'low'
}

/**
 * Etapa do plano de ação
 */
export interface ActionPlanStep {
  sequence: number
  title: string
  description: string
  deadline: string
  responsible: string
  resources: string[]
  successCriteria: string
  riskIfOmitted: string
}

/**
 * Avaliação de risco
 */
export interface RiskAssessment {
  id: string
  riskDescription: string
  probability: number // 0-1
  impact: 'critical' | 'high' | 'medium' | 'low'
  mitigation: string
  contingency: string
  owner: string
}

/**
 * Timeline de processo
 */
export interface ProcessTimeline {
  currentPhase: string
  keyMilestones: {
    date: string
    milestone: string
    action: string
    importance: 'critical' | 'high' | 'medium'
  }[]
  deadlines: {
    description: string
    dueDate: string
    daysRemaining: number
    priority: 'critical' | 'high'
  }[]
  estimatedResolution: string
}

/**
 * Avaliação geral de força
 */
export interface StrengthAssessment {
  overallStrength: 'very strong' | 'strong' | 'moderate' | 'weak' | 'very weak'
  strengthScore: number // 1-10
  winProbability: number // 0-1
  keyStrengths: string[]
  keyWeaknesses: string[]
  criticalSuccessFactors: string[]
}

/**
 * Comparação entre jurisdições
 */
export interface JurisdictionComparison {
  topic: string
  jurisdictions: Jurisdiction[]
  comparisonDate: Date

  similaritiesOverall: string
  differencesOverall: string

  byJurisdiction: {
    jurisdiction: Jurisdiction
    approach: string
    keyLaws: string[]
    caseHistories: string[]
    prosCons: {
      advantages: string[]
      disadvantages: string[]
    }
  }[]

  recommendedJurisdiction: Jurisdiction
  reasonsForRecommendation: string[]
}
