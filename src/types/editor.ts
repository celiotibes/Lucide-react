/**
 * Complete Type Definitions for Editor (Sprint 5 + Expansions)
 * Includes: Document Types, Templates, Formatting, AI, Attachments, Ementa, Versioning
 */

// ==================== BASE ENUMS ====================

export const TemplateType = {
  PETITION: 'petition',
  APPEAL: 'appeal',
  OPINION: 'opinion',
  CONTRACT: 'contract',
  MOTION: 'motion',
  BLANK: 'blank',
} as const

export type TemplateType = typeof TemplateType[keyof typeof TemplateType]

export const DocumentStatus = {
  DRAFT: 'draft',
  SAVED: 'saved',
  FINALIZED: 'finalized',
  ARCHIVED: 'archived',
} as const

export type DocumentStatus = typeof DocumentStatus[keyof typeof DocumentStatus]

export const ExportFormat = {
  PDF: 'pdf',
  DOCX: 'docx',
  ODT: 'odt',
  MARKDOWN: 'markdown',
  HTML: 'html',
} as const

export type ExportFormat = typeof ExportFormat[keyof typeof ExportFormat]

export const TextAlignment = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right',
  JUSTIFY: 'justify',
} as const

export type TextAlignment = typeof TextAlignment[keyof typeof TextAlignment]

export const SuggestionType = {
  STRENGTHENING: 'strengthening',
  WEAKNESS: 'weakness',
  FORMATTING: 'formatting',
  SPELLING: 'spelling',
  CITATION: 'citation',
  LEGAL_BLINDAGE: 'legal_blindage',
} as const

export type SuggestionType = typeof SuggestionType[keyof typeof SuggestionType]

// ==================== EXPANSION ENUMS: ATTACHMENTS ====================

export const AttachmentType = {
  DOCUMENT: 'document',
  IMAGE: 'image',
  VIDEO: 'video',
  SPREADSHEET: 'spreadsheet',
  COMPRESSED: 'compressed',
} as const

export type AttachmentType = typeof AttachmentType[keyof typeof AttachmentType]

export const AttachmentSource = {
  LOCAL: 'local',
  GOOGLE_DRIVE: 'google_drive',
  ONE_DRIVE: 'one_drive',
  DROPBOX: 'dropbox',
} as const

export type AttachmentSource = typeof AttachmentSource[keyof typeof AttachmentSource]

// ==================== BASE DOCUMENT TYPES ====================

export interface LegalDocument {
  id: string
  userId?: string
  title: string
  content: string
  plainText: string
  templateType: TemplateType
  status: DocumentStatus
  version: number

  // Formatting
  abntFormat: boolean
  spellCheckDone: boolean
  aiAnalysisDone: boolean

  // Metadata
  characterCount: number
  wordCount: number
  pageCount: number
  estimatedReadingTime: number

  // Relationships
  sourceQueries: string[]
  linkedDocuments: string[]
  tags: string[]

  // Expansion: Attachments
  attachmentIds?: string[]
  ementaId?: string
  currentRevisionId?: string

  // Timestamps
  createdAt: Date
  updatedAt: Date
  lastAccessedAt: Date

  // Export info
  exportedFormats: ExportFormat[]
  lastExportedAt?: Date
}

// ==================== TEMPLATE TYPES ====================

export interface DocumentTemplate {
  id: string
  type: TemplateType
  name: string
  description: string
  sections: TemplateSection[]
  variables: TemplateVariable[]
  defaultFormat: {
    fontSize: number
    fontFamily: string
    lineHeight: number
    margins: {
      top: number
      right: number
      bottom: number
      left: number
    }
  }
}

export interface TemplateSection {
  id: string
  title: string
  placeholder: string
  order: number
  required: boolean
  guidance?: string
  examples?: string[]
}

export interface TemplateVariable {
  name: string
  type: 'text' | 'date' | 'number' | 'select'
  label: string
  required: boolean
  defaultValue?: any
  options?: string[]
}

// ==================== FORMATTING TYPES ====================

export interface CharacterFormatting {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  color?: string
  backgroundColor?: string
  fontSize?: number
  fontFamily?: string
  superscript?: boolean
  subscript?: boolean
}

export interface ParagraphFormatting {
  alignment: TextAlignment
  indent: number
  lineHeight: number
  spaceAfter?: number
  spaceBefore?: number
  keepWithNext?: boolean
  pageBreakBefore?: boolean
}

export interface DocumentFormatting {
  character: CharacterFormatting
  paragraph: ParagraphFormatting
  margins: {
    top: number
    right: number
    bottom: number
    left: number
  }
  headerContent?: string
  footerContent?: string
}

// ==================== EDITOR STATE ====================

export interface EditorState {
  document: LegalDocument | null
  content: string
  selectedText?: string
  cursorPosition: number
  isDirty: boolean
  isSaving: boolean
  lastSavedAt?: Date

  // UI State
  mode: 'edit' | 'preview' | 'split'
  sidebarOpen: boolean
  selectedTemplate?: TemplateType
}

export interface EditorSelection {
  startOffset: number
  endOffset: number
  text: string
}

// ==================== RESEARCH INTEGRATION ====================

export interface DocumentSource {
  queryId: string
  type: 'jurisprudence' | 'legislation' | 'doctrine' | 'case-law'
  title: string
  relevance: number
  citation: string
  insertedAt: Date
  position: number
}

// ==================== AI ASSISTANCE ====================

export interface AISuggestion {
  id: string
  type: SuggestionType
  severity: 'info' | 'warning' | 'critical'
  position: number
  selectedText?: string
  message: string
  suggestion: string
  reasoning?: string
  references?: string[]
  appliedAt?: Date
  dismissed: boolean
}

export interface AnalysisResult {
  documentId: string
  analyzedAt: Date
  suggestions: AISuggestion[]
  overall: {
    strengthScore: number
    formalityScore: number
    completenessScore: number
    legalBlindageScore: number
  }
  issues: {
    critical: string[]
    warnings: string[]
    info: string[]
  }
}

// ==================== SPELL CHECK ====================

export interface SpellingError {
  id: string
  position: number
  word: string
  suggestions: string[]
  context: string
  corrected: boolean
  correctedTo?: string
}

export interface GrammarError {
  id: string
  position: number
  text: string
  issue: string
  suggestions: string[]
  context: string
  corrected: boolean
}

// ==================== EXPORT ====================

export interface ExportOptions {
  format: ExportFormat
  includeHeaders: boolean
  includeFooters: boolean
  includeToc: boolean
  pageNumbers: boolean
  abntFormat: boolean
  pageSize: 'A4' | 'Letter'
  margins?: {
    top: number
    right: number
    bottom: number
    left: number
  }
}

export interface ExportResult {
  documentId: string
  format: ExportFormat
  filename: string
  fileSize: number
  exportedAt: Date
  downloadUrl?: string
}

// ==================== DOCUMENT HISTORY ====================

export interface DocumentVersion {
  versionNumber: number
  createdAt: Date
  createdBy: string
  content: string
  changesSummary: string
  characterCount: number
  wordCount: number
}

export interface DocumentChange {
  timestamp: Date
  type: 'insert' | 'delete' | 'format' | 'replace'
  position: number
  content?: string
  formatting?: CharacterFormatting
  undoable: boolean
}

// ==================== SEARCH & INDEXING ====================

export interface DocumentSearchResult {
  documentId: string
  title: string
  templateType: TemplateType
  matchCount: number
  highlights: string[]
  score: number
}

// ==================== COLLABORATIVE ====================

export interface DocumentComment {
  id: string
  authorId: string
  authorName: string
  content: string
  position: number
  resolvedAt?: Date
  replies: DocumentCommentReply[]
  createdAt: Date
}

export interface DocumentCommentReply {
  id: string
  authorId: string
  authorName: string
  content: string
  createdAt: Date
}

// ==================== UI COMPONENTS ====================

export interface ToolbarButton {
  id: string
  label: string
  icon?: string
  tooltip: string
  action: () => void
  active?: boolean
  disabled?: boolean
  group?: string
}

export interface ContextMenuItem {
  label: string
  icon?: string
  action: () => void
  separator?: boolean
  disabled?: boolean
}

// ==================== SETTINGS ====================

export interface EditorSettings {
  userId: string
  defaultTemplate: TemplateType
  defaultExportFormat: ExportFormat
  autoSaveInterval: number
  autoSaveEnabled: boolean
  showPreview: boolean
  showSpellCheck: boolean
  showGrammarCheck: boolean
  showAISuggestions: boolean
  theme: 'light' | 'dark'
  fontSize: number
  fontFamily: string
  lineHeight: number
  spellCheckLanguage: 'pt-BR' | 'pt-PT' | 'en-US'
}

// ==================== NOTIFICATIONS ====================

export interface EditorNotification {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
  details?: string
  action?: {
    label: string
    callback: () => void
  }
  dismissible: boolean
  duration?: number
}

// ==================== DRAFT MANAGEMENT ====================

export interface DraftDocument {
  id: string
  title: string
  templateType: TemplateType
  contentPreview: string
  characterCount: number
  wordCount: number
  lastModified: Date
  autoSaved: boolean
  recoverable: boolean
}

export interface RecoveryInfo {
  documentId: string
  lastAutoSave: Date
  contentPreview: string
  version: number
}

// ==================== EXPANSION: ATTACHMENTS ====================

export interface DocumentAttachment {
  id: string
  documentId: string
  filename: string
  originalFilename: string
  type: AttachmentType
  source: AttachmentSource
  fileSize: number
  mimeType: string
  url: string
  driveFileId?: string

  // Metadata
  attachmentNumber: number
  description?: string
  pageReferences?: number[]
  position: number

  // Compression
  compressed: boolean
  originalSize?: number

  // Timestamps
  uploadedAt: Date
  lastModifiedAt: Date

  // References in document
  inlineCitations: InlineCitation[]
}

export interface InlineCitation {
  position: number
  text: string
  attachmentId: string
  type: 'reference' | 'link_box' | 'inline'
}

export interface AttachmentBox {
  attachmentId: string
  style: 'highlight' | 'bordered' | 'shadowed'
  position: 'left' | 'right' | 'full'
  includeFileSize: boolean
  includePreview: boolean
  customText?: string
}

export interface AttachmentOrganizationConfig {
  autoRename: boolean
  autoNumbering: 'roman' | 'arabic' | 'letter'
  groupByType: boolean
  includeSizeInBox: boolean
  includePreviewInBox: boolean
  enableSearch: boolean
  enablePreview: boolean
}

// ==================== EXPANSION: EMENTA ====================

export interface Ementa {
  id: string
  documentId: string
  branch: string
  subject: string
  origin: string
  tribunal: string
  summary: string
  summaryStructured: StructuredSummary
  keywords: string[]
  format: 'cnj' | 'stj'
  aiGenerated: boolean
  confirmedByUser: boolean
  createdAt: Date
}

export interface StructuredSummary {
  actionType: string
  mainFacts: string[]
  legalBasis: string[]
  mainRequest: string
  jurisprudentialSupport: boolean
}

// ==================== EXPANSION: VERSIONING ====================

export interface DocumentRevision {
  id: string
  documentId: string
  version: string
  versionNumber: number
  minorVersion: number

  // Content
  content: string
  title: string

  // Changes
  changelog: ChangeLog[]
  changeSummary: string

  // Analysis
  analysis?: AnalysisResult
  ementa?: Ementa
  attachments?: DocumentAttachment[]

  // Metadata
  author: string
  createdAt: Date
  status: 'draft' | 'review' | 'approved' | 'finalized'
  tags?: string[]

  // Diff
  previousRevisionId?: string
  diffWithPrevious?: DocumentDiff
}

export interface ChangeLog {
  timestamp: Date
  type: 'content' | 'analysis' | 'ementa' | 'attachment' | 'formatting'
  description: string
  linesAdded: number
  linesRemoved: number
  position?: number
}

export interface DocumentDiff {
  fromVersion: string
  toVersion: string
  added: string
  removed: string
  modified: string
  summary: string
}

export interface RevisionCompare {
  revision1: DocumentRevision
  revision2: DocumentRevision
  additions: string[]
  removals: string[]
  modifications: { before: string; after: string }[]
}
