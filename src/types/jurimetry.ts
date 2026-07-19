/**
 * Jurimetria: Análise Quantitativa de Força Probatória
 * Taxa de Cobertura Probatória (TCP), Distribuição de Força, Análise de Gaps
 */

export interface FactProof {
  factId: string
  allegation: string
  proofType: 'documentary' | 'testimonial' | 'expert' | 'digital'
  certaintyDegree: number // 0-100
  proofWeight: 'substancial' | 'moderate' | 'fragile'
  sources: string[] // Anexos que respaldam (ex: ANEXO_01, ANEXO_02)
}

export interface FactStrengthDistribution {
  high: number // Fatos com 80-100% certeza
  moderate: number // 50-80%
  fragile: number // <50%
}

export interface ArgumentProofCorrelation {
  argument: string
  supportingProofs: string[]
  weaknessesInDefense: string[]
  counterargumentRisk: number // 0-100
  shieldingStrength: number // 0-100 (capacidade de Hermenêutica Blindada)
}

export interface JurimetricAnalysis {
  tcp: number // Taxa de Cobertura Probatória (%)
  averageCertaintyDegree: number // Média ponderada de certeza
  factStrengthDistribution: FactStrengthDistribution
  argumentVsProofMatrix: ArgumentProofCorrelation[]
  riskGaps: string[] // Lacunas críticas de prova
  jurimetricScore: number // 0-100 (saúde geral da petição)
  visualMatrix: VisualProofMatrix[]
}

export interface VisualProofMatrix {
  rowNumber: number
  argument: string
  proofType: string
  certainty: string // "85%"
  supportingDocs: string
  strengthBar: string // Visual representation (█░░░░░░░░ 35%)
}

// Média de otimização de mídia para CNNs
export interface MediaAsset {
  filename: string
  filepath: string
  dimensions: {
    width: number
    height: number
    dpi: number
  }
  content: {
    altText: string // Descrição para IA
    ocrText?: string // Texto extraído via OCR
    metadata: {
      capturedDate?: Date
      location?: string
      authenticityHash: string // SHA-256
    }
  }
  optimizedFor: 'cnn' | 'ocr' | 'both'
}

export interface OptimizedAsset {
  originalFilename: string
  optimizedFilename: string
  dimensions: string // "1200x675"
  originalSizeKb: number
  optimizedSizeKb: number
  compressionRatio: number // Percentage
  ocrText: string
  sha256: string
  readyForCnn: boolean
  metadata: {
    capturedDate?: string
    location?: string
    authenticityHash: string
  }
}

export interface MediaMetadata {
  totalAssets: number
  totalCompressionSavings: number
  allReadyForCnn: boolean
  assets: OptimizedAsset[]
}

// Contingência para anexos ilegíveis
export interface UnreadableAssetContingency {
  annexId: string
  originalFilename: string
  reasonUnreadable: 'corrupted' | 'encrypted' | 'damaged_scan' | 'legacy_format'
  semanticTranslation: {
    transcription?: string // Transcrição/resumo amigável para IA
    description: string // Descrição textual do conteúdo
    authenticityProof: {
      notarialAct?: string // Referência a ata notarial
      sha256Original: string // Hash do arquivo original
      dateRecovered: Date
    }
  }
  accessibilityAlternative: {
    googleDriveLink: string
    description: string
    restrictedToTribunal: boolean
  }
  jurisprudentialCitation?: string // Citação que valida aceitação mesmo ilegível
}

// Anexo com metadata semântica completa
export interface AnnexMetadata {
  annexNumber: string
  filename: string
  filepath: string
  fileSize: number
  fileType: string
  sha256: string
  registeredAt: string
  googleDriveId?: string
  googleDriveLink?: string
  sharingPermissions: {
    role: 'reader' | 'writer' | 'commenter'
    type: 'domain' | 'user' | 'group'
    domain?: string // ex: tjpr.jus.br
  }
  semanticMetadata: {
    type: 'document_structured' | 'data_mathematical' | 'media_image' | 'media_audio' | 'media_video' | 'unknown'
    relevance: 'high' | 'medium' | 'low'
    correspondentFacts: string[] // Link para FactIds
  }
}

export interface SemanticIndex {
  caseMetadata: {
    processoNumber: string
    tribunal: 'TJPR' | 'TJSC' | 'TJMT' | 'TJRO' | 'TRF4' | 'JFPR'
    exportedAt: string
  }
  annexesIndex: SemanticIndexEntry[]
  crossReferences: Record<string, string[]>
  semanticTags: string[]
}

export interface SemanticIndexEntry {
  annexId: string
  filename: string
  type: string
  hash: string
  link: string
  sharingProtocol: 'domain_restricted' | 'public' | 'private'
  accessibleBy: string[]
  extractedContent: {
    fulltext?: string
    entities: string[]
    keywords: string[]
  }
}
