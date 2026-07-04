/**
 * Judicial Infrastructure Types
 * Integration with Brazilian court systems (TJPR, TJSC, TRF4, PJe, Eproc)
 */

import type { PetitionAnalysis, StrategicAnalysis } from './legal'

// ============================================================================
// PROOF CORRELATION MATRIX (Matriz de Correlação Probatória)
// ============================================================================

export interface FactProofMapping {
  id: string
  allegFact: string
  documentaryProof: string
  annexNumber: string
  eventNumber?: string // Eproc/PJe event reference
  quickAccessLink: string // Direct link to Google Drive or Eproc
  qrCode?: string // QR code for multimídia
  proofType: 'documentary' | 'testimonial' | 'expert' | 'digital' | 'photographic'
  strength: 'high' | 'medium' | 'low'
  verifiedAt?: Date
}

export interface ProofCorrelationMatrix {
  id: string
  petitionId: string
  facts: FactProofMapping[]
  totalProofs: number
  strengthScore: number // 1-10
  generatedAt: Date
  updatedAt: Date
}

// ============================================================================
// SEMANTIC METADATA INDEX (Índice de Metadados para IA)
// ============================================================================

export interface SemanticMetadataIndex {
  // Petition classification
  petitionType: string[] // #PetitionType, #Inicial, #Apelação, #Moção, #Parecer
  tribunal: string[] // #TJPR, #TJSC, #TRF4, #VaraDoTrabalhoDePrudentópolis

  // Parties
  parties: string[] // #Plaintiff:PessoaJurídica, #Defendant:PessoaFísica
  partiesStructured: {
    plaintiffs: string[]
    defendants: string[]
    interveners?: string[]
  }

  // Administrative data
  submissionDate: Date
  caseNumber?: string
  correspondingCase?: string

  // Legal classification
  legalThemes: string[] // #DireitoContratual, #ResponsabilidadeCivil, #ObrigaçãoDeIndenizar
  applicableLaws: string[] // #Lei8078_CDC, #CC_1970, #CC_1972, #CC_1973
  keyJurisprudence: string[] // #SumulaSTJ_7, #SumulaSTF_223, #TemaRepetitivo_0087

  // Relief sought
  seekedTutorship: string[] // #TutelaDeUrgência, #TutelaDeMérito, #Ordinária, #GratuidadeDeJustiça
  suedValue: string // "R$ 250.000,00" or "Indeterminado"
  priority: string[] // #Idoso, #CautelarUrgente, #GratuidadeJustiça

  // Judicial AI markers
  riskMarkers?: string[] // #AbusiveLitigation, #RepeatedCase, #PreventiveLawsuit
}

// ============================================================================
// BINDING JURISPRUDENCE QUAD (Quadro de Jurisprudência Vinculante Confrontada)
// ============================================================================

export interface BindingJurisprudenceQuad {
  id: string
  accordNumber: string // STF ADI 5938, STJ EREsp 1654567, etc.
  date: Date
  relator: string // Min. Nome Completo
  ementa: string // Legal summary
  sha256Hash: string // Verification of authenticity against official repositories
  sourceLink: string // https://jurisprudencia.stf.jus.br, https://jurisprudencia.stj.jus.br
  relevance: 'binding' | 'persuasive' | 'refuted'
  notes?: string
  verifiedAt?: Date
  officialVerificationLink?: string
}

// ============================================================================
// JUDICIAL COMPLIANCE ASSESSMENT
// ============================================================================

export interface JudicialComplianceReport {
  petitionId: string

  // Structural assessments
  petitionAnalysis: PetitionAnalysis
  proofMatrix: ProofCorrelationMatrix
  metadataIndex: SemanticMetadataIndex
  jurisprudenceQuad: BindingJurisprudenceQuad[]

  // Security assessments
  promptInjectionRisk: {
    riskLevel: 'safe' | 'warning' | 'danger'
    findings: string[]
    verifiedAt: Date
  }

  // Trial system compatibility
  eprocessCompatibility: {
    status: 'full' | 'partial' | 'incompatible'
    missingRequirements?: string[]
    notes?: string
  }

  pjeCompatibility: {
    status: 'full' | 'partial' | 'incompatible'
    missingRequirements?: string[]
    notes?: string
  }

  // AI Judicial assessment
  bernAtaliaiaRiskScore: {
    score: number // 0-100
    abusivityLevel: 'low' | 'moderate' | 'high' | 'critical'
    riskFactors: string[]
  }

  // Semantic validation
  semanticValidation: {
    headingStructure: 'valid' | 'invalid'
    tableStructure: 'valid' | 'invalid'
    citationAuthenticity: 'verified' | 'unverified' | 'fraudulent'
    metadataCompleteness: number // 0-100%
  }

  // Hermeneutic shield
  hermeneuticShieldScore: number // 0-100

  // Overall assessment
  recommendedActions: string[]
  riskSummary: string
  generatedAt: Date
}

// ============================================================================
// ANNEXATION MANAGEMENT (Gerenciamento de Anexos)
// ============================================================================

export interface AnnexMetadata {
  annexNumber: string // ANEXO_01, ANEXO_02, etc.
  originalName: string
  standardizedName: string
  filePath: string
  fileSize: number // in bytes
  fileType: string // .pdf, .doc, .xlsx, etc.
  sha256Hash: string // Verification of file integrity
  processedAt: Date
  googleDriveLink?: string
  eprocessEventLink?: string // Direct Eproc event reference
  description?: string
}

export interface AnnexationStandardizationResult {
  status: 'success' | 'error'
  processingTime: string
  totalAnnexes: number
  annexes: AnnexMetadata[]
  googleDriveFolderId?: string
  uploadStatus?: 'pending' | 'in_progress' | 'completed' | 'failed'
}

// ============================================================================
// TRIAL SYSTEM INTEGRATION (Integração com Sistemas Processuais)
// ============================================================================

export interface MNIIntegrationConfig {
  // Modelo Nacional de Interoperabilidade (CNJ)
  protocol: 'SOAP' | 'REST'
  dataFormat: 'XML' | 'JSON'
  targetSystem: 'eproc' | 'pje' | 'projudi'
  tribunalCode: string // TJPR, TJSC, TRF4, etc.
  apiEndpoint: string
  authentication: {
    type: 'oauth2' | 'certificate' | 'token'
    credentials: Record<string, unknown>
  }
}

export interface TrialSystemCompatibility {
  system: 'eproc' | 'pje' | 'projudi'
  tribunal: string
  requirements: {
    encoding: string // UTF-8
    pageSize: string // A4
    semanticHeadings: boolean
    structuredTables: boolean
    activeHyperlinks: boolean
    xmlMetadata?: boolean
    javaCompatible?: boolean
  }
  fulfillmentRate: number // 0-100%
  missingRequirements: string[]
}

// ============================================================================
// CALL-OUT BOX (Caixa de Destaque para UX)
// ============================================================================

export interface CallOutBox {
  id: string
  type: 'proof' | 'jurisprudence' | 'citation' | 'important' | 'warning'
  title: string
  description: string
  linkText: string
  linkUrl: string
  icon: 'pdf' | 'link' | 'qrcode' | 'alert' | 'checkmark'
  backgroundColor?: string
  borderColor?: string
  accessibilityLabel?: string
}

// ============================================================================
// JUDICIAL DOCUMENT EXPORT
// ============================================================================

export interface JudicialDocumentExport {
  petitionId: string
  format: 'pdf' | 'docx' | 'html'
  exportDate: Date

  // PDF specific
  pdf?: {
    semanticHeadings: boolean
    activeHyperlinks: boolean
    bookmarks: string[]
    metadata: Record<string, string>
    pageSize: 'A4'
    compression: 'balanced' | 'high' | 'low'
    adobeAcrobatVersion: string
  }

  // DOCX specific
  docx?: {
    stylePreset: 'judicial' | 'corporate' | 'academic'
    semanticStructure: boolean
    trackChanges: boolean
  }

  // HTML specific
  html?: {
    semanticHTML5: boolean
    responsiveCSS: boolean
    printStyles: boolean
  }

  checksumSHA256: string
  verificationLink?: string
}

// ============================================================================
// HERMENEUTIC REVIEW FOR JUDICIAL CONTEXT
// ============================================================================

export interface JudicialHermeneuticReview {
  petitionId: string

  // Argument structure
  argumentStructure: {
    logos: string[] // Fact-based arguments
    ethos: string[] // Authority-based arguments
    pathos: string[] // Appeal-based arguments (legitimate)
    kairos: string[] // Timing-based arguments
  }

  // Anticipated counter-arguments
  anticipatedCounterarguments: {
    argument: string
    response: string
    shieldingJurisprudence: string[]
  }[]

  // Weakness analysis
  weaknesses: {
    location: string // Section reference
    weakness: string
    riskLevel: 'high' | 'medium' | 'low'
    suggestedFix: string
  }[]

  // Overall shield score
  shieldScore: number // 0-100
  shieldAssessment: string
}
