/**
 * Petition Transformer Types
 * For autonomous petition analysis and enhancement
 */

export const InputFormat = {
  MARKDOWN: 'markdown',
  DOCX: 'docx',
  PDF: 'pdf',
  HTML: 'html',
  PLAIN_TEXT: 'plain-text',
} as const
export type InputFormat = typeof InputFormat[keyof typeof InputFormat]

export const OutputFormat = {
  PDF_ABNT: 'pdf-abnt',
  DOCX: 'docx',
  MARKDOWN: 'markdown',
  HTML: 'html',
  ALL: 'all',
} as const
export type OutputFormat = typeof OutputFormat[keyof typeof OutputFormat]

export const TransformationStep = {
  PARSE: 'parse',
  ANALYZE: 'analyze',
  ENHANCE: 'enhance',
  FORMAT: 'format',
  GENERATE_SUMMARY: 'generate-summary',
  DETECT_ISSUES: 'detect-issues',
  APPLY_DESIGN: 'apply-design',
  EXPORT: 'export',
} as const
export type TransformationStep = typeof TransformationStep[keyof typeof TransformationStep]

export interface DocumentMetadata {
  fileName: string
  fileSize: number
  format: InputFormat
  uploadDate: Date
  wordCount: number
  characterCount: number
  pageCount?: number
  extractedText: string
}

export interface ParsedDocument {
  content: string
  metadata: DocumentMetadata
  sections: DocumentSection[]
  extractedFields: ExtractedFields
  warnings: string[]
}

export interface DocumentSection {
  title: string
  content: string
  level: number // 1=heading1, 2=heading2, etc
  startChar: number
  endChar: number
  type: 'header' | 'body' | 'signature' | 'attachments' | 'footer'
}

export interface ExtractedFields {
  petitionType?: string
  parties?: {
    plaintiff?: string
    defendant?: string
    attorney?: string
    tribunal?: string
  }
  actionType?: string
  competence?: string
  legalBasis?: string[]
  facts?: string[]
  claims?: string[]
  arguments?: string[]
  attachmentReferences?: string[]
  signatures?: string[]
}

export interface EnhancedPetition {
  originalContent: string
  enhancedContent: string
  improvements: Improvement[]
  warnings: PetitionWarning[]
  suggestions: string[]
  qualityScore: number // 0-100
  readabilityScore: number // 0-100
  jurisprudentialScore: number // 0-100
}

export interface Improvement {
  type:
    | 'grammar'
    | 'structure'
    | 'clarity'
    | 'legal-precision'
    | 'jurisprudence'
    | 'formatting'
    | 'completeness'
  location: {
    paragraph?: number
    lineStart?: number
    lineEnd?: number
    excerpt: string
  }
  suggestion: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  replacementText?: string
}

export interface PetitionWarning {
  severity: 'critical' | 'high' | 'medium' | 'low'
  message: string
  location?: string
  resolution?: string
}

export interface DesignApplication {
  fontFamily: string
  fontSize: number
  lineHeight: number
  margins: {
    top: number
    right: number
    bottom: number
    left: number
  }
  pageLayout: 'single' | 'double'
  colorScheme: {
    primary: string
    secondary: string
    accent: string
    text: string
    background: string
  }
  highlightRules?: HighlightRule[]
  semanticMarkup: boolean
}

export interface HighlightRule {
  keyword: string
  category: 'important' | 'definition' | 'citation' | 'warning' | 'note'
  color: string
  backgroundColor?: string
  fontWeight?: 'normal' | 'bold'
}

export interface TransformationProgress {
  currentStep: TransformationStep
  completedSteps: TransformationStep[]
  progressPercentage: number
  message: string
  estimatedTimeRemaining: number
}

export interface TransformationResult {
  documentId: string
  originalMetadata: DocumentMetadata
  parsedDocument: ParsedDocument
  enhancedPetition: EnhancedPetition
  exportedFormats: Map<OutputFormat, Blob>
  designApplied: DesignApplication
  generatedAt: Date
  totalProcessingTime: number
  jurisprudentialReferences: any[]
}

export interface PetitionTransformerConfig {
  enableAIEnhancement: boolean
  enableJurisprudenceSearch: boolean
  enableVisualDesign: boolean
  enableAutoFormatting: boolean
  outputFormats: OutputFormat[]
  llmStrategy: 'cost-optimized' | 'speed-optimized' | 'quality-optimized' | 'balanced'
  maxProcessingTime: number
}

export interface ProcessingOptions {
  detectLanguage: boolean
  extractTables: boolean
  preserveFormatting: boolean
  improveReadability: boolean
  addCrossReferences: boolean
  generateTableOfContents: boolean
}
