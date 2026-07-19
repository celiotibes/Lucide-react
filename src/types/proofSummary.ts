/**
 * Proof Summary Framework
 * Estrutura estratégica de provas para refutar contestação da parte contrária
 * Parte integral de Hermenêutica Blindada
 */

export interface ContestationAnalysis {
  expectedContestations: string[]
  vulnerabilityAreas: string[]
  preemptiveRefutations: string[]
}

export interface ProofSummaryFact {
  factId: string
  allegation: string
  logicalWeight: 'critical' | 'supporting' | 'contextual'
  proofStrength: number // 0-100
  supportingEvidence: ProofElement[]
  counterarguments: CounterargumentShield[]
  jurisprudentialSupport: JurisprudentialCitation[]
}

export interface ProofElement {
  type: 'documentary' | 'testimonial' | 'expert' | 'digital' | 'circumstantial'
  description: string
  annexReference: string // ANEXO_01, etc
  credibilityScore: number // 0-100
  corroborationLevel: 'sole' | 'supported' | 'multiple' // Reforço
  hermeneuticInterpretation?: string // Interpretação jurídica favorável
}

export interface CounterargumentShield {
  potentialContestaton: string
  refutationStrategy: 'direct' | 'contextual' | 'jurisprudential' | 'procedural'
  blindageMechanism: string // Mecanismo de Hermenêutica Blindada
  supportingCitation?: string
  fallbackPosition?: string // Posição secundária se contestado
  strengthRating: number // 0-100
}

export interface JurisprudentialCitation {
  accordNumber: string // STF ADI 5938, STJ REsp 123456
  tribunal: 'STF' | 'STJ' | 'TJPR' | 'TJSC' | 'TRF4'
  date: Date
  ementa: string
  relevance: 'binding' | 'persuasive' | 'analogous'
  citationPurpose: string // Como a jurisprudência reforça o argumento
}

export interface ProofSummaryFramework {
  petitionId: string
  executiveSummary: ExecutiveSummary
  factsSummary: ProofSummaryFact[]
  contestationAnalysis: ContestationAnalysis
  strategicHermeneutics: StrategicHermeneutics
  conclusiveSynthesis: ConclusiveSynthesis
  generatedAt: Date
}

export interface ExecutiveSummary {
  mainArgument: string // Tese central em 1 frase
  keyProofs: string[] // 3-5 provas mais fortes
  expectedOutcome: string // Resultado esperado
  riskAssessment: string // Maiores riscos
  hermeneuticShield: string // Proteção jurídica principal
}

export interface StrategicHermeneutics {
  ethosApproach: {
    authorityBasedOn: string
    credibilityMarkers: string[]
  }
  pathosApproach: {
    emotionalResonance: string
    fairnessArguments: string[]
  }
  logosApproach: {
    logicalStructure: string
    syllogisms: SyllogisticChain[]
  }
  kairosApproach: {
    timelinessJustification: string
    opportunityToJustice: string
  }
}

export interface SyllogisticChain {
  majorPremise: string // Regra jurídica
  minorPremise: string // Fato provado
  conclusion: string // Conclusão obrigatória
  jurisprudentialBasis?: string
}

export interface ConclusiveSynthesis {
  synthesisStatement: string // Síntese final dos argumentos
  requestedRelief: string // Pedido com fundamentação
  alternativeRelief: string // Pedido subsidiário
  proceduralSafeguards: string[] // Proteções procedimentais contra contestação
}

// Template para petição com prova resumida
export interface ProofSummarySection {
  heading: string
  content: string
  htmlRendering: string
  markdown: string
}

// Quadro de resposta estratégica a contestações
export interface ContestationResponseMatrix {
  expectedContestationPoints: string[]
  ourDirectRefutations: RefutationPair[]
  jurisprudentialWeapons: JurisprudentialCitation[]
  proceduralSafeguards: ProceduralSafeguard[]
}

export interface RefutationPair {
  contestation: string
  directResponse: string
  logicalBasis: string
  supportingProof: string // ANEXO_XX reference
  backupResponse?: string
}

export interface ProceduralSafeguard {
  type: 'temporal' | 'formal' | 'substantive' | 'evidentiary'
  description: string
  protectsAgainst: string
  applicableLaw: string
}

// Modelo para geração de texto (compatível com Claude API)
export interface ProofTextGenerationPrompt {
  factId: string
  allegation: string
  evidence: ProofElement[]
  jurisprudence: JurisprudentialCitation[]
  expectedContestations: string[]
  hermeneuticContext: string
  tone: 'formal' | 'persuasive' | 'technical'
  outputFormat: 'paragraph' | 'listicle' | 'table' | 'dialogue'
}

export interface GeneratedProofText {
  factId: string
  generatedContent: string
  readabilityScore: number // Flesch-Kincaid
  persuasivenessScore: number // 0-100 subjective
  hermeneuticCoverage: string[] // Qual prong de Ethos/Pathos/Logos/Kairos
  suggestedCitations: string[] // Sugestões de citações para reforço
}
